@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

title Arkham Horror LCG
if /I "%~1"=="--syntax-check" exit /b 0

echo.
echo   ============================================
echo     Arkham Horror LCG - Windows Local Launcher
echo   ============================================
echo.

REM This helper lives in support; resolve the package root independently of cwd.
for %%I in ("%~dp0..") do set "PACKAGE_ROOT=%%~fI"
set "RUNTIME_ENV=!PACKAGE_ROOT!\config\runtime.env"
set "INSTALLER=!PACKAGE_ROOT!\runtime\install.bat"
set "WSL_PROBE_LOG=!TEMP!\arkham-wsl-probe-!RANDOM!-!RANDOM!.log"
set "WSL_DISTRO="

call :RESOLVE_WSL_DISTRO
if not defined WSL_DISTRO (
    echo [*] No compatible WSL distribution started on the first attempt.
    echo [*] Shutting down WSL once and retrying...
    wsl --shutdown >nul 2>&1
    timeout /t 2 /nobreak >nul
    call :RESOLVE_WSL_DISTRO
)
if not defined WSL_DISTRO (
    call :RUN_INSTALLER
    if !ERRORLEVEL! neq 0 exit /b !ERRORLEVEL!
    call :RESOLVE_WSL_DISTRO
)
if not defined WSL_DISTRO goto :NO_RUNTIME

:FOUND_DISTRO
echo [*] Using distribution: !WSL_DISTRO!
echo.
call :SAVE_RUNTIME_SELECTION
if exist "!WSL_PROBE_LOG!" del /q "!WSL_PROBE_LOG!" >nul 2>&1

REM ---- 2.5. Ensure the arkham user exists (PostgreSQL does not allow root) ----
wsl -d !WSL_DISTRO! -u root -- id arkham >nul 2>&1
if !ERRORLEVEL! equ 0 goto :HASUSER
echo [*] Creating arkham user...
wsl -d !WSL_DISTRO! -u root -- useradd -m -s /bin/bash arkham
wsl -d !WSL_DISTRO! -u root -- id arkham >nul 2>&1
if !ERRORLEVEL! neq 0 goto :USER_FAILED
echo [*] arkham user created
goto :HASUSER

:USER_FAILED
echo.
echo [^!] Failed to create the arkham user. Please run manually:
echo     wsl -d !WSL_DISTRO! -u root -- useradd -m -s /bin/bash arkham
echo.
pause
exit /b 1

:HASUSER
REM ---- 3. Get the WSL path for the current directory ----
set "WIN_DIR=!PACKAGE_ROOT!"

for /f "tokens=*" %%i in ('wsl -d !WSL_DISTRO! wslpath -u "!WIN_DIR!" 2^>nul') do set "WSL_DIR=%%i"
if "!WSL_DIR!"=="" call :FALLBACK_WSL_PATH
if "!WSL_DIR!"=="" goto :PATH_FAILED
goto :PATH_OK

:PATH_FAILED
echo.
echo [^!] WSL path conversion failed. The path may contain special characters.
echo     Please move the folder to a path without special characters (for example, C:\ArkhamHorror\).
echo.
pause
exit /b 1

:PATH_OK
echo [*] Package path: !WIN_DIR!
echo [*] WSL path:    !WSL_DIR!
echo.
wsl -d !WSL_DISTRO! -- test -f "!WSL_DIR!/game/start.sh" >nul 2>&1
if !ERRORLEVEL! neq 0 goto :PATH_NOT_MOUNTED
if /I "%~1"=="--path-check" exit /b 0

REM ---- 4. Start services ----
echo [*] Starting Arkham Horror LCG ...
echo.
wsl -d !WSL_DISTRO! -u arkham -- bash "!WSL_DIR!/game/start.sh"
set START_EXIT=!ERRORLEVEL!

if !START_EXIT! equ 10 goto :ALREADY_RUNNING
if !START_EXIT! equ 0 goto :START_OK
goto :START_RETRY

