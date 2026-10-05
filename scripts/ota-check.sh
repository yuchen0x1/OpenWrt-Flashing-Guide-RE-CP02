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

set -u

OTA_MANIFEST_URL="${OTA_MANIFEST_URL:-https://gitee.com/yuchen0x1/OpenWrt-Flashing-Guide-RE-CP02/raw/main/ota/manifest.json}"
OTA_TMP="${OTA_TMP:-/tmp}"
OTA_ALLOW_FAKE="${OTA_ALLOW_FAKE:-0}"

MODE="check"
WANT_VERSION=""
SYSUPGRADE_ARGS=""

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --download) MODE="download" ;;
    --flash) MODE="flash" ;;
    --version) [ $# -ge 2 ] || { echo "--version 需要参数" >&2; exit 2; }; WANT_VERSION="$2"; shift ;;
    --sysupgrade-args) [ $# -ge 2 ] || { echo "--sysupgrade-args 需要参数" >&2; exit 2; }; SYSUPGRADE_ARGS="$2"; shift ;;
    -h|--help) usage ;;
    *) echo "未知参数: $1（-h 查看用法）" >&2; exit 2 ;;
  esac
  shift
done

log() {
  echo "[ota-check] $*" >&2
  command -v logger >/dev/null 2>&1 && logger -t ota-check "$*" 2>/dev/null
  return 0
}
die() { log "错误: $*"; exit 2; }

fetch_url() {
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

# 解析 manifest，输出可 source 的 KEY='VALUE' 行
parse_manifest() {
  if command -v jsonfilter >/dev/null 2>&1; then
    JSON=$(cat "$MANIFEST_FILE")
    echo "DISTRO='$(jsonfilter -s "$JSON" -e '@.distro' 2>/dev/null | tr -d "'")'"
    echo "LATEST='$(jsonfilter -s "$JSON" -e '@.latest' 2>/dev/null | tr -d "'")'"
    _i=0
    jsonfilter -s "$JSON" -e '@.releases[*].version' 2>/dev/null | while IFS= read -r _v; do
      _notes=$(jsonfilter -s "$JSON" -e "@.releases[$_i].notes[*]" 2>/dev/null | tr -d "'" | tr '\n' '|')
      echo "REL_${_i}_version='$(jsonfilter -s "$JSON" -e "@.releases[$_i].version" 2>/dev/null | tr -d "'")'"
      echo "REL_${_i}_url='$(jsonfilter -s "$JSON" -e "@.releases[$_i].sysupgrade.url" 2>/dev/null | tr -d "'")'"
      echo "REL_${_i}_sha256='$(jsonfilter -s "$JSON" -e "@.releases[$_i].sysupgrade.sha256" 2>/dev/null | tr -d "'")'"
      echo "REL_${_i}_size='$(jsonfilter -s "$JSON" -e "@.releases[$_i].sysupgrade.size" 2>/dev/null | tr -d "'")'"
      echo "REL_${_i}_notes='${_notes%|}'"
      _i=$((_i + 1))
    done
  elif command -v node >/dev/null 2>&1; then
    cat > "$OTA_TMP/ota-parse.js" <<'EOF'
const m = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"));
const q = s => String(s == null ? "" : s).replace(/'/g, "");
console.log("DISTRO='" + q(m.distro) + "'");
console.log("LATEST='" + q(m.latest) + "'");
(m.releases || []).forEach((r, i) => {
  const su = r.sysupgrade || {};
  console.log("REL_" + i + "_version='" + q(r.version) + "'");
  console.log("REL_" + i + "_url='" + q(su.url) + "'");
  console.log("REL_" + i + "_sha256='" + q(su.sha256) + "'");
  console.log("REL_" + i + "_size='" + q(su.size) + "'");
  console.log("REL_" + i + "_notes='" + q((r.notes || []).join(" | ")) + "'");
});
EOF
    node "$OTA_TMP/ota-parse.js" "$MANIFEST_FILE"
  elif command -v python3 >/dev/null 2>&1; then
    cat > "$OTA_TMP/ota-parse.py" <<'EOF'
import json, sys
m = json.load(open(sys.argv[1], encoding="utf-8"))
def q(s):
    return str("" if s is None else s).replace("'", "")
print("DISTRO='" + q(m.get("distro")) + "'")
print("LATEST='" + q(m.get("latest")) + "'")
for i, r in enumerate(m.get("releases", [])):
    su = r.get("sysupgrade") or {}
    print("REL_%d_version='%s'" % (i, q(r.get("version"))))
    print("REL_%d_url='%s'" % (i, q(su.get("url"))))
    print("REL_%d_sha256='%s'" % (i, q(su.get("sha256"))))
    print("REL_%d_size='%s'" % (i, q(su.get("size"))))
    print("REL_%d_notes='%s'" % (i, q(" | ".join(r.get("notes", [])))))
EOF
    python3 "$OTA_TMP/ota-parse.py" "$MANIFEST_FILE"
  else
    die "解析 manifest 需要 jsonfilter（OpenWrt 自带）、node 或 python3 之一"
  fi
}

MANIFEST_FILE="$OTA_TMP/ota-manifest.json"
log "拉取更新源: $OTA_MANIFEST_URL"
fetch_url "$OTA_MANIFEST_URL" "$MANIFEST_FILE" || die "拉取 manifest 失败（检查网络；HTTPS 报 TLS 错误时安装 libustream-mbedtls ca-bundle）"

PARSED="$OTA_TMP/ota-parsed.env"
parse_manifest > "$PARSED" || die "解析 manifest 失败"
# shellcheck disable=SC1090
. "$PARSED"
[ -n "${LATEST:-}" ] || die "manifest 缺少 latest 字段"

MODEL=$(get_model)
get_current_info

# 设备型号门禁：任何时候都要确认，防止把镜像刷到其他 MT7621 设备
case "$MODEL" in
  *RE-CP-02*) : ;;
  *) die "设备型号「$MODEL」不是 RE-CP-02，拒绝继续（如在本机测试请设置 OTA_ALLOW_FAKE=1）" ;;
