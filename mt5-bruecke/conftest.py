"""Legt `mt5-bruecke` auf den Importpfad.

Ohne diese Datei nimmt pytest nur `tests/` auf den Pfad, und
`from gruppierung import ...` scheitert mit ModuleNotFoundError — was aussieht,
als waeren alle Tests kaputt, und ein Pfadproblem ist. Dieselbe Falle wie in
`Backend/conftest.py`; sie hat dort schon einmal eine Stunde gekostet.

pytest laedt jede conftest.py und legt ihren Ordner an den Anfang von sys.path,
sobald sie im Wurzelverzeichnis der Testsammlung liegt. Mehr braucht es nicht.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
