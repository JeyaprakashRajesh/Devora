import { connect, JSONCodec } from 'nats'
import { Subjects } from '@devora/nats'

const codec = JSONCodec<unknown>()
const subjects = [
  Subjects.SANDBOX_CREATED,
  Subjects.SANDBOX_STARTED,
  Subjects.SANDBOX_STOPPED,
  Subjects.SANDBOX_RESOURCE_SPIKE,
] as const

async function main() {
  const natsUrl = process.env.NATS_URL ?? 'nats://localhost:4222'
  const nc = await connect({ servers: natsUrl })
  console.log(`Listening for sandbox events on ${natsUrl} for 60 seconds...`)

  for (const subject of subjects) {
    const subscription = nc.subscribe(subject)
    ;(async () => {
      for await (const message of subscription) {
        const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false })
        const payload = codec.decode(message.data)
        console.log(`[${timestamp}] ${subject} -> ${JSON.stringify(payload, null, 2)}`)
      }
    })()
  }

  await new Promise((resolve) => setTimeout(resolve, 60_000))
  await nc.drain()
  await nc.close()
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
