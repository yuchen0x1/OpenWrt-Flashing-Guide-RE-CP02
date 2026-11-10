param(
    [string]$BaseUri = "http://127.0.0.1:18765/",
    [int]$HttpTimeoutSec = 3,
    [switch]$RequireFirmware,
    # HTTP 服务未启动时默认跳过 HTTP 检查（只做本地静态文件/语法/校验和检查），
    # 不再整体 FAIL；CI 或发布前需要强制校验站点时传 -RequireHttp 恢复旧行为。
    [switch]$RequireHttp
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$base = $BaseUri.TrimEnd('/') + '/'
$failures = [System.Collections.Generic.List[string]]::new()
$passes = [System.Collections.Generic.List[string]]::new()
$skips = [System.Collections.Generic.List[string]]::new()
$psGitAvailable = [bool](Get-Command git -ErrorAction SilentlyContinue)

function Pass {
    param([string]$Message)
    $passes.Add($Message)
    Write-Output "PASS $Message"
}

function Fail {
    param([string]$Message)
    $failures.Add($Message)
    Write-Output "FAIL $Message"
}

function Skip {
    param([string]$Message)
    $skips.Add($Message)
    Write-Output "SKIP $Message"
}

function Check-HttpResource {
    param([string]$Path)

    $uri = $base + $Path
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $uri -TimeoutSec $HttpTimeoutSec
        if ([int]$response.StatusCode -ne 200) {
            Fail "HTTP $Path returned $($response.StatusCode)"
            return
        }
        Pass "HTTP $Path"
    } catch {
        Fail "HTTP $Path :: $($_.Exception.Message)"
    }
}

$serverAvailable = $true
try {
    $baseUrl = [Uri]$base
    $client = [System.Net.Sockets.TcpClient]::new()
    $connect = $client.BeginConnect($baseUrl.Host, $baseUrl.Port, $null, $null)
    if (-not $connect.AsyncWaitHandle.WaitOne($HttpTimeoutSec * 1000, $false)) {
        $serverAvailable = $false
    } else {
        $client.EndConnect($connect)
    }
    $client.Close()
} catch {
    $serverAvailable = $false
}

$httpPaths = @(
    "",
    "site/",
    "site/styles.css",
    "site/app.js",
    "site/favicon.svg",
    "site/assets/hero-router.jpg",
    "firmware/README.md",
    "firmware/SHA256SUMS.txt"
)

$docs = @(Get-ChildItem -LiteralPath (Join-Path $root "docs") -Filter "*.md" -File | Sort-Object Name)
foreach ($doc in $docs) {
    $httpPaths += "docs/$($doc.Name)"
}
if ($serverAvailable) {
    foreach ($path in $httpPaths) {
        Check-HttpResource $path
    }
} else {
    if ($RequireHttp) {
        Fail "HTTP server is not reachable at $base (-RequireHttp given)"
    } else {
        Skip "HTTP server not reachable at $base; HTTP checks skipped (start it with: python -m http.server 18765 --bind 127.0.0.1, or pass -RequireHttp to enforce)"
    }
}

$siteIndex = Get-Content -Raw -Encoding UTF8 (Join-Path $root "site/index.html")
if ($siteIndex -match "RE-CP-02") {
    Pass "site/index.html contains project identity"
} else {
    Fail "site/index.html is missing project identity"
}
if ($siteIndex -match 'href="\.\./firmware/README\.md"\s+data-doc="\.\./firmware/README\.md"') {
    Pass "firmware manifest opens in the site reader"
} else {
    Fail "firmware manifest reader link is missing"
}

$appPath = Join-Path $root "site/app.js"
$appText = Get-Content -Raw -Encoding UTF8 $appPath
$appDocs = @([regex]::Matches($appText, "'\.\./docs/([^']+)'\s*\]" ) | ForEach-Object { $_.Groups[1].Value })
$diskDocs = @($docs | ForEach-Object { $_.Name })
if ((@($appDocs | Sort-Object) -join "`n") -eq (@($diskDocs | Sort-Object) -join "`n")) {
    Pass "site/app.js maps all $($diskDocs.Count) Markdown documents"
} else {
    Fail "site/app.js document mapping does not match docs/*.md"
}

