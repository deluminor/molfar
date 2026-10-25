import type { RateLimitWindow } from "@/domain/rate-limits/rate-limit";
import { clampUsedPercent } from "@/domain/rate-limits/rate-limit-window";
import { asRecord } from "../providers/codex/codex-protocol";

export function parseResetTimestamp(value: unknown): number | null {
  if (typeof value === "number") {
    return normalizeEpochMs(value);
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.trim() !== "") {
    return normalizeEpochMs(numeric);
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeEpochMs(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  // 1e10 sits between seconds-epoch (<2286) and millisecond-epoch (>2001).
  return value > 10000000000 ? value : value * 1000;
}

export function mapUsageWindow(
  raw: unknown,
  windowMinutes: number,
): RateLimitWindow | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const usedPercent = usedPercentFrom(rec);
  if (usedPercent == null) return null;
  return {
    usedPercent: clampUsedPercent(usedPercent),
    windowMinutes,
    resetsAt:
      parseResetTimestamp(rec.resets_at) ??
      parseResetTimestamp(rec.resetsAt) ??
      null,
  };
}

function usedPercentFrom(rec: Record<string, unknown>): number | null {
  const value =
    numberField(rec, "used_percentage") ??
    numberField(rec, "usedPercent") ??
    numberField(rec, "utilization");
  if (value == null) return null;
  return value;
}

export function numberField(
  rec: Record<string, unknown>,
  key: string,
): number | null {
  const value = rec[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function stringField(
  rec: Record<string, unknown>,
  key: string,
): string | null {
  const value = rec[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
