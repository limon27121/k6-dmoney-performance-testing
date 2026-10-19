// DMoney transaction load test — 4 windows x 30s = 2 minutes.
// Run:            k6 run tests/dmoney-load.js
// Subset windows: k6 run -e PHASES=p1,p2 tests/dmoney-load.js
import { sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';
import { htmlReport } from 'https://cdn.jsdelivr.net/gh/benc-uk/k6-reporter@2.4.0/dist/bundle.js';
import { login } from '../lib/auth.js';
import { deposit, sendMoney, payment } from '../lib/transactions.js';

const users = JSON.parse(open('../config/users.json'));

const AMOUNT = 10;          // minimum deposit; keeps balances lasting
const PACING = 1;           // seconds between transactions per flow
const WINDOW = 30;          // seconds per phase
const PHASE_START = { p1: 0, p2: 30, p3: 60, p4: 90 };

const TRANSACTIONS = { deposit, sendmoney: sendMoney, payment };

// Each flow runs as its own scenario: 1 VU looping for the whole window.
// Flows in the same phase start together, so they run concurrently.
const FLOWS = {
  // 0–30s
  p1_c1_send_c2: { phase: 'p1', api: 'sendmoney', from: 'customer1', to: 'customer2' },
  p1_c2_pay_m1:  { phase: 'p1', api: 'payment',   from: 'customer2', to: 'merchant1' },
  // 30–60s
  p2_c2_send_c1: { phase: 'p2', api: 'sendmoney', from: 'customer2', to: 'customer1' },
  p2_a1_dep_c2:  { phase: 'p2', api: 'deposit',   from: 'agent1',    to: 'customer2' },
  p2_c1_pay_m1:  { phase: 'p2', api: 'payment',   from: 'customer1', to: 'merchant1' },
  // 60–90s
  p3_a1_dep_c1:  { phase: 'p3', api: 'deposit',   from: 'agent1',    to: 'customer1' },
  p3_a2_dep_c2:  { phase: 'p3', api: 'deposit',   from: 'agent2',    to: 'customer2' },
  p3_c1_send_c2: { phase: 'p3', api: 'sendmoney', from: 'customer1', to: 'customer2' },
  p3_c2_pay_m2:  { phase: 'p3', api: 'payment',   from: 'customer2', to: 'merchant2' },
  // 90–120s
  p4_a1_pay_m1:  { phase: 'p4', api: 'payment',   from: 'agent1',    to: 'merchant1' },
  p4_a2_pay_m2:  { phase: 'p4', api: 'payment',   from: 'agent2',    to: 'merchant2' },
  p4_c1_pay_m1:  { phase: 'p4', api: 'payment',   from: 'customer1', to: 'merchant1' },
  p4_c2_pay_m2:  { phase: 'p4', api: 'payment',   from: 'customer2', to: 'merchant2' },
};

const ACTIVE_PHASES = (__ENV.PHASES || 'p1,p2,p3,p4').split(',');

function buildScenarios() {
  const scenarios = {};
  for (const [name, flow] of Object.entries(FLOWS)) {
    if (!ACTIVE_PHASES.includes(flow.phase)) continue;
    scenarios[name] = {
      executor: 'constant-vus',
      vus: 1,
      startTime: `${PHASE_START[flow.phase]}s`,
      duration: `${WINDOW}s`,
      gracefulStop: '1s',
      exec: 'runFlow',
      env: { FLOW: name },
      tags: { phase: flow.phase, flow: name },
    };
  }
  return scenarios;
}

const P95_MS = Number(__ENV.P95_MS || 1000);   // override to test a failing threshold
const APIS = ['deposit', 'sendmoney', 'payment'];

function buildThresholds() {
  const t = {
    // Global
    http_req_failed: ['rate<0.01'],
    http_req_duration: [`p(95)<${P95_MS}`],
    checks: ['rate>=0.99'],
  };
  // Per API
  for (const api of APIS) {
    t[`http_req_duration{api:${api}}`] = [`p(95)<${P95_MS}`];
    t[`http_req_failed{api:${api}}`] = ['rate<0.01'];
    t[`checks{api:${api}}`] = ['rate>=0.99'];
  }
  // Per API per phase — shows how each API behaves as the workload changes
  for (const flow of Object.values(FLOWS)) {
    if (!ACTIVE_PHASES.includes(flow.phase)) continue;
    t[`http_req_duration{api:${flow.api},phase:${flow.phase}}`] = [`p(95)<${P95_MS}`, `avg<${P95_MS}`];
  }
  return t;
}

export const options = {
  scenarios: buildScenarios(),
  thresholds: buildThresholds(),
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)'],
};

// Log in every user once; tokens are shared with all scenarios via `data`.
export function setup() {
  const tokens = {};
  for (const [name, user] of Object.entries(users)) {
    tokens[name] = login(user);
  }
  return { tokens };
}

export function runFlow(data) {
  const flow = FLOWS[__ENV.FLOW];
  const from = users[flow.from];
  const to = users[flow.to];
  TRANSACTIONS[flow.api](data.tokens[flow.from], from.phone, to.phone, AMOUNT);
  sleep(PACING);
}

// Writes reports/summary-<RUN>.json and .html; still prints the console summary.
// Run label: k6 run -e RUN=run1 tests/dmoney-load.js
export function handleSummary(data) {
  const run = __ENV.RUN || 'latest';
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    [`reports/summary-${run}.json`]: JSON.stringify(data, null, 2),
    [`reports/summary-${run}.html`]: htmlReport(data, { title: `DMoney Transactions Load Test (${run})` }),
  };
}
