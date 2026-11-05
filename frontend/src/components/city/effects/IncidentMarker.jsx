import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import MedicalEffect from './MedicalEffect'
import FireEffect from './FireEffect'
import AccidentEffect from './AccidentEffect'
import FloodEffect from './FloodEffect'
import IndustrialEffect from './IndustrialEffect'
import EvacuationEffect from './EvacuationEffect'

const TYPE_CONFIG = {
  MEDICAL: {
    color: '#0284C7',
    labelColor: '#0284C7',
    icon: '✚',
    labelHeight: 4.2,
  },
  FIRE: {
    color: '#FF4500',
    labelColor: '#DC2626',
    icon: '🔥',
    labelHeight: 4.8,
  },
  ACCIDENT: {
    color: '#EA580C',
    labelColor: '#C2410C',
    icon: '⚠',
    labelHeight: 4.0,
  },
  FLOOD: {
    color: '#2563EB',
    labelColor: '#1D4ED8',
    icon: '🌊',
    labelHeight: 4.2,
  },
  INDUSTRIAL: {
    color: '#EAB308',
    labelColor: '#CA8A04',
    icon: '⚡',
    labelHeight: 4.6,
  },
  EVACUATION: {
    color: '#10B981',
    labelColor: '#059669',
    icon: '🏃',
    labelHeight: 4.2,
  },
}

export default function IncidentMarker({ incident, node, world, onSelect, isSelected, LabelComponent }) {
  const beaconRef = useRef()
  const ringRef = useRef()

  const config = TYPE_CONFIG[incident.type] || TYPE_CONFIG.FIRE

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (beaconRef.current) {
      beaconRef.current.rotation.y = t * 1.5
      beaconRef.current.position.y = (config.labelHeight - 1.2) + Math.sin(t * 3) * 0.12
    }
    if (ringRef.current) {
      const s = 1 + Math.sin(t * 2.5) * 0.08
      ringRef.current.scale.set(s, s, 1)
    }
  })

  if (!node) return null

  return (
    <group
      name={`incident-${incident.id}`}
      onClick={event => {
        event.stopPropagation()
        onSelect(incident.id)
      }}
    >
      {/* Selection Highlight Ring */}
      {isSelected && (
        <mesh
          position={[node.x, 0.22, node.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[2.8, 3.15, 48]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}

      {/* Outer Incident Ring Indicator */}
      <mesh
        ref={ringRef}
        position={[node.x, 0.2, node.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[2.2, 2.5, 48]} />
        <meshBasicMaterial color={config.color} transparent opacity={0.75} depthWrite={false} />
      </mesh>

      {/* Floating Rotating Beacon Diamond */}
      <mesh
        ref={beaconRef}
        position={[node.x, config.labelHeight - 1.2, node.z]}
        castShadow
      >
        <octahedronGeometry args={[0.55]} />
        <meshStandardMaterial
          color={config.color}
          emissive={config.color}
          emissiveIntensity={0.65}
          roughness={0.25}
        />
      </mesh>

      {/* Type-Specific Visual Emergency Effects */}
      {incident.type === 'MEDICAL' && <MedicalEffect node={node} />}
      {incident.type === 'FIRE' && <FireEffect node={node} />}
      {incident.type === 'ACCIDENT' && <AccidentEffect node={node} />}
      {incident.type === 'FLOOD' && <FloodEffect node={node} roads={world.roads} nodes={world.nodes} />}
      {incident.type === 'INDUSTRIAL' && <IndustrialEffect node={node} />}
      {incident.type === 'EVACUATION' && <EvacuationEffect node={node} roads={world.roads} nodes={world.nodes} />}

      {/* Floating Informational Billboard Label */}
      {LabelComponent && (
        <LabelComponent
          position={[node.x, config.labelHeight, node.z]}
          text={`${config.icon} ${incident.type} · P${incident.priority}`}
          color="#1F1916"
          border={config.color}
        />
      )}
    </group>
  )
}
