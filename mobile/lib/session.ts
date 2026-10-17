/**
 * When a 401 means "your session has ended" - and when it does not.
 *
 * On the sign-in, sign-up and password-reset endpoints a 401 means the
 * details typed were wrong. Treating it as an ended session signed the user
 * "out" and remounted the sign-in screen, which wiped the error message: a
 * wrong password looked like the app silently bouncing back to sign-in.
 * A request that carried no session token cannot have had its session end
 * either.
 */
const CREDENTIAL_ENDPOINTS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/2fa/authenticate",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
];

export function endsSession(status: number | undefined, url: string | undefined, sentToken: boolean): boolean {
  if (status !== 401 || !sentToken) return false;
  const path = (url ?? "").split("?")[0];
  return !CREDENTIAL_ENDPOINTS.some((p) => path === p || path.endsWith(p));
}
