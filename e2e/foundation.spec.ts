import { expect, test, type Page } from '@playwright/test'

function roomCanvasTransform(bounds: { width: number; height: number }, widthCm = 520, depthCm = 390) {
  const isMobileCanvas = bounds.width <= 500
  const isWideDesktopCanvas = !isMobileCanvas && bounds.width >= 1000
  const summaryInset = isWideDesktopCanvas ? Math.min(280, bounds.width * 0.32) : 0
  const reservedBottom = isMobileCanvas || !isWideDesktopCanvas
    ? Math.min(220, bounds.height * 0.38)
    : 0
  const availableHeight = bounds.height - reservedBottom
  const padding = isMobileCanvas ? 74 : isWideDesktopCanvas ? 88 : 52
  const availableWidth = bounds.width - summaryInset
  const scale = Math.min((availableWidth - padding * 2) / widthCm, (availableHeight - padding * 2) / depthCm)
  return {
    scale,
    offsetX: summaryInset + (availableWidth - widthCm * scale) / 2,
    offsetY: (availableHeight - depthCm * scale) / 2,
  }
}

async function openRoomInspector(page: Page) {
  await page.locator('canvas').click({ position: { x: 10, y: 10 } })
  await page.getByRole('combobox', { name: 'Choose room' }).click()
  await page.locator('.select-control-option[aria-selected="true"]').click()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('roomform-test-reset')) {
      localStorage.clear()
      localStorage.setItem('roomform-theme', 'light')
      sessionStorage.setItem('roomform-test-reset', 'true')
    }
  })
})

test('uses Roomize branding and a linked site icon', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Roomize — Room layout optimizer')
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg')
  await expect(page.getByRole('link', { name: 'Roomize home' })).toContainText('Room layout optimizer')
  await page.getByRole('button', { name: 'Optimize layout' }).click()
  await expect(page.getByText('ROOMIZE OPTIMIZER')).toBeVisible()
})

test('shows shortcuts in a dismissible in-app toast', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Shortcuts' }).click()
  const toast = page.getByRole('status', { name: 'Keyboard shortcuts' })
  await expect(toast).toBeVisible()
  await expect(toast).toHaveCSS('position', 'fixed')
  await expect(toast).toHaveCSS('bottom', '18px')
  await expect(toast).toContainText('Ctrl/Cmd + Z')
  await toast.getByRole('button', { name: 'Close shortcuts' }).click()
  await expect(toast).toBeHidden()
})

test('light and dark themes redraw the canvas and persist', async ({ page }) => {
  await page.goto('/')
  const canvas = page.locator('canvas')
  const canvasBackground = () => canvas.evaluate((element) => {
    const context = element.getContext('2d')
    return context ? Array.from(context.getImageData(1, 1, 1, 1).data).slice(0, 3) : []
  })

  const lightPixel = await canvasBackground()
  expect(lightPixel[0]).toBeGreaterThan(200)

  await page.getByRole('button', { name: 'Switch to dark theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(async () => (await canvasBackground())[0]).toBeLessThan(80)

  await page.getByRole('button', { name: 'Switch to light theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect.poll(async () => (await canvasBackground())[0]).toBeGreaterThan(200)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('renames a room, changes units, and resizes the room with numeric fields', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Rename room' }).click()
  const nameInput = page.getByRole('textbox', { name: 'Room name' }).first()
  await nameInput.fill('Studio')
  await nameInput.press('Enter')
  await expect(page.getByText('Studio').first()).toBeVisible()

  await page.getByRole('combobox', { name: 'Measurement units' }).click()
  await page.getByRole('option', { name: 'm', exact: true }).click()
  const widthField = page.getByRole('spinbutton', { name: 'Width in m' }).first()
  await expect(widthField).toHaveValue('5.20')
  await widthField.focus()
  await widthField.press('ArrowUp')
  await widthField.press('Enter')
  await expect(widthField).toHaveValue('5.30')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('roomform-project') ?? '{}').state.room.widthCm)).toBe(530)
  await expect(page.getByText('5.3 m').first()).toBeVisible()
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Measurement units' })).toHaveText('m')
  await expect(page.locator('.room-name-label')).toHaveText('Studio')
  await expect(page.getByRole('spinbutton', { name: 'Width in m' }).first()).toHaveValue('5.30')
})

