# Vanilla API Auth And Ownership Policy

Updated: 2026-04-25

Scope: the vanilla app under `public/` and the Express routes it calls.

## Rules

- `created_by` and `updated_by` audit fields are server-owned.
- Browser-sent `created_by` and `updated_by` values are ignored on create/update
  routes that write ownership metadata.
- Workflow operator fields that describe lab work, such as
  `tape_process_steps.performed_by`, remain explicit payload fields.
- Auth bypass is development-only. `server.js` refuses to start in production
  when `AUTH_BYPASS=true`.
- Print/report endpoints that intentionally remain unauthenticated are listed
  below so they are not mistaken for accidental gaps.

## Server-Owned Audit Fields

| Route family | Methods | Server-owned fields |
| --- | --- | --- |
| `/api/projects` | `POST`, `PUT` | `created_by`, `updated_by` |
| `/api/recipes` | `POST`, `POST /:id/duplicate`, `PUT` | `created_by`, `updated_by` |
| `/api/separators` | `POST`, `PUT` | `created_by`, `updated_by` |
| `/api/electrolytes` | `POST`, `PUT` | `created_by`, `updated_by` |
| `/api/tapes` | `POST`, `PUT` | `created_by`, `updated_by` |
| `/api/tapes/:id/dry-box-state` | `PUT`, `POST return/remove/deplete` | `updated_by` |
| `/api/electrodes/electrode-cut-batches` | `POST`, `PUT` | `created_by`, `updated_by` |
| `/api/batteries` | `POST`, `PATCH /:id` | `created_by`, `updated_by` |
| `/api/materials` and material detail routes | `POST`, `PUT` | `updated_by` |
| `/api/users` | `POST`, `PUT`, `DELETE` | auth role gates decide who can write |

## Browser-Owned Domain Fields

| Field | Meaning | Notes |
| --- | --- | --- |
| `performed_by` | Lab operator who performed a tape workflow step | Kept as explicit payload because it is domain data, not auth metadata. |
| `lead_id` | Project lead | Kept as explicit payload because assigning a project lead is business data. |
| battery electrode/source IDs | Selected physical inventory | Kept as explicit payload and validated by route logic. |

## Auth Requirements

| Route family | Policy |
| --- | --- |
| Reference/read lists used by vanilla forms | Auth required unless documented otherwise in `contracts/vanilla_api_endpoints.json`. |
| Mutating vanilla routes | Auth required. |
| `/api/tapes/:id/dry-box-state*` | Auth required; `updated_by` is now derived from `req.user`. |
| `/api/tapes/:id/report` | Currently public report endpoint. |
| `/api/batteries/:id/report` | Currently public report endpoint. |
| `/api/batteries/:id/electrode-cut-batches` | Currently public compatibility/read endpoint. |

## Smoke Coverage

`npm run smoke:vanilla` attempts to forge `created_by` / `updated_by` with a
different valid user and asserts that the API records the authenticated bypass
user instead.
