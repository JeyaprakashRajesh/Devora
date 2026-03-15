import { NatsConnection } from 'nats';
import { Logger } from '@devora/logger';
export declare function createNatsClient(url: string, logger: Logger): Promise<NatsConnection>;
export declare function publish<T>(nc: NatsConnection, subject: string, data: T): void;
export declare function subscribe<T>(nc: NatsConnection, subject: string, handler: (data: T) => Promise<void>): void;
//# sourceMappingURL=client.d.ts.map