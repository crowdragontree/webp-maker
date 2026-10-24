#!/bin/sh
# Portable Linux updater. Runs from userData outside the app directory.
set -eu
parent_pid="$1"; target="$2"; stage="$3"; backup="$4"; executable="$5"; logfile="$6"
log() { printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1" >> "$logfile"; }
log "Waiting for old WebP Maker process $parent_pid to exit"
i=0
while kill -0 "$parent_pid" 2>/dev/null && [ "$i" -lt 120 ]; do
  sleep 0.5
  i=$((i + 1))
done
if kill -0 "$parent_pid" 2>/dev/null; then
  log 'UPDATE FAILED: old app is still running; nothing changed'
  exit 1
fi
if [ ! -d "$target" ] || [ ! -f "$stage/$executable" ] || [ -e "$backup" ]; then
  log 'UPDATE FAILED: invalid install path, staging folder, or backup path; nothing changed'
  exit 1
fi
if ! mv -- "$target" "$backup"; then
  log 'UPDATE FAILED: could not move previous version; nothing changed'
  exit 1
fi
if ! mv -- "$stage" "$target"; then
  mv -- "$backup" "$target" || true
  log 'UPDATE FAILED: could not install downloaded version; attempted rollback'
  exit 1
fi
chmod +x "$target/$executable" || true
log 'Update installed; starting new version'
nohup "$target/$executable" </dev/null >/dev/null 2>&1 &
log 'New version launched. Old version will be cleaned up after successful startup.'
exit 0
