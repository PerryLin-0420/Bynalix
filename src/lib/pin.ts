/** djb2-style hash for local PIN (not cryptographically secure). */
export function hashPin(pin: string): string {
  let h = 5381;
  for (let i = 0; i < pin.length; i++) h = ((h << 5) + h) ^ pin.charCodeAt(i);
  return String(h >>> 0);
}
