; prereq-check.nsh — NSIS post-install steps for MedOps Console installer
; MedOps bundles its own embedded PostgreSQL instance via the embedded-postgres
; package — no external PostgreSQL installation is required or expected.

!macro customInstall
  ; No external prerequisites: the app ships with an embedded database.
  ; Data is stored in the user's AppData folder and initialised on first launch.
!macroend

!macro customUnInstall
  ; Nothing special needed on uninstall
!macroend
