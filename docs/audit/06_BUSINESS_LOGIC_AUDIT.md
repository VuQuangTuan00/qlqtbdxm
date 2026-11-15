# 06 — Business Logic Audit

Date: 2026-11-15  
Evidence classes: static source review, isolated Node tests, hidden Electron tests. No production database was queried.

## Verified workflow

| Area | Source-defined rule | Result | Evidence |
|---|---|---|---|
| Equipment + QR | Create/delete related rows atomically | PASS (isolated) | `equipment-transaction.test.js` |
| Plan creation | Plan, generated logs and audit row share one transaction | PASS (isolated) | `maintenance-plan-transaction.test.js` |
| Plan approval | Only `pending` can become `approved`; Main allows admin/commander | PASS (source + security test) | service and IPC policy tests |
| Plan cancellation/deletion | Completed/cancelled plans cannot be cancelled; only pending/cancelled can be deleted | PASS (source review); live SQL NOT TESTED | `maintenance-plan.service.js` |
| Log completion | Final completed log and plan completion share one transaction | PASS (isolated rollback injection) | `maintenance-log-transaction.test.js` |
| Acceptance | Only completed plans can be accepted; one acceptance per plan; create/update restricted to admin/commander/inspector | PASS (source + IPC policy) | acceptance service/IPC tests |
| Vehicle PDFs/images | DB/file lifecycle rolls back on failure | PASS (isolated temp folders) | file lifecycle tests |

## Confirmed defects fixed in this phase

- BL-001: `log:update` accepted `status`, bypassing the atomic `updateStatus()` path. The generic update now accepts only result, note and timestamps; regression test passes.
- RBAC-006: maintenance-log mutations relied on renderer visibility. Main process now enforces admin/technician/commander.
- RBAC-007: acceptance update was less restricted than acceptance create. Both now enforce admin/commander/inspector.
- RBAC-008: unit mutations were callable by any authenticated renderer although unit administration is an admin setting. Main now requires admin.

## Remaining limits

- Live SQL Server constraints, concurrency races and transaction isolation remain BLOCKED because no explicitly disposable `TEST_DB` was supplied.
- Plan-code generation uses `count + 1`; concurrent creates or deletes can still collide. This is a P2 design risk requiring a database sequence/unique-retry decision, so it was not changed during a compatibility audit.
- Audit-log writes outside the main transaction are intentionally best-effort in several services; failures are swallowed. Policy for whether audit failure must block business actions is undefined.

