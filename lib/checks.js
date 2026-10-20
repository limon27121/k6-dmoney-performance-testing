import { check } from 'k6';

// What a good transaction response looks like: HTTP 201 + the right message per API.
const EXPECTED_STATUS = 201;
const SUCCESS_MESSAGES = {
  deposit: 'Deposit successful',
  sendmoney: 'Send money successful',
  payment: 'Payment successful',
};

// Read the response as JSON. If the body is not JSON (e.g. HTML error page),
// return {} so the checks below just fail instead of crashing the test.
function body(res) {
  try {
    return res.json();
  } catch (e) {
    return {};
  }
}

// Runs the 4 assignment checks on every deposit / send money / payment response:
//   1. status is 201
//   2. transaction successful (server returned the new balance)
//   3. transaction ID (trnxId) returned
//   4. correct success message
// Checks are tagged with the API name so "checks{api:deposit}" etc. can have their own thresholds.
export function checkTransaction(res, api, extraTags = {}) {
  const b = body(res);
  const ok = check(res, {
    [`${api}: status is ${EXPECTED_STATUS}`]: (r) => r.status === EXPECTED_STATUS,
    [`${api}: transaction successful`]: () => typeof b.currentBalance === 'number',
    [`${api}: trnxId returned`]: () => typeof b.trnxId === 'string' && b.trnxId.length > 0,
    [`${api}: success message`]: () => b.message === SUCCESS_MESSAGES[api],
  }, { api, ...extraTags });
  // A failed check doesn't stop the test; print the response so you can see why it failed.
  if (!ok) console.warn(`[${api}] ${__ENV.FLOW || ''} failed: ${res.status} ${res.body}`);
  return ok;
}

