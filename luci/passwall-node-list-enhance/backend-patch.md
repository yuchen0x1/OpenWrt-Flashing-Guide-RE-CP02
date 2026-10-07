# 后端 target 白名单补丁说明

PassWall 节点列表补丁的四目标测速列（百度 / 谷歌 / GitHub / Instagram）依赖 `urltest_node` 接口接受一个 `target` 参数。**上游 PassWall / PassWall2 目前不支持该参数**：

- controller（`urltest_node` 函数）只读取 `index` 和 `id`，然后调用 `test.sh url_test_node <节点id> urltest_node`；
- `test.sh` 的 `url_test_node` 函数从全局 UCI 读取 `@global_other[0].url_test_url`（默认 `https://www.google.com/generate_204`）作为唯一探测目标。

因此打完前端模板补丁后，若不套用本说明的后端补丁，四个列都会测同一个全局目标，结果相同且不具备"四目标"含义。

## 补丁设计

- controller 新增读取 `target` 表单值，**只允许** `baidu`、`google`、`github`、`instagram` 四个固定标识，其他值一律清空；
- 白名单标识原样传给 `test.sh`，由 shell 侧 `case` 映射成固定 URL；
- **不接受任意 URL 作为参数**，避免未经校验的字符串进入 shell 命令行；
- 未提供或非法 `target` 时回退全局 `url_test_url`，旧版调用（只传 `id`）行为完全不变。

## PassWall（v1）补丁示例

文件一：`/usr/lib/lua/luci/controller/passwall.lua` 中的 `urltest_node` 函数（不同版本路径可能是 `luci-app-passwall/luasrc/controller/passwall.lua`，请按函数名搜索定位）。

改前（节选，以实际上游为准）：

```lua
function urltest_node()
    local index = http.formvalue("index")
    local id = http.formvalue("id")
    local e = {}
    e.index = index
    local result = luci.sys.exec(string.format(
        "/usr/share/passwall/test.sh url_test_node %s %s",
        id,
        "urltest_node"
    ))
```

改后：

```lua
local ota_urltest_targets = { baidu = true, google = true, github = true, instagram = true }

function urltest_node()
    local index = http.formvalue("index")
    local id = http.formvalue("id")
    local target = http.formvalue("target") or ""
    if not ota_urltest_targets[target] then
        target = ""
    end
    local e = {}
    e.index = index
    local result = luci.sys.exec(string.format(
        "/usr/share/passwall/test.sh url_test_node %s %s %s",
        id,
        "urltest_node",
        target
    ))
```

文件二：`/usr/share/passwall/test.sh` 中的 `url_test_node` 函数。

改前（节选，以实际上游为准）：

```sh
url_test_node() {
    result=0
    local node_id=$1
    ...
    local probeUrl=$(config_n_get @global_other[0] url_test_url https://www.google.com/generate_204)
    result=$(curl --connect-timeout 3 --max-time 5 -o /dev/null -I -skL \
        -w "%{http_code}:%{time_pretransfer}" \
        -x ${curlx} "${probeUrl}")
```

改后（在函数开头加 target 到固定 URL 的映射，替换 `probeUrl` 的取值来源）：

```sh
url_test_node() {
    result=0
    local node_id=$1
    local target=$3
    local probeUrl
    case "$target" in
        baidu)     probeUrl="https://www.baidu.com/" ;;
        google)    probeUrl="https://www.google.com/generate_204" ;;
        github)    probeUrl="https://github.com/" ;;
        instagram) probeUrl="https://www.instagram.com/" ;;
        *)         probeUrl=$(config_n_get @global_other[0] url_test_url https://www.google.com/generate_204) ;;
    esac
    ...
```

同时确认脚本入口的分发处（`case "$1" in` 把 `url_test_node` 作为子命令调用的位置）会把 target 一并透传给 `url_test_node` 函数。

改前：

```sh
url_test_node) url_test_node "$2" "$3" ;;
```

改后（保持函数内 `$1`=节点id、`$2`=子命令名、`$3`=target，因此分发行必须传满三个位置参数，脚本级的 `$4` 就是 controller 传来的 target）：

```sh
url_test_node) url_test_node "$2" "$3" "$4" ;;
```

> 若漏掉这一步，函数内 `local target=$3` 会取到 `"urltest_node"` 字面量，`case` 永远落进 `*)` 回退全局 URL——四个列测同一个地址且无任何报错。验证方法：对四个目标列各点一次 Test，返回的延迟应来自各自 URL（可临时在各分支加 `logger -t urltest "$target $probeUrl"` 核对）。

## PassWall2 补丁示例

`luci-app-passwall2` 的 `urltest_node` controller 函数与 `/usr/share/passwall2/test.sh` 结构与上面相同，按同样的"controller 白名单 + shell case 映射"方式修改即可，路径分别替换为：

- `/usr/lib/lua/luci/controller/passwall2.lua`（或 `luci-app-passwall2/luasrc/controller/passwall2.lua`）
- `/usr/share/passwall2/test.sh`

## 应用与回滚

```sh
# 修改前先备份
cp /usr/lib/lua/luci/controller/passwall.lua /root/passwall.lua.bak
cp /usr/share/passwall/test.sh /root/passwall-test.sh.bak

# 修改后清理 LuCI 缓存并生效
rm -f /tmp/luci-indexcache*
/etc/init.d/rpcd restart
```

回滚就是还原两个备份文件。PassWall / PassWall2 升级会覆盖以上文件，升级后需重新套用本补丁；套用前先 `diff` 确认上游函数结构与本说明的"改前"节选仍然一致。

## 安全边界

- 白名单只有四个固定 key，controller 侧不匹配即清空，shell 侧不匹配即回退全局目标；
- 全链路没有任何"用户提供的 URL"进入 shell；节点 id 沿用上游原有传参方式，本补丁不扩大注入面；
- 修改只影响 `urltest_node` 一个接口，Ping / TCPing / 节点增删逻辑不变。
