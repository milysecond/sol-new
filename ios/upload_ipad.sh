#!/bin/bash
set -e
cd /Volumes/PRO-G40/solnew/sol-new/ios

SCREENSHOT_SET_ID="2bb768a8-481e-4c86-a16e-a9f94c013d95"
IPAD_DIR="screenshots-ipad"

asc_json() {
  node _asc.mjs "$@" | tail -n +2
}

for f in screenshot-token-ipad screenshot-launches-ipad; do
  IMG="${IPAD_DIR}/${f}.png"
  if [ ! -f "$IMG" ]; then echo "Skip $IMG (not found)"; continue; fi

  SIZE=$(stat -f%z "$IMG")
  MD5=$(md5 -q "$IMG")

  echo "==> Reserving $f ($SIZE bytes)"
  RESERVE=$(asc_json POST /v1/appScreenshots \
    "{\"data\":{\"type\":\"appScreenshots\",\"attributes\":{\"fileName\":\"${f}.png\",\"fileSize\":${SIZE}},\"relationships\":{\"appScreenshotSet\":{\"data\":{\"type\":\"appScreenshotSets\",\"id\":\"${SCREENSHOT_SET_ID}\"}}}}}")

  SS_ID=$(echo "$RESERVE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['id'])")
  UPLOAD_URL=$(echo "$RESERVE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['attributes']['uploadOperations'][0]['url'])")

  echo "  ID: $SS_ID"
  echo "==> Uploading..."
  curl -s -X PUT "$UPLOAD_URL" \
    -H "Content-Type: image/png" \
    -H "Content-Length: $SIZE" \
    --data-binary "@$IMG" > /dev/null

  echo "==> Committing (md5=$MD5)..."
  asc_json PATCH "/v1/appScreenshots/${SS_ID}" \
    "{\"data\":{\"type\":\"appScreenshots\",\"id\":\"${SS_ID}\",\"attributes\":{\"uploaded\":true,\"sourceFileChecksum\":\"${MD5}\"}}}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('  state:', d['data']['attributes'].get('assetDeliveryState',{}).get('state','?'))"

  echo "Done: $f"
done
