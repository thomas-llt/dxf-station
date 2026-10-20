# Attribue l'icône DXF Station aux fichiers .dxf, pour le compte Windows courant (sans droits administrateur).
$ErrorActionPreference = 'Stop'

function Refresh-Icons {
  Add-Type -Namespace DxfStation -Name Shell -MemberDefinition '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int wEventId, int uFlags, System.IntPtr dwItem1, System.IntPtr dwItem2);' -ErrorAction SilentlyContinue
  [DxfStation.Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
}
function Get-DxfProgId {
  $uc = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.dxf\UserChoice'
  if (Test-Path $uc) { $p = (Get-ItemProperty -Path $uc -ErrorAction SilentlyContinue).ProgId; if ($p) { return $p } }
  $ext = 'HKCU:\Software\Classes\.dxf'
  if (Test-Path $ext) { $p = (Get-Item $ext).GetValue(''); if ($p) { return $p } }
  return $null
}

try {
  $here = Split-Path -Parent $MyInvocation.MyCommand.Path
  $src = Join-Path $here 'dxf-file.ico'
  if (-not (Test-Path $src)) { throw "Le fichier dxf-file.ico doit être dans le même dossier que ce script." }

  # 1. Copie de l'icône dans un dossier fixe
  $dir = Join-Path $env:LOCALAPPDATA 'DXF-Station'
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $ico = Join-Path $dir 'dxf-file.ico'
  Copy-Item $src $ico -Force

  # 2. Programme associé aux fichiers .dxf
  $progId = Get-DxfProgId
  if (-not $progId) {
    $progId = 'DXFStation.dxf'
    $ext = 'HKCU:\Software\Classes\.dxf'
    if (-not (Test-Path $ext)) { New-Item -Path $ext -Force | Out-Null }
    Set-Item -Path $ext -Value $progId
  }

  # 3. Sauvegarde de l'icône actuelle (pour pouvoir revenir en arrière), puis remplacement
  $key = "HKCU:\Software\Classes\$progId\DefaultIcon"
  $backup = Join-Path $dir 'sauvegarde.txt'
  if (-not (Test-Path $backup)) {
    $old = ''; $existed = 0
    if (Test-Path $key) { $existed = 1; $old = (Get-Item $key).GetValue('') }
    "$progId`n$existed`n$old" | Set-Content -Path $backup -Encoding UTF8
  }
  if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
  Set-Item -Path $key -Value ('"' + $ico + '",0')

  # 4. Rafraîchissement de l'explorateur
  Refresh-Icons
  Write-Host ""
  Write-Host "Icône installée pour les fichiers .dxf (programme : $progId)." -ForegroundColor Green
  Write-Host "Si l'ancienne icône reste affichée, ferme et rouvre l'explorateur de fichiers, ou redémarre le PC."
} catch {
  Write-Host ""
  Write-Host "Erreur : $($_.Exception.Message)" -ForegroundColor Red
}
