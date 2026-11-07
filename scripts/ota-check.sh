#!/bin/sh
# RE-CP-02 固件更新检测（自有更新源，见 ota/README.md）
#
# 默认只检测：拉取 manifest、比对当前版本、报告可用更新（只读，写 syslog）。
#   ota-check                          检查更新
#   ota-check --version 23.05.7        检查指定版本
#   ota-check --download               下载镜像到 /tmp 并校验 SHA256（不刷写）
#   ota-check --flash                  下载校验后交互确认刷写（默认保留配置）
#   ota-check --flash --sysupgrade-args="-n"   跨大版本刷写时不保留配置
#
# 退出码：0 已是最新/无动作  1 有可用更新  2 错误或取消  3 镜像已下载并校验通过
#
# 测试辅助（仅本机模拟路由器环境时使用，路由器上不需要）：
#   OTA_ALLOW_FAKE=1 OTA_FAKE_VERSION=23.05.4 OTA_FAKE_MODEL="JDCloud RE-CP-02" ...
#
# 下载重试次数（弱网可调大，默认 3 次）：OTA_FETCH_RETRIES=5 ota-check --download
#
# 更新源：默认 GitHub raw；网络不可达时可用 --source gitee 切换备用源。
#   ota-check --source github                用 GitHub 更新源检查
#   也可用环境变量 OTA_MANIFEST_URL 直接指定任意 manifest URL。
#
# 并发锁：同一时间只允许一个 ota-check 运行（运行锁 $OTA_TMP/ota-check.lock，
# 防止两个进程同时写固定路径的 manifest / 镜像互相截断；进程正常退出或被杀后，
# 下一次运行会自动接管并清理残留锁）

set -u

OTA_MANIFEST_URL="${OTA_MANIFEST_URL:-}"
OTA_TMP="${OTA_TMP:-/tmp}"
OTA_ALLOW_FAKE="${OTA_ALLOW_FAKE:-0}"

MODE="check"
WANT_VERSION=""
SYSUPGRADE_ARGS=""
OTA_SOURCE="github"

# 用法文本取自文件头部注释块，按注释块边界截取（注释增删不会导致错位）
usage() {
  sed -n '2,/^[^#]/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --download) MODE="download" ;;
    --flash) MODE="flash" ;;
    --version) [ $# -ge 2 ] || { echo "--version 需要参数" >&2; exit 2; }; WANT_VERSION="$2"; shift ;;
    --sysupgrade-args) [ $# -ge 2 ] || { echo "--sysupgrade-args 需要参数" >&2; exit 2; }; SYSUPGRADE_ARGS="$2"; shift ;;
    --sysupgrade-args=*) SYSUPGRADE_ARGS="${1#*=}" ;;
    --source) [ $# -ge 2 ] || { echo "--source 需要参数 (gitee|github)" >&2; exit 2; }; OTA_SOURCE="$2"; shift ;;
    --source=*) OTA_SOURCE="${1#*=}" ;;
    -h|--help) usage ;;
    *) echo "未知参数: $1（-h 查看用法）" >&2; exit 2 ;;
  esac
  shift
done

# 解析 --source 与/或 OTA_MANIFEST_URL：未显式给 URL 时按来源选默认更新源
case "$OTA_SOURCE" in
  github) OTA_SOURCE_NAME="GitHub" ;;
  gitee) OTA_SOURCE_NAME="Gitee" ;;
  *) echo "未知更新源: $OTA_SOURCE（可选 gitee | github）" >&2; exit 2 ;;
esac
if [ -z "$OTA_MANIFEST_URL" ]; then
  if [ "$OTA_SOURCE" = "github" ]; then
    OTA_MANIFEST_URL="https://raw.githubusercontent.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/main/ota/manifest.json"
  else
    OTA_MANIFEST_URL="https://gitee.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/raw/main/ota/manifest.json"
  fi
fi

log() {
  echo "[ota-check] $*" >&2
  command -v logger >/dev/null 2>&1 && logger -t ota-check "$*" 2>/dev/null
  return 0
}
die() { log "错误: $*"; exit 2; }

