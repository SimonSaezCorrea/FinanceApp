/** First letter of the first two words of a name, or the first letter of an email as fallback. */
export function getInitials(name: string | null, email: string | null): string {
  const trimmedName = name?.trim();
  if (trimmedName) {
    const [first, second] = trimmedName.split(/\s+/);
    return ((first?.[0] ?? "") + (second?.[0] ?? "")).toUpperCase() || trimmedName[0]!.toUpperCase();
  }
  const trimmedEmail = email?.trim();
  return trimmedEmail ? trimmedEmail[0]!.toUpperCase() : "?";
}
