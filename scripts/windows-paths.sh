#!/usr/bin/env bash
# Sourced by deploy.sh.

KERNEL_RELEASE_FILE=/proc/sys/kernel/osrelease
if ! grep -qi microsoft "$KERNEL_RELEASE_FILE" 2>/dev/null; then
    echo "This script works only in WSL. On macOS, copy the plugin folder by hand." >&2
    exit 1
fi

PLUGIN_UUID=com.nocture.prvitals
PLUGIN_FOLDER="$PLUGIN_UUID.sdPlugin"

windowsEnv() {
    local value
    value=$( (cd /mnt/c && cmd.exe /c "echo %$1%" 2>/dev/null) | tr -d '\r') || true
    # cmd.exe prints the name itself, such as %APPDATA%, when the variable does not exist.
    if [[ -z $value || $value == "%$1%" ]]; then
        echo "Could not read the Windows variable %$1% from cmd.exe." >&2
        exit 1
    fi
    printf '%s\n' "$value"
}

APPDATA_WINDOWS=$(windowsEnv APPDATA) || exit 1
WINDOWS_APPDATA=$(wslpath "$APPDATA_WINDOWS")
STREAMDECK_PLUGINS_DIR="$WINDOWS_APPDATA/Elgato/StreamDeck/Plugins"
STREAMDECK_PLUGIN_DIR="$STREAMDECK_PLUGINS_DIR/$PLUGIN_FOLDER"
# The plugin folder that receives the build. PR_VITALS_DEPLOY_DIR names another folder to hold it, for example one
# that a sync program shares with a second PC.
# The deploy deletes old files in DEPLOY_DIR, so it always ends in the plugin folder name.
DEPLOY_PARENT_DIR="${PR_VITALS_DEPLOY_DIR:-$STREAMDECK_PLUGINS_DIR}"
DEPLOY_PARENT_DIR="${DEPLOY_PARENT_DIR%/}"
if [ "$(basename "$DEPLOY_PARENT_DIR")" = "$PLUGIN_FOLDER" ]; then
    echo "PR_VITALS_DEPLOY_DIR must be the folder that holds $PLUGIN_FOLDER, not that folder itself. Use $(dirname "$DEPLOY_PARENT_DIR")." >&2
    exit 1
fi
DEPLOY_DIR="$DEPLOY_PARENT_DIR/$PLUGIN_FOLDER"
STREAMDECK_PROCESS=StreamDeck.exe
STREAMDECK_APP_WINDOWS='C:\Program Files\Elgato\StreamDeck\StreamDeck.exe'

