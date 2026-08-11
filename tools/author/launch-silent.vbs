' Silent double-click launcher for the ChazzasBlog local authoring tool.
'
' Unlike "Launch Author Tool.bat" (which still exists for manual/debug use
' and shows a console window), this launches with NO visible window at all
' except the actual app window itself. If Node.js can't be found, it shows
' a real popup instead of failing invisibly - the one thing that must stay
' visible no matter what.
'
' This never touches git itself; it only starts the local server that the
' article form/manage pages talk to. Publishing to GitHub still requires an
' explicit click inside the tool, same as always.

Option Explicit

Dim shell, toolDir, batPath, exitCode

Set shell = CreateObject("WScript.Shell")

toolDir = "C:\Dev\ChazzasBlog\tools\author"
batPath = toolDir & "\Launch Author Tool.bat"

' Check Node.js is reachable BEFORE going silent, so a missing install
' produces a clear message instead of the icon just doing nothing.
exitCode = shell.Run("cmd /c where node >nul 2>nul", 0, True)
If exitCode <> 0 Then
  MsgBox "Node.js was not found on this computer." & vbCrLf & vbCrLf & _
         "Install it from https://nodejs.org/ and then try again.", _
         vbExclamation, "Chazza's Blog - Article Editor"
  WScript.Quit 1
End If

shell.CurrentDirectory = toolDir
shell.Run """" & batPath & """", 0, False
