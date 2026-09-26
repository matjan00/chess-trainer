# Daily backup of the chess trainer project.
#  1. Saves a git snapshot of any uncommitted changes (the "main" copy only).
#  2. Writes the whole history (every branch) as one .bundle file into OneDrive,
#     so there is a copy off this PC. Keeps the newest 14 bundles.
# Restore from a bundle:  git clone <file>.bundle chess-trainer-restored
$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
$dest = Join-Path $env:OneDrive 'Backups\chess-trainer'
if (-not $env:OneDrive) { $dest = Join-Path $env:USERPROFILE 'Documents\chess-trainer-backups' }
New-Item -ItemType Directory -Force $dest | Out-Null
$log = Join-Path $dest 'backup.log'
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'

try {
    Set-Location $repo
    $busy = (Test-Path .git\MERGE_HEAD) -or (Test-Path .git\rebase-merge) -or (Test-Path .git\rebase-apply)
    if (-not $busy -and (git status --porcelain)) {
        git add -A
        git commit -q -m "Automatic daily snapshot $stamp"
    }
    $file = Join-Path $dest "chess-trainer-$stamp.bundle"
    git bundle create $file --all 2>$null
    Get-ChildItem $dest -Filter 'chess-trainer-*.bundle' | Sort-Object Name -Descending | Select-Object -Skip 14 | Remove-Item -Force
    Add-Content $log "$stamp OK  $(Split-Path $file -Leaf)  $([math]::Round((Get-Item $file).Length / 1MB, 1)) MB"
} catch {
    Add-Content $log "$stamp FAILED  $_"
    exit 1
}
