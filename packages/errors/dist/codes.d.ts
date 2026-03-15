export declare const ErrorCodes: {
    readonly UNAUTHORIZED: "AUTH_001";
    readonly FORBIDDEN: "AUTH_002";
    readonly INVALID_CREDENTIALS: "AUTH_003";
    readonly SESSION_EXPIRED: "AUTH_004";
    readonly USER_NOT_FOUND: "AUTH_005";
    readonly ORG_NOT_FOUND: "AUTH_006";
    readonly PROJECT_NOT_FOUND: "PROJ_001";
    readonly ISSUE_NOT_FOUND: "PROJ_002";
    readonly PR_NOT_FOUND: "PROJ_003";
    readonly DEPLOY_TARGET_NOT_FOUND: "DEPL_001";
    readonly DEPLOY_FORBIDDEN: "DEPL_002";
    readonly DEPLOY_SPEC_INVALID: "DEPL_003";
    readonly CHANNEL_NOT_FOUND: "CHAT_001";
    readonly MESSAGE_NOT_FOUND: "CHAT_002";
    readonly VALIDATION_ERROR: "GEN_001";
    readonly INTERNAL_ERROR: "GEN_002";
    readonly NOT_FOUND: "GEN_003";
    readonly CONFLICT: "GEN_004";
};
export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
//# sourceMappingURL=codes.d.ts.map