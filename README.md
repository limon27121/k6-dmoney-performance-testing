# DMoney Transaction Load Test (k6)

A k6 performance test that simulates 2 minutes of DMoney transaction activity across 6 users (2 Agents, 2 Customers, 2 Merchants), using the `/transaction/deposit`, `/transaction/sendmoney` and `/transaction/payment` APIs.

**Results:** see [reports/REPORT.md](reports/REPORT.md).

## Project Structure

```
config/
  env.js                 Base URL, partner key, dev OTP (each can be overridden with -e)
  users.json             Test users' credentials (git-ignored, create from the example)
  users.example.json     Template for users.json
lib/
  auth.js                Two-step login (login + verify OTP) and auth headers
  transactions.js        deposit / sendMoney / payment / getBalance helpers
  checks.js              Shared checks for every transaction response
tests/
  dmoney-load.js         Main 2-minute load test
  smoke-auth.js          Logs in all 6 users once
  smoke-transactions.js  One transaction of each type, shows balances before and after
  smoke-checks.js        Proves the checks pass on valid and fail on invalid transactions
reports/
  REPORT.md              Final analysis report
  summary-runN.json/html k6 summary per run
  dashboard-runN.html    k6 web dashboard (response time over the run)
```

## Prerequisites

1. **k6** v1.x: `k6 version`. Install with `winget install k6 --source winget` if it's missing.
2. **DMoney API** running at `http://localhost:5000`, or another URL passed with `-e BASE_URL=...`.
3. **6 active users.** Copy `config/users.example.json` to `config/users.json` and fill in each user's phone, email and password.
4. **Enough balance.** Each full run spends about 600–1,200 tk per customer and up to about 1,000 tk per agent. Top up agents with a SYSTEM deposit if needed.
5. **Customer transaction limits turned off** (local test database only). The API allows Customers 10 transactions per day, which a 2-minute run uses up within seconds:
   ```sql
   -- before testing
   UPDATE dmoneydb.transactionlimits SET is_active = 0 WHERE role = 'Customer';
   -- after testing
   UPDATE dmoneydb.transactionlimits SET is_active = 1 WHERE role = 'Customer';
   ```

## How to Run

```bash
# Smoke tests (fast, run these first)
k6 run tests/smoke-auth.js
k6 run tests/smoke-transactions.js
k6 run tests/smoke-checks.js

# Full 2-minute load test, with a run label for the report files
k6 run -e RUN=run1 tests/dmoney-load.js

# Same, plus the k6 web dashboard exported as HTML
K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=reports/dashboard-run1.html k6 run -e RUN=run1 tests/dmoney-load.js
```

On Windows PowerShell, set the environment variables first:
```powershell
$env:K6_WEB_DASHBOARD="true"; $env:K6_WEB_DASHBOARD_EXPORT="reports/dashboard-run1.html"; k6 run -e RUN=run1 tests/dmoney-load.js
```

### Options (`-e NAME=value`)

| Option | Default | Purpose |
|---|---|---|
| `BASE_URL` | `http://localhost:5000` | API address |
| `PARTNER_KEY` | `ROADTOSDET` | `X-AUTH-SECRET-KEY` header |
| `OTP` | `0000` | Dev OTP for `/user/verify-otp?env=dev` |
| `PHASES` | `p1,p2,p3,p4` | Run only some windows, e.g. `PHASES=p1` |
| `RUN` | `latest` | Label used in report file names |
| `P95_MS` | `1000` | p(95) threshold. Set to `1` to check that thresholds fail |

The exit code is `0` when all thresholds pass and `99` when any threshold fails.

## Scenario

Each flow is a k6 scenario: 1 VU looping for 30 seconds, sending 10 tk per transaction with 1 second between transactions. Flows in the same window run concurrently.

| Window | Flows |
|---|---|
| 0–30s | Customer 1 → sendmoney → Customer 2 · Customer 2 → payment → Merchant 1 |
| 30–60s | Customer 2 → sendmoney → Customer 1 · Agent 1 → deposit → Customer 2 · Customer 1 → payment → Merchant 1 |
| 60–90s | Agent 1 → deposit → Customer 1 · Agent 2 → deposit → Customer 2 · Customer 1 → sendmoney → Customer 2 · Customer 2 → payment → Merchant 2 |
| 90–120s | Agent 1 → payment → Merchant 1 · Agent 2 → payment → Merchant 2 · Customer 1 → payment → Merchant 1 · Customer 2 → payment → Merchant 2 |

Every user logs in once in `setup()` with their own credentials. Each scenario uses its own user's token.

## Checks

Every transaction response is checked for:
- HTTP status `201`
- Transaction successful (`currentBalance` is returned)
- Transaction ID (`trnxId`) is returned
- Expected success message (`Deposit successful` / `Send money successful` / `Payment successful`)

## Thresholds

| Scope | Thresholds |
|---|---|
| Global | `http_req_failed rate<0.01` · `http_req_duration p(95)<1000` · `checks rate>=0.99` |
| Per API (deposit, sendmoney, payment) | `p(95)<1000` · failed `rate<0.01` · checks `rate>=0.99` |
| Per API per window | `p(95)<1000` · `avg<1000` (used to compare windows) |