# JS list is collected by directory glob, so newly added scripts are covered without editing this file.
# Inline scripts in *.htm/*.html embed LuCI template tags (<% %>) and cannot be fed to node --check;
# the passwall node-list enhance block is verified separately by scripts/check-passwall-node-list-enhance.js.
$jsFiles = @(Get-ChildItem -LiteralPath $root -Recurse -File -Filter "*.js" |
    Where-Object { $_.FullName -notmatch '[\\/](\.git|node_modules|firmware)[\\/]' } |
    Sort-Object FullName)
if (Get-Command node -ErrorAction SilentlyContinue) {
    foreach ($file in $jsFiles) {
        $relative = $file.FullName.Substring($root.Length).TrimStart('\', '/')
        # PS 5.1 下原生命令的 stderr 经 2>&1 会被包装成 ErrorRecord，EAP=Stop 时直接终止脚本，
        # 而 node --check 恰好在语法失败时写 stderr；局部降级为 Continue，让失败走 FAIL 分支
        $ErrorActionPreference = "Continue"
        $output = (& node --check $file.FullName 2>&1 | Out-String).TrimEnd()
        $nodeExit = $LASTEXITCODE
        $ErrorActionPreference = "Stop"
        if ($nodeExit -eq 0) {
            Pass "Node syntax $relative"
        } else {
            Fail "Node syntax $relative :: $output"
        }
    }
} else {
    Skip "node not found; JavaScript syntax checks skipped ($($jsFiles.Count) files)"
}

# PowerShell list is collected by directory glob as well, including this script itself.
$psFiles = @(Get-ChildItem -LiteralPath $root -Recurse -File -Filter "*.ps1" |
    Where-Object { $_.FullName -notmatch '[\\/](\.git|node_modules|firmware)[\\/]' } |
    Sort-Object FullName)
foreach ($file in $psFiles) {
    $relative = $file.FullName.Substring($root.Length).TrimStart('\', '/')
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$null, [ref]$parseErrors) | Out-Null
    if ($parseErrors.Count -eq 0) {
        Pass "PowerShell syntax $relative"
    } else {
        Fail "PowerShell syntax $relative :: $($parseErrors[0].Message)"
    }
}

# sh scripts: syntax + exec permission check (Win32 上优先使用 Git Bash)
# .sh 脚本语法用 bash -n / sh -n 校验；可执行脚本按仓库约定需保留 +x 权限位。
$shScripts = @(Get-ChildItem -LiteralPath $root -Recurse -File -Filter "*.sh" |
    Where-Object { $_.FullName -notmatch '[\\/](\.git|node_modules|firmware)[\\/]' } |
    Sort-Object FullName)
# 无扩展名的路由器端包装器也要保留 +x：LuCI 通过 fs.exec 直接执行它。
$extraExecFiles = @(Get-ChildItem -LiteralPath (Join-Path $root "luci-app-ota-check/root/usr/bin") -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'ota-check-ui' })
$execCheckTargets = @($shScripts) + @($extraExecFiles)
$bashCommand = $null
# Windows 10/11 可能把 bash.exe 解析到 WSL 转发器；本项目只需要 Git Bash，
# 因此显式优先探测 Git 安装路径，避免“bash 存在但 WSL 无发行版”的误报失败。
$gitBashCandidates = @(
    (Join-Path ${env:ProgramFiles} 'Git\bin\bash.exe'),
    (Join-Path ${env:ProgramFiles} 'Git\usr\bin\bash.exe'),
    (Join-Path ${env:ProgramW6432} 'Git\bin\bash.exe'),
    (Join-Path ${env:ProgramW6432} 'Git\usr\bin\bash.exe')
)
foreach ($candidate in $gitBashCandidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        $bashCommand = $candidate
        break
    }
}
if (-not $bashCommand) {
    $bashFromPath = Get-Command bash -ErrorAction SilentlyContinue
    if ($bashFromPath) {
        $bashCommand = $bashFromPath.Source
    }
}
if ($bashCommand) {
    foreach ($file in $shScripts) {
        $relative = $file.FullName.Substring($root.Length).TrimStart('\', '/')
        # Git Bash 的 bash 接受正斜杠路径；反斜杠会被当转义符
        $posixPath = $file.FullName -replace '\\', '/'
        $ErrorActionPreference = "Continue"
        $output = (& $bashCommand -n $posixPath 2>&1 | Out-String).TrimEnd()
        $rc = $LASTEXITCODE
        $ErrorActionPreference = "Stop"
        if ($rc -eq 0) {
            Pass "Bash syntax $relative"
        } else {
            Fail "Bash syntax $relative :: $output"
        }
    }
} else {
    Skip "bash not found; shell syntax checks skipped ($($shScripts.Count) files)"
}
foreach ($file in $execCheckTargets) {
    $relative = $file.FullName.Substring($root.Length).TrimStart('\', '/')
    # git ls-files 只认正斜杠路径
    $gitPath = $relative -replace '\\', '/'
    # GetUnixFileMode 仅 PS 7+；PS 5.1 读不了 unix 权限位，但可以回落到 git 索引里的
    # mode 位（100755/100644），否则这项检查在 Windows PowerShell 5.1 上永远是 SKIP。
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        $mode = [System.IO.File]::GetUnixFileMode($file.FullName)
        if (($mode -band [System.IO.UnixFileMode]::UserExecute) -ne 0) {
            Pass "Exec perm $relative"
        } else {
            Fail "Exec perm $relative (缺少 +x；仓库脚本按约定需可执行)"
        }
        continue
    }
    $gitLsEntry = $null
    if ($psGitAvailable) {
        $ErrorActionPreference = "Continue"
        $lsOutput = (& git -C $root ls-files -s -- $gitPath 2>&1 | Out-String).Trim()
        $ErrorActionPreference = "Stop"
        if ($lsOutput -match '^(\d{6})\s') {
            $gitLsEntry = $Matches[1]
        }
    }
    if ($gitLsEntry) {
        if ($gitLsEntry -eq '100755') {
            Pass "Exec perm $relative (git index 100755)"
        } else {
            Fail "Exec perm $relative (git index $gitLsEntry，需要 100755；用 git update-index --chmod=+x 修正)"
        }
    } elseif ($psGitAvailable) {
        Fail "Exec perm $relative (不在 git 索引内，无法判定权限位)"
    } else {
        Skip "Exec perm $relative (需要 PowerShell 7+ 或 git 才能读权限位)"
    }
}

$manifestPath = Join-Path $root "firmware/SHA256SUMS.txt"
$manifestLines = @(Get-Content -Encoding UTF8 $manifestPath | Where-Object { $_.Trim() -and $_ -notmatch '^\s*#' })
foreach ($line in $manifestLines) {
    if ($line -notmatch '^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$') {
        Fail "Invalid SHA256 manifest line: $line"
        continue
    }
    $expectedHash = $Matches[1].ToLowerInvariant()
    $firmwareName = $Matches[2]
    $firmwarePath = Join-Path (Join-Path $root "firmware") $firmwareName
    if (-not (Test-Path -LiteralPath $firmwarePath -PathType Leaf)) {
        if ($RequireFirmware) {
            Fail "Missing firmware: $firmwareName"
        } else {
            Skip "Firmware absent by repository policy: $firmwareName"
        }
        continue
    }
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $firmwarePath).Hash.ToLowerInvariant()
    if ($actualHash -eq $expectedHash) {
        Pass "SHA256 $firmwareName"
    } else {
        Fail "SHA256 mismatch $firmwareName"
    }
}