test('moves furniture by dragging, undoes the move, and edits its properties', async ({ page }) => {
  await page.goto('/')
  const canvas = page.locator('canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('Canvas did not have a bounding box')

  const { scale, offsetX, offsetY } = roomCanvasTransform(bounds)
  await page.mouse.move(bounds.x + 8, bounds.y + 8)
  await expect(canvas).toHaveCSS('cursor', 'default')
  const start = { x: bounds.x + offsetX + 170 * scale, y: bounds.y + offsetY + 190 * scale }

  await page.mouse.move(start.x, start.y)
  await expect(canvas).toHaveCSS('cursor', 'grab')
  await page.mouse.down()
  await page.mouse.move(start.x + 60, start.y + 20, { steps: 5 })
  await page.mouse.up()

  const xPosition = page.getByRole('spinbutton', { name: 'X position in cm' })
  await expect(page.getByRole('heading', { name: 'Furniture' })).toBeVisible()
  await expect(xPosition).not.toHaveValue('170')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(xPosition).toHaveValue('210')

  await canvas.focus()
  await page.keyboard.press('ArrowRight')
  await expect(xPosition).toHaveValue('220')
  await page.keyboard.press('Control+z')
  await expect(xPosition).toHaveValue('210')

  await canvas.focus()
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'к',
    code: 'KeyR',
    bubbles: true,
  })))
  const rotationField = page.getByRole('spinbutton', { name: 'Rotation in degrees' })
  await expect(rotationField).toHaveValue('90')
  await page.keyboard.press('Control+z')
  await expect(rotationField).toHaveValue('0')

  const widthField = page.getByRole('spinbutton', { name: 'Width in cm' })
  await widthField.fill('180')
  await widthField.press('Enter')
  await expect(widthField).toHaveValue('180')

  await page.getByRole('button', { name: 'Rotate 90°' }).click()
  await expect(page.getByRole('spinbutton', { name: 'Rotation in degrees' })).toHaveValue('90')
  await page.getByRole('button', { name: 'Lock' }).click()
  await expect(page.getByRole('button', { name: 'Unlock' })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'X position in cm' })).toBeDisabled()
  await canvas.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('spinbutton', { name: 'X position in cm' })).toHaveValue('210')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByRole('button', { name: 'Duplicate' }).click()
  await expect(page.getByRole('textbox', { name: 'Furniture name' })).toHaveValue('Queen bed copy')
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('heading', { name: 'Room', exact: true })).toBeVisible()
})

test('keeps a dragged furniture item inside the room walls', async ({ page }) => {
  await page.goto('/')
  const canvas = page.locator('canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('Canvas did not have a bounding box')

  const { scale, offsetX, offsetY } = roomCanvasTransform(bounds)
  const start = {
    x: bounds.x + offsetX + 210 * scale,
    y: bounds.y + offsetY + 190 * scale,
  }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(bounds.x + offsetX + 800 * scale, start.y, { steps: 8 })
  await page.mouse.up()

  const furniture = await page.evaluate(() => JSON.parse(localStorage.getItem('roomform-project') ?? '{}').state.furniture)
  const bed = furniture.find((item: { id: string }) => item.id === 'bed-main')
  expect(bed.position.x + bed.widthCm / 2).toBeLessThanOrEqual(520)
  expect(bed.position.x).toBeCloseTo(440, 0)
})

test('saves furniture names when the input loses focus', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add furniture' }).first().click()
  await page.getByRole('menuitem', { name: /Sofa/ }).click()
  const nameInput = page.getByRole('textbox', { name: 'Furniture name' })
  await nameInput.fill('Reading sofa')
  const bounds = await page.locator('canvas').boundingBox()
  if (!bounds) throw new Error('Canvas did not have a bounding box')
  await page.mouse.click(bounds.x + bounds.width - 12, bounds.y + 12)

  await expect.poll(() => page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('roomform-project') ?? '{}')
    return project.state?.furniture?.some((item: { name: string }) => item.name === 'Reading sofa')
  })).toBe(true)
  await page.reload()
  const storedName = await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('roomform-project') ?? '{}')
    return project.state?.furniture?.find((item: { name: string }) => item.name === 'Reading sofa')?.name
  })
  expect(storedName).toBe('Reading sofa')
})

test('applies inspector edits live without losing input focus', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add furniture' }).first().click()
  await page.getByRole('menuitem', { name: /Sofa/ }).click()
  const rotation = page.getByRole('spinbutton', { name: 'Rotation in degrees' })
  await rotation.click()
  await rotation.press('ArrowUp')
  await rotation.press('ArrowUp')
  await rotation.fill('45')
  await expect(rotation).toBeFocused()
  await expect.poll(() => page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('roomform-project') ?? '{}')
    return project.state?.furniture?.at(-1)?.rotationDeg
  })).toBe(45)
  const width = page.getByRole('spinbutton', { name: 'Width in cm' }).first()
  await width.fill('123')
  await expect(width).toBeFocused()
  await expect.poll(() => page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('roomform-project') ?? '{}')
    return project.state?.furniture?.at(-1)?.widthCm
  })).toBe(123)
})

