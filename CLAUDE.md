# BADB — Battery Assembly Database

LIMS/ELN-lite for battery assembly R&D lab. Two developers: Dima (infrastructure, Excel/VBA, frontend, architecture) and Dalia (Node.js CRUD, PostgreSQL, Web UI).

**Main repo: `chem-coder/1_BADB---Battery-Assembly-Database` (Dalia's) — this is where all work lands.**
Dima contributes via feature branches → Pull Requests into Dalia's main.

## Stack

- **Server:** Node.js + Express 5 (modular), PostgreSQL 16 (badb_app_v1, 42 tables — Dalia's production DB)
- **Client (VBA):** Excel VBA (DatabaseUI.xlam)
- **Client (Web):** Vue 3 + PrimeVue 4 + Vite (planned)
- **Contracts:** JSON Schema draft-07 (contracts/)

## Repo structure

```
BADB-Battery-Assembly-Database/
├── app.js              — Express app entry point
├── server.js           — HTTP server start
├── config/index.js     — all tunable parameters (port, DB, JWT, bcrypt, rate limits, roles)
├── db/pool.js          — PostgreSQL Pool
├── middleware/
│   ├── auth.js         — JWT Bearer token verification + role checking
│   ├── validate.js     — ajv JSON Schema validation
│   └── errorHandler.js — centralized error handling
├── routes/
│   ├── index.js        — route registration
│   ├── auth.js         — /api/auth: login, register, me
│   ├── submit.js       — /api/submit: append-only raw_submissions
│   └── (13 CRUD route files, ~130 endpoints)
├── migrations/         — forward-only SQL migrations
├── public/             — Dalia's static HTML (DO NOT MODIFY)
├── contracts/          — JSON Schema contracts (versioned)
│   └── schemas/        — versioned schemas (v1)
├── client/             — Excel VBA client
│   └── src/            — .bas/.cls/.frm modules
└── client-web/         — Vue 3 frontend
    └── src/
        ├── components/
        │   ├── AppHeader.vue      — top header bar
        │   ├── AppSidebar.vue     — sidebar nav (from navigation.js)
        │   ├── PageHeader.vue     — sticky page header (glass-card, #actions slot)
        │   ├── StatusBadge.vue    — status badge component
        │   ├── CrudTable.vue      — ★ universal CRUD table (from Design System)
        │   └── SaveIndicator.vue  — ★ save/unsave indicator for PageHeader
        ├── config/
        │   └── navigation.js      — ★ single source of truth (sidebar, router, pages)
        └── pages/                 — one page per route
```

## Key commands

| task    | command                                          |
|---------|--------------------------------------------------|
| dev     | `npm run dev` (server :3003 + Vite :5173)        |
| server  | `node server.js` (port 3003)                     |
| test    | VBA: cmdSelfTest.RunAll()                        |

### Dev server lifecycle (MANDATORY)

**Before starting `npm run dev`, ALWAYS kill existing processes first:**

```bash
lsof -ti:3003 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null
```

**Why:** `npm run dev` spawns 4+ child processes (npm, concurrently, nodemon, vite, node server.js). If you restart without killing first, old processes stay alive. Each leaked restart wastes ~200MB RAM. After 3-4 restarts the system becomes unresponsive.

**Rule:** Never run `npm run dev` without killing ports 3003 + 5173 first. No exceptions.

## Dev environment — ports and networking

- **BADB server:** port **3003** (`config/index.js` → `PORT || 3003`)
- **Vite dev server:** port **5173**
- **Port 3000** — was Dalia's old standalone server. After integration, only port 3003 is used.
- **Browser URL:** http://localhost:5173

### How API requests flow (CRITICAL)

```
Browser (5173) → /api/* (relative) → Vite proxy → localhost:3003 → PostgreSQL
```

Axios `baseURL` MUST be empty string `''` in dev. Direct cross-origin requests
(5173 → 3003) are blocked by CORS. Always route through Vite proxy.

### Frontend networking invariants (NEVER violate)

1. `VITE_API_URL` in `.env.development` MUST be empty — never set to `http://localhost:XXXX`
2. `api.js` baseURL MUST be `import.meta.env.VITE_API_URL || ''` — never hardcode a port
3. All new API endpoints MUST be added to Vite proxy in `vite.config.js`, not as absolute URLs
4. After ANY change to `.env.*` files — restart `npm run dev` (browser refresh is NOT enough)
5. Before writing any URL in frontend code — grep `client-web/` for hardcoded ports:
   `grep -r "localhost:[0-9]" client-web/src/`

## Invariants (NEVER violate)

1. raw_submissions is append-only — never UPDATE or DELETE
2. auth_log is append-only — never UPDATE or DELETE
3. Contracts are versioned — new version = new file, never edit v1
4. Migrations are forward-only — no DROP TABLE, no destructive ALTERs
5. Do NOT modify public/ — Dalia's HTML files.
   **Narrow exception:** a minimal, additive patch is acceptable in a
   Dima-branch if it repairs a bug inside a file she authored AND the
   Vue SPA depends on the fixed behaviour AND the commit message
   spells out the override rationale for PR review. Examples: adding
   an Authorization header to a fetch so her print page works in prod,
   wiring in a field already in the schema. NOT acceptable: redesigning
   her UI, refactoring structure, deleting features. When in doubt,
   open a GitHub issue for Dalia instead of editing.
6. LAN-only system — no external API calls
7. Optimistic locking — WHERE version = $expected, 409 on mismatch

## Tape export (context menu)

Right-click any tape row → export full tape data (all process steps) in Excel/CSV/JSON.
- Multi-select: Shift+Click / Ctrl+Click in table + constructor checkboxes (🔧 column) — union is exported
- 🔧 header click: toggle select all visible (respects column filters) / deselect all
- Composable: `client-web/src/composables/useExportTapes.js` — fetches full data via `GET /api/tapes/:id` + 7 step endpoints
- CrudTable emit: `@export({ format, items })` — parent handles data collection
- CrudTable prop: `export-badge` — external count shown in menu labels

## Frontend component architecture

All CRUD pages follow the **constructor pattern** — reusable components from Design System, pages only define data + custom cells.

### CrudTable.vue (universal table component)
Extracted 1-to-1 from DesignSystemPage Section 9. Includes ALL features:
- Sticky toolbar (name editing, CSV export, rows-per-page, column count)
- Excel-like column filters (overlay with search, checkboxes, apply/reset)
- Row selection (click, Shift+range, Ctrl+toggle) with visual highlight
- Custom context menu (glass-card, "Удалить" with multi-select count)
- Auto-fit column width on resizer double-click
- Pagination with filter reset

**Usage in a page:**
```vue
<CrudTable :columns="columns" :data="items" id-field="item_id"
  table-name="Название" show-add @add="..." @delete="..." @row-click="...">
  <template #col-fieldName="{ data }">custom render</template>
</CrudTable>
```

### SaveIndicator.vue (save/unsave indicator)
Goes into PageHeader `#actions` slot. Two states: unsaved (ochre) / saved (green with checkmark animation, fades after 2s).

```vue
<PageHeader title="..." icon="...">
  <template #actions>
    <SaveIndicator :visible="..." :saved="..." @save="..." @cancel="..." />
  </template>
</PageHeader>
```

### Adding a new CRUD page
1. Define `columns` array (field, header, width, sortable, filterable)
2. Load data from API
3. Use `<CrudTable>` + `<SaveIndicator>` — zero table CSS needed
4. Add custom `#col-{field}` slots only for non-standard cells (badges, dates, etc.)

## Vue frontend conventions

Foundational principles + a pattern catalog for Vue work. Accumulated
from the Item 1–5 / A–E / Phase β/γ/δ integration sprints. Read this
BEFORE designing any new Vue feature — it saves the "how does Vue do
X?" grep cycle every time.

### Port functionality, not UX

Dalia's HTML shows what a feature DOES (upload file, edit actual
mass, grant access). It does NOT dictate how the Vue SPA renders it.
When porting, grep Vue for the nearest existing pattern — don't
invent new UX because "that's how her page looked". The integration
work is a translation, not a transplant.

Concrete: if her legacy page uses a green "Delete" button per row,
do not copy that. Vue tables use right-click context menu for delete
(`CrudTable` pattern); Vue file-attachment lists use an inline
`pi-trash` button (`MaterialsPage` pattern). Pick the Vue-idiom that
matches the shape of your data.

### UX pattern catalog (canonical homes)

| UI kind | Use this | Located |
|---|---|---|
| CRUD table | `CrudTable` + `#col-{field}` slots; right-click → context menu | `components/CrudTable.vue` |
| File attachment list | Card with inline `pi-trash` button per row + `confirm('...')` + in-flight guard | `pages/reference/MaterialsPage.vue` — `deleteFile` pattern |
| File upload queue | Staged queue with per-file notes, sequential POSTs, client-side size cap | `components/BatteryElectrochemEditor.vue` |
| Modal dialog | PrimeVue `<Dialog v-model:visible="…">` + `#footer` slot with Cancel + Action | scoped per page |
| Popover | PrimeVue `<Popover>` via parent ref `.toggle(event)` anchoring | `components/CyclingStylePopover.vue` |
| Toolbar save indicator | `SaveIndicator` in `PageHeader #actions` slot | `components/SaveIndicator.vue` |
| Multi-entity constructor | `TapeConstructor` (generic) with `:stageConfigs`/`:stateFactory`/`:entityType` props | `components/TapeConstructor.vue` |
| Stage navigator + field editor | `StageNavigator` + `StageCompareEditor` | `components/` |
| Auto-save per stage | 800 ms debounce via `_scheduleAutoSave` in `use*State.js` | composable |
| Async fetch-by-id cache | `useBackendCache` with concurrency cap + invalidation-race guard + `isEmpty` verdict | `composables/useBackendCache.js` |
| Error surfacing | `classifyAxiosError(err)` → `errorMessageRu(code, context)` → toast | `utils/errorClassifier.js` |
| Contextual "why is this cell missing" hint | `capacityIncompleteHint(summary, context)` + ochre `pi-question-circle` icon | `utils/formatCapacity.js` |
| File → base64 upload | `fileToBase64(file)` util | `utils/fileToBase64.js` |
| Tooltip | `v-tooltip.top="'text'"` directive (PrimeVue, globally registered in `main.js`) | `main.js` registers |
| Glass-card panel | White bg, `border: 1px solid rgba(0,50,116,0.12)`, `border-radius: 10px`, padding 10–14 px | project-wide convention |
| Section header (uppercase) | `font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(0,50,116,0.50)` | project-wide convention |
| Accent colors | Primary `#003274` navy · accent `#52C9A6` green · warning/hint `#d4a441` ochre · danger `rgba(200,80,70,…)` | project-wide palette |

### Shared singletons (single source of truth)

Before writing a helper, check if one exists here. Factor a new one
out only when the second copy appears — two usage sites is the
threshold, not one.

- **`config/navigation.js`** — sidebar + router + pages, derived from
  one `workflowSections` / `testSections` / `referenceSections` /
  `adminSections` array. Update here, everything else follows.
- **`utils/formatCapacity.js`** — every capacity / mass / voltage /
  fraction-status display string. `capacityIncompleteHint` for
  contextual tooltips when a cell shows "—".
- **`utils/errorClassifier.js`** — axios error → `'auth' | 'missing'
  | 'server' | 'network'` → Russian message. `'empty'` is a separate
  verdict produced by `useBackendCache.isEmpty`.
- **`utils/fileToBase64.js`** — browser `File` → base64 payload
  (strips the `data:<mime>;base64,` prefix).
- **`composables/useBackendCache.js`** — fetch-by-id with cache,
  dedup, throttle, invalidation-race guard via gen counter. The
  pattern for any per-id side-channel (capacity summaries, electrochem
  file lists, electrode-batch reports).
- **`composables/useCyclingStyles.js`** — per-chart style presets
  keyed by user, palette library + preset save/rename/delete.

### Composable return conventions

`use*State.js` composables return a MIX of refs and reactive objects.
Consumers MUST handle them correctly:

```js
const s = useTapeState({ tapeId })

// refs — USE .value
s.currentTapeId.value
s.currentRecipeLines.value
s.loading.value
s.anyDirty.value          // (computed ref — also .value)

// reactive objects — DIRECT access, no .value
s.general.tapeRecipeId
s.steps.coating.operator
s.slurryActuals[lineId].mode
s.instancesByLineId[lineId]
```

Passing a composable instance through a prop — refs inside the prop
object are NOT auto-unwrapped:

```js
<MyEditor :tapeState="state" />

// Inside MyEditor — still need .value
const lines = computed(() => props.tapeState?.currentRecipeLines?.value || [])
```

### Preference order when a feature touches Dalia's side

Prefer lower-impact changes to higher-impact ones. From most to least
preferable:

1. **Our-side utility** in `client-web/src/utils/` or
   `client-web/src/composables/` — e.g. `fileToBase64`,
   `capacityIncompleteHint`.
2. **Our-side middleware** in `app.js` — e.g. Phase δ legacy
   redirect (commit `0798001`). Intercepts user-facing behaviour
   without touching her files.
3. **New route** in `routes/*.js` — purely additive endpoints we
   own (Dima-added functionality she hasn't built), e.g. a future
   `DELETE /api/batteries/battery_electrochem/:id`.
4. **Narrow patch to `public/*.js` or `public/*.html`** — ONLY for
   bugfixes where her file has a real defect AND the Vue SPA depends
   on the fixed behaviour. Commit body MUST spell out the override
   rationale for her PR review. Precedent: auth-header patches on
   her print JS (commits `2cca4b4` + `93d9471`). NOT acceptable:
   UX redesign, structural refactor, feature deletion. When in
   doubt → open a GitHub issue on her repo instead.

Phase δ (`0798001`) is the template for option 2 when a change spans
multiple of her files.

### Common pitfalls (from this project's history)

Numbered so we can link to them from PR reviews.

1. **`|| null` silently drops `0`.** For numeric fields that legitimately
   accept zero (OCV, ESR, masses), use `x === '' ? null : Number(x)`
   with a `Number.isFinite` guard. See commit `e6b6232`; G1's
   `toNum()` helper in `useBatteryState.saveStep('qc')` is the canonical
   shape.

2. **Vue 3 `watch(ref, cb, { deep: true })` on in-place mutations**
   delivers `oldValue === newValue` — the deep-watcher doesn't snapshot
   before the mutation. Use the getter form:
   ```js
   watch(() => [...constructorIds.value], (ids, oldIds) => { ... })
   ```
   Diagnosed during Phase 0 `useBackendCache` migration.

3. **Refs inside prop objects are NOT auto-unwrapped.** See the
   "Composable return conventions" table above. Always `.value` when
   reaching through a prop to a ref property.

4. **"Script exists, template missing" regression class.** State and
   handlers wired in `<script setup>`, but the `<Dialog>` / component
   that consumes them was never committed. Silent no-op on user
   click, build passes clean. Example: mass editor regression in
   commit `6508738` → fixed `ddef3b1`. Sweep periodically for `show*`
   / `*Visible` refs referenced only in script.

5. **Static `/uploads/*` has no auth** (pre-existing Dalia behaviour).
   File-attachment links work without a Bearer token — insecure on a
   LAN. Tracked in Dalia PR backlog. Don't build Vue features that
   assume auth-gated downloads until this is fixed.

6. **`express.json({ limit: '10mb' })` + base64 inflation `×1.34`**
   → practical per-file upload cap is ~7 MB raw. We enforce 6 MB
   client-side (`BatteryElectrochemEditor.vue` `MAX_FILE_BYTES`) for
   margin. Sequential per-file POST avoids batch compounding.

7. **`/reference/users` is admin-gated.** Non-admin users landing there
   (e.g. via a legacy `/reference/users.html` bookmark after Phase δ
   redirect) used to get silently bounced to `/` by `router.beforeEach`.
   Now flashed via `?denied=<role>` query param that `HomePage` picks
   up on mount and surfaces as a toast, then strips from the URL. When
   adding a new role-gated route, confirm it has `meta.role` set so
   the guard runs — otherwise the same silent-bounce problem recurs.

8. **`actual_fraction_status === 'incomplete' | 'unavailable' | 'complete'`**
   are three different states. `'unavailable'` = no recipe actuals at
   all; `'incomplete'` = some but not all; `'complete'` = all present.
   `capacityIncompleteHint` picks the right message per case.

9. **Don't duplicate the «№» column.** `CrudTable` always renders a
   frozen row-number column with header «№» on the left. Pages that
   need to expose the entity's PK (e.g. `cut_batch_id`, `battery_id`)
   should pick a distinct header — «Партия» / «Аккум.» — and let the
   cell renderer keep the `#42` prefix. Reading «Партия #42» / «Аккум.
   #42» makes the column's purpose explicit and disambiguates from
   the position-in-current-view row number. Fixed in commit `3eda29d`
   (ElectrodesPage, AssemblyPage).

10. **«Тип» vs «Роль» for cathode/anode.** Cathode/anode is electrode
    polarity / type, NOT a functional role. Header label MUST be «Тип»
    everywhere this data shows up (TapesPage was right; ElectrodesPage
    was the anomaly until commit `bd5063e`). «Роль» stays for: user
    role (admin/lead/employee in ProfilePage / UsersPage), recipe-line
    `recipe_role` (active / binder / conductive / solvent in
    RecipesPage). The DB column `tape_role` keeps its name (Dalia's
    schema) — only Vue display labels change.

11. **Pipeline progress = segment bar, not text status.** TapesPage
    has 8 segments (one per workflow step), ElectrodesPage 3 (created
    / drying_start / drying_end). Both use `.progress-segments` +
    `.progress-seg` + `.progress-seg--done`, with a `:title=` on the
    parent `<div>` for the textual stage. AssemblyPage's
    `status_display` STAYS textual because battery status is a
    business state machine (draft / assembled / testing / completed
    / failed), not a linear pipeline — segment bar wouldn't fit.

12. **Operator info auto-fills from login, never from a Select.**
    `created_by` MUST come from `req.user.userId` on the backend
    (`routes/projects.js:157` template), and the frontend MUST NOT
    expose a "Кто добавил" picker. The visible audit trail lives in
    `EntityMeta` (Создано: ФИО, дата · Изменено: ФИО, дата) at the
    bottom of edit dialogs and as a "Оператор" column on list views.
    Pattern verified via the compliance sweep `71c095e` + `10570a5`
    on the 4 reference CRUD pages. When adding a NEW reference page,
    follow the same shape: backend forces `req.user.userId` (no body
    `created_by` accepted), frontend has zero `created_by` form
    state, list has `{ field: 'created_by_name', header: 'Оператор',
    minWidth: '90px', width: '130px' }`, dialog has `<EntityMeta>`
    block between form and footer fed from a `currentItem` ref.

## Remotes

- **origin: `git@github.com:chem-coder/1_BADB---Battery-Assembly-Database.git` (Dalia) — main repo**
- Dima's personal repo: `git@github.com:i-user-ml/BADB-Battery-Assembly-Database.git` (integration prep only)

## Workflow

- **Both developers work in Dalia's repo** (`chem-coder/1_BADB`)
- Dima creates feature branches → opens PR → Dalia reviews and merges
- Branch naming: `dima/<feature-name>` (e.g. `dima/integrate-auth-frontend`)
- NEVER force push to main
- NEVER commit directly to main — always use a branch + PR

## Sync with Dalia's main (MANDATORY — run at session start)

Dalia pushes to `origin/main` between our sessions. Without periodic
sync, our feature branch silently drifts — we work against an old
snapshot, miss her new features, and accumulate a merge surprise.

**Session-start checklist** (run before any code work on a long-running
feature branch):

```bash
# 1. Refresh remote refs (silent no-op if nothing changed)
git fetch origin

# 2. Show what's in main that we don't have
git log --oneline origin/main ^$(git merge-base origin/main HEAD)

# 3. Show our unpushed commits
git log --oneline origin/$(git branch --show-current)..HEAD

# 4. Dry-run merge to detect conflicts early
git merge-tree $(git merge-base origin/main HEAD) HEAD origin/main \
  | grep -cE "^<<<<<<<|^=======|^>>>>>>>"
#   → 0 means clean merge
```

If step 2 shows new commits from Dalia, **merge before starting new
work**:

```bash
git merge origin/main --no-edit
# Run any new migrations she added:
for f in migrations/d*.sql; do
  # Only run ones newer than you've applied — check migrations_log.txt
  psql -U Dalia -d badb_app_v1 -f "$f"
done
# Update migrations_log.txt to reflect your now-applied range
```

**Namespace rule** (already documented in migrations/README.md):
- Dima: `NNN_*.sql` (numeric prefix — 001…020…)
- Dalia: `dNNN_*.sql` (d-prefix — d001…d027…)
- Roma: future namespace TBD

Namespaces never collide → merges stay clean even when both sides
add migrations in parallel.

**migrations_log.txt** — Dalia's shared tracker. Each developer
records their last-applied migration so the others know what's
current on each machine. Update it after applying a batch.

## Avoiding drift during a session

When Chat 1 and Chat 2 (or two humans) edit the same worktree in
parallel, commit dances get tangled. Proven strategy:

1. **One owner per file per task** — if Chat 1 does retention toggle
   (CyclingPage.vue state + toolbar), Chat 2 should not edit the
   same toolbar block the same hour.
2. **`git add <path>` is explicit, `git add -A` is destructive** —
   when another chat has uncommitted WIP in the worktree,
   `-A` picks it up and credits it to your commit.
3. **Backup → revert → reapply dance** — if you must commit your
   isolated change while another chat's WIP sits in the worktree:
   ```bash
   cp client-web/src/components/X.vue /tmp/bak.vue
   git checkout HEAD -- client-web/src/components/X.vue
   # re-apply only your edits (Edit tool with exact strings)
   git add client-web/src/components/X.vue
   git commit
   cp /tmp/bak.vue client-web/src/components/X.vue  # restore WIP
   ```
4. **Push immediately after commit** — keeps origin authoritative
   so the other chat can rebase on top of your work.

## Feature integration protocol (design-first)

Retrospective of the 2026-04-21 session found: implementation-first
development on ported Dalia features produced 3–5 audit rounds per
feature, with one 🔴 per feature caught only after the code had been
written. Root cause: writing UI before reading external-API invariants
(Vue 3 watch semantics, axios error shape, PG case folding, Express
body limits). Lesson: a 5-minute design doc upfront saves 30 minutes
of debug cycles.

**Flow for every non-trivial Vue integration of a backend feature:**

1. **Design doc** (5–10 min). One page, in-chat or in `docs/designs/`.
   Fields:
   - *User story* — who does what, when, and why.
   - *Backend contract* — exact endpoint path, request shape, response
     shape, error codes (401/404/500/network).
   - *Vue placement* — which page, which region, trigger (watcher?
     button? mount?).
   - *State design* — cache keyed by what, invalidation trigger,
     loading flag, error flag enum.
   - *Edge cases checklist* — empty data, auth expired, network
     timeout, concurrency fan-out, same-id double toggle, deep-link.
   - *Known quirks to check* — framework behaviour at the exact point
     of use. Example: "Vue 3 `watch(ref, cb, {deep:true})` — does
     oldValue snapshot on in-place mutation?" — check BEFORE coding.
   - *Formatting consistency* — same precision / label / date format
     as the rest of the app and Dalia's legacy page.

2. **Agent design review** (3 min). Give the doc to a general-purpose
   agent with the prompt "what invariants are missing? what edge cases
   are unhandled? what framework quirks could bite?". Agent answers
   with concrete refs. Fix the design doc.

3. **Implement** (30–60 min). Work to the design, not on instinct.

4. **Build + node -e syntax check.**

5. **Focused audit** — one agent round, with the design-doc checklist
   as explicit verification scope.

6. **1 round fix if needed** (rare if steps 1–2 were thorough).

7. **Commit + push.**

Expected: 0–1 audit rounds per feature, not 3–5. If a feature needs
more than 1 fix round, pause and write a better design doc for the
next one.

**Scope rule:** 1 feature = 1 commit ≤ ~150 lines. Larger scope =
split. A+B in one commit (326 lines) was at the edge — caused several
missed-invariant bugs that wouldn't have slipped if A and B had been
separate design docs.

## Security

- **Authentication:** JWT Bearer tokens, 8h expiry, configurable in config/index.js
- **Roles:** admin, lead, employee
- **Brute-force protection:** 10 failed attempts → 1 hour lockout
- **Audit log:** every login (success/fail), registration → auth_log (append-only)
- **Password hashing:** bcrypt, 10 rounds

## Pre-commit gate (MANDATORY)

**Before EVERY `git add` and `git commit`, run this checklist. ANY violation = STOP, do not commit.**

### ALLOWED in repo (whitelist)

| Path | Contents | Rule |
|------|----------|------|
| `*.js` (root) | Server entry points | app.js, server.js only |
| `config/` | Server config | Source only |
| `db/` | Database pool | Source only |
| `middleware/` | Express middleware | Source only |
| `routes/` | Express route handlers | Source only |
| `migrations/` | SQL migrations | Forward-only. Never edit existing files |
| `public/` | Dalia's HTML | READ-ONLY. Never modify, never delete |
| `contracts/` | JSON Schema .json | Versioned. Never edit v1 files |
| `client/src/` | VBA .bas, .cls, .frm | Source only |
| `client-web/src/` | Vue 3 source | Source only. Never `node_modules/`, `dist/` |
| `.gitignore` | Git ignore rules | OK to update |
| `CLAUDE.md` | AI instructions | OK to update |
| `README.md` | Project readme | OK to update |
| `package.json` | Dependencies | OK to update |

### FORBIDDEN in repo (blacklist) — NEVER commit these

| Path / Pattern | Reason |
|----------------|--------|
| `obsidian_badb/`, `badb-vault-master/` | Personal Obsidian vault — local only |
| `docs/`, `local/` | Course documents, drafts — local only |
| `node_modules/` | Dependencies — install from package.json |
| `.env`, `.env.*` | Secrets — NEVER in git |
| `*.log` | Logs — ephemeral |
| `dist/`, `build/` (output) | Build artifacts |
| `~$*.xl*`, `*.tmp` | Office temp files |
| `.DS_Store`, `Thumbs.db` | OS metadata |
| `.claude/` | Claude Code local state |

### Pre-commit check script

```bash
FORBIDDEN=$(git diff --cached --name-only 2>/dev/null | grep -E \
  "obsidian_badb/|badb-vault-master/|docs/|local/|node_modules/|\.env|\.log$|dist/|build/|~\\$|\.tmp$|\.DS_Store|Thumbs\.db|\.claude/")

if [ -n "$FORBIDDEN" ]; then
  echo "BLOCKED: forbidden files in commit:"
  echo "$FORBIDDEN"
  exit 1
fi

if git diff --cached --name-only | grep -q "^public/"; then
  echo "BLOCKED: public/ must not be modified (Dalia's code)"
  exit 1
fi

if git diff --cached --name-only | grep -qE "contracts/.*\.v1\.json$"; then
  if git diff --cached -- 'contracts/*.v1.json' | grep -q "^[+-]"; then
    echo "BLOCKED: v1 contracts must not be edited — create v2 instead"
    exit 1
  fi
fi

MODIFIED_MIGRATIONS=$(git diff --cached --name-only --diff-filter=M -- migrations/)
if [ -n "$MODIFIED_MIGRATIONS" ]; then
  echo "BLOCKED: existing migrations must not be edited:"
  echo "$MODIFIED_MIGRATIONS"
  exit 1
fi

echo "Pre-commit check: PASSED"
```

### Mandatory actions BEFORE pushing

1. Run pre-commit check script (above)
2. `git diff --cached --stat` — review what goes in
3. Confirm NO forbidden paths in output
4. Confirm public/ untouched
5. Confirm no secrets (.env, passwords, tokens) in diff
6. `node -e "require('./app')"` — syntax check passes

## Code audit procedure

When running a code audit (bug search), follow this two-phase process.

### Phase 1 — Discovery (agents)

Launch parallel agents to scan for bug candidates by category (security, data integrity, frontend state, error handling, etc.). Agents are good at broad coverage — they can quickly flag suspicious patterns across many files.

**Agent output = hypotheses, not facts.** Agents match patterns (e.g. "CRUD route without rowCount check") but frequently do not read surrounding code carefully enough to confirm the issue is real.

### Phase 2 — Verification (manual, MANDATORY)

Every candidate from Phase 1 MUST be verified before it goes into a report, a fix, or a commit:

| Check | How |
|-------|-----|
| "File X has no Y" | Open file, read the relevant function — does it actually lack Y? |
| "SQL injection in Z" | Grep for string interpolation in the actual query — are values parameterized? |
| "Missing validation" | Read the handler — is validation present but in a different form? |
| "Hardcoded value" | Grep for the literal — does it actually exist in the file? |

**Rules:**
1. **No unverified bugs in reports or commits.** If you can't confirm it by reading the code, drop it.
2. **Read the actual code, not a summary.** Agent descriptions of what a file "probably does" are unreliable.
3. **Check for false patterns.** A file named `users.js` does not necessarily handle passwords. A CRUD route may already have the check the agent claims is missing.
4. **Verify fixes too.** After applying a fix, re-read the changed code to confirm it's correct and doesn't break existing logic.

### Common false positive patterns

These were observed in practice (April 2026 audit) and should be watched for:

- **"No password hashing"** — agent assumed a users endpoint handles passwords when it only handles names
- **"SQL injection"** — agent flagged template literals but all values were parameterized (`$1, $2`)
- **"Missing 404 check"** — agent didn't read far enough to see the existing `rowCount === 0` check
- **"Hardcoded URL/port"** — agent assumed a common anti-pattern without grepping the actual files
- **"No input validation"** — agent missed validation done in a different style (e.g. `Number.isInteger()` instead of `if (!field)`)

### Audit output format

After verification, split findings into:
- **Confirmed bugs in our code** → fix directly in the current branch
- **Confirmed bugs in Dalia's code** → document in a report file, but only after verification
- **Unconfirmed / stylistic** → drop silently
