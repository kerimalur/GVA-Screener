' Startet die Bruecke OHNE Fenster.
'
' Welcher Interpreter benutzt wird, steht in python-pfad.txt, die
' einrichten.ps1 schreibt. Das ist noetig, weil auf einem Windows leicht
' mehrere Pythons liegen: "pip install" trifft das eine, ein blankes
' "pythonw.exe" aus dem PATH das andere — und dann fehlt dort MetaTrader5,
' obwohl es installiert wurde. Genau das ist am 21.08.2026 passiert.
'
' Ohne die Datei wird "pythonw.exe" aus dem PATH genommen.
'
' Beenden: Task-Manager -> Details -> pythonw.exe.

Set fso = CreateObject("Scripting.FileSystemObject")
ordner = fso.GetParentFolderName(WScript.ScriptFullName)

pfad = "pythonw.exe"
konfig = ordner & "\python-pfad.txt"
If fso.FileExists(konfig) Then
    Set f = fso.OpenTextFile(konfig, 1)
    If Not f.AtEndOfStream Then
        zeile = Trim(f.ReadLine)
        If zeile <> "" Then pfad = zeile
    End If
    f.Close
End If

Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = ordner
' 0 = kein Fenster, False = nicht auf das Ende warten
shell.Run """" & pfad & """ """ & ordner & "\bruecke.py""", 0, False
