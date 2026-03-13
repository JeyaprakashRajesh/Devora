import type { FastifyPluginAsync } from 'fastify'
import { config } from '../config.js'
import { startResourceMonitor } from '../subscribers/index.js'
import { PodService } from '../services/pod.service.js'
import { VolumeService } from '../services/volume.service.js'
import { WorkspaceService } from '../services/workspace.service.js'
import workspacesRoutes from './workspaces.js'
import proxyRoutes from './proxy.js'

export interface RegisterRoutesOptions {
  workspaceService?: WorkspaceService
  podService?: PodService
}

const registerRoutes: FastifyPluginAsync<RegisterRoutesOptions> = async (
  app,
  opts,
) => {
  const podService = opts.podService
    ?? new PodService(app.k8s.coreV1Api, app.k8s.namespace, app.log as any)

  const workspaceService = opts.workspaceService
    ?? new WorkspaceService(
      app.db,
      podService,
      new VolumeService(app.k8s.coreV1Api, app.k8s.namespace, app.log as any),
      app.nats,
      config,
      app.log as any,
    )

  const idleCleanupInterval = setInterval(async () => {
    try {
      const stopped = await workspaceService.stopIdle()
      if (stopped > 0) {
        app.log.info({ stopped }, 'Auto-stopped idle workspaces')
      }
    } catch (error) {
      app.log.error({ error }, 'Idle workspace cleanup failed')
    }
  }, 5 * 60 * 1000)

  app.addHook('onClose', async () => {
    clearInterval(idleCleanupInterval)
  })

  if ((app as any).k8s && (app as any).nats) {
    const stopResourceMonitor = startResourceMonitor(
      workspaceService,
      podService,
      app.nats,
      app.k8s.coreV1Api,
      app.k8s.namespace,
      app.log as any,
    )

    app.addHook('onClose', async () => {
      stopResourceMonitor()
    })
  }

  await app.register(workspacesRoutes, { workspaceService })
  await app.register(proxyRoutes, { workspaceService, podService })
}

export { registerRoutes }
export default registerRoutes