test('adds furniture from the library, saves it across reload, and works on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const newRoomButton = page.getByRole('button', { name: 'Create a new room' })
  await expect(newRoomButton).toBeVisible()
  await newRoomButton.click()
  const createRoomDialog = page.getByRole('dialog', { name: 'Create a room' })
  await expect(createRoomDialog).toBeVisible()
  await createRoomDialog.getByRole('button', { name: 'Cancel' }).click()
  await page.locator('.mobile-actions').getByRole('button', { name: 'Room details' }).click()
  await expect(page.getByRole('heading', { name: 'Room', exact: true })).toBeVisible()
  await expect(page.locator('.right-panel').getByRole('textbox', { name: 'Room name' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Rename room' }).click()
  const mobileRoomName = page.getByRole('textbox', { name: 'Room name' })
  await mobileRoomName.fill('Mobile room')
  await mobileRoomName.press('Enter')

  const addButton = page.getByRole('button', { name: 'Add furniture' }).last()
  await expect(addButton).toBeVisible()
  const addButtonBounds = await addButton.boundingBox()
  expect(addButtonBounds?.width).toBe(36)
  expect(addButtonBounds?.height).toBe(36)
  await addButton.click()
  await page.getByRole('menuitem', { name: /Sofa/ }).click()
  await expect(page.getByRole('textbox', { name: 'Furniture name' })).toHaveValue('Sofa')
  await expect(page.getByRole('heading', { name: 'Furniture' })).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 844 })
  const objectsSelect = page.getByRole('combobox', { name: 'Placed objects' })
  await expect(objectsSelect).toBeVisible()
  await objectsSelect.click()
  await page.getByRole('option', { name: /Sofa/ }).click()
  await expect(page.getByRole('heading', { name: 'Furniture' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 390)

  await page.reload()
  const savedFurnitureCount = await page.evaluate(() => {
    const saved = localStorage.getItem('roomform-project')
    return saved ? JSON.parse(saved).state.furniture.length as number : 0
  })
  expect(savedFurnitureCount).toBe(7)
  const savedRoomName = await page.evaluate(() => JSON.parse(localStorage.getItem('roomform-project') ?? '{}').state.room.name as string)
  expect(savedRoomName).toBe('Mobile room')
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 390)
  await page.setViewportSize({ width: 320, height: 720 })
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 320)
})

test('creates, switches between, and restores separate rooms', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New room', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Create a room' })
  await dialog.getByRole('textbox', { name: 'Room name' }).fill('Reading nook')
  await dialog.getByRole('combobox', { name: 'Room shape' }).click()
  await page.getByRole('option', { name: 'L-shaped' }).click()
  await dialog.getByLabel('Room width in cm').fill('420')
  await dialog.getByLabel('Room depth in cm').fill('360')
  await dialog.getByRole('button', { name: 'Create room' }).click()
  await expect(page.locator('.room-name-label')).toHaveText('Reading nook')
  const openingsSelect = page.getByRole('combobox', { name: 'Placed doors and windows' })
  await openingsSelect.click()
  await expect(page.getByRole('listbox', { name: 'Placed doors and windows' }).getByRole('option')).toHaveCount(1)
  await openingsSelect.press('Escape')

  await page.getByRole('combobox', { name: 'Choose room' }).click()
  await page.getByRole('option', { name: 'Bedroom', exact: true }).click()
  await expect(page.locator('.room-name-label')).toHaveText('Bedroom')
  await page.getByRole('combobox', { name: 'Choose room' }).click()
  await page.getByRole('option', { name: 'Reading nook', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Width in cm' }).first()).toHaveValue('420')

  await page.reload()
  await page.getByRole('combobox', { name: 'Choose room' }).click()
  await expect(page.getByRole('option', { name: 'Reading nook', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Bedroom', exact: true })).toBeVisible()
  await page.getByRole('option', { name: 'Reading nook', exact: true }).click()
  await page.getByRole('button', { name: 'Delete this room' }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Delete this room?' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Delete room' }).click()
  await expect(page.locator('.room-name-label')).toHaveText('Bedroom')
})

test('numbers duplicate room names and selects rooms from a compact dropdown', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 620 })
  await page.goto('/')

  for (let index = 1; index <= 5; index += 1) {
    await page.getByRole('button', { name: 'New room', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Create a room' })
    await dialog.getByRole('textbox', { name: 'Room name' }).fill('Studio')
    await dialog.getByRole('button', { name: 'Create room' }).click()
    await expect(page.locator('.room-name-label')).toHaveText(index === 1 ? 'Studio' : `Studio ${index}`)
  }

  const roomSelect = page.getByRole('combobox', { name: 'Choose room' })
  await roomSelect.click()
  const roomOptions = page.getByRole('listbox', { name: 'Choose room' })
  await expect(roomOptions.getByRole('option')).toHaveCount(6)
  for (let index = 1; index <= 5; index += 1) {
    await expect(roomOptions.getByRole('option', { name: index === 1 ? 'Studio' : `Studio ${index}`, exact: true })).toBeVisible()
  }
  await page.getByRole('option', { name: 'Studio 5', exact: true }).click()
  const panelBounds = await page.locator('.left-panel').boundingBox()
  const editorBounds = await page.locator('.canvas-area').boundingBox()
  const dimensionsBounds = await page.locator('.room-summary').boundingBox()
  const cursorPositionBounds = await page.locator('.canvas-coordinates').boundingBox()
  const footerBounds = await page.locator('.left-footer').boundingBox()
  expect(panelBounds).not.toBeNull()
  expect(editorBounds).not.toBeNull()
  expect(dimensionsBounds).not.toBeNull()
  expect(cursorPositionBounds).not.toBeNull()
  expect(footerBounds).not.toBeNull()
  expect(dimensionsBounds!.x).toBeGreaterThanOrEqual(editorBounds!.x)
  expect(dimensionsBounds!.x).toBeGreaterThanOrEqual(panelBounds!.x + panelBounds!.width)
  expect(dimensionsBounds!.y + dimensionsBounds!.height).toBeLessThan(cursorPositionBounds!.y)
  expect(footerBounds!.y + footerBounds!.height).toBeLessThanOrEqual(panelBounds!.y + panelBounds!.height)
  await expect(page.locator('.breadcrumb')).toHaveCount(0)
  await expect(page.locator('.left-panel')).toHaveJSProperty('scrollHeight', await page.locator('.left-panel').evaluate((element) => element.clientHeight))
  await expect(page.locator('.room-nav-list')).toHaveCount(0)
})

test('uses scrollable dropdowns for placed items while keeping add controls visible', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 620 })
  await page.goto('/')

  const addFurniture = page.getByRole('button', { name: 'Add furniture' }).first()
  const addDoor = page.getByRole('button', { name: 'Add door' })
  const addWindow = page.getByRole('button', { name: 'Add window' })

  const fixedPositionsBefore = await Promise.all([addFurniture, addDoor, addWindow].map((button) =>
    button.evaluate((element) => element.getBoundingClientRect().y)))
  for (let index = 0; index < 10; index += 1) {
    await addFurniture.click()
    await page.getByRole('menuitem', { name: /Sofa/ }).click()
  }

  const objectsSelect = page.getByRole('combobox', { name: 'Placed objects' })
  await objectsSelect.click()
  const objectOptions = page.getByRole('listbox', { name: 'Placed objects' })
  await expect(objectOptions.getByRole('option')).toHaveCount(16)
  await expect.poll(() => objectOptions.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  await expect(addFurniture).toBeVisible()
  await expect(addDoor).toBeVisible()
  await expect(addWindow).toBeVisible()
  const fixedPositionsAfter = await Promise.all([addFurniture, addDoor, addWindow].map((button) =>
    button.evaluate((element) => element.getBoundingClientRect().y)))
  expect(fixedPositionsAfter).toEqual(fixedPositionsBefore)
  await objectsSelect.press('Escape')
  await expect(page.locator('.left-panel')).toHaveJSProperty('scrollHeight', await page.locator('.left-panel').evaluate((element) => element.clientHeight))
})

