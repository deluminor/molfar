import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Plus } from "@/shared/ui/icons";
import type {
  MobileInvite as Invite,
  MobileStatus as Status,
} from "../types/mobile-access";
import { MobileDeviceList } from "./MobileDeviceList";
import { MobileRemoteAccess } from "./MobileRemoteAccess";
import { MOBILE_BUTTON as button } from "./mobile-settings-styles";
import { PairPhoneDialog } from "./PairPhoneDialog";

export function MobileSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [remote, setRemote] = useState("");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [image, setImage] = useState("");
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  /** Device ids already paired when the visible code was made. */
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    let disposed = false;
    let initial = true;
    const load = async () => {
      try {
        const next = await invoke<Status>("mobile_status");
        if (!next) throw new Error("Desktop mobile service is unavailable");
        if (!disposed) {
          if (initial) setRemote(next.remoteAddress);
          initial = false;
          setStatus(next);
        }
      } catch (reason) {
        if (!disposed) setError(String(reason));
      }
    };
    void load();
    const timer = setInterval(() => void load(), 2000);
    return () => {
      disposed = true;
      clearInterval(timer);
      void invoke("mobile_cancel_invite");
    };
  }, []);

  // A phone that appears while the code is showing just paired with it.
  useEffect(() => {
    const knownIds = known.current;
    if (!invite || !status || !knownIds) return;
    const paired = status.devices.find((device) => !knownIds.has(device.id));
    if (!paired) return;
    known.current = null;
    setInvite(null);
    setNotice(`${paired.name} is paired.`);
    void invoke("mobile_cancel_invite");
  }, [invite, status]);

  useEffect(() => {
    let disposed = false;
    if (!invite) {
      setImage("");
      return;
    }
    void QRCode.toDataURL(invite.url, {
      width: 720,
      margin: 2,
      errorCorrectionLevel: "L",
    })
      .then((value) => {
        if (!disposed) setImage(value);
      })
      .catch((reason) => setError(String(reason)));
    return () => {
      disposed = true;
    };
  }, [invite]);

  useEffect(() => {
    if (!invite) return;
    setNow(Date.now() / 1000);
    const timer = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, [invite]);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setStatus(await invoke<Status>("mobile_status"));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  const configure = (enabled: boolean, openRouter: boolean) =>
    invoke("mobile_configure", { enabled, openRouter, remoteAddress: remote });
  // The desktop only listens while a phone is paired or being paired.
  const stopListening = () => configure(false, status?.openRouter ?? false);
  const pair = () =>
    act(async () => {
      if (!status?.enabled || !status.listening)
        await configure(true, status?.openRouter ?? false);
      known.current = new Set(status?.devices.map((device) => device.id));
      setInvite(await invoke<Invite>("mobile_invite"));
    });
  const closeInvite = () =>
    act(async () => {
      await invoke("mobile_cancel_invite");
      known.current = null;
      setInvite(null);
      if (!status?.devices.length) await stopListening();
    });

  const devices = status?.devices ?? [];
  const left = invite ? Math.max(0, Math.floor(invite.expires - now)) : 0;

  return (
    <div
      data-setting-id="mobile-access"
      className="mt-10 flex flex-col gap-5 border-t border-stroke pt-8"
    >
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[13px] font-semibold text-content">
              Your phones
            </h2>
            <span className="rounded-md border border-content/10 bg-content/5 px-1.5 py-0.5 text-[10px] font-medium text-content/60">
              Invite-only beta
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-content/45">
            Check on projects and conversations from the MOLFAR mobile app. Your
            phone connects straight to this desktop.
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-content/45">
            The iPhone app currently requires a TestFlight invitation.
          </p>
        </div>
        <button
          type="button"
          className={`${button} flex shrink-0 items-center gap-2`}
          disabled={!status || busy || invite !== null}
          onClick={() => void pair()}
        >
          <Plus className="size-4" /> Pair phone
        </button>
      </div>

      {invite && (
        <PairPhoneDialog
          image={image}
          url={invite.url}
          left={left}
          busy={busy}
          onNewCode={() => void pair()}
          onError={setError}
          onClose={() => void closeInvite()}
        />
      )}

      {status && devices.length > 0 && !status.listening ? (
        <div className="flex items-center justify-between gap-4 rounded-lg bg-amber-500/5 px-4 py-3 text-[12px] text-amber-500">
          Your phones can’t connect because this desktop isn’t accepting
          connections right now.
          <button
            type="button"
            className={`${button} shrink-0 text-content`}
            disabled={busy}
            onClick={() => void act(() => configure(true, status.openRouter))}
          >
            Reconnect
          </button>
        </div>
      ) : null}

      {devices.length > 0 ? (
        <MobileDeviceList
          devices={devices}
          busy={busy}
          onStartRemove={() => setError("")}
          onRemove={(device) =>
            act(async () => {
              await invoke("mobile_revoke", { deviceId: device.id });
              if (devices.length === 1 && !invite) await stopListening();
              setNotice(`${device.name} was removed.`);
            })
          }
        />
      ) : status ? (
        <div className="rounded-xl border border-dashed border-content/15 px-5 py-8 text-center text-[13px] text-content/45">
          Pair your iPhone or Android phone to get started.
        </div>
      ) : null}

      {error && (
        <p
          role="alert"
          className="whitespace-pre-wrap break-words rounded-lg bg-red-500/5 p-3 text-[12px] leading-relaxed text-red-400"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-[13px] text-emerald-500">
          {notice}
        </p>
      )}

      {status ? (
        <MobileRemoteAccess
          status={status}
          busy={busy}
          remote={remote}
          onRemoteChange={setRemote}
          onConfigure={(enabled, openRouter) =>
            void act(() => configure(enabled, openRouter))
          }
        />
      ) : null}
    </div>
  );
}
