/**
 * Parse a human-readable duration string to seconds.
 * Supports: ms (e.g. "1h" = 3600, "30m" = 1800, "7d" = 604800).
 * Returns the value directly if no suffix, assuming it's already in seconds.
 */
export function parseTtlSeconds(expiresIn: string): number {
  const value = parseInt(expiresIn, 10);
  if (expiresIn.endsWith('h')) return value * 3600;
  if (expiresIn.endsWith('d')) return value * 86400;
  if (expiresIn.endsWith('m')) return value * 60;
  return value; // seconds or raw number string
}
