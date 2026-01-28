@echo off
echo Starting Live Quiz Development Server...
echo.
echo NOTE: Since Redis and MongoDB are not installed locally, the server 
echo will use In-Memory versions. Data will be lost on restart.
echo.
echo Admin User: admin / admin123
echo Student User: student / student123
echo.
echo Server URL: http://localhost:5000/index.html
echo.

cd /d "%~dp0"
call npm start
pause
