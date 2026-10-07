# 05. 常用服务配置

本章是 OpenWrt 刷好后的实用配置。所有密码、Token、订阅都用占位符，不要照抄真实信息到公开仓库。

## 1. DNS 与 DoH

先说清楚一个常见误解：DNS 只负责“把域名解析成 IP”，不等于代理，也不保证所有网站都能打开。  
如果网站因为网络路由或访问策略不可达，只换 DNS 通常没用，需要分流代理之类的方案。

安装：

```sh
apk update
apk add https-dns-proxy luci-app-https-dns-proxy luci-i18n-https-dns-proxy-zh-cn ca-bundle
```

LuCI 路径：

```text
Services -> HTTPS DNS Proxy
```

常用上游可选：

```text
AliDNS: https://dns.alidns.com/dns-query
DNSPod: https://doh.pub/dns-query
```

DNS 配好后验证：

```sh
nslookup openwrt.org 127.0.0.1
logread | grep -i https-dns-proxy
```

## 2. 广告过滤

安装 adblock-fast：

```sh
apk add adblock-fast luci-app-adblock-fast luci-i18n-adblock-fast-zh-cn
```

LuCI 路径：

```text
Services -> AdBlock Fast
```

建议先开启常用规则，不要一开始把所有规则都勾上。规则太多可能导致：

- 误伤正常网站
- 路由器内存压力增大
- DNS 响应变慢

如果某个网站打不开，先临时停用广告过滤验证：

```sh
/etc/init.d/adblock-fast stop
```

## 3. UPnP

UPnP 用来让内网设备自动申请端口映射，例如游戏、NAS、BT、部分远程连接。  
页面里“没有条目”是正常的，只有内网设备真正申请映射时才会显示。

安装：

```sh
apk add miniupnpd luci-app-upnp luci-i18n-upnp-zh-cn
```

启用：

```sh
/etc/init.d/miniupnpd enable
/etc/init.d/miniupnpd restart
```

LuCI 路径：

```text
Services -> UPnP
```

建议：

- 只在家庭可信内网开启。
- 不要把 UPnP 开给 guest WiFi。
- 不需要远程访问时可以关闭。

## 4. SQM 智能队列

SQM 用来缓解满速下载或上传时的延迟升高。500M/500M 宽带可以先填 94% 左右：

```text
Download speed：470000 kbit/s
Upload speed：470000 kbit/s
Queue discipline：cake
Queue setup script：piece_of_cake.qos
```

安装：

```sh
apk add sqm-scripts luci-app-sqm luci-i18n-sqm-zh-cn
```

LuCI 路径：

```text
Network -> SQM QoS
```

接口通常选择 WAN 对应接口。配置后测速，如果速度损失过多，可以逐步调高；如果延迟仍然飙升，逐步调低。

## 5. dynv6 DDNS

DDNS 用来把家里的公网 IPv4 或 IPv6 自动更新到域名。dynv6 的 Token 不要公开。

安装：

```sh
apk add ddns-scripts ddns-scripts-services luci-app-ddns luci-i18n-ddns-zh-cn curl ca-bundle
```

LuCI 路径：

```text
Services -> Dynamic DNS
```

基础配置示例：

```text
Service：dynv6.com
Hostname：<YOUR_DOMAIN>.dynv6.net
Password / Token：<YOUR_DYNV6_TOKEN>
IP source：Network
Network：wan 或 wan6
```

命令行示例：

```sh
uci set ddns.dynv6='service'
uci set ddns.dynv6.enabled='1'
uci set ddns.dynv6.service_name='dynv6.com'
uci set ddns.dynv6.domain='<YOUR_DOMAIN>.dynv6.net'
uci set ddns.dynv6.password='<YOUR_DYNV6_TOKEN>'
uci set ddns.dynv6.ip_source='network'
uci set ddns.dynv6.ip_network='wan'
uci set ddns.dynv6.interface='wan'
uci set ddns.dynv6.check_interval='10'
uci set ddns.dynv6.check_unit='minutes'
uci set ddns.dynv6.force_interval='72'
uci set ddns.dynv6.force_unit='hours'
uci commit ddns
/etc/init.d/ddns enable
/etc/init.d/ddns restart
```

IPv6 可单独建一个 `dynv6_v6` 服务，把 `ip_network` 和 `interface` 改成 `wan6`。

查看日志：

```sh
logread -e ddns
```

获取当前 WAN6 IPv6 可用本仓库脚本（仓库根目录先传到路由器，路由器上没有 `scripts/` 目录）：

```sh
scp scripts/get-wan6-ip.sh root@<ROUTER_IP>:/tmp/
ssh root@<ROUTER_IP> 'sh /tmp/get-wan6-ip.sh'
```
