@echo off
echo.
echo ===========================================
echo     Zuik - DeFi Automation Platform    
echo ===========================================
echo.

if not exist "projects\Zuik-frontend" (
    echo ERROR: Please run this script from the Zuik root directory
    echo Current directory: %cd%
    pause
    exit /b 1
)

echo Checking prerequisites...

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Please install Node.js 20+ and try again.
    pause
    exit /b 1
)
echo OK: Node.js found

where npm >nul 2>&1  
if errorlevel 1 (
    echo ERROR: npm not found. Please install npm 9+ and try again.
    pause
    exit /b 1
)
echo OK: npm found

echo.
echo Installing dependencies...

echo Checking frontend dependencies...
cd projects\Zuik-frontend
if not exist "node_modules" (
    echo Installing frontend dependencies... this may take a moment
    call npm install
    if errorlevel 1 (
        echo ERROR: Frontend dependency installation failed
        cd ..\..
        pause
        exit /b 1
    )
) else (
    echo Frontend dependencies OK
)

echo Checking server dependencies...
cd ..\server
if not exist "node_modules" (
    echo Installing server dependencies... this may take a moment
    call npm install
    if errorlevel 1 (
        echo ERROR: Server dependency installation failed
        cd ..\..
        pause
        exit /b 1
    )
) else (
    echo Server dependencies OK
)

cd ..\..

echo.
echo Starting services...

REM Get the current directory for absolute paths
set "PROJECT_ROOT=%cd%"

echo Starting backend server on http://localhost:4021...
start "Zuik Backend Server" cmd /k "cd /d "%PROJECT_ROOT%\projects\server" && echo Zuik Backend Server - PORT 4021 && npm run dev"

echo Waiting for backend to initialize...
timeout /t 3 /nobreak >nul

echo Starting frontend on http://localhost:5173...
start "Zuik Frontend" cmd /k "cd /d "%PROJECT_ROOT%\projects\Zuik-frontend" && echo Zuik Frontend - PORT 5173 && npm run dev"

echo Waiting for frontend to initialize...
timeout /t 6 /nobreak >nul

echo.
echo SUCCESS: Zuik is starting up!
echo.
echo Services should be running at:
echo   Backend:  http://localhost:4021 
echo   Frontend: http://localhost:5173
echo.
echo Opening your browser...
start http://localhost:5173

echo.
echo ===========================================
echo ZUIK IS NOW RUNNING!
echo ===========================================
echo.
echo Quick Start Tips:
echo - Connect your Algorand TestNet wallet (Pera, Defly, etc.)
echo - Get test ALGO: https://dispenser.testnet.aws.algodev.network/
echo - Try workflow: "Send 0.01 ALGO every 5 seconds for 3 times"
echo - Set Guardian DAILY limits in Settings before using Agent mode
echo - Daily execution limits reset automatically every 24 hours
echo.
echo To Stop Zuik:
echo - Close both terminal windows that opened
echo - Or press Ctrl+C in each terminal window
echo.
echo This setup window can be closed safely.
echo Press any key to close this window...
pause >nul