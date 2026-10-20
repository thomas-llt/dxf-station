@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0retirer-icone-dxf.ps1"
echo.
pause
