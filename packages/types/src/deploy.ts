export type DeployTargetType = 'self_hosted' | 'aws' | 'gcp' | 'azure' | 'hetzner' | 'digitalocean'
export type DeployEnvironment = 'dev' | 'staging' | 'production'
export type DeployStatus = 'pending' | 'building' | 'deploying' | 'live' | 'failed' | 'rolled_back'
export type DeployStrategy = 'rolling' | 'blue_green' | 'canary'

export interface DeployTarget {
  id: string
  orgId: string
  name: string
  type: DeployTargetType
  environment: DeployEnvironment
  createdBy: string
}

export interface Deployment {
  id: string
  projectId: string
  targetId: string
  triggeredBy: string
  commitSha?: string
  status: DeployStatus
  strategy: DeployStrategy
  approvedBy?: string
  startedAt?: Date
  finishedAt?: Date
}
