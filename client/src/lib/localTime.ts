export type LocalTimeOptions = {
  timeZone?: string;
};

function dateParts(value: number | string | Date, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Taipei") {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
}

export function formatLocalDateTime(value: number | string | Date, options: LocalTimeOptions = {}) {
  const parts = dateParts(value, options.timeZone);
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatLocalShortDateTime(value: number | string | Date, options: LocalTimeOptions = {}) {
  const parts = dateParts(value, options.timeZone);
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatLocalShortDate(value: number | string | Date, options: LocalTimeOptions = {}) {
  const parts = dateParts(value, options.timeZone);
  return `${Number(parts.month)}/${Number(parts.day)}`;
}

export function getLocalDateTimeInputValue(value = new Date()) {
  const parts = dateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
