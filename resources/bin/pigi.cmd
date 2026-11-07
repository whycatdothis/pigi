@echo off
rem Runs the pigi CLI with pigi's own Electron in Node mode.
setlocal
set "BIN=%~dp0"
if exist "%BIN%..\..\..\app.asar" (
  set "ELECTRON=%BIN%..\..\..\..\pigi.exe"
  set "CLI=%BIN%..\..\..\app.asar\out\main\cli.js"
) else (
  for /f "usebackq delims=" %%p in ("%BIN%..\..\node_modules\electron\path.txt") do set "ELECTRON=%BIN%..\..\node_modules\electron\dist\%%p"
  set "CLI=%BIN%..\..\out\main\cli.js"
)
set ELECTRON_RUN_AS_NODE=1
"%ELECTRON%" "%CLI%" %*
