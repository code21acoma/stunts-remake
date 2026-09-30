@echo off
rem Spustí lokální server (bez mezipaměti) a otevře hru v prohlížeči
cd /d "%~dp0"
start "" http://localhost:8123
python tools\server.py 8123
