# Independent Maintenance Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared `engine_maintenance` list with independent Quy trình công nghệ and Định mức KT-KT tables, CRUD flows, ordering, and PDF ownership.

**Architecture:** A transactional SQL Server migration copies every legacy row into two new tables and drops the legacy table only after count validation. Two table-specific repositories sit behind a fixed service descriptor map; the service exposes a normalized maintenance DTO so renderer code remains generic while every request carries the active tab. The renderer loads and mutates two independent lists.

**Tech Stack:** Electron 29, Node.js CommonJS, SQL Server via `mssql`/`tedious`, renderer JavaScript, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-18-independent-maintenance-tables-design.md`

## Global Constraints

- Use two physical tables: `tech_process_maintenance` and `norm_ktkt_maintenance`.
- Use `norm_ktkt` consistently; never introduce `nom_ktkt`.
- Copy every legacy `engine_maintenance` row into both new tables, including rows whose corresponding PDF is missing.
- Preserve `vehicle_id`, `display_order`, file names, and relative file paths during migration.
- Keep `maintenance-files`, UNC storage, PDF validation, admin authorization, backup ZIP format, and restore flow unchanged.
- Do not run the old application against the database after migration `002` succeeds.
- Do not change unrelated database tables or business workflows.

## Review Focus

- Legacy rows with either or both PDF columns `NULL`: both destination rows must still be created and counts must match before the old table is dropped; covered by Task 1 migration contract tests.
- Missing or unknown `tab`: service and IPC must reject it before any repository or filesystem call; covered by Tasks 3 and 4.
- The same numeric ID may exist in both new tables: `tab` must select the repository before lookup/update/delete so the wrong item cannot be touched; covered by Task 3.
- Database failure during PDF replacement or deletion: the old physical file must remain and any newly staged file must be removed; covered by Task 3 security regression tests.
- Restore of a schema-v1 backup: migration `002` must run once after restart, while an already migrated database must not duplicate rows; covered by Task 6 isolated SQL Server and restore tests.

---

### Task 1: Transactional SQL Server Migration

**Files:**
- Create: `main/database/migrations-mssql/002_split_engine_maintenance.sql`
- Create: `tests/unit/database/maintenance-split-migration.test.js`
- Modify: `tests/unit/database/maintenance-split-migration.test.js` as the migration contract is implemented

**Interfaces:**
- Consumes: legacy table `engine_maintenance(engine_maintenance_id, vehicle_id, maintenance_name, display_order, tech_process_file_name, tech_process_file_path, norm_ktkt_file_name, norm_ktkt_file_path)` created by migration `001`.
- Produces: tables `tech_process_maintenance` and `norm_ktkt_maintenance`, each with its own identity key, vehicle foreign key with `ON DELETE CASCADE`, name, display order, and matching file columns; removes `engine_maintenance` after validation.

- [ ] **Step 1: Write the failing migration contract tests**

Add tests named:

- `migration creates both independent maintenance tables with cascading vehicle foreign keys`
- `migration copies every legacy row and preserves the matching name order and file columns`
- `migration validates both destination counts before dropping engine_maintenance`
- `migration has no nom_ktkt typo and creates vehicle-order indexes`

The tests read `002_split_engine_maintenance.sql`, assert both `INSERT ... SELECT` mappings, assert two count checks using the legacy count, and assert the final `DROP TABLE` occurs after those checks.

- [ ] **Step 2: Run the migration test and verify it fails**

Run: `node --test tests/unit/database/maintenance-split-migration.test.js`

Expected: FAIL because `002_split_engine_maintenance.sql` does not exist.

- [ ] **Step 3: Implement migration `002_split_engine_maintenance.sql` as one transaction-compatible batch**

The batch must:

- fail clearly if `engine_maintenance` is missing or either destination table already exists before this unrecorded migration starts;
- create `tech_process_maintenance(tech_process_id, vehicle_id, tech_process_name, display_order, tech_process_file_name, tech_process_file_path)`;
- create `norm_ktkt_maintenance(norm_ktkt_id, vehicle_id, norm_ktkt_name, display_order, norm_ktkt_file_name, norm_ktkt_file_path)`;
- copy all legacy rows to both tables without filtering on file presence;
- compare each destination `COUNT_BIG(*)` with the captured legacy count and `THROW` before destructive cleanup on mismatch;
- create indexes ordered by `(vehicle_id, display_order, <primary-key>)`;
- drop `engine_maintenance` last.

Do not add `BEGIN TRANSACTION`; `_runMigrations()` already wraps the entire file in a `mssql.Transaction` and records the filename only after success.

- [ ] **Step 4: Run the migration contract test**

Run: `node --test tests/unit/database/maintenance-split-migration.test.js`

Expected: PASS, including the NULL-file-row copy contract because neither `INSERT` has a file predicate.

- [ ] **Step 5: Run existing database startup tests**

Run: `node tests/run-tests.js integration`

Expected: PASS; destructive SQL integration remains opt-in and production database names remain rejected.

- [ ] **Step 6: Commit the migration**

```bash
git add main/database/migrations-mssql/002_split_engine_maintenance.sql tests/unit/database/maintenance-split-migration.test.js
git commit -m "feat: split maintenance schema into independent tables"
```

### Task 2: Table-Specific Repository Layer

**Files:**
- Create: `main/repositories/maintenance-item.repository.js`
- Create: `main/repositories/tech-process-maintenance.repository.js`
- Create: `main/repositories/norm-ktkt-maintenance.repository.js`
- Create: `tests/unit/repositories/maintenance-item-repositories.test.js`
- Delete after all consumers move in Task 3: `main/repositories/engine-maintenance.repository.js`

**Interfaces:**
- Consumes: the two tables produced by Task 1 and the pg-compatible `getDb().query(sql, params)` adapter.
- Produces: each specific repository implements `findById(id)`, `findByVehicle(vehicleId)`, `create(data)`, `update(id, data)`, `delete(id)`, `getMaxOrder(vehicleId)`, and `reorderAll(vehicleId, orderedIds)`.

- [ ] **Step 1: Write failing repository tests with a stubbed database adapter**

Add tests asserting:

- the tech repository always targets `tech_process_maintenance` and `tech_process_id`;
- the norm repository always targets `norm_ktkt_maintenance` and `norm_ktkt_id`;
- `findByVehicle` orders by `display_order` then the table-specific primary key;
- `reorderAll` constrains every update by both item ID and `vehicle_id`;
- data passed to `create` and `update` is returned through the existing `RETURNING *` adapter contract.

- [ ] **Step 2: Run the repository tests and verify they fail**

Run: `node --test tests/unit/repositories/maintenance-item-repositories.test.js`

Expected: FAIL because the new repositories do not exist.

- [ ] **Step 3: Implement `MaintenanceItemRepository`**

Create `maintenance-item.repository.js` exporting a class with constructor:

```js
new MaintenanceItemRepository({ tableName, idColumn })
```

The constructor accepts only constants supplied by the two wrapper modules; no renderer or IPC value may become a table or column identifier.

- [ ] **Step 4: Implement the two repository instances**

- `tech-process-maintenance.repository.js` exports an instance fixed to `tech_process_maintenance` / `tech_process_id`.
- `norm-ktkt-maintenance.repository.js` exports an instance fixed to `norm_ktkt_maintenance` / `norm_ktkt_id`.

- [ ] **Step 5: Run repository tests**

Run: `node --test tests/unit/repositories/maintenance-item-repositories.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the repository layer**

