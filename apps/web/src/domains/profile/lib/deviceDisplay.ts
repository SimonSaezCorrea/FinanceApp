/** A device-shaped icon from a `deviceLabel` — a lightweight guess (phone OSes vs. everything
 * else), not a real device-type field. Shared by sessions and remembered devices. */
export function isPhone(deviceLabel: string | null) {
  const label = deviceLabel?.toLowerCase() ?? "";
  return label.includes("iphone") || label.includes("android");
}

/** Day + hour:minute, localized — so a device's timeline reads precisely instead of just "today". */
export function formatDateTime(iso: string, locale: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString(locale);
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}
