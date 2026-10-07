import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { qcfg } from '../game/settings'
import { env } from '../game/env'
import { CLOUD_TOP, WALL } from '../game/world'
import { rng } from '../game/rng'

/** v1.3 霜原视觉：强风墙风幕、极光、降雪 */
export function FrostFx() {
  return (
    <>
      <WindWall />
      <Aurora />
      <Snowfall />
    </>
  )
}

/** 强风墙：高空通道（WALL.alt）以下翻滚的半透明风幕，几层竖直面板 + 流动条纹着色器 */
function WindWall() {
  const group = useRef<THREE.Group>(null!)
  const { camera } = useThree()
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.NormalBlending,
    uniforms: { uT: { value: 0 }, uNight: { value: 0 }, uTop: { value: WALL.alt }, uBot: { value: CLOUD_TOP }, uCam: { value: new THREE.Vector3() }, uDir: { value: 1 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uT, uNight, uTop, uBot, uDir; uniform vec3 uCam; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float y = (vW.y - uBot) / (uTop - uBot);
        // 条纹：横向拉长的噪声，沿 x 快速流动，并上下翻滚
        vec2 p = vec2(vW.x * 0.004 + uT * 0.35 * uDir, vW.y * 0.03 + sin(vW.x * 0.01 + uT) * 0.4);
        float s = n(p * vec2(1.0, 1.0)) * 0.6 + n(p * vec2(3.0, 2.3) + 7.0) * 0.4;
        s = smoothstep(0.45, 0.85, s);
        float top = 1.0 - smoothstep(0.88, 1.0, y);      // 通道上沿：清晰的边
        float side = 1.0 - smoothstep(${(WALL.x - 200).toFixed(1)}, ${(WALL.x + 250).toFixed(1)}, abs(vW.x));
        float dist = length(vW.xz - uCam.xz);
        float fade = (1.0 - smoothstep(1600.0, 2600.0, dist)) * smoothstep(8.0, 60.0, dist);
        float edge = smoothstep(0.96, 1.0, y) * (1.0 - smoothstep(1.0, 1.02, y));
        float band = 0.5 + 0.5 * sin(vW.y * 0.08 - uT * 1.5 + vW.x * 0.002);
        vec3 col = mix(mix(vec3(0.42, 0.52, 0.72), vec3(0.97, 0.99, 1.0), s * 0.8 + band * 0.2), vec3(0.3, 0.38, 0.58), uNight);
        float a = (0.2 + s * 0.45 + band * 0.08) * top * side * fade + edge * 0.6 * side * fade;
        if (y > 1.02 || y < 0.0) discard;
        gl_FragColor = vec4(col, a);
      }`,
  }), [])
  const H = WALL.alt - CLOUD_TOP + 8
  const W = WALL.x * 2 + 500
  const zs = useMemo(() => { const n = 5; return Array.from({ length: n }, (_, i) => WALL.z0 + ((WALL.z1 - WALL.z0) * (i + 0.5)) / n) }, [])
  useFrame(({ clock }) => {
    mat.uniforms.uT.value = clock.elapsedTime
    mat.uniforms.uNight.value = env.night
    mat.uniforms.uCam.value.copy(camera.position)
    group.current.visible = Math.abs(camera.position.z - (WALL.z0 + WALL.z1) / 2) < 2800
  })
  return (
    <group ref={group}>
      {zs.map((z) => <mesh key={z} position={[0, CLOUD_TOP + H / 2, z]} material={mat} renderOrder={2}><planeGeometry args={[W, H, 1, 1]} /></mesh>)}
    </group>
  )
}

/** 极光：夜里在霜原上空摆动的光帘（跟随镜头的天幕层，不受雾影响） */
function Aurora() {
  const ref = useRef<THREE.Group>(null!)
  const { camera } = useThree()
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uK: { value: 0 } },
    vertexShader: `uniform float uT; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position;
      p.z += sin(p.x * 0.004 + uT * 0.25) * 160.0 + sin(p.x * 0.011 - uT * 0.4) * 60.0;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
    fragmentShader: `uniform float uT, uK; varying vec2 vUv;
      float h(float x){ return fract(sin(x * 127.1) * 43758.5453); }
      float n(float x){ float i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(h(i), h(i+1.0), f); }
      void main(){
        float rays = n(vUv.x * 60.0 + uT * 0.6) * 0.6 + n(vUv.x * 170.0 - uT * 1.1) * 0.4;
        float band = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
        float ends = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
        vec3 g = vec3(0.25, 1.0, 0.55), v = vec3(0.65, 0.3, 1.0);
        vec3 col = mix(g, v, smoothstep(0.35, 0.95, vUv.y));
        float a = band * ends * (0.35 + rays * 0.9) * uK;
        gl_FragColor = vec4(col * a, a);
      }`,
  }), [])
  const curtains = useMemo(() => {
    // 环绕镜头的一圈光帘（北面最密最亮），任何朝向都能看到
    const out: { x: number; y: number; z: number; w: number; h: number; ry: number }[] = []
    const r = rng(303)
    for (let i = 0; i < 7; i++) {
      const az = -1.1 + (i / 6) * 2.2 + (r() - 0.5) * 0.2
      const d = 1300 + r() * 700
      out.push({ x: Math.sin(az) * d, y: 560 + r() * 220, z: Math.cos(az) * d, w: 2400 + r() * 1400, h: 800 + r() * 300, ry: az + (r() - 0.5) * 0.5 })
    }
    for (let i = 0; i < 4; i++) {
      const az = Math.PI * 0.6 + (i / 3) * Math.PI * 0.8
      const d = 1700 + r() * 500
      out.push({ x: Math.sin(az) * d, y: 640 + r() * 200, z: Math.cos(az) * d, w: 2200, h: 700, ry: az })
    }
    return out
  }, [])
  useFrame(({ clock }) => {
    mat.uniforms.uT.value = clock.elapsedTime
    // 霜原程度（env.frost 由 World 每帧写入）× 夜晚程度
    const k = Math.min(1, (env.frost ?? 0) * 1.3) * THREE.MathUtils.smoothstep(env.night, 0.35, 0.9) * (1 - env.fog * 0.8) * (1 - env.storm)
    mat.uniforms.uK.value = k
    ref.current.visible = k > 0.01
    ref.current.position.set(camera.position.x, camera.position.y * 0.3, camera.position.z)
  })
  return (
    <group ref={ref}>
      {curtains.map((c, i) => <mesh key={i} position={[c.x, c.y, c.z]} rotation-y={c.ry} material={mat} renderOrder={-8} frustumCulled={false}><planeGeometry args={[c.w, c.h, 64, 1]} /></mesh>)}
    </group>
  )
}

