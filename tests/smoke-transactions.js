// Step 5 smoke test: one transaction of each type, with balances before/after.
// Run: k6 run tests/smoke-transactions.js
import { login } from '../lib/auth.js';
import { deposit, sendMoney, payment, getBalance } from '../lib/transactions.js';

const users = JSON.parse(open('../config/users.json'));
const AMOUNT = 10;

export const options = { vus: 1, iterations: 1 };

function run(label, fn, token, from, to) {
  const before = { from: getBalance(token, from.phone), to: getBalance(token, to.phone) };
  const res = fn(token, from.phone, to.phone, AMOUNT);
  const after = { from: getBalance(token, from.phone), to: getBalance(token, to.phone) };
  console.log(
    `${label}: ${res.status} ${res.body}\n` +
    `  from ${before.from} -> ${after.from} | to ${before.to} -> ${after.to}`,
  );
}

export default function () {
  const t = {
    agent1: login(users.agent1),
    customer1: login(users.customer1),
  };

  run('DEPOSIT   agent1 -> customer1', deposit, t.agent1, users.agent1, users.customer1);
  run('SENDMONEY customer1 -> customer2', sendMoney, t.customer1, users.customer1, users.customer2);
  run('PAYMENT   customer1 -> merchant1', payment, t.customer1, users.customer1, users.merchant1);
  // Needed for the 90–120s window: can an Agent make payments?
  run('PAYMENT   agent1 -> merchant1', payment, t.agent1, users.agent1, users.merchant1);
}
