<#
.SYNOPSIS
    Archives a completed round of conduct-deep-reviewing-loop into the external trace vault.
.DESCRIPTION
    Zero-parse, atomic round archival:
    - Moves reports/, host/trace/, and sandbox/ to /tmp/deep-review-trace-<short_title>/round-<NN>/.
    - Copies host/State.md and host/Analyzation.md to vault, then purges Analyzation.md from workspace.
    - Snapshots target DAs (file or directory) to da-snapshot/ and copies *.bak.md to da-pre-mutation/.
    - Automatically purges *.bak.md from workspace unless -Pause is specified.
.PARAMETER ReviewDir
    Path to the review workspace directory (e.g. .scratch/deep-review-08-react-migration).
.PARAMETER Target
    Path to the target Directive Artifact file or directory (e.g. docs/specs/08-react-migration or docs/plan.md).
.PARAMETER Round
    Integer round number being archived (e.g. 1, 53).
.PARAMETER VaultDir
    Optional override for the trace vault directory path.
.PARAMETER Pause
    Switch to preserve *.bak.md files on disk (when !PA / !WA is active).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ReviewDir,

    [Parameter(Mandatory = $true)]
    [string]$Target,

    [Parameter(Mandatory = $true)]
    [int]$Round,

    [string]$VaultDir,

    [switch]$Pause
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -Path $ReviewDir -PathType Container)) {
    throw "Review directory does not exist: $ReviewDir"
}
$resolvedReviewDir = (Resolve-Path -Path $ReviewDir).Path

if (-not (Test-Path -Path $Target)) {
    throw "Target DA does not exist: $Target"
}
$resolvedTarget = (Resolve-Path -Path $Target).Path

# 1. Determine Vault Base
$leaf = Split-Path $resolvedReviewDir -Leaf
$vaultName = $leaf -replace '^deep-review-', 'deep-review-trace-'
if ([string]::IsNullOrWhiteSpace($VaultDir)) {
    $VaultDir = "/tmp/$vaultName"
}
$resolvedVaultDir = [System.IO.Path]::GetFullPath($VaultDir)

# Guard against empty path or filesystem root (e.g. D:\ or /)
$vaultRoot = [System.IO.Path]::GetPathRoot($resolvedVaultDir)
if ($resolvedVaultDir -eq $vaultRoot -or [string]::IsNullOrWhiteSpace($resolvedVaultDir)) {
    throw "Vault directory cannot be empty or a filesystem root: $resolvedVaultDir"
}

$roundStr = if ($Round -lt 10) { "round-0$Round" } else { "round-$Round" }
$base = Join-Path $resolvedVaultDir $roundStr

$baseRoot = [System.IO.Path]::GetPathRoot($base)
if ($base -eq $baseRoot -or [string]::IsNullOrWhiteSpace($base)) {
    throw "Target archival base cannot be empty or a filesystem root: $base"
}

# 2. Create vault subdirectories
$reportsFinalDir = Join-Path $base "reports-final"
$negotiationTraceDir = Join-Path $base "negotiation-trace"
$sandboxDir = Join-Path $base "sandbox"
$daSnapshotDir = Join-Path $base "da-snapshot"
$daPreMutationDir = Join-Path $base "da-pre-mutation"

New-Item -ItemType Directory -Force -Path $base | Out-Null
New-Item -ItemType Directory -Force -Path $reportsFinalDir | Out-Null
New-Item -ItemType Directory -Force -Path $negotiationTraceDir | Out-Null
New-Item -ItemType Directory -Force -Path $sandboxDir | Out-Null
New-Item -ItemType Directory -Force -Path $daSnapshotDir | Out-Null
New-Item -ItemType Directory -Force -Path $daPreMutationDir | Out-Null

