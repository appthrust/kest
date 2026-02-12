const consonantDigits = "bcdfghjklmnpqrstvwxyz0123456789";

/**
 * Generates a random string consisting of consonants and digits.
 *
 * This is intended for Kubernetes resource names to avoid accidental words.
 */
export function randomConsonantDigits(length = 8): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result +=
      consonantDigits[Math.floor(Math.random() * consonantDigits.length)];
  }
  return result;
}

/**
 * Generates a Kubernetes-friendly name by appending a random suffix.
 *
 * @example
 * ```ts
 * generateName("foo-"); // "foo-d7kpn"
 * ```
 */
export function generateName(prefix: string, suffixLength = 5): string {
  return `${prefix}${randomConsonantDigits(suffixLength)}`;
}