# OTA manifest semantic checks: JSON syntax alone is not enough because the
# router-side checker consumes these fields as its update contract.
$otaManifestPath = Join-Path $root "ota/manifest.json"
try {
    $otaManifest = Get-Content -Raw -Encoding UTF8 $otaManifestPath | ConvertFrom-Json
    if ($otaManifest.schema -eq 1 -and $otaManifest.distro -and $otaManifest.device_match -and $otaManifest.latest -and @($otaManifest.releases).Count -gt 0) {
        Pass "OTA manifest required fields"
    } else {
        Fail "OTA manifest required fields are incomplete"
    }
    $otaVersions = @($otaManifest.releases | ForEach-Object { [string]$_.version })
    if ($otaVersions -contains [string]$otaManifest.latest) {
        Pass "OTA manifest latest version is listed"
    } else {
        Fail "OTA manifest latest version is not present in releases"
    }
    foreach ($release in @($otaManifest.releases)) {
        $version = [string]$release.version
        $upgrade = $release.sysupgrade
        if ($version -match '^\d+\.\d+\.\d+$' -and $upgrade.url -match '^https://') {
            Pass "OTA release $version URL/version"
        } else {
            Fail "OTA release $version has invalid version or non-HTTPS URL"
        }
        if ([string]$upgrade.sha256 -match '^[0-9a-fA-F]{64}$' -and [int64]$upgrade.size -gt 0) {
            Pass "OTA release $version SHA256/size"
        } else {
            Fail "OTA release $version has invalid SHA256 or size"
        }
    }
} catch {
    Fail "OTA manifest JSON/semantic check :: $($_.Exception.Message)"
}

