$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $repoRoot 'build_output\win-unpacked'
$targetPrefix = ($targetDir.TrimEnd('\') + '\').ToLowerInvariant()

if (-not (Test-Path -LiteralPath $targetDir)) {
    Write-Host "No existing win-unpacked directory to clean."
    exit 0
}

$running = @(
    Get-CimInstance Win32_Process |
        Where-Object {
            $_.ExecutablePath -and $_.ExecutablePath.ToLowerInvariant().StartsWith($targetPrefix)
        }
)

if ($running.Count -gt 0) {
    foreach ($process in $running) {
        try {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
            Write-Host "Stopped locked build process PID=$($process.ProcessId)"
        } catch {
            Write-Warning "Could not stop PID=$($process.ProcessId): $($_.Exception.Message)"
        }
    }

    Start-Sleep -Milliseconds 500
}

if (Test-Path -LiteralPath $targetDir) {
    Remove-Item -LiteralPath $targetDir -Recurse -Force
    Write-Host "Removed $targetDir"
}
