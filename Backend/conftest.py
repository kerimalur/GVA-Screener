"""Macht `Backend` importierbar, egal aus welchem Verzeichnis pytest startet.

Ohne diese Datei haengt der Importpfad am Arbeitsverzeichnis: `pytest` aus
`Backend` heraus funktioniert, `pytest Backend` von der Repo-Wurzel aus legt
nur `Backend/tests` auf den Pfad — und dann scheitert das Einsammeln JEDES
Tests mit `ModuleNotFoundError: No module named 'main'` bzw. 'ml_engine'.
Das sieht wie 23 kaputte Tests aus, ist aber ein Pfadproblem und kein
einziger fehlgeschlagener Test.
"""
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
