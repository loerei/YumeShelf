!macro customInstallmode
  FileOpen $0 "$TEMP\YumeShelf-installer-debug.log" a
  FileWrite $0 "customInstallmode before force isForceCurrentInstall=$isForceCurrentInstall$\r$\n"
  FileClose $0
  StrCpy $isForceCurrentInstall "1"
  FileOpen $0 "$TEMP\YumeShelf-installer-debug.log" a
  FileWrite $0 "customInstallmode after force isForceCurrentInstall=$isForceCurrentInstall$\r$\n"
  FileClose $0
!macroend
