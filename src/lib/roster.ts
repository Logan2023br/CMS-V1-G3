/**************************************************************************
 * ROSTER LOOKUP — given a Crisp message timestamp, find which TS is on duty.
 *
 * Day boundary is 02:00 GMT+7 (NOT midnight): the 23-02 night shift runs from
 * 23:00 to 02:00, so a moment in [00:00, 02:00) still belongs to the PREVIOUS
 * calendar day's roster. From 02:00 (the 02-05 shift) it is the new day.
 *
 * See src/data/ts-roster.ts for the roster data.
 ***************************************************************************/

import { shiftOf, gmt7HourOfDay } from "@/lib/shifts.js";
import { TS_MEMBERS, TS_ROSTER, type Weekday, type TsMember } from "@/data/ts-roster.js";

const HOUR_MS = 3600000;
const GMT7_OFFSET_HOURS = 7;

// getUTCDay() index (0=Sun..6=Sat) → our Weekday key.
const WEEKDAY_BY_INDEX: Weekday[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The roster weekday for a timestamp: the GMT+7 calendar day, except moments in
// [00:00, 02:00) roll back one day (still the previous night's 23-02 shift).
function rosterWeekday(tsMs: number): Weekday {
  let shifted = tsMs + GMT7_OFFSET_HOURS * HOUR_MS;
  if (gmt7HourOfDay(tsMs) < 2) shifted -= 24 * HOUR_MS;
  return WEEKDAY_BY_INDEX[new Date(shifted).getUTCDay()];
}

// The TS on duty at a given Crisp message timestamp (epoch ms, UTC).
function tsForShift(tsMs: number): TsMember {
  const weekday = rosterWeekday(tsMs);
  const shift = shiftOf(tsMs);
  const name = TS_ROSTER[weekday][shift];
  return TS_MEMBERS[name];
}

export { tsForShift, rosterWeekday };
