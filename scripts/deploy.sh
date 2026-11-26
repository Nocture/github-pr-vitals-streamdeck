#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_DIR=$(dirname "$SCRIPT_DIR")
source "$SCRIPT_DIR/windows-paths.sh"

if [ ! -d "$DEPLOY_PARENT_DIR" ]; then
    echo "$DEPLOY_PARENT_DIR is missing. Is Stream Deck installed on this PC, or is PR_VITALS_DEPLOY_DIR wrong?" >&2
    exit 1
fi

cd "$REPO_DIR"
source "$SCRIPT_DIR/use-node.sh"
set -u
# Type check, tests, build and manifest check. A failure stops the deploy before anything is copied.
npm run check

mkdir -p "$DEPLOY_DIR"
rsync -a --delete --exclude logs/ "$PLUGIN_FOLDER/" "$DEPLOY_DIR/"
echo "Deployed to $DEPLOY_DIR"

isStreamDeckRunning() {
    (cd /mnt/c && tasklist.exe /FI "IMAGENAME eq $STREAMDECK_PROCESS" /NH 2>/dev/null) | grep -qi "$STREAMDECK_PROCESS"
}

# A restart of the whole app, because Stream Deck ignores the streamdeck://plugins/restart request that comes from WSL.
# The stop is forced: a change that is being typed in the Stream Deck window at that moment is lost.
restartStreamDeck() {
    local waitedSeconds=0
    (cd /mnt/c && taskkill.exe /IM "$STREAMDECK_PROCESS" /F /T >/dev/null 2>&1) || true
    while isStreamDeckRunning && ((waitedSeconds < STOP_TIMEOUT_SECONDS)); do
        sleep 1
        waitedSeconds=$((waitedSeconds + 1))
    done
    # Start-Process, not `cmd.exe /c start`: the app must not inherit this script's output, or the script never ends.
    (cd /mnt/c && powershell.exe -NoProfile -Command "Start-Process -FilePath '$STREAMDECK_APP_WINDOWS'")
    echo "Restarted Stream Deck"
}

STOP_TIMEOUT_SECONDS=10
if [ -e "$STREAMDECK_PLUGIN_DIR" ] && [ -e "$(wslpath "$STREAMDECK_APP_WINDOWS")" ]; then
    restartStreamDeck
fi