```bash
git add main/repositories/maintenance-item.repository.js main/repositories/tech-process-maintenance.repository.js main/repositories/norm-ktkt-maintenance.repository.js tests/unit/repositories/maintenance-item-repositories.test.js
git commit -m "feat: add independent maintenance repositories"
```

### Task 3: Independent Maintenance Service and File Ownership

**Files:**
- Modify: `main/services/vehicle.service.js`
- Modify: `main/repositories/vehicle.repository.js`
- Delete: `main/repositories/engine-maintenance.repository.js`
- Create: `tests/unit/services/vehicle-maintenance-independence.test.js`
- Modify: `tests/security/file-path/vehicle-file-boundary.test.js`

**Interfaces:**
- Consumes: repository methods from Task 2 and tab values exactly `tech_process` or `norm_ktkt`.
- Produces: normalized DTO `{ maintenance_id, vehicle_id, maintenance_name, display_order, file_name, file_path, tab }` and public service signatures:
  - `listMaintenance(vehicleId, tab)`
  - `createMaintenance({ vehicle_id, tab, maintenance_name }, userId)`
  - `updateMaintenance(id, tab, { maintenance_name }, userId)`
  - `deleteMaintenance(id, tab, userId)`
  - `reorderMaintenance(vehicleId, tab, orderedIds, userId)`
  - existing `uploadFile(id, tab, fileData, userId)`, `deleteFile(id, tab, userId)`, `readFile(id, tab)`, and `openFile(id, tab)` now route through the selected repository.

