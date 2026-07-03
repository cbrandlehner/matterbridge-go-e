#!/usr/bin/env bash
# setup-dev.sh — Bootstrap local Matterbridge + matterbridge-go-e dev environment
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MATTERBRIDGE_DIR="${MATTERBRIDGE_DIR:-$HOME/matterbridge}"
PLUGIN_DIR="$ROOT"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install nvm and Node 22 first:"
  echo "  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"
  echo "  nvm install 22"
  exit 1
fi

echo "==> Node $(node -v), npm $(npm -v)"

if [ ! -d "$MATTERBRIDGE_DIR/.git" ]; then
  echo "==> Cloning Matterbridge (dev branch) to $MATTERBRIDGE_DIR"
  git clone --depth 1 --single-branch -b dev https://github.com/Luligu/matterbridge.git "$MATTERBRIDGE_DIR"
fi

echo "==> Building Matterbridge"
cd "$MATTERBRIDGE_DIR"
npm install --no-fund --no-audit
npm run build
cd apps/frontend
npm install --no-fund --no-audit
npm run build
cd "$MATTERBRIDGE_DIR"
npm link --no-fund --no-audit

echo "==> Setting up plugin at $PLUGIN_DIR"
cd "$PLUGIN_DIR"
npm install --no-fund --no-audit
npm install modbus-serial bonjour-service --no-fund --no-audit
npm link matterbridge --no-fund --no-audit
npm run build

mkdir -p "$HOME/Matterbridge"
mkdir -p "$HOME/.matterbridge"

echo "==> Registering plugin with Matterbridge"
matterbridge --add "$PLUGIN_DIR" || true

echo ""
echo "Dev environment ready."
echo ""
echo "  Matterbridge repo:  $MATTERBRIDGE_DIR"
echo "  Plugin repo:        $PLUGIN_DIR"
echo "  Matterbridge data:  $HOME/.matterbridge"
echo "  Plugins folder:     $HOME/Matterbridge"
echo ""
echo "Start Matterbridge:"
echo "  matterbridge -frontend 8283"
echo ""
echo "Rebuild plugin after changes:"
echo "  cd $PLUGIN_DIR && npm run build"
echo ""
echo "Run tests:"
echo "  cd $PLUGIN_DIR && npm run test:vitest"
echo ""
echo "Enable Modbus on your go-e charger (one-time, if not done):"
echo "  curl 'http://192.168.71.121/api/set?men=true'"