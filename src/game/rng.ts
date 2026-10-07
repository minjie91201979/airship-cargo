/** 可复现的伪随机数（mulberry32） */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 位置哈希 → [-1, 1]，用于让几何体顶点抖动在接缝处保持一致 */
export function hash3(x: number, y: number, z: number, seed: number) {
  let h = Math.imul(Math.round(x * 10) | 0, 374761393) ^ Math.imul(Math.round(y * 10) | 0, 668265263) ^ Math.imul(Math.round(z * 10) | 0, 2147483647) ^ Math.imul(seed, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return ((h >>> 0) / 4294967295) * 2 - 1
}
