# DMoney Transaction APIs — k6 Performance Test Report

| | |
|---|---|
| **Date** | 2026-10-20 |
| **Tool** | k6 v1.8.2 |
| **Target** | DMoney Transaction API, `http://localhost:5000` (local) |
| **Script** | `tests/dmoney-load.js` |
| **Runs** | 2 full runs × 2 minutes (`run1`, `run2`) |
| **Result** | ✅ All thresholds passed in both runs |

---

## 1. Summary

- All three transaction APIs stayed far below the 1000 ms p(95) target. p(95) was **47–52 ms** for every API in both runs.
- **0% failed requests** and **100% passing checks** in both official runs (791 transactions in total).
- **Mild slowdown** as more flows ran at the same time: in run 1, average response time rose by about 30% from the 0–30s window (2 flows) to the 60–90s window (4 flows). It recovered in the last window. Run 2 was flatter.
- **One defect found:** a database **deadlock (HTTP 500)** happened once during the development runs, in the 60–90s window when several flows wrote to Customer 2's account at the same time. It did not happen in the two official runs.

---

## 2. Test Setup

### Users
Each of the 6 users logs in with their own credentials (`/user/login` + `/user/verify-otp`) once in `setup()`. Each flow then uses its own user's token.

| User | Role |
|---|---|
| Agent 1, Agent 2 | Agent |
| Customer 1, Customer 2 | Customer |
| Merchant 1, Merchant 2 | Merchant |

### Workload
Each flow is a k6 scenario (`constant-vus`, 1 VU) that loops for its whole 30-second window. Flows in the same window start at the same time, so they run concurrently.
Every transaction is **10 tk**, with **1 s pacing** between transactions per flow.

| Window | Flows running together | API |
|---|---|---|
| **P1** 0–30s (2 flows) | Customer 1 → Customer 2 | sendmoney |
| | Customer 2 → Merchant 1 | payment |
| **P2** 30–60s (3 flows) | Customer 2 → Customer 1 | sendmoney |
| | Agent 1 → Customer 2 | deposit |
| | Customer 1 → Merchant 1 | payment |
| **P3** 60–90s (4 flows) | Agent 1 → Customer 1 | deposit |
| | Agent 2 → Customer 2 | deposit |
| | Customer 1 → Customer 2 | sendmoney |
| | Customer 2 → Merchant 2 | payment |
| **P4** 90–120s (4 flows) | Agent 1 → Merchant 1 | payment |
| | Agent 2 → Merchant 2 | payment |
| | Customer 1 → Merchant 1 | payment |
| | Customer 2 → Merchant 2 | payment |

### Checks (on every transaction response)
| Check | Expected |
|---|---|
| HTTP status | `201` |
| Transaction successful | `currentBalance` is returned |
| Transaction ID returned | `trnxId` is present and not empty |
| Success message | `Deposit successful` / `Send money successful` / `Payment successful` |

---

## 3. API Comparison

### Run 1
| API | Requests | Throughput | avg | med | p(90) | p(95) | max | Failed | Checks |
|---|---|---|---|---|---|---|---|---|---|
| Deposit | 89 | 0.74 req/s | 32.1 ms | 31.6 ms | 50.2 ms | 51.5 ms | 55.0 ms | 0% | 100% |
| Send Money | 89 | 0.74 req/s | 30.3 ms | 30.0 ms | 47.4 ms | 50.4 ms | 64.1 ms | 0% | 100% |
| Payment | 209 | 1.73 req/s | 28.3 ms | 27.9 ms | 44.0 ms | 47.5 ms | 64.9 ms | 0% | 100% |
| **All requests** | 399 | 3.30 req/s | 28.9 ms | 28.8 ms | 45.2 ms | 50.5 ms | 64.9 ms | 0% | 100% |

### Run 2
| API | Requests | Throughput | avg | med | p(90) | p(95) | max | Failed | Checks |
|---|---|---|---|---|---|---|---|---|---|
| Deposit | 90 | 0.74 req/s | 31.9 ms | 28.3 ms | 45.8 ms | 47.8 ms | 60.6 ms | 0% | 100% |
| Send Money | 90 | 0.74 req/s | 32.6 ms | 31.2 ms | 47.5 ms | 49.8 ms | 70.9 ms | 0% | 100% |
| Payment | 210 | 1.74 req/s | 28.3 ms | 25.3 ms | 43.0 ms | 47.4 ms | 84.5 ms | 0% | 100% |
| **All requests** | 402 | 3.33 req/s | 29.4 ms | 27.5 ms | 45.2 ms | 48.5 ms | 84.5 ms | 0% | 100% |

*"All requests" also counts the 12 login requests made in `setup()`.*

### Comparison
- **Payment is the fastest API** (avg 28.3 ms in both runs) and has the highest throughput, because 7 of the 13 flows are payments.
- **Deposit and Send Money are about 2–4 ms slower on average** (30–33 ms). Both update two account balances, and deposit also calculates the agent's commission.
- The differences between APIs are small (under 5 ms on average). No API is a bottleneck at this load.
- Results are **consistent between runs**: p(95) differs by 4 ms or less for every API.

---

## 4. Performance as the Workload Changes

Average response time (ms) per API in each window:

| API | P1 (2 flows) | P2 (3 flows) | P3 (4 flows) | P4 (4 flows) |
|---|---|---|---|---|
| **Run 1** | | | | |
| Deposit | – | 29.3 | 33.6 | – |
| Send Money | 26.6 | 29.9 | 34.6 | – |
| Payment | 26.9 | 29.7 | 34.8 | 26.7 |
| **Run 2** | | | | |
| Deposit | – | 32.9 | 31.4 | – |
| Send Money | 31.6 | 33.8 | 32.2 | – |
| Payment | 31.3 | 33.9 | 32.6 | 25.1 |

p(95) per API in each window:

| API | P1 | P2 | P3 | P4 |
|---|---|---|---|---|
| Run 1: Deposit / Send Money / Payment | – / 40.2 / 42.3 | 42.2 / 49.4 / 48.6 | 52.4 / 51.2 / 54.0 | – / – / 44.2 |
| Run 2: Deposit / Send Money / Payment | – / 49.1 / 48.1 | 48.5 / 49.0 / 49.0 | 47.7 / 51.4 / 50.6 | – / – / 40.7 |

### Observations
- **Run 1 shows a clear, gradual slowdown** from P1 to P3. All APIs went from about 27 ms to about 34–35 ms average (+30%), and p(95) went from about 41 ms to about 53 ms. This lines up with the number of concurrent flows growing from 2 to 3 to 4.
- **P3 is the slowest window in both runs**, and it is where the deadlock happened. P3 is the only window where **three flows touch the same account (Customer 2)** at the same time: a deposit in from Agent 2, money sent in from Customer 1, and its own payment out to Merchant 2. Row locks on that account make requests wait for each other.
- **P4 has the same number of flows as P3 (4) but is the fastest window** (avg 25–27 ms). Each P4 flow spends from a different account, so there is much less lock contention.
- **Conclusion:** the slowdown comes from **several flows writing to the same account at once**, not from the total number of requests. At this load the effect is small (under 10 ms) and stays far below the thresholds.

---

## 5. Thresholds

| Threshold | Target | Run 1 | Run 2 |
|---|---|---|---|
| `http_req_failed` | < 1% | 0.00% ✓ | 0.00% ✓ |
| `http_req_duration` p(95) | < 1000 ms | 50.5 ms ✓ | 48.5 ms ✓ |
| `checks` | ≥ 99% | 100% ✓ | 100% ✓ |
| Deposit: p(95) / failed / checks | < 1000 ms / < 1% / ≥ 99% | 51.5 ms / 0% / 100% ✓ | 47.8 ms / 0% / 100% ✓ |
| Send Money: p(95) / failed / checks | < 1000 ms / < 1% / ≥ 99% | 50.4 ms / 0% / 100% ✓ | 49.8 ms / 0% / 100% ✓ |
| Payment: p(95) / failed / checks | < 1000 ms / < 1% / ≥ 99% | 47.5 ms / 0% / 100% ✓ | 47.4 ms / 0% / 100% ✓ |
| Per API per window: p(95) and avg | < 1000 ms | all ✓ | all ✓ |

To confirm the thresholds really catch failures, the test was run with the limit set to 1 ms (`-e P95_MS=1`). k6 reported the thresholds as crossed and exited with code 99.

---

## 6. Issues Found

### 6.1 Database deadlock under concurrent writes (bug)
- **Seen in:** development run (Step 8d), window P3, flow Customer 1 → Customer 2 (sendmoney)
- **Response:** `500 {"message":"Internal server error","error":"Deadlock found when trying to get lock; try restarting transaction"}`
- **How often:** 1 deadlock in 390 transactions in that run. A second unexplained payment failure happened in an earlier development run (Step 8c, before error logging was added), probably the same cause. 0 deadlocks in the 2 official runs.
- **Cause:** several transactions update the same account's balance at the same time, and the database locks them in different orders.
- **Impact:** the transaction is rejected and the user gets a generic 500 error. Under heavier real traffic this would happen more often.
- **Suggested fix:** retry the database transaction on deadlock (MySQL error 1213), and always lock accounts in the same order (for example, by account number).

### 6.2 Customer transaction limits (test environment change)
The API limits Customers to **10 transactions per day and 50 per month** (table `transactionlimits`). The scenario needs about 120 transactions per customer per run, so with the limits on, almost all customer transactions failed with
`400 "Daily transaction limit reached..."`.

To measure API performance rather than this business rule, the Customer limits were **turned off (`is_active = 0`) during the test runs and turned back on afterwards**. This was only done on the local test database.

---

## 7. Limitations

- **Low load.** Each flow sends about 1 transaction per second (1 VU + 1 s pacing), so total throughput is about 3.3 req/s. This test checks behaviour under the scenario's workload, not the server's maximum capacity.
- **Local environment.** The server, database and k6 all run on one machine, so there is no network latency. Production response times will be higher.
- **Short duration.** Each window lasts 30 seconds, so problems that build up slowly (memory leaks, connection pool exhaustion) would not show.

## 8. Recommendations

1. Fix the deadlock (retry plus consistent lock order). This is the only error seen in testing.
2. Run a stress test that increases VUs and removes the pacing, to find the actual capacity limit.
3. Run a longer soak test (30–60 minutes) to check stability over time.
4. Add a separate test with the limits turned on, to check that limit errors return quickly and correctly under load.

---

## Appendix — Files and How to Run

```bash
k6 run -e RUN=run1 tests/dmoney-load.js
# with time-series dashboard:
K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=reports/dashboard-run1.html k6 run -e RUN=run1 tests/dmoney-load.js
```

| File | Content |
|---|---|
| `reports/summary-run1.json`, `summary-run2.json` | Raw k6 summary data |
| `reports/summary-run1.html`, `summary-run2.html` | HTML summary report |
| `reports/dashboard-run1.html`, `dashboard-run2.html` | k6 web dashboard (response time over the run) |