REM ---- 5. Startup failed: retry after restart ----
:START_RETRY
echo.
echo [WARN] Startup failed (exit code: !START_EXIT!). Restarting !WSL_DISTRO! and retrying...
echo.
wsl -d !WSL_DISTRO! -u arkham -- bash "!WSL_DIR!/game/start.sh" --stop 2>nul
wsl --terminate !WSL_DISTRO! >nul 2>nul
timeout /t 2 /nobreak >nul
echo [*] Starting services again...
echo.
wsl -d !WSL_DISTRO! -u arkham -- bash "!WSL_DIR!/game/start.sh"
set START_EXIT=!ERRORLEVEL!
if !START_EXIT! equ 10 goto :ALREADY_RUNNING
if !START_EXIT! equ 0 goto :START_OK

echo.
echo [WARN] It still failed after restart (exit code: !START_EXIT!). Please check the error messages above.
echo.
wsl -d !WSL_DISTRO! -u arkham -- bash "!WSL_DIR!/game/start.sh" --stop 2>nul
goto :END

:START_OK
echo.
call :OPEN_BROWSER
goto :END

:ALREADY_RUNNING
echo.
echo [*] Services are already running. Closing this window now.
echo.
goto :END_NO_PAUSE

:END
pause

:END_NO_PAUSE
exit /b !START_EXIT!

:RUN_INSTALLER
if not exist "!INSTALLER!" (
    echo.
    echo [^!] No usable WSL runtime was found.
    echo     This game-only package does not include the optional offline WSL installer.
    echo.
    call :SHOW_WSL_PROBE_ERROR
    echo [*] Moving this package between drive letters is supported. If drive C: is full,
    echo     WSL itself may be unable to start even when the package is on another drive.
    echo     Repair or move the existing WSL/Ubuntu runtime in Windows, then start again.
    echo.
    pause
    exit /b 1
)
if defined REGISTERED_WSL_FOUND (
    echo [WARN] Existing WSL distributions could not start. The bundled installer will
    echo        try a separate Arkham runtime on the package drive.
    call :SHOW_WSL_PROBE_ERROR
)
echo [*] Preparing local WSL runtime...
echo.
call "!INSTALLER!" --no-pause
set "INSTALL_EXIT=!ERRORLEVEL!"
if "!INSTALL_EXIT!"=="194" (
    echo.
    echo [*] Windows components were enabled. Please reboot Windows, then double-click this launcher again.
    echo.
    pause
    exit /b 0
)
if not "!INSTALL_EXIT!"=="0" (
    echo.
    echo [^!] Runtime installation failed. Exit code: !INSTALL_EXIT!
    echo.
    pause
    exit /b !INSTALL_EXIT!
)
exit /b 0

:NO_RUNTIME
echo.
echo [^!] No usable WSL runtime was found after installation.
echo     Run install.bat once, reboot if it asks, then start again.
echo.
call :SHOW_WSL_PROBE_ERROR
pause
exit /b 1

:RESOLVE_WSL_DISTRO
set "WSL_DISTRO="
set "CONFIGURED_DISTRO="
set "REGISTERED_WSL_FOUND="
where wsl >nul 2>&1
if !ERRORLEVEL! neq 0 exit /b 1

REM The PowerShell manager normalizes wsl.exe UTF-16 output, discovers renamed
REM/imported distributions, excludes Docker, and verifies bash compatibility.
if exist "!PACKAGE_ROOT!\arkham-manager.ps1" (
    for /f "usebackq delims=" %%D in (`powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "!PACKAGE_ROOT!\arkham-manager.ps1" -ResolveWslDistro 2^>nul`) do (
        if not defined WSL_DISTRO set "WSL_DISTRO=%%D"
    )
    if defined WSL_DISTRO (
        set "REGISTERED_WSL_FOUND=1"
        exit /b 0
    )
)

REM Legacy fallback in case only this BAT file was replaced.
if exist "!RUNTIME_ENV!" (
    for /f "tokens=1,2 delims==" %%a in ('findstr /R /C:"^ARKHAM_WSL_DISTRO=" "!RUNTIME_ENV!" 2^>nul') do set "CONFIGURED_DISTRO=%%b"
    if defined CONFIGURED_DISTRO (
        call :TRY_WSL_DISTRO "!CONFIGURED_DISTRO!"
        if defined WSL_DISTRO exit /b 0
        echo [*] Configured WSL distribution !CONFIGURED_DISTRO! is unavailable.
        echo [*] Looking for a renamed or moved registered distribution...
    )
)

