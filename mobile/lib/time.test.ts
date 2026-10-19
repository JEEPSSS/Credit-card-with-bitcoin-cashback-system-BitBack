import { describe, expect, it } from "vitest";

import { serverTime } from "./time";

describe("serverTime", () => {
  it("runs in a zone other than UTC, or these tests would prove nothing", () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-480);
  });

  it("reads the API's timestamps, which have no offset, as UTC", () => {
    expect(serverTime("2026-10-19T06:50:00").getTime()).toBe(Date.UTC(2026, 9, 19, 6, 50));
    expect(serverTime("2026-10-19T06:50:00.123456").getTime()).toBe(Date.UTC(2026, 9, 19, 6, 50, 0, 123));
  });

  it("puts the purchase from the demo recording in the afternoon, when it was made", () => {
    expect(serverTime("2026-10-19T06:50:00").getHours()).toBe(14);
  });

  it("reads a timestamp that names its zone as written", () => {
    expect(serverTime("2026-10-19T06:50:00Z").getTime()).toBe(Date.UTC(2026, 9, 19, 6, 50));
    expect(serverTime("2026-10-19T14:50:00+08:00").getTime()).toBe(Date.UTC(2026, 9, 19, 6, 50));
    expect(serverTime("2026-10-19T01:50:00-05:00").getTime()).toBe(Date.UTC(2026, 9, 19, 6, 50));
  });

  it("leaves a plain date alone", () => {
    expect(serverTime("2026-10-19").getTime()).toBe(Date.UTC(2026, 9, 19));
  });
});
