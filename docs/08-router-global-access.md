# 路由器全球分流恢复说明

这份说明对应 2026-08-01 在京东云 RE-CP-02（MT7621）上验证通过的配置：国内流量直连，国外流量通过美国 VLESS Reality 节点。

## 已验证参数

- PassWall：启用
- Xray：`26.7.28`，`linux/mipsle` soft-float
- 节点协议：VLESS + TCP + Reality
- 节点地址：`your-server.example.com:443`
- Reality SNI：`www.cloudflare.com`
- Reality Short ID：`a84e`
- Reality 公钥：`lsrEmlD1lGMvGFYmG-00ZEuzghKx3q3A_-ZhrefmFic`
- Flow：`xtls-rprx-vision`
- PassWall Xray SNI 嗅探：开启（`sniffing_override_dest=1`）
- 国内出口测试：江苏移动公网地址
- 国外出口测试：美国服务器 `***REMOVED-SERVER-IP***`

## 必须从私密备份补回的字段

公开仓库不保存下面的敏感字段。恢复时从私密备份或 3X-UI 客户端信息中填入：

- VLESS UUID：`<VLESS_UUID>`
- 无线网络密码和路由器管理密码
- 任何本地 SSH 私钥

## PassWall 节点模板

```sh
uci set passwall.node=nodes
uci set passwall.node.remarks='CN2-VLESS-Reality-New'
uci set passwall.node.protocol='vless'
uci set passwall.node.type='Xray'
uci set passwall.node.transport='raw'
uci set passwall.node.port='443'
uci set passwall.node.address='your-server.example.com'
uci set passwall.node.uuid='<VLESS_UUID>'
uci set passwall.node.encryption='none'
uci set passwall.node.flow='xtls-rprx-vision'
uci set passwall.node.tls='1'
uci set passwall.node.reality='1'
uci set passwall.node.tls_serverName='www.cloudflare.com'
uci set passwall.node.fingerprint='chrome'
uci set passwall.node.reality_shortId='a84e'
uci set passwall.node.reality_spiderX='/728276f105d66e1'
uci set passwall.node.reality_publicKey='lsrEmlD1lGMvGFYmG-00ZEuzghKx3q3A_-ZhrefmFic'
uci set passwall.@global[0].tcp_node='node'
uci set passwall.@global[0].udp_node='node'
uci set passwall.@global[0].enabled='1'
uci set passwall.@global_xray[0].sniffing_override_dest='1'
uci commit passwall
/etc/init.d/passwall restart
```

## 恢复验证

```sh
curl -x socks5h://127.0.0.1:1070 https://www.google.com/generate_204 -I
curl -x socks5h://127.0.0.1:1070 https://api.openai.com/v1/models -I
curl https://myip.ipip.net
```

仓库中的 `firmware/xray-softfloat-26.7.28-linux-mipsle` 是匹配该路由器的 Xray 核心。原始 `/etc/config` 完整备份只保存在私密位置，不能放入这个公开仓库。
