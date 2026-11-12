// R5 / SCHED-4514: an incident's time in the viewer's zone and the viewer's date order.
// The order (day-month or month-day) comes from the viewer's locale; the date is printed with "/"
// so EU locales read dd/mm. The full UTC value stays in <time datetime>.

/** 'dmy' | 'mdy' | 'ymd' for a locale, read from how that locale prints a date. */
export function dateOrder(locale) {
  const parts = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(Date.UTC(2026, 0, 2)))
    .filter((p) => p.type === 'day' || p.type === 'month' || p.type === 'year')
    .map((p) => p.type[0]);
  return parts.join('');
}

/** "12/11/2026, 07:24" for a dmy viewer, "11/12/2026, 10:24 PM" for an mdy one. */
export function formatLocal(iso, locale = navigator.language, timeZone = undefined) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const get = (options) => new Intl.DateTimeFormat(locale, { timeZone, ...options });
  const part = (type, options) =>
    get(options).formatToParts(date).find((p) => p.type === type)?.value ?? '';
  // Latin digits so every viewer gets the same dd/mm shape.
  const numeric = { numberingSystem: 'latn' };
  const d = part('day', { day: '2-digit', ...numeric });
  const m = part('month', { month: '2-digit', ...numeric });
  const y = part('year', { year: 'numeric', ...numeric });
  const order = dateOrder(locale);
  const day = order.startsWith('m') ? `${m}/${d}/${y}` : order.startsWith('y') ? `${y}/${m}/${d}` : `${d}/${m}/${y}`;
  const time = get({ hour: '2-digit', minute: '2-digit', ...numeric }).format(date);
  return `${day}, ${time}`;
}