esac

log "当前系统: ${CURRENT_DISTRO:-unknown} $CURRENT_VERSION / 设备: $MODEL / 更新源最新: $LATEST"

# 选定目标版本：默认取 manifest 的 latest
TARGET_VERSION="$WANT_VERSION"
[ -n "$TARGET_VERSION" ] || TARGET_VERSION="$LATEST"

TARGET_IDX=""
_n=0
while : ; do
  eval "_ver=\${REL_${_n}_version:-}"
  [ -n "$_ver" ] || break
  if [ "$_ver" = "$TARGET_VERSION" ]; then TARGET_IDX="$_n"; break; fi
  _n=$((_n + 1))
done
[ -n "$TARGET_IDX" ] || die "更新源中没有版本 $TARGET_VERSION（可用: $(eval "echo \${REL_0_version:-}") 等，见 manifest.json）"

eval "TARGET_URL=\${REL_${TARGET_IDX}_url:-}"
eval "TARGET_SHA=\${REL_${TARGET_IDX}_sha256:-}"
eval "TARGET_SIZE=\${REL_${TARGET_IDX}_size:-}"
eval "TARGET_NOTES=\${REL_${TARGET_IDX}_notes:-}"
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

# flash 模式：跨大版本提示 + 人工确认
case "$CURRENT_VERSION" in
  "$TARGET_VERSION") : ;;
  *)
    _cmaj=$(printf '%s' "$CURRENT_VERSION" | cut -d. -f1)
    _tmaj=$(printf '%s' "$TARGET_VERSION" | cut -d. -f1)
    if [ "$_cmaj" != "$_tmaj" ]; then
      log "警告: 这是跨大版本刷写（$_cmaj.x -> $_tmaj.x）。强烈建议先备份（sysupgrade --create-backup），并考虑传 --sysupgrade-args=\"-n\" 不保留配置"
    fi
    ;;
esac
printf '即将刷写 %s\nsysupgrade %s\n确认请输入 YES（其他任意输入取消）: ' "$IMG_PATH" "${SYSUPGRADE_ARGS:-（默认保留配置）}"
read -r ANSWER
[ "$ANSWER" = "YES" ] || { log "已取消刷写"; exit 2; }

command -v sysupgrade >/dev/null 2>&1 || die "路由器上找不到 sysupgrade 命令"
log "开始刷写 $TARGET_VERSION ..."
# shellcheck disable=SC2086
sysupgrade $SYSUPGRADE_ARGS "$IMG_PATH"