# 运行锁：/tmp 是多写者共用目录，两个 ota-check 并发会互相覆写 manifest 与镜像。
# 锁目录存 PID，并用 /proc/<pid>/cmdline 复核（进程死后或 PID 被复用时自动失效）。
acquire_lock() {
  LOCK_DIR="$OTA_TMP/ota-check.lock"
  if [ -d "$LOCK_DIR" ]; then
    _lp=$(cat "$LOCK_DIR/pid" 2>/dev/null)
    case "$_lp" in
      '' | *[!0-9]*) _lp="" ;;
    esac
    if [ -n "$_lp" ] && [ -d "/proc/$_lp" ] && grep -q ota-check "/proc/$_lp/cmdline" 2>/dev/null; then
      die "另一个 ota-check 正在运行（PID $_lp），请等待其完成或删除 $LOCK_DIR"
    fi
    log "发现残留运行锁（原进程已退出），自动清理"
    rm -rf "$LOCK_DIR"
  fi
  mkdir "$LOCK_DIR" 2>/dev/null || die "无法创建运行锁: $LOCK_DIR"
  echo $$ > "$LOCK_DIR/pid"
  trap 'rm -rf "$LOCK_DIR"' EXIT INT TERM
}

# 单次下载（不带重试）
fetch_once() {
  _url="$1"; _out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --connect-timeout 10 --max-time 300 -o "$_out" "$_url"
  elif command -v uclient-fetch >/dev/null 2>&1; then
    uclient-fetch -q -T 30 -O "$_out" "$_url"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 30 -O "$_out" "$_url"
  else
    return 127
  fi
}

# 带重试的下载：弱网下一次失败不再让整个流程失败（次数可用 OTA_FETCH_RETRIES 覆盖）
fetch_url() {
  _url="$1"; _out="$2"
  _retries="${OTA_FETCH_RETRIES:-3}"
  case "$_retries" in '' | *[!0-9]*) _retries=3 ;; esac
  [ "$_retries" -ge 1 ] || _retries=3
  _try=1
  _rc=1
  while [ "$_try" -le "$_retries" ]; do
    fetch_once "$_url" "$_out"
    _rc=$?
    [ "$_rc" -eq 0 ] && return 0
    [ "$_rc" -eq 127 ] && return 127
    if [ "$_try" -lt "$_retries" ]; then
      log "下载失败（第 $_try/$_retries 次，退出码 $_rc），3 秒后重试: $_url"
      sleep 3
    fi
    _try=$((_try + 1))
  done
  return 1
}

get_current_info() {
  if [ "$OTA_ALLOW_FAKE" = "1" ] && [ -n "${OTA_FAKE_VERSION:-}" ]; then
    CURRENT_VERSION="$OTA_FAKE_VERSION"
    CURRENT_DISTRO="${OTA_FAKE_DISTRO:-ImmortalWrt}"
    return
  fi
  [ -r /etc/openwrt_release ] || die "本机不是 OpenWrt/ImmortalWrt 系统（找不到 /etc/openwrt_release）"
  CURRENT_VERSION=""
  CURRENT_DISTRO="unknown"
  while IFS='=' read -r k v; do
    case "$k" in
      DISTRIB_RELEASE) CURRENT_VERSION=$(printf '%s' "$v" | tr -d "'\"") ;;
      DISTRIB_ID) CURRENT_DISTRO=$(printf '%s' "$v" | tr -d "'\"") ;;
    esac
  done < /etc/openwrt_release
  [ -n "$CURRENT_VERSION" ] || die "无法从 /etc/openwrt_release 读取 DISTRIB_RELEASE"
}

get_model() {
  if [ "$OTA_ALLOW_FAKE" = "1" ] && [ -n "${OTA_FAKE_MODEL:-}" ]; then
    printf '%s' "$OTA_FAKE_MODEL"
    return
  fi
  [ -r /tmp/sysinfo/model ] && cat /tmp/sysinfo/model || printf 'unknown'
}

# 比较 A 与 B，输出 -1 / 0 / 1（仅比较数字段，最多 4 段）
version_compare() {
  _a="$1"; _b="$2"; _i=1
  while [ "$_i" -le 4 ]; do
    _pa=$(printf '%s' "$_a" | cut -d. -f"$_i")
    _pb=$(printf '%s' "$_b" | cut -d. -f"$_i")
    case "$_pa" in '' | *[!0-9]*) _pa=0 ;; esac
    case "$_pb" in '' | *[!0-9]*) _pb=0 ;; esac
    if [ "$_pa" -lt "$_pb" ]; then echo -1; return; fi
    if [ "$_pa" -gt "$_pb" ]; then echo 1; return; fi
    _i=$((_i + 1))
  done
  echo 0
}

