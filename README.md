# BADB — Battery Assembly Database

LIMS/ELN-lite for battery assembly R&D lab.

## Stack

| Layer | Technology |
|---|---|
| Server | Node.js + Express 5 |
| Database | PostgreSQL 16 (`badb_v1`, 42 tables) |
| Auth | JWT Bearer, 8h expiry, bcrypt |
| Web client | Vue 3 + PrimeVue 4 + Vite |
| Excel client | VBA (DatabaseUI.xlam) |
| Validation | JSON Schema draft-07 (AJV) |

## Project structure

```
BADB/
├── app.js              — Express app entry point
├── server.js           — HTTP server start
├── config/index.js     — port, DB, JWT, bcrypt, rate limits, roles
├── db.js               — PostgreSQL pool
├── db/pool.js          — adapter (re-exports db.js)
├── middleware/
│   ├── auth.js         — JWT verification + role checking
│   ├── validate.js     — AJV JSON Schema validation
│   └── errorHandler.js — centralized error handling
├── routes/
│   ├── index.js        — route registration
│   ├── auth.js         — /api/auth
│   ├── batteries.js    — /api/batteries (32 endpoints)
│   ├── electrodes.js   — /api/electrodes
│   ├── materials.js    — /api/materials + instances
│   ├── tapes.js        — /api/tapes + steps + actuals
│   ├── recipes.js      — /api/recipes
│   ├── reference.js    — /api/reference
│   └── ...             — separators, structures, projects, electrolytes
├── migrations/         — forward-only SQL (001–006)
├── contracts/          — JSON Schema contracts (versioned)
├── client/src/         — VBA source (.bas/.cls/.frm)
├── client-web/         — Vue 3 frontend
└── public/             — static HTML
```

## Getting started

```bash
# 1. Install dependencies
npm install
cd client-web && npm install && cd ..

# 2. Apply migrations
psql -d badb_v1 -f migrations/006_add_auth_to_dalia_db.sql

# 3. Create first admin user
node -e "const b = require('bcryptjs'); b.hash('yourpassword', 10).then(h => console.log(h))"
# then in psql:
# INSERT INTO users (name, password_hash, role, active) VALUES ('admin', '<hash>', 'admin', true);

# 4. Start dev server
npm run dev
```

## Ports

| Service | Port |
|---|---|
| API server | 3003 |
| Vite dev server | 5173 |

Browser: http://localhost:5173

API requests: Browser (5173) → /api/* → Vite proxy → localhost:3003 → PostgreSQL

## Auth

All endpoints except `/api/auth/login` require JWT Bearer token:

```
Authorization: Bearer <token>
```

Roles: `admin`, `lead`, `employee`

## Key invariants

* `raw_submissions` and `auth_log` are append-only — never UPDATE or DELETE
* Migrations are forward-only — no DROP TABLE, no destructive ALTER
* `public/` is read-only — do not modify
* All API calls go through Vite proxy — never hardcode ports in frontend

## Team workflow

* Main repo: `chem-coder/1_BADB---Battery-Assembly-Database`
* Feature branches: `name/feature-name` → Pull Request → review → merge
* Never commit directly to main
