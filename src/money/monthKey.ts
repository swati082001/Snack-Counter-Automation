// Budgets are monthly per office, and "which month" depends on the office's
// local time: 23:30 on 30 November in Oslo is already December in Bengaluru.
// Returns 'YYYY-MM' for the given instant as seen in the given IANA time zone.
export function monthKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}
