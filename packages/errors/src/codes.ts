export const ErrorCodes = {
  // Auth
  UNAUTHORIZED:           'AUTH_001',
  FORBIDDEN:              'AUTH_002',
  INVALID_CREDENTIALS:    'AUTH_003',
  SESSION_EXPIRED:        'AUTH_004',
  USER_NOT_FOUND:         'AUTH_005',
  ORG_NOT_FOUND:          'AUTH_006',
  // Project
  PROJECT_NOT_FOUND:      'PROJ_001',
  ISSUE_NOT_FOUND:        'PROJ_002',
  PR_NOT_FOUND:           'PROJ_003',
  // Deploy
  DEPLOY_TARGET_NOT_FOUND:'DEPL_001',
  DEPLOY_FORBIDDEN:       'DEPL_002',
  DEPLOY_SPEC_INVALID:    'DEPL_003',
  // Chat
  CHANNEL_NOT_FOUND:      'CHAT_001',
  MESSAGE_NOT_FOUND:      'CHAT_002',
  // Generic
  VALIDATION_ERROR:       'GEN_001',
  INTERNAL_ERROR:         'GEN_002',
  NOT_FOUND:              'GEN_003',
  CONFLICT:               'GEN_004',
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]
