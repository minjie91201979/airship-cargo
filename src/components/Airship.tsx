import { CargoCrates } from './Cargo3d'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ship } from '../game/flight'
import { useEco } from '../game/economy'
import { liveryOf } from '../game/upgrades'
import { env } from '../game/env'
import { hullOf } from '../game/hulls'

const M = {
  canvas: new THREE.MeshStandardMaterial({ color: '#dcc49a', flatShading: true, roughness: 0.85 }),
  canvas2: new THREE.MeshStandardMaterial({ color: '#c7a978', flatShading: true, roughness: 0.85 }),
  copper: new THREE.MeshStandardMaterial({ color: '#b8693a', metalness: 0.3, roughness: 0.5, flatShading: true }),
  brass: new THREE.MeshStandardMaterial({ color: '#e0b25a', metalness: 0.35, roughness: 0.4, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: '#6b4528', flatShading: true, roughness: 0.85 }),
  woodLight: new THREE.MeshStandardMaterial({ color: '#8f6038', flatShading: true, roughness: 0.85 }),
  iron: new THREE.MeshStandardMaterial({ color: '#34302e', metalness: 0.6, roughness: 0.5, flatShading: true }),
  fin: new THREE.MeshStandardMaterial({ color: '#a5503a', flatShading: true, roughness: 0.7 }),
  window: new THREE.MeshStandardMaterial({ color: '#ffd98a', emissive: '#ffb347', emissiveIntensity: 1.8 }),
  red: new THREE.MeshBasicMaterial({ color: '#ff4030', toneMapped: false }),
  green: new THREE.MeshBasicMaterial({ color: '#40ff70', toneMapped: false }),
  rope: new THREE.MeshStandardMaterial({ color: '#4a3b2c', roughness: 1 }),
  white: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
  felt: new THREE.MeshStandardMaterial({ color: '#7a3a2e', flatShading: true, roughness: 1 }),
}

const ER0 = 4.6
/** 吊舱中心高度（相对气囊中心） */
export const GONDOLA_Y = -8.2
/** 舰桥机位 */
export const BRIDGE_EYE = new THREE.Vector3(0, -5.9, 4.4)

/** 两点之间的细杆（吊索） */
function Rod({ a, b, r = 0.05, m = M.rope }: { a: [number, number, number]; b: [number, number, number]; r?: number; m?: THREE.Material }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b)
    const d = vb.clone().sub(va)
    return { pos: va.add(vb).multiplyScalar(0.5).toArray(), quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), len: d.length() }
  }, [a, b])
  return <mesh position={pos} quaternion={quat} material={m}><cylinderGeometry args={[r, r, len, 4]} /></mesh>
}

/** 各级外观参数 */
const ENV_R = [4.6, 4.95, 5.3, 5.75]
const ENV_L = [13, 14, 15, 16.3]
const ENV_BANDS = [6, 8, 10, 12]
const PROP_BLADES = [3, 3, 4, 4]
const PROP_SCALE = [1, 1.15, 1.28, 1.42]
const GON_W = [2.8, 3.1, 3.4, 3.8]