# 解析 manifest，输出 KEY=VALUE 纯数据行（调用方只做白名单字段读取，绝不 source/eval）
parse_manifest() {
  if command -v jsonfilter >/dev/null 2>&1; then
    JSON=$(cat "$MANIFEST_FILE")
    printf 'DISTRO=%s\n' "$(jsonfilter -s "$JSON" -e '@.distro' 2>/dev/null)"
    printf 'LATEST=%s\n' "$(jsonfilter -s "$JSON" -e '@.latest' 2>/dev/null)"
    printf 'DEVICE=%s\n' "$(jsonfilter -s "$JSON" -e '@.device' 2>/dev/null)"
    printf 'DEVICE_MATCH=%s\n' "$(jsonfilter -s "$JSON" -e '@.device_match' 2>/dev/null)"
    _i=0
    jsonfilter -s "$JSON" -e '@.releases[*].version' 2>/dev/null | while IFS= read -r _v; do
      _notes=$(jsonfilter -s "$JSON" -e "@.releases[$_i].notes[*]" 2>/dev/null | tr '\n' '|')
      printf 'REL_%s_version=%s\n' "$_i" "$(jsonfilter -s "$JSON" -e "@.releases[$_i].version" 2>/dev/null)"
      printf 'REL_%s_url=%s\n' "$_i" "$(jsonfilter -s "$JSON" -e "@.releases[$_i].sysupgrade.url" 2>/dev/null)"
      printf 'REL_%s_sha256=%s\n' "$_i" "$(jsonfilter -s "$JSON" -e "@.releases[$_i].sysupgrade.sha256" 2>/dev/null)"
      printf 'REL_%s_size=%s\n' "$_i" "$(jsonfilter -s "$JSON" -e "@.releases[$_i].sysupgrade.size" 2>/dev/null)"
      printf 'REL_%s_notes=%s\n' "$_i" "${_notes%|}"
      _i=$((_i + 1))
    done
  elif command -v node >/dev/null 2>&1; then
    # mktemp 唯一文件名：固定路径写入在多用户/公共 /tmp 下有符号链接劫持风险
    _parser=$(mktemp "$OTA_TMP/ota-parse.js.XXXXXX") || die "无法创建临时解析脚本"
    cat > "$_parser" <<'EOF'
const m = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"));
const q = s => String(s == null ? "" : s).replace(/[\r\n]+/g, " ");
console.log("DISTRO=" + q(m.distro));
console.log("LATEST=" + q(m.latest));
console.log("DEVICE=" + q(m.device));
console.log("DEVICE_MATCH=" + q(m.device_match));
(m.releases || []).forEach((r, i) => {
  const su = r.sysupgrade || {};
  console.log("REL_" + i + "_version=" + q(r.version));
  console.log("REL_" + i + "_url=" + q(su.url));
  console.log("REL_" + i + "_sha256=" + q(su.sha256));
  console.log("REL_" + i + "_size=" + q(su.size));
  console.log("REL_" + i + "_notes=" + q((r.notes || []).join(" | ")));
});
EOF
    node "$_parser" "$MANIFEST_FILE"
    _rc=$?
    rm -f "$_parser"
    return $_rc
  elif command -v python3 >/dev/null 2>&1; then
    _parser=$(mktemp "$OTA_TMP/ota-parse.py.XXXXXX") || die "无法创建临时解析脚本"
    cat > "$_parser" <<'EOF'
import json, sys
m = json.load(open(sys.argv[1], encoding="utf-8"))
def q(s):
    return " ".join(str("" if s is None else s).split())
print("DISTRO=" + q(m.get("distro")))
print("LATEST=" + q(m.get("latest")))
print("DEVICE=" + q(m.get("device")))
print("DEVICE_MATCH=" + q(m.get("device_match")))
for i, r in enumerate(m.get("releases", [])):
    su = r.get("sysupgrade") or {}
    print("REL_%d_version=%s" % (i, q(r.get("version"))))
    print("REL_%d_url=%s" % (i, q(su.get("url"))))
    print("REL_%d_sha256=%s" % (i, q(su.get("sha256"))))
    print("REL_%d_size=%s" % (i, q(su.get("size"))))
    print("REL_%d_notes=%s" % (i, q(" | ".join(r.get("notes", [])))))
EOF
    python3 "$_parser" "$MANIFEST_FILE"
    _rc=$?
    rm -f "$_parser"
    return $_rc
  else
    die "解析 manifest 需要 jsonfilter（OpenWrt 自带）、node 或 python3 之一"
  fi
}

