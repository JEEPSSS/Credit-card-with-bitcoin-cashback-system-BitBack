/**
 * A timestamp from the API, as a Date.
 *
 * The backend stores UTC and sends it without an offset ("2026-10-19T06:50:00",
 * see app/clock.py), and JavaScript reads a date-time without an offset as
 * local time. In Singapore that put every purchase eight hours early: one made a
 * moment before showed as "8h ago" at 6:50 AM. Found in the demo recording.
 * A date-time with no offset is therefore read as UTC; one that already carries
 * "Z" or an offset such as "+08:00" is read as written.
 */
export function serverTime(iso: string): Date {
  const hasTime = /T\d{2}:\d{2}/.test(iso);
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  return new Date(hasTime && !hasOffset ? `${iso}Z` : iso);
}