# 3. Round 1 Rationale copy
$rationaleSrc = Join-Path $resolvedReviewDir "host\Reviewer_Choice_Rationale.md"
if ($Round -eq 1 -and (Test-Path $rationaleSrc)) {
    $initialContextDir = Join-Path $resolvedVaultDir "00-initial-context"
    New-Item -ItemType Directory -Force -Path $initialContextDir | Out-Null
    Copy-Item -Path $rationaleSrc -Destination (Join-Path $initialContextDir "Reviewer_Choice_Rationale.md") -Force
}

# 4. Copy State.md and Analyzation.md
$stateSrc = Join-Path $resolvedReviewDir "host\State.md"
if (Test-Path $stateSrc) {
    Copy-Item -Path $stateSrc -Destination $base -Force
}
$analyzationSrc = Join-Path $resolvedReviewDir "host\Analyzation.md"
if (Test-Path $analyzationSrc) {
    Copy-Item -Path $analyzationSrc -Destination $base -Force
}

# 5. Move reports, trace, sandbox
$reportsSrc = Join-Path $resolvedReviewDir "reports"
if (Test-Path $reportsSrc) {
    Get-ChildItem -Path $reportsSrc | Move-Item -Destination $reportsFinalDir -Force
}
$traceSrc = Join-Path $resolvedReviewDir "host\trace"
if (Test-Path $traceSrc) {
    Get-ChildItem -Path $traceSrc | Move-Item -Destination $negotiationTraceDir -Force
}
$sandboxSrc = Join-Path $resolvedReviewDir "sandbox"
if (Test-Path $sandboxSrc) {
    Get-ChildItem -Path $sandboxSrc | Move-Item -Destination $sandboxDir -Force
}

# 6. Snapshot Target DAs and handle .bak.md
$allBakFiles = @()

# Context.bak.md if WBS restructured
$contextBak = Join-Path $resolvedReviewDir "Context.bak.md"
$contextFile = Join-Path $resolvedReviewDir "Context.md"
if (Test-Path $contextBak) {
    if (Test-Path $contextFile) {
        Copy-Item -Path $contextFile -Destination $daSnapshotDir -Force
    }
    Copy-Item -Path $contextBak -Destination $daPreMutationDir -Force
    $allBakFiles += (Get-Item $contextBak)
}

if (Test-Path $resolvedTarget -PathType Container) {
    # Directory target: copy all *.md except *.bak.md
    Get-ChildItem -Path $resolvedTarget -Filter "*.md" -Exclude "*.bak.md" -Recurse | ForEach-Object {
        $relPath = [System.IO.Path]::GetRelativePath($resolvedTarget, $_.FullName)
        $destPath = Join-Path $daSnapshotDir $relPath
        $destDir = Split-Path $destPath -Parent
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
        Copy-Item -Path $_.FullName -Destination $destPath -Force
    }
    # Collect and copy all *.bak.md
    Get-ChildItem -Path $resolvedTarget -Filter "*.bak.md" -Recurse | ForEach-Object {
        $allBakFiles += $_
        Copy-Item -Path $_.FullName -Destination $daPreMutationDir -Force
    }
} else {
    # Single file target
    Copy-Item -Path $resolvedTarget -Destination $daSnapshotDir -Force
    $parentDir = Split-Path $resolvedTarget -Parent
    $stem = [System.IO.Path]::GetFileNameWithoutExtension($resolvedTarget)
    $siblingBaks = Get-ChildItem -Path $parentDir -Filter "$stem*.bak.md"
    foreach ($bak in $siblingBaks) {
        $allBakFiles += $bak
        Copy-Item -Path $bak.FullName -Destination $daPreMutationDir -Force
    }
}

# 7. Cleanup *.bak.md unless -Pause is set
if (-not $Pause) {
    foreach ($bak in $allBakFiles) {
        if (Test-Path $bak.FullName) {
            Remove-Item -Path $bak.FullName -Force
        }
    }
}

# 8. Purge host/Analyzation.md
if (Test-Path $analyzationSrc) {
    Remove-Item -Path $analyzationSrc -Force
}

Write-Host "[OK] Archived Round $Round to $base" -ForegroundColor Green
