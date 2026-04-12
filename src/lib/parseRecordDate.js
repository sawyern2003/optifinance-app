import { parseISO, isValid } from "date-fns";

/**
 * Parse treatment/expense `date` values for filtering.
 * Plain `YYYY-MM-DD` from APIs is interpreted as UTC midnight by `new Date()`,
 * which can shift to the previous calendar day in negative-offset timezones and
 * drop rows from month-based ranges. We anchor date-only strings at local noon.
 */
export function parseRecordDate(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  const parsed = parseISO(s);
  if (isValid(parsed)) return parsed;
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}
