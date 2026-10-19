import { defineConfig } from "vitest/config";

// Every test runs in Singapore time, UTC+8. The API's timestamps are UTC, and a
// suite run in UTC cannot tell UTC from local time: that is how times shown
// eight hours early got past these tests. Set before the workers start, so
// each one inherits it.
process.env.TZ = "Asia/Singapore";

export default defineConfig({});
