import crypto from 'crypto';

const PAYSTACK_API = 'https://api.paystack.co';

function secretKey() {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    const err = new Error('Paystack is not configured');
    err.status = 503;
    throw err;
  }
  return process.env.PAYSTACK_SECRET_KEY;
}

async function paystackRequest(path, options = {}) {
  const response = await fetch(`${PAYSTACK_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === false) {
    const err = new Error(payload.message || 'Paystack request failed');
    err.status = response.status >= 500 ? 502 : 422;
    err.providerResponse = payload;
    throw err;
  }
  return payload;
}

export function initializePaystackTransaction(input) {
  return paystackRequest('/transaction/initialize', { method: 'POST', body: JSON.stringify(input) });
}

export function verifyPaystackTransaction(reference) {
  return paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export function createPaystackRefund(input) {
  return paystackRequest('/refund', { method: 'POST', body: JSON.stringify(input) });
}

export function isValidPaystackSignature(rawBody, signature) {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY || !Buffer.isBuffer(rawBody)) return false;
  const expected = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
  const received = String(signature);
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export function webhookEventKey(rawBody) {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}
