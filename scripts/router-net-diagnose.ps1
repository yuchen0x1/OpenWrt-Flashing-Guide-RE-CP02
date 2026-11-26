param(
    [string]$AdapterName = "",
    [string]$ResultPath = ".\router-net-diagnose-result.txt",
    [switch]$ConfigureStaticIPs,
    # Removes the probe addresses added by -ConfigureStaticIPs. Omitted by default, so the
    # existing behaviour is unchanged; -ConfigureStaticIPs and -RemoveStaticIPs are exclusive.
    [switch]$RemoveStaticIPs,
    [int]$TcpTimeoutMs = 1000
)

$ErrorActionPreference = "Stop"

function Add-Result {
    param([string]$Text)
    Add-Content -Path $ResultPath -Value $Text -Encoding UTF8
}

function Get-ProbeStatePath {
    param($Adapter)
    $id = ([guid]$Adapter.InterfaceGuid).ToString('D')
    $root = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'OpenWrt-Flashing-Guide-RE-CP02\net-diagnose'
    return Join-Path $root "$id.json"
}

function Save-ProbeState {
    param([string]$Path, $State)
    $directory = Split-Path -Parent $Path
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $temporary = "$Path.tmp"
    try {
        $State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temporary -Encoding UTF8
        Move-Item -LiteralPath $temporary -Destination $Path -Force
    } finally {
        if (Test-Path -LiteralPath $temporary) {
            Remove-Item -LiteralPath $temporary -Force
        }
    }
}

function Read-ProbeState {
    param([string]$Path, $Adapter)
    $state = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    $allowed = @('192.168.68.2', '192.168.1.2', '192.168.8.2')
    $id = ([guid]$Adapter.InterfaceGuid).ToString('D')
    if ($state.Schema -ne 1 -or $state.InterfaceGuid -ne $id -or
        $state.OriginalDhcp -notin @('Enabled', 'Disabled') -or
        $null -eq $state.PSObject.Properties['OriginalAddresses'] -or
        $null -eq $state.PSObject.Properties['AddedAddresses'] -or
        $null -eq $state.PSObject.Properties['PendingAddress']) {
        throw 'Invalid rollback record or network adapter mismatch; no addresses were removed.'
    }
    $tracked = @($state.AddedAddresses)
    if ($state.PendingAddress) { $tracked += $state.PendingAddress }
    foreach ($ip in $tracked) {
        if ($ip -notin $allowed -or $ip -in @($state.OriginalAddresses)) {
            throw 'Invalid probe address in rollback record; no addresses were removed.'
        }
    }
    return $state
}

function Invoke-ProbeAddressChange {
    param($Adapter, [switch]$Remove)
    $desired = @('192.168.68.2', '192.168.1.2', '192.168.8.2')
    $id = ([guid]$Adapter.InterfaceGuid).ToString('D')
    if ($id -eq [guid]::Empty.ToString('D')) { throw 'Cannot identify this network adapter safely; no changes were made.' }
    $path = Get-ProbeStatePath -Adapter $Adapter
    $mutex = [Threading.Mutex]::new($false, "Local\OpenWrtGuideNetDiagnose-$id")
    $locked = $false
    try {
        try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
        if (-not $locked) { throw 'Another probe address change is already running for this adapter.' }

        $current = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object { $_.InterfaceIndex -eq $Adapter.ifIndex })
        if ($Remove) {
            if (-not (Test-Path -LiteralPath $path)) {
                Add-Result 'No rollback record for this adapter; existing IPv4 addresses and DHCP were left unchanged.'
                return
            }
            $state = Read-ProbeState -Path $path -Adapter $Adapter
            $tracked = @($state.AddedAddresses)
            if ($state.PendingAddress) { $tracked += $state.PendingAddress }
            # Validate the whole removal set before touching any current address.
            foreach ($ip in $tracked) {
                $entry = @($current | Where-Object { $_.IPAddress -eq $ip })
                if ($entry | Where-Object { $_.PrefixLength -ne 24 -or [string]$_.PrefixOrigin -ne 'Manual' }) {
                    throw "Probe address $ip has changed since configuration; rollback record retained for manual review."
                }
            }
            foreach ($ip in ($tracked | Select-Object -Unique)) {
                if ($current | Where-Object { $_.IPAddress -eq $ip }) {
                    Remove-NetIPAddress -InterfaceIndex $Adapter.ifIndex -AddressFamily IPv4 -IPAddress $ip -Confirm:$false -ErrorAction Stop
                    Add-Result "Removed recorded probe IPv4 address: $ip/24"
                }
            }
            if ($state.OriginalDhcp -eq 'Enabled') {
                Set-NetIPInterface -InterfaceIndex $Adapter.ifIndex -AddressFamily IPv4 -Dhcp Enabled -ErrorAction Stop
                Add-Result 'Restored original DHCP setting: Enabled (lease acquisition may take a few seconds).'
            }
            Remove-Item -LiteralPath $path -Force
            Add-Result 'Rollback complete; pre-existing static IPv4 addresses were not removed.'
            return
        }

        if (Test-Path -LiteralPath $path) {
            Read-ProbeState -Path $path -Adapter $Adapter | Out-Null
            Add-Result 'An existing rollback record was preserved; run -RemoveStaticIPs before configuring again.'
            return
        }
        $missing = @($desired | Where-Object { $_ -notin @($current.IPAddress) })
        if ($missing.Count -eq 0) {
            Add-Result 'All probe IPv4 addresses already exist; no addresses or DHCP settings were changed.'
            return
        }
        $ipInterface = Get-NetIPInterface -InterfaceIndex $Adapter.ifIndex -AddressFamily IPv4 -ErrorAction Stop |
            Select-Object -First 1
        $dhcp = [string]$ipInterface.Dhcp
        if ($dhcp -notin @('Enabled', 'Disabled')) { throw 'Cannot determine the original DHCP setting; configuration aborted.' }
        if ($dhcp -eq 'Enabled' -and ($current | Where-Object { [string]$_.PrefixOrigin -eq 'Manual' })) {
            throw 'This adapter mixes DHCP and manual IPv4 addresses; automatic probe configuration was skipped to preserve that setup.'
        }
        $state = [pscustomobject]@{
            Schema = 1
            InterfaceGuid = $id
            OriginalDhcp = $dhcp
            OriginalAddresses = @($current.IPAddress)
            AddedAddresses = @()
            PendingAddress = $null
        }
        Save-ProbeState -Path $path -State $state
        foreach ($ip in $missing) {
            # Persist the pending operation so an interrupted command remains reversible.
            $state.PendingAddress = $ip
            Save-ProbeState -Path $path -State $state
            New-NetIPAddress -InterfaceIndex $Adapter.ifIndex -AddressFamily IPv4 -IPAddress $ip -PrefixLength 24 -SkipAsSource $false -ErrorAction Stop | Out-Null
            $state.AddedAddresses = @($state.AddedAddresses) + $ip
            $state.PendingAddress = $null
            Save-ProbeState -Path $path -State $state
            Add-Result "Added IPv4 address: $ip/24"
        }
        Add-Result "Rollback: re-run with -AdapterName '$($Adapter.Name)' -RemoveStaticIPs. Record: $path"
        if ($dhcp -eq 'Enabled') {
            Add-Result 'DHCP is temporarily disabled while probe addresses are in use; -RemoveStaticIPs restores it.'
        }
    } catch {
        if (-not $Remove -and (Test-Path -LiteralPath $path)) {
            Add-Result "Configuration incomplete; rollback record retained at $path. Re-run with -AdapterName '$($Adapter.Name)' -RemoveStaticIPs."
        }
        throw
    } finally {
        if ($locked) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}