export function Airship() {
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const prop = useRef<THREE.Group>(null!)
  const rudder = useRef<THREE.Group>(null!)
  const elev = useRef<THREE.Group>(null!)
  const stack = useRef<THREE.Object3D>(null!)
  const stack2 = useRef<THREE.Object3D>(null!)
  const wheel = useRef<THREE.Group>(null!)
  const spot = useRef<THREE.SpotLight>(null!)
  const cone = useRef<THREE.Mesh>(null!)
  const mast = useRef<THREE.Mesh>(null!)
  const spotTarget = useMemo(() => new THREE.Object3D(), [])
  const coneMat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uA: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uA; varying vec2 vUv; void main(){ float a = pow(vUv.y, 1.6) * uA; gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * a, a); }`,
  }), [])
  const parts = useEco((s) => s.parts)
  const liveryId = useEco((s) => s.previewLivery ?? s.livery)
  const hullId = useEco((s) => s.previewHull ?? s.hull)
  const coldKit = useEco((s) => s.coldKit)
  const H = hullOf(hullId)
  const light = H.id === 'light', giant = H.id === 'giant'
  const sp1 = useRef<THREE.Group>(null!)
  const sp2 = useRef<THREE.Group>(null!)

  // 涂装：直接改共享材质颜色
  useEffect(() => {
    const l = liveryOf(liveryId)
    M.canvas.color.set(l.canvas)
    M.canvas2.color.set(l.canvas2)
    M.fin.color.set(l.fin)
    M.wood.color.set(l.wood)
    M.woodLight.color.set(l.wood).offsetHSL(0, 0, 0.08)
    M.copper.color.set(l.band)
  }, [liveryId])

  const eLv = parts.envelope - 1, bLv = parts.boiler - 1, pLv = parts.prop - 1, hLv = parts.hold - 1, aLv = parts.armor - 1
  const ER = ENV_R[eLv], EL = ENV_L[eLv]
  const dy = ER - ER0
  const envR = (z: number) => ER * Math.sqrt(Math.max(0, 1 - (z / EL) ** 2))
  const W = GON_W[hLv], wk = W / 2.8
  const envGeo = useMemo(() => new THREE.SphereGeometry(1, 22, 12), [])
  const bands = useMemo(() => {
    const n = ENV_BANDS[eLv], span = EL * 0.78
    return Array.from({ length: n }, (_, i) => {
      const z = -span + (2 * span * i) / (n - 1)
      return { z, r: ER * Math.sqrt(Math.max(0, 1 - (z / EL) ** 2)) + 0.04 }
    })
  }, [eLv, ER, EL])
  // 纵向蒙皮条（交替两色）
  const gores = useMemo(() => {
    const g = new THREE.SphereGeometry(1.012, 22, 12, 0, Math.PI / 10)
    return Array.from({ length: 10 }, (_, i) => ({ g, rot: (i * Math.PI) / 5 }))
  }, [])
  const finZ = -EL * 0.815, tailZ = -EL * 0.977

  useFrame(() => {
    const s = ship
    root.current.position.copy(s.pos)
    root.current.rotation.set(0, s.yaw, 0)
    body.current.rotation.set(s.pitch, 0, s.roll, 'YXZ')
    prop.current.rotation.z = s.propAngle
    if (sp1.current) sp1.current.rotation.z = -s.propAngle * 1.1
    if (sp2.current) sp2.current.rotation.z = s.propAngle * 1.1
    rudder.current.rotation.y = -s.rudder * 0.5
    wheel.current.rotation.z = s.rudder * 2.2
    elev.current.rotation.x = s.pitch * 1.5
    // 夜航灯光
    const n = env.night
    M.window.emissiveIntensity = 1.8 + n * 2.5
    const on = env.searchlight
    spot.current.intensity = on ? 4000 + n * 6000 : 0
    coneMat.uniforms.uA.value = on ? 0.1 + n * 0.3 + env.fog * 0.15 : 0
    cone.current.visible = on
    mast.current.visible = n > 0.2 && Math.sin(s.time * 4) > -0.3
  })

  const blades = PROP_BLADES[pLv], ps = PROP_SCALE[pLv]
  const boilerR = bLv >= 3 ? 1.0 : 0.85
  const stacks = bLv >= 2 ? [-0.5, 0.5] : [0]

  return (
    <>
    <group ref={root}>
      <group ref={body}>
      <group scale={H.scale}>
        <group position={[0, dy, 0]} scale={light ? [0.84, 0.84, 1.04] : 1}>
          {/* 气囊 */}
          <mesh geometry={envGeo} material={M.canvas} scale={[ER, ER, EL]} castShadow />
          {gores.map((g, i) => <mesh key={i} geometry={g.g} material={M.canvas2} scale={[ER, ER, EL]} rotation-z={g.rot} />)}
          {/* v1.3 轻型快艇：气囊两侧的竞速条纹 */}
          {light && [-1, 1].map((sx) => <mesh key={sx} material={M.fin} position={[sx * ER * 0.99, 0, 0]} scale={[0.1, 0.55, EL * 0.8]}><sphereGeometry args={[1, 10, 6]} /></mesh>)}
          {bands.map((b) => (
            <mesh key={b.z} position={[0, 0, b.z]} material={M.copper}><torusGeometry args={[b.r, 0.13, 5, 30]} /></mesh>
          ))}
          <mesh material={M.brass} position={[0, 0, EL - 0.15]} scale={[1, 1, 0.6]}><sphereGeometry args={[0.75 + eLv * 0.1, 10, 6]} /></mesh>
          {/* 腹部龙骨 */}
          <mesh material={aLv >= 3 ? M.brass : M.copper} position={[0, -ER + 0.2, 0]}><boxGeometry args={[0.6 + aLv * 0.1, 0.5, EL * 1.54]} /></mesh>
          {/* 全覆装甲：气囊鼻锥护板 */}
          {aLv >= 3 && (
            <group position={[0, 0, EL * 0.86]}>
              <mesh material={M.brass}><torusGeometry args={[envR(EL * 0.86) + 0.1, 0.22, 6, 30]} /></mesh>
              {Array.from({ length: 8 }, (_, i) => {
                const a = (i / 8) * Math.PI * 2, r = envR(EL * 0.93)
                return <mesh key={i} material={M.brass} position={[Math.cos(a) * r, Math.sin(a) * r, EL * 0.07]} rotation={[0, 0, a]}><boxGeometry args={[0.12, 0.9, 1.6]} /></mesh>
              })}
            </group>
          )}
          {/* 尾翼 */}
          <mesh material={M.fin} position={[0, envR(finZ) + 1.7, finZ]} castShadow><boxGeometry args={[0.25, 3.8, 4.2]} /></mesh>
          <mesh material={M.fin} position={[0, -envR(finZ) - 1.5, finZ]} castShadow><boxGeometry args={[0.25, 3.4, 4.2]} /></mesh>
          {[-1, 1].map((sx) => (
            <mesh key={sx} material={M.fin} position={[sx * (envR(finZ) + 1.4), 0, finZ]} castShadow><boxGeometry args={[3.2, 0.18, 3.8]} /></mesh>
          ))}
          {aLv >= 2 && <mesh material={M.brass} position={[0, envR(finZ) + 3.62, finZ]}><boxGeometry args={[0.32, 0.12, 4.3]} /></mesh>}
          <group ref={rudder} position={[0, 0, tailZ]}>
            <mesh material={M.copper} position={[0, 3.3, -1]}><boxGeometry args={[0.2, 4, 2]} /></mesh>
            <mesh material={M.copper} position={[0, -3.1, -1]}><boxGeometry args={[0.2, 3.6, 2]} /></mesh>
            <mesh material={M.brass} position={[0, 0.1, 0]}><cylinderGeometry args={[0.1, 0.1, 10.5, 5]} /></mesh>
          </group>
          <group ref={elev} position={[0, 0, tailZ]}>
            <mesh material={M.copper} position={[0, 0, -0.9]}><boxGeometry args={[8.4, 0.14, 1.6]} /></mesh>
          </group>
        </group>
        {/* v1.3 巨型运输舰：两侧副气囊 + 连接桁架 */}
        {giant && [-1, 1].map((sx) => (
          <group key={sx} position={[sx * (ER + 3.2), dy - 1.6, -1]}>
            <mesh geometry={envGeo} material={M.canvas2} scale={[ER * 0.55, ER * 0.55, EL * 0.72]} castShadow />
            {[-0.5, 0, 0.5].map((t) => <mesh key={t} material={M.copper} position={[0, 0, t * EL * 0.72]}><torusGeometry args={[ER * 0.55 * Math.sqrt(1 - t * t) + 0.05, 0.12, 5, 20]} /></mesh>)}
            <mesh material={M.fin} position={[0, ER * 0.55 + 0.8, -EL * 0.6]}><boxGeometry args={[0.2, 2.2, 2.6]} /></mesh>
            {[-3, 3].map((z) => <mesh key={z} material={M.iron} position={[-sx * 1.9, 0.4, z]} rotation-z={sx * 1.2}><boxGeometry args={[0.25, 4.2, 0.25]} /></mesh>)}
          </group>
        ))}
        {/* v1.3 轻型快艇：吊舱两侧的短翼 + 前翼 */}
        {light && (
          <group position={[0, GONDOLA_Y + 0.2, 0]}>
            {[-1, 1].map((sx) => <mesh key={sx} material={M.fin} position={[sx * 3.2, 0, -1.5]} rotation={[0, sx * 0.35, sx * -0.12]} castShadow><boxGeometry args={[3.6, 0.14, 2]} /></mesh>)}
            {[-1, 1].map((sx) => <mesh key={`c${sx}`} material={M.brass} position={[sx * 1.9, 0.5, 4.2]} rotation-y={sx * 0.5}><boxGeometry args={[1.6, 0.1, 0.8]} /></mesh>)}
            <mesh material={M.fin} position={[0, 1.8, -4.6]}><boxGeometry args={[0.16, 2, 1.8]} /></mesh>
          </group>
        )}

        {/* 吊索 */}
        {[-3.5, 0, 3.5].map((z) => [-1, 1].map((sx) => (
          <Rod key={`${z}${sx}${eLv}${hLv}`} a={[sx * envR(z * 1.15) * 0.45, dy - envR(z * 1.15) * 0.88, z * 1.15]} b={[sx * 1.25 * wk, GONDOLA_Y + 1.6, z]} />
        )))}
        {[-1, 1].map((sx) => <Rod key={`${sx}${eLv}${hLv}`} a={[sx * 1.2, dy - envR(7.5) * 0.92, 7.5]} b={[sx * 1.25 * wk, GONDOLA_Y + 2.5, 1.2]} />)}

        {/* 吊舱 */}
        <group position={[0, GONDOLA_Y, 0]}>
          <CargoCrates halfW={W / 2} big={hLv >= 2} />
          {/* 舷侧货架 */}
          {[-1, 1].map((sx) => (
            <group key={sx} position={[sx * (W / 2 + (hLv >= 2 ? 1.15 : 1.0)), 0, -2.0]}>
              <mesh material={M.woodLight} position={[0, -0.12, 0]}><boxGeometry args={[hLv >= 2 ? 2.2 : 1.9, 0.16, hLv >= 2 ? 5.8 : 4.6]} /></mesh>
              {[-1, 1].map((sz) => <mesh key={sz} material={M.iron} position={[-sx * 0.6, -0.55, sz * (hLv >= 2 ? 2.4 : 1.8)]} rotation-z={sx * 0.9}><boxGeometry args={[0.1, 1.3, 0.1]} /></mesh>)}
              <mesh material={M.brass} position={[sx * (hLv >= 2 ? 1.05 : 0.9), 0.25, 0]}><boxGeometry args={[0.07, 0.07, hLv >= 2 ? 5.6 : 4.4]} /></mesh>
              {[-1, 0, 1].map((k) => <mesh key={k} material={M.brass} position={[sx * (hLv >= 2 ? 1.05 : 0.9), 0.1, k * (hLv >= 2 ? 2.7 : 2.1)]}><boxGeometry args={[0.07, 0.36, 0.07]} /></mesh>)}
            </group>
          ))}
          <group scale={[wk, 1, 1]}>
            <mesh material={M.wood} castShadow><boxGeometry args={[2.8, 1.5, 9]} /></mesh>
            <mesh material={M.wood} position={[0, 0.05, 5.3]} rotation-x={Math.PI / 2} scale={[1, 1, 0.55]} castShadow><coneGeometry args={[1.55, 1.8, 4, 1]} /></mesh>
            <mesh material={M.woodLight} position={[0, -0.85, 0]}><boxGeometry args={[2.2, 0.3, 8.4]} /></mesh>
            <mesh material={M.brass} position={[0, 0.78, 0]}><boxGeometry args={[3.0, 0.12, 9.2]} /></mesh>
            {/* 装甲护板 */}
            {aLv >= 1 && [-1, 1].map((sx) => (
              <group key={sx}>
                {[-3, -1, 1, 3].map((z) => (
                  <group key={z} position={[sx * 1.43, -0.05, z]}>
                    <mesh material={M.brass}><boxGeometry args={[0.08, 1.15, 1.8]} /></mesh>
                    {[-0.4, 0.4].map((ry) => [-0.7, 0.7].map((rz) => <mesh key={`${ry}${rz}`} material={M.iron} position={[sx * 0.05, ry, rz]}><sphereGeometry args={[0.06, 4, 3]} /></mesh>))}
                  </group>
                ))}
              </group>
            ))}
            {aLv >= 2 && <mesh material={M.brass} position={[0, -0.2, 6.15]} rotation-x={Math.PI / 2} scale={[1, 1, 0.5]}><coneGeometry args={[0.7, 1.4, 4, 1]} /></mesh>}
            {aLv >= 2 && <mesh material={M.iron} position={[0, -1.05, 0]}><boxGeometry args={[2.4, 0.12, 8.8]} /></mesh>}
            {/* 船舱 */}
            <mesh material={M.woodLight} position={[0, 1.55, 1.6]} castShadow><boxGeometry args={[2.3, 1.6, 4.4]} /></mesh>
            <mesh material={aLv >= 3 ? M.brass : M.copper} position={[0, 2.45, 1.6]}><boxGeometry args={[2.6, 0.22, 4.8]} /></mesh>
            {[-1, 1].map((sx) => [0.2, 1.6, 3.0].map((z) => (
              <mesh key={`${sx}${z}`} material={M.window} position={[sx * 1.17, 1.65, z]}><boxGeometry args={[0.05, 0.6, 0.8]} /></mesh>
            )))}
            <mesh material={M.window} position={[0, 1.65, 3.82]}><boxGeometry args={[1.8, 0.6, 0.05]} /></mesh>
          </group>
          {/* 船首栏杆与船首斜桅 */}
          {[-1, 1].map((sx) => (
            <group key={sx}>
              <mesh material={M.brass} position={[sx * 1.3 * wk, 1.25, 3.1]}><boxGeometry args={[0.08, 0.08, 1.7]} /></mesh>
              <mesh material={M.brass} position={[sx * 0.72, 1.25, 4.95]} rotation-y={sx * -0.62}><boxGeometry args={[0.08, 0.08, 2.4]} /></mesh>
              {[2.4, 3.8, 5.2].map((z) => <mesh key={z} material={M.brass} position={[sx * (z < 4 ? 1.3 * wk : 0.45), 1.0, z]}><boxGeometry args={[0.07, 0.5, 0.07]} /></mesh>)}
            </group>
          ))}
          <mesh material={M.woodLight} position={[0, 1.0, 7.0]} rotation-x={Math.PI / 2 - 0.25}><cylinderGeometry args={[0.05, 0.09, 3.0, 5]} /></mesh>
          <mesh material={M.fin} position={[0, 1.45, 8.35]} rotation-z={-Math.PI / 2}><coneGeometry args={[0.14, 0.7, 3]} /></mesh>
          {/* 舵轮与罗经柜（舰桥视角可见） */}
          <mesh material={M.woodLight} position={[0, 1.05, 5.85]}><boxGeometry args={[0.3, 0.6, 0.3]} /></mesh>
          <group ref={wheel} position={[0, 1.45, 6.0]} scale={0.8}>
            <mesh material={M.brass}><torusGeometry args={[0.36, 0.04, 5, 16]} /></mesh>
            {[0, 1, 2, 3].map((i) => <mesh key={i} material={M.woodLight} rotation-z={(i * Math.PI) / 4}><boxGeometry args={[0.95, 0.045, 0.045]} /></mesh>)}
            <mesh material={M.brass} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.08, 0.08, 0.12, 8]} /></mesh>
          </group>
          {[-1, 1].map((sx) => (
            <group key={sx} position={[sx * 0.75, 1.25, 5.4]}>
              <mesh material={M.brass}><cylinderGeometry args={[0.16, 0.2, 0.5, 8]} /></mesh>
              <mesh material={M.window} position={[0, 0.27, 0]}><sphereGeometry args={[0.15, 8, 5]} /></mesh>
            </group>
          ))}
          {/* 探照灯（L） */}
          <group position={[0, -0.5, 6.6]}>
            <mesh material={M.brass} rotation-x={Math.PI / 2 + 0.35}><cylinderGeometry args={[0.32, 0.22, 0.6, 8]} /></mesh>
            <mesh material={M.window} position={[0, -0.1, 0.3]}><circleGeometry args={[0.28, 10]} /></mesh>
            <spotLight ref={spot} target={spotTarget} angle={0.32} penumbra={0.5} distance={320} decay={1.2} color="#fff2d0" intensity={0} />
            <primitive object={spotTarget} position={[0, -40, 120]} />
            <mesh ref={cone} material={coneMat} rotation-x={-(Math.PI / 2 - 0.32)} position={[0, -12.5, 38]}><coneGeometry args={[13, 80, 20, 1, true]} /></mesh>
          </group>
          {/* 桅顶白色闪灯（夜间） */}
          <mesh ref={mast} material={M.white} position={[0, 2.8, 1.6]}><sphereGeometry args={[0.14, 6, 4]} /></mesh>
          {/* 舷侧航行灯 */}
          <mesh material={M.red} position={[1.5 * wk, 0.3, 3.5]}><sphereGeometry args={[0.16, 6, 4]} /></mesh>
          <mesh material={M.green} position={[-1.5 * wk, 0.3, 3.5]}><sphereGeometry args={[0.16, 6, 4]} /></mesh>
          {/* 锅炉 + 烟囱（向后倾斜） */}
          <mesh material={M.iron} position={[0, 1.4 + (boilerR - 0.85), -2.6]} rotation-x={Math.PI / 2}><cylinderGeometry args={[boilerR, boilerR, 2.4, 12]} /></mesh>
          <mesh material={M.brass} position={[0, 1.4 + (boilerR - 0.85), -1.35]} rotation-x={Math.PI / 2}><torusGeometry args={[boilerR, 0.1, 5, 14]} /></mesh>
          {bLv >= 1 && [-3.2, -2.2].map((z) => <mesh key={z} material={M.brass} position={[0, 1.4 + (boilerR - 0.85), z]} rotation-x={Math.PI / 2}><torusGeometry args={[boilerR + 0.03, 0.07, 5, 14]} /></mesh>)}
          {bLv >= 3 && (
            <group position={[0, 1.4 + boilerR + 0.15, -2.2]}>
              <mesh material={M.brass}><sphereGeometry args={[0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
              {[-1, 1].map((sx) => <mesh key={sx} material={M.window} position={[sx * 0.75, -0.1, -0.6]} rotation-z={sx * 0.5}><cylinderGeometry args={[0.16, 0.16, 0.06, 10]} /></mesh>)}
            </group>
          )}
          {stacks.map((x, i) => (
            <group key={`${x}${bLv}`} position={[x, 1.9 + (boilerR - 0.85), -4]} rotation-x={-1.0}>
              <mesh material={M.iron} position={[0, 1.2, 0]}><cylinderGeometry args={[0.3, 0.4, 2.6, 8]} /></mesh>
              <mesh material={M.brass} position={[0, 2.5, 0]}><cylinderGeometry args={[0.42, 0.34, 0.3, 8]} /></mesh>
              <object3D ref={i === 0 ? stack : stack2} position={[0, 2.7, 0]} />
            </group>
          ))}
          {/* v1.3 防寒锅炉罩：毡布包裹 + 铜扣带 */}
          {coldKit && (
            <group position={[0, 1.4 + (boilerR - 0.85), -2.6]} rotation-x={Math.PI / 2}>
              <mesh material={M.felt}><cylinderGeometry args={[boilerR + 0.14, boilerR + 0.14, 1.9, 12]} /></mesh>
              {[-0.6, 0, 0.6].map((y) => <mesh key={y} material={M.brass} position={[0, y, 0]}><torusGeometry args={[boilerR + 0.16, 0.05, 4, 14]} /></mesh>)}
            </group>
          )}
          {/* v1.3 巨型运输舰：加长货台 + 两侧螺旋桨 */}
          {giant && (
            <group>
              {/* 腹部加长货舱 */}
              <mesh material={M.wood} position={[0, -1.75, -0.6]} castShadow><boxGeometry args={[W * 0.95, 1.5, 10.5]} /></mesh>
              <mesh material={M.brass} position={[0, -1.0, -0.6]}><boxGeometry args={[W * 1.0, 0.12, 10.7]} /></mesh>
              {[-4, -1.3, 1.4, 4].map((z) => <mesh key={z} material={M.iron} position={[0, -1.75, z - 0.6]}><boxGeometry args={[W * 0.97, 1.3, 0.12]} /></mesh>)}
              {[-1, 1].map((sx) => <mesh key={sx} material={M.window} position={[sx * W * 0.476, -1.75, 2.5]}><boxGeometry args={[0.05, 0.4, 0.9]} /></mesh>)}
              {[-1, 1].map((sx) => (
                <group key={sx} position={[sx * (W / 2 + 3.6), 0.6, -3]}>
                  <mesh material={M.iron} position={[-sx * 1.6, 0, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.14, 0.14, 3.4, 5]} /></mesh>
                  <mesh material={M.iron} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.35, 0.55, 1.6, 8]} /></mesh>
                  <group ref={sx < 0 ? sp1 : sp2} position={[0, 0, -1]}>
                    <mesh material={M.brass} rotation-x={Math.PI / 2}><coneGeometry args={[0.3, 0.6, 8]} /></mesh>
                    {[0, 1, 2].map((i) => <mesh key={i} material={M.woodLight} rotation-z={(i * Math.PI * 2) / 3}><boxGeometry args={[0.36, 2.6, 0.07]} /></mesh>)}
                  </group>
                </group>
              ))}
            </group>
          )}
          {/* 尾部螺旋桨 */}
          <mesh material={M.iron} position={[0, 0, -4.9]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.25, 0.5, 1, 8]} /></mesh>
          <group ref={prop} position={[0, 0, -5.6]} scale={[ps, ps, 1]}>
            <mesh material={M.brass} rotation-x={Math.PI / 2}><coneGeometry args={[0.35, 0.8, 8]} /></mesh>
            {Array.from({ length: blades }, (_, i) => (
              <mesh key={i} material={pLv >= 3 ? M.brass : M.woodLight} rotation-z={(i * Math.PI * 2) / blades} position={[0, 0, 0]}>
                <boxGeometry args={[pLv >= 1 ? 0.46 : 0.38, 3.4, 0.08]} />
              </mesh>
            ))}
          </group>
          <mesh material={M.brass} position={[0, 0, -5.6]} scale={[ps, ps, 1]}><torusGeometry args={[1.85, 0.08, 5, 20]} /></mesh>
        </group>
      </group>
      </group>
    </group>
    <Smoke stack={stack} />
    {stacks.length > 1 && <Smoke stack={stack2} />}
    </>
  )
}

/** 烟囱冒烟：排放速率与烟团大小随锅炉压力变化 */
const SMOKE_N = 48
function Smoke({ stack }: { stack: React.RefObject<THREE.Object3D> }) {
  const puffs = useMemo(() => Array.from({ length: SMOKE_N }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 1, life: 1, size: 1 })), [])
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 0), [])
  const mats = useMemo(() => puffs.map(() => new THREE.MeshStandardMaterial({ color: '#d9d0c6', transparent: true, opacity: 0, depthWrite: false, flatShading: true, roughness: 1 })), [puffs])
  const meshes = useRef<THREE.Mesh[]>([])
  const acc = useRef(0)
  const next = useRef(0)
  const wp = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const p = ship.pressure
    acc.current += dt * (1 + p * 10)
    if (!stack.current) return
    stack.current.getWorldPosition(wp)
    while (acc.current > 1) {
      acc.current -= 1
      const q = puffs[next.current]
      next.current = (next.current + 1) % SMOKE_N
      q.pos.copy(wp)
      q.vel.set((Math.random() - 0.5) * 0.8, 1.5 + p * 2.5, (Math.random() - 0.5) * 0.8).addScaledVector(ship.vel, 0.1)
      q.age = 0
      q.life = 2.5 + p * 2.5
      q.size = 0.3 + p * 0.45
    }
    puffs.forEach((q, i) => {
      const m = meshes.current[i]
      if (!m) return
      q.age += dt
      const t = q.age / q.life
      if (t >= 1) { m.visible = false; return }
      m.visible = true
      q.vel.multiplyScalar(1 - dt * 0.4)
      q.pos.addScaledVector(q.vel, dt)
      m.position.copy(q.pos)
      m.scale.setScalar(q.size * (1 + t * 3))
      m.rotation.set(q.age, q.age * 0.7, 0)
      mats[i].opacity = (1 - t) * (0.25 + p * 0.35) * Math.min(1, q.age * 6)
      mats[i].color.set(p > 0.75 ? '#9c948c' : '#ddd5cb')
    })
  })
  return (
    <group>
      {puffs.map((_, i) => <mesh key={i} ref={(m) => { if (m) meshes.current[i] = m }} geometry={geo} material={mats[i]} visible={false} frustumCulled={false} />)}
    </group>
  )
}
