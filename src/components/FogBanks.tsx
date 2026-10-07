import { qcfg } from '../game/settings'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FOG_BANKS, bankStrength, env } from '../game/env'
import { rng } from '../game/rng'

/** 雾区的外观：远处看是一团团低垂的白雾 */
const N = 34
export function FogBanks() {
  return <>{FOG_BANKS.map((b, i) => <Bank key={b.id} i={i} />)}</>
}
function Bank({ i }: { i: number }) {
  const b = FOG_BANKS[i]
  const ref = useRef<THREE.InstancedMesh>(null!)
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 1), [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#eef0f2', emissive: '#9aa0aa', emissiveIntensity: 0.5, roughness: 1, transparent: true, opacity: 0.5, depthWrite: false, flatShading: true }), [])
  const parts = useMemo(() => {
    const r = rng(300 + i)
    return Array.from({ length: N }, () => {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * b.r * 0.8
      return { x: b.x + Math.cos(a) * d, z: b.z + Math.sin(a) * d, y: 40 + r() * 170, s: 60 + r() * 70, ph: r() * 6 }
    })
  }, [b, i])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ clock }) => {
    ref.current.count = Math.max(6, Math.floor(N * (0.4 + 0.6 * qcfg().clouds)))
    const st = bankStrength(env.tod, i)
    const t = clock.elapsedTime
    parts.forEach((p, k) => {
      const s = p.s * (0.6 + 0.4 * st)
      ref.current.setMatrixAt(k, m.compose(v.set(p.x + Math.sin(t * 0.05 + p.ph) * 20, p.y, p.z), q, sc.set(s * 1.6, s * 0.55, s * 1.3)))
    })
    ref.current.instanceMatrix.needsUpdate = true
    mat.opacity = 0.35 + 0.25 * st
    mat.color.setScalar(1 - env.night * 0.7)
    mat.emissiveIntensity = 0.5 * (1 - env.night * 0.7)
  })
  return <instancedMesh ref={ref} args={[geo, mat, N]} frustumCulled={false} renderOrder={2} />
}
