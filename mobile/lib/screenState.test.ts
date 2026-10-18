import { describe, expect, it } from "vitest";

import { refreshError } from "./screenState";

describe("refreshError", () => {
  it("reports a failed refresh over data already on screen", () => {
    expect(refreshError({ data: { balance: 1 }, error: "Can't reach the server." }))
      .toBe("Can't reach the server.");
  });

  it("stays quiet when nothing has loaded, where the full error screen shows instead", () => {
    expect(refreshError({ data: null, error: "Can't reach the server." })).toBeNull();
  });

  it("stays quiet when the last load worked", () => {
    expect(refreshError({ data: [], error: null })).toBeNull();
  });
});
