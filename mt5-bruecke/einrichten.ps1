# Richtet alles ein, damit nach einem Windows-Start automatisch alles laeuft:
#   1. MetaTrader 5 startet mit und meldet sich selbst an
#   2. die Bruecke startet mit, ohne Fenster
#   3. beides laeuft sofort los, ohne Neustart
#
# Aufruf (aus mt5-bruecke heraus):
#   powershell -ExecutionPolicy Bypass -File .\einrichten.ps1
#
# Mehrfach ausfuehrbar: bestehende Verknuepfungen werden ueberschrieben.

$ErrorActionPreference = "Stop"
$ordner  = Split-Path -Parent $MyInvocation.MyCommand.Path
$startup = [Environment]::GetFolderPath('Startup')
$ws      = New-Object -ComObject WScript.Shell

Write-Host ""
Write-Host "Ordner : $ordner"
Write-Host "Autostart: $startup"
Write-Host ""

# --- 1. MetaTrader 5 finden -------------------------------------------------
# Der Ordnername ist je nach Broker anders ("Vantage Markets MT5",
# "MetaTrader 5", ...). Deshalb wird nach der Programmdatei gesucht und nicht
# nach einem geratenen Pfad.
Write-Host "Suche MetaTrader 5 ..."
$mt5 = Get-ChildItem -Path "C:\Program Files","C:\Program Files (x86)" `
         -Filter "terminal64.exe" -Recurse -Depth 2 -ErrorAction SilentlyContinue |
       Sort-Object { if ($_.FullName -match "Vantage") { 0 } else { 1 } } |
       Select-Object -First 1

if ($mt5) {
    Write-Host "  gefunden: $($mt5.FullName)"
    $lnk = $ws.CreateShortcut("$startup\MetaTrader 5.lnk")
    $lnk.TargetPath       = $mt5.FullName
    $lnk.WorkingDirectory = $mt5.DirectoryName
    $lnk.Description      = "Handelsterminal - Grundlage der GVA-Bruecke"
    $lnk.Save()
    Write-Host "  Autostart-Verknuepfung angelegt."
} else {
    Write-Host "  NICHT gefunden. Leg die Verknuepfung von Hand an:" -ForegroundColor Yellow
    Write-Host "  Win+R -> shell:startup -> MetaTrader-5-Verknuepfung hineinziehen." -ForegroundColor Yellow
}

# --- 2. pythonw pruefen -----------------------------------------------------
# pythonw.exe ist derselbe Interpreter ohne Konsolenfenster. Fehlt er, laeuft
# die Bruecke zwar, aber mit sichtbarem Fenster - das soll man vorher wissen.
Write-Host ""
$pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if ($pythonw) {
    Write-Host "pythonw.exe: $pythonw"
} else {
    Write-Host "pythonw.exe nicht im PATH gefunden." -ForegroundColor Yellow
    Write-Host "Die Bruecke laeuft trotzdem, aber eventuell mit Fenster." -ForegroundColor Yellow
}

# --- 3. Bruecke in den Autostart -------------------------------------------
$lnk = $ws.CreateShortcut("$startup\GVA MT5-Bruecke.lnk")
$lnk.TargetPath       = "$ordner\starte-versteckt.vbs"
$lnk.WorkingDirectory = $ordner
$lnk.Description      = "Vantage-Trades ins KerimOS-Journal"
$lnk.Save()
Write-Host ""
Write-Host "Bruecke: Autostart-Verknuepfung angelegt."

# --- 4. Jetzt schon starten, ohne Neustart ---------------------------------
# Erst eine eventuell laufende Instanz beenden, sonst schreiben zwei Bruecken
# in dieselbe Tabelle und ins selbe Log.
Get-Process pythonw -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "Beende laufende Instanz (PID $($_.Id)) ..."
    $_.Kill()
}
Start-Sleep -Seconds 1

if (-not $mt5 -or -not (Get-Process terminal64 -ErrorAction SilentlyContinue)) {
    if ($mt5) {
        Write-Host "Starte MetaTrader 5 ..."
        Start-Process $mt5.FullName
        Start-Sleep -Seconds 20   # Anmeldung braucht einen Moment
    }
}

Write-Host "Starte Bruecke ..."
Start-Process "wscript.exe" -ArgumentList "`"$ordner\starte-versteckt.vbs`"" -WorkingDirectory $ordner
Start-Sleep -Seconds 8

# --- 5. Nachweis ------------------------------------------------------------
Write-Host ""
Write-Host "--- Kontrolle ---------------------------------------------"
$laeuft = Get-Process pythonw -ErrorAction SilentlyContinue
if ($laeuft) {
    Write-Host "Bruecke laeuft (PID $($laeuft.Id))." -ForegroundColor Green
} else {
    Write-Host "Bruecke laeuft NICHT. Siehe lauf.log." -ForegroundColor Red
}

$log = "$ordner\lauf.log"
if (Test-Path $log) {
    Write-Host ""
    Write-Host "Letzte Zeilen aus lauf.log:"
    Get-Content $log -Tail 6 | ForEach-Object { Write-Host "  $_" }
}

Write-Host ""
Write-Host "Im Autostart liegen jetzt:"
Get-ChildItem $startup -Filter *.lnk | ForEach-Object { Write-Host "  $($_.Name)" }
Write-Host ""
