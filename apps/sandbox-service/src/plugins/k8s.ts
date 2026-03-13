import { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import {
  AppsV1Api,
  CoreV1Api,
  KubeConfig,
  V1Namespace,
} from '@kubernetes/client-node'
import { config } from '../config.js'

export interface K8sClients {
  coreV1Api: CoreV1Api
  appsV1Api: AppsV1Api
  namespace: string
}

declare module 'fastify' {
  interface FastifyInstance {
    k8s: K8sClients
  }
}

function resolveKubeconfigPath(kubeconfigPath?: string): string {
  if (!kubeconfigPath || kubeconfigPath.startsWith('~') === false) {
    return kubeconfigPath ?? ''
  }

  const home = process.env.USERPROFILE ?? process.env.HOME ?? ''
  return kubeconfigPath.replace('~', home)
}

async function ensureNamespace(coreV1Api: CoreV1Api, namespace: string, app: FastifyInstance) {
  try {
    await coreV1Api.readNamespace(namespace)
    app.log.info({ namespace }, 'Kubernetes namespace is available')
  } catch (error: any) {
    const statusCode = error?.response?.statusCode
    if (statusCode === 404) {
      const body: V1Namespace = {
        metadata: { name: namespace },
      }
      await coreV1Api.createNamespace(body)
      app.log.info({ namespace }, 'Created Kubernetes namespace')
      return
    }

    throw error
  }
}

async function k8sPluginImpl(app: FastifyInstance) {
  const kubeConfig = new KubeConfig()
  let coreV1Api: CoreV1Api
  let appsV1Api: AppsV1Api
  const kubeconfigPath = resolveKubeconfigPath(config.KUBECONFIG_PATH)

  try {
    if (config.K8S_IN_CLUSTER) {
      kubeConfig.loadFromCluster()
    } else {
      if (kubeconfigPath) {
        kubeConfig.loadFromFile(kubeconfigPath)
      } else {
        kubeConfig.loadFromDefault()
      }
    }

    coreV1Api = kubeConfig.makeApiClient(CoreV1Api)
    appsV1Api = kubeConfig.makeApiClient(AppsV1Api)
  } catch (error) {
    app.log.error(
      {
        error,
        inCluster: config.K8S_IN_CLUSTER,
        kubeconfigPath: kubeconfigPath || '<default>',
        failFast: config.K8S_FAIL_FAST,
      },
      'Kubernetes client initialization failed',
    )

    if (config.K8S_FAIL_FAST) {
      throw new Error(
        'Kubernetes is unavailable. Configure a valid kube context (for example kind-devora) before starting sandbox-service.',
      )
    }

    app.log.warn('K8S_FAIL_FAST is false; sandbox-service will run in degraded mode and workspace APIs may return 503')

    coreV1Api = new CoreV1Api()
    appsV1Api = new AppsV1Api()
  }

  app.decorate('k8s', {
    coreV1Api,
    appsV1Api,
    namespace: config.K8S_NAMESPACE,
  })

  try {
    await ensureNamespace(coreV1Api, config.K8S_NAMESPACE, app)
  } catch (error) {
    app.log.error({ error, namespace: config.K8S_NAMESPACE }, 'Unable to verify or create Kubernetes namespace')

    if (config.K8S_FAIL_FAST) {
      throw new Error(
        `Kubernetes namespace '${config.K8S_NAMESPACE}' is not reachable. Ensure cluster access before starting sandbox-service.`,
      )
    }

    app.log.warn('Continuing startup with namespace verification disabled because K8S_FAIL_FAST is false')
  }
}

export const k8sPlugin = fp(k8sPluginImpl, { name: 'sandbox-k8s-plugin' })
