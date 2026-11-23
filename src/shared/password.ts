const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const DIGIT = '23456789'
const SYMBOL = '!@#$%*?'

function pick(chars: string): string {
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  return chars[buf[0] % chars.length]
}

/** Generates a password meeting AD / Entra complexity rules. */
export function generatePassword(length = 14): string {
  const all = UPPER + LOWER + DIGIT + SYMBOL
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)]
  while (chars.length < length) chars.push(pick(all))
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1)
    globalThis.crypto.getRandomValues(buf)
    const j = buf[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export function makeRunId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
