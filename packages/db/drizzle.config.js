"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    schema: './src/schema/*',
    out: './src/migrations',
    driver: 'pg',
    dbCredentials: {
        connectionString: process.env.DATABASE_URL || 'postgresql://devora:devora_dev@localhost:5432/devora',
    },
};
//# sourceMappingURL=drizzle.config.js.map