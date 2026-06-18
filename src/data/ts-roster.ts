/**************************************************************************
 * TS SHIFT ROSTER — who is on duty for each (weekday × shift).
 *
 * Source of truth: the "AI-Agent Handle" Google Sheet, tab "LeadShift-MCP"
 *   https://docs.google.com/spreadsheets/d/1OAlScV7tvaGGZqMmDTz_YzU5Ae8tfdkfeK7xi9JCauU
 *
 * This is a STATIC snapshot baked into the repo (the production server reads it
 * directly — no Google API call at runtime). When the roster changes, update
 * this file and redeploy.
 *
 * Times are GMT+7 shift windows and match `ShiftLabel` in src/lib/shifts.ts.
 * Weekday is the GMT+7 day of the relevant timestamp.
 *
 * Last synced from sheet: 2026-06-18
 ***************************************************************************/

import type { ShiftLabel } from "@/lib/shifts.js";

type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

interface TsMember {
  name: string;
  crispId: string; // the TS operator's stable id (from the sheet)
}

// Each TS appears once here; the roster grid references them by name.
const TS_MEMBERS: Record<string, TsMember> = {
  Syed: { name: "Syed", crispId: "dfa152f5-1a19-4869-b08e-34de07b1b477" },
  Shami: { name: "Shami", crispId: "c4c2d94d-6da3-4ce6-82fb-cdc518a885f6" },
  Ethan: { name: "Ethan", crispId: "c7b8a1b2-a162-4ebe-987a-a24d92b8d2c6" },
  Adrian: { name: "Adrian", crispId: "a2af1c4e-1418-427e-9372-0f11bcdac1cb" },
  Mahedi: { name: "Mahedi", crispId: "f451cb33-ae68-4aad-831a-7570fc0d916a" },
  Abed: { name: "Abed", crispId: "3b8c7f1e-e4be-4003-9238-27b17260f681" },
  Dan: { name: "Dan", crispId: "4d04b661-55a9-4763-8d94-ccb1613b980f" },
  Marcel: { name: "Marcel", crispId: "901273a2-fdcb-43d5-9400-fe58544ea192" },
  Aldwin: { name: "Aldwin", crispId: "b7b64ecf-e4d2-4aee-bc55-ce2d5c0a10e2" },
};

// TS_ROSTER[weekday][shift] = a key into TS_MEMBERS.
const TS_ROSTER: Record<Weekday, Record<ShiftLabel, keyof typeof TS_MEMBERS>> = {
  Mon: { "02-05": "Syed",  "05-08": "Ethan",  "08-11": "Mahedi", "11-14": "Abed",   "14-17": "Marcel", "17-20": "Dan",    "20-23": "Mahedi", "23-02": "Dan" },
  Tue: { "02-05": "Syed",  "05-08": "Adrian", "08-11": "Mahedi", "11-14": "Dan",    "14-17": "Aldwin", "17-20": "Marcel", "20-23": "Mahedi", "23-02": "Shami" },
  Wed: { "02-05": "Syed",  "05-08": "Ethan",  "08-11": "Mahedi", "11-14": "Dan",    "14-17": "Aldwin", "17-20": "Aldwin", "20-23": "Mahedi", "23-02": "Dan" },
  Thu: { "02-05": "Shami", "05-08": "Ethan",  "08-11": "Mahedi", "11-14": "Dan",    "14-17": "Dan",    "17-20": "Aldwin", "20-23": "Aldwin", "23-02": "Dan" },
  Fri: { "02-05": "Shami", "05-08": "Adrian", "08-11": "Syed",   "11-14": "Aldwin", "14-17": "Marcel", "17-20": "Aldwin", "20-23": "Aldwin", "23-02": "Shami" },
  Sat: { "02-05": "Shami", "05-08": "Adrian", "08-11": "Aldwin", "11-14": "Abed",   "14-17": "Aldwin", "17-20": "Mahedi", "20-23": "Mahedi", "23-02": "Dan" },
  Sun: { "02-05": "Shami", "05-08": "Adrian", "08-11": "Mahedi", "11-14": "Abed",   "14-17": "Abed",   "17-20": "Syed",   "20-23": "Aldwin", "23-02": "Dan" },
};

export { TS_MEMBERS, TS_ROSTER, type Weekday, type TsMember };
