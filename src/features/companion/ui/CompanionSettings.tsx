import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { Loader, Trash2 } from "../../../shared/ui/icons";

type BindMode = "serve" | "tailnet";

type CompanionStatus = {
  enabled: boolean;
  running: boolean;
  mode: BindMode;
  port: number;
  publicUrl: string | null;
  effectiveUrl: string | null;
  listenAddr: string | null;
  error: string | null;
  tailscale: { ip: string | null; dnsName: string | null };
  devices: {
    id: string;
    name: string;
    createdAt: number;
    lastSeenAt: number | null;
  }[];
};

type PairingOffer = {
  code: string;
  url: string;
  link: string;
  qrSvg: string;
  expiresAt: number;
};

const input =
  "w-full rounded-lg border border-content/15 bg-content/3 px-3 py-2 text-[13px] outline-none focus:border-content/35";
const button =
  "rounded-lg bg-selection px-3 py-2 text-[13px] font-medium hover:bg-selection-hover disabled:opacity-40";

function ago(at: number | null): string {
  if (!at) return "never";
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return new Date(at).toLocaleDateString();
}

export function CompanionSettings() {
  const [status, setStatus] = useState<CompanionStatus>();
  const [mode, setMode] = useState<BindMode>("serve");
  const [port, setPort] = useState("3775");
  const [publicUrl, setPublicUrl] = useState("");
  const [offer, setOffer] = useState<PairingOffer>();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const adopt = useCallback((next: CompanionStatus) => {
    setStatus(next);
    setMode(next.mode);
    setPort(String(next.port));
    setPublicUrl(next.publicUrl ?? "");
  }, []);

  const refresh = useCallback(async () => {
    try {
      adopt(await invoke<CompanionStatus>("companion_status"));
    } catch (reason) {
      setError(String(reason));
    }
  }, [adopt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Tick the countdown, and pick up the device that just paired.
  useEffect(() => {
    if (!offer) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void invoke<CompanionStatus>("companion_status").then((next) => {
        if (status && next.devices.length > status.devices.length) {
          setOffer(undefined);
          adopt(next);
        }
      });
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [offer, status, adopt]);

  useEffect(
    () => () => {
      void invoke("companion_pair_cancel").catch(() => {});
    },
    [],
  );

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const configure = (enabled: boolean) =>
    run(async () => {
      const parsed = Number(port);
      if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535)
        throw new Error("Use a port from 1024 to 65535");
      setOffer(undefined);
      adopt(
        await invoke<CompanionStatus>("companion_configure", {
          config: { enabled, mode, port: parsed, publicUrl: publicUrl.trim() || null },
        }),
      );
    });

  const pair = () =>
    run(async () => {
      setOffer(await invoke<PairingOffer>("companion_pair_start"));
      setNow(Date.now());
    });

  const revoke = (deviceId: string) =>
    run(async () => {
      adopt(await invoke<CompanionStatus>("companion_revoke", { deviceId }));
    });

  if (!status)
    return (
      <div className="flex flex-col gap-6">
        <section
          data-setting-id="companion-gateway"
          className="flex items-center gap-2 text-[12px] text-content/45"
        >
          {error || (
            <>
              <Loader className="size-4 animate-spin" /> Loading…
            </>
          )}
        </section>
        <section data-setting-id="companion-devices" />
      </div>
    );

  const expired = offer && offer.expiresAt <= now;
  const seconds = offer ? Math.max(0, Math.round((offer.expiresAt - now) / 1000)) : 0;
  const dirty =
    mode !== status.mode ||
    port !== String(status.port) ||
    publicUrl.trim() !== (status.publicUrl ?? "");

  return (
    <div className="flex flex-col gap-6">
      <section data-setting-id="companion-gateway" className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-content">Companion gateway</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-content/45">
              Watch and steer your Familiars and sessions from a phone or tablet while
              MOLFAR runs on this computer. Reach it over Tailscale; the gateway never
              listens on your local network.
            </p>
          </div>
          <button
            className={`${button} shrink-0`}
            disabled={busy}
            onClick={() => void configure(!status.enabled)}
          >
            {status.enabled ? "Turn off" : "Turn on"}
          </button>
        </div>

        <div className="grid gap-3 rounded-xl border border-stroke p-4 text-[12px]">
          <label className="grid gap-1.5">
            <span className="text-content/60">How the phone reaches this computer</span>
            <select
              className={input}
              value={mode}
              disabled={busy}
              onChange={(event) => setMode(event.target.value as BindMode)}
            >
              <option value="serve">Tailscale Serve (HTTPS, recommended)</option>
              <option value="tailnet">Tailscale address (HTTP inside the tunnel)</option>
            </select>
          </label>
          <div className="grid gap-3 @min-[560px]/settings:grid-cols-[8rem_1fr]">
            <label className="grid gap-1.5">
              <span className="text-content/60">Port</span>
              <input
                className={input}
                inputMode="numeric"
                value={port}
                disabled={busy}
                onChange={(event) => setPort(event.target.value.replace(/\D/g, ""))}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-content/60">Public URL (optional)</span>
              <input
                className={input}
                placeholder={
                  mode === "serve"
                    ? "https://your-mac.tailnet-name.ts.net"
                    : "Detected from Tailscale"
                }
                value={publicUrl}
                disabled={busy}
                onChange={(event) => setPublicUrl(event.target.value)}
              />
            </label>
          </div>
          {mode === "serve" ? (
            <p className="leading-relaxed text-content/45">
              Run once in a terminal:{" "}
              <code className="rounded bg-content/8 px-1.5 py-0.5 font-mono text-content/75">
                tailscale serve --bg {port || "3775"}
              </code>
              . Tailscale then serves this computer at its{" "}
              <span className="font-mono">.ts.net</span> name with a real certificate,
              only to devices in your tailnet.
            </p>
          ) : (
            <p className="leading-relaxed text-content/45">
              The gateway listens on this computer&apos;s Tailscale address. Traffic is
              encrypted by Tailscale; the app itself speaks plain HTTP inside the tunnel.
            </p>
          )}
          {dirty && status.enabled ? (
            <div>
              <button className={button} disabled={busy} onClick={() => void configure(true)}>
                Apply
              </button>
            </div>
          ) : null}
          <div className="grid gap-1 border-t border-stroke pt-3 text-content/55">
            <div>
              Status:{" "}
              <span className={status.running ? "text-content" : undefined}>
                {status.running
                  ? `listening on ${status.listenAddr}`
                  : status.enabled
                    ? "not running"
                    : "off"}
              </span>
            </div>
            <div>
              Tailscale:{" "}
              {status.tailscale.ip || status.tailscale.dnsName
                ? [status.tailscale.dnsName, status.tailscale.ip].filter(Boolean).join(" · ")
                : "not detected"}
            </div>
            {status.effectiveUrl ? <div>Phones dial: {status.effectiveUrl}</div> : null}
            {status.error ? <div className="text-red-400">{status.error}</div> : null}
          </div>
        </div>
      </section>

      <section data-setting-id="companion-devices" className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-content">Paired devices</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-content/45">
              A paired device can read your Familiars, sessions and notes, send messages,
              answer approvals, and change permission modes. Remove a device to revoke it at
              once.
            </p>
          </div>
          <button
            className={`${button} shrink-0`}
            disabled={busy || !status.running}
            onClick={() => void pair()}
          >
            Pair a device
          </button>
        </div>

        {offer && !expired ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-stroke p-5 text-center @min-[560px]/settings:flex-row @min-[560px]/settings:text-left">
            <div
              className="size-[220px] shrink-0 overflow-hidden rounded-lg bg-white p-1"
              // Generated by MOLFAR's own Rust QR encoder; contains no user markup.
              dangerouslySetInnerHTML={{ __html: offer.qrSvg }}
            />
            <div className="grid gap-2 text-[12px] leading-relaxed text-content/60">
              <p className="text-[13px] font-medium text-content">
                Scan with the iPhone camera, or open BitChain → Molfar → Pair.
              </p>
              <p>
                Code <span className="font-mono text-[15px] tracking-[0.2em] text-content">{offer.code}</span>
              </p>
              <p className="break-all">URL {offer.url}</p>
              <p>Expires in {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</p>
              <div>
                <button
                  className={button}
                  onClick={() => {
                    setOffer(undefined);
                    void invoke("companion_pair_cancel");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {status.devices.length > 0 ? (
          <div className="divide-y divide-stroke overflow-hidden rounded-xl border border-stroke">
            {status.devices.map((device) => (
              <div key={device.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{device.name}</div>
                  <div className="mt-0.5 text-[12px] text-content/45">
                    Paired {new Date(device.createdAt).toLocaleDateString()} · last seen{" "}
                    {ago(device.lastSeenAt)}
                  </div>
                </div>
                <button
                  disabled={busy}
                  className="rounded p-2 text-content/40 hover:bg-selection hover:text-content disabled:opacity-40"
                  aria-label={`Remove ${device.name}`}
                  title="Remove and revoke"
                  onClick={() => void revoke(device.id)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-content/45">No devices paired yet.</p>
        )}
        {error ? <p className="text-[12px] text-red-400">{error}</p> : null}
      </section>
    </div>
  );
}
