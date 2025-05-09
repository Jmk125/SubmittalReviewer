@echo off
echo Starting Submittal Reviewer Application...

:: Get the IP address of the machine
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| find "IPv4"') do (
    set IP=%%a
    goto :got_ip
)
:got_ip
set IP=%IP:~1%

:: Start the Flask application in a new window
start cmd /k "python app.py"

:: Wait for Flask to start
timeout /t 3 /nobreak

:: Start Firefox and navigate to the application
start firefox "http://localhost:5000"

echo Application started! You can access it at:
echo http://localhost:5000
echo or
echo http://%IP%:5000