test('changes the shape of a room created from the form', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New room', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Create a room' })
  await dialog.getByRole('textbox', { name: 'Room name' }).fill('Shape test')
  await dialog.getByRole('button', { name: 'Create room' }).click()

  const shapeSelect = page.getByRole('combobox', { name: 'Room shape' })
  await expect(shapeSelect).toHaveText('Rectangle')
  await shapeSelect.click()
  await page.getByRole('option', { name: 'L-shaped' }).click()
  await expect(shapeSelect).toHaveText('L-shaped')
  await expect(page.locator('.right-panel').getByRole('textbox', { name: 'Room name' })).toHaveCount(0)
  const openingsSelect = page.getByRole('combobox', { name: 'Placed doors and windows' })
  await openingsSelect.click()
  await expect(page.getByRole('listbox', { name: 'Placed doors and windows' }).getByRole('option')).toHaveCount(1)
})

test('edits the outline of a form-created room by dragging a corner', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New room', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Create a room' })
  await dialog.getByRole('textbox', { name: 'Room name' }).fill('Editable room')
  await dialog.getByRole('button', { name: 'Create room' }).click()
  await openRoomInspector(page)
  const editButton = page.getByRole('button', { name: 'Edit room' })
  await editButton.click()

  const canvas = page.locator('canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('Canvas did not have a bounding box')
  const { offsetX, offsetY } = roomCanvasTransform(bounds)
  const corner = {
    x: bounds.x + offsetX,
    y: bounds.y + offsetY,
  }
  await page.mouse.move(corner.x, corner.y)
  await page.mouse.down()
  await page.mouse.move(corner.x + 30, corner.y + 20, { steps: 4 })
  await page.mouse.up()
  const editedRoom = await page.evaluate(() => JSON.parse(localStorage.getItem('roomform-project') ?? '{}').state.room)
  expect(editedRoom.shape).toBe('polygon')
  expect(editedRoom.boundary[0].start.x).toBeGreaterThan(0)
  expect(editedRoom.boundary[0].start.y).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'Finish editing room' })).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  const undoneRoom = await page.evaluate(() => JSON.parse(localStorage.getItem('roomform-project') ?? '{}').state.room)
  expect(undoneRoom.shape).toBe('rectangle')
  expect(undoneRoom.boundary[0].start).toEqual({ x: 0, y: 0 })
})

test('moves restriction zones by dragging them on the canvas', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New room', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Create a room' })
  await dialog.getByRole('textbox', { name: 'Room name' }).fill('Zone room')
  await dialog.getByRole('button', { name: 'Create room' }).click()
  await openRoomInspector(page)
  await page.getByRole('button', { name: 'Add restriction zone' }).click()
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('roomform-project') ?? '{}').state.zones[0].boundary)

  const canvas = page.locator('canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('Canvas did not have a bounding box')
  const { scale, offsetX, offsetY } = roomCanvasTransform(bounds)
  const center = { x: bounds.x + offsetX + 260 * scale, y: bounds.y + offsetY + 195 * scale }
  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await page.mouse.move(center.x + 35, center.y - 25, { steps: 4 })
  await page.mouse.up()
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('roomform-project') ?? '{}').state.zones[0].boundary)
  expect(after[0].x).toBeGreaterThan(before[0].x)
  expect(after[0].y).toBeLessThan(before[0].y)
  await page.getByRole('button', { name: 'Undo' }).click()
  const undone = await page.evaluate(() => JSON.parse(localStorage.getItem('roomform-project') ?? '{}').state.zones[0].boundary)
  expect(undone).toEqual(before)
})

