"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
const pino_1 = __importDefault(require("pino"));
function createLogger(service) {
    return (0, pino_1.default)({
        name: service,
        level: process.env.LOG_LEVEL ?? 'info',
        ...(process.env.NODE_ENV === 'development'
            ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
            : {}),
        base: { service },
    });
}
//# sourceMappingURL=index.js.map