import { qcfg } from '../game/settings'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ship } from '../game/flight'
import { CURRENTS, currentDir, currentStrength, windAt, type WindSample } from '../game/wind'
import { rng } from '../game/rng'

/** 风的视觉提示：镜头周围的风痕线 + 各气流带里随风漂移的云絮 */
export function WindFx() {
  return (
    <>
      <Streaks />
      {CURRENTS.map((c, i) => <Wisps key={c.id} idx={i} />)}
    </>
  )
}

const N_STREAK = 90
const BOX = 100
/** 风痕：实例化的细长发光条（比 1px 线粗、亮得多） */
function Streaks() {
  const { camera } = useThree()
  const ref = useRef<THREE.InstancedMesh>(null!)
  const p = useMemo(() => {
    const r = rng(5)
    const a = new Float32Array(N_STREAK * 4)
    for (let i = 0; i < N_STREAK; i++) a.set([(r() - 0.5) * BOX, (r() - 0.5) * BOX * 0.5, (r() - 0.5) * BOX, 0.6 + r() * 0.8], i * 4)
    return a
  }, [])
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), [])
  const w = useMemo<WindSample>(() => ({ x: 0, z: 0, speed: 0, zone: null }), [])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    ref.current.count = Math.max(1, Math.floor(N_STREAK * qcfg().particles))
    windAt(camera.position.x, camera.position.y, camera.position.z, ship.time, w)
    mat.opacity = Math.min(0.2, Math.max(0, (w.speed - 2) / 30))
    ref.current.visible = mat.opacity > 0.01
    const len = 2 + w.speed * 0.7
    const ux = w.speed > 0.01 ? w.x / w.speed : 0, uz = w.speed > 0.01 ? w.z / w.speed : 1
    q.setFromEuler(e.set(0, Math.atan2(ux, uz), 0))
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z
    const half = BOX / 2
    for (let i = 0; i < N_STREAK; i++) {
      const o = i * 4
      // 风痕比风稍快，便于看清方向
      p[o] += w.x * dt * 1.6
      p[o + 2] += w.z * dt * 1.6
      const x = cx + ((((p[o] - cx) % BOX) + BOX * 1.5) % BOX) - half
      const z = cz + ((((p[o + 2] - cz) % BOX) + BOX * 1.5) % BOX) - half
      const y = cy + p[o + 1]
      // 离镜头越远越粗，保证远处也看得见
      const d = Math.hypot(x - cx, y - cy, z - cz)
      // 靠近镜头时淡出（缩成看不见），远处略粗
      const th = (0.03 + d * 0.0022) * p[o + 3] * THREE.MathUtils.smoothstep(d, 8, 26)
      ref.current.setMatrixAt(i, m.compose(v.set(x - ux * len * 0.5, y, z - uz * len * 0.5), q, sc.set(th, th * 0.7, len * p[o + 3])))
    }
    ref.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, mat, N_STREAK]} frustumCulled={false} renderOrder={5} />
}

const N_WISP = 40
function Wisps({ idx }: { idx: number }) {
  const c = CURRENTS[idx]
  const ref = useRef<THREE.InstancedMesh>(null!)
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 1), [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#eef3ff', emissive: '#8a96b8', emissiveIntensity: 0.7, transparent: true, opacity: 0.55, depthWrite: false, roughness: 1 }), [])
  const parts = useMemo(() => {
    const r = rng(100 + idx)
    return Array.from({ length: N_WISP }, () => {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * c.r * 0.85
      return { x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d, y: c.y0 + 20 + r() * Math.max(10, c.y1 - c.y0 - 40), s: 0.7 + r() * 0.6, rnd: r() }
    })
  }, [c, idx])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    ref.current.count = Math.max(1, Math.floor(N_WISP * qcfg().particles))
    const a = currentDir(c, ship.time), st = currentStrength(c, ship.time)
    const ux = Math.sin(a), uz = Math.cos(a)
    q.setFromEuler(e.set(0, a, 0))
    parts.forEach((p, i) => {
      p.x += ux * st * dt * 1.2
      p.z += uz * st * dt * 1.2
      const d = Math.hypot(p.x - c.x, p.z - c.z)
      if (d > c.r * 0.9) {
        // 从上风处重新出现
        const side = (p.rnd - 0.5) * 1.6 * c.r
        p.x = c.x - ux * c.r * 0.8 + uz * side * 0.6
        p.z = c.z - uz * c.r * 0.8 - ux * side * 0.6
        p.rnd = (p.rnd * 9.31 + 0.37) % 1
      }
      const fade = 1 - Math.min(1, Math.max(0, (d / c.r - 0.6) / 0.3))
      const s = p.s * (0.3 + 0.7 * fade)
      ref.current.setMatrixAt(i, m.compose(v.set(p.x, p.y, p.z), q, sc.set(14 * s, 3.5 * s, 70 * s * (0.6 + st / 12))))
    })
    ref.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, mat, N_WISP]} frustumCulled={false} />
}
