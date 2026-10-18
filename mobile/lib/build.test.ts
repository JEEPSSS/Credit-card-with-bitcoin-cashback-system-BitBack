import { describe, expect, it } from "vitest";

import { BuildFacts, describeBuild } from "./build";

const release: BuildFacts = {
  appVersion: "1.0.0",
  isEnabled: true,
  channel: "preview",
  runtimeVersion: "1.0.0",
  updateId: "3f9c2a71-0d4e-4b8a-9e55-1c2d3e4f5a6b",
  createdAt: new Date("2026-10-18T09:30:00Z"),
  isEmbeddedLaunch: false,
  isEmergencyLaunch: false,
  emergencyLaunchReason: null,
};

describe("describeBuild", () => {
  it("names the downloaded update a phone is running, with its date", () => {
    expect(describeBuild(release)).toEqual([
      "Version 1.0.0",
      "Runtime 1.0.0 · channel preview",
      "Update 3f9c2a71 from 2026-10-18",
    ]);
  });

  it("says when the phone is still on the code the APK shipped with", () => {
    expect(describeBuild({ ...release, isEmbeddedLaunch: true })[2]).toMatch(/built into the app/);
  });

  it("reports a rolled-back update and why, the case EAS's debug guide warns about", () => {
    const lines = describeBuild({
      ...release, isEmergencyLaunch: true, emergencyLaunchReason: "update crashed on launch",
    });
    expect(lines[2]).toBe("Running the built-in code after an update failed: update crashed on launch");
  });

  it("does not claim a channel in a development build", () => {
    expect(describeBuild({ ...release, isEnabled: false })).toEqual([
      "Version 1.0.0",
      "Development build: over-the-air updates are off",
    ]);
  });
});
