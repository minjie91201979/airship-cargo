import { Canvas } from '@react-three/fiber'
import { World } from './components/World'
import { Ui } from './components/Ui'
import { QUALITY_CFG, useSettings } from './game/settings'
import { useGame } from './game/store'
import { photoFilter, usePhoto } from './game/photo'

export default function App() {
  const quality = useSettings((s) => s.quality)
  const photoOn = useGame((s) => s.screen === 'photo')
  const filter = usePhoto((p) => photoFilter(p))
  return (
    <div className="app">
      <Canvas style={{ filter: photoOn ? filter : 'none' }} shadows="percentage" dpr={QUALITY_CFG[quality].dpr} gl={{ powerPreference: 'high-performance', antialias: true }} camera={{ fov: 58, near: 0.3, far: 6000, position: [180, 160, 180] }}>
        <World />
      </Canvas>
      <Ui />
    </div>
  )
}
