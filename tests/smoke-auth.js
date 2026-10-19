// Step 4 smoke test: log in all 6 users and print their tokens.
// Run: k6 run tests/smoke-auth.js
import { login } from '../lib/auth.js';

const users = JSON.parse(open('../config/users.json'));

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: { checks: ['rate==1.0'] },
};

export default function () {
  for (const [name, user] of Object.entries(users)) {
    const token = login(user);
    console.log(`${name} (${user.phone}) -> token ${token.slice(0, 20)}...`);
  }
}
