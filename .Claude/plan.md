# DMoney k6 Performance Test — Plan

**Golden rule:** One small step at a time. Run it. Confirm it works. Only then go to the next step.

---

## Step 1 — Project Setup
- Create the folders:
  ```
  config/   → env.js (base URL, secret key), users.json (6 users)
  lib/      → auth.js, transactions.js, checks.js
  tests/    → dmoney-load.js
  reports/  → test output
  ```
- ✅ **Done when:** the folders exist and `k6 version` works.

## Step 2 — Collect API Info
Write down from the DMoney API docs / Postman:
- Base URL and required headers
- Login endpoint, request body, where the token comes back
- Body for `/transaction/deposit`, `/transaction/sendmoney`, `/transaction/payment`
- Success status code, success message, transaction ID field name
- Rules: min/max amount, limits, fees, whether an Agent can make payments
- ✅ **Done when:** everything above is documented.

## Step 3 — Prepare Test Users
- Agent 1, Agent 2, Customer 1, Customer 2, Merchant 1, Merchant 2 → put their credentials in `config/users.json`
- Make sure agents and customers have enough balance.
- ✅ **Done when:** each user can log in manually (Postman or curl).

## Step 4 — Login Script
- `login(user)` → returns a token.
- Test it: log in all 6 users and print their tokens.
- ✅ **Done when:** all 6 logins succeed.

## Step 5 — One Transaction of Each Type
- `deposit()` → Agent 1 → Customer 1
- `sendMoney()` → Customer 1 → Customer 2
- `payment()` → Customer 1 → Merchant 1
- Run with `--vus 1 --iterations 1`.
- ✅ **Done when:** all 3 succeed and the balances change.

## Step 6 — Add Checks
Each transaction response must check:
- Expected HTTP status code
- Request was successful
- Transaction ID is returned
- Expected success message is returned
- ✅ **Done when:** checks pass at 100%, and a wrong input makes them fail (this proves the checks work).

## Step 7 — Log In Every User Once (`setup()`)
- Log in all 6 users in `setup()` and pass the tokens to the scenarios.
- ✅ **Done when:** each scenario uses its own user's token.

## Step 8 — Build the Timeline (one window at a time)
Each flow = 1 k6 scenario (`constant-vus`, 1 VU, `duration: 30s`, its own `startTime`).
Flows in the same window run at the same time. Tag every request with `api` and `phase`.

| Window | Start | Flows |
|---|---|---|
| **P1** 0–30s | 0s | C1 → send → C2 · C2 → pay → M1 |
| **P2** 30–60s | 30s | C2 → send → C1 · A1 → deposit → C2 · C1 → pay → M1 |
| **P3** 60–90s | 60s | A1 → deposit → C1 · A2 → deposit → C2 · C1 → send → C2 · C2 → pay → M2 |
| **P4** 90–120s | 90s | A1 → pay → M1 · A2 → pay → M2 · C1 → pay → M1 · C2 → pay → M2 |

- 8a. Add P1 → run → confirm
- 8b. Add P2 → run → confirm
- 8c. Add P3 → run → confirm
- 8d. Add P4 → run the full 2 minutes → confirm
- Use a small amount and `sleep(1)` so the balances last.
- ✅ **Done when:** the full 2-minute run has no "insufficient balance" errors.

## Step 9 — Thresholds
**Global:**
```js
http_req_failed:   ['rate<0.01'],
http_req_duration: ['p(95)<1000'],
checks:            ['rate>=0.99'],
```
**Per API** (same limits for each of `deposit`, `sendmoney`, `payment`):
```js
'http_req_duration{api:deposit}': ['p(95)<1000'],
'http_req_failed{api:deposit}':   ['rate<0.01'],
'checks{api:deposit}':            ['rate>=0.99'],
```
**Per phase** (only to show numbers for comparing windows):
```js
'http_req_duration{api:payment,phase:p1}': ['p(95)<99999'],
```
- ✅ **Done when:** the summary shows ✓/✗ for each threshold. Temporarily set one limit very low to confirm it fails.

## Step 10 — Save Results
- Add `handleSummary()` → writes `reports/summary.json` + `reports/summary.html`, and still prints the summary in the console.
- Run the full test 2 times to confirm the results are stable.
- ✅ **Done when:** the report files are created.

## Step 11 — Write the Report (`reports/REPORT.md`)
Compare the 3 APIs:

| API | Requests | req/s | avg | p(95) | max | Fail % | Checks % |
|---|---|---|---|---|---|---|---|

- p95 per API in each window (P1 → P4) → is there a slowdown as the load grows?
- Threshold results (pass/fail)
- Errors seen and final conclusion
- ✅ **Done when:** the report covers response time, throughput, failure rate, and slowdown.

## Step 12 — Final Check
- [x] 6 users, each logs in with their own credentials
- [x] 4 windows, correct flows, concurrent, 2 minutes total
- [x] Only the deposit / sendmoney / payment APIs used
- [x] Checks: status, success, transaction ID, message
- [x] Global + per-API thresholds
- [x] Report done
- [x] README with how to run
- [x] No passwords committed (`users.json` in `.gitignore`)

---

## Progress
- [x] 1  [x] 2  [x] 3  [x] 4  [x] 5  [x] 6
- [x] 7  [x] 8  [x] 9  [x] 10  [x] 11  [x] 12