test('runs the room optimizer, previews a suggestion, and applies it', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 768 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Optimize layout' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Optimize layout' }).click()
  const dialog = page.getByRole('dialog', { name: 'Find a better layout' })
  await expect(dialog.getByRole('combobox', { name: 'Optimization goal' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Optimize room' })).toHaveCount(0)
  await expect(dialog.getByText('OBJECTS IN LAYOUTS')).toBeVisible({ timeout: 20000 })
  await expect(dialog.locator('.score-summary')).toHaveCount(0)
  const furnitureLegend = dialog.locator('.suggestion-preview-legend')
  await expect(furnitureLegend).toHaveCount(1)
  await expect(furnitureLegend).toBeVisible()
  expect((await furnitureLegend.boundingBox())?.height).toBeGreaterThan(20)
  await expect(furnitureLegend.locator('.suggestion-preview-name > span:last-child')).toHaveText([
    'Queen bed',
    'Nightstand',
    'Wardrobe',
    'Writing desk',
    'Desk chair',
    'Armchair',
  ])
  await page.setViewportSize({ width: 1600, height: 500 })
  for (const [mode, label] of [['balanced', 'Balanced'], ['natural', 'Natural'], ['free-space', 'Max free space']]) {
    const cards = dialog.locator(`.suggestion-card[data-mode="${mode}"]`)
    expect(await cards.count()).toBeGreaterThanOrEqual(3)
    expect(await cards.count()).toBeLessThanOrEqual(3)
    const column = dialog.locator(`section[aria-label="${label} layouts"]`)
    await expect(column.locator('.optimizer-mode-heading strong')).toHaveText(label)
    await expect(column.locator('.optimizer-mode-heading')).toContainText('layout')
    expect(await column.evaluate((element) => getComputedStyle(element).borderRadius)).not.toBe('0px')
    await expect(cards.first().locator('.suggestion-recommended')).toHaveText('TOP PICK')
    await expect(cards.first().locator('.suggestion-preview-svg')).toHaveAttribute('role', 'img')
    await expect(cards.locator('.suggestion-preview-legend')).toHaveCount(0)
    await expect(cards.first().locator('.suggestion-preview-furniture-name')).toHaveCount(0)
    await expect(cards.first().locator('.suggestion-metrics')).toContainText('floor free')
    const scoreLabel = (await cards.first().locator('.suggestion-rating > strong').textContent()) ?? ''
    expect(scoreLabel).toMatch(/^\d+%$/)
    const score = Number.parseFloat(scoreLabel)
    expect(score).toBeGreaterThan(1)
    expect(score).toBeLessThanOrEqual(100)
  }
  const suggestionColumns = dialog.locator('.suggestion-columns')
  expect(await suggestionColumns.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3)
  const header = dialog.locator('.modal-header')
  const footer = dialog.locator('.optimizer-modal-footer')
  const headerY = await header.evaluate((element) => element.getBoundingClientRect().y)
  const footerY = await footer.evaluate((element) => element.getBoundingClientRect().y)
  const scrollList = dialog.locator('.suggestion-scroll')
  await scrollList.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect.poll(() => scrollList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await expect.poll(() => dialog.evaluate((element) => element.scrollHeight === element.clientHeight)).toBe(true)
  expect(await header.evaluate((element) => element.getBoundingClientRect().y)).toBe(headerY)
  expect(await footer.evaluate((element) => element.getBoundingClientRect().y)).toBe(footerY)
  await page.setViewportSize({ width: 500, height: 700 })
  await expect.poll(() => suggestionColumns.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1)
  const firstSuggestion = dialog.locator('.suggestion-card').first()
  await firstSuggestion.locator('.suggestion-preview-button').click()
  await expect(firstSuggestion).toHaveClass(/is-selected/)
  await expect(firstSuggestion.locator('.suggestion-preview-svg')).toHaveAttribute('role', 'img')
  await dialog.locator('.modal-actions').getByRole('button', { name: /Apply layout/ }).click()
  await expect(dialog).toBeHidden()
})

test('draws a freeform room outline from canvas points', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your rooms' })).toBeVisible()
  await expect(page.getByText('ADD OBJECTS')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add door' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add window' })).toBeVisible()
  await expect(page.getByText('ADD OBJECTS')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Add furniture' }).first()).toBeVisible()
  const furnitureButton = page.getByRole('button', { name: 'Add furniture' }).first()
  const doorButton = page.getByRole('button', { name: 'Add door' })
  await expect.poll(async () => Promise.all([
    furnitureButton.evaluate((element) => getComputedStyle(element).height),
    doorButton.evaluate((element) => getComputedStyle(element).height),
    furnitureButton.evaluate((element) => getComputedStyle(element).borderRadius),
    doorButton.evaluate((element) => getComputedStyle(element).borderRadius),
  ])).toEqual(['35px', '35px', '7px', '7px'])
  await page.getByRole('button', { name: 'New room', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Create a room' })
  await dialog.getByRole('textbox', { name: 'Room name' }).fill('Freeform room')
  await dialog.getByRole('button', { name: 'Draw it myself' }).click()
  await expect(dialog.getByRole('button', { name: 'Draw it myself' })).toHaveCSS('display', 'flex')
  await dialog.getByRole('button', { name: 'Start drawing' }).click()

  const canvas = page.locator('canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('Canvas did not have a bounding box')
  const { scale, offsetX, offsetY } = roomCanvasTransform(bounds)
  const drawingInteriorPixel = await canvas.evaluate((element, point) => {
    const context = element.getContext('2d')
    if (!context) return null
    const pixel = context.getImageData(point.x, point.y, 1, 1).data
    return Array.from(pixel).slice(0, 3)
  }, { x: Math.round(offsetX + 55 * scale), y: Math.round(offsetY + 55 * scale) })
  const canvasBackgroundPixel = await canvas.evaluate((element) => {
    const context = element.getContext('2d')
    if (!context) return null
    return Array.from(context.getImageData(1, 1, 1, 1).data).slice(0, 3)
  })
  expect(drawingInteriorPixel).not.toBeNull()
  expect(canvasBackgroundPixel).not.toBeNull()
  expect(drawingInteriorPixel?.every((channel, index) => Math.abs(channel - (canvasBackgroundPixel?.[index] ?? 0)) <= 10)).toBe(true)
  const points = [{ x: 80, y: 70 }, { x: 420, y: 70 }, { x: 420, y: 320 }, { x: 80, y: 320 }]
  await page.mouse.move(bounds.x + offsetX + points[0].x * scale, bounds.y + offsetY + points[0].y * scale)
  await expect(page.locator('.canvas-coordinates')).toContainText('X 80 cm')
  await page.mouse.click(bounds.x + offsetX + points[0].x * scale, bounds.y + offsetY + points[0].y * scale)
  await page.mouse.move(bounds.x + offsetX + points[1].x * scale, bounds.y + offsetY + points[1].y * scale)
  await expect(canvas).toHaveAttribute('aria-label', /live segment: 340 cm/)
  await expect(page.locator('.canvas-coordinates')).toContainText('X 420 cm')
  await page.mouse.click(bounds.x + offsetX + points[1].x * scale, bounds.y + offsetY + points[1].y * scale)
  for (const point of points.slice(2)) {
    await page.mouse.click(bounds.x + offsetX + point.x * scale, bounds.y + offsetY + point.y * scale)
  }

  const firstPoint = { x: bounds.x + offsetX + 80 * scale, y: bounds.y + offsetY + 70 * scale }
  await page.mouse.move(firstPoint.x, firstPoint.y)
  await expect(canvas).toHaveCSS('cursor', 'grab')
  await page.mouse.down()
  await expect(canvas).toHaveCSS('cursor', 'grabbing')
  await page.mouse.move(firstPoint.x - 20 * scale, firstPoint.y - 20 * scale, { steps: 4 })
  await expect(canvas).toHaveAttribute('aria-label', /Segment lengths:/)
  await page.mouse.up()
  await page.getByRole('button', { name: 'Finish room' }).click()
  await expect(page.locator('.room-name-label')).toHaveText('Freeform room')
  await expect(page.getByRole('spinbutton', { name: 'Width in cm' }).first()).toHaveValue('360')
  const openingsSelect = page.getByRole('combobox', { name: 'Placed doors and windows' })
  await openingsSelect.click()
  await expect(page.getByRole('listbox', { name: 'Placed doors and windows' }).getByRole('option')).toHaveCount(1)
  await openingsSelect.press('Escape')
  await page.getByRole('combobox', { name: 'Choose room' }).click()
  await expect(page.getByRole('option', { name: 'Freeform room', exact: true })).toBeVisible()
})

test('moves a door along its wall by dragging', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 768 })
  await page.goto('/')
  const canvas = page.locator('canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('Canvas did not have a bounding box')
  const { scale, offsetX, offsetY } = roomCanvasTransform(bounds)
  const start = { x: bounds.x + offsetX + (520 - 115) * scale, y: bounds.y + offsetY + 390 * scale }
  const end = { x: start.x - 80 * scale, y: start.y }

  const arcPoint = { x: bounds.x + offsetX + 410 * scale, y: bounds.y + offsetY + 355 * scale }
  await page.mouse.move(arcPoint.x, arcPoint.y)
  await expect(canvas).toHaveCSS('cursor', 'grab')
  await page.mouse.click(arcPoint.x, arcPoint.y)
  await expect(page.getByRole('heading', { name: 'Door 1' })).toBeVisible()
  const angleValue = page.getByRole('spinbutton', { name: 'Door opening angle in degrees' })
  const degreeSuffix = page.locator('.door-angle-input small')
  const valueBounds = await angleValue.boundingBox()
  const suffixBounds = await degreeSuffix.boundingBox()
  expect(valueBounds).not.toBeNull()
  expect(suffixBounds).not.toBeNull()
  expect(suffixBounds!.x).toBeGreaterThanOrEqual(valueBounds!.x + valueBounds!.width - 1)
  expect(suffixBounds!.x).toBeLessThan(valueBounds!.x + valueBounds!.width + 12)

  const leafPoint = { x: bounds.x + offsetX + 450 * scale, y: bounds.y + offsetY + 345 * scale }
  await page.mouse.move(leafPoint.x, leafPoint.y)
  await expect(canvas).toHaveCSS('cursor', 'grab')
  await page.mouse.move(start.x, start.y)
  await expect(canvas).toHaveCSS('cursor', 'grab')
  await page.mouse.click(start.x, start.y)
  await expect(page.getByRole('combobox', { name: 'Opening wall' })).toHaveCount(0)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByRole('heading', { name: 'Door 1' })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Offset in cm' })).toHaveValue('150')
  await expect(page.getByRole('spinbutton', { name: 'Door opening angle in degrees' })).toHaveAttribute('max', '180')
  await expect(page.getByRole('combobox', { name: 'Door opening direction' })).toHaveText('Into room')
  const directionControl = page.getByRole('combobox', { name: 'Door opening direction' })
  const directionBounds = await directionControl.boundingBox()
  if (!directionBounds) throw new Error('Door direction control did not have a bounding box')
  await page.mouse.click(directionBounds.x + directionBounds.width - 5, directionBounds.y + directionBounds.height / 2)
  await expect(page.getByRole('listbox', { name: 'Door opening direction' })).toBeVisible()
  await page.getByRole('option', { name: 'Out of room' }).click()
  const swingAngle = page.getByRole('spinbutton', { name: 'Door opening angle in degrees' })
  await expect(swingAngle).toHaveAttribute('max', '180')
  await swingAngle.fill('210')
  await swingAngle.press('Enter')
  await expect(swingAngle).toHaveValue('180')
  await page.getByRole('combobox', { name: 'Door opening direction' }).click()
  await page.getByRole('option', { name: 'Into room' }).click()
})

test('moves an opening to another wall by dragging', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 768 })
  await page.goto('/')
  const canvas = page.locator('canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('Canvas did not have a bounding box')
  const { scale, offsetX, offsetY } = roomCanvasTransform(bounds)
  const start = { x: bounds.x + offsetX + (520 - 115) * scale, y: bounds.y + offsetY + 390 * scale }
  const target = { x: bounds.x + offsetX + 520 * scale, y: bounds.y + offsetY + 195 * scale }

  await page.mouse.move(start.x, start.y)
  await expect(canvas).toHaveCSS('cursor', 'grab')
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 8 })
  await page.mouse.up()

  await expect(page.getByRole('heading', { name: 'Door 1' })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Offset in cm' })).toHaveValue('150')
  await expect(page.getByRole('combobox', { name: 'Opening wall' })).toHaveCount(0)
  const editorState = await page.evaluate(() => JSON.parse(localStorage.getItem('roomform-project') ?? '{}').state)
  expect(editorState.openings[0].wallSegmentId).toBe(editorState.room.boundary[1].id)
})

