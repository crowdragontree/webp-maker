#!/bin/sh
set -eu
parent_pid="$1"; target="$2"; stage="$3"; backup="$4"; executable="$5"; logfile="$6"
log(){ printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1" >> "$logfile"; }
i=0
while kill -0 "$parent_pid" 2>/dev/null && [ "$i" -lt 240 ]; do sleep .5; i=$((i+1)); done
if kill -0 "$parent_pid" 2>/dev/null; then log 'UPDATE FAILED: prior version still running'; exit 1; fi
if [ ! -d "$target" ] || [ ! -f "$stage/$executable" ] || [ -e "$backup" ]; then log 'UPDATE FAILED: invalid source/target'; exit 1; fi
if ! mv -- "$target" "$backup"; then log 'UPDATE FAILED: cannot move old version'; exit 1; fi
if ! mv -- "$stage" "$target"; then mv -- "$backup" "$target" || true; log 'UPDATE FAILED: attempted rollback';exit 1;fi
chmod +x "$target/$executable" || true
log 'Updated; launching Juicy Chat Creator Tools'
nohup "$target/$executable" </dev/null >/dev/null 2>&1 &
log 'App launched. Old version kept as backup.'
