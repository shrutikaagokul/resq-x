import { Suspense, useRef, useMemo, useEffect, useContext, createContext, Component } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls, OrthographicCamera } from '@react-three/drei'
import { BoxGeometry, MeshStandardMaterial, CanvasTexture, SRGBColorSpace, Vector3 } from 'three'
import { useSimulation } from '../state/simulationStore'
import { readCityTheme } from '../styles/cityTheme'
import Landscape from './city/Landscape'
import { cameraFrame } from './city/sceneLayout'

const ThemeContext = createContext(null)
const unitBox = new BoxGeometry(1, 1, 1)
const boxMaterials = new Map()
function boxMaterial(color) {
  if (!boxMaterials.has(color)) boxMaterials.set(color, new MeshStandardMaterial({ color, roughness: .83 }))
  return boxMaterials.get(color)
}

class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div className="scene-error">3D rendering could not start. Enable WebGL / hardware acceleration and reload.</div> : this.props.children }
}

function Box({ position, size, color, ...props }) {
  return <mesh position={position} scale={size} geometry={unitBox} material={boxMaterial(color)} dispose={null} castShadow receiveShadow {...props} />
}

function Label({ text, position, color, border, compact = false }) {
  const theme = useContext(ThemeContext)
  color ||= theme.text
  border ||= theme.border
  // Keep labels inside the Three scene instead of mounting nested React DOM roots.
  const { texture, width, height } = useMemo(() => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    context.font = '22px sans-serif'
    canvas.width = Math.ceil(context.measureText(text).width) + 24
    canvas.height = 40
    context.fillStyle = theme.cream
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
  }, [text, color, border, theme.cream])
  useEffect(() => () => texture.dispose(), [texture])
  const unit = compact ? 65 : 48
  return <sprite position={position} scale={[width / unit, height / unit, 1]}>
    <spriteMaterial map={texture} transparent depthTest={false} toneMapped={false} />
  </sprite>
}

