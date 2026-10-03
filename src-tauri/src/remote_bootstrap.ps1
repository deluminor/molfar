$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$base = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.vatra-host'
$legacyBase = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.monocode-host'
$version = @@VERSION@@
$release = @@RELEASE@@
$forceUpgrade = $env:VATRA_HOST_FORCE_UPGRADE -eq '1'
$hostPort = if ($env:VATRA_HOST_PORT) { [int] $env:VATRA_HOST_PORT } else { 3774 }
@@ACL@@

function Download-Vatra([string] $Url, [string] $Destination) {
  Add-Type -AssemblyName System.Net.Http
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $handler = New-Object Net.Http.HttpClientHandler
  $handler.AllowAutoRedirect = $false
  $client = New-Object Net.Http.HttpClient($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(180)
  try {
    $uri = [Uri] $Url
    for ($i = 0; $i -lt 10; $i++) {
      if ($uri.Scheme -ne 'https') { throw 'Host downloads require HTTPS.' }
      $response = $client.GetAsync($uri).GetAwaiter().GetResult()
      try {
        if ([int]$response.StatusCode -ge 300 -and [int]$response.StatusCode -lt 400) {
          if ($null -eq $response.Headers.Location) { throw 'Missing download redirect.' }
          $uri = New-Object Uri($uri, $response.Headers.Location)
          continue
        }
        $null = $response.EnsureSuccessStatusCode()
        [IO.File]::WriteAllBytes($Destination, $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult())
        return
      } finally { $response.Dispose() }
    }
    throw 'Too many download redirects.'
  } finally { $client.Dispose(); $handler.Dispose() }
}

# A MonoCode-era host serves the same port from .monocode-host. Retire it
# once: stop its task so the ports never clash, and carry its state over so
# paired devices, the environment ID and remote sessions keep working. The
# legacy directory itself is never modified.
$migration = @{ RetiredNow = $false; Copied = New-Object Collections.ArrayList; Port = $hostPort }
function Invoke-LegacyHost([string[]] $Arguments) {
  $runtime = [IO.File]::ReadAllText((Join-Path $legacyBase 'runtime-path')).Trim()
  & (Join-Path $runtime 'node.exe') (Join-Path $runtime 'host.mjs') @Arguments | Out-Null
  return $LASTEXITCODE
}
function Test-LegacyHostRunning {
  try { return (Invoke-LegacyHost @('connection-info')) -eq 0 } catch { return $false }
}
# Restoring on the default port would orphan devices paired to the old one.
function Get-LegacyHostPort {
  try {
    $runtime = [IO.File]::ReadAllText((Join-Path $legacyBase 'runtime-path')).Trim()
    $info = & (Join-Path $runtime 'node.exe') (Join-Path $runtime 'host.mjs') connection-info
    if ($LASTEXITCODE -eq 0) {
      $port = 0
      $reported = [string] ($info | Out-String | ConvertFrom-Json).port
      if ([int]::TryParse($reported, [ref] $port) -and $port -ge 1 -and $port -le 65535) { return $port }
    }
  } catch { }
  return $hostPort
}
function Retire-LegacyHost {
  if (-not (Test-Path -LiteralPath (Join-Path $legacyBase 'runtime-path'))) { return }
  if (Test-Path -LiteralPath (Join-Path $base 'legacy-retired')) { return }

  $migration.Port = Get-LegacyHostPort
  try { $null = Invoke-LegacyHost @('service', 'uninstall') } catch { }
  if (Test-LegacyHostRunning) {
    try { $null = Invoke-LegacyHost @('stop') } catch { }
  }
  if (Test-LegacyHostRunning) {
    try { $null = Invoke-LegacyHost @('service', 'install', '--port', [string] $migration.Port) } catch { }
    throw 'The previous MonoCode host in .monocode-host could not be stopped. Stop it, then reconnect.'
  }
  $migration.RetiredNow = $true

  if (-not (Test-Path -LiteralPath (Join-Path $base 'host.db')) -and (Test-Path -LiteralPath (Join-Path $legacyBase 'host.db'))) {
    $stage = Join-Path $base ('.legacy-copy-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage | Out-Null
    try {
      foreach ($name in @('host.db', 'host.db-wal', 'host.db-shm', 'attachments')) {
        $source = Join-Path $legacyBase $name
        if (Test-Path -LiteralPath $source) {
          Copy-Item -LiteralPath $source -Destination (Join-Path $stage $name) -Recurse
        }
      }
      # Sidecars left by an interrupted run belong to an older database;
      # SQLite would replay them onto the fresh copy.
      foreach ($name in @('host.db-wal', 'host.db-shm')) {
        $stale = Join-Path $base $name
        if (Test-Path -LiteralPath $stale) { Remove-Item -LiteralPath $stale -Force }
      }
      # The database is moved last: its presence marks a finished copy.
      foreach ($name in @('host.db-wal', 'host.db-shm', 'attachments', 'host.db')) {
        $staged = Join-Path $stage $name
        $target = Join-Path $base $name
        if ((Test-Path -LiteralPath $staged) -and -not (Test-Path -LiteralPath $target)) {
          Move-Item -LiteralPath $staged -Destination $target
          $null = $migration.Copied.Add($name)
        }
      }
    } catch {
      Restore-LegacyHost
      throw "Could not copy the MonoCode host state; the previous host was restored. $($_.Exception.Message)"
    } finally {
      Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  [IO.File]::WriteAllText((Join-Path $base 'legacy-retired'), '')
}
# Puts the legacy host back when the new one cannot start, so a failed upgrade
# never leaves the machine without a host. Only files copied by this run go.
function Restore-LegacyHost {
  if (-not $migration.RetiredNow) { return }
  foreach ($name in $migration.Copied) {
    Remove-Item -LiteralPath (Join-Path $base $name) -Recurse -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath (Join-Path $base 'legacy-retired') -Force -ErrorAction SilentlyContinue
  try { $null = Invoke-LegacyHost @('service', 'install', '--port', [string] $migration.Port) } catch { }
}

New-Item -ItemType Directory -Force -Path $base | Out-Null
Protect-VatraDirectory $base
$lock = $null
$temporary = $null
try {
  # File sharing locks serialize separate SSH logons, too.
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    try {
      $lock = [IO.File]::Open((Join-Path $base 'install.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
      break
    } catch [IO.IOException] { Start-Sleep -Milliseconds 250 }
  }
  if ($null -eq $lock) { throw 'Another host installation is running. Try again shortly.' }
  $pointer = Join-Path $base 'runtime-path'
  $existed = Test-Path -LiteralPath $pointer
  if (-not $existed -or $forceUpgrade) {
    $arch = $env:PROCESSOR_ARCHITEW6432
    if (-not $arch) { $arch = $env:PROCESSOR_ARCHITECTURE }
    switch ($arch.ToUpperInvariant()) {
      'AMD64' { $target = 'win32-x64' }
      'ARM64' { $target = 'win32-arm64' }
      default { throw 'Vatra Host requires x64 or ARM64 Windows.' }
    }
    $filename = "vatra-host-$target.zip"
    $runtimeRoot = Join-Path $base 'runtime'
    New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
    $temporary = Join-Path $runtimeRoot ('.install-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temporary | Out-Null
    $archive = Join-Path $temporary $filename
    $checksum = Join-Path $temporary 'checksum'
    try {
      Download-Vatra "$release/$filename" $archive
      Download-Vatra "$release/$filename.sha256" $checksum
    } catch { throw "The Windows host package for version $version could not be downloaded. Install a release with host packages. $($_.Exception.Message)" }
    $expected = ((Get-Content -LiteralPath $checksum -Raw).Trim() -split '\s+')[0]
    if ($expected -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid host package checksum.' }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) { throw 'Vatra Host package checksum mismatch.' }
    $unpacked = Join-Path $temporary 'unpacked'
    Expand-Archive -LiteralPath $archive -DestinationPath $unpacked
    $actual = & (Join-Path $unpacked 'node.exe') (Join-Path $unpacked 'host.mjs') --version
    if ($LASTEXITCODE -ne 0 -or $actual -ne $version) { throw 'Vatra Host version mismatch.' }
    $runtime = Join-Path $runtimeRoot ("$version-$target-" + [Guid]::NewGuid().ToString('N'))
    Move-Item -LiteralPath $unpacked -Destination $runtime
    $bin = Join-Path $base 'bin'
    New-Item -ItemType Directory -Force -Path $bin | Out-Null
    $runtimeName = Split-Path -Leaf $runtime
    # Keep the batch file ASCII; cmd's set /p would misread a UTF-8 profile path.
    $launcher = "@echo off`r`nsetlocal DisableDelayedExpansion`r`n`"%~dp0..\runtime\$runtimeName\node.exe`" `"%~dp0..\runtime\$runtimeName\host.mjs`" %*`r`nexit /b %errorlevel%`r`n"
    [IO.File]::WriteAllText((Join-Path $bin 'vatra-host.cmd'), $launcher, [Text.Encoding]::ASCII)
    $nextPointer = Join-Path $temporary 'runtime-path'
    [IO.File]::WriteAllText($nextPointer, $runtime, (New-Object Text.UTF8Encoding($false)))
    if (Test-Path -LiteralPath $pointer) {
      # Windows PowerShell coerces $null to an empty backup path here, which
      # .NET Framework rejects. Keep the previous pointer in this temporary
      # directory; the install's finally block removes it after replacement.
      [IO.File]::Replace($nextPointer, $pointer, (Join-Path $temporary 'previous-runtime-path'))
    } else {
      [IO.File]::Move($nextPointer, $pointer)
    }
  }
  $runtime = [IO.File]::ReadAllText($pointer).Trim()
  $node = Join-Path $runtime 'node.exe'
  $entry = Join-Path $runtime 'host.mjs'
  if ($existed -and $forceUpgrade) {
    & $node $entry service uninstall | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not stop the old host service.' }
  }
  Retire-LegacyHost
  & $node $entry service install --port $hostPort | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Restore-LegacyHost
    throw 'Host service setup failed. Check the error above and sign in to the Windows desktop as the SSH user.'
  }
  & $node $entry connection-info
  if ($LASTEXITCODE -ne 0) { throw 'The host did not report a connection.' }
} finally {
  if ($null -ne $lock) { $lock.Dispose() }
  if ($temporary -and (Test-Path -LiteralPath $temporary)) { Remove-Item -LiteralPath $temporary -Recurse -Force }
}
