import http from 'k6/http';
import { sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL } from '../config/env.js';
import { authHeaders } from './auth.js';
import { checkTransaction } from './checks.js';

// Deadlock = two transactions touch the same account at the same moment and the
// database cancels one of them, saying "try again". This happens when many flows
// run together (phase p3). We retry up to 2 times instead of failing, and count
// each deadlock in a "deadlocks" metric so the problem still shows up in the report.
const MAX_RETRIES = 2;
export const deadlocks = new Counter('deadlocks');

// The API returns 500 with "Deadlock" in the body when this happens.
function isDeadlock(res) {
  return res.status === 500 && typeof res.body === 'string' && res.body.includes('Deadlock');
}

// One shared function that sends any transaction (deposit / sendmoney / payment):
//   send request -> if deadlock, wait a bit and retry -> run the checks on the final response.
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
        // Tells k6 which statuses are "OK". A deadlock (500) that we will retry
        // should not count as a failed request; only the last attempt must be 201.
        responseCallback: last ? http.expectedStatuses(201) : http.expectedStatuses(201, 500),
      },
    );
    if (last || !isDeadlock(res)) break; // success, a real error, or out of retries
    deadlocks.add(1, tags);
    sleep(0.05 * (attempt + 1) + Math.random() * 0.05); // short random wait so both sides don't clash again
  }
  checkTransaction(res, api, extraTags);
  return res;
}

// Simple wrappers so tests read like the scenario: deposit(...), sendMoney(...), payment(...).
export function deposit(token, from, to, amount, tags) {
  return transact('deposit', token, from, to, amount, tags);
}

export function sendMoney(token, from, to, amount, tags) {
  return transact('sendmoney', token, from, to, amount, tags);
}

export function payment(token, from, to, amount, tags) {
  return transact('payment', token, from, to, amount, tags);
}

// Reads a user's current balance (used by smoke tests to compare before/after).
export function getBalance(token, phone) {
  const res = http.get(`${BASE_URL}/transaction/balance/${phone}`, {
    headers: authHeaders(token),
    tags: { api: 'balance' },
  });
  return res.json('balance');
}
