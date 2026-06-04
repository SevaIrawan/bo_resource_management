#!/usr/bin/env bash
# Build installer — macOS atau Linux
# Usage: bash scripts/build-installer.sh [mac|linux]

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  case "$(uname -s)" in
    Darwin) TARGET="mac" ;;
    Linux) TARGET="linux" ;;
    *) echo "ERROR: tentukan target: mac atau linux"; exit 1 ;;
  esac
fi

node scripts/build-installer.mjs "$TARGET"