# 版本一致性：官方基线的版本号/哈希/下载链接在 6 个位置重复出现，只改一半是
# 本项目最容易重犯的错误（25.12.5 -> 25.12.6 时就是这样漏的），交给专用脚本比对。
$consistencyScript = Join-Path $root "scripts/check-consistency.js"
if ((Get-Command node -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $consistencyScript -PathType Leaf)) {
    $ErrorActionPreference = "Continue"
    $consistencyOutput = (& node $consistencyScript --verbose 2>&1 | Out-String).TrimEnd()
    $consistencyExit = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($consistencyExit -eq 0) {
        Pass "Version consistency check"
    } else {
        Fail "Version consistency check :: $consistencyOutput"
    }
} else {
    Skip "node or scripts/check-consistency.js missing; version consistency check skipped"
}

# LuCI 更新中心视图逻辑：版本按钮必须按清单生成（曾硬编码 23.05.7）。
$otaViewScript = Join-Path $root "scripts/check-ota-view.js"
if ((Get-Command node -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $otaViewScript -PathType Leaf)) {
    $ErrorActionPreference = "Continue"
    $otaViewOutput = (& node $otaViewScript 2>&1 | Out-String).TrimEnd()
    $otaViewExit = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($otaViewExit -eq 0) {
        Pass "OTA view logic check"
    } else {
        Fail "OTA view logic check :: $otaViewOutput"
    }
} else {
    Skip "node or scripts/check-ota-view.js missing; OTA view logic check skipped"
}

if (Test-Path -LiteralPath (Join-Path $root ".git") -PathType Container) {
    # 同上：git 的 stderr 在 EAP=Stop 下经 2>&1 会终止脚本，局部降级收集输出
    $ErrorActionPreference = "Continue"
    $gitOutput = (& git -C $root diff --check 2>&1 | Out-String).TrimEnd()
    $gitExit = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($gitExit -eq 0) {
        Pass "Git whitespace check"
    } else {
        Fail "Git whitespace check :: $gitOutput"
    }
} else {
    Skip "not a git worktree; git whitespace check skipped"
}

Write-Output "SUMMARY pass=$($passes.Count) fail=$($failures.Count) skip=$($skips.Count)"
if ($failures.Count -gt 0) {
    exit 1
}
