#!/usr/bin/env bash
set -euo pipefail

for key in APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY APPLE_API_KEY APPLE_API_KEY_P8 APPLE_API_ISSUER; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing public native signing configuration: $key" >&2
    exit 1
  fi
done

python3 - <<'PY'
import base64
import os
from pathlib import Path
root = Path(os.environ['RUNNER_TEMP'])
(root / 'native-certificate.p12').write_bytes(base64.b64decode(''.join(os.environ['APPLE_CERTIFICATE'].split()), validate=True))
(root / 'native-notary.p8').write_text(os.environ['APPLE_API_KEY_P8'])
PY
chmod 600 "$RUNNER_TEMP/native-certificate.p12" "$RUNNER_TEMP/native-notary.p8"
keychain="$RUNNER_TEMP/native-signing.keychain-db"
native_keychain_password="$(openssl rand -hex 32)"
security create-keychain -p "$native_keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$native_keychain_password" "$keychain"
security import "$RUNNER_TEMP/native-certificate.p12" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security -t cert -f pkcs12 -k "$keychain"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$native_keychain_password" "$keychain"
security list-keychains -d user -s "$keychain" "$HOME/Library/Keychains/login.keychain-db"
{
  echo "APPLE_SIGNING_IDENTITY=$APPLE_SIGNING_IDENTITY"
  echo "APPLE_API_KEY=$APPLE_API_KEY"
  echo "APPLE_API_ISSUER=$APPLE_API_ISSUER"
  echo "APPLE_API_KEY_PATH=$RUNNER_TEMP/native-notary.p8"
} >> "$GITHUB_ENV"
