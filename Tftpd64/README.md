# Tftpd64（TFTP 辅助工具）

刷机流程里的可选传输方式：把固件或 U-Boot 放到电脑上开 TFTP 服务，路由器用 `tftp -g` 拉取。
对应文档：[刷机流程 · 方式 B](../docs/02-flashing.md)。

## 文件

| 文件 | 说明 |
| --- | --- |
| `tftpd64.exe` | Tftpd64 主程序（Windows） |
| `tftpd32.ini` | 配套配置：仅启用 TFTP、监听 69 端口、`BaseDirectory=.`（指向当前目录） |
| `EUPL-EN.pdf` | 上游许可证正文（EUPL v1.2，允许再分发） |

## 校验值

```text
SHA256  6432554c66926d9b7fad0e0056d32491a9dd8af95aede6c39f701fb531f99330
大小    341,504 字节
```

Windows 校验：

```powershell
certutil -hashfile .\Tftpd64\tftpd64.exe SHA256
```

## 来源与使用边界

- 上游项目：<https://pjo2.github.io/tftpd64/>（作者 Ph. Jounin，EUPL v1.2）。
- **本仓库这份 exe 没有版本资源信息**（文件属性里没有 VersionInfo），因此无法从文件本身判定具体版本号。
  仓库只钉住上面的 SHA256；如果你对供应链敏感，建议直接从上游官方页面重新下载并替换，
  再把新哈希更新到本文件。
- 该程序只在刷机时临时使用，用完即可关闭；`tftpd32.ini` 已清空 `LocalIP` 与
  `Console Password`，不含本机地址、租约或密码。
- 开启 TFTP 服务时，`BaseDirectory` 指向的目录会被同一局域网内的设备读取，
  **不要把整个磁盘或含私人文件的目录设为根目录**，建议单独建一个只放固件的文件夹。

## 为什么不放进 `firmware/`

`firmware/` 只保留校验清单，不放二进制。本目录是工具而不是固件，所以单独放置，
并由本文件记录来源与哈希。