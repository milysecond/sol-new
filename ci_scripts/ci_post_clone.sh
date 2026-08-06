#!/bin/sh
set -euo pipefail
echo "[ci_post_clone] repo root: $(pwd)"
echo "[ci_post_clone] listing ios:"
ls -la ios || true

# Prefer committed xcodeproj; regenerate if missing and xcodegen is available
if [ ! -f "ios/sol-new.xcodeproj/project.pbxproj" ]; then
  echo "[ci_post_clone] xcodeproj missing — trying xcodegen"
  if command -v brew >/dev/null 2>&1; then
    brew install xcodegen || true
  fi
  if command -v xcodegen >/dev/null 2>&1; then
    (cd ios && xcodegen generate)
  fi
fi

if [ ! -f "ios/sol-new.xcodeproj/project.pbxproj" ]; then
  echo "[ci_post_clone] ERROR: ios/sol-new.xcodeproj still missing."
  echo "[ci_post_clone] Xcode Cloud must build branch 'main' (ios/ lives there), not an empty master."
  exit 1
fi

echo "[ci_post_clone] OK: $(ls ios/sol-new.xcodeproj)"
