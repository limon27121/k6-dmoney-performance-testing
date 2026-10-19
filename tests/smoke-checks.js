// Step 6 smoke test: valid transactions must pass all checks,
// an invalid one (deposit below minimum) must fail them.
// Run: k6 run tests/smoke-checks.js
import { login } from '../lib/auth.js';
import { deposit, sendMoney, payment } from '../lib/transactions.js';

const users = JSON.parse(open('../config/users.json'));
const { agent1, customer1, customer2, merchant1 } = users;

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    // Valid requests: every check passes
    'checks{case:valid}': ['rate==1.0'],
    // Invalid request: every check fails (proves the checks detect errors)
    'checks{case:invalid}': ['rate==0.0'],
  },
};

export default function () {
  const tA1 = login(agent1);
  const tC1 = login(customer1);
  const valid = { case: 'valid' };

  deposit(tA1, agent1.phone, customer1.phone, 10, valid);
  sendMoney(tC1, customer1.phone, customer2.phone, 10, valid);
  payment(tC1, customer1.phone, merchant1.phone, 10, valid);

  // Below the 10 tk minimum -> API returns 400, all 4 deposit checks should fail
  const bad = deposit(tA1, agent1.phone, customer1.phone, 5, { case: 'invalid' });
  console.log(`invalid deposit -> ${bad.status} ${bad.body}`);
}
