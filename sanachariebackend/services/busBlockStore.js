// ETS holds a blocked ticket for 10 minutes. Expire our copy first so a
// payment cannot start against a supplier hold that is about to disappear.
const configuredTtlMinutes = Number.parseInt(process.env.BUS_BLOCK_TTL_MINUTES, 10);
const BUS_BLOCK_TTL_MS = Math.min(configuredTtlMinutes > 0 ? configuredTtlMinutes : 9, 9) * 60 * 1000;
const busBlockStore = new Map();

const normalizeBlockTicketKey = (value) => String(value || '').trim();

const pruneBusBlocks = () => {
  const now = Date.now();
  for (const [key, value] of busBlockStore.entries()) {
    if (value.expiresAt <= now) busBlockStore.delete(key);
  }
};

const getBusBlock = (blockTicketKey) => {
  pruneBusBlocks();
  const key = normalizeBlockTicketKey(blockTicketKey);
  return busBlockStore.get(key) || busBlockStore.get(key.toUpperCase()) || null;
};

const storeBusBlock = (blockTicketKey, metadata) => {
  const key = normalizeBlockTicketKey(blockTicketKey);
  if (!key) return null;
  pruneBusBlocks();
  const record = {
    ...metadata,
    blockTicketKey: key,
    createdAt: Date.now(),
    expiresAt: Date.now() + BUS_BLOCK_TTL_MS,
  };
  busBlockStore.set(key, record);
  busBlockStore.set(key.toUpperCase(), record);
  return record;
};

module.exports = { getBusBlock, normalizeBlockTicketKey, pruneBusBlocks, storeBusBlock };
