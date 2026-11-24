; Oriel as a browser Windows knows (studio/07 4.1, studio/03 3.1,
; studio/06 1.1): the keys Chrome, Edge and Firefox write, so that Oriel is
; listed in Settings > Apps > Default apps with a page of its own, where Set
; default is at the top. Under HKCU for an install for one person, HKLM for
; one for everyone (SHELL_CONTEXT follows the install mode). No app may make
; itself the default: these keys only offer Oriel, the person chooses it.
;
; The names are those of src/main/settings/browser.ts: the value "Oriel" in
; RegisteredApplications (ms-settings:defaultapps?registeredAppUser=Oriel
; finds the page by it), OrielURL for links, OrielHTML for files. Commands
; pass the link after "--", so nothing in it can be read as a switch (what
; Chrome's --single-argument does). .pdf waits until Oriel shows PDFs.
;
; Written on every install, updates included; removed when Oriel is
; uninstalled, kept while an update replaces it.

!define ORIEL_CLIENT "Software\Clients\StartMenuInternet\Oriel"
!define ORIEL_ABOUT "A small, fast browser"

!macro orielProgId ID NAME
  WriteRegStr SHELL_CONTEXT "Software\Classes\${ID}" "" "${NAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${ID}" "FriendlyTypeName" "${NAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${ID}" "AppUserModelID" "${APP_ID}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${ID}\Application" "ApplicationName" "Oriel"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${ID}\Application" "ApplicationDescription" "${ORIEL_ABOUT}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${ID}\Application" "ApplicationIcon" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${ID}\Application" "ApplicationCompany" "Oriel contributors"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${ID}\Application" "AppUserModelID" "${APP_ID}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${ID}\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${ID}\shell\open\command" "" '"$appExe" -- "%1"'
!macroend

!macro orielFileType EXT
  WriteRegStr SHELL_CONTEXT "${ORIEL_CLIENT}\Capabilities\FileAssociations" "${EXT}" "OrielHTML"
  ; In Open with, beside the type's own app, which stays as it was.
  WriteRegStr SHELL_CONTEXT "Software\Classes\${EXT}\OpenWithProgids" "OrielHTML" ""
!macroend

!macro orielForgetFileType EXT
  DeleteRegValue SHELL_CONTEXT "Software\Classes\${EXT}\OpenWithProgids" "OrielHTML"
!macroend

!macro customInstall
  !insertmacro orielProgId "OrielURL" "Oriel URL"
  !insertmacro orielProgId "OrielHTML" "Oriel HTML Document"

  WriteRegStr SHELL_CONTEXT "${ORIEL_CLIENT}" "" "Oriel"
  WriteRegStr SHELL_CONTEXT "${ORIEL_CLIENT}\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "${ORIEL_CLIENT}\shell\open\command" "" '"$appExe"'
  WriteRegStr SHELL_CONTEXT "${ORIEL_CLIENT}\Capabilities" "ApplicationName" "Oriel"
  WriteRegStr SHELL_CONTEXT "${ORIEL_CLIENT}\Capabilities" "ApplicationDescription" "${ORIEL_ABOUT}"
  WriteRegStr SHELL_CONTEXT "${ORIEL_CLIENT}\Capabilities" "ApplicationIcon" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "${ORIEL_CLIENT}\Capabilities\StartMenu" "StartMenuInternet" "Oriel"
  WriteRegStr SHELL_CONTEXT "${ORIEL_CLIENT}\Capabilities\URLAssociations" "http" "OrielURL"
  WriteRegStr SHELL_CONTEXT "${ORIEL_CLIENT}\Capabilities\URLAssociations" "https" "OrielURL"
  ; Email links: to the webmail chosen in Settings > General.
  WriteRegStr SHELL_CONTEXT "${ORIEL_CLIENT}\Capabilities\URLAssociations" "mailto" "OrielURL"
  !insertmacro orielFileType ".htm"
  !insertmacro orielFileType ".html"
  !insertmacro orielFileType ".shtml"
  !insertmacro orielFileType ".xht"
  !insertmacro orielFileType ".xhtml"
  !insertmacro orielFileType ".svg"
  !insertmacro orielFileType ".webp"

  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "Oriel" "${ORIEL_CLIENT}\Capabilities"

  ; Explorer and Settings read the new associations at once.
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "Oriel"
    DeleteRegKey SHELL_CONTEXT "${ORIEL_CLIENT}"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\OrielURL"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\OrielHTML"
    !insertmacro orielForgetFileType ".htm"
    !insertmacro orielForgetFileType ".html"
    !insertmacro orielForgetFileType ".shtml"
    !insertmacro orielForgetFileType ".xht"
    !insertmacro orielForgetFileType ".xhtml"
    !insertmacro orielForgetFileType ".svg"
    !insertmacro orielForgetFileType ".webp"
  ${endIf}
!macroend
