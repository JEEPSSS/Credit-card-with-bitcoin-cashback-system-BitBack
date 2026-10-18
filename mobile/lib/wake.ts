/**
 * Waking the server before talking to it.
 *
 * The backend runs on Render's free tier, which sleeps after 15 idle minutes
 * and takes up to about a minute to start again. The API client gives up
 * after 12 seconds, so the first request after a quiet spell failed with
 * "Can't reach the server" - typically at the start of a demo.
 *
 * Retrying failed requests would fix that for reads but is unsafe for writes
 * (a purchase that reached the server but whose reply was lost). Instead,
 * when the server has not answered for a while, one patient health check
 * runs first and every request waits behind it. Concurrent requests share
 * the same check rather than each starting their own.
 */
export const ASSUME_ASLEEP_AFTER_MS = 10 * 60 * 1000; // Render sleeps at 15
export const WAKE_TIMEOUT_MS = 75 * 1000;

type Listener = (waking: boolean) => void;

let lastAnswer = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<Listener>();

function announce(waking: boolean) {
  listeners.forEach((l) => l(waking));
}

/** Call whenever the server answers, success or error: it is awake. */
export function markAwake(now: number = Date.now()) {
  lastAnswer = now;
}

export function mayBeAsleep(now: number = Date.now()): boolean {
  return now - lastAnswer > ASSUME_ASLEEP_AFTER_MS;
}

/**
 * Resolve once the server has answered recently, waking it first if needed.
 * Never rejects: if the wake-up check itself fails, the real request goes
 * ahead and reports its own error.
 */
export function ensureAwake(ping: () => Promise<unknown>, now: number = Date.now()): Promise<void> {
  if (!mayBeAsleep(now)) return Promise.resolve();
  if (!inFlight) {
    announce(true);
    inFlight = ping()
      .then(() => markAwake())
      .catch(() => undefined)
      .finally(() => {
        inFlight = null;
        announce(false);
      });
  }
  return inFlight;
}

/**
 * Subscribe to waking state. A screen opened while a wake-up is already
 * running is told so at once, rather than staying blank until the next one.
 */
export function onWakingChange(listener: Listener): () => void {
  listeners.add(listener);
  if (inFlight) listener(true);
  return () => listeners.delete(listener);
}

/** Test hook. */
export function resetWakeState() {
  lastAnswer = 0;
  inFlight = null;
  listeners.clear();
}