test('adds doors and restriction zones, then exports and imports a project', async ({ page }) => {
  await page.goto('/')
  await openRoomInspector(page)
  await expect(page.locator('.room-dimension-fields .editable-number > span:first-child')).toHaveText([
    'Width',
    'Depth',
    'Ceiling height',
  ])
  await expect(page.getByText('Measurements are stored in centimeters.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Add door' }).click()
  await expect(page.getByRole('heading', { name: 'Door 2' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Door name' })).toHaveValue('Door 2')
  await expect(page.locator('.opening-measurements .editable-number > span:first-child')).toHaveText([
    'Width',
    'Height',
    'Offset',
  ])
  const hingeControl = page.getByRole('combobox', { name: 'Door hinge side' })
  await expect(hingeControl).toHaveText('Left')
  await hingeControl.focus()
  await hingeControl.press('ArrowDown')
  await hingeControl.press('ArrowDown')
  await hingeControl.press('Enter')
  await expect(hingeControl).toHaveText('Right')
  await expect(page.getByRole('combobox', { name: 'Door opening direction' })).toHaveText('Into room')
  await expect(page.getByRole('spinbutton', { name: 'Door opening angle in degrees' })).toHaveValue('90')
  const angleInput = page.getByRole('spinbutton', { name: 'Door opening angle in degrees' })
  await angleInput.fill('45')
  await page.locator('canvas').click({ position: { x: 10, y: 10 } })
  await expect(page.getByRole('spinbutton', { name: 'Door opening angle in degrees' })).toHaveCount(0)
  const savedAngle = await page.evaluate(() => JSON.parse(localStorage.getItem('roomform-project') ?? '{}').state.openings.at(-1).swingAngleDeg)
  expect(savedAngle).toBe(45)
  await openRoomInspector(page)
  await expect(page.getByRole('button', { name: 'Add window' })).toBeVisible()
  const zoneDropdown = page.getByRole('combobox', { name: 'New zone type' })
  const zoneTriggerWidth = await zoneDropdown.evaluate((element) => element.getBoundingClientRect().width)
  expect(zoneTriggerWidth).toBeGreaterThan(100)
  const zoneBounds = await zoneDropdown.boundingBox()
  if (!zoneBounds) throw new Error('Zone type dropdown did not have a bounding box')
  await page.mouse.click(zoneBounds.x + zoneBounds.width - 5, zoneBounds.y + zoneBounds.height / 2)
  await expect(page.getByRole('listbox', { name: 'New zone type' })).toBeVisible()
  await page.getByRole('option', { name: 'Forbidden' }).click()
  await page.getByRole('button', { name: 'Add restriction zone' }).click()
  await expect(page.getByRole('heading', { name: 'Restriction zone' })).toBeVisible()
  await expect(page.locator('.canvas-toolbar .validation-badge')).toHaveCount(0)
  const placementIssues = page.getByRole('status', { name: 'Placement issues' })
  await expect(placementIssues).toBeVisible()
  await expect(placementIssues).toContainText('Inside forbidden zone')
  await expect(page.locator('.right-panel .validation-list')).toHaveCount(0)
  await placementIssues.getByRole('button', { name: /Placement issues/ }).click()
  await expect(placementIssues.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  await expect(placementIssues).not.toContainText('Inside forbidden zone')
  await placementIssues.getByRole('button').click()
  await expect(placementIssues).toContainText('Inside forbidden zone')
  const zoneWidth = page.getByRole('spinbutton', { name: 'Width in cm' })
  await zoneWidth.fill('160')
  await openRoomInspector(page)
  const savedZoneWidth = await page.evaluate(() => {
    const boundary = JSON.parse(localStorage.getItem('roomform-project') ?? '{}').state.zones[0].boundary
    return Math.max(...boundary.map((point: { x: number }) => point.x)) - Math.min(...boundary.map((point: { x: number }) => point.x))
  })
  expect(savedZoneWidth).toBe(160)
  await expect(page.getByRole('button', { name: /Forbidden zone/ }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Import and export' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export project JSON' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toContain('.roomize.json')

  await page.getByRole('button', { name: 'Import and export' }).click()
  const pngPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export room as PNG' }).click()
  expect((await pngPromise).suggestedFilename()).toContain('.png')

  const projectFile = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('roomform-project') ?? '{}').state
    return JSON.stringify({
      schemaVersion: 1,
      id: state.room.id,
      name: 'Imported studio',
      room: { ...state.room, name: 'Imported studio' },
      furniture: state.furniture,
      openings: state.openings,
      zones: state.zones,
    })
  })
  await page.getByRole('button', { name: 'Import and export' }).click()
  await page.getByRole('menuitem', { name: 'Import project JSON' }).click()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'studio.roomform.json',
    mimeType: 'application/json',
    buffer: Buffer.from(projectFile),
  })
  await expect(page.locator('.room-name-label')).toHaveText('Imported studio')
})

test('zooms, resets the canvas view, and resizes furniture with a handle', async ({ page }) => {
  await page.goto('/')
  const zoomLabel = page.locator('.zoom-indicator')
  const unitPicker = page.getByRole('combobox', { name: 'Measurement units' })
  const optimizeButton = page.getByRole('button', { name: 'Optimize layout' })
  const unitBounds = await unitPicker.boundingBox()
  const optimizeBounds = await optimizeButton.boundingBox()
  expect(unitBounds).not.toBeNull()
  expect(optimizeBounds).not.toBeNull()
  expect(unitBounds!.x).toBeLessThan(optimizeBounds!.x)
  expect(optimizeBounds!.x + optimizeBounds!.width).toBeCloseTo(
    (await page.locator('.canvas-toolbar').boundingBox())!.x + (await page.locator('.canvas-toolbar').boundingBox())!.width - 16,
    0,
  )
  const resetViewButton = page.getByRole('button', { name: 'Reset canvas view' })
  await expect(resetViewButton.locator('..')).toHaveClass(/view-controls/)
  await expect(page.locator('.zoom-controls button')).toHaveCount(2)
  expect(await page.locator('.zoom-controls button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))))
    .toEqual(['Zoom out', 'Zoom in'])
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(zoomLabel).toHaveText('120%')

  const canvas = page.locator('canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('Canvas did not have a bounding box')
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.wheel(0, -100)
  await expect(zoomLabel).not.toHaveText('120%')
  await resetViewButton.click()
  await expect(zoomLabel).toHaveText('100%')

  const { scale, offsetX, offsetY } = roomCanvasTransform(bounds)
  const dimensionsBounds = await page.locator('.canvas-room-summary').boundingBox()
  expect(dimensionsBounds).not.toBeNull()
  expect(520 * scale).toBeGreaterThan(bounds.width * 0.4)
  const roomLeft = bounds.x + offsetX
  if (bounds.width >= 1000) {
    expect(roomLeft).toBeGreaterThanOrEqual(dimensionsBounds!.x + dimensionsBounds!.width)
  } else {
    expect(bounds.y + offsetY + 390 * scale).toBeLessThan(dimensionsBounds!.y)
  }
  const center = { x: bounds.x + offsetX + 210 * scale, y: bounds.y + offsetY + 190 * scale }
  await page.mouse.click(center.x, center.y)
  await expect(page.getByRole('heading', { name: 'Furniture' })).toBeVisible()

  const handle = { x: center.x + 80 * scale + 5, y: center.y + 105 * scale + 5 }
  await page.mouse.move(handle.x, handle.y)
  await expect(canvas).toHaveCSS('cursor', 'nwse-resize')
  await page.mouse.down()
  await page.mouse.move(handle.x + 35, handle.y + 25, { steps: 4 })
  await expect(canvas).toHaveCSS('cursor', 'nwse-resize')
  await page.mouse.up()
  await expect(page.getByRole('spinbutton', { name: 'Width in cm' })).not.toHaveValue('160')
})
