import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

/**
 * Visual emergency representation for ACCIDENT incidents:
 * - Collided and crumpled civilian vehicles on the roadway.
 * - Scattered glass debris and radiator smoke wisp.
 * - Injured civilian indicator with non-graphic triage markings.
 * - Safety traffic cones and blinking amber warning beacons around the scene.
 */
export default function AccidentEffect({ node }) {
  const strobeRef = useRef([])
  const smokeRef = useRef()

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // Blinking amber warning beacons (alternating flash)
    strobeRef.current.forEach((light, i) => {
      if (!light) return
      const flash = (Math.sin(t * 8 + i * Math.PI) > 0) ? 2.2 : 0.1
      light.intensity = flash
    })
    // Radiator smoke wisp
    if (smokeRef.current) {
      smokeRef.current.position.y = 0.6 + ((t * 0.7) % 1.5)
      smokeRef.current.scale.setScalar(0.2 + ((t * 0.7) % 1.5) * 0.4)
      smokeRef.current.material.opacity = Math.max(0, 0.5 - ((t * 0.7) % 1.5) * 0.3)
    }
  })

  // Traffic cone positions around accident perimeter
  const conePositions = [
    [-1.6, 0.1, -1.2],
    [1.7, 0.1, -1.1],
    [-1.7, 0.1, 1.3],
    [1.6, 0.1, 1.4],
    [0, 0.1, 1.7],
  ]

  return (
    <group position={[node.x, 0, node.z]}>
      {/* 1. Collided Civilian Vehicles */}
      {/* Vehicle 1: Dark Slate Blue Sedan, crumpled into node */}
      <group position={[-0.35, 0.25, -0.2]} rotation={[0.08, 0.4, 0.05]}>
        {/* Main Body */}
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[1.05, 0.42, 1.85]} />
          <meshStandardMaterial color="#334155" roughness={0.6} />
        </mesh>
        {/* Cabin / Roof */}
        <mesh position={[0, 0.44, -0.15]}>
          <boxGeometry args={[0.9, 0.36, 1.0]} />
          <meshStandardMaterial color="#475569" roughness={0.5} />
        </mesh>
        {/* Windshield */}
        <mesh position={[0, 0.42, 0.36]} rotation={[-0.4, 0, 0]}>
          <planeGeometry args={[0.78, 0.35]} />
          <meshStandardMaterial color="#94A3B8" roughness={0.2} transparent opacity={0.7} />
        </mesh>
        {/* Crumpled Hood (bent upward) */}
        <mesh position={[0, 0.3, 0.72]} rotation={[-0.28, 0, 0.1]}>
          <boxGeometry args={[0.98, 0.14, 0.65]} />
          <meshStandardMaterial color="#1E293B" roughness={0.7} />
        </mesh>
        {/* Wheels */}
        {[-0.56, 0.56].map(x =>
          [-0.55, 0.55].map(z => (
            <mesh key={`${x}-${z}`} position={[x, -0.05, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.2, 0.2, 0.15, 12]} />
              <meshStandardMaterial color="#0F172A" />
            </mesh>
          ))
        )}
      </group>

      {/* Vehicle 2: Burgundy Compact, impacted perpendicular */}
      <group position={[0.55, 0.22, 0.45]} rotation={[-0.06, -1.8, 0.14]}>
        {/* Main Body */}
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[0.95, 0.4, 1.55]} />
          <meshStandardMaterial color="#881337" roughness={0.5} />
        </mesh>
        {/* Cabin */}
        <mesh position={[0, 0.42, -0.1]}>
          <boxGeometry args={[0.82, 0.34, 0.85]} />
          <meshStandardMaterial color="#9F1239" roughness={0.5} />
        </mesh>
        {/* Crumpled front bumper */}
        <mesh position={[0, 0.18, 0.65]} rotation={[0.2, 0.15, 0]}>
          <boxGeometry args={[0.9, 0.22, 0.4]} />
          <meshStandardMaterial color="#4C0519" roughness={0.7} />
        </mesh>
        {/* Wheels */}
        {[-0.5, 0.5].map(x =>
          [-0.45, 0.45].map(z => (
            <mesh key={`${x}-${z}`} position={[x, -0.04, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.18, 0.18, 0.14, 12]} />
              <meshStandardMaterial color="#0F172A" />
            </mesh>
          ))
        )}
      </group>

      {/* Radiator Smoke Wisp */}
      <mesh ref={smokeRef} position={[0.1, 0.6, 0.1]}>
        <sphereGeometry args={[0.3, 8, 8]} />
        <meshStandardMaterial color="#CBD5E1" transparent opacity={0.4} depthWrite={false} />
      </mesh>

      {/* Scattered Glass & Debris on Road */}
      {[-0.2, 0.15, -0.1, 0.3, 0].map((dx, i) => (
        <mesh key={i} position={[dx, 0.08, 0.15 + (i - 2) * 0.18]}>
          <boxGeometry args={[0.08, 0.02, 0.08]} />
          <meshBasicMaterial color="#E2E8F0" />
        </mesh>
      ))}

      {/* 2. Injured Civilian Figure & Non-Graphic Triage Marking */}
      <group position={[-1.1, 0.08, 0.7]} rotation={[0, 0.6, 0]}>
        {/* Small non-graphic dark red triage spot on asphalt */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <circleGeometry args={[0.38, 16]} />
          <meshBasicMaterial color="#7F1D1D" transparent opacity={0.65} depthWrite={false} />
        </mesh>
        {/* Person lying/sitting on ground */}
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[0.4, 0.15, 0.9]} />
          <meshStandardMaterial color="#0284C7" />
        </mesh>
        {/* Head */}
        <mesh position={[0, 0.22, -0.35]}>
          <sphereGeometry args={[0.12, 10, 10]} />
          <meshStandardMaterial color="#FBBF24" />
        </mesh>
      </group>

      {/* 3. Safety Traffic Cones Perimeter */}
      {conePositions.map((p, idx) => (
        <group key={idx} position={p}>
          {/* Base */}
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.26, 0.04, 0.26]} />
            <meshStandardMaterial color="#EA580C" />
          </mesh>
          {/* Cone */}
          <mesh position={[0, 0.24, 0]}>
            <coneGeometry args={[0.12, 0.44, 12]} />
            <meshStandardMaterial color="#F97316" roughness={0.4} />
          </mesh>
          {/* White reflective collar */}
          <mesh position={[0, 0.22, 0]}>
            <cylinderGeometry args={[0.075, 0.09, 0.12, 12]} />
            <meshBasicMaterial color="#FFFFFF" />
          </mesh>
        </group>
      ))}

      {/* 4. Amber Hazard Warning Flashing Strobes */}
      {[[-1.5, 0.6, -1.0], [1.5, 0.6, 1.2]].map((pos, idx) => (
        <group key={idx} position={pos}>
          {/* Stand */}
          <mesh position={[0, -0.25, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.5, 8]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
          {/* Amber Beacon */}
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.14, 12]} />
            <meshStandardMaterial color="#F59E0B" emissive="#F59E0B" emissiveIntensity={0.8} />
          </mesh>
          <pointLight
            ref={el => (strobeRef.current[idx] = el)}
            position={[0, 0.15, 0]}
            color="#F59E0B"
            intensity={1.8}
            distance={7}
            decay={2}
          />
        </group>
      ))}
    </group>
  )
}
