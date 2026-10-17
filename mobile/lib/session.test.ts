import { describe, expect, it } from "vitest";
import { endsSession } from "./session";

describe("endsSession", () => {
  it("ends the session when a signed-in request is rejected", () => {
    expect(endsSession(401, "/api/wallet", true)).toBe(true);
  });

  it("does not treat a wrong password as an ended session", () => {
    // Regression: this signed the user out and wiped the error message.
    expect(endsSession(401, "/api/auth/login", true)).toBe(false);
    expect(endsSession(401, "/api/auth/login", false)).toBe(false);
  });

  it("does not end a session that was never sent", () => {
    expect(endsSession(401, "/api/wallet", false)).toBe(false);
  });

  it("ignores the other credential endpoints and absolute URLs", () => {
    expect(endsSession(401, "/api/auth/2fa/authenticate", true)).toBe(false);
    expect(endsSession(401, "https://bitcoin-survey.onrender.com/api/auth/register", true)).toBe(false);
    expect(endsSession(401, "/api/auth/me?x=1", true)).toBe(true);
  });

  it("only reacts to 401", () => {
    expect(endsSession(400, "/api/auth/me", true)).toBe(false);
    expect(endsSession(undefined, "/api/wallet", true)).toBe(false);
  });
});