const SNOW_N = 1400
const SNOW_BOX = 140
/** 降雪：镜头周围循环的雪花粒子，数量随画质缩放 */
function Snowfall() {
  const ref = useRef<THREE.Points>(null!)
  const { camera } = useThree()
  const { geo, base } = useMemo(() => {
    const r = rng(91)
    const base = new Float32Array(SNOW_N * 3)
    for (let i = 0; i < SNOW_N; i++) base.set([r() * SNOW_BOX, r() * SNOW_BOX, r() * SNOW_BOX], i * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SNOW_N * 3), 3))
    return { geo, base }
  }, [])
  const mat = useMemo(() => new THREE.PointsMaterial({ color: '#ffffff', size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false }), [])
  const drift = useRef(0)
  useFrame(({ clock }, rawDt) => {
    const k = Math.min(1, (env.frost ?? 0) * 1.4)
    mat.opacity = 0.85 * k
    ref.current.visible = k > 0.02
    if (!ref.current.visible) return
    drift.current += Math.min(rawDt, 0.1) * 2.2
    const n = Math.floor(SNOW_N * qcfg().particles)
    geo.setDrawRange(0, n)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const a = pos.array as Float32Array
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z
    const t = clock.elapsedTime, half = SNOW_BOX / 2
    const wrap = (v: number, c: number) => c + ((((v - c) % SNOW_BOX) + SNOW_BOX * 1.5) % SNOW_BOX) - half
    for (let i = 0; i < n; i++) {
      const o = i * 3
      const x = base[o] + Math.sin(t * 0.6 + i) * 1.5 + t * 1.2
      const y = base[o + 1] - drift.current * (0.8 + (i % 7) * 0.08)
      const z = base[o + 2] + Math.cos(t * 0.5 + i * 0.7) * 1.5
      a[o] = wrap(x, cx); a[o + 1] = wrap(y, cy); a[o + 2] = wrap(z, cz)
    }
    pos.needsUpdate = true
    mat.color.set(env.night > 0.5 ? '#c8d4f0' : '#ffffff')
  })
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />
}
