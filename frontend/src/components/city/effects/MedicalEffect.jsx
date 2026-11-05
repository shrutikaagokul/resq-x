import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

/**
 * Visual emergency representation for MEDICAL incidents:
 * - Floating, rotating 3D medical cross in vivid medical blue with soft emissive glow.
 * - Stretcher / medical cot with injured person figure on the pavement.
 * - Pulsing concentric medical-blue ground beacon rings.
 * - Vital-signs / medical cross emblem beacon.
 */
export default function MedicalEffect({ node }) {
  const crossRef = useRef()
  const ring1Ref = useRef()
  const ring2Ref = useRef()
  const pulseRef = useRef()

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (crossRef.current) {
      crossRef.current.rotation.y = t * 1.4
      crossRef.current.position.y = 2.6 + Math.sin(t * 2.5) * 0.15
    }
    if (ring1Ref.current) {
      const s = 1 + (t % 2) * 0.7
      ring1Ref.current.scale.set(s, s, 1)
      ring1Ref.current.material.opacity = Math.max(0, 0.75 - (t % 2) * 0.35)
    }
    if (ring2Ref.current) {
      const s = 1 + ((t + 1) % 2) * 0.7
      ring2Ref.current.scale.set(s, s, 1)
      ring2Ref.current.material.opacity = Math.max(0, 0.75 - ((t + 1) % 2) * 0.35)
    }
    if (pulseRef.current) {
      pulseRef.current.scale.setScalar(1 + Math.sin(t * 3) * 0.08)
    }
  })

  const medBlue = '#0284C7'
  const lightBlue = '#38BDF8'
  const white = '#F8FAFC'

  return (
    <group position={[node.x, 0, node.z]}>
      {/* 1. Ground Pulsing Beacon Rings (Medical Theme) */}
      <group position={[0, 0.05, 0]}>
        <mesh ref={ring1Ref} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.6, 1.95, 36]} />
          <meshBasicMaterial color={lightBlue} transparent opacity={0.65} depthWrite={false} />
        </mesh>
        <mesh ref={ring2Ref} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.6, 1.95, 36]} />
          <meshBasicMaterial color={medBlue} transparent opacity={0.65} depthWrite={false} />
        </mesh>
        {/* Ground medical cross pad */}
        <mesh ref={pulseRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <circleGeometry args={[1.5, 32]} />
          <meshBasicMaterial color="#E0F2FE" transparent opacity={0.6} depthWrite={false} />
        </mesh>
        {/* Blue Cross on ground pad */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <planeGeometry args={[0.42, 1.3]} />
          <meshBasicMaterial color={medBlue} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <planeGeometry args={[1.3, 0.42]} />
          <meshBasicMaterial color={medBlue} depthWrite={false} />
        </mesh>
      </group>

      {/* 2. Injured Person on Stretcher / Gurney */}
      <group position={[0.7, 0.08, 0.6]} rotation={[0, -0.4, 0]}>
        {/* Stretcher Cot Frame */}
        <mesh position={[0, 0.16, 0]}>
          <boxGeometry args={[0.7, 0.08, 1.5]} />
          <meshStandardMaterial color="#94A3B8" roughness={0.5} />
        </mesh>
        {/* Legs / Wheels */}
        {[-0.28, 0.28].map(x =>
          [-0.6, 0.6].map(z => (
            <mesh key={`${x}-${z}`} position={[x, 0.08, z]}>
              <cylinderGeometry args={[0.03, 0.03, 0.16, 8]} />
              <meshStandardMaterial color="#334155" />
            </mesh>
          ))
        )}
        {/* Mattress with white & blue medical sheet */}
        <mesh position={[0, 0.24, 0]}>
          <boxGeometry args={[0.62, 0.1, 1.4]} />
          <meshStandardMaterial color={white} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.26, 0.1]}>
          <boxGeometry args={[0.58, 0.08, 0.95]} />
          <meshStandardMaterial color={lightBlue} roughness={0.8} />
        </mesh>
        {/* Injured Person: Head with bandage */}
        <mesh position={[0, 0.36, -0.45]}>
          <sphereGeometry args={[0.13, 12, 12]} />
          <meshStandardMaterial color="#FBBF24" roughness={0.7} />
        </mesh>
        {/* Head bandage marker */}
        <mesh position={[0, 0.43, -0.45]}>
          <boxGeometry args={[0.18, 0.05, 0.18]} />
          <meshStandardMaterial color={white} />
        </mesh>
        {/* IV Drip Stand */}
        <mesh position={[-0.4, 0.65, -0.4]}>
          <cylinderGeometry args={[0.02, 0.02, 1.2, 8]} />
          <meshStandardMaterial color="#64748B" />
        </mesh>
        <mesh position={[-0.4, 1.15, -0.4]}>
          <boxGeometry args={[0.14, 0.22, 0.1]} />
          <meshStandardMaterial color={lightBlue} transparent opacity={0.85} />
        </mesh>
      </group>

      {/* 3. Floating 3D Medical Cross with Emissive Glow */}
      <group ref={crossRef} position={[0, 2.6, 0]}>
        {/* Vertical arm */}
        <mesh castShadow>
          <boxGeometry args={[0.34, 1.25, 0.34]} />
          <meshStandardMaterial color={medBlue} emissive={medBlue} emissiveIntensity={0.65} roughness={0.3} />
        </mesh>
        {/* Horizontal arm */}
        <mesh castShadow>
          <boxGeometry args={[1.25, 0.34, 0.34]} />
          <meshStandardMaterial color={medBlue} emissive={medBlue} emissiveIntensity={0.65} roughness={0.3} />
        </mesh>
        {/* Subtle white center inset */}
        <mesh position={[0, 0, 0.18]}>
          <planeGeometry args={[0.26, 0.26]} />
          <meshBasicMaterial color={white} />
        </mesh>
        <mesh position={[0, 0, -0.18]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.26, 0.26]} />
          <meshBasicMaterial color={white} />
        </mesh>
      </group>

      {/* Point light to cast soft medical cyan glow on surrounding area */}
      <pointLight position={[0, 1.8, 0]} color={lightBlue} intensity={1.2} distance={8} decay={2} />
    </group>
  )
}
