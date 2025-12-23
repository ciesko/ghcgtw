@echo off
REM Build script for Windows

echo Cleaning previous build...
if exist dist rmdir /s /q dist
mkdir dist

cd ghcgtw

echo Cleaning extension build artifacts...
if exist out rmdir /s /q out
if exist node_modules rmdir /s /q node_modules
del /q *.vsix 2>nul

echo Installing dependencies...
call npm install
if %errorlevel% neq 0 exit /b %errorlevel%

echo Compiling TypeScript...
call npm run compile
if %errorlevel% neq 0 exit /b %errorlevel%

echo Packaging extension...
call npx @vscode/vsce package --out ../dist/
if %errorlevel% neq 0 exit /b %errorlevel%

cd ..

for /f "delims=" %%i in ('dir /b /od dist\*.vsix') do set VSIX_FILE=dist\%%i

echo.
echo Build complete!
echo Extension package: %VSIX_FILE%
echo.
echo To install globally in VS Code, run:
echo   code --install-extension "%VSIX_FILE%"
echo.

set /p INSTALL="Install extension now? (y/n) "
if /i "%INSTALL%"=="y" (
    REM Try to find code command
    where code >nul 2>&1
    if %errorlevel% neq 0 (
        REM Try common installation paths
        if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd" (
            set CODE_CMD="%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd"
        ) else if exist "%ProgramFiles%\Microsoft VS Code\bin\code.cmd" (
            set CODE_CMD="%ProgramFiles%\Microsoft VS Code\bin\code.cmd"
        ) else (
            echo Warning: 'code' command not found. To add it to PATH:
            echo   1. Open VS Code
            echo   2. Press Ctrl+Shift+P
            echo   3. Run: Shell Command: Install 'code' command in PATH
            echo.
            echo Alternatively, install manually via VS Code:
            echo   Extensions: Install from VSIX... -^> Select %VSIX_FILE%
            goto :end
        )
    ) else (
        set CODE_CMD=code
    )
    
    REM Extract extension ID from package.json using Node.js (same as build.sh)
    for /f "delims=" %%i in ('node -pe "const pkg = require('./ghcgtw/package.json'); `${pkg.publisher}.${pkg.name}`"') do set EXTENSION_ID=%%i
    
    REM Check if extension is installed
    %CODE_CMD% --list-extensions | findstr /i "^%EXTENSION_ID%$" >nul
    if %errorlevel% equ 0 (
        echo Uninstalling previous version...
        %CODE_CMD% --uninstall-extension "%EXTENSION_ID%"
        timeout /t 1 /nobreak >nul
    )
    
    echo Installing extension...
    %CODE_CMD% --install-extension "%VSIX_FILE%"
    if %errorlevel% neq 0 (
        echo Error: Failed to install extension
        exit /b 1
    )
    echo.
    echo Extension installed! Restart VS Code or reload window to activate.
    echo The extension will now run in all VS Code instances.
) else (
    echo To install manually, use VS Code command palette:
    echo   Extensions: Install from VSIX... - Select %VSIX_FILE%
)

:end
