import http from 'k6/http';
import { sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL } from '../config/env.js';
import { authHeaders } from './auth.js';
import { checkTransaction } from './checks.js';

// MySQL aborts one side of a deadlock and asks the client to retry. Concurrent
// flows on shared accounts (phase p3) hit this; retry instead of failing, but
// count it so the server-side issue stays visible in the report.
const MAX_RETRIES = 2;
export const deadlocks = new Counter('deadlocks');

function isDeadlock(res) {
  return res.status === 500 && typeof res.body === 'string' && res.body.includes('Deadlock');
}

// Each request is tagged with its API name so metrics/thresholds can be split per API.
function transact(api, token, from, to, amount, extraTags = {}) {
  const tags = { api, ...extraTags };
  let res;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const last = attempt === MAX_RETRIES;
    res = http.post(
      `${BASE_URL}/transaction/${api}`,
      JSON.stringify({ from_account: from, to_account: to, amount }),
      {
        headers: authHeaders(token),
        tags,
        // A deadlocked attempt that will be retried is not a failed request.
        responseCallback: last ? http.expectedStatuses(201) : http.expectedStatuses(201, 500),
      },
    );
    if (last || !isDeadlock(res)) break;
    deadlocks.add(1, tags);
    sleep(0.05 * (attempt + 1) + Math.random() * 0.05);
  }
  checkTransaction(res, api, extraTags);
  return res;
}

export function deposit(token, from, to, amount, tags) {
  return transact('deposit', token, from, to, amount, tags);
}

export function sendMoney(token, from, to, amount, tags) {
  return transact('sendmoney', token, from, to, amount, tags);
}

export function payment(token, from, to, amount, tags) {
  return transact('payment', token, from, to, amount, tags);
}

export function getBalance(token, phone) {
  const res = http.get(`${BASE_URL}/transaction/balance/${phone}`, {
    headers: authHeaders(token),
    tags: { api: 'balance' },
  });
  return res.json('balance');
}
