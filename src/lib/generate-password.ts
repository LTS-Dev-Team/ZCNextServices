const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";

function pick(chars: string): string {
  return chars[Math.floor(Math.random() * chars.length)]!;
}

function shuffle(values: string[]): string[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
  return values;
}

/** Generates a random password that satisfies typical AD complexity rules and starts with 'ZC@'. */
export function generateSecurePassword(length = 12): string {
  const prefix = "ZC@";
  // Adjusted minimum length to ensure enough complexity after prefix
  const minTotalLength = Math.max(length, 12);
  const totalBodyLength = minTotalLength - prefix.length;
  const all = UPPER + LOWER + DIGITS ;
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  // Remove required chars from total body length (because they will be included in the main body after prefix)
  const remaining = Array.from(
    { length: Math.max(totalBodyLength, required.length) - required.length },
    () => pick(all)
  );
  // Shuffle the required + random chars for the password body
  const passwordBody = shuffle([...required, ...remaining]).join("");
  return prefix + passwordBody;
}
