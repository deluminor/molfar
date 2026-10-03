import { invoke } from "@tauri-apps/api/core";

export type HostStats = {
  cpuPercent: number;
  memoryPercent: number;
  swapPercent: number;
  loadAverage: number | null;
  cpuCount: number;
  processCount: number;
};

/** Live host sample from the Tauri `home_host_stats` command. */
export async function fetchHostStats(): Promise<HostStats> {
  return invoke<HostStats>("home_host_stats");
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(Math.min(100, Math.max(0, value)))}%`;
}

export function formatLoad(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

export function formatProcessCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Load average as a 0–100 share of logical cores (100% ≈ fully loaded). */
export function loadAsPercent(load: number | null, cpuCount: number): number {
  if (load == null || !Number.isFinite(load) || cpuCount <= 0) return 0;
  return clampPercent((load / cpuCount) * 100);
}
