import { Suspense, useRef, useMemo, useEffect, Component } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls, OrthographicCamera } from '@react-three/drei'
import { CanvasTexture, SRGBColorSpace, Vector3 } from 'three'
import { useSimulation } from '../state/simulationStore'

const resourceColors = { AMBULANCE: '#68b7ff', FIRE_TRUCK: '#f07861', RESCUE_TEAM: '#e6c36a' }
const buildingColors = { hospital: '#628d9e', factory: '#967967', school: '#9b9272', shelter: '#689388', station: '#758299', residential: '#4c5d68' }

class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div className="scene-error">3D rendering could not start. Enable WebGL / hardware acceleration and reload.</div> : this.props.children }
}

function Box({ position, size, color, ...props }) {
  return <mesh position={position} castShadow receiveShadow {...props}><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.85} /></mesh>
}

function Label({ text, position, color = '#dbe7e9', border = '#536b78', compact = false }) {
  // Keep labels inside the Three scene instead of mounting nested React DOM roots.
  const { texture, width, height } = useMemo(() => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    context.font = '22px sans-serif'
    canvas.width = Math.ceil(context.measureText(text).width) + 24
    canvas.height = 40
    context.fillStyle = '#15242e'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = border
    context.lineWidth = 2
    context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2)
    context.font = '22px sans-serif'
    context.fillStyle = color
    context.textBaseline = 'middle'
    context.fillText(text, 12, 21)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return { texture, width: canvas.width, height: canvas.height }
  }, [text, color, border])
  useEffect(() => () => texture.dispose(), [texture])
  const unit = compact ? 65 : 48
  return <sprite position={position} scale={[width / unit, height / unit, 1]}>
    <spriteMaterial map={texture} transparent depthTest={false} toneMapped={false} />
  </sprite>
}

function Building({ building }) {
  const { x, z, height: h, kind, name } = building
  const special = kind !== 'residential'
  return <group position={[x, 0, z]}>
    <Box position={[0, h / 2, 0]} size={[special ? 5 : 4, h, 4]} color={buildingColors[kind]} />
    <Box position={[0, h + 0.15, 0]} size={[special ? 5.3 : 4.3, 0.3, 4.3]} color="#b2bdbe" />
    {Array.from({ length: Math.max(1, Math.floor(h / 1.6)) }, (_, floor) => <group key={floor}>
      {[-1.2, 0, 1.2].map(i => <Box key={i} position={[i, 0.9 + floor * 1.4, 2.02]} size={[0.55, 0.6, 0.04]} color="#b5ced1" />)}
    </group>)}
    {kind === 'hospital' && <group position={[0, h + 0.4, 0]}><Box position={[0, 0, 0]} size={[2, 0.15, 0.6]} color="#edf6f7" /><Box position={[0, 0.01, 0]} size={[0.6, 0.15, 2]} color="#edf6f7" /></group>}
    {kind === 'factory' && <><Box position={[-1.5, h + 1.5, -1]} size={[0.7, 3, 0.7]} color="#b6a496" /><Box position={[1.5, h + 1, -1]} size={[0.7, 2, 0.7]} color="#b6a496" /></>}
    {special && <Label position={[0, h + 1.4, 0]} text={name} color={kind === 'hospital' ? '#b3ddf1' : '#dbe7e9'} />}
  </group>
}

function Road({ road, nodes, selected, onSelect }) {
  const a = nodes[road.a], b = nodes[road.b]
  const horizontal = a.z === b.z
  const middle = [(a.x + b.x) / 2, 0.04, (a.z + b.z) / 2]
  return <group>
    <Box position={middle} size={horizontal ? [12, 0.12, 2.6] : [2.6, 0.12, 12]}
      color={road.blocked ? '#713d39' : selected ? '#536f7a' : '#29373f'}
      onClick={event => { event.stopPropagation(); onSelect(road.id) }} />
    <Line points={[[a.x, 0.12, a.z], [b.x, 0.12, b.z]]} color={road.known ? '#7b898d' : '#d7bc78'} lineWidth={0.7} dashed dashSize={0.8} gapSize={0.9} />
    {road.blocked && <group position={[middle[0], 0.65, middle[2]]} rotation={[0, horizontal ? Math.PI / 2 : 0, 0]}>
      <Box position={[0, 0, 0]} size={[3, 0.5, 0.3]} color="#e69665" />
      <Box position={[-1, -0.4, 0]} size={[0.15, 1, 0.15]} color="#d7c8b0" />
      <Box position={[1, -0.4, 0]} size={[0.15, 1, 0.15]} color="#d7c8b0" />
    </group>}
  </group>
}

