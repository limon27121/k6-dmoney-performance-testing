// Smoke test: quick check that all 6 users can log in before running the big load test.
// If this fails, fix credentials/server first; the load test would fail anyway.
// Run: k6 run tests/smoke-auth.js
import { login } from '../lib/auth.js';

const users = JSON.parse(open('../config/users.json'));

// Run once with 1 VU. Every login check must pass (100%), otherwise the test fails.
export const options = {
  vus: 1,
  iterations: 1,
  thresholds: { checks: ['rate==1.0'] },
};

// Log in each user and print the start of their token (enough to see it worked).
export default function () {
  for (const [name, user] of Object.entries(users)) {
    const token = login(user);
    console.log(`${name} (${user.phone}) -> token ${token.slice(0, 20)}...`);
  }
}
