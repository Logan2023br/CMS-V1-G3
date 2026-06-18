import { test } from "node:test";
import assert from "node:assert/strict";
import { tsForShift } from "./roster.ts";

// epoch ms for a GMT+7 wall-clock moment on a 2026-06 date (UTC = GMT+7 - 7).
// Anchors: 2026-06-15=Mon, 16=Tue, 17=Wed, 18=Thu, 19=Fri, 20=Sat, 21=Sun.
function atGmt7(day: number, hour: number, min = 0): number {
  return Date.UTC(2026, 5, day, hour - 7, min);
}

test("daytime shift maps to the right TS (Mon 08:30 → 08-11 → Mahedi)", () => {
  const ts = tsForShift(atGmt7(15, 8, 30));
  assert.equal(ts.name, "Mahedi");
  assert.equal(ts.crispId, "f451cb33-ae68-4aad-831a-7570fc0d916a");
});

test("afternoon shift (Mon 14:30 → 14-17 → Marcel)", () => {
  assert.equal(tsForShift(atGmt7(15, 14, 30)).name, "Marcel");
});

test("late-evening 23-02 uses the SAME calendar day (Tue 23:30 → Tue 23-02 → Shami)", () => {
  assert.equal(tsForShift(atGmt7(16, 23, 30)).name, "Shami");
});

test("after-midnight 23-02 belongs to the PREVIOUS day (Wed 00:30 → Tue 23-02 → Shami)", () => {
  // 00:30 on Wed (17th) is still the Tuesday night shift.
  assert.equal(tsForShift(atGmt7(17, 0, 30)).name, "Shami");
});

test("01:59 still previous day's 23-02 (Wed 01:59 → Tue 23-02 → Shami)", () => {
  assert.equal(tsForShift(atGmt7(17, 1, 59)).name, "Shami");
});

test("02:00 flips to the new day's 02-05 (Wed 02:00 → Wed 02-05 → Syed)", () => {
  assert.equal(tsForShift(atGmt7(17, 2, 0)).name, "Syed");
});

test("after-midnight wraps across the week (Mon 01:30 → Sun 23-02 → Dan)", () => {
  // 2026-06-15 is Monday; 01:30 belongs to Sunday (14th) night shift.
  assert.equal(tsForShift(atGmt7(15, 1, 30)).name, "Dan");
});
