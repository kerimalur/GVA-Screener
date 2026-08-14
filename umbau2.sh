#!/usr/bin/env bash
# Zuschnitt vom 14.08.2026: Faktoren-Modus aufgeloest, Maerkte auf eine Seite.
# Verschiebt nach _to_delete/ und meldet danach jede tote Referenz.
set -u
cd "$(dirname "$0")" || exit 1
FE=frontend-next
D=_to_delete/schnitt2

mkdir -p "$D/app" "$D/components" "$D/lib"

weg() { [ -e "$1" ] && mv "$1" "$2" && echo "  weg: $1"; }

echo "== Seiten, die in /markt aufgehen =="
weg "$FE/app/(app)/makro"                 "$D/app/makro"
weg "$FE/app/(app)/cot"                   "$D/app/cot"
weg "$FE/app/(app)/weekly"                "$D/app/weekly"
weg "$FE/app/(app)/dashboard"             "$D/app/dashboard"
weg "$FE/app/(app)/ml/season"             "$D/app/ml-season"

echo "== Seiten, die Kerim nicht braucht =="
weg "$FE/app/(app)/ml/factor-lab"         "$D/app/ml-factor-lab"
weg "$FE/app/(app)/ml/fundamental-track"  "$D/app/ml-fundamental-track"
weg "$FE/app/(app)/ml/setup-finder"       "$D/app/ml-setup-finder"
weg "$FE/app/(app)/ml/modell"             "$D/app/ml-modell"

echo "== Komponenten dazu =="
weg "$FE/components/makro"                "$D/components/makro"
weg "$FE/components/cot"                  "$D/components/cot"
weg "$FE/components/weekly"               "$D/components/weekly"
weg "$FE/components/dashboard"            "$D/components/dashboard"
weg "$FE/components/saisonalitaet"        "$D/components/saisonalitaet"
weg "$FE/components/vergleich"            "$D/components/vergleich"
weg "$FE/components/intermarket"          "$D/components/intermarket"
weg "$FE/components/sentiment"            "$D/components/sentiment"
weg "$FE/components/terminal"             "$D/components/terminal"
weg "$FE/components/ml/SetupFinder.tsx"   "$D/components/SetupFinder.tsx"
weg "$FE/components/ml/FundamentalTrack.tsx" "$D/components/FundamentalTrack.tsx"
weg "$FE/components/ml/SeasonExplorer.tsx"   "$D/components/SeasonExplorer.tsx"
weg "$FE/components/ml/SeasonVerdict.tsx"    "$D/components/SeasonVerdict.tsx"
weg "$FE/components/ml/BacktestPanel.tsx"    "$D/components/BacktestPanel.tsx"

echo "== Altes Chrome und Launcher =="
weg "$FE/components/layout/ModeChrome.tsx"   "$D/components/ModeChrome.tsx"
weg "$FE/components/layout/ModeLauncher.tsx" "$D/components/ModeLauncher.tsx"
weg "$FE/components/layout/PairSearchBar.tsx" "$D/components/PairSearchBar.tsx"
weg "$FE/components/layout/Panel.tsx"        "$D/components/Panel.tsx"
weg "$FE/components/layout/StaleBadge.tsx"   "$D/components/StaleBadge.tsx"
weg "$FE/components/ui/terminal"             "$D/components/ui-terminal"

echo "== Bibliotheken ohne Abnehmer =="
weg "$FE/lib/ml/fundamentalTrackApi.ts"   "$D/lib/fundamentalTrackApi.ts"
weg "$FE/lib/ml/factorLab.ts"             "$D/lib/factorLab.ts"
weg "$FE/lib/ml/backtest.ts"              "$D/lib/backtest.ts"
weg "$FE/lib/ml/seasonality2.ts"          "$D/lib/seasonality2.ts"
weg "$FE/lib/ml/confluence.ts"            "$D/lib/confluence.ts"
weg "$FE/lib/ml/outlookSnapshots.ts"      "$D/lib/outlookSnapshots.ts"
weg "$FE/lib/ml/signalStart.ts"           "$D/lib/signalStart.ts"
weg "$FE/lib/weekly"                      "$D/lib/weekly"

echo "== API-Routen dazu =="
weg "$FE/app/api/ml/setup-finder"         "$D/app/api-setup-finder"
weg "$FE/app/api/ml/season"               "$D/app/api-season"
weg "$FE/app/api/cot"                     "$D/app/api-cot"

echo
echo "=============================================="
echo "Tote Referenzen"
echo "=============================================="
cd "$FE" || exit 1
M='components/makro|components/cot|components/weekly|components/dashboard|components/terminal|components/sentiment|components/intermarket|components/vergleich|components/saisonalitaet|layout/Panel|layout/ModeChrome|layout/ModeLauncher|layout/PairSearchBar|layout/StaleBadge|ui/terminal|ml/SetupFinder|ml/FundamentalTrack|ml/SeasonExplorer|ml/SeasonVerdict|ml/BacktestPanel|fundamentalTrackApi|factorLab|ml/backtest|seasonality2|ml/confluence|outlookSnapshots|signalStart|lib/weekly'
if grep -rInE "$M" app components lib scripts 2>/dev/null; then
  echo; echo ">>> muessen angepasst werden."
else
  echo "  keine."
fi
