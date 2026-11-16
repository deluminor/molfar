#!/usr/bin/env bash
set -euo pipefail

keys=(APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY APPLE_API_KEY APPLE_API_KEY_P8 APPLE_API_ISSUER)
missing=()
for key in "${keys[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    missing+=("$key")
  fi
done

if [[ ${#missing[@]} -eq ${#keys[@]} ]]; then
  echo "::notice::No Apple credentials are configured; macOS packages are ad-hoc signed and not notarized."
  echo "MOLFAR_NATIVE_MAC_SIGNING=adhoc" >> "$GITHUB_ENV"
  exit 0
fi

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Incomplete public native signing configuration: ${missing[*]}" >&2
  exit 1
fi

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