function Test-TcpPort {
    param(
        [string]$HostName,
        [int]$Port,
        [int]$TimeoutMs
    )

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect($HostName, $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
            return $false
        }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

try {
    Set-Content -Path $ResultPath -Value "Started: $(Get-Date -Format o)" -Encoding UTF8
} catch {
    Write-Host "Cannot write result file '$ResultPath': $($_.Exception.Message)"
    exit 2
}

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    Add-Result "IsAdmin: $isAdmin"

    if ($AdapterName -ne "") {
        $adapter = Get-NetAdapter -Name $AdapterName -ErrorAction Stop | Select-Object -First 1
    } else {
        $adapter = Get-NetAdapter |
            Where-Object {
                $_.Status -eq "Up" -and
                $_.Name -notmatch "vEthernet|Virtual|Loopback|Bluetooth|Wi-Fi|WLAN|VPN|TAP|TUN" -and
                $_.InterfaceDescription -notmatch "Virtual|Hyper-V|VMware|VirtualBox|VPN|TAP|TUN|Bluetooth|Wireless|Wi-Fi|WLAN"
            } |
            Select-Object -First 1
    }

    if ($null -eq $adapter) {
        throw "No active wired adapter found. Pass -AdapterName with your Ethernet adapter name."
    }

    Add-Result "Adapter: Name=$($adapter.Name); ifIndex=$($adapter.ifIndex); Status=$($adapter.Status); LinkSpeed=$($adapter.LinkSpeed)"

    if ($ConfigureStaticIPs -and $RemoveStaticIPs) {
        Add-Result "Static IP change skipped: -ConfigureStaticIPs and -RemoveStaticIPs are mutually exclusive."
    } elseif ($ConfigureStaticIPs) {
        if (-not $isAdmin) {
            Add-Result "Static IP configuration skipped: run PowerShell as Administrator."
        } else {
            Invoke-ProbeAddressChange -Adapter $adapter
        }
    } elseif ($RemoveStaticIPs) {
        if (-not $isAdmin) {
            Add-Result "Static IP removal skipped: run PowerShell as Administrator."
        } else {
            Invoke-ProbeAddressChange -Adapter $adapter -Remove
        }
    }

    Add-Result ""
    Add-Result "Current wired IPv4 addresses:"
    Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 |
        Sort-Object IPAddress |
        Format-Table -Auto IPAddress,PrefixLength,AddressState,PrefixOrigin |
        Out-String |
        Add-Content -Path $ResultPath -Encoding UTF8

    $targets = @(
        @{ Label = "Stock or U-Boot Recovery"; Host = "192.168.68.1"; Ports = @(80, 22, 23) },
        @{ Label = "OpenWrt default"; Host = "192.168.1.1"; Ports = @(80, 22) },
        @{ Label = "OpenWrt custom LAN"; Host = "192.168.8.1"; Ports = @(80, 22, 2017) }
    )

    foreach ($target in $targets) {
        Add-Result ""
        Add-Result "Target: $($target.Label) $($target.Host)"
        $ping = Test-Connection -ComputerName $target.Host -Count 2 -Quiet -ErrorAction SilentlyContinue
        Add-Result "Ping: $ping"

        foreach ($port in $target.Ports) {
            $open = Test-TcpPort -HostName $target.Host -Port $port -TimeoutMs $TcpTimeoutMs
            Add-Result "TCP ${port}: $open"
        }
    }

    Add-Result ""
    Add-Result "ARP table:"
    arp -a | Out-String | Add-Content -Path $ResultPath -Encoding UTF8
} catch {
    Add-Result "Fatal error: $($_.Exception.Message)"
    Add-Result "Finished: $(Get-Date -Format o)"
    exit 1
}

Add-Result "Finished: $(Get-Date -Format o)"
