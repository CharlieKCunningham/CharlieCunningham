'use strict';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Parses a schema-format "YYYY-MM-DDTHH:mm" string (local, not timezone
 * aware - the literal value typed into a datetime-local input) into its
 * numeric parts, without going through the JS Date/timezone machinery.
 *
 * @param {string} isoLocal - e.g. "2026-08-11T09:30"
 * @returns {{year:number, month:number, day:number, hour:number, minute:number}}
 */
function parseParts(isoLocal) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(isoLocal || '');
  if (!match) {
    throw new Error(`formatDate: expected "YYYY-MM-DDTHH:mm", got "${isoLocal}"`);
  }
  const [, year, month, day, hour, minute] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  };
}

/**
 * Formats a schema date-time string into a human-readable display string,
 * e.g. "Aug 11, 2026 at 9:30 AM".
 *
 * @param {string} isoLocal - e.g. "2026-08-11T09:30"
 * @returns {string}
 */
function formatDateDisplay(isoLocal) {
  const { year, month, day, hour, minute } = parseParts(isoLocal);
  const monthName = MONTHS[month - 1];
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minuteStr = String(minute).padStart(2, '0');
  return `${monthName} ${day}, ${year} at ${hour12}:${minuteStr} ${period}`;
}

/**
 * Returns the raw ISO-ish string suitable for the datetime attribute of a
 * <time> element. The schema value is already in this shape, so this is
 * effectively an identity/validation pass-through.
 *
 * @param {string} isoLocal - e.g. "2026-08-11T09:30"
 * @returns {string} e.g. "2026-08-11T09:30"
 */
function formatDateIso(isoLocal) {
  parseParts(isoLocal); // validates shape, throws on malformed input
  return isoLocal;
}

module.exports = { formatDateDisplay, formatDateIso, parseParts };