function Building({ building, onSelect }) {
  const theme = useContext(ThemeContext)
  const { x, z, height: h, kind, name } = building
  const residential = ['residential', 'office', 'commercial', 'shop', 'warehouse'].includes(kind)
  const district = Math.abs(Math.round((x+18.5)/12)) % 4
  const facade = residential ? [theme.buildings.residential, theme.blueGrey, theme.buildings.station, theme.sage][district] : theme.buildings[kind]
  const width = building.id === 'H3' ? 6 : residential ? 4.6 : 5
  const office = kind === 'office' || (residential && h >= 6)
  return <group name={`building-${building.id}`} position={[x, 0, z]} onClick={kind === 'hospital' ? event => { event.stopPropagation(); onSelect('hospital', building.id) } : undefined}>
    <Box position={[0, -.08, 0]} size={[6, .16, 5.6]} color={theme.sidewalk} />
    <Box position={[0, h/2, 0]} size={[width, h, 4.2]} color={facade} />
    <Box position={[0, .2, 0]} size={[width+.12, .4, 4.32]} color={theme.border} />
    <Box position={[0, h+.12, 0]} size={[width+.3, .24, 4.5]} color={theme.roof} />
    {[0, Math.PI/2].map((angle, side) => <group key={side} rotation={[0, angle, 0]}>
      {Array.from({ length: Math.max(1, Math.floor(h/1.5)) }, (_, floor) => <group key={floor}>
        {[-1.35, 0, 1.35].map(i => <Box key={i} position={[i, .95+floor*1.4, side ? width/2+.02 : 2.12]}
          size={[office ? .94 : .68, office ? .98 : .72, .04]} color={theme.window} />)}
        <Box position={[0, .5+floor*1.4, side ? width/2+.045 : 2.15]} size={[3.8, .08, .09]} color={theme.roof} />
      </group>)}
    </group>)}
    <Box position={[0, .65, 2.14]} size={[.8, 1.25, .06]} color={theme.text} />
    <Box position={[0, 1.45, 2.3]} size={[1.5, .12, .65]} color={residential ? theme.terracotta : theme.roof} />
    {residential && <>
      {office ? <>
        <Box position={[0, h+.7, -.5]} size={[2.6, 1.2, 2.3]} color={facade} />
        <Box position={[0, h+1.35, -.5]} size={[2.8, .12, 2.5]} color={theme.roof} />
      </> : district % 2 === 0 ? <group position={[0, h+.45, 0]}>
        <Box position={[-width/4, 0, 0]} size={[width/2+.15, .16, 4.5]} rotation={[0, 0, .3]} color={theme.terracotta} />
        <Box position={[width/4, 0, 0]} size={[width/2+.15, .16, 4.5]} rotation={[0, 0, -.3]} color={theme.terracotta} />
      </group> : <>
        <Box position={[-1, h+.3, -.7]} size={[1.5, .25, 1.5]} color={theme.olive} />
        <Box position={[1, h+.45, -.8]} size={[.7, .65, .8]} color={theme.border} />
      </>}
      {h > 4 && [2.5, 3.9].map(y => <group key={y}>
        <Box position={[-1.15, y, 2.35]} size={[1.4, .12, .6]} color={theme.roof} />
        <Box position={[-1.15, y+.28, 2.6]} size={[1.4, .45, .06]} color={facade} />
      </group>)}
    </>}
    {kind === 'hospital' && <>
      <Box position={[0, .85, 2.17]} size={[2.8, 1.6, .08]} color={theme.window} />
      <Box position={[0, 1.9, 2.32]} size={[3.6, .2, .65]} color={theme.resources.AMBULANCE} />
      <Box position={[0, h+.3, 0]} size={[1.9, .13, .55]} color={theme.critical} />
      <Box position={[0, h+.31, 0]} size={[.55, .13, 1.9]} color={theme.critical} />
      <Box position={[-1.6, h+.45, -1.1]} size={[1, .65, .8]} color={theme.border} />
    </>}
    {kind === 'factory' && <>
      {[-1.5, 1.3].map((x, i) => <group key={x}>
        <Box position={[x, h+1.15-i*.3, -1]} size={[.6, 2.3-i*.6, .6]} color={theme.trunk} />
        <Box position={[x, h+2.2-i*.6, -1]} size={[.7, .2, .7]} color={theme.roof} />
        <Box position={[x, 1, 2.14]} size={[1.3, 1.7, .1]} color={theme.road} />
      </group>)}
      <Box position={[0, h+.35, .8]} size={[3.8, .4, 1.2]} color={theme.blueGrey} />
    </>}
    {kind === 'school' && <>
      <Box position={[0, h+.45, 0]} size={[1.8, .7, 1.5]} color={theme.mustard} />
      <Box position={[0, h+.87, 0]} size={[2, .14, 1.8]} color={theme.terracotta} />
      <Box position={[0, -.015, -2.65]} size={[4.6, .08, .85]} color={theme.grass} />
    </>}
    {kind === 'shelter' && <>
      {[-1.7, 1.7].map(x => <Box key={x} position={[x, .9, 2.36]} size={[.16, 1.8, .16]} color={theme.roof} />)}
      <Box position={[0, 1.9, 2.35]} size={[3.8, .16, .6]} color={theme.olive} />
    </>}
    {kind === 'station' && [-1.3, 1.3].map(x => <Box key={x} position={[x, .95, 2.13]} size={[1.6, 1.8, .08]} color={theme.terracotta} />)}
    {!residential && <Label position={[0, h+(kind === 'factory' ? 2.8 : 1.5), 0]} text={name} />}
  </group>
}

function Road({ road, nodes, selected, onSelect }) {
  const theme = useContext(ThemeContext)
  const a = nodes[road.a], b = nodes[road.b]
  const horizontal = a.z === b.z
  const length = Math.hypot(b.x-a.x, b.z-a.z)
  const width = road.kind === 'arterial' ? 3 : 2.6
  const middle = [(a.x + b.x) / 2, 0.04, (a.z + b.z) / 2]
  return <group name={`road-${road.id}`}>
    <Box position={[middle[0], -.065, middle[2]]} size={horizontal ? [length, .15, 4.1] : [4.1, .15, length]} color={theme.sidewalk} />
    <Box position={middle} size={horizontal ? [length, 0.12, width] : [width, 0.12, length]}
      color={road.blocked ? theme.critical : selected ? theme.text : theme.road}
      onClick={event => { event.stopPropagation(); onSelect(road.id) }} />
    <Line points={[[a.x, 0.12, a.z], [b.x, 0.12, b.z]]} color={road.known ? theme.marking : theme.unknown} lineWidth={0.7} dashed dashSize={0.8} gapSize={0.9} />
    {road.blocked && <group position={[middle[0], 0.65, middle[2]]} rotation={[0, horizontal ? Math.PI / 2 : 0, 0]}>
      <Box position={[0, 0, 0]} size={[3, 0.5, 0.3]} color={theme.critical} />
      <Box position={[-1, -0.4, 0]} size={[0.15, 1, 0.15]} color={theme.roof} />
      <Box position={[1, -0.4, 0]} size={[0.15, 1, 0.15]} color={theme.roof} />
    </group>}
  </group>
}