for %%D in (ArkhamRuntime Ubuntu-24.04 Ubuntu Ubuntu-22.04 Ubuntu-20.04 Ubuntu-18.04) do (
    if not defined WSL_DISTRO (
        call :TRY_WSL_DISTRO "%%D"
    )
)
if defined WSL_DISTRO exit /b 0
exit /b 1

:TRY_WSL_DISTRO
wsl -d %~1 -- echo ok >"!WSL_PROBE_LOG!" 2>&1
if !ERRORLEVEL! equ 0 (
    set "WSL_DISTRO=%~1"
    set "REGISTERED_WSL_FOUND=1"
)
if defined WSL_DISTRO exit /b 0
exit /b 1

:SHOW_WSL_PROBE_ERROR
if not exist "!WSL_PROBE_LOG!" exit /b 0
for %%I in ("!WSL_PROBE_LOG!") do if %%~zI equ 0 exit /b 0
echo [*] Last WSL error:
type "!WSL_PROBE_LOG!"
echo.
exit /b 0

:SAVE_RUNTIME_SELECTION
if not exist "!PACKAGE_ROOT!\config" mkdir "!PACKAGE_ROOT!\config" >nul 2>&1
>"!RUNTIME_ENV!" echo # Arkham Horror LCG Windows runtime selection
>>"!RUNTIME_ENV!" echo ARKHAM_WSL_DISTRO=!WSL_DISTRO!
exit /b 0

:FALLBACK_WSL_PATH
set "DRIVE_LETTER=!WIN_DIR:~0,1!"
set "WSL_REST=!WIN_DIR:~2!"
set "WSL_REST=!WSL_REST:\=/!"
set "UPPER=ABCDEFGHIJKLMNOPQRSTUVWXYZ"
set "LOWER=abcdefghijklmnopqrstuvwxyz"
for /L %%n in (0,1,25) do (
    if /I "!DRIVE_LETTER!"=="!UPPER:~%%n,1!" set "DRIVE_LETTER=!LOWER:~%%n,1!"
)
set "WSL_DIR=/mnt/!DRIVE_LETTER!!WSL_REST!"
exit /b 0

:PATH_NOT_MOUNTED
echo.
echo [^!] The package path is not available inside WSL:
echo     Windows: !WIN_DIR!
echo     WSL:     !WSL_DIR!
echo.
echo     Confirm that the destination is a local fixed drive and that the whole
echo     package was moved together. Network paths and partially copied folders
echo     are not supported.
echo.
pause
exit /b 1

:OPEN_BROWSER
set "WEB_PORT=4000"
if exist "!PACKAGE_ROOT!\game\config\ports.env" (
    for /f "tokens=1,2 delims==" %%a in ('findstr /R /C:"^ARKHAM_PORT=" "!PACKAGE_ROOT!\game\config\ports.env" 2^>nul') do set "WEB_PORT=%%b"
)
set "WEB_PORT=!WEB_PORT: =!"
if "!WEB_PORT!"=="" set "WEB_PORT=4000"
set "OPEN_URL=http://127.0.0.1:!WEB_PORT!"
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://127.0.0.1:!WEB_PORT!/health'; if($r.StatusCode -eq 200){ exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if !ERRORLEVEL! neq 0 (
    set "LAN_READY="
    set "LAN_IP="
    set "LAN_PORT="
    if exist "!PACKAGE_ROOT!\game\config\lan.env" (
        for /f "tokens=1,* delims==" %%a in ('findstr /R /C:"^ARKHAM_LAN_READY=" /C:"^ARKHAM_LAN_IP=" /C:"^ARKHAM_LAN_PORT=" "!PACKAGE_ROOT!\game\config\lan.env" 2^>nul') do (
            if /I "%%a"=="ARKHAM_LAN_READY" set "LAN_READY=%%b"
            if /I "%%a"=="ARKHAM_LAN_IP" set "LAN_IP=%%b"
            if /I "%%a"=="ARKHAM_LAN_PORT" set "LAN_PORT=%%b"
        )
    )
    if "!LAN_READY!"=="1" if "!LAN_PORT!"=="!WEB_PORT!" if defined LAN_IP set "OPEN_URL=http://!LAN_IP!:!WEB_PORT!"
)
start "" "!OPEN_URL!" >nul 2>nul
echo [*] Local game URL: !OPEN_URL!
exit /b 0
