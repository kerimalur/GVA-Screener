# Richtet alles ein, damit nach einem Windows-Start automatisch alles laeuft:
#   1. MetaTrader 5 startet mit und meldet sich selbst an
#   2. die Bruecke startet mit, ohne Fenster
#   3. beides laeuft sofort los, ohne Neustart
#
# Aufruf (aus mt5-bruecke heraus):
#   powershell -ExecutionPolicy Bypass -File .\einrichten.ps1
#
# Mehrfach ausfuehrbar: bestehende Verknuepfungen werden ueberschrieben.
#
# BEWUSST NICHT "Stop": externe Programme schreiben staendig auf stderr, ohne
# dass etwas kaputt ist. Mit ErrorActionPreference="Stop" beendet schon ein
# "py"-Aufruf ohne installierte Version das ganze Skript - genau daran ist der
# erste Versuch gescheitert. Fehler werden hier einzeln geprueft, nicht global.
$ErrorActionPreference = "Continue"

$ordner  = Split-Path -Parent $MyInvocation.MyCommand.Path
$startup = [Environment]::GetFolderPath('Startup')
$ws      = New-Object -ComObject WScript.Shell

Write-Host ""
Write-Host "Ordner   : $ordner"
Write-Host "Autostart: $startup"

# Ruft ein Programm auf und gibt Text und Rueckgabewert zurueck, ohne dass
# eine Ausgabe auf stderr das Skript beendet.
function Ruf($exe, [string[]]$argumente) {
    $alt = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    $text = (& $exe @argumente 2>&1 | Out-String)
    $code = $LASTEXITCODE
    $ErrorActionPreference = $alt
    return @{ Code = $code; Text = $text.Trim() }
}

# --- 1. MetaTrader 5 --------------------------------------------------------
# Der Ordnername ist je nach Broker anders. Deshalb wird nach der Programmdatei
# gesucht statt ein Verzeichnis zu raten.
Write-Host ""
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
    Write-Host "  NICHT gefunden. Von Hand: Win+R -> shell:startup -> Verknuepfung hineinziehen." -ForegroundColor Yellow
}

# --- 2. Den richtigen Python finden -----------------------------------------
# Auf einem Windows liegen leicht mehrere Pythons. "pip install" trifft dann
# das eine, "pythonw.exe" aus dem PATH das andere - und dort fehlt MetaTrader5,
# obwohl es installiert wurde. Deshalb wird nicht geraten, sondern geprueft:
# welcher Interpreter kann MetaTrader5 WIRKLICH importieren?
Write-Host ""
Write-Host "Suche einen Python, der MetaTrader5 importieren kann ..."

$kandidaten = New-Object System.Collections.Generic.List[string]

foreach ($n in @("python", "python3")) {
    $c = Get-Command $n -ErrorAction SilentlyContinue
    if ($c -and $c.Source -and $c.Source -notmatch "WindowsApps") { $kandidaten.Add($c.Source) }
}
if (Get-Command py -ErrorAction SilentlyContinue) {
    foreach ($v in @("-3.12", "-3.11", "-3.13", "-3")) {
        $r = Ruf "py" @($v, "-c", "import sys; print(sys.executable)")
        if ($r.Code -eq 0 -and $r.Text) { $kandidaten.Add($r.Text) }
    }
}
foreach ($wurzel in @("$env:LOCALAPPDATA\Programs\Python", "C:\Python312", "C:\Python311", "C:\Program Files\Python312")) {
    Get-ChildItem $wurzel -Filter python.exe -Recurse -Depth 2 -ErrorAction SilentlyContinue |
        ForEach-Object { $kandidaten.Add($_.FullName) }
}

$liste = $kandidaten | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
if (-not $liste) {
    Write-Host "  Gar kein Python gefunden." -ForegroundColor Red
    Write-Host "  Installieren: https://www.python.org/downloads/ (64-bit)" -ForegroundColor Red
    exit 1
}

Write-Host "  gepruefte Interpreter:"
foreach ($k in $liste) {
    $b = Ruf $k @("-c", "import struct; print(struct.calcsize('P')*8)")
    $m = Ruf $k @("-c", "import MetaTrader5")
    $hat = if ($m.Code -eq 0) { "MetaTrader5 JA" } else { "MetaTrader5 nein" }
    Write-Host "    $k  ($($b.Text)-bit, $hat)"
}

$python = $null
foreach ($k in $liste) {
    if ((Ruf $k @("-c", "import MetaTrader5")).Code -eq 0) { $python = $k; break }
}

if (-not $python) {
    Write-Host "  Keiner hat MetaTrader5. Installiere in den ersten 64-bit-Python ..." -ForegroundColor Yellow
    foreach ($k in $liste) {
        if ((Ruf $k @("-c", "import struct; print(struct.calcsize('P')*8)")).Text -ne "64") { continue }
        Write-Host "    $k"
        $i = Ruf $k @("-m", "pip", "install", "MetaTrader5", "supabase")
        if ((Ruf $k @("-c", "import MetaTrader5")).Code -eq 0) { $python = $k; break }
        Write-Host "    fehlgeschlagen:" -ForegroundColor Yellow
        Write-Host ($i.Text -split "`n" | Select-Object -Last 5 | Out-String) -ForegroundColor Yellow
    }
}

if (-not $python) {
    Write-Host ""
    Write-Host "Kein Python konnte MetaTrader5 laden." -ForegroundColor Red
    Write-Host "Das Paket gibt es nur fuer Windows und nur fuer 64-bit-Python." -ForegroundColor Red
    exit 1
}
Write-Host "  benutzt wird: $python" -ForegroundColor Green

if ((Ruf $python @("-c", "import supabase")).Code -ne 0) {
    Write-Host "  supabase fehlt, installiere ..."
    Ruf $python @("-m", "pip", "install", "supabase") | Out-Null
}

# pythonw.exe ist derselbe Interpreter ohne Konsolenfenster - im selben Ordner.
$pythonw = Join-Path (Split-Path $python) "pythonw.exe"
if (-not (Test-Path $pythonw)) { $pythonw = $python }
Set-Content -Path "$ordner\python-pfad.txt" -Value $pythonw -Encoding ASCII
Write-Host "  ohne Fenster: $pythonw"

# --- 3. Bruecke in den Autostart -------------------------------------------
$lnk = $ws.CreateShortcut("$startup\GVA MT5-Bruecke.lnk")
$lnk.TargetPath       = "$ordner\starte-versteckt.vbs"
$lnk.WorkingDirectory = $ordner
$lnk.Description      = "Vantage-Trades ins KerimOS-Journal"
$lnk.Save()
Write-Host ""
Write-Host "Bruecke: Autostart-Verknuepfung angelegt."

# --- 4. Jetzt starten, ohne Neustart ---------------------------------------
# Erst eine laufende Instanz beenden: zwei Bruecken wuerden in dieselbe
# Tabelle und dasselbe Log schreiben.
Get-Process pythonw -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "Beende laufende Instanz (PID $($_.Id)) ..."
    $_.Kill()
}
Start-Sleep -Seconds 1

if ($mt5 -and -not (Get-Process terminal64 -ErrorAction SilentlyContinue)) {
    Write-Host "Starte MetaTrader 5 und warte auf die Anmeldung ..."
    Start-Process $mt5.FullName
    Start-Sleep -Seconds 25
}

Write-Host "Starte Bruecke ..."
Start-Process "wscript.exe" -ArgumentList "`"$ordner\starte-versteckt.vbs`"" -WorkingDirectory $ordner
Start-Sleep -Seconds 10

# --- 5. Nachweis ------------------------------------------------------------
Write-Host ""
Write-Host "--- Kontrolle ---------------------------------------------"
$laeuft = Get-Process pythonw -ErrorAction SilentlyContinue
if ($laeuft) {
    Write-Host "Bruecke laeuft (PID $($laeuft.Id))." -ForegroundColor Green
} else {
    Write-Host "Bruecke laeuft NICHT - der Grund steht unten im Log." -ForegroundColor Red
}

$log = "$ordner\lauf.log"
if (Test-Path $log) {
    Write-Host ""
    Write-Host "Letzte Zeilen aus lauf.log:"
    Get-Content $log -Tail 8 | ForEach-Object { Write-Host "  $_" }
}

Write-Host ""
Write-Host "Im Autostart liegen jetzt:"
Get-ChildItem $startup -Filter *.lnk | ForEach-Object { Write-Host "  $($_.Name)" }
Write-Host ""