function Vehicle({ resource, assignment, world, onSelect, selected }) {
  const theme = useContext(ThemeContext)
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
  const color = resource.available ? theme.resources[resource.type] : theme.inactive
  return <group name={`vehicle-${resource.id}`} ref={ref} position={[node.x, 0.55, node.z]} onClick={event => { event.stopPropagation(); onSelect('vehicle', resource.id) }}>
    {selected && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.25, 0]}><ringGeometry args={[1.5, 1.7, 32]} /><meshBasicMaterial color={theme.text} /></mesh>}
    <Box position={[0, .15, 0]} size={[1.2, .75, resource.type === 'FIRE_TRUCK' ? 2.4 : 1.95]} color={resource.type === 'AMBULANCE' && resource.available ? theme.cream : color} />
    <Box position={[0, .53, .6]} size={[1.02, .48, .65]} color={theme.cream} />
    <Box position={[0, .53, .94]} size={[.84, .32, .04]} color={theme.window} />
    <Box position={[0, .8, .2]} size={[.85, .12, .22]} color={resource.available ? theme.critical : theme.window} />
    {resource.type === 'AMBULANCE' && [-.61, .61].map(x => <group key={x}>
      <Box position={[x, .26, -.3]} size={[.04, .16, .6]} color={theme.critical} />
      <Box position={[x, .26, -.3]} size={[.05, .5, .16]} color={theme.critical} />
      <Box position={[x, -.02, 0]} size={[.03, .12, 1.8]} color={theme.resources.AMBULANCE} />
    </group>)}
    {resource.type === 'FIRE_TRUCK' && <group position={[0, .65, -.45]}>
      {[-.34, .34].map(x => <Box key={x} position={[x, 0, 0]} size={[.07, .1, 1.5]} color={theme.roof} />)}
      {[-.6, -.3, 0, .3, .6].map(z => <Box key={z} position={[0, 0, z]} size={[.7, .08, .06]} color={theme.roof} />)}
    </group>}
    {resource.type === 'RESCUE_TEAM' && <Box position={[0, .6, -.45]} size={[.85, .18, .8]} color={theme.olive} />}
    {[-.63, .63].flatMap(x => [-.65, .65].map(z => <Box key={`${x}-${z}`} position={[x, -.15, z]} size={[.22, .4, .4]} color={theme.text} />))}
    <Label position={[0, 2, 0]} text={resource.id} color={theme.text} border={color} compact />
  </group>
}

function IncidentMarker({ incident, node, onSelect }) {
  const theme = useContext(ThemeContext)
  const ring = useRef()
  useFrame(({ clock }) => { if (ring.current) ring.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 2) * 0.09) })
  return <group position={[node.x, 0.2, node.z]} onClick={event => { event.stopPropagation(); onSelect(incident.id) }}>
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[2, 2.35, 48]} /><meshBasicMaterial color={theme.critical} transparent opacity={0.75} /></mesh>
    <mesh position={[0, 2.3, 0]}><octahedronGeometry args={[0.7]} /><meshStandardMaterial color={theme.critical} /></mesh>
    <Label position={[0, 4, 0]} text={`${incident.type} · P${incident.priority}`} color={theme.text} border={theme.critical} />
  </group>
}

