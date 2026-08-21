@echo off
REM Legt eine Verknuepfung auf starte-versteckt.vbs in den Autostart-Ordner.
REM Danach laeuft die Bruecke ab jeder Windows-Anmeldung, ohne Fenster und
REM ohne dass jemand daran denken muss.
REM
REM Doppelklick genuegt. Nochmal ausfuehren ueberschreibt die Verknuepfung,
REM das schadet nicht.
REM
REM Rueckgaengig: Win+R -> shell:startup -> "GVA MT5-Bruecke.lnk" loeschen.

setlocal
set ORDNER=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut(\"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\GVA MT5-Bruecke.lnk\"); $s.TargetPath='%ORDNER%starte-versteckt.vbs'; $s.WorkingDirectory='%ORDNER%'; $s.Description='Vantage-Trades ins KerimOS-Journal'; $s.Save()"

if errorlevel 1 (
  echo.
  echo Das hat nicht geklappt. Von Hand: Win+R, "shell:startup", und
  echo starte-versteckt.vbs dort hinein verknuepfen.
) else (
  echo.
  echo Autostart eingerichtet. Die Bruecke startet ab der naechsten Anmeldung
  echo von selbst - ohne Fenster. Was sie tut, steht in lauf.log.
  echo.
  echo NICHT VERGESSEN: MT5 muss auch starten. In MT5 unter
  echo   Extras - Optionen - Server: "Kontoinformationen speichern" ankreuzen,
  echo und eine Verknuepfung auf MetaTrader 5 ebenfalls nach shell:startup legen.
  echo Ohne laufendes Terminal hat die Bruecke nichts zu lesen.
)
echo.
pause
