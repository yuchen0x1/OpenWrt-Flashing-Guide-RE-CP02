# PassWall 节点列表增强

这是一个针对当前 PassWall LuCI 节点列表模板的可选补丁：

- URL 测试列扩展为四个固定目标列：百度、谷歌、GitHub、Instagram，每个目标独立测试、独立显示延迟。
- 增加"四目标测速并排序"按钮：对每个节点自动测试四个目标（节点数 × 4 个请求，最多 8 个并发），全部完成后在每个分组内按四个目标中的最低明确延迟升序排列。
- 增加"删除超标节点"按钮，只在当前可见分组内勾选任一目标明确达到或超过 `1500 ms` 的节点：`1499 ms` 不勾选，`1500 ms` 勾选。
- 没有明确毫秒数的节点（包括缺失、超时、错误响应）不会被自动勾选或删除。
- 删除仍调用 PassWall 原生的批量删除控件，并保留二次确认；本补丁不会自动提交删除请求。
- 请求失败、非 JSON 响应和切换检测方式时会结束当前测速轮次，避免页面卡在进行中或被旧回调污染。

## 重要：需要配套后端补丁

上游 PassWall / PassWall2 的 `urltest_node` 接口**不支持按目标自定义测试 URL**，只使用全局 `url_test_url`。前端模板补丁单独部署时，四个目标列会测同一个全局目标，结果不具备"四目标"含义。

必须按 [backend-patch.md](backend-patch.md) 同时给 controller 和 `test.sh` 打 `target` 白名单补丁（只允许 `baidu` / `google` / `github` / `instagram` 四个固定标识，不接受任意 URL），四个列才能真实工作。

## 适用范围

- 目标文件：`/usr/lib/lua/luci/view/passwall/node_list/node_list.htm`
- 这是 LuCI 模板补丁，不是独立 LuCI 应用，也不包含任何订阅、节点、密码、Token 或固件。
- PassWall 或 LuCI 升级可能覆盖目标文件和后端脚本。升级后必须重新比较模板版本，确认上下文仍匹配，再手工重应用前端模板与后端补丁。
- 不同 PassWall 版本的节点列表结构可能不同；部署前先备份并检查文件大小、模板头部和页面是否能正常打开。

## 安全部署

以下命令在路由器上执行，先保留原文件备份。示例使用电脑临时 HTTP 服务，避免依赖 Dropbear 的 SFTP：

```sh
# 电脑：在仓库根目录启动临时只读文件服务
python -m http.server 18767 --bind 0.0.0.0
```

```sh
# 路由器：把 <PC_IP> 替换成电脑有线网卡地址
V=/usr/lib/lua/luci/view/passwall/node_list/node_list.htm
T=/tmp/node_list.htm.new
B=/root/node_list.htm.bak

uclient-fetch -q -O "$T" "http://<PC_IP>:18767/luci/passwall-node-list-enhance/node_list.htm" || exit 1
[ -s "$T" ] || exit 1
cp -p "$V" "$B" || exit 1
cmp -s "$T" "$V" && { echo "already installed"; rm -f "$T"; exit 0; }
wc -c "$T"
# 确认文件大小和来源无误后再替换
mv "$T" "$V" || exit 1
rm -f /tmp/luci-indexcache*
```

后端补丁按 [backend-patch.md](backend-patch.md) 手工套用，同样先备份 controller 与 `test.sh`。

部署后先只打开 PassWall 节点列表，确认列表、分组切换、四个目标表头、原生删除按钮和测速仍正常。第一次只测试排序和"删除超标节点"按钮的勾选结果，取消二次确认，不要直接删除节点。确认无误且有独立配置备份后，才由操作者决定是否执行原生删除。

## 本地检查

模板包含 LuCI 服务端模板标记，不能直接用 `node --check` 检查整个文件。回归测试会自动抽取 JavaScript 块做语法解析并验证四目标行为：

```sh
node scripts/check-passwall-node-list-enhance.js
```

验收边界：`1499 ms` 不超标、`1500 ms` 超标（等号含入）；缺失、超时和错误不删除；按钮只作用于当前可见分组；删除始终有二次确认。
