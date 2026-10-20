# Retire l'icône DXF Station des fichiers .dxf et remet l'icône d'origine.
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
  $dir = Join-Path $env:LOCALAPPDATA 'DXF-Station'
  $backup = Join-Path $dir 'sauvegarde.txt'
  if (-not (Test-Path $backup)) { throw "Aucune installation de l'icône trouvée sur ce compte." }
  $lines = Get-Content -Path $backup -Encoding UTF8
  $progId = $lines[0]; $existed = $lines[1]; $old = if ($lines.Count -gt 2) { ($lines[2..($lines.Count - 1)] -join "`n") } else { '' }
  $key = "HKCU:\Software\Classes\$progId\DefaultIcon"
  if ($existed -eq '1') { if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }; Set-Item -Path $key -Value $old }
  elseif (Test-Path $key) { Remove-Item -Path $key -Recurse }
  if ($progId -eq 'DXFStation.dxf') {
    $ext = 'HKCU:\Software\Classes\.dxf'
    if ((Test-Path $ext) -and ((Get-Item $ext).GetValue('') -eq 'DXFStation.dxf')) { Set-Item -Path $ext -Value '' }
    if (Test-Path 'HKCU:\Software\Classes\DXFStation.dxf') { Remove-Item -Path 'HKCU:\Software\Classes\DXFStation.dxf' -Recurse }
  }
  Remove-Item -Path $dir -Recurse -Force
  Refresh-Icons
  Write-Host ""
  Write-Host "Icône retirée : les fichiers .dxf ont retrouvé leur icône d'origine." -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "Erreur : $($_.Exception.Message)" -ForegroundColor Red
}
