!include LogicLib.nsh

!ifndef BUILD_UNINSTALLER

Var installerShellCompleted
Var installerShellDeleteSetupFile
Var installerShellLocale

Function LaunchInstallerShell
  FileOpen $9 "$TEMP\YumeShelf-installer-debug.log" a
  FileWrite $9 "LaunchInstallerShell begin$\r$\n"
  FileClose $9
  StrCpy $installerShellCompleted "0"
  StrCpy $installerShellDeleteSetupFile "true"
  StrCpy $installerShellLocale ""

  InitPluginsDir
  SetOutPath $PLUGINSDIR

  StrCpy $0 "$PLUGINSDIR\installer-shell-handshake.ini"
  Delete "$0"
  WriteINIStr "$0" "input" "mode" "manual-install"
  WriteINIStr "$0" "input" "defaultInstallDir" "$INSTDIR"
  WriteINIStr "$0" "input" "installerPath" "$EXEPATH"
  WriteINIStr "$0" "input" "systemLocale" ""

  File /oname=$PLUGINSDIR\YumeShelfInstallerShell.exe "${PROJECT_DIR}\build\installer-shell-dist\YumeShelfInstallerShell.exe"

  ClearErrors
  ExecWait '"$PLUGINSDIR\YumeShelfInstallerShell.exe" --installer-handshake "$0"' $1
  FileOpen $9 "$TEMP\YumeShelf-installer-debug.log" a
  FileWrite $9 "LaunchInstallerShell returned$\r$\n"
  FileClose $9
  ${If} ${Errors}
    MessageBox MB_ICONSTOP|MB_OK "YumeShelf could not start the setup experience."
    SetErrorLevel 0
    Quit
  ${EndIf}

  ReadINIStr $2 "$0" "result" "action"
  FileOpen $9 "$TEMP\YumeShelf-installer-debug.log" a
  FileWrite $9 "LaunchInstallerShell action=$2$\r$\n"
  FileClose $9
  ${If} "$2" == "cancel"
    SetErrorLevel 0
    Quit
  ${EndIf}

  ${If} "$2" != "continue"
    MessageBox MB_ICONSTOP|MB_OK "YumeShelf setup did not return a valid install action."
    SetErrorLevel 0
    Quit
  ${EndIf}

  ReadINIStr $3 "$0" "result" "installDir"
  ${If} "$3" == ""
    MessageBox MB_ICONSTOP|MB_OK "YumeShelf setup did not return an install folder."
    SetErrorLevel 0
    Quit
  ${EndIf}

  ReadINIStr $installerShellDeleteSetupFile "$0" "result" "deleteSetupFile"
  ReadINIStr $installerShellLocale "$0" "result" "locale"
  FileOpen $9 "$TEMP\YumeShelf-installer-debug.log" a
  FileWrite $9 "LaunchInstallerShell installDir=$3 deleteSetupFile=$installerShellDeleteSetupFile locale=$installerShellLocale$\r$\n"
  FileClose $9
  StrCpy $INSTDIR "$3"
  StrCpy $installerShellCompleted "1"
FunctionEnd

Function WriteInstallerFirstLaunchMarker
  ${If} "$installerShellCompleted" != "1"
    Return
  ${EndIf}

  CreateDirectory "$APPDATA\YumeShelf"
  Delete "$APPDATA\YumeShelf\install-handoff.ini"
  WriteINIStr "$APPDATA\YumeShelf\install-handoff.ini" "install" "source" "$EXEPATH"
  WriteINIStr "$APPDATA\YumeShelf\install-handoff.ini" "install" "deleteSetupFile" "$installerShellDeleteSetupFile"
  WriteINIStr "$APPDATA\YumeShelf\install-handoff.ini" "install" "locale" "$installerShellLocale"
FunctionEnd

!macro customInit
  FileOpen $9 "$TEMP\YumeShelf-installer-debug.log" a
  FileWrite $9 "customInit begin$\r$\n"
  FileClose $9
  !ifndef ONE_CLICK
  StrCpy $isForceCurrentInstall "1"
  !endif
  ${IfNot} ${Silent}
  ${AndIfNot} ${isUpdated}
    Call LaunchInstallerShell
  ${EndIf}
  FileOpen $9 "$TEMP\YumeShelf-installer-debug.log" a
  FileWrite $9 "customInit end installerShellCompleted=$installerShellCompleted INSTDIR=$INSTDIR$\r$\n"
  FileClose $9
!macroend

!macro customInstall
  ${IfNot} ${isUpdated}
    Call WriteInstallerFirstLaunchMarker
    !insertmacro copyFile "$EXEPATH" "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
    FileOpen $9 "$TEMP\YumeShelf-installer-debug.log" a
    FileWrite $9 "customInstall cachedInstaller=$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}$\r$\n"
    FileClose $9
  ${EndIf}
!macroend

!endif
