import { connect, NatsConnection, JSONCodec } from 'nats'
import { Logger } from '@devora/logger'

const jc = JSONCodec()

export async function createNatsClient(url: string, logger: Logger): Promise<NatsConnection> {
  const nc = await connect({ servers: url })
  logger.info({ url }, 'Connected to NATS')
  return nc
}

export function publish<T>(nc: NatsConnection, subject: string, data: T): void {
  nc.publish(subject, jc.encode(data))
}

export function subscribe<T>(
  nc: NatsConnection,
  subject: string,
  handler: (data: T) => Promise<void>
): void {
  const sub = nc.subscribe(subject)
    ; (async () => {
      for await (const msg of sub) {
        try {
          const data = jc.decode(msg.data) as T
          await handler(data)
        } catch (err) {
          // handler errors must not crash the subscription
        }
      }
    })()
}
