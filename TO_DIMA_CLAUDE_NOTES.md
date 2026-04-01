# Notes For Dima / Claude Code

This is a small handoff note about a few things in [`CLAUDE.md`](/Users/Dalia/Developer/RENERA/BADB_main/CLAUDE.md) and the current database backup situation.

## Suggested updates to `CLAUDE.md`

- The documented backend port should probably be updated from `3001` to `3003`.
  - Current actual config: [`config/index.js:8`](/Users/Dalia/Developer/RENERA/BADB_main/config/index.js#L8)
  - Places to review in [`CLAUDE.md`](/Users/Dalia/Developer/RENERA/BADB_main/CLAUDE.md):
    - stack / DB line mentioning older setup
    - commands table
    - dev environment / ports section
    - API flow example
    - CORS / proxy wording

- The documented database name should probably be updated from `badb_v1` to `badb_app_v1`.
  - Current actual config: [`config/index.js:13`](/Users/Dalia/Developer/RENERA/BADB_main/config/index.js#L13)

- The "do not modify `public/`" note is a nice touch :) leaving it as Dalia's side since `public/` is the scientist-facing HTML/JS work area.

## Current SQL backup to look at

Inside this folder there is a newer joined backup from March 30:

- [`sql_backups/0330_joined_badb_app_v1.sql`](/Users/Dalia/Developer/RENERA/BADB_main/sql_backups/0330_joined_badb_app_v1.sql)

This backup is meant for the database now named:

- `badb_app_v1`

## Suggested restore flow

If the target database does not exist yet:

```bash
createdb badb_app_v1
psql -d badb_app_v1 -f "/Users/Dalia/Developer/RENERA/BADB_main/sql_backups/0330_joined_badb_app_v1.sql"
```

If the database already exists and should be replaced, drop/recreate it first, then restore:

```bash
dropdb badb_app_v1
createdb badb_app_v1
psql -d badb_app_v1 -f "/Users/Dalia/Developer/RENERA/BADB_main/sql_backups/0330_joined_badb_app_v1.sql"
```

## Important ownership caveat

The dump contains many explicit ownership statements like:

- `ALTER TYPE ... OWNER TO "Dalia";`
- `ALTER TABLE ... OWNER TO "Dalia";`
- `ALTER SEQUENCE ... OWNER TO "Dalia";`
- `ALTER FUNCTION ... OWNER TO "Dalia";`

Examples appear very early in the file:

- [`sql_backups/0330_joined_badb_app_v1.sql:48`](/Users/Dalia/Developer/RENERA/BADB_main/sql_backups/0330_joined_badb_app_v1.sql#L48)
- [`sql_backups/0330_joined_badb_app_v1.sql:281`](/Users/Dalia/Developer/RENERA/BADB_main/sql_backups/0330_joined_badb_app_v1.sql#L281)

This means restore may fail on another machine unless one of these is true:

- the PostgreSQL role `"Dalia"` already exists
- the restore is done by a superuser who can assign ownership
- the dump is edited or re-exported without ownership assumptions

So if restore fails with owner-related errors, that is one of the first things to check.

## Intent of this note

This is not a directive to rewrite `CLAUDE.md` in a particular way.
It is just a short list of places where current runtime reality and current documentation may have drifted apart.
