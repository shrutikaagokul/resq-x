import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

/**
 * Visual emergency representation for EVACUATION incidents:
 * - Clustered groups of civilians awaiting evacuation.
 * - Animated evacuees walking along the route towards safe zones.
 * - High-visibility luminous green directional arrows on the road surface.
 * - Emergency assembly point beacon and pulsing green perimeter.
 */
export default function EvacuationEffect({ node, roads = {}, nodes = {} }) {
  const evacueesRef = useRef([])
  const arrowsRef = useRef([])
  const ringRef = useRef()

  // Find an exit direction vector based on connected roads (or default +X direction)
  const connectedRoads = Object.values(roads).filter(r => r.a === node.id || r.b === node.id)
  let dirX = 1, dirZ = 0
  if (connectedRoads.length > 0) {
    const road = connectedRoads[0]
    const otherId = road.a === node.id ? road.b : road.a
    const other = nodes[otherId]
    if (other) {
      const len = Math.hypot(other.x - node.x, other.z - node.z) || 1
      dirX = (other.x - node.x) / len
      dirZ = (other.z - node.z) / len
    }
  }

  // Normal vector for lane offset
  const normX = -dirZ
  const normZ = dirX

  const evacueeData = [
    { offset: 0.0, speed: 0.35, lane: 0.5, color: '#0D9488' },
    { offset: 0.3, speed: 0.40, lane: -0.4, color: '#D97706' },
    { offset: 0.6, speed: 0.32, lane: 0.7, color: '#4F46E5' },
    { offset: 0.85, speed: 0.38, lane: -0.6, color: '#BE123C' },
  ]

  // Directional chevron arrows along evacuation route
  const arrowDistances = [1.5, 3.2, 4.9, 6.6]

  useFrame(({ clock }) => {
    const t = clock.elapsedTime

    // Pulsing assembly ring
    if (ringRef.current) {
      ringRef.current.scale.setScalar(1 + Math.sin(t * 2.5) * 0.08)
    }

    // Animate moving civilians along the evacuation path towards safety
    evacueesRef.current.forEach((group, i) => {
      if (!group) return
      const ed = evacueeData[i]
      const progress = (t * ed.speed + ed.offset) % 1.0
      const dist = progress * 7.5
      group.position.x = dirX * dist + normX * ed.lane
      group.position.z = dirZ * dist + normZ * ed.lane
      // Bobbing walk cycle
      group.position.y = 0.06 + Math.abs(Math.sin(t * 9 + i * 2)) * 0.06
      group.rotation.y = Math.atan2(dirX, dirZ)
    })

    // Pulsing directional arrow wave
    arrowsRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const wave = Math.sin(t * 4.5 - i * 0.9)
      mesh.material.opacity = 0.45 + Math.max(0, wave) * 0.5
    })
  })

  // Standing group positions around assembly point
  const waitingCivilians = [
    { pos: [-0.6, 0, -0.5], color: '#3B82F6' },
    { pos: [-0.9, 0, -0.3], color: '#10B981' },
    { pos: [-0.65, 0, -0.85], color: '#F59E0B' },
    { pos: [-1.1, 0, -0.7], color: '#8B5CF6' },
    { pos: [0.3, 0, -0.7], color: '#EC4899' },
  ]

  const green = '#10B981'

  return (
    <group position={[node.x, 0, node.z]}>
      {/* 1. Emergency Assembly Point Beacon & Pulsing Green Ring */}
      <group position={[0, 0.05, 0]}>
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.5, 1.85, 32]} />
          <meshBasicMaterial color={green} transparent opacity={0.7} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <circleGeometry args={[1.45, 32]} />
          <meshBasicMaterial color="#D1FAE5" transparent opacity={0.45} depthWrite={false} />
        </mesh>
      </group>

      {/* Assembly Signpost */}
      <group position={[-1.2, 0, 0.6]}>
        <mesh position={[0, 0.9, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 1.8, 8]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        <mesh position={[0, 1.8, 0]}>
          <boxGeometry args={[0.6, 0.4, 0.04]} />
          <meshStandardMaterial color={green} emissive={green} emissiveIntensity={0.3} />
        </mesh>
        {/* White running/arrow motif on sign */}
        <mesh position={[0, 1.8, 0.025]}>
          <planeGeometry args={[0.42, 0.25]} />
          <meshBasicMaterial color="#FFFFFF" />
        </mesh>
      </group>

      {/* 2. Clustered Civilians Awaiting Evacuation */}
      {waitingCivilians.map((c, i) => (
        <group key={i} position={c.pos} rotation={[0, (i * 1.3) % (Math.PI * 2), 0]}>
          {/* Torso */}
          <mesh position={[0, 0.32, 0]}>
            <boxGeometry args={[0.22, 0.38, 0.16]} />
            <meshStandardMaterial color={c.color} roughness={0.7} />
          </mesh>
          {/* Head */}
          <mesh position={[0, 0.58, 0]}>
            <sphereGeometry args={[0.1, 10, 10]} />
            <meshStandardMaterial color="#FCD34D" roughness={0.6} />
          </mesh>
          {/* Legs */}
          {[-0.05, 0.05].map(lx => (
            <mesh key={lx} position={[lx, 0.1, 0]}>
              <boxGeometry args={[0.07, 0.22, 0.1]} />
              <meshStandardMaterial color="#1E293B" />
            </mesh>
          ))}
        </group>
      ))}

      {/* 3. Evacuees Walking Along Evacuation Route Towards Safety */}
      {evacueeData.map((ed, i) => (
        <group
          key={i}
          ref={el => (evacueesRef.current[i] = el)}
          position={[0, 0.06, 0]}
        >
          {/* Torso */}
          <mesh position={[0, 0.32, 0]}>
            <boxGeometry args={[0.22, 0.38, 0.16]} />
            <meshStandardMaterial color={ed.color} roughness={0.7} />
          </mesh>
          {/* Head */}
          <mesh position={[0, 0.58, 0]}>
            <sphereGeometry args={[0.1, 10, 10]} />
            <meshStandardMaterial color="#FCD34D" roughness={0.6} />
          </mesh>
          {/* Legs */}
          {[-0.05, 0.05].map(lx => (
            <mesh key={lx} position={[lx, 0.1, 0]}>
              <boxGeometry args={[0.07, 0.22, 0.1]} />
              <meshStandardMaterial color="#1E293B" />
            </mesh>
          ))}
        </group>
      ))}

      {/* 4. Directional Chevron Arrows on Road Surface Guiding Evacuation */}
      {arrowDistances.map((dist, idx) => {
        const posX = dirX * dist
        const posZ = dirZ * dist
        const angle = Math.atan2(dirX, dirZ)

        return (
          <group key={idx} position={[posX, 0.08, posZ]} rotation={[-Math.PI / 2, 0, angle]}>
            {/* Luminous Chevron Arrow pointing forward */}
            <mesh ref={el => (arrowsRef.current[idx] = el)}>
              <planeGeometry args={[1.1, 0.7]} />
              <meshBasicMaterial color={green} transparent opacity={0.8} depthWrite={false} />
            </mesh>
            {/* Chevron border accent */}
            <mesh position={[0, 0, 0.01]}>
              <ringGeometry args={[0.35, 0.48, 3, 1, 0, Math.PI]} />
              <meshBasicMaterial color="#FFFFFF" transparent opacity={0.6} depthWrite={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
