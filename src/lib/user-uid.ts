/**
 * Derive a short, stable, safe "UID" from a user's UUID.
 *
 * The UUID is not something we want to show publicly — usernames also aren't
 * (the user asked us to hide @username from the leaderboard because it's easy
 * to guess). We want a short, uppercased alphanumeric handle that is stable
 * for a given account. Example: "YQFH5H".
 *
 * Strategy: take the UUID, strip hyphens, convert to a BigInt, encode in
 * base36, uppercase it, and return the last 6 characters. This gives an
 * alphanumeric handle (A–Z, 0–9) that changes only if the account changes.
 */
export function deriveUid(userId: string | null | undefined): string {
  if (!userId) return "------";
  const clean = String(userId).replace(/[^0-9a-fA-F]/g, "");
  if (!clean) {
    // Fallback for non-hex ids: hash characters into a rolling number.
    let acc = 0;
    for (const c of String(userId)) acc = (acc * 33 + c.charCodeAt(0)) >>> 0;
    return acc.toString(36).toUpperCase().padStart(6, "0").slice(-6);
  }
  try {
    const value = BigInt("0x" + clean);
    return value.toString(36).toUpperCase().slice(-6).padStart(6, "0");
  } catch {
    return clean.toUpperCase().slice(-6).padStart(6, "0");
  }
}
