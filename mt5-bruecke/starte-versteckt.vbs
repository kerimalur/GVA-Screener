' Startet die Bruecke OHNE Fenster.
'
' pythonw.exe statt python.exe: das ist derselbe Interpreter ohne Konsole.
' Damit laeuft nichts sichtbar in der Taskleiste und nichts kann versehentlich
' weggeklickt werden. Sehen kann man den Lauf trotzdem — in lauf.log, die die
' Bruecke immer mitschreibt.
'
' Doppelklick startet sie. Beenden: Task-Manager -> Details -> pythonw.exe.
'
' Fuer den Autostart: Win+R, "shell:startup", diese Datei dorthin verknuepfen.
' Dann startet sie bei jeder Anmeldung. Erst einrichten, wenn sie ein paar Tage
' von Hand lief — sonst sucht man einen Fehler in einem Programm, das man nicht
' sieht.

Set fso = CreateObject("Scripting.FileSystemObject")
ordner = fso.GetParentFolderName(WScript.ScriptFullName)

Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = ordner
' 0 = kein Fenster, False = nicht auf das Ende warten
shell.Run "pythonw.exe """ & ordner & "\bruecke.py""", 0, False
