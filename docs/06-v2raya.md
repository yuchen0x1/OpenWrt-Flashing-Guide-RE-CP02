# 06. v2rayA 分流与 LuCI 快捷入口

v2rayA 可以在 OpenWrt 上管理 Xray / v2ray 节点，并配合透明代理实现“国内直连，需要代理的网站走节点”。

## 重要说明

- DNS 不等于代理。DoH 配好了，不代表所有网站都能打开。
- 免费公开节点经常不可用、延迟不显示、速度慢或安全性差。
- 订阅链接、节点信息、UUID、Reality 信息都属于敏感信息，不要公开。
- 请遵守所在地法律法规和网络服务条款。

## 1. 安装

先确认系统版本和包架构。RE-CP-02 官方 25.12 包源对应 `mipsel_24kc`；如果设备不是 25.12 或架构不同，不要直接套用下面命令：

```sh
cat /etc/openwrt_release
apk --print-arch
```

确认是 OpenWrt 25.12、架构为 `mipsel_24kc` 后，再从当前系统配置的官方包源安装：

```sh
apk update
apk add v2raya xray-core luci-app-v2raya
```

如果 `apk update` 或 `apk add` 报包不存在，先检查 `/etc/apk/repositories.d/distfeeds.list` 是否指向当前 25.12 源，再使用 `apk search v2raya` 检查包名。不要把旧版 `opkg` feed 的包直接混装到 25.12。

如果只需要核心而暂时不需要 LuCI 入口，可以先安装：

```sh
apk add v2raya xray-core
```

启用服务：

```sh
/etc/init.d/v2raya enable
/etc/init.d/v2raya restart
```

检查服务是否启动：

```sh
/etc/init.d/v2raya status
netstat -lntp | grep -E '2017|20170|20171|20172'
```

访问管理页：

```text
http://192.168.8.1:2017/
```

如果你的 LAN 不是 `192.168.8.1`，把地址换成你的路由器 IP。

## 2. 低性能路由器启动超时

RE-CP-02 启动 Xray 有时比较慢。v2rayA 日志如果出现 core 启动超时，可以把超时改成 90 秒：

```sh
uci set v2raya.config.core_startup_timeout='90'
uci commit v2raya
/etc/init.d/v2raya restart
```

如果 init 脚本没有读取这个 UCI 项，需要在 `/etc/init.d/v2raya` 里追加环境变量。示例：

```sh
append_env_arg "config" "core_startup_timeout" "90"
```

改完后：

```sh
/etc/init.d/v2raya restart
logread -e v2raya
```

## 3. 导入订阅或节点

在 v2rayA 页面：

```text
Subscriptions -> Add
```

填入：

```text
<YOUR_SUBSCRIPTION_URL>
```

保存并更新订阅。不要把订阅链接提交到公开仓库或公开 issue。

如果是手动节点，按服务商给出的协议类型、地址、端口、UUID、TLS、Reality 等信息逐项填入。

## 4. 选择分流模式

目标是：

```text
国内网站、本地局域网、运营商服务 -> 直连
需要代理的网站 -> 走节点
```

v2rayA 页面里通常选择类似：

```text
Transparent Proxy：启用
Routing / Mode：大陆白名单 / 绕过大陆 / GFWList / GeoIP CN direct
```

不同版本翻译不完全一样，核心逻辑是：

- `geoip:cn`、`geosite:cn`、局域网地址走 direct。
- 其他需要代理的域名走 proxy。

如果你只选了一个节点，它就是当前代理出口。导入多个节点并不代表会同时使用多个节点。想自动切换，通常需要：

- 订阅服务商提供可用的策略组，或
- 在 v2rayA 中手动测试延迟后选择可用节点，或
- 使用支持健康检查和策略组的上游配置。

## 5. 验证是否生效

检查端口：

```sh
netstat -lntp | grep -E '2017|20170|20171|20172'
```

查看日志：

```sh
logread -e v2raya
logread -e xray
```

正常时能看到类似含义的日志：

```text
transparent -> direct
transparent -> proxy
```

这表示有些流量直连，有些流量代理。

如果节点不显示延迟：

- 节点可能失效。
- 订阅过期或格式不对。
- 服务器阻断 ICMP/TCP Ping，延迟测试不代表一定不可用。
- Xray core 没启动成功。
- 路由器时间不准，TLS 证书校验失败。

先同步时间：

```sh
date
/etc/init.d/sysntpd restart
```

## 6. 添加 LuCI 快捷入口

本仓库提供了一个 LuCI 总览页快捷入口：

```text
luci/05_v2raya.js
```

复制到路由器：

```sh
scp luci/05_v2raya.js root@192.168.8.1:/www/luci-static/resources/view/status/include/05_v2raya.js
```

清理缓存并重启 Web 服务：

```sh
rm -rf /tmp/luci-*
/etc/init.d/uhttpd restart
```

刷新 LuCI 总览页，就会看到“打开 v2rayA 管理页”的按钮。
