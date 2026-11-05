import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

/**
 * Visual emergency representation for FIRE incidents:
 * - Multi-tiered animated flames in yellow, orange, and red.
 * - Rising billowing smoke particle column.
 * - Glowing embers and scorched pavement decal.
 * - Warm flickering point light making fire instantly noticeable from city camera.
 */
export default function FireEffect({ node }) {
  const flamesRef = useRef([])
  const smokeRef = useRef([])
  const embersRef = useRef([])
  const lightRef = useRef()

  // 6 Flame cones with varied base offsets, sizes, and colors
  const flameData = [
    { pos: [0, 0, 0], scale: [1.1, 2.8, 1.1], color: '#FF4500', speed: 8.5, phase: 0 },
    { pos: [-0.4, 0, 0.3], scale: [0.85, 2.2, 0.85], color: '#FF7700', speed: 10, phase: 1.2 },
    { pos: [0.35, 0, -0.3], scale: [0.9, 2.4, 0.9], color: '#FF3300', speed: 9.2, phase: 2.1 },
    { pos: [0.45, 0, 0.35], scale: [0.75, 1.8, 0.75], color: '#FFAA00', speed: 11, phase: 3.4 },
    { pos: [-0.3, 0, -0.4], scale: [0.8, 2.0, 0.8], color: '#FF5500', speed: 9.8, phase: 4.5 },
    // Core intense yellow flame
    { pos: [0.05, 0.1, 0.05], scale: [0.65, 2.1, 0.65], color: '#FFF066', speed: 12, phase: 5.2 },
  ]

  // 8 Smoke puff particles rising and drifting
  const smokeData = Array.from({ length: 8 }, (_, i) => ({
    offsetY: 1.0 + i * 0.7,
    speed: 0.8 + (i % 3) * 0.25,
    driftX: Math.sin(i * 1.7) * 0.5,
    driftZ: Math.cos(i * 2.3) * 0.5,
    baseScale: 0.45 + (i % 4) * 0.15,
  }))

  // 6 Floating embers
  const emberData = Array.from({ length: 6 }, (_, i) => ({
    offsetY: 0.5 + i * 0.6,
    speed: 2.2 + (i % 3) * 0.6,
    phase: i * 1.1,
  }))

  useFrame(({ clock }) => {
    const t = clock.elapsedTime

    // Animate dancing flames
    flamesRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const fd = flameData[i]
      const sY = fd.scale[1] * (0.85 + Math.sin(t * fd.speed + fd.phase) * 0.25)
      const sXZ = fd.scale[0] * (0.9 + Math.cos(t * (fd.speed * 0.8) + fd.phase) * 0.18)
      mesh.scale.set(sXZ, sY, sXZ)
      mesh.rotation.y = t * 1.5 + fd.phase
      mesh.rotation.z = Math.sin(t * (fd.speed * 0.5) + fd.phase) * 0.12
    })

    // Animate rising smoke
    smokeRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const sd = smokeData[i]
      const cycleY = ((t * sd.speed + sd.offsetY) % 5.5) + 0.6
      const progress = cycleY / 6.0
      mesh.position.y = cycleY
      mesh.position.x = sd.driftX * progress + Math.sin(t * 1.5 + i) * 0.2
      mesh.position.z = sd.driftZ * progress + Math.cos(t * 1.5 + i) * 0.2
      const s = sd.baseScale * (1 + progress * 2.2)
      mesh.scale.set(s, s * 0.85, s)
      mesh.material.opacity = Math.max(0, 0.55 * (1 - progress * progress))
    })

    // Animate floating embers
    embersRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const ed = emberData[i]
      const y = ((t * ed.speed + ed.offsetY) % 4.0) + 0.4
      mesh.position.y = y
      mesh.position.x = Math.sin(t * 3.5 + ed.phase) * 0.5
      mesh.position.z = Math.cos(t * 3.5 + ed.phase) * 0.5
    })

    // Flickering light
    if (lightRef.current) {
      lightRef.current.intensity = 2.4 + Math.sin(t * 16) * 0.8 + Math.cos(t * 9) * 0.4
    }
  })

  return (
    <group position={[node.x, 0, node.z]}>
      {/* 1. Ground Scorch Mark & Embers */}
      <group position={[0, 0.05, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.7, 32]} />
          <meshBasicMaterial color="#1E1714" transparent opacity={0.88} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[1.65, 2.2, 32]} />
          <meshBasicMaterial color="#7C2D12" transparent opacity={0.65} depthWrite={false} />
        </mesh>
        {/* Ember patches on ground */}
        {[-0.5, 0.4, 0.1].map((x, idx) => (
          <mesh key={idx} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, (idx - 1) * 0.45]}>
            <circleGeometry args={[0.22, 12]} />
            <meshBasicMaterial color="#FF5722" transparent opacity={0.8} depthWrite={false} />
          </mesh>
        ))}
      </group>

      {/* 2. Dancing Flames Cluster */}
      <group position={[0, 0.1, 0]}>
        {flameData.map((fd, i) => (
          <mesh
            key={i}
            ref={el => (flamesRef.current[i] = el)}
            position={fd.pos}
            castShadow
          >
            <coneGeometry args={[0.5, 1, 8, 1, true]} />
            <meshStandardMaterial
              color={fd.color}
              emissive={fd.color}
              emissiveIntensity={0.85}
              roughness={0.2}
              transparent
              opacity={0.92}
            />
          </mesh>
        ))}
      </group>

      {/* 3. Rising Smoke Particle Column */}
      <group>
        {smokeData.map((_, i) => (
          <mesh
            key={i}
            ref={el => (smokeRef.current[i] = el)}
            position={[0, 1 + i * 0.5, 0]}
          >
            <sphereGeometry args={[0.4, 8, 8]} />
            <meshStandardMaterial
              color="#374151"
              roughness={0.9}
              transparent
              opacity={0.45}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>

      {/* 4. Rising Embers */}
      <group>
        {emberData.map((_, i) => (
          <mesh
            key={i}
            ref={el => (embersRef.current[i] = el)}
            position={[0, 1, 0]}
          >
            <boxGeometry args={[0.07, 0.07, 0.07]} />
            <meshBasicMaterial color={i % 2 === 0 ? '#FFAA00' : '#FF4500'} />
          </mesh>
        ))}
      </group>

      {/* 5. Fire Point Light for Visual Prominence from City Camera */}
      <pointLight
        ref={lightRef}
        position={[0, 1.8, 0]}
        color="#FF6A00"
        intensity={2.6}
        distance={14}
        decay={1.8}
        castShadow
      />
    </group>
  )
}
