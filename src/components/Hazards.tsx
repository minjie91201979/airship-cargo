import { qcfg } from '../game/settings'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { bolts, drops, pirate, storms, stormLife, stormAt, STORM_TOP } from '../game/hazards'
import { ship } from '../game/flight'
import { env } from '../game/env'
import { rng } from '../game/rng'

/** 雷暴云团、雨幕、闪电、空贼飞艇、抛下的货箱 */
export function Hazards() {
  return (
    <>
      {[0, 1, 2].map((i) => <StormCell key={i} slot={i} />)}
      <Bolts />
      <Rain />
      <Pirate />
      <Drops />
    </>
  )
}

const PUFFS = 46
function StormCell({ slot }: { slot: number }) {
  const g = useRef<THREE.Group>(null!)
  const inst = useRef<THREE.InstancedMesh>(null!)
  const curtain = useRef<THREE.Mesh>(null!)
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 1), [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#30323c', emissive: '#0c0d14', emissiveIntensity: 1, roughness: 1, flatShading: true }), [])
  const layout = useMemo(() => {
    const r = rng(500 + slot * 17)
    const out: { x: number; y: number; z: number; sx: number; sy: number; sz: number; rot: number }[] = []
    for (let i = 0; i < PUFFS; i++) {
      let rad: number, y: number, s: number, sy: number
      if (i < 16) { rad = 0.25 + r() * 0.8; y = 410 + r() * 50; s = 0.4 + r() * 0.25; sy = 0.16 }
      else if (i < 34) { rad = r() * 0.42; y = 150 + r() * 260; s = 0.28 + r() * 0.16; sy = 0.32 }
      else { rad = 0.2 + r() * 0.45; y = 70 + r() * 90; s = 0.24 + r() * 0.12; sy = 0.2 }
      const a = r() * Math.PI * 2
      out.push({ x: Math.cos(a) * rad, y, z: Math.sin(a) * rad, sx: s, sy, sz: s * (0.8 + r() * 0.4), rot: r() * Math.PI })
    }
    return out
  }, [slot])
  const curtainMat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uA: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uT, uA; varying vec2 vUv;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        float col = floor(vUv.x * 160.0);
        float streak = step(0.55, h(col)) * fract(vUv.y * 6.0 + uT * (1.6 + h(col + 7.0)) + h(col) * 10.0);
        float a = (0.22 + streak * 0.35) * uA * smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
        gl_FragColor = vec4(vec3(0.22, 0.24, 0.30), a * 1.3);
      }`,
  }), [])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ clock }) => {
    const s = storms[slot]
    g.current.visible = !!s
    inst.current.count = Math.max(8, Math.floor(PUFFS * (0.4 + 0.6 * qcfg().clouds)))
    if (!s) return
    const life = stormLife(s)
    g.current.position.set(s.x, 0, s.z)
    const t = clock.elapsedTime
    layout.forEach((p, i) => {
      const k = 0.4 + 0.6 * life
      q.setFromEuler(e.set(0, p.rot + t * 0.02 * (i % 2 ? 1 : -1), 0))
      inst.current.setMatrixAt(i, m.compose(v.set(p.x * s.r, p.y * (0.7 + 0.3 * life), p.z * s.r), q, sc.set(p.sx * s.r * k, p.sy * s.r * k * 1.6, p.sz * s.r * k)))
    })
    inst.current.instanceMatrix.needsUpdate = true
    mat.emissiveIntensity = 1 + env.flash * 2.5
    mat.emissive.set(env.flash > 0.05 ? '#3a3f66' : '#0c0d14')
    curtain.current.scale.set(s.r * 0.5, 1, s.r * 0.5)
    curtainMat.uniforms.uT.value = t
    curtainMat.uniforms.uA.value = life
  })
  return (
    <group ref={g} visible={false}>
      <instancedMesh ref={inst} args={[geo, mat, PUFFS]} frustumCulled={false} castShadow={false} />
      <mesh ref={curtain} material={curtainMat} position={[0, 210, 0]}><cylinderGeometry args={[1, 1.15, 380, 28, 1, true]} /></mesh>
    </group>
  )
}

const SEG = 12
function Bolts() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#dfe6ff', transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), [])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const d = useMemo(() => new THREE.Vector3(), [])
  const mid = useMemo(() => new THREE.Vector3(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])
  const zero = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), [])
  useFrame(() => {
    let n = 0
    for (const b of bolts) {
      const flick = b.t < 0.08 || (b.t > 0.15 && b.t < 0.25) ? 1 : 0.35
      for (let i = 0; i < b.pts.length - 1 && n < 6 * SEG; i++) {
        d.subVectors(b.pts[i + 1], b.pts[i])
        mid.addVectors(b.pts[i], b.pts[i + 1]).multiplyScalar(0.5)
        q.setFromUnitVectors(up, d.clone().normalize())
        const w = (b.hit ? 3.2 : 2.6) * flick
        ref.current.setMatrixAt(n++, m.compose(mid, q, sc.set(w, d.length(), w)))
      }
    }
    for (let i = n; i < 6 * SEG; i++) ref.current.setMatrixAt(i, zero)
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.visible = n > 0
  })
  return <instancedMesh ref={ref} args={[geo, mat, 6 * SEG]} frustumCulled={false} />
}

/** 身处雷暴中时，镜头周围的雨丝 */
const NR = 260
function Rain() {
  const { camera } = useThree()
  const ref = useRef<THREE.InstancedMesh>(null!)
  const geo = useMemo(() => new THREE.BoxGeometry(0.05, 2.6, 0.05), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#b8c4dc', transparent: true, opacity: 0, depthWrite: false, fog: false }), [])
  const p = useMemo(() => {
    const r = rng(9)
    return Array.from({ length: NR }, () => new THREE.Vector3((r() - 0.5) * 70, (r() - 0.5) * 50, (r() - 0.5) * 70))
  }, [])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const k = stormAt(camera.position.x, camera.position.y, camera.position.z).k
    ref.current.count = Math.max(1, Math.floor(NR * qcfg().particles))
    mat.opacity = Math.min(0.55, k * 0.7)
    ref.current.visible = mat.opacity > 0.02
    if (!ref.current.visible) return
    p.forEach((o, i) => {
      o.y -= 34 * dt
      if (o.y < -25) o.y += 50
      const x = camera.position.x + ((((o.x - camera.position.x) % 70) + 105) % 70) - 35
      const z = camera.position.z + ((((o.z - camera.position.z) % 70) + 105) % 70) - 35
      ref.current.setMatrixAt(i, m.makeTranslation(v.set(x, camera.position.y + o.y, z)))
    })
    ref.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, mat, NR]} frustumCulled={false} />
}

/** 空贼飞艇：暗色气囊、黑帆、骷髅旗、红灯 */
export const PM = {
  env: new THREE.MeshStandardMaterial({ color: '#2b2428', roughness: 0.8, flatShading: true }),
  stripe: new THREE.MeshStandardMaterial({ color: '#7a1a18', roughness: 0.7, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: '#2e2018', roughness: 0.9, flatShading: true }),
  iron: new THREE.MeshStandardMaterial({ color: '#1a1818', metalness: 0.6, roughness: 0.5, flatShading: true }),
  sail: new THREE.MeshStandardMaterial({ color: '#121012', roughness: 1, side: THREE.DoubleSide }),
  bone: new THREE.MeshBasicMaterial({ color: '#e8e0d0', side: THREE.DoubleSide }),
  lamp: new THREE.MeshBasicMaterial({ color: '#ff3020', toneMapped: false }),
  rope: new THREE.MeshBasicMaterial({ color: '#2a2018' }),
}
function Pirate() {
  const g = useRef<THREE.Group>(null!)
  const prop = useRef<THREE.Group>(null!)
  const flag = useRef<THREE.Group>(null!)
  const hook = useRef<THREE.Mesh>(null!)
  const lamp = useRef<THREE.PointLight>(null!)
  const d = useMemo(() => new THREE.Vector3(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  useFrame(({ clock }, dt) => {
    g.current.visible = pirate.active
    hook.current.visible = false
    lamp.current.visible = qcfg().lights
    if (!pirate.active) return
    const t = clock.elapsedTime
    g.current.position.copy(pirate.pos)
    g.current.position.y += Math.sin(t * 0.8) * 0.6
    const dd = pirate.dead
    g.current.rotation.set(Math.sin(t * 0.6) * 0.03 + dd * 0.08, pirate.yaw, Math.sin(t * 0.5) * 0.05 + dd * 0.18)
    prop.current.rotation.z += Math.min(dt, 0.1) * 14
    flag.current.rotation.y = Math.sin(t * 3) * 0.25
    lamp.current.intensity = 80 + env.night * 600
    // 钩索：抓钩进度越高越接近目标
    if (pirate.grapple > 0.02 && pirate.state === 'chase') {
      const from = pirate.pos.clone().add(new THREE.Vector3(0, -8, 0))
      const to = ship.pos.clone().add(new THREE.Vector3(0, -8, 0))
      const end = from.clone().lerp(to, Math.min(1, pirate.grapple * 1.3))
      d.subVectors(end, from)
      hook.current.visible = true
      hook.current.position.copy(from).addScaledVector(d, 0.5)
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())
      hook.current.quaternion.copy(q)
      hook.current.scale.set(1, d.length(), 1)
    }
  })
  return (
    <>
      <group ref={g} visible={false}>
        <mesh material={PM.env} scale={[4, 4, 11.5]} castShadow><sphereGeometry args={[1, 14, 9]} /></mesh>
        {[-6, 0, 6].map((z) => <mesh key={z} material={PM.stripe} position={[0, 0, z]}><torusGeometry args={[4 * Math.sqrt(1 - (z / 11.5) ** 2) + 0.05, 0.25, 5, 22]} /></mesh>)}
        {/* 锯齿尾翼 */}
        {[0, 1, 2, 3].map((i) => <mesh key={i} material={PM.stripe} position={[Math.cos((i * Math.PI) / 2) * 3, Math.sin((i * Math.PI) / 2) * 3, -9.5]} rotation-z={(i * Math.PI) / 2}><boxGeometry args={[0.2, 3.6, 3.4]} /></mesh>)}
        {/* 吊舱 */}
        <group position={[0, -7.4, 0]}>
          <mesh material={PM.wood} castShadow><boxGeometry args={[2.6, 1.5, 9.5]} /></mesh>
          <mesh material={PM.iron} position={[0, 0.2, 5.4]} rotation-x={Math.PI / 2}><coneGeometry args={[1.0, 2.2, 4]} /></mesh>
          {/* 桅杆 + 黑帆 */}
          <mesh material={PM.wood} position={[0, 3.2, 1]}><cylinderGeometry args={[0.1, 0.12, 5.6, 5]} /></mesh>
          <mesh material={PM.sail} position={[0.05, 3.4, -0.4]} rotation-y={Math.PI / 2}><shapeGeometry args={[new THREE.Shape([new THREE.Vector2(-1.2, -2.3), new THREE.Vector2(2.6, -2.3), new THREE.Vector2(-1.2, 2.6)])]} /></mesh>
          {/* 骷髅旗 */}
          <mesh material={PM.wood} position={[0, 2.2, -4.4]}><cylinderGeometry args={[0.06, 0.06, 3, 4]} /></mesh>
          <group ref={flag} position={[0, 3.2, -5.3]}>
            <mesh material={PM.sail} rotation-y={Math.PI / 2}><planeGeometry args={[1.8, 1.1]} /></mesh>
            <mesh material={PM.bone} position={[0.02, 0.1, 0]} rotation-y={Math.PI / 2}><circleGeometry args={[0.28, 10]} /></mesh>
            <mesh material={PM.bone} position={[0.02, -0.25, 0]} rotation={[Math.PI / 4, Math.PI / 2, 0]}><planeGeometry args={[0.9, 0.08]} /></mesh>
            <mesh material={PM.bone} position={[0.02, -0.25, 0]} rotation={[-Math.PI / 4, Math.PI / 2, 0]}><planeGeometry args={[0.9, 0.08]} /></mesh>
          </group>
          {[-1, 1].map((sx) => <mesh key={sx} material={PM.lamp} position={[sx * 1.4, 0.3, 3.5]}><sphereGeometry args={[0.22, 6, 4]} /></mesh>)}
          <mesh material={PM.lamp} position={[0, 1, 4.6]}><sphereGeometry args={[0.3, 6, 4]} /></mesh>
          <pointLight ref={lamp} position={[0, 1, 5]} color="#ff3020" distance={60} />
          {/* 螺旋桨 */}
          <group ref={prop} position={[0, 0, -5.4]}>
            {[0, 1, 2].map((i) => <mesh key={i} material={PM.iron} rotation-z={(i * Math.PI * 2) / 3}><boxGeometry args={[0.35, 3.2, 0.08]} /></mesh>)}
          </group>
        </group>
        {[-3, 3].map((z) => [-1, 1].map((sx) => <mesh key={`${z}${sx}`} material={PM.rope} position={[sx * 1.4, -5.2, z]} rotation-z={sx * -0.3}><cylinderGeometry args={[0.04, 0.04, 3.6, 3]} /></mesh>))}
      </group>
      <mesh ref={hook} material={PM.rope} visible={false}><cylinderGeometry args={[0.08, 0.08, 1, 4]} /></mesh>
    </>
  )
}

function Drops() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const geo = useMemo(() => new THREE.BoxGeometry(1.2, 1.1, 1.4), [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b07a42', roughness: 0.8 }), [])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const s1 = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  const zero = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), [])
  useFrame(() => {
    for (let i = 0; i < 8; i++) {
      const d = drops[i]
      if (!d) { ref.current.setMatrixAt(i, zero); continue }
      q.setFromEuler(e.set(d.t * 2, d.t * 1.3, 0))
      ref.current.setMatrixAt(i, m.compose(d.pos, q, s1))
    }
    ref.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, mat, 8]} frustumCulled={false} />
}

export { STORM_TOP }
