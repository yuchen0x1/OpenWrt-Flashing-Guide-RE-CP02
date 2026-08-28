param(
    [string]$AdapterName = "",
    [string]$ResultPath = ".\router-net-diagnose-result.txt",
    [switch]$ConfigureStaticIPs,
    [int]$TcpTimeoutMs = 1000
)

$ErrorActionPreference = "Stop"

function Add-Result {
    param([string]$Text)
    Add-Content -Path $ResultPath -Value $Text -Encoding UTF8
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

Set-Content -Path $ResultPath -Value "Started: $(Get-Date -Format o)" -Encoding UTF8

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

    if ($ConfigureStaticIPs) {
        if (-not $isAdmin) {
            Add-Result "Static IP configuration skipped: run PowerShell as Administrator."
        } else {
            $desiredAddresses = @("192.168.68.2", "192.168.1.2", "192.168.8.2")
            foreach ($ip in $desiredAddresses) {
                $existing = Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -IPAddress $ip -ErrorAction SilentlyContinue
                if ($null -eq $existing) {
                    New-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -IPAddress $ip -PrefixLength 24 -SkipAsSource $false | Out-Null
                    Add-Result "Added IPv4 address: $ip/24"
                } else {
                    Add-Result "IPv4 address already present: $ip/$($existing.PrefixLength)"
                }
            }
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
