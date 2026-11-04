import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'

export const TRAFFIC_COLORS = {
  FREE: '#2979FF',
  LOW: '#2979FF',
  MODERATE: '#F59E0B',
  HEAVY: '#F97316',
  GRIDLOCK: '#DC2626',
  BLOCKED: '#DC2626',
  TRAVELLED: '#8C9BA5',
}

export function getTrafficColor(road, theme) {
  if (!road) return TRAFFIC_COLORS.FREE
  if (road.blocked) return TRAFFIC_COLORS.BLOCKED
  const level = road.traffic_level || 'FREE'
  return theme?.traffic?.[level] || TRAFFIC_COLORS[level] || TRAFFIC_COLORS.FREE
}

export function BlockageMarker({ position }) {
  return (
    <group position={[position[0], 0.35, position[2]]} raycast={() => null}>
      {/* Outer pulsating/glowing red disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.65, 0.95, 32]} />
        <meshBasicMaterial color="#DC2626" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      {/* Solid red circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.65, 32]} />
        <meshBasicMaterial color="#DC2626" depthWrite={false} />
      </mesh>
      {/* White horizontal bar ("Road Closed / No Entry") */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <planeGeometry args={[0.85, 0.22]} />
        <meshBasicMaterial color="#FFFFFF" depthWrite={false} />
      </mesh>
    </group>
  )
}

function GlowingPolyline({
  points,
  color,
  lineWidth = 2.8,
  opacity = 1,
  dashed = false,
  dashSize = 0.8,
  gapSize = 0.5,
  glow = true,
}) {
  if (!points || points.length < 2) return null
  return (
    <group raycast={() => null}>
      {glow && (
        <Line
          points={points}
          color={color}
          lineWidth={lineWidth * 2.3}
          transparent
          opacity={opacity * 0.35}
          depthWrite={false}
          dashed={dashed}
          dashSize={dashSize}
          gapSize={gapSize}
        />
      )}
      <Line
        points={points}
        color={color}
        lineWidth={lineWidth}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={false}
        dashed={dashed}
        dashSize={dashSize}
        gapSize={gapSize}
      />
    </group>
  )
}

function ActiveRouteSegment({
  pStart,
  pEnd,
  assignment,
  world,
  travelTime,
  trafficColor,
  travelledColor,
  lineWidth,
  isBlocked,
}) {
  const lineTravelledRef = useRef()
  const lineRemainingRef = useRef()
  const lineHaloRef = useRef()
  const receivedAt = useRef({ key: '', at: 0 })

  useFrame(({ clock }) => {
    const key = `${assignment.id}:${world.version}`
    if (receivedAt.current.key !== key) {
      receivedAt.current = { key, at: clock.elapsedTime }
    }
    const elapsed = world.running ? Math.min(0.6, Math.max(0, clock.elapsedTime - receivedAt.current.at)) : 0
    const progress = Math.min(1, Math.max(0, (assignment.edge_progress + elapsed) / travelTime))

    const vx = pStart[0] + (pEnd[0] - pStart[0]) * progress
    const vy = pStart[1]
    const vz = pStart[2] + (pEnd[2] - pStart[2]) * progress

    if (lineTravelledRef.current) {
      lineTravelledRef.current.geometry.setPositions([pStart[0], vy, pStart[2], vx, vy, vz])
      lineTravelledRef.current.computeLineDistances()
    }
    if (lineRemainingRef.current) {
      lineRemainingRef.current.geometry.setPositions([vx, vy, vz, pEnd[0], vy, pEnd[2]])
      lineRemainingRef.current.computeLineDistances()
    }
    if (lineHaloRef.current) {
      lineHaloRef.current.geometry.setPositions([vx, vy, vz, pEnd[0], vy, pEnd[2]])
      lineHaloRef.current.computeLineDistances()
    }
  })

  const initProgress = Math.min(1, Math.max(0, assignment.edge_progress / travelTime))
  const initVx = pStart[0] + (pEnd[0] - pStart[0]) * initProgress
  const initVz = pStart[2] + (pEnd[2] - pStart[2]) * initProgress
  const midPoint = [(pStart[0] + pEnd[0]) / 2, pStart[1], (pStart[2] + pEnd[2]) / 2]

  return (
    <group raycast={() => null}>
      {/* Travelled trail (from segment start to vehicle) */}
      <Line
        ref={lineTravelledRef}
        points={[pStart, [initVx, pStart[1], initVz]]}
        color={travelledColor}
        lineWidth={2}
        transparent
        opacity={0.5}
        depthWrite={false}
      />
      {/* Remaining route halo (from vehicle to segment end) */}
      <Line
        ref={lineHaloRef}
        points={[[initVx, pStart[1], initVz], pEnd]}
        color={trafficColor}
        lineWidth={lineWidth * 2.3}
        transparent
        opacity={0.35}
        depthWrite={false}
      />
      {/* Remaining route core (from vehicle to segment end) */}
      <Line
        ref={lineRemainingRef}
        points={[[initVx, pStart[1], initVz], pEnd]}
        color={trafficColor}
        lineWidth={lineWidth}
        depthWrite={false}
      />
      {isBlocked && <BlockageMarker position={midPoint} />}
    </group>
  )
}

export function computeOffsetPath(nodeCoords, laneOffset, y) {
  if (!nodeCoords || nodeCoords.length === 0) return []
  if (nodeCoords.length === 1) return [[nodeCoords[0].x, y, nodeCoords[0].z]]
  if (laneOffset === 0) return nodeCoords.map(n => [n.x, y, n.z])

  const dirs = []
  const norms = []
  for (let i = 0; i < nodeCoords.length - 1; i++) {
    const dx = nodeCoords[i + 1].x - nodeCoords[i].x
    const dz = nodeCoords[i + 1].z - nodeCoords[i].z
    const len = Math.hypot(dx, dz) || 1
    const ux = dx / len, uz = dz / len
    dirs.push({ x: ux, z: uz })
    norms.push({ x: -uz, z: ux })
  }

  const pts = []
  for (let i = 0; i < nodeCoords.length; i++) {
    if (i === 0) {
      pts.push([nodeCoords[0].x + norms[0].x * laneOffset, y, nodeCoords[0].z + norms[0].z * laneOffset])
    } else if (i === nodeCoords.length - 1) {
      const n = norms[norms.length - 1]
      pts.push([nodeCoords[i].x + n.x * laneOffset, y, nodeCoords[i].z + n.z * laneOffset])
    } else {
      const u1 = dirs[i - 1], u2 = dirs[i]
      const n1 = norms[i - 1], n2 = norms[i]
      const denom = 1 + (u1.x * u2.x + u1.z * u2.z)
      if (Math.abs(denom) < 0.001) {
        pts.push([nodeCoords[i].x + n1.x * laneOffset, y, nodeCoords[i].z + n1.z * laneOffset])
      } else {
        const mx = (n1.x + n2.x) / denom
        const mz = (n1.z + n2.z) / denom
        pts.push([nodeCoords[i].x + mx * laneOffset, y, nodeCoords[i].z + mz * laneOffset])
      }
    }
  }
  return pts
}

export function getLaneOffset(assignment, allAssignments) {
  if (!assignment || !assignment.route?.path || assignment.route.path.length < 2) return 0
  const [aId, bId] = assignment.route.path

  const sameDir = allAssignments.filter(other => {
    if (!other || other.id === assignment.id || !other.route?.path || other.route.path.length < 2) return false
    const [oa, ob] = other.route.path
    return oa === aId && ob === bId
  })

  const oppDir = allAssignments.filter(other => {
    if (!other || !other.route?.path || other.route.path.length < 2) return false
    const [oa, ob] = other.route.path
    return oa === bId && ob === aId
  })

  const baseOffset = 0.28
  if (sameDir.length > 0) {
    const group = [assignment, ...sameDir].sort((x, y) => x.id.localeCompare(y.id))
    const index = group.findIndex(x => x.id === assignment.id)
    return 0.15 + index * 0.32
  }
  if (oppDir.length > 0) {
    return 0.32
  }
  return baseOffset
}

export default function RouteTrace({
  assignment,
  allAssignments,
  world,
  theme,
  highlighted,
  focused,
  vIndex = 0,
}) {
  const y = (highlighted ? 0.28 : 0.24) + vIndex * 0.012
  const laneOffset = getLaneOffset(assignment, allAssignments)
  const lineWidth = highlighted ? (focused ? 3.8 : 2.8) : 2.2
  const opacity = highlighted ? 1 : 0.65

  // 1. Determine full path (for identifying past travelled segments)
  const routePath = assignment.route?.path || []
  const initialPath = assignment.phase === 'TRANSPORTING'
    ? (assignment.transport_route?.path || routePath)
    : (assignment.response_route?.path || routePath)

  // Find where current route starts inside initial path
  const currNodeId = routePath[0]
  const currIndexInInitial = currNodeId ? initialPath.indexOf(currNodeId) : -1

  // Prior completed nodes before current node
  const completedNodeIds = currIndexInInitial > 0
    ? initialPath.slice(0, currIndexInInitial + 1)
    : []

  // Remaining nodes from current node onwards
  const remainingNodeIds = routePath

  // Offset points for completed segments
  const completedCoords = completedNodeIds.map(id => world.nodes[id]).filter(Boolean)
  const completedPts = computeOffsetPath(completedCoords, laneOffset, y)

  // Offset points for remaining segments
  const remainingCoords = remainingNodeIds.map(id => world.nodes[id]).filter(Boolean)
  const remainingPts = computeOffsetPath(remainingCoords, laneOffset, y)

  // Lookup helper for roads
  const findRoad = (u, v) =>
    Object.values(world.roads).find(
      r => (r.a === u && r.b === v) || (r.a === v && r.b === u)
    )

  // Active road and segment
  const activeRoad = remainingNodeIds.length >= 2 ? findRoad(remainingNodeIds[0], remainingNodeIds[1]) : null
  const activeTravelTime = activeRoad?.travel_time || 5
  const activeTrafficColor = activeRoad ? getTrafficColor(activeRoad, theme) : TRAFFIC_COLORS.FREE

  return (
    <group name={`route-${assignment.resource_id}`} raycast={() => null}>
      {/* 1. Prior fully completed travelled segments */}
      {completedPts.length >= 2 &&
        completedPts.slice(0, -1).map((pt, i) => (
          <Line
            key={`completed-${i}`}
            points={[pt, completedPts[i + 1]]}
            color={TRAFFIC_COLORS.TRAVELLED}
            lineWidth={2}
            transparent
            opacity={0.45 * opacity}
            depthWrite={false}
            raycast={() => null}
          />
        ))}

      {/* 2. Active segment currently being traversed */}
      {remainingPts.length >= 2 && (
        <ActiveRouteSegment
          key={`active-${assignment.id}-${remainingNodeIds[0]}-${remainingNodeIds[1]}`}
          pStart={remainingPts[0]}
          pEnd={remainingPts[1]}
          assignment={assignment}
          world={world}
          travelTime={activeTravelTime}
          trafficColor={activeTrafficColor}
          travelledColor={TRAFFIC_COLORS.TRAVELLED}
          lineWidth={lineWidth}
          isBlocked={Boolean(activeRoad?.blocked)}
        />
      )}

      {/* 3. Future remaining segments (after the active segment) */}
      {remainingPts.length > 2 &&
        remainingPts.slice(1, -1).map((pt, i) => {
          const u = remainingNodeIds[i + 1]
          const v = remainingNodeIds[i + 2]
          const road = findRoad(u, v)
          const color = getTrafficColor(road, theme)
          const midPoint = [(pt[0] + remainingPts[i + 2][0]) / 2, y, (pt[2] + remainingPts[i + 2][2]) / 2]

          return (
            <group key={`future-${u}-${v}`} raycast={() => null}>
              <GlowingPolyline
                points={[pt, remainingPts[i + 2]]}
                color={color}
                lineWidth={lineWidth}
                opacity={opacity}
                glow={true}
              />
              {road?.blocked && <BlockageMarker position={midPoint} />}
            </group>
          )
        })}
    </group>
  )
}

