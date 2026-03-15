import { ErrorCode } from './codes';
export declare class DevoraError extends Error {
    readonly code: ErrorCode;
    readonly statusCode: number;
    readonly details?: unknown | undefined;
    constructor(code: ErrorCode, message: string, statusCode?: number, details?: unknown | undefined);
}
export declare class NotFoundError extends DevoraError {
    constructor(resource: string, id?: string);
}
export declare class UnauthorizedError extends DevoraError {
    constructor(message?: string);
}
export declare class ForbiddenError extends DevoraError {
    constructor(message?: string);
}
export declare class ValidationError extends DevoraError {
    constructor(message: string, details?: unknown);
}
export declare class ConflictError extends DevoraError {
    constructor(message: string);
}
export { ErrorCodes } from './codes';
export type { ErrorCode } from './codes';
//# sourceMappingURL=index.d.ts.map