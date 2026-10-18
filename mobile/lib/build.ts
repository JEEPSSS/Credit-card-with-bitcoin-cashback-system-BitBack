/**
 * Which code is this phone running?
 *
 * Expo's EAS Update debugging guide starts from that question: an update that
 * did not arrive, arrived on the wrong channel, or crashed and was rolled back
 * all look the same from the outside, and the answer is in the expo-updates
 * constants. Reading them on the device beats guessing - an earlier crash on
 * the AI insights screen was an old update still running against a newer
 * server. Kept free of expo-updates itself so it can be unit tested.
 */
export type BuildFacts = {
  appVersion: string | null;
  isEnabled: boolean;
  channel: string | null;
  runtimeVersion: string | null;
  updateId: string | null;
  createdAt: Date | null;
  isEmbeddedLaunch: boolean;
  isEmergencyLaunch: boolean;
  emergencyLaunchReason: string | null;
};

export function describeBuild(f: BuildFacts): string[] {
  const lines = [`Version ${f.appVersion ?? "unknown"}`];
  if (!f.isEnabled) {
    lines.push("Development build: over-the-air updates are off");
    return lines;
  }
  lines.push(`Runtime ${f.runtimeVersion ?? "unknown"} · channel ${f.channel ?? "none"}`);
  if (f.isEmergencyLaunch) {
    // The newest update failed to start and the built-in code was used instead.
    lines.push(`Running the built-in code after an update failed${
      f.emergencyLaunchReason ? `: ${f.emergencyLaunchReason}` : ""}`);
  } else if (f.isEmbeddedLaunch || !f.updateId) {
    lines.push("Running the code built into the app; no update downloaded yet");
  } else {
    const when = f.createdAt ? ` from ${f.createdAt.toISOString().slice(0, 10)}` : "";
    lines.push(`Update ${f.updateId.slice(0, 8)}${when}`);
  }
  return lines;
}
