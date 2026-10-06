# LuCI Glass 主题（透明炫彩 · RE-CP-02 自制）

自制 LuCI 主题：深空渐变 + 三色光斑背景，玻璃拟态卡片（半透明 + backdrop blur），渐变主色贯穿侧栏指示条、按钮、进度条与登录页。组件骨架沿用 argon 的 cascade.css 保证功能完整，视觉与排版全部由本主题的 `glass.css` 自绘。

适用于 ImmortalWrt 25.12（ucode 模板，包管理器 apk）。24.10（opkg、旧 ucode 路径）未适配。

## 文件与部署位置

| 仓库路径 | 路由器路径 |
| --- | --- |
| `root/usr/share/ucode/luci/template/themes/glass/*.ut`（7 个模板） | `/usr/share/ucode/luci/template/themes/glass/` |
| `root/www/luci-static/glass/css/glass.css` | `/www/luci-static/glass/css/` |

依赖：`luci-theme-argon`（提供 cascade.css 组件骨架与 menu-argon.js 菜单脚本，`apk add luci-theme-argon`）。

## 安装 / 切换 / 卸载

```sh
# 电脑：仓库根目录起临时服务
python -m http.server 18767 --bind 0.0.0.0
# 路由器：<PC_IP> 换成电脑地址
mkdir -p /usr/share/ucode/luci/template/themes/glass /www/luci-static/glass/css
uclient-fetch -q -O /usr/share/ucode/luci/template/themes/glass/header.ut "http://<PC_IP>:18767/luci-theme-glass/root/usr/share/ucode/luci/template/themes/glass/header.ut"
# ……其余 6 个 .ut 与 glass.css 同理，或直接 scp -O
uci set luci.main.mediaurlbase="/luci-static/glass"
uci commit luci
# 回滚到 argon：
uci set luci.main.mediaurlbase="/luci-static/argon"; uci commit luci
```

改 CSS 后浏览器若不刷新，LuCI 会按固定版本号缓存静态资源——换个文件名或带 `?v=` 变更即可。

## 已知边界

- 25.12 的 uhttpd 不支持 `no_cache` UCI 选项，静态资源存在浏览器启发式缓存；
- 插件升级覆盖 argon 的 cascade.css 极少影响本主题（glass.css 的覆盖带 `!important`）；
- 深色单模式：玻璃设计以深色为底，未做浅色变体。