# 白名单读取 manifest 解析结果：只接受已知字段名，取值再按字符白名单校验。
# manifest 来自网络，属于不可信输入，因此这里不做 source / eval，只当作纯数据解析。
load_parsed() {
  while IFS= read -r _line || [ -n "$_line" ]; do
    case "$_line" in
      *=*) ;;
      *) continue ;;
    esac
    _key=${_line%%=*}
    _val=${_line#*=}
    # 容忍 CRLF（在 Windows 上用 node/python3 解析时会带 \r）
    _val=$(printf '%s' "$_val" | tr -d '\r')
    case "$_key" in
      DISTRO|LATEST|DEVICE|DEVICE_MATCH) ;;
      REL_*_version|REL_*_url|REL_*_sha256|REL_*_size|REL_*_notes) ;;
      *) log "忽略 manifest 中的未知字段: $_key"; continue ;;
    esac
    case "$_key" in
      *_notes)
        # 备注仅用于展示：去掉换行/反斜杠/反引号/$/引号，并压缩多余空格
        _val=$(printf '%s' "$_val" | tr -d '\r\n\\`$"' | tr -s ' ')
        ;;
      *)
        # 其余字段参与路径、版本与校验和比对，字符集严格白名单
        case "$_val" in
          '' | *[!0-9A-Za-z._/:-]*)
            log "字段 $_key 取值含白名单外字符，已丢弃"
            continue
            ;;
        esac
        ;;
    esac
    printf '%s=%s\n' "$_key" "$_val"
  done < "$1"
}

# 从白名单解析结果中读取字段（纯文本读取，不执行任何内容）
parsed_field() {
  sed -n "s/^$1=//p" "$PARSED" | head -n 1
}

MANIFEST_FILE="$OTA_TMP/ota-manifest.json"
acquire_lock
log "拉取更新源 ($OTA_SOURCE_NAME): $OTA_MANIFEST_URL"
fetch_url "$OTA_MANIFEST_URL" "$MANIFEST_FILE" || die "拉取 manifest 失败（检查网络；HTTPS 报 TLS 错误时安装 libustream-mbedtls ca-bundle）"

PARSED_RAW="$OTA_TMP/ota-parsed.env"
PARSED="$OTA_TMP/ota-parsed.safe"
parse_manifest > "$PARSED_RAW" || die "解析 manifest 失败"
load_parsed "$PARSED_RAW" > "$PARSED" || die "解析 manifest 失败"
LATEST=$(parsed_field LATEST)
DISTRO=$(parsed_field DISTRO)
DEVICE_MATCH=$(parsed_field DEVICE_MATCH)
[ -n "$LATEST" ] || die "manifest 缺少 latest 字段"

MODEL=$(get_model)
get_current_info

# 设备型号门禁：优先比对更新源声明的 device_match，缺失时回退本地通配（防止刷到其他 MT7621 设备）
if [ -n "${DEVICE_MATCH:-}" ]; then
  case "$MODEL" in
    *"$DEVICE_MATCH"*) : ;;
    *) die "设备型号「$MODEL」与更新源声明（device_match=$DEVICE_MATCH）不一致，拒绝继续（如在本机测试请设置 OTA_ALLOW_FAKE=1）" ;;
  esac
else
  log "更新源未声明 device_match，回退本地型号通配校验"
  case "$MODEL" in
    *RE-CP-02*) : ;;
    *) die "设备型号「$MODEL」不是 RE-CP-02，拒绝继续（如在本机测试请设置 OTA_ALLOW_FAKE=1）" ;;
  esac
fi

log "当前系统: ${CURRENT_DISTRO:-unknown} $CURRENT_VERSION / 设备: $MODEL / 更新源最新: $LATEST"

# 选定目标版本：默认取 manifest 的 latest
TARGET_VERSION="$WANT_VERSION"
[ -n "$TARGET_VERSION" ] || TARGET_VERSION="$LATEST"

TARGET_IDX=""
_n=0
while [ "$_n" -lt 128 ]; do
  _ver=$(parsed_field "REL_${_n}_version")
  [ -n "$_ver" ] || break
  if [ "$_ver" = "$TARGET_VERSION" ]; then TARGET_IDX="$_n"; break; fi
  _n=$((_n + 1))
done
[ -n "$TARGET_IDX" ] || die "更新源中没有版本 $TARGET_VERSION（可用: $(parsed_field REL_0_version) 等，见 manifest.json）"

TARGET_URL=$(parsed_field "REL_${TARGET_IDX}_url")
TARGET_SHA=$(parsed_field "REL_${TARGET_IDX}_sha256")
TARGET_SIZE=$(parsed_field "REL_${TARGET_IDX}_size")
TARGET_NOTES=$(parsed_field "REL_${TARGET_IDX}_notes")
[ -n "$TARGET_URL" ] && [ -n "$TARGET_SHA" ] || die "manifest 中 $TARGET_VERSION 缺少 url/sha256"

