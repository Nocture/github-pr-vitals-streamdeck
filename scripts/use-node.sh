# Source this file from any folder. It makes sure that the Node version of .nvmrc is active.
# It uses nvm only when another version is active, so any Node version manager works.
useNodeOfNvmrc() {
    local requiredMajor activeVersion repositoryFolder
    repositoryFolder=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
    requiredMajor=$(tr -d 'v[:space:]' < "$repositoryFolder/.nvmrc")
    requiredMajor=${requiredMajor%%.*}
    activeVersion=$(node -v 2>/dev/null) || activeVersion=""
    if [[ $activeVersion == "v$requiredMajor."* ]]; then
        return 0
    fi

    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        # nvm.sh reads unset variables, so it fails under `set -u`.
        set +u
        source "$NVM_DIR/nvm.sh"
        nvm use "$requiredMajor" >/dev/null
        return
    fi

    echo "Node $requiredMajor is needed (see .nvmrc), and the active Node is ${activeVersion:-missing}. Install it with your Node version manager." >&2
    return 1
}

useNodeOfNvmrc
