import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASSUME_ASLEEP_AFTER_MS, ensureAwake, markAwake, mayBeAsleep, onWakingChange, resetWakeState,
} from "./wake";

beforeEach(() => resetWakeState());

describe("ensureAwake", () => {
  it("wakes the server before the first request", async () => {
    const ping = vi.fn().mockResolvedValue({});
    await ensureAwake(ping);
    expect(ping).toHaveBeenCalledTimes(1);
    expect(mayBeAsleep()).toBe(false);
  });

  it("skips the check while the server is known to be awake", async () => {
    markAwake();
    const ping = vi.fn().mockResolvedValue({});
    await ensureAwake(ping);
    expect(ping).not.toHaveBeenCalled();
  });

  it("checks again after a long quiet spell", async () => {
    const now = Date.now();
    markAwake(now - ASSUME_ASLEEP_AFTER_MS - 1);
    expect(mayBeAsleep(now)).toBe(true);
  });

  it("shares one wake-up between requests made at the same time", async () => {
    let finish!: () => void;
    const ping = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    const both = Promise.all([ensureAwake(ping), ensureAwake(ping)]);
    finish();
    await both;
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("never blocks the real request if the server stays unreachable", async () => {
    await expect(ensureAwake(() => Promise.reject(new Error("offline")))).resolves.toBeUndefined();
    expect(mayBeAsleep()).toBe(true);
  });

  it("tells the UI when waking starts and stops", async () => {
    const seen: boolean[] = [];
    onWakingChange((w) => seen.push(w));
    await ensureAwake(() => Promise.resolve());
    expect(seen).toEqual([true, false]);
  });

  it("tells a screen opened mid-wake that the server is already waking", async () => {
    let finish!: () => void;
    const waking = ensureAwake(() => new Promise<void>((r) => { finish = r; }));
    const seen: boolean[] = [];
    onWakingChange((w) => seen.push(w));
    expect(seen).toEqual([true]);
    finish();
    await waking;
    expect(seen).toEqual([true, false]);
  });
});
