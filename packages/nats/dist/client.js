"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNatsClient = createNatsClient;
exports.publish = publish;
exports.subscribe = subscribe;
const nats_1 = require("nats");
const jc = (0, nats_1.JSONCodec)();
async function createNatsClient(url, logger) {
    const nc = await (0, nats_1.connect)({ servers: url });
    logger.info({ url }, 'Connected to NATS');
    return nc;
}
function publish(nc, subject, data) {
    nc.publish(subject, jc.encode(data));
}
function subscribe(nc, subject, handler) {
    const sub = nc.subscribe(subject);
    (async () => {
        for await (const msg of sub) {
            try {
                const data = jc.decode(msg.data);
                await handler(data);
            }
            catch (err) {
                // handler errors must not crash the subscription
            }
        }
    })();
}
//# sourceMappingURL=client.js.map