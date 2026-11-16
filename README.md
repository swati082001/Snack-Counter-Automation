# Snack Counter Automation

Core logic for keeping the Oslo and Bengaluru snack boxes stocked: every empty box becomes a tracked refill with exactly one named buyer, a deadline, an automatic HR reimbursement claim and a recorded purchase. Chat and HR are simulated, storage is in memory, and a thin Fastify API exposes everything for a demo.

## The four problems and what fixes each

| Problem | Mechanism |
|---|---|
| The box sits empty because everyone assumes someone else will refill it | `/empty` creates a refill that is **offered to one named person** by direct message, with 2 hours to accept and 24 hours to buy. Ignored or declined offers move to the next person automatically. |
| Two people buy on the same day | Duplicate reports join the **same refill**, and accepting is an **atomic claim** (optimistic version check): only one person can ever hold it. |
| A few people do most refills and wait weeks for their money | **Fair rotation** (fewest refills in 90 days goes first), anyone with a claim **unpaid for more than 10 days is skipped**, and the **HR claim is sent automatically** with the receipt. |
| Nobody knows monthly spend or which snacks get eaten | Every purchase is recorded with its items. **Budgets** are tracked per office in its own currency (soft limit, flagged), and a **monthly report** combines both offices in NOK with a per-snack breakdown. |

## Assumptions

| # | Assumption | Why |
|---|---|---|
| A1 | A person reports an empty box with a chat command (`/empty`). The buyer enters snack items with the receipt. | No sensors are mentioned and everyone has chat. Items enable the snack report without receipt reading. |
| A2 | Volunteers set their own status in chat: office, remote or away. | No attendance feed exists. Self-reporting covers hybrid days and holidays; the accept window is the backup. |
| A3 | The budget is a soft limit. An over-budget purchase is accepted and flagged. | An empty box is worse than a small overrun, and management sees every flag. |
| A4 | HR receives the purchase amount and currency; HR converts to the employee's payroll currency. | Claims carry amount and currency and HR pays in payroll currency. We hold no payroll rates. |
| A5 | The report converts both offices to NOK at one configurable rate and shows original amounts too. | Management wants a single total. A fixed rate is predictable. NOK assumes Oslo as the reporting base. |
| A6 | A volunteer has 2 hours to accept and 24 hours to buy. Both are configurable. | Short enough that the box is never empty for days, long enough for someone at home or in a meeting. |
| A7 | The fairest volunteer has the fewest refills in the last 90 days. Anyone with a claim unpaid after 10 days is skipped. | HR takes up to 10 days, so a longer wait means that person is still out of pocket. |
| A8 | The offices are independent. A visitor joins the rotation of the office they are in. | Counters and budgets are physical and per office, and visits last a week or two. |
| A9 | HR has no callbacks or duplicate detection, so we poll its status and send our own idempotency key (the refill id). | Its capabilities are unknown, and this is safe if either is missing. |
| A10 | Only a volunteer whose status is `OFFICE` at the refill's office can be offered it. | Buying and restocking is physical. |
| A11 | A purchase is paid in the office's currency, even by a visitor with a different payroll currency. | Snacks are bought locally; HR converts (A4). |
| A12 | A volunteer who already holds an active offer or claim is not offered another refill. | One task at a time keeps ownership clear. |
| A13 | Money is stored as integer minor units (øre, paise). | Avoids floating point errors. |
| A14 | A rejected HR claim keeps its spend in the budget and report; buyer and management are told. | The money was spent; resolving it with HR is a human task. |

## How to run

Requirements: Node.js 20 or newer, pnpm.

```bash
pnpm install
pnpm test         # all tests, a few seconds, no network
pnpm typecheck    # strict TypeScript
pnpm dev          # demo server on http://localhost:3000 (dev mode)
pnpm build && pnpm start   # production mode
```

| | `pnpm dev` | `pnpm start` |
|---|---|---|
| Clock | real time, can be moved forward with `/dev/clock/advance` | real time |
| Ids | readable: `refill_1`, `purchase_1`, `claim_1` | uuids |
| `/dev/*` routes | enabled | not registered (404) |

Both modes seed a demo roster: in Oslo `ingrid`, `lars`, `nora` (in office) and `erik` (remote); in Bengaluru `aarav`, `diya`, `kabir` (in office) and `meera` (away); and `priya`, from Bengaluru, visiting Oslo this week. Every minute the server runs `tick` (hand on expired offers and claims, retry HR) and `syncHrClaims` (pick up HR decisions); `/admin/tick` and `/admin/sync-hr` run them on demand. Chat messages go to an in-memory outbox; HR is an in-memory fake.

## Demo: from empty box to reimbursed

Start `pnpm dev`, then run this in another terminal (bash or zsh). Each step prints the JSON response.

