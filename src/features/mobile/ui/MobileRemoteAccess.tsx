import type { MobileStatus } from "../types/mobile-access";
import {
  MOBILE_BUTTON as button,
  MOBILE_INPUT as input,
} from "./mobile-settings-styles";

/** Reaching this desktop away from the phone's Wi-Fi: router mapping and a remote address. */
export function MobileRemoteAccess({
  status,
  busy,
  remote,
  onRemoteChange,
  onConfigure,
}: {
  status: MobileStatus;
  busy: boolean;
  remote: string;
  onRemoteChange: (remote: string) => void;
  onConfigure: (enabled: boolean, openRouter: boolean) => void;
}) {
  return (
    <details className="text-[12px] text-content/45">
      <summary className="cursor-pointer">Connect away from home</summary>
      <div className="mt-4 flex flex-col gap-3 leading-relaxed">
        <p>
          On the same Wi-Fi, phones connect without any setup. To reach this
          desktop from anywhere else, it needs a public address. Keep the
          desktop awake.
        </p>
        <label className="flex items-center gap-2 text-[13px] text-content/70">
          <input
            type="checkbox"
            checked={status.openRouter}
            disabled={busy}
            onChange={(event) =>
              onConfigure(status.enabled, event.target.checked)
            }
          />
          Open the router port automatically
        </label>
        <p>{status.routerStatus}</p>
        <div className="flex flex-col gap-1.5 text-content/65">
          Remote address
          <div className="flex gap-2">
            <input
              type="text"
              aria-label="Remote address"
              className={input}
              value={remote}
              onChange={(event) => onRemoteChange(event.target.value)}
              placeholder="Public hostname or VPN IP, optionally :port"
              autoCapitalize="none"
              spellCheck={false}
            />
            <button
              type="button"
              className={`${button} shrink-0`}
              disabled={busy || remote.trim() === status.remoteAddress}
              onClick={() => onConfigure(status.enabled, status.openRouter)}
            >
              Save
            </button>
          </div>
        </div>
        <p>
          Automatic mapping needs a public IP. Otherwise, forward UDP port 38416
          to this desktop or use a VPN address. Set the address before making a
          pairing code.
        </p>
      </div>
    </details>
  );
}
