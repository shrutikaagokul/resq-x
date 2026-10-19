import { test, expect } from '@playwright/test'
import { OrthographicCamera, Vector3 } from 'three'
import { cameraFrame } from '../src/components/city/sceneLayout.js'

// Project known backend coordinates through the preserved camera, then use real
// canvas pointer events. This exercises Three's raycasting, not a store shortcut.
async function clickWorld(page, x, y, z) {
  await page.locator('canvas').scrollIntoViewIfNeeded()
  const box = await page.locator('canvas').boundingBox()
  const camera = new OrthographicCamera(-box.width / 2, box.width / 2, box.height / 2, -box.height / 2, 0.1, 300)
  const world = await (await page.request.get('/api/world-state')).json()
  const framing = cameraFrame(world.nodes, box.width, box.height, world.buildings)
  camera.position.set(...framing.position)
  camera.zoom = framing.zoom
  camera.lookAt(...framing.target)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  const point = new Vector3(x, y, z).project(camera)
  await page.mouse.click(box.x + (point.x + 1) * box.width / 2, box.y + (1 - point.y) * box.height / 2)
}

test('select scene entities, inspect live details, emphasize routes and retain event access', async ({ page, request }) => {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await request.post('/api/simulation/reset')
  const seed = await (await request.get('/api/world-state')).json()
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(1200)

  const hospital = seed.buildings.find(b => b.id === 'H2')
  await clickWorld(page, hospital.x, hospital.height + 0.2, hospital.z)
  const hospitalPanel = page.getByRole('region', { name: 'hospital details' })
  await expect(hospitalPanel.getByRole('heading', { name: hospital.name })).toBeVisible()
  await expect(hospitalPanel).toContainText('3 / 6')
  await expect(hospitalPanel).toContainText('0 beds · 0 ICU')
  await page.getByRole('button', { name: 'Close details' }).click()

  const ambulance = seed.nodes[seed.resources['AMB-02'].location]
  await clickWorld(page, ambulance.x, 1, ambulance.z)
  await expect(page.getByRole('region', { name: 'vehicle details' })).toContainText('AMB-02')
  await expect(page.getByRole('region', { name: 'vehicle details' })).toContainText('No active route')
  await page.keyboard.press('Escape')
  await expect(page.locator('.entity-panel')).toHaveCount(0)

  await clickWorld(page, -18, 0.12, 24)
  const roadPanel = page.getByRole('region', { name: 'road details' })
  await expect(roadPanel).toContainText('N40-N41')
  await expect(roadPanel).toContainText('Available')
  await page.getByRole('button', { name: 'Block road', exact: true }).click()
  await expect(roadPanel).toContainText('Blocked')
  await page.getByRole('button', { name: 'Reopen road', exact: true }).click()
  await expect(roadPanel).toContainText('Available')
  await page.getByRole('button', { name: 'Close details' }).click()

  await request.post('/api/incidents', { data: { id: 'UI-FIRE', type: 'FIRE', location: 'N23', severity: 4, affected_population: 50, patients: 1, critical_patients: 1 } })
  await expect(page.locator('.statistics-strip')).toContainText('1')
  await page.waitForTimeout(700)
  const incident = seed.nodes.N23
  await clickWorld(page, incident.x, 2.5, incident.z)
  const incidentPanel = page.getByRole('region', { name: 'incident details' })
  await expect(incidentPanel).toContainText('UI-FIRE')
  await expect(incidentPanel).toContainText('50')
  await page.getByRole('button', { name: 'Escalate severity & population' }).click()
  await expect(incidentPanel).toContainText('70')
  await expect(incidentPanel).toContainText('5 / 5')
  await page.getByRole('button', { name: 'Close details' }).click()

  await page.getByRole('button', { name: 'Incidents & resources' }).click()
  await page.getByRole('button', { name: /AMB-01.*AMBULANCE/ }).click()
  const vehiclePanel = page.getByRole('region', { name: 'vehicle details' })
  await expect(vehiclePanel).toContainText('AMB-01')
  await expect(vehiclePanel).toContainText('Selected route')
  await expect(vehiclePanel).toContainText('UI-FIRE')
  await page.screenshot({ path: '../artifacts/redesign-vehicle.png', fullPage: true })
  await page.getByRole('button', { name: 'Close details' }).click()

  // A blockage on a real assigned route still invokes backend validation/repair.
  const before = await (await request.get('/api/world-state')).json()
  const fire = before.plan.assignments.find(a => a.resource_id === 'FIRE-01')
  const [a, b] = fire.route.path
  const road = Object.values(before.roads).find(r => (r.a === a && r.b === b) || (r.a === b && r.b === a))
  await request.post('/api/events/road-block', { data: { road_id: road.id } })
  const after = await (await request.get('/api/world-state')).json()
  expect(after.plan.revision).toBeGreaterThan(before.plan.revision)
  expect(after.decisions.some(d => d.algorithm === 'PlanValidator')).toBe(true)
  const repaired = after.plan.assignments.find(a => a.resource_id === 'FIRE-01')
  expect(repaired.route.path).not.toEqual(fire.route.path)
  expect(after.nodes).toEqual(seed.nodes)
  expect(after.buildings).toEqual(seed.buildings)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Incidents & resources' }).click()
  await page.getByRole('button', { name: /Central Medical/ }).click()
  await expect(page.getByRole('region', { name: 'hospital details' })).toBeVisible()
  await page.screenshot({ path: '../artifacts/redesign-mobile-details.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Close details' }).click()
  await page.getByRole('button', { name: 'Inject event', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Inject event' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(errors).toEqual([])
})
