import type { ProjectData } from '../domain/models'
import { exportProjectJson, parseProjectJson } from '../persistence/project'

function download(contents: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function safeFilename(name: string, fallback: string): string {
  return name.trim().replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || fallback
}

export function downloadProjectJson(project: ProjectData): void {
  const filename = `${safeFilename(project.room.name, 'roomize-project')}.roomize.json`
  download(exportProjectJson(project), filename, 'application/json')
}

export function downloadRoomCanvasPng(canvas: HTMLCanvasElement, roomName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not create the PNG image.'))
        return
      }
      download(blob, `${safeFilename(roomName, 'roomize')}.png`, 'image/png')
      resolve()
    }, 'image/png')
  })
}

export async function parseProjectFile(file: File) {
  return parseProjectJson(await file.text())
}
