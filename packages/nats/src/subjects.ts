export const Subjects = {
  // Auth
  AUTH_USER_CREATED:          'auth.user.created',
  AUTH_USER_UPDATED:          'auth.user.updated',
  AUTH_ROLE_ASSIGNED:         'auth.role.assigned',
  AUTH_USER_INVITED:          'auth.user.invited',

  // Project
  PROJECT_CREATED:            'project.created',
  PROJECT_ISSUE_CREATED:      'project.issue.created',
  PROJECT_ISSUE_UPDATED:      'project.issue.updated',
  PROJECT_ISSUE_CLOSED:       'project.issue.closed',
  PROJECT_PR_OPENED:          'project.pr.opened',
  PROJECT_PR_MERGED:          'project.pr.merged',
  PROJECT_PR_CLOSED:          'project.pr.closed',
  PROJECT_PIPELINE_STARTED:   'project.pipeline.started',
  PROJECT_PIPELINE_PASSED:    'project.pipeline.passed',
  PROJECT_PIPELINE_FAILED:    'project.pipeline.failed',

  // Deploy
  DEPLOY_STARTED:             'deploy.started',
  DEPLOY_STEP_COMPLETED:      'deploy.step.completed',
  DEPLOY_SUCCEEDED:           'deploy.succeeded',
  DEPLOY_FAILED:              'deploy.failed',
  DEPLOY_APPROVAL_REQUIRED:   'deploy.approval.required',
  DEPLOY_ROLLED_BACK:         'deploy.rolled_back',

  // Sandbox
  SANDBOX_CREATED:            'sandbox.created',
  SANDBOX_STARTED:            'sandbox.started',
  SANDBOX_STOPPED:            'sandbox.stopped',
  SANDBOX_RESOURCE_SPIKE:     'sandbox.resource.spike',

  // Chat
  CHAT_MESSAGE_CREATED:       'chat.message.created',
  CHAT_MENTION_DETECTED:      'chat.mention.detected',
} as const

export type Subject = typeof Subjects[keyof typeof Subjects]
