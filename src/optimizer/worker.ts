import { optimizeLayout } from './engine'
import type { WorkerMessage, WorkerResponse } from './types'

self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const message = event.data
  if (message.type !== 'run') return

  try {
    const result = optimizeLayout(message.request, {
      onProgress: (progress) => {
        const response: WorkerResponse = { type: 'progress', requestId: message.requestId, progress }
        self.postMessage(response)
      },
    })
    const response: WorkerResponse = { type: 'done', requestId: message.requestId, result }
    self.postMessage(response)
  } catch (error) {
    const response: WorkerResponse = {
      type: 'error',
      requestId: message.requestId,
      message: error instanceof Error ? error.message : 'Optimization failed unexpectedly.',
    }
    self.postMessage(response)
  }
})
