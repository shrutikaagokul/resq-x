import { OrthographicCamera, Vector3 } from 'three'

export const CAMERA_POSITION = [46, 70, 84]

export function cityBounds(nodes) {
  const values = Object.values(nodes)
  return { minX: Math.min(...values.map(n => n.x)), maxX: Math.max(...values.map(n => n.x)),
    minZ: Math.min(...values.map(n => n.z)), maxZ: Math.max(...values.map(n => n.z)) }
}

export function distanceToRoad(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z
  const t = Math.max(0, Math.min(1, ((x-a.x)*dx + (z-a.z)*dz) / (dx*dx + dz*dz)))
  return Math.hypot(x - a.x - t*dx, z - a.z - t*dz)
}

export function landscapeLayout(nodes, roads, buildings) {
  const bounds = cityBounds(nodes)
  const edges = Object.values(roads).map(r => [nodes[r.a], nodes[r.b]])
  const trees = []
  function plant(x, z, size, variant) {
    const radius = size * 0.68
    // Reserve the full crown, not just the trunk, outside every road corridor.
    if (edges.some(([a, b]) => distanceToRoad(x, z, a, b) < 2.15 + radius)) return
    if (buildings.some(b => Math.abs(x-b.x) < (b.id === 'H3' ? 3.2 : 2.7) + radius && Math.abs(z-b.z) < 2.8 + radius)) return
    trees.push({ x, z, size, variant, radius })
  }
  // Deliberate corner gardens within city blocks; all placements are validated.
  const xs = [...new Set(Object.values(nodes).map(n => n.x))].sort((a, b) => a-b)
  const zs = [...new Set(Object.values(nodes).map(n => n.z))].sort((a, b) => a-b)
  for (let i = 0; i < xs.length-1; i++) for (let j = 0; j < zs.length-1; j++) {
    plant(xs[i]+2.9, zs[j+1]-2.9, 1, (i+j)%3)
    plant(xs[i+1]-2.9, zs[j]+2.9, 1, (i+j+1)%3)
    const cx = (xs[i]+xs[i+1])/2, cz = (zs[j]+zs[j+1])/2
    if (!buildings.some(b => Math.abs(b.x-cx)<5 && Math.abs(b.z-cz)<5)) plant(cx, cz, 1.7, (i+j)%3)
  }
  // Small perimeter gardens, not a forest or an expanded simulation footprint.
  for (let x = bounds.minX-3; x <= bounds.maxX+3; x += 6) {
    plant(x, bounds.minZ-5, 1.5, Math.abs(Math.round(x))%3)
    plant(x, bounds.maxZ+3.7, 1.45, Math.abs(Math.round(x+1))%3)
  }
  for (let z = bounds.minZ+3; z <= bounds.maxZ-3; z += 6) {
    plant(bounds.minX-4.5, z, 1.55, Math.abs(Math.round(z))%3)
    plant(bounds.maxX+3.7, z, 1.45, Math.abs(Math.round(z+1))%3)
  }
  return { bounds, trees }
}

export function cameraFrame(nodes, width, height, buildings = []) {
  const b = cityBounds(nodes)
  // Frame the occupied miniature, including landmark roofs and small edge gardens.
  // No scenery outside the city participates in fitting.
  const points = []
  for (const x of [b.minX-8, b.maxX+5]) for (const z of [b.minZ-8, b.maxZ+5]) {
    points.push(new Vector3(x, 0, z))
  }
  for (const building of buildings) {
    for (const dx of [-3, 3]) for (const dz of [-2.8, 2.8]) {
      points.push(new Vector3(building.x+dx, building.height+2.8, building.z+dz))
    }
  }
  const camera = new OrthographicCamera(-width/2, width/2, height/2, -height/2, .1, 600)
  camera.position.set(...CAMERA_POSITION)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const local = points.map(p => p.clone().applyMatrix4(camera.matrixWorldInverse))
  const minX = Math.min(...local.map(p => p.x)), maxX = Math.max(...local.map(p => p.x))
  const minY = Math.min(...local.map(p => p.y)), maxY = Math.max(...local.map(p => p.y))
  const zoom = Math.min(width*.89/(maxX-minX), height*.90/(maxY-minY))
  const offset = new Vector3((minX+maxX)/2, (minY+maxY)/2, 0).applyQuaternion(camera.quaternion)
  return { zoom, target: offset.toArray(), position: new Vector3(...CAMERA_POSITION).add(offset).toArray() }
}