function CameraRig({ nodes, buildings }) {
  const { size } = useThree()
  const key = JSON.stringify([nodes, buildings])
  const framing = useMemo(() => cameraFrame(nodes, size.width, size.height, buildings), [key, size.width, size.height]) // eslint-disable-line react-hooks/exhaustive-deps
  return <>
    <OrthographicCamera makeDefault position={framing.position} zoom={framing.zoom} near={.1} far={600} />
    <OrbitControls makeDefault target={framing.target} minZoom={Math.min(4, framing.zoom)} maxZoom={25} maxPolarAngle={Math.PI / 2.3} />
  </>
}

function Intersection({ node, theme, roads }) {
  const width = roads.some(r => r.kind === 'arterial' && (r.a === node.id || r.b === node.id)) ? 3 : 2.6
  return <group position={[node.x, 0, node.z]}>
    <Box position={[0, -.06, 0]} size={[4.1, .15, 4.1]} color={theme.sidewalk} />
    <Box position={[0, .03, 0]} size={[width, .15, width]} color={theme.road} />
    {['N12', 'N23', 'N40', 'N04', 'N22', 'X78', 'X17', 'X71'].includes(node.id) && [0, Math.PI/2].map(angle => <group key={angle} rotation={[0, angle, 0]}>
      {[-1.8, 1.8].flatMap(z => [-.8, -.4, 0, .4, .8].map(x => <Box key={`${x}-${z}`} position={[x, .115, z]} size={[.21, .012, .6]} color={theme.marking} />))}
    </group>)}
  </group>
}

export default function City3D({ world }) {
  const { selectRoad, selectIncident, selectEntity, selection } = useSimulation()
  const theme = useMemo(readCityTheme, [])
  return <SceneBoundary><Canvas shadows dpr={[1, 1.7]} gl={{ antialias: true }} aria-label="Interactive 3D emergency response city">
    <ThemeContext.Provider value={theme}>
    <color attach="background" args={[theme.background]} />
    <CameraRig nodes={world.nodes} buildings={world.buildings} />
    <ambientLight intensity={.9} />
    <directionalLight position={[15, 50, 20]} intensity={2} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-85} shadow-camera-right={85} shadow-camera-top={85} shadow-camera-bottom={-85} shadow-camera-far={250} />
    <Suspense fallback={null}>
      <Landscape nodes={world.nodes} roads={world.roads} buildings={world.buildings} theme={theme} />
      {Object.values(world.nodes).map(n => <Intersection key={n.id} node={n} theme={theme} roads={Object.values(world.roads)} />)}
      {Object.values(world.roads).map(road => <Road key={road.id} road={road} nodes={world.nodes} selected={selection?.kind === 'road' && road.id === selection.id} onSelect={selectRoad} />)}
      {world.buildings.map(b => <Building key={b.id} building={b} onSelect={selectEntity} />)}
      {world.plan.assignments.map(a => {
        const focused = selection?.kind === 'vehicle' || selection?.kind === 'incident'
        const highlighted = !focused || (selection.kind === 'vehicle' ? a.resource_id === selection.id : a.incident_id === selection.id)
        const color = highlighted ? theme.resources[world.resources[a.resource_id].type] : theme.inactive
        return <group name={`route-${a.resource_id}`} key={a.id}>
          {a.route.path.length > 1 && <Line points={a.route.path.map(id => [world.nodes[id].x, highlighted ? 0.32 : 0.24, world.nodes[id].z])} color={color} lineWidth={highlighted ? (focused ? 4.5 : 3) : 1.5} />}
          {a.phase !== 'TRANSPORTING' && a.transport_route?.path.length > 1 && <Line points={a.transport_route.path.map(id => [world.nodes[id].x, 0.26, world.nodes[id].z])} color={color} lineWidth={highlighted ? 2 : 1} dashed dashSize={0.7} gapSize={0.5} />}
        </group>
      })}
      {Object.values(world.incidents).filter(i => i.status !== 'RESOLVED').map(i => <IncidentMarker key={i.id} incident={i} node={world.nodes[i.location]} onSelect={selectIncident} />)}
      {Object.values(world.resources).map(r => <Vehicle key={r.id} resource={r} assignment={world.plan.assignments.find(a => a.resource_id === r.id)} world={world} onSelect={selectEntity} selected={selection?.kind === 'vehicle' && selection.id === r.id} />)}
    </Suspense>
    </ThemeContext.Provider>
  </Canvas></SceneBoundary>
}
