# LuCI Glass 主题（透明炫彩 · RE-CP-02 自制）

自制 LuCI 主题：深空渐变 + 三色光斑背景，玻璃拟态卡片（半透明 + backdrop blur），渐变主色贯穿侧栏指示条、按钮、进度条与登录页。组件骨架沿用 argon 的 cascade.css 保证功能完整，视觉与排版全部由本主题的 `glass.css` 自绘。

当前视觉层融合了对 [luci-theme-vantage](https://github.com/anothaDev/luci-theme-vantage) 的界面审查结论：采用石墨灰底、荧光黄状态强调、冰青色链接、收紧的控件间距与更明确的侧栏活动指示。这里只移植设计语言与令牌，没有复制 Vantage 的源码、模板或资源；原主题仍保持本项目的 Glass 结构与 Argon 兼容边界。

**1.3.0 起支持深浅双模式**：顶栏右上角 ◐ 按钮在「跟随系统 → 浅色（晨曦微光）→ 深色」之间循环，选择持久化到浏览器 `localStorage`；浅色面板为浅白磨砂玻璃底 + 同套渐变主色，登录页跟随系统自动切换（登录页无按钮）。早期模式决策脚本放在 `<head>`（head_meta.ut），浅色用户不会先看到深色再闪一下。

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

**发布约定（强制）**：uhttpd 对 `/luci-static/` 资源按 URL 启发式强缓存，只改内容不改 URL 时浏览器不会更新。因此：

- 改 `glass.css` → 必须同步递增 `header.ut` 与 `header_login.ut` 里的引用版本参数（当前 `?v=4`，每次改动 +1）；
- 改视图 JS → 必须换文件名，并同步 menu.d 的 view path（先例：更新中心 `update-center.js` → `update-center2.js` → `update-center3.js`）；
- 部署涉及 menu.d / 模板时：`rm -f /tmp/luci-indexcache*` + `/etc/init.d/rpcd restart`。

## 已知边界

- 25.12 的 uhttpd 不支持 `no_cache` UCI 选项，静态资源存在浏览器启发式缓存（版本参数 + 视图改名双保险规避）；
- 插件升级覆盖 argon 的 cascade.css 极少影响本主题（glass.css 的覆盖带 `!important`）；
- 浅色模式覆盖了全部核心界面（表单/表格/弹窗/登录页/第三方应用白底残留），个别自制应用的硬编码内联样式（如更新中心的深色输出框）在浅色下保持深色，属预期效果；
- 小屏设备自动降低光斑模糊与磨砂强度（省 GPU），`prefers-reduced-motion` 用户停用装饰动画。
