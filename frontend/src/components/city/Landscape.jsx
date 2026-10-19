import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Object3D, Shape } from 'three'
import { landscapeLayout } from './sceneLayout'

function Trees({ trees, theme }) {
  const trunks = useRef(), crowns = useRef(), tops = useRef()
  useLayoutEffect(() => {
    const dummy = new Object3D()
    const colors = [theme.vegetation, theme.olive, theme.sage]
    trees.forEach((tree, i) => {
      const { x, z, size, variant } = tree
      dummy.position.set(x, size*.48, z)
      dummy.scale.set(.16, size, .16)
      dummy.updateMatrix()
      trunks.current.setMatrixAt(i, dummy.matrix)
      dummy.position.set(x, size*1.15, z)
      dummy.scale.set(size*.65, size*(variant === 1 ? .95 : .7), size*.65)
      dummy.rotation.y = variant*.6
      dummy.updateMatrix()
      crowns.current.setMatrixAt(i, dummy.matrix)
      crowns.current.setColorAt(i, new Color(colors[variant]))
      dummy.position.set(x+.2, size*1.55, z)
      dummy.scale.multiplyScalar(.63)
      dummy.updateMatrix()
      tops.current.setMatrixAt(i, dummy.matrix)
      tops.current.setColorAt(i, new Color(colors[(variant+1)%3]))
    })
    for (const ref of [trunks, crowns, tops]) {
      ref.current.instanceMatrix.needsUpdate = true
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
      ref.current.computeBoundingSphere()
    }
  }, [trees, theme])
  return <group name="landscaping" raycast={() => null}>
    <instancedMesh ref={trunks} args={[null, null, trees.length]} castShadow raycast={() => null}><cylinderGeometry args={[1, 1, 1, 5]} /><meshStandardMaterial color={theme.trunk} /></instancedMesh>
    <instancedMesh ref={crowns} args={[null, null, trees.length]} castShadow receiveShadow raycast={() => null}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={1} /></instancedMesh>
    <instancedMesh ref={tops} args={[null, null, trees.length]} castShadow raycast={() => null}><icosahedronGeometry args={[1, 0]} /><meshStandardMaterial roughness={1} /></instancedMesh>
  </group>
}

export default function Landscape({ nodes, roads, buildings, theme }) {
  // JSON geometry key changes only when the physical city changes, not on ticks.
  const key = JSON.stringify([nodes, Object.values(roads).map(r => [r.a, r.b]), buildings])
  const layout = useMemo(() => landscapeLayout(nodes, roads, buildings), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const { bounds } = layout
  const footprint = useMemo(() => {
    const { minX, maxX, minZ, maxZ } = bounds
    const shape = new Shape()
    const outline = [[minX-7,minZ-7], [maxX+3,minZ-7], [maxX+5,minZ-4],
      [maxX+5,maxZ+4], [maxX+2,maxZ+5], [minX-5,maxZ+5], [minX-7,maxZ+2]]
    shape.moveTo(outline[0][0], -outline[0][1])
    outline.slice(1).forEach(([x,z]) => shape.lineTo(x,-z))
    shape.closePath()
    return shape
  }, [bounds])
  return <group name="miniature-environment">
    <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -.26, 0]} raycast={() => null}>
      <planeGeometry args={[900, 900]} /><meshBasicMaterial color={theme.background} toneMapped={false} />
    </mesh>
    <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -.25, 0]} receiveShadow raycast={() => null}>
      <planeGeometry args={[900, 900]} /><shadowMaterial transparent opacity={.12} />
    </mesh>
    <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -.21, 0]} receiveShadow raycast={() => null}>
      <shapeGeometry args={[footprint]} /><meshStandardMaterial color={theme.ground} roughness={1} />
    </mesh>
    {buildings.map(b => <mesh key={b.id} rotation={[-Math.PI/2, 0, 0]} position={[b.x, -.19, b.z]} receiveShadow raycast={() => null}>
      <planeGeometry args={[7.2, 7.2]} /><meshStandardMaterial color={theme.grass} roughness={1} />
    </mesh>)}
    {layout.trees.map((tree, i) => <mesh key={i} rotation={[-Math.PI/2, 0, 0]} position={[tree.x, -.185, tree.z]} raycast={() => null}>
      <circleGeometry args={[tree.radius+0.5, 10]} /><meshStandardMaterial color={theme.grass} roughness={1} />
    </mesh>)}
    <Trees trees={layout.trees} theme={theme} />
  </group>
}
