# 09 — Performance and Failure Test

Date: 2026-11-15

## Synthetic performance measurement

Environment: Windows x64, Node v20.20.0, Intel Core i5-8250U, 8 logical CPUs, 7.9 GiB RAM. Command: `node tests/performance/synthetic-sql-transform.benchmark.js`.

| Synthetic transformations | Elapsed | Operations/s |
|---:|---:|---:|
| 100 | 3.757 ms | 26,618 |
| 1,000 | 4.506 ms | 221,912 |
| 10,000 | 51.521 ms | 194,096 |

This measures only the isolated SQL compatibility transformer. It is not a database, renderer or end-user latency claim. Live 100/1,000/10,000-record SQL measurements are BLOCKED without a disposable SQL Server database. DOM 10,000-row rendering is NOT TESTED because normal tables paginate at 20.

## Failure injection evidence

| Failure | Result |
|---|---|
| QR insert fails after equipment insert | PASS — transaction rollback |
| Log insert fails after plan moves to in-progress | PASS — rollback restores plan |
| Plan completion update fails after final log update | PASS — both roll back |
| PDF/image DB update fails after staging | PASS — new file removed, old preserved |
| File metadata delete fails | PASS — physical file preserved |
| ZIP checksum/manifest/traversal/duplicate/quota failure | PASS in unrestricted focused suite |
| ZIP copy fails after earlier copies | PASS — destination rollback |
| Async renderer rejects | PASS — contained by router |
| Local PDF worker fails CSP | NOT REPRODUCED; runtime render passed |
| SQL timeout/service unavailable | BLOCKED at live boundary; service exceptions are converted to failed IPC responses by inspection |

No production DB, userData directory or user archive was used in these tests.
