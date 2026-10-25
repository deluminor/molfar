import { useState } from "react";
import { SmartPhone, Trash2 } from "@/shared/ui/icons";
import type { Device } from "../types/mobile-access";
import {
  MOBILE_BUTTON as button,
  MOBILE_QUIET as quiet,
} from "./mobile-settings-styles";

/** Paired phones, each removable after a confirmation. */
export function MobileDeviceList({
  devices,
  busy,
  onStartRemove,
  onRemove,
}: {
  devices: Device[];
  busy: boolean;
  onStartRemove: () => void;
  onRemove: (device: Device) => Promise<void>;
}) {
  const [removing, setRemoving] = useState<string>();

  return (
    <div className="divide-y divide-stroke overflow-hidden rounded-xl border border-stroke">
      {devices.map((device) => (
        <div key={device.id}>
          <div className="flex items-center gap-3 px-4 py-4">
            <SmartPhone className="size-5 shrink-0 text-content/45" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">
                {device.name}
              </div>
              <div className="mt-1 text-[12px] text-content/50">Paired</div>
            </div>
            <button
              type="button"
              disabled={busy}
              className="rounded p-2 text-content/40 hover:bg-selection hover:text-content disabled:opacity-40"
              aria-label={`Remove ${device.name}`}
              title="Remove phone…"
              onClick={() => {
                onStartRemove();
                setRemoving(device.id);
              }}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          {removing === device.id && (
            <fieldset
              aria-label={`Confirm removing ${device.name}`}
              className="flex min-w-0 flex-col gap-3 border-t border-stroke bg-content/3 px-4 py-4 text-[12px] leading-relaxed text-content/60"
            >
              <p className="text-[13px] font-medium text-content">
                Remove {device.name}?
              </p>
              <p>
                It disconnects right away and can’t reach this desktop again
                until you pair it with a new code.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={button}
                  disabled={busy}
                  onClick={() =>
                    void onRemove(device).then(() => setRemoving(undefined))
                  }
                >
                  Remove phone
                </button>
                <button
                  type="button"
                  className={quiet}
                  disabled={busy}
                  onClick={() => setRemoving(undefined)}
                >
                  Cancel
                </button>
              </div>
            </fieldset>
          )}
        </div>
      ))}
    </div>
  );
}
