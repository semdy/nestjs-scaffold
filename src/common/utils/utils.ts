export function parseJSON<T extends object>(mayJSON: unknown, fallback: T): T;
export function parseJSON<T extends object = Record<string, unknown>>(
  mayJSON: unknown,
): T | undefined;
export function parseJSON<T extends object>(mayJSON: unknown, fallback?: T): T | undefined {
  if (mayJSON !== null && typeof mayJSON === 'object') {
    return mayJSON as T;
  }

  if (typeof mayJSON !== 'string') {
    return fallback;
  }

  try {
    return JSON.parse(mayJSON) as T;
  } catch (e) {
    console.error(e);
    return fallback;
  }
}
