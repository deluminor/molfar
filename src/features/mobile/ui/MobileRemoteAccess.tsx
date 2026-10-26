import type { MobileStatus } from "../types/mobile-access";
import {
  MOBILE_BUTTON as button,
  MOBILE_INPUT as input,
} from "./mobile-settings-styles";

/** Reaching this desktop away from the phone's Wi-Fi through an address the user chose, such as Tailscale. */
export function MobileRemoteAccess({
  status,
  busy,
  remote,
  onRemoteChange,
  onSave,
}: {
  status: MobileStatus;
  busy: boolean;
  remote: string;
  onRemoteChange: (remote: string) => void;
  onSave: () => void;
}) {
  return (
    <details className="text-[12px] text-content/45">
      <summary className="cursor-pointer">Connect away from home</summary>
      <div className="mt-4 flex flex-col gap-3 leading-relaxed">
        <p>
          On the same Wi-Fi, phones connect without any setup. MOLFAR never
          opens a port on your router. To reach this desktop from elsewhere,
          put both devices on Tailscale or another VPN and enter this
          desktop’s VPN address. Keep the desktop awake.
        </p>
        <div className="flex flex-col gap-1.5 text-content/65">
          Remote address
          <div className="flex gap-2">
            <input
              type="text"
              aria-label="Remote address"
              className={input}
              value={remote}
              onChange={(event) => onRemoteChange(event.target.value)}
              placeholder="Tailscale or VPN address, optionally :port"
              autoCapitalize="none"
              spellCheck={false}
            />
            <button
              type="button"
              className={`${button} shrink-0`}
              disabled={busy || remote.trim() === status.remoteAddress}
              onClick={onSave}
            >
              Save
            </button>
          </div>
        </div>
        <p>
          The phone tries this address first. Set it before making a pairing
          code.
        </p>
      </div>
    </details>
  );
}