```bash
B=http://localhost:3000
H='content-type: application/json'

# 1. Erik reports the Oslo box empty (/empty). It is offered to Ingrid (first in the rotation).
curl -s -X POST $B/refills -H "$H" -d '{"office":"OSLO","reportedBy":"erik"}'; echo

# 2. The offer reached Ingrid by direct message, with deadline and budget left.
curl -s $B/dev/outbox; echo

# 3. Ingrid is busy and declines; Lars is asked straight away.
curl -s -X POST $B/refills/refill_1/decline -H "$H" -d '{"volunteerId":"ingrid"}'; echo

# 4. Lars accepts: the refill is his, with 24 hours to buy.
curl -s -X POST $B/refills/refill_1/accept -H "$H" -d '{"volunteerId":"lars"}'; echo

# 5. Ingrid changes her mind and tries to accept too: 409 ALREADY_CLAIMED.
curl -s -X POST $B/refills/refill_1/accept -H "$H" -d '{"volunteerId":"ingrid"}'; echo

# 6. Lars buys snacks and submits the receipt. The HR claim (claim_1) is sent automatically.
curl -s -X POST $B/refills/refill_1/purchase -H "$H" -d '{
  "volunteerId": "lars", "amountMinor": 54900, "currency": "NOK", "receiptRef": "receipt-001",
  "items": [{"name": "Chips", "quantity": 5, "lineTotalMinor": 24900},
            {"name": "Soda",  "quantity": 6, "lineTotalMinor": 30000}]}'; echo

# 7. HR approves the claim (simulated), and we poll HR.
curl -s -X POST $B/dev/hr/claim_1/approve; echo
curl -s -X POST $B/admin/sync-hr; echo

# 8. The refill is REIMBURSED, and Lars got a thank-you message.
curl -s $B/refills/refill_1; echo

# 9. Monthly report: Oslo spent 549.00 NOK of 6,000, Soda and Chips per snack, 1 reimbursed.
curl -s "$B/reports/monthly?month=$(date +%Y-%m)"; echo
```

### Bonus: a claim nobody completes is handed on

```bash
# Aarav claims the Bengaluru refill, then does nothing for 25 hours.
curl -s -X POST $B/refills -H "$H" -d '{"office":"BENGALURU","reportedBy":"meera"}'; echo
curl -s -X POST $B/refills/refill_2/accept -H "$H" -d '{"volunteerId":"aarav"}'; echo
curl -s -X POST $B/dev/clock/advance -H "$H" -d '{"minutes":1500}'; echo
curl -s -X POST $B/admin/tick; echo

# The refill is OPEN again, Aarav is excluded and was told, and Diya has the offer.
curl -s $B/refills/refill_2; echo
```

## API

| Method and path | Purpose | Success |
|---|---|---|
| `POST /refills` `{ office, reportedBy }` | Report an empty box (`/empty`) | 201 new, 200 joined the open refill |
| `GET /refills/:id` | One refill with its full history | 200 |
| `GET /refills?office=&state=` | List refills | 200 |
| `POST /refills/:id/accept` `{ volunteerId }` | Accept the offer | 200 |
| `POST /refills/:id/decline` `{ volunteerId }` | Decline the offer | 200 |
| `POST /refills/:id/purchase` `{ volunteerId, amountMinor, currency, items, receiptRef }` | Submit the purchase | 201 `{ refill, purchase }` |
| `POST /refills/:id/cancel` `{ byEmployeeId, reason }` | Box was refilled by someone else | 200 |
| `PUT /volunteers/:id/status` `{ availability, currentOffice }` | Set office / remote / away and current office | 200 |
| `GET /volunteers` | List volunteers | 200 |
| `GET /reports/monthly?month=YYYY-MM` | Monthly report | 200 |
| `POST /admin/tick`, `POST /admin/sync-hr` | Run the background jobs now | 200 |
| `GET /dev/outbox` | Messages the fake chat has sent (dev only) | 200 |
| `POST /dev/hr/:claimId/approve`, `/reject` | Drive the fake HR (dev only) | 200 |
| `POST /dev/clock/advance` `{ minutes }` | Move the clock forward (dev only) | 200 |
| `GET /health` | Liveness | 200 `{ "ok": true }` |

Errors always have the shape `{ "error": { "code": "ALREADY_CLAIMED", "message": "..." } }`: `VALIDATION` 400, `NOT_OFFERED_TO_YOU` / `NOT_YOUR_CLAIM` 403, `NOT_FOUND` 404, `ALREADY_CLAIMED` / `INVALID_STATE` 409, `CURRENCY_MISMATCH` 422. Amounts are integer minor units (`54900` = 549.00 NOK); dates are ISO 8601.

## Project layout

```
src/
  domain/       types and the refill state machine
  money/        money helpers, month bucketing per time zone, budget tracker
  volunteers/   volunteer repository, status updates, the assignment engine (who is asked next)
  refill/       refill coordinator (lifecycle), HR claim follow-up, repositories, validation, chat texts
  adapters/     chat and HR ports, HR gateway (idempotency, retries), fakes
  reporting/    monthly report
  api/          Fastify routes, error mapping, composition root (server.ts), demo roster
tests/          mirrors src/; tests/support has the fake clock, builders and wired test contexts
```

The rules the assignment asks to prove (two people cannot both commit to a refill, an uncompleted refill is handed on, budgets and totals are correct across both currencies) are tested by the tests prefixed `REQUIRED:`; find them with `grep -rn "REQUIRED:" tests`.

## Deliberately not built

Stock sensors, receipt reading (OCR), company cards, approval before purchase, a web UI, live exchange rates, calendar feeds, real chat and HR integrations, a database, and authentication. In production these would change: a real database with an atomic conditional update instead of the in-memory version check, a job scheduler for `tick` and `syncHrClaims`, real chat and HR adapters behind the same ports, authentication (so `volunteerId` comes from the login, not the request body), and an audit log.
