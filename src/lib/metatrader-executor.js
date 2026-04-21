const crypto = require('crypto');

const SUPPORTED_PLATFORMS = new Set(['MT4', 'MT5']);
const SUPPORTED_DIRECTIONS = new Set(['BUY', 'SELL', 'BOTH']);

function normalizeDirection(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'B') {
    return 'BUY';
  }
  if (normalized === 'S') {
    return 'SELL';
  }
  if (SUPPORTED_DIRECTIONS.has(normalized)) {
    return normalized;
  }
  return '';
}

function normalizePlatform(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return SUPPORTED_PLATFORMS.has(normalized) ? normalized : 'MT5';
}

function normalizeOrderText(value) {
  return String(value || '').trim();
}

function buildTradeOrderId() {
  return `ORD_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function buildTradePayload(signal) {
  return {
    platform: signal.platform,
    symbol: signal.symbol,
    direction: signal.direction,
    lotSize: signal.lotSize,
    maxTrades: signal.maxTrades,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    comment: signal.comment,
    platformComment: normalizeOrderText(signal.platformComment),
    brokerName: signal.brokerName,
    accountNumber: signal.accountNumber,
    serverName: signal.serverName,
    assetClass: signal.assetClass,
    requestedAt: new Date().toISOString(),
    orderId: buildTradeOrderId(),
    source: 'futureea-web',
  };
}

const platformAdapters = {
  MT4: async (payload) => ({
    ok: true,
    broker: 'MT4',
    adapter: 'mock-mt4',
    orderId: payload.orderId,
    status: 'accepted',
    platformOrder: {
      platform: payload.platform,
      symbol: payload.symbol,
      direction: payload.direction,
      lotSize: payload.lotSize,
      stopLoss: payload.stopLoss,
      takeProfit: payload.takeProfit,
      comment: payload.comment,
    },
    sentAt: new Date().toISOString(),
  }),
  MT5: async (payload) => ({
    ok: true,
    broker: 'MT5',
    adapter: 'mock-mt5',
    orderId: payload.orderId,
    status: 'accepted',
    platformOrder: {
      platform: payload.platform,
      symbol: payload.symbol,
      direction: payload.direction,
      lotSize: payload.lotSize,
      stopLoss: payload.stopLoss,
      takeProfit: payload.takeProfit,
      comment: payload.comment,
    },
    sentAt: new Date().toISOString(),
  }),
};

function getActiveBrokerConnection(connections, platform) {
  if (!Array.isArray(connections)) {
    return null;
  }

  const normalizedPlatform = normalizePlatform(platform);
  const matching = connections.filter((item) => item.platform === normalizedPlatform);
  const candidates = matching.length ? matching : connections;

  return candidates
    .slice()
    .sort((a, b) => {
      const aTime = Date.parse(a.connectedAt || 0) || 0;
      const bTime = Date.parse(b.connectedAt || 0) || 0;
      return bTime - aTime;
    })
    .find((item) => String(item.status || '').toLowerCase() === 'connected');
}

function sanitizeConnection(connection) {
  if (!connection || typeof connection !== 'object') {
    return null;
  }

  return {
    id: String(connection.id || '').trim(),
    platform: normalizePlatform(connection.platform),
    brokerName: String(connection.brokerName || '').trim(),
    accountNumber: String(connection.accountNumber || '').trim(),
    serverName: String(connection.serverName || '').trim(),
    assetClass: String(connection.assetClass || 'Forex').trim(),
    status: String(connection.status || '').trim().toLowerCase() === 'connected' ? 'connected' : 'disconnected',
    connectedAt: String(connection.connectedAt || '').trim(),
    hasCredentials: Boolean(connection.passwordHash || connection.credentialsHash),
  };
}

async function executeSignal(signalInput) {
  const signal = {
    ...signalInput,
    platform: normalizePlatform(signalInput.platform),
    direction: normalizeDirection(signalInput.direction),
  };

  if (!signal.symbol) {
    return { ok: false, reason: 'Symbol required.' };
  }

  if (!SUPPORTED_DIRECTIONS.has(signal.direction)) {
    return { ok: false, reason: 'Invalid direction.' };
  }

  const connection = sanitizeConnection(signal.connection);
  if (!connection || !connection.platform || !connection.brokerName) {
    return { ok: false, reason: 'Broker connection is not valid.' };
  }

  const payload = buildTradePayload({
    platform: connection.platform,
    symbol: signal.symbol,
    direction: signal.direction,
    lotSize: signal.lotSize,
    maxTrades: signal.maxTrades,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    comment: signal.comment,
    platformComment: signal.platformComment,
    brokerName: connection.brokerName,
    accountNumber: connection.accountNumber,
    serverName: connection.serverName,
    assetClass: connection.assetClass,
  });

  const adapter = platformAdapters[payload.platform];
  if (!adapter) {
    return { ok: false, reason: `Unsupported platform: ${signal.platform}` };
  }

  const result = await adapter(payload);
  return { ok: true, result, payload, platform: payload.platform };
}

module.exports = {
  SUPPORTED_PLATFORMS: [...SUPPORTED_PLATFORMS],
  SUPPORTED_DIRECTIONS,
  normalizeDirection,
  normalizePlatform,
  sanitizeConnection,
  getActiveBrokerConnection,
  executeSignal,
};
