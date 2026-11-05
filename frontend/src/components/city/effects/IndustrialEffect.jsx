import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

/**
 * Visual emergency representation for INDUSTRIAL incidents:
 * - Industrial chemical barrels (upright and tipped/leaking).
 * - Spilled hazardous fluid puddle on the pavement.
 * - Ruptured industrial pipe assembly with steam vent.
 * - Billowing industrial dark smoke plume.
 * - Jittering electrical / welding sparks with dynamic arcing.
 * - Rotating amber industrial hazard strobe and hazard bollards.
 */
export default function IndustrialEffect({ node }) {
  const smokeRef = useRef([])
  const sparksRef = useRef([])
  const beaconRef = useRef()
  const steamRef = useRef()

  const smokeCount = 7
  const smokeData = Array.from({ length: smokeCount }, (_, i) => ({
    speed: 0.9 + (i % 3) * 0.3,
    drift: (i % 2 === 0 ? 1 : -1) * (0.2 + (i % 3) * 0.15),
  }))

  const sparkCount = 8
  const sparkData = Array.from({ length: sparkCount }, (_, i) => ({
    seed: i * 2.3,
    radius: 0.35 + (i % 4) * 0.15,
  }))

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime

    // Rotating amber hazard strobe
    if (beaconRef.current) {
      beaconRef.current.rotation.y += delta * 7.5
    }

    // Billowing industrial smoke
    smokeRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const sd = smokeData[i]
      const y = ((t * sd.speed + i * 0.8) % 5.2) + 0.8
      const progress = y / 5.5
      mesh.position.y = y
      mesh.position.x = 0.2 + sd.drift * progress + Math.sin(t * 1.8 + i) * 0.15
      mesh.position.z = -0.3 + Math.cos(t * 1.8 + i) * 0.15
      const s = 0.35 + progress * 1.2
      mesh.scale.set(s, s * 0.9, s)
      mesh.material.opacity = Math.max(0, 0.5 * (1 - progress * progress))
    })

    // Jittering electrical / welding sparks
    sparksRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const sd = sparkData[i]
      const arc = (t * 14 + sd.seed) % 1
      mesh.position.x = 0.2 + Math.sin(t * 22 + sd.seed) * sd.radius
      mesh.position.y = 0.7 + Math.abs(Math.sin(t * 18 + sd.seed)) * 0.6
      mesh.position.z = -0.2 + Math.cos(t * 22 + sd.seed) * sd.radius
      mesh.visible = arc > 0.25 // Intermittent flickering arcing
    })

    // Escaping steam jet
    if (steamRef.current) {
      steamRef.current.scale.set(
        0.8 + Math.sin(t * 12) * 0.2,
        1.0 + Math.cos(t * 14) * 0.3,
        0.8 + Math.sin(t * 12) * 0.2
      )
    }
  })

  return (
    <group position={[node.x, 0, node.z]}>
      {/* 1. Spilled Toxic / Hazardous Fluid Puddle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.2, 0.05, 0.1]}>
        <circleGeometry args={[1.5, 24]} />
        <meshStandardMaterial
          color="#84CC16"
          emissive="#65A30D"
          emissiveIntensity={0.3}
          transparent
          opacity={0.7}
          roughness={0.1}
          depthWrite={false}
        />
      </mesh>

      {/* 2. Industrial Barrels / Drums */}
      {/* Upright Barrel 1 */}
      <group position={[-0.45, 0.35, 0.4]}>
        <mesh>
          <cylinderGeometry args={[0.28, 0.28, 0.7, 16]} />
          <meshStandardMaterial color="#EAB308" roughness={0.4} />
        </mesh>
        {/* Black Hazard Bands */}
        {[-0.15, 0.15].map((by, bIdx) => (
          <mesh key={bIdx} position={[0, by, 0]}>
            <cylinderGeometry args={[0.285, 0.285, 0.08, 16]} />
            <meshBasicMaterial color="#1E293B" />
          </mesh>
        ))}
      </group>

      {/* Upright Barrel 2 */}
      <group position={[-0.8, 0.35, -0.1]}>
        <mesh>
          <cylinderGeometry args={[0.26, 0.26, 0.7, 16]} />
          <meshStandardMaterial color="#EAB308" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.265, 0.265, 0.1, 16]} />
          <meshBasicMaterial color="#1E293B" />
        </mesh>
      </group>

      {/* Tipped Over / Leaking Barrel */}
      <group position={[0.4, 0.25, 0.3]} rotation={[0, 0.8, Math.PI / 2]}>
        <mesh>
          <cylinderGeometry args={[0.26, 0.26, 0.7, 16]} />
          <meshStandardMaterial color="#EAB308" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.265, 0.265, 0.08, 16]} />
          <meshBasicMaterial color="#1E293B" />
        </mesh>
      </group>

      {/* 3. Ruptured Industrial Valve & Pipe Apparatus */}
      <group position={[0.2, 0.45, -0.3]}>
        {/* Horizontal Pipe */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.12, 0.12, 1.3, 12]} />
          <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Vertical Ruptured Valve Outlet */}
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.14, 0.1, 0.5, 12]} />
          <meshStandardMaterial color="#64748B" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* Valve Handwheel */}
        <mesh position={[0, 0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.18, 0.03, 8, 16]} />
          <meshStandardMaterial color="#DC2626" />
        </mesh>
        {/* Escaping Steam Jet */}
        <mesh ref={steamRef} position={[0, 0.75, 0]}>
          <coneGeometry args={[0.22, 0.6, 8]} />
          <meshStandardMaterial color="#F1F5F9" transparent opacity={0.65} depthWrite={false} />
        </mesh>
      </group>

      {/* 4. Billowing Industrial Smoke */}
      <group>
        {smokeData.map((_, i) => (
          <mesh
            key={i}
            ref={el => (smokeRef.current[i] = el)}
            position={[0.2, 1 + i * 0.6, -0.3]}
          >
            <sphereGeometry args={[0.35, 8, 8]} />
            <meshStandardMaterial
              color="#1F2937"
              roughness={0.9}
              transparent
              opacity={0.48}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>

      {/* 5. Jittering Electrical / Welding Sparks */}
      <group>
        {sparkData.map((_, i) => (
          <mesh
            key={i}
            ref={el => (sparksRef.current[i] = el)}
            position={[0.2, 0.8, -0.2]}
          >
            <boxGeometry args={[0.06, 0.06, 0.06]} />
            <meshBasicMaterial color={i % 2 === 0 ? '#FEF08A' : '#F59E0B'} />
          </mesh>
        ))}
      </group>

      {/* 6. Rotating Amber Industrial Strobe Beacon */}
      <group position={[-1.2, 0.45, -0.8]}>
        {/* Stand */}
        <mesh position={[0, -0.15, 0]}>
          <cylinderGeometry args={[0.04, 0.08, 0.6, 8]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
        {/* Rotating Strobe Housing */}
        <group ref={beaconRef} position={[0, 0.22, 0]}>
          <mesh>
            <cylinderGeometry args={[0.12, 0.12, 0.18, 12]} />
            <meshStandardMaterial color="#F59E0B" emissive="#F59E0B" emissiveIntensity={0.8} />
          </mesh>
          <mesh position={[0.12, 0, 0]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshBasicMaterial color="#FEF08A" />
          </mesh>
        </group>
        <pointLight position={[0, 0.35, 0]} color="#F59E0B" intensity={1.8} distance={8} decay={2} />
      </group>

      {/* Hazard Bollards */}
      {[[-1.2, 0.25, 0.8], [1.1, 0.25, -0.9]].map((pos, idx) => (
        <group key={idx} position={pos}>
          <mesh>
            <cylinderGeometry args={[0.08, 0.08, 0.5, 12]} />
            <meshStandardMaterial color="#EAB308" />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.085, 0.085, 0.1, 12]} />
            <meshBasicMaterial color="#0F172A" />
          </mesh>
        </group>
      ))}
    </group>
  )
}
