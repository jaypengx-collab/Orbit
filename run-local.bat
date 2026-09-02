@echo off
setlocal
set PORT=8843
cd /d "%~dp0"

echo Starting local server at http://localhost:%PORT%/
start "" "http://localhost:%PORT%/"
python -m http.server %PORT%

endlocal
