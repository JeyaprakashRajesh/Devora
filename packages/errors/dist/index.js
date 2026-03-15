"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCodes = exports.ConflictError = exports.ValidationError = exports.ForbiddenError = exports.UnauthorizedError = exports.NotFoundError = exports.DevoraError = void 0;
class DevoraError extends Error {
    code;
    statusCode;
    details;
    constructor(code, message, statusCode = 500, details) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.name = 'DevoraError';
    }
}
exports.DevoraError = DevoraError;
class NotFoundError extends DevoraError {
    constructor(resource, id) {
        super('GEN_003', `${resource}${id ? ` '${id}'` : ''} not found`, 404);
    }
}
exports.NotFoundError = NotFoundError;
class UnauthorizedError extends DevoraError {
    constructor(message = 'Unauthorized') {
        super('AUTH_001', message, 401);
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends DevoraError {
    constructor(message = 'Forbidden') {
        super('AUTH_002', message, 403);
    }
}
exports.ForbiddenError = ForbiddenError;
class ValidationError extends DevoraError {
    constructor(message, details) {
        super('GEN_001', message, 400, details);
    }
}
exports.ValidationError = ValidationError;
class ConflictError extends DevoraError {
    constructor(message) {
        super('GEN_004', message, 409);
    }
}
exports.ConflictError = ConflictError;
var codes_1 = require("./codes");
Object.defineProperty(exports, "ErrorCodes", { enumerable: true, get: function () { return codes_1.ErrorCodes; } });
//# sourceMappingURL=index.js.map