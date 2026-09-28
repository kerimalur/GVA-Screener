# ============================================================================
#  einrichten-aufgabe.ps1                                        27.08.2026
#
#  Die Bruecke als geplante Aufgabe statt als Startordner-Verknuepfung.
#
#  Warum ueberhaupt: der Startordner startet EINMAL bei der Anmeldung. Stuerzt
#  die Bruecke ab, wird MetaTrader neu gestartet oder schliesst Kerim sie aus
#  Versehen, kommt sie bis zur naechsten Anmeldung nicht wieder — und genau
#  dann fehlt der Stop, den sie haette sehen muessen.
#
#  Diese Aufgabe startet sie bei der Anmeldung UND schaut danach alle fuenf
#  Minuten nach, ob sie noch laeuft. Ein Doppelstart kann nichts kaputtmachen:
#  starte-versteckt.vbs prueft das nicht, aber die Aufgabe ist auf
#  "IgnoreNew" gesetzt — laeuft sie schon, passiert nichts.
#
#  Mehrfach ausfuehrbar: eine bestehende Aufgabe wird ersetzt.
#
#  Aufruf (PowerShell, im Ordner mt5-bruecke):
#      powershell -ExecutionPolicy Bypass -File .\einrichten-aufgabe.ps1
# ============================================================================

$ErrorActionPreference = "Stop"
$ordner = Split-Path -Parent $MyInvocation.MyCommand.Path
$name   = "GVA MT5-Bruecke"
$vbs    = Join-Path $ordner "starte-versteckt.vbs"

if (-not (Test-Path $vbs)) {
    Write-Host "starte-versteckt.vbs fehlt in $ordner." -ForegroundColor Red
    Write-Host "Erst einrichten.ps1 laufen lassen." -ForegroundColor Yellow
    exit 1
}

Write-Host "Ordner:  $ordner"
Write-Host "Aufgabe: $name"
Write-Host ""

# --- Alte Aufgabe weg, damit mehrfaches Ausfuehren folgenlos bleibt ---------
if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    Write-Host "Bestehende Aufgabe entfernt."
}

# --- Ausloeser: bei Anmeldung, danach alle fuenf Minuten nachschauen --------
#
# Der zweite Ausloeser ist der eigentliche Gewinn. Ohne ihn ist die Aufgabe
# nur eine schoenere Startordner-Verknuepfung.
$beiAnmeldung = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
# MaxValue heisst fuer die Aufgabenplanung "unbegrenzt". Eine feste Zahl von
# Tagen waere eine stille Ablauffrist: die Wiederholung hoerte irgendwann auf,
# ohne dass jemand etwas gemacht haette.
$wiederholt   = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$wiederholt.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -RepetitionDuration ([TimeSpan]::MaxValue)).Repetition

$aktion = New-ScheduledTaskAction -Execute "wscript.exe" `
    -Argument "`"$vbs`"" -WorkingDirectory $ordner

# MultipleInstances IgnoreNew: laeuft sie schon, tut der Fuenf-Minuten-Takt
# nichts. Genau deshalb darf er so eng sein.
#
# Kein -RunOnlyIfIdle, kein -DontStopOnIdleEnd-Gegenstueck: die Bruecke soll
# laufen, waehrend Kerim am Rechner arbeitet, nicht wenn er weg ist.
#
# AllowStartIfOnBatteries: sonst laeuft sie auf dem Notebook nicht, und der
# Stop, den sie sehen muesste, faellt genau dort aus.
$einstellungen = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $name `
    -Trigger @($beiAnmeldung, $wiederholt) `
    -Action $aktion `
    -Settings $einstellungen `
    -Description "Vantage-Trades ins KerimOS-Journal. Startet bei der Anmeldung und alle 5 Minuten, falls sie nicht laeuft." `
    | Out-Null

Write-Host "Aufgabe angelegt." -ForegroundColor Green

# --- Startordner-Verknuepfung entfernen ------------------------------------
#
# Sonst laeuft beides: die Verknuepfung startet die Bruecke bei der Anmeldung,
# die Aufgabe auch. Zwei Bruecken schreiben in dieselbe Tabelle und dasselbe
# Log — das ist genau die Sorte doppelter Wahrheit, die dieses Projekt sonst
# aufraeumt.
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) "GVA MT5-Bruecke.lnk"
if (Test-Path $lnk) {
    Remove-Item $lnk -Force
    Write-Host "Alte Startordner-Verknuepfung entfernt (sonst liefe sie doppelt)."
}

# --- Jetzt starten, ohne Neustart ------------------------------------------
Get-Process pythonw -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "Beende laufende Instanz (PID $($_.Id)) ..."
    $_.Kill()
}
Start-Sleep -Seconds 1
Start-ScheduledTask -TaskName $name
Start-Sleep -Seconds 3

Write-Host ""
if (Get-Process pythonw -ErrorAction SilentlyContinue) {
    Write-Host "Laeuft." -ForegroundColor Green
} else {
    Write-Host "Kein pythonw-Prozess zu sehen." -ForegroundColor Yellow
    Write-Host "Schau in lauf.log — dort steht, woran es lag." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Nachschauen:  Get-ScheduledTask '$name' | Get-ScheduledTaskInfo"
Write-Host "Beenden:      Stop-ScheduledTask -TaskName '$name'"
Write-Host "Abschalten:   Unregister-ScheduledTask -TaskName '$name' -Confirm:`$false"
Write-Host ""
Write-Host "WICHTIG: MetaTrader muss offen und angemeldet sein. Ohne Terminal"
Write-Host "gibt die MT5-Schnittstelle nichts her - das ist ihre Eigenschaft,"
Write-Host "kein Fehler der Bruecke."
