# Puts a "Firelight" icon on the Windows desktop that opens the host control panel.
# Run once from the repo folder:  powershell -ExecutionPolicy Bypass -File tools\make-desktop-shortcut.ps1
$repo   = Split-Path -Parent $PSScriptRoot
$target = Join-Path $repo 'Firelight.cmd'
$icon   = Join-Path $repo 'server\firelight.ico'
$link   = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Firelight.lnk'
$shell  = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($link)
$s.TargetPath       = $target
$s.WorkingDirectory = $repo
$s.IconLocation     = "$icon,0"
$s.WindowStyle      = 7   # start the black helper window minimized; the panel opens in the browser
$s.Description      = 'Light the Firelight fire and invite people'
$s.Save()
Write-Host "Made $link"
