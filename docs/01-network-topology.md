# 01. 接线与电脑网络设置

这次实际成功的接线方式是：

```text
手机热点 ))) 电脑 WiFi

电脑有线网卡  ---网线---  路由器 LAN 口

光猫 / 上级路由器  ---网线---  路由器 WAN 口
```

也就是说，电脑同时有两条网络：

- WiFi 连接手机热点，用来上网、下载包、查资料。
- 有线网卡连接待刷机路由器，用来访问 `192.168.68.1`、`192.168.1.1` 或 `192.168.8.1`。

## 为什么这样接

刷机过程中路由器可能没有互联网，甚至没有 DHCP。电脑如果只连路由器，遇到问题时很难下载工具或查资料。手机热点能让电脑一直有外网，有线网卡则专门和路由器通信。

## Stock 固件阶段

stock 固件和第三方 U-Boot Recovery 常见地址是：

```text
路由器：192.168.68.1
电脑有线网卡：192.168.68.2/24
网关：留空
DNS：留空或 192.168.68.1
```

重点：给有线网卡设置静态 IP 时，网关最好留空。这样电脑会继续通过手机热点上网，不会把默认路由错误地指向待刷机路由器。

Windows 图形界面设置路径：

1. 打开“设置”。
2. 进入“网络和 Internet”。
3. 找到“高级网络设置”。
4. 打开有线网卡的 IPv4 设置。
5. 手动设置 IP 为 `192.168.68.2`，子网掩码 `255.255.255.0`，默认网关留空。

PowerShell 示例，需要管理员权限，网卡名按你的电脑修改：

```powershell
New-NetIPAddress -InterfaceAlias "以太网" -IPAddress 192.168.68.2 -PrefixLength 24
```

如果已经设置错，可以改回 DHCP。注意 `New-NetIPAddress` 添加的手动地址不会被重新开启 DHCP 自动移除，要显式删掉：

```powershell
Set-NetIPInterface -InterfaceAlias "以太网" -Dhcp Enabled
Remove-NetIPAddress -InterfaceAlias "以太网" -IPAddress 192.168.68.2 -Confirm:$false -ErrorAction SilentlyContinue
Set-DnsClientServerAddress -InterfaceAlias "以太网" -ResetServerAddresses
```

## OpenWrt 首次启动阶段

U-Boot Recovery 刷入 OpenWrt 后，默认管理地址通常是：

```text
http://192.168.1.1/
```

这时电脑有线网卡建议改回自动获取 IP，也就是 DHCP。

## 改成家庭网段阶段

如果你把 OpenWrt LAN 改成 `192.168.8.1`，保存应用后浏览器地址也要改成：

```text
http://192.168.8.1/
```

电脑有线网卡继续用 DHCP，一般会拿到类似：

```text
192.168.8.100 - 192.168.8.250
```

## 光猫和 WAN 口什么时候接

刷 U-Boot 和 Web Recovery 阶段，只需要电脑直连路由器 LAN 口。OpenWrt 启动后，再把路由器 WAN 口接光猫或上级路由器，这样 OpenWrt 才能联网安装软件包。

如果你已经提前把 WAN 接上了也通常没关系，但排障时建议先简化为：

```text
电脑 -- LAN 口 -- 路由器
```

确认管理页面能进，再接 WAN。