CMP=$(version_compare "$CURRENT_VERSION" "$TARGET_VERSION")
if [ "$CMP" -eq 0 ]; then
  log "已是最新: $CURRENT_VERSION == $TARGET_VERSION"
  exit 0
fi
if [ "$CMP" -eq 1 ]; then
  log "当前版本 $CURRENT_VERSION 高于更新源 $TARGET_VERSION（本地自编译构建？），不做处理"
  exit 0
fi

log "发现可用更新: $CURRENT_VERSION -> $TARGET_VERSION"
[ -n "$TARGET_NOTES" ] && {
  printf '%s\n' "$TARGET_NOTES" | tr '|' '\n' | sed 's/^/  * /' >&2
}

if [ "$MODE" = "check" ]; then
  log "检测模式结束（--download 下载校验，--flash 确认后刷写）"
  exit 1
fi

# 下载 / 刷写前的安全门禁：发行版必须与 manifest 一致（防跨 fork 自动刷机）
if [ "${CURRENT_DISTRO:-unknown}" != "${DISTRO:-ImmortalWrt}" ]; then
  [ "$OTA_ALLOW_FAKE" = "1" ] || die "当前发行版 $CURRENT_DISTRO 与更新源 ${DISTRO:-ImmortalWrt} 不一致，跨 fork 请走人工流程（docs/09）"
fi

IMG_NAME=$(printf '%s' "$TARGET_URL" | awk -F/ '{print $NF}')
IMG_PATH="$OTA_TMP/$IMG_NAME"

# 下载前检查 /tmp 剩余空间（/tmp 是内存盘，镜像约 10MB，写满会挤爆运行内存）
if [ -n "$TARGET_SIZE" ]; then
  _avail=$(df -k "$OTA_TMP" 2>/dev/null | awk 'NR==2 {print $4}')
  case "$_avail" in
    '' | *[!0-9]*) _avail="" ;;
  esac
  if [ -n "$_avail" ] && [ "$_avail" -lt $((TARGET_SIZE / 1024 + 1024)) ]; then
    die "/tmp 可用空间不足（需要约 $((TARGET_SIZE / 1024)) KB，剩余 $_avail KB）；先清理 /tmp 大文件或重启路由器后重试"
  fi
fi

log "下载镜像: $TARGET_URL"
fetch_url "$TARGET_URL" "$IMG_PATH" || die "镜像下载失败"
[ -s "$IMG_PATH" ] || die "下载的镜像为空: $IMG_PATH"

if [ -n "$TARGET_SIZE" ]; then
  case "$TARGET_SIZE" in *[!0-9]* | '') TARGET_SIZE="" ;; esac
fi
if [ -n "$TARGET_SIZE" ]; then
  ACTUAL_SIZE=$(wc -c < "$IMG_PATH")
  [ "$ACTUAL_SIZE" = "$TARGET_SIZE" ] || die "镜像大小不符（期望 $TARGET_SIZE，实际 $ACTUAL_SIZE）"
fi

ACTUAL_SHA=$(sha256sum "$IMG_PATH" | awk '{print $1}')
[ "$ACTUAL_SHA" = "$TARGET_SHA" ] || die "SHA256 校验失败（期望 $TARGET_SHA，实际 $ACTUAL_SHA）"
log "SHA256 校验通过: $IMG_PATH"

if [ "$MODE" = "download" ]; then
  log "镜像已就绪（未刷写）: $IMG_PATH"
  exit 3
fi

# flash 模式：跨大版本提示 + 人工确认（能走到这里说明 CURRENT_VERSION 必然不等于 TARGET_VERSION，上方 CMP 已拦截）
_cmaj=$(printf '%s' "$CURRENT_VERSION" | cut -d. -f1)
_tmaj=$(printf '%s' "$TARGET_VERSION" | cut -d. -f1)
if [ "$_cmaj" != "$_tmaj" ]; then
  log "警告: 这是跨大版本刷写（$_cmaj.x -> $_tmaj.x）。强烈建议先备份（sysupgrade --create-backup），并考虑传 --sysupgrade-args=\"-n\" 不保留配置"
fi
printf '即将刷写 %s\nsysupgrade %s\n确认请输入 YES（其他任意输入取消）: ' "$IMG_PATH" "${SYSUPGRADE_ARGS:-（默认保留配置）}"
read -r ANSWER
[ "$ANSWER" = "YES" ] || { log "已取消刷写"; exit 2; }

command -v sysupgrade >/dev/null 2>&1 || die "路由器上找不到 sysupgrade 命令"
log "开始刷写 $TARGET_VERSION ..."
# shellcheck disable=SC2086
sysupgrade $SYSUPGRADE_ARGS "$IMG_PATH"
