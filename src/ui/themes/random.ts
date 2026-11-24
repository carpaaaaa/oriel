// The Mac's generator, number for number (studio/02 §8.2 "Casualità identica";
// HomeTheme.swift:236-245, :410-414). Seeded is xorshift64 on a UInt64; the
// numbers come out through Swift's own CGFloat.random(in:using:) and
// Int.random(in:using:), so those are copied too (Swift's stdlib:
// FloatingPointRandom.swift, RandomNumberGenerator.next(upperBound:), Lemire's
// method). With the same seed every speck and sticker lands where the Mac
// puts it.

const M64 = (1n << 64n) - 1n
const TWO53 = 1n << 53n
const TWO53_1 = TWO53 + 1n

export class Seeded {
  private s: bigint
  constructor(seed: bigint) { this.s = seed === 0n ? 0x9E3779B97F4A7C15n : seed & M64 }

  next(): bigint {
    let s = this.s
    s ^= (s << 13n) & M64
    s ^= s >> 7n
    s ^= (s << 17n) & M64
    this.s = s
    return s
  }

  /** next(upperBound:): a number in 0 ..< n, without bias. */
  below(n: bigint): bigint {
    let m = this.next() * n
    if ((m & M64) < n) {
      const t = ((1n << 64n) - n) % n
      while ((m & M64) < t) m = this.next() * n
    }
    return m >> 64n
  }

  /** CGFloat.random(in: lo...hi, using:) (a closed range of Double). */
  in(lo: number, hi: number): number {
    const delta = hi - lo
    const r = this.below(TWO53_1)
    if (r === TWO53) return hi
    return delta * (Number(r) * 2 ** -53) + lo
  }

  /** Int.random(in: 0..<n, using:). */
  int(n: number): number { return Number(this.below(BigInt(n))) }
}

/** A fixed number from a name (FNV-1a, 64 bits). */
export function seed(name: string): bigint {
  let h = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(name)) h = ((h ^ BigInt(byte)) * 0x100000001b3n) & M64
  return h
}

/** Calendar.current.ordinality(of: .day, in: .era, for: Date()): today's
 * number counted from 1 January of year 1, in the proleptic Gregorian
 * calendar Foundation uses (checked against Swift: 739944 on 24 Nov 2026). */
export function dayNumber(now = new Date()): number {
  const days = Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000)
  return days + 719163
}
