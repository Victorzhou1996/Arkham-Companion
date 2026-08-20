@echo off
setlocal

title Arkham Horror LCG - Management Tool

powershell -NoLogo -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0arkham-manager.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo [!] Management tool failed with exit code: %EXIT_CODE%
    echo.
    pause
)

exit /b %EXIT_CODE%
