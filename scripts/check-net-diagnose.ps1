$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'router-net-diagnose.ps1'
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
# Import functions only; never execute administrator checks, probes, or real NIC commands.
foreach ($function in $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
    Invoke-Expression $function.Extent.Text
}

$script:testRoot = Join-Path ([IO.Path]::GetTempPath()) ('openwrt-net-diagnose-test-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($script:testRoot) | Out-Null
$script:adapter = [pscustomobject]@{ Name = 'Mock Ethernet'; ifIndex = 42; InterfaceGuid = '3b8838c8-daf2-4b81-b9da-a1b22ae1430a' }
$script:pass = 0
function Get-ProbeStatePath { param($Adapter) return Join-Path $script:testRoot (([guid]$Adapter.InterfaceGuid).ToString('D') + '.json') }
function Add-Result { param([string]$Text) $script:messages += $Text }
function Assert { param([bool]$Condition, [string]$Message) if (-not $Condition) { throw "FAIL $Message" }; $script:pass++; Write-Output "PASS $Message" }
function Reset-Mock {
    param([string]$Dhcp = 'Enabled', [array]$Addresses = @())
    $script:dhcp = $Dhcp
    $script:addresses = @($Addresses)
    $script:messages = @()
    $script:removed = @()
    $script:failNew = $null
    $script:nextNew = 0
    $statePath = Get-ProbeStatePath -Adapter $script:adapter
    if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath -Force }
}
function New-MockAddress { param([string]$IP, [string]$Origin = 'Manual', [int]$Prefix = 24) return [pscustomobject]@{ InterfaceIndex = 42; IPAddress = $IP; PrefixLength = $Prefix; PrefixOrigin = $Origin } }
function Get-NetIPAddress { [CmdletBinding()] param($AddressFamily) return $script:addresses }
function Get-NetIPInterface { [CmdletBinding()] param($InterfaceIndex, $AddressFamily) return [pscustomobject]@{ Dhcp = $script:dhcp } }
function New-NetIPAddress {
    [CmdletBinding()] param($InterfaceIndex, $AddressFamily, $IPAddress, $PrefixLength, $SkipAsSource)
    if ($InterfaceIndex -ne 42) { throw 'Unexpected adapter write' }
    $script:dhcp = 'Disabled'
    $script:nextNew++
    if ($script:failNew -eq $script:nextNew) { throw 'Simulated address creation failure' }
    $script:addresses = @($script:addresses) + (New-MockAddress $IPAddress)
}
function Remove-NetIPAddress {
    [CmdletBinding(SupportsShouldProcess)] param($InterfaceIndex, $AddressFamily, $IPAddress)
    if ($InterfaceIndex -ne 42) { throw 'Unexpected adapter write' }
    $script:removed += $IPAddress
    $script:addresses = @($script:addresses | Where-Object { $_.IPAddress -ne $IPAddress })
}
function Set-NetIPInterface { [CmdletBinding()] param($InterfaceIndex, $AddressFamily, $Dhcp) if ($InterfaceIndex -ne 42) { throw 'Unexpected adapter write' }; $script:dhcp = $Dhcp }

try {
    Reset-Mock -Addresses @((New-MockAddress '10.0.0.123' 'Dhcp'))
    Invoke-ProbeAddressChange -Adapter $script:adapter
    Assert ($script:addresses.Count -eq 4 -and $script:dhcp -eq 'Disabled') 'configuration adds three probes and records original DHCP'
    Invoke-ProbeAddressChange -Adapter $script:adapter
    Assert ($script:nextNew -eq 3) 'repeated configuration preserves the original rollback record'
    Invoke-ProbeAddressChange -Adapter $script:adapter -Remove
    Assert ($script:removed.Count -eq 3 -and $script:dhcp -eq 'Enabled') 'rollback removes recorded probes and restores DHCP'
    Assert ($script:addresses.Count -eq 1 -and $script:addresses[0].IPAddress -eq '10.0.0.123') 'rollback preserves the original IPv4 address'
    Assert (-not (Test-Path -LiteralPath (Get-ProbeStatePath $script:adapter))) 'successful rollback deletes only its own state record'

    Reset-Mock -Dhcp Disabled -Addresses @((New-MockAddress '192.168.1.2'), (New-MockAddress '10.0.0.2'))
    Invoke-ProbeAddressChange -Adapter $script:adapter
    Invoke-ProbeAddressChange -Adapter $script:adapter -Remove
    Assert ($script:removed.Count -eq 2 -and '192.168.1.2' -notin $script:removed) 'pre-existing probe address is never removed'
    Assert ($script:addresses.Count -eq 2 -and $script:dhcp -eq 'Disabled') 'static interface retains its original addresses and DHCP setting'

    Reset-Mock -Dhcp Disabled -Addresses @((New-MockAddress '192.168.1.2'))
    Invoke-ProbeAddressChange -Adapter $script:adapter -Remove
    Assert ($script:removed.Count -eq 0 -and $script:addresses.Count -eq 1) 'missing rollback record never deletes user addresses'

    Reset-Mock -Addresses @((New-MockAddress '10.0.0.123' 'Dhcp'))
    $script:failNew = 2
    $failed = $false
    try { Invoke-ProbeAddressChange -Adapter $script:adapter } catch { $failed = $true }
    Assert $failed 'partial configuration failure is reported'
    Assert ([bool]($script:messages -match 'Configuration incomplete.*RemoveStaticIPs')) 'partial failure explains how to restore network settings'
    Invoke-ProbeAddressChange -Adapter $script:adapter -Remove
    Assert ($script:removed.Count -eq 1 -and $script:dhcp -eq 'Enabled') 'partial failure retains enough state to remove its probe and restore DHCP'

    Reset-Mock -Addresses @((New-MockAddress '10.0.0.123' 'Dhcp'))
    Invoke-ProbeAddressChange -Adapter $script:adapter
    $statePath = Get-ProbeStatePath $script:adapter
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $state.InterfaceGuid = [guid]::NewGuid().ToString('D')
    Save-ProbeState -Path $statePath -State $state
    $failed = $false
    try { Invoke-ProbeAddressChange -Adapter $script:adapter -Remove } catch { $failed = $true }
    Assert ($failed -and $script:removed.Count -eq 0) 'adapter mismatch fails before any network mutation'

    Reset-Mock -Addresses @((New-MockAddress '10.0.0.123' 'Dhcp'))
    Invoke-ProbeAddressChange -Adapter $script:adapter
    ($script:addresses | Where-Object IPAddress -eq '192.168.1.2').PrefixLength = 16
    $failed = $false
    try { Invoke-ProbeAddressChange -Adapter $script:adapter -Remove } catch { $failed = $true }
    Assert ($failed -and $script:removed.Count -eq 0) 'a modified probe prefix prevents deletion of the entire removal set'

    Reset-Mock -Addresses @((New-MockAddress '10.0.0.2'))
    $failed = $false
    try { Invoke-ProbeAddressChange -Adapter $script:adapter } catch { $failed = $true }
    Assert ($failed -and $script:nextNew -eq 0) 'mixed DHCP and manual addresses are preserved without network writes'
    Write-Output "SUMMARY pass=$script:pass fail=0 (all network cmdlets mocked)"
} finally {
    $resolved = [IO.Path]::GetFullPath($script:testRoot)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($resolved) -notmatch '^openwrt-net-diagnose-test-[0-9a-f]{32}$') {
        throw 'Refusing to clean an unexpected test directory.'
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
