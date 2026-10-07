param(
    [string]$BaseUri = "http://127.0.0.1:18765/",
    [int]$HttpTimeoutSec = 3,
    [switch]$RequireFirmware
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$base = $BaseUri.TrimEnd('/') + '/'
$failures = [System.Collections.Generic.List[string]]::new()
$passes = [System.Collections.Generic.List[string]]::new()
$skips = [System.Collections.Generic.List[string]]::new()

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
    Fail "HTTP server is not reachable at $base"
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
