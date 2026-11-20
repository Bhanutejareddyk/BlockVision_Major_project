@echo off
title BlockVision 2.0 - Blockchain Image Verification System
echo =====================================================================
echo           BLOCKVISION 2.0 - LOCAL LAUNCHER
echo =====================================================================
echo.
cd /d "%~dp0backend"

echo [1/3] Checking Python installation...
python --version
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH!
    pause
    exit /b 1
)

echo.
echo [2/3] Checking environment & contract address...
if not exist ".env" (
    echo [INFO] No .env found. Deploying contract first...
    python deploy.py
)

echo.
echo [3/3] Starting BlockVision Flask Server on http://127.0.0.1:5000...
echo Open your browser at http://127.0.0.1:5000
echo Press Ctrl+C to stop the server anytime.
echo.
python app.py
pause