import { check } from 'k6';

const EXPECTED_STATUS = 201;
const SUCCESS_MESSAGES = {
  deposit: 'Deposit successful',
  sendmoney: 'Send money successful',
  payment: 'Payment successful',
};

function body(res) {
  try {
    return res.json();
  } catch (e) {
    return {};
  }
}

// Validates a transaction response. Checks are tagged with the API name
// so "checks{api:deposit}" etc. can have their own thresholds.
export function checkTransaction(res, api, extraTags = {}) {
  const b = body(res);
  const ok = check(res, {
    [`${api}: status is ${EXPECTED_STATUS}`]: (r) => r.status === EXPECTED_STATUS,
    [`${api}: transaction successful`]: () => typeof b.currentBalance === 'number',
    [`${api}: trnxId returned`]: () => typeof b.trnxId === 'string' && b.trnxId.length > 0,
    [`${api}: success message`]: () => b.message === SUCCESS_MESSAGES[api],
  }, { api, ...extraTags });
  if (!ok) console.warn(`[${api}] ${__ENV.FLOW || ''} failed: ${res.status} ${res.body}`);
  return ok;
}
