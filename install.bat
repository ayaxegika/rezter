@echo off
title Install dependencies
cd /d "%~dp0"
"C:\Program Files\nodejs\npm.cmd" install express socket.io
pause
