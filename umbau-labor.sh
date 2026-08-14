#!/usr/bin/env bash
# Etappe 4: GVA-Screener -> Labor
#
# Verschiebt alles, was zum Entscheiden gehoert, nach _to_delete/ und meldet
# anschliessend jede Referenz, die dadurch ins Leere zeigt. Loeschen tut das
# Skript nichts - die Dateien bleiben zum Nachschauen liegen.
#
# Aufruf:  bash umbau-labor.sh
set -u
cd "$(dirname "$0")" || exit 1

FE=frontend-next
D=_to_delete

mkdir -p "$D/$FE/app" "$D/$FE/components" "$D/$FE/lib" "$D/$FE/scripts"

verschiebe() {  # $1 = Quelle, $2 = Ziel unter _to_delete
  if [ -e "$1" ]; then
    mv "$1" "$2" && echo "  verschoben: $1"
  fi
}

echo "== App-Routen =="
verschiebe "$FE/app/(app)/cockpit"        "$D/$FE/app/cockpit"
verschiebe "$FE/app/(app)/journal"        "$D/$FE/app/journal"
verschiebe "$FE/app/(app)/scanner"        "$D/$FE/app/scanner"

echo "== Komponenten =="
verschiebe "$FE/components/cockpit"       "$D/$FE/components/cockpit"
verschiebe "$FE/components/journal"       "$D/$FE/components/journal"
verschiebe "$FE/components/scanner"       "$D/$FE/components/scanner"

echo "== Bibliotheken =="
# lib/dashboard bleibt bewusst stehen: `weekPlan.ts` haengt an der
# Termine-Seite (/dashboard), und die gehoert zum Labor. Ob es sonst noch
# gebraucht wird, sagt die Referenz-Pruefung weiter unten.
verschiebe "$FE/lib/journal"              "$D/$FE/lib/journal"
verschiebe "$FE/lib/cockpit"              "$D/$FE/lib/cockpit"

echo "== Pruefskripte der entfernten Bereiche =="
for f in journal-panels-check trade-budget-check cockpit-board-check \
         setup-lifecycle-check signal-start-check adopt-check csv-import-check; do
  verschiebe "$FE/scripts/$f.mts" "$D/$FE/scripts/$f.mts"
done

echo "== Altbestand =="
verschiebe "marketing-verkauf-backup"     "$D/marketing-verkauf-backup"

echo
echo "=============================================="
echo "Grenzfaelle - haengen die noch am Journal?"
echo "=============================================="
for f in components/layout/SignalsBadge.tsx components/weekly/OutlookPrefillButton.tsx \
         components/dashboard/NearGva.tsx components/dashboard/WeekPlan.tsx \
         components/ml/SetupFinder.tsx lib/ml/outlookSnapshots.ts \
         lib/ml/signalStart.ts lib/ml/confluence.ts lib/gva/api.ts; do
  if [ -f "$FE/$f" ]; then
    treffer=$(grep -cE 'lib/journal|lib/cockpit|signals|outlook' "$FE/$f" 2>/dev/null || echo 0)
    [ "$treffer" -gt 0 ] && echo "  PRUEFEN: $f ($treffer Treffer)"
  fi
done

echo
echo "=============================================="
echo "Referenzen, die jetzt ins Leere zeigen"
echo "=============================================="
cd "$FE" || exit 1
MUSTER='lib/journal|lib/cockpit|lib/dashboard|components/journal|components/cockpit|components/scanner|@/lib/gva/api'
if grep -rInE "$MUSTER" app components lib scripts 2>/dev/null; then
  echo
  echo ">>> Diese Stellen muessen noch angepasst werden."
else
  echo "  keine - sauber."
fi

echo
echo "=============================================="
echo "Erwaehnungen von Cockpit/Journal/Scanner im Text"
echo "=============================================="
grep -rIlnE 'Cockpit|Journal|Scanner|Backtest' app components lib 2>/dev/null || echo "  keine"

echo
echo "Fertig. Danach:  npx tsx scripts/nav-modes-check.mts  &&  npm run build"
