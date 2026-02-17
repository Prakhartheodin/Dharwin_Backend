/**
 * Check if elapsed time since punchIn has exceeded the given duration (in hours).
 * Uses real elapsed time (same in every timezone) so 12h = 12 hours from punch-in.
 * @param {Date} punchIn - Punch-in timestamp
 * @param {string} _timezone - Unused; kept for API compatibility
 * @param {number} durationHours - Max duration in hours before auto punch-out
 * @returns {boolean}
 */
export const hasExceededDurationInTimezone = (punchIn, _timezone, durationHours) => {
    const now = new Date();
    const elapsedMs = now.getTime() - (punchIn && punchIn.getTime ? punchIn.getTime() : new Date(punchIn).getTime());
    const durationMs = durationHours * 60 * 60 * 1000;
    return elapsedMs >= durationMs;
  };
  