- [ ] **Step 1: Write failing independent-list service tests**

Test names and essential assertions:

- `list normalizes rows from only the selected maintenance repository`
- `create update and reorder mutate only the selected tab`
- `same numeric ID in both tables cannot update or delete the other tab`
- `missing or unknown tab returns failure before repository access`
- `deleting one maintenance item removes only its own PDF after database success`
- `deleting a vehicle gathers and cleans files from both maintenance tables`
- `vehicle stats sum independent item counts and keep file counts separate`

- [ ] **Step 2: Run the new service tests and verify they fail**

Run: `node --test tests/unit/services/vehicle-maintenance-independence.test.js`

Expected: FAIL because the service still imports the legacy repository and has no tab-aware CRUD.

- [ ] **Step 3: Add a fixed service descriptor map and DTO normalization**

Inside `vehicle.service.js`, map each allowed tab to its repository and exact ID/name/file property keys. `_maintenanceContext(tab)` returns the fixed descriptor or `null`; `_toMaintenanceDto(row, tab)` returns the normalized interface above.

- [ ] **Step 4: Convert maintenance CRUD and file operations to the selected repository**

Validate `tab`, `vehicle_id`, non-empty trimmed name, and IDs before access. Keep PDF validation, relative-path resolution, rollback cleanup, and durable cleanup behavior unchanged.

- [ ] **Step 5: Update vehicle deletion and statistics**

- Load both maintenance lists before deleting a vehicle and clean both sets of PDFs only after database deletion succeeds.
- Replace the legacy stats join in `vehicle.repository.js` with separate aggregates for the two new tables.
- Define `maintenance_count` as `tech_maintenance_count + norm_maintenance_count`; keep `tech_file_count` and `norm_file_count` independent.

- [ ] **Step 6: Adapt file-boundary tests to two repository stubs and normalized field ownership**

Preserve and run tests for absolute path rejection, symlink escape rejection, invalid PDF content, failed metadata update rollback, relative `maintenance-files` paths, collision-resistant names, and durable cleanup. Add an assertion that an invalid tab causes zero calls to both repositories and zero filesystem writes.

- [ ] **Step 7: Run service and security tests**

Run: `node --test tests/unit/services/vehicle-maintenance-independence.test.js tests/security/file-path/vehicle-file-boundary.test.js`

Expected: PASS; a database failure leaves the old PDF present and the other tab remains untouched.

- [ ] **Step 8: Confirm the legacy repository has no consumers, then delete it**

Run: `rg -n "engine-maintenance\.repository|engineRepo|engine_maintenance" main renderer tests --glob "!main/database/migrations-mssql/001_schema.sql" --glob "!main/database/migrations-mssql/002_split_engine_maintenance.sql" --glob "!tests/unit/database/maintenance-split-migration.test.js"`

Expected: no runtime references to the legacy repository/table.

- [ ] **Step 9: Commit the service conversion**

```bash
git add main/services/vehicle.service.js main/repositories/vehicle.repository.js main/repositories/engine-maintenance.repository.js tests/unit/services/vehicle-maintenance-independence.test.js tests/security/file-path/vehicle-file-boundary.test.js
git commit -m "feat: make maintenance services independent by tab"
```

### Task 4: Tab-Aware IPC Contract and Authorization

**Files:**
- Modify: `main/ipc/vehicle.ipc.js`
- Create: `tests/security/authorization/vehicle-maintenance-ipc.test.js`
- Modify if necessary: `tests/security/authorization/ipc-auth-policy.test.js`

**Interfaces:**
- Consumes: service signatures from Task 3.
- Produces: existing IPC channel names with required tab payloads:
  - `engineMaintenance:list` receives `{ vehicleId, tab }`
  - `engineMaintenance:create` receives `{ vehicle_id, tab, maintenance_name }`
  - `engineMaintenance:update` receives `{ id, tab, data }`
  - `engineMaintenance:delete` receives `{ id, tab }`
  - `engineMaintenance:reorder` receives `{ vehicleId, tab, orderedIds }`
  - file channels retain `{ id, tab, ... }`.

- [ ] **Step 1: Write failing IPC routing and authorization tests**

Register handlers with stubbed Electron, auth, and service modules. Assert:

- authenticated reads pass `tab` unchanged to the service;
- admin mutations pass `tab` unchanged to the service;
- missing auth blocks list/read/open;
- non-admin blocks create/update/delete/reorder/upload/deleteFile;
- unknown tab is rejected by the service and no alternate channel bypass exists.

- [ ] **Step 2: Run IPC tests and verify they fail**

Run: `node --test tests/security/authorization/vehicle-maintenance-ipc.test.js`

Expected: FAIL because CRUD handlers do not currently forward `tab`.

- [ ] **Step 3: Update IPC handlers to forward the exact Task 3 signatures**

Do not add dynamic IPC channel names and do not weaken existing `requireAuth()` / `requireAdmin()` checks.

- [ ] **Step 4: Run authorization tests**

Run: `node --test tests/security/authorization/vehicle-maintenance-ipc.test.js tests/security/authorization/ipc-auth-policy.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the IPC contract**

```bash
git add main/ipc/vehicle.ipc.js tests/security/authorization/vehicle-maintenance-ipc.test.js tests/security/authorization/ipc-auth-policy.test.js
git commit -m "feat: route maintenance IPC by active tab"
```

### Task 5: Independent Renderer Lists and Forms

**Files:**
- Modify: `renderer/pages/maintenance/maintenance-steps.js`
- Create: `tests/unit/renderer/maintenance-independent-tabs.test.js`
- Modify if visual fixture coverage is needed: `renderer/tests/maintenance-layout.fixture.html`
- Modify if visual fixture coverage is needed: `renderer/tests/maintenance-layout.electron.test.js`

**Interfaces:**
- Consumes: normalized DTO and IPC payload contracts from Tasks 3 and 4.
- Produces: renderer state `{ tech_process: MaintenanceDto[], norm_ktkt: MaintenanceDto[] }`; all item actions include `activeTab` and use `maintenance_id`, `maintenance_name`, `file_name`, and `file_path`.

- [ ] **Step 1: Write failing renderer contract tests**

Assert the source or a VM-loaded renderer contract performs all of the following:

- requests `engineMaintenance:list` once for `tech_process` and once for `norm_ktkt`;
- stores and renders separate arrays by active tab;
- passes `activeTab` on create, update, delete, reorder, upload, read, open, and delete-file actions;
- uses normalized DTO fields rather than legacy `engine_maintenance_id` or tab-specific file columns;
- computes each tab's numerator and denominator from its own list.

- [ ] **Step 2: Run renderer contract tests and verify they fail**

Run: `node --test tests/unit/renderer/maintenance-independent-tabs.test.js`

Expected: FAIL because the renderer currently fetches one shared list and reuses it for both tabs.

- [ ] **Step 3: Load two independent lists in `renderVehicleDetail`**

Fetch both tab lists with `Promise.all`, retain them in a fixed `itemsByTab` object, and pass only `itemsByTab[activeTab]` to `_renderMaintList`.

- [ ] **Step 4: Make counts, empty states, and item bars tab-local**

Calculate:

- tech numerator from tech items with `file_path`, denominator from tech list length;
- norm numerator from norm items with `file_path`, denominator from norm list length.

Keep the existing two-tab layout and styling unchanged.

- [ ] **Step 5: Make add/edit/delete/reorder and PDF actions tab-local**

- “Thêm hạng mục” opens the one-name form for the active tab.
- Create/update/delete/reorder payloads include `tab: activeTab`.
- Item keys use `maintenance_id`; labels and dialogs use `maintenance_name`.
- PDF actions use normalized `file_name` / `file_path` and include the active tab.
- Refresh reloads both lists so counts and active content cannot become stale.

- [ ] **Step 6: Run renderer and layout tests**

Run: `node --test tests/unit/renderer/maintenance-independent-tabs.test.js`

Expected: PASS.

Run: `npm run test:e2e`

Expected: maintenance layout/PDF contracts PASS and the existing two tabs retain their full-width layout.

- [ ] **Step 7: Commit the renderer conversion**

```bash
git add renderer/pages/maintenance/maintenance-steps.js tests/unit/renderer/maintenance-independent-tabs.test.js renderer/tests/maintenance-layout.fixture.html renderer/tests/maintenance-layout.electron.test.js
git commit -m "feat: separate maintenance tab lists in renderer"
```

### Task 6: End-to-End Migration, Backup/Restore, and Release Verification

**Files:**
- Modify only if a discovered regression requires it: `main/services/file-archive.service.js`
- Modify only if a discovered regression requires it: `main/ipc/file-archive.ipc.js`
- Create: `docs/deployment/independent-maintenance-upgrade.md`

**Interfaces:**
- Consumes: completed migration, service, IPC, and renderer work from Tasks 1–5.
- Produces: a verified release procedure that backs up first, closes old clients, migrates once, upgrades all clients, and validates restore.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`

Expected: all unit, integration, and security tests PASS.

- [ ] **Step 2: Run the Electron renderer suite**

Run: `npm run test:e2e`

Expected: PASS. If an unrelated pre-existing failure remains, record its exact test and evidence separately; do not weaken it to make this feature appear green.

- [ ] **Step 3: Test migration against an isolated SQL Server database**

Using a database whose name ends in `_test` and explicit destructive-test opt-in:

1. Apply migration `001`.
2. Insert legacy rows covering both files present, only tech present, only norm present, and neither present.
3. Start the new app/migration runner.
4. Assert both destination tables have the legacy row count, values are mapped correctly, `engine_maintenance` is absent, and `_migrations` contains `002_split_engine_maintenance.sql` once.
5. Restart and assert row counts do not change.

- [ ] **Step 4: Perform an Electron smoke test**

For one vehicle:

- add two tech items and one norm item;
- give all three different names;
- reorder only tech and verify norm order is unchanged;
- upload/open/replace/delete one PDF in each tab;
- delete one tech item and verify the norm item and PDF remain;
- verify non-admin users cannot mutate either list.

- [ ] **Step 5: Verify backup and restore compatibility**

Create a full ZIP, restore its database and files into an isolated target, relaunch, and verify both independent lists plus all PDFs. Separately restore a schema-v1 ZIP into an isolated target and verify migration `002` splits it on first new-version startup.

- [ ] **Step 6: Build the packaged Windows installer**

Run: `npm run build`

Expected: electron-builder completes successfully and the migration SQL plus renderer changes are present in the packaged application.

- [ ] **Step 7: Write the deployment runbook**

Document exact operator order in `docs/deployment/independent-maintenance-upgrade.md`: close clients, create full backup, install server/admin copy, launch once to migrate, validate counts/files, install the same application version on every client, then reopen access. Include rollback by restoring the pre-upgrade backup and reinstalling the previous application version.

- [ ] **Step 8: Commit verification documentation**

```bash
git add docs/deployment/independent-maintenance-upgrade.md
git commit -m "docs: add independent maintenance upgrade runbook"
```