function Vehicle({ resource, assignment, world }) {
  const ref = useRef()
  const receivedAt = useRef({ key: '', at: 0 })
  const point = new Vector3()
  useFrame(({ clock }, delta) => {
    const node = world.nodes[resource.location]
    point.set(node.x, 0.55, node.z)
    if (assignment?.route.path.length > 1) {
      const [a, b] = assignment.route.path.map(id => world.nodes[id])
      const road = Object.values(world.roads).find(r => (r.a === a.id && r.b === b.id) || (r.a === b.id && r.b === a.id))
      const key = `${assignment.id}:${world.version}`
      if (receivedAt.current.key !== key) receivedAt.current = { key, at: clock.elapsedTime }
      const elapsed = world.running ? Math.min(0.6, clock.elapsedTime - receivedAt.current.at) : 0
      const progress = Math.min(1, (assignment.edge_progress + elapsed) / road.travel_time)
      point.set(a.x + (b.x - a.x) * progress, 0.55, a.z + (b.z - a.z) * progress)
      ref.current.rotation.y = Math.atan2(b.x - a.x, b.z - a.z)
    }
    ref.current.position.lerp(point, Math.min(1, delta * 12))
  })
  const node = world.nodes[resource.location]
  const color = resource.available ? resourceColors[resource.type] : '#667078'
  return <group ref={ref} position={[node.x, 0.55, node.z]}>
    <Box position={[0, 0.25, 0]} size={[1.1, 0.85, resource.type === 'FIRE_TRUCK' ? 2.3 : 1.8]} color={color} />
    <Box position={[0, 0.55, 0.55]} size={[0.9, 0.45, 0.65]} color="#d6e0df" />
    <Box position={[0, 0.8, -0.15]} size={[0.7, 0.14, 0.2]} color={resource.available ? '#ffb09a' : '#444444'} />
    {[-0.58, 0.58].flatMap(x => [-0.65, 0.65].map(z => <Box key={`${x}-${z}`} position={[x, -0.15, z]} size={[0.22, 0.4, 0.38]} color="#152129" />))}
    <Label position={[0, 2, 0]} text={resource.id} color={color} compact />
  </group>
}

function IncidentMarker({ incident, node, onSelect }) {
  const ring = useRef()
  useFrame(({ clock }) => { if (ring.current) ring.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 2) * 0.09) })
  return <group position={[node.x, 0.2, node.z]} onClick={event => { event.stopPropagation(); onSelect(incident.id) }}>
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[2, 2.35, 48]} /><meshBasicMaterial color="#f07861" transparent opacity={0.75} /></mesh>
    <mesh position={[0, 2.3, 0]}><octahedronGeometry args={[0.7]} /><meshStandardMaterial color="#f08067" /></mesh>
    <Label position={[0, 4, 0]} text={`${incident.type} · P${incident.priority}`} color="#ffb09d" border="#b76757" />
  </group>
}

function CameraRig() {
  const { size } = useThree()
  const zoom = Math.min(10, size.width / 110, size.height / 60)
  return <>
    <OrthographicCamera makeDefault position={[62, 70, 76]} zoom={zoom} near={0.1} far={300} />
    <OrbitControls makeDefault target={[0, 0, 0]} minZoom={Math.min(4, zoom)} maxZoom={22} maxPolarAngle={Math.PI / 2.3} />
  </>
}

export default function City3D({ world }) {
  const { selectedRoad, selectRoad, selectIncident, selectedIncident } = useSimulation()
  return <SceneBoundary><Canvas shadows dpr={[1, 1.7]} gl={{ antialias: true }} aria-label="Interactive 3D emergency response city">
    <color attach="background" args={['#142129']} />
    <CameraRig />
    <ambientLight intensity={1.3} />
    <directionalLight position={[15, 50, 20]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-45} shadow-camera-right={45} shadow-camera-top={45} shadow-camera-bottom={-45} />
    <Suspense fallback={null}>
      <Box position={[0, -0.7, 0]} size={[68, 1.2, 68]} color="#344a4b" />
      <Box position={[31, -0.02, 0]} size={[4, 0.05, 68]} color="#315768" />
      {Object.values(world.nodes).map(n => <Box key={n.id} position={[n.x, 0.03, n.z]} size={[2.6, 0.15, 2.6]} color="#35444c" />)}
      {Object.values(world.roads).map(road => <Road key={road.id} road={road} nodes={world.nodes} selected={road.id === selectedRoad} onSelect={selectRoad} />)}
      {world.buildings.map(b => <Building key={b.id} building={b} />)}
      {world.plan.assignments.filter(a => !selectedIncident || a.incident_id === selectedIncident).map(a => <group key={a.id}>
        {a.route.path.length > 1 && <Line points={a.route.path.map(id => [world.nodes[id].x, 0.28, world.nodes[id].z])} color={resourceColors[world.resources[a.resource_id].type]} lineWidth={3} />}
        {a.phase !== 'TRANSPORTING' && a.transport_route?.path.length > 1 && <Line points={a.transport_route.path.map(id => [world.nodes[id].x, 0.23, world.nodes[id].z])} color="#79add0" lineWidth={1.5} dashed dashSize={0.7} gapSize={0.5} />}
      </group>)}
      {Object.values(world.incidents).filter(i => i.status !== 'RESOLVED').map(i => <IncidentMarker key={i.id} incident={i} node={world.nodes[i.location]} onSelect={selectIncident} />)}
      {Object.values(world.resources).map(r => <Vehicle key={r.id} resource={r} assignment={world.plan.assignments.find(a => a.resource_id === r.id)} world={world} />)}
    </Suspense>
  </Canvas></SceneBoundary>
}
