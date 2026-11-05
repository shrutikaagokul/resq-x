import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

/**
 * Visual emergency representation for FLOOD incidents:
 * - Rising undulating water overlay covering the intersection.
 * - Submerged water slicks extending across connected access roads.
 * - Vertical water-level measuring gauge with bobbing water level float.
 * - Floating warning buoys and "ROAD CLOSED - FLOODED" barricades.
 */
export default function FloodEffect({ node, roads = {}, nodes = {} }) {
  const waterRef = useRef()
  const ripple1Ref = useRef()
  const ripple2Ref = useRef()
  const buoysRef = useRef([])
  const floatRef = useRef()

  // Find roads connected to this flooded node to display flooded road overlays and barricades
  const connectedRoads = Object.values(roads).filter(r => r.a === node.id || r.b === node.id)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // Undulating water surface
    const waterY = 0.16 + Math.sin(t * 2.2) * 0.04
    if (waterRef.current) {
      waterRef.current.position.y = waterY
    }
    // Expanding water ripples
    if (ripple1Ref.current) {
      const s = 1 + (t % 2.5) * 0.9
      ripple1Ref.current.scale.set(s, s, 1)
      ripple1Ref.current.material.opacity = Math.max(0, 0.65 - (t % 2.5) * 0.26)
    }
    if (ripple2Ref.current) {
      const s = 1 + ((t + 1.25) % 2.5) * 0.9
      ripple2Ref.current.scale.set(s, s, 1)
      ripple2Ref.current.material.opacity = Math.max(0, 0.65 - ((t + 1.25) % 2.5) * 0.26)
    }
    // Bobbing water level float
    if (floatRef.current) {
      floatRef.current.position.y = waterY + 0.06
    }
    // Bobbing buoys
    buoysRef.current.forEach((b, i) => {
      if (b) b.position.y = waterY + 0.08 + Math.sin(t * 2.5 + i * 1.6) * 0.03
    })
  })

  const waterColor = '#2563EB'
  const shallowWaterColor = '#60A5FA'

  return (
    <group position={[node.x, 0, node.z]}>
      {/* 1. Central Rising Water Pool */}
      <group ref={waterRef} position={[0, 0.16, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[3.4, 36]} />
          <meshStandardMaterial
            color={waterColor}
            transparent
            opacity={0.72}
            roughness={0.15}
            metalness={0.2}
            depthWrite={false}
          />
        </mesh>
        {/* Shimmering highlight disc */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <circleGeometry args={[2.5, 32]} />
          <meshStandardMaterial
            color={shallowWaterColor}
            transparent
            opacity={0.4}
            roughness={0.1}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Expanding Ripple Rings */}
      <mesh ref={ripple1Ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
        <ringGeometry args={[1.8, 2.05, 36]} />
        <meshBasicMaterial color="#93C5FD" transparent opacity={0.6} depthWrite={false} />
      </mesh>
      <mesh ref={ripple2Ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
        <ringGeometry args={[1.8, 2.05, 36]} />
        <meshBasicMaterial color="#BAE6FD" transparent opacity={0.6} depthWrite={false} />
      </mesh>

      {/* 2. Flooded Road Overlays along Connected Road Approaches */}
      {connectedRoads.map(road => {
        const otherNodeId = road.a === node.id ? road.b : road.a
        const other = nodes[otherNodeId]
        if (!other) return null
        const dx = other.x - node.x
        const dz = other.z - node.z
        const angle = Math.atan2(dx, dz)
        const dist = Math.min(6.5, Math.hypot(dx, dz) * 0.45)
        const midX = (dx / (Math.hypot(dx, dz) || 1)) * (dist * 0.5)
        const midZ = (dz / (Math.hypot(dx, dz) || 1)) * (dist * 0.5)

        return (
          <group key={road.id}>
            {/* Submerged road water overlay */}
            <mesh
              position={[midX, 0.14, midZ]}
              rotation={[-Math.PI / 2, 0, angle]}
            >
              <planeGeometry args={[2.9, dist]} />
              <meshStandardMaterial
                color={waterColor}
                transparent
                opacity={0.68}
                roughness={0.18}
                depthWrite={false}
              />
            </mesh>

            {/* Flooded / Inaccessible Road Barricade */}
            <group
              position={[
                (dx / (Math.hypot(dx, dz) || 1)) * (dist + 0.8),
                0.2,
                (dz / (Math.hypot(dx, dz) || 1)) * (dist + 0.8),
              ]}
              rotation={[0, angle + Math.PI / 2, 0]}
            >
              {/* Barrier Board */}
              <mesh position={[0, 0.45, 0]}>
                <boxGeometry args={[2.4, 0.35, 0.1]} />
                <meshStandardMaterial color="#FFFFFF" />
              </mesh>
              {/* Red Stripes on Barrier */}
              {[-0.8, -0.3, 0.2, 0.7].map((sx, sIdx) => (
                <mesh key={sIdx} position={[sx, 0.45, 0.055]} rotation={[0, 0, 0.4]}>
                  <boxGeometry args={[0.18, 0.42, 0.02]} />
                  <meshBasicMaterial color="#DC2626" />
                </mesh>
              ))}
              {/* Legs */}
              {[-0.9, 0.9].map((lx, lIdx) => (
                <mesh key={lIdx} position={[lx, 0.25, 0]}>
                  <boxGeometry args={[0.08, 0.55, 0.4]} />
                  <meshStandardMaterial color="#EA580C" />
                </mesh>
              ))}
              {/* Amber flashing hazard light on top of barricade */}
              <mesh position={[0, 0.72, 0]}>
                <cylinderGeometry args={[0.08, 0.08, 0.12, 10]} />
                <meshStandardMaterial color="#F59E0B" emissive="#F59E0B" emissiveIntensity={0.8} />
              </mesh>
            </group>
          </group>
        )
      })}

      {/* 3. Water-Level Measuring Gauge */}
      <group position={[-1.2, 0, -1.2]}>
        {/* Measuring Staff with Alternating Red/White Bands */}
        <mesh position={[0, 1.1, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 2.2, 12]} />
          <meshStandardMaterial color="#FFFFFF" />
        </mesh>
        {[0.3, 0.7, 1.1, 1.5, 1.9].map((gy, gIdx) => (
          <mesh key={gIdx} position={[0, gy, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 0.18, 12]} />
            <meshStandardMaterial color="#DC2626" />
          </mesh>
        ))}
        {/* Bobbing Water Level Indicator Float Ring */}
        <mesh ref={floatRef} position={[0, 0.22, 0]}>
          <torusGeometry args={[0.16, 0.05, 12, 24]} />
          <meshStandardMaterial color="#FACC15" roughness={0.3} />
        </mesh>
        {/* Top Warning Crest */}
        <mesh position={[0, 2.25, 0]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial color="#F59E0B" emissive="#F59E0B" emissiveIntensity={0.6} />
        </mesh>
      </group>

      {/* 4. Floating Warning Buoys */}
      {[[-0.9, 0, 1.1], [1.3, 0, -0.8], [0.8, 0, 1.3]].map((bp, bIdx) => (
        <group
          key={bIdx}
          ref={el => (buoysRef.current[bIdx] = el)}
          position={bp}
        >
          {/* Buoy Body */}
          <mesh position={[0, 0.12, 0]}>
            <sphereGeometry args={[0.22, 12, 12]} />
            <meshStandardMaterial color="#EA580C" roughness={0.4} />
          </mesh>
          {/* White Center Band */}
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.23, 0.23, 0.1, 12]} />
            <meshBasicMaterial color="#FFFFFF" />
          </mesh>
          {/* Mini Warning Flag */}
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.35, 8]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
          <mesh position={[0.08, 0.44, 0]}>
            <boxGeometry args={[0.16, 0.12, 0.02]} />
            <meshBasicMaterial color="#EF4444" />
          </mesh>
        </group>
      ))}
    </group>
  )
}
