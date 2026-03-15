import * as schema from './schema/index.js';
export declare function createDb(connectionString: string): import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema>;
export type Db = ReturnType<typeof createDb>;
//# sourceMappingURL=client.d.ts.map