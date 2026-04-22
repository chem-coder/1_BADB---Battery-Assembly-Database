# Windows database backup

This folder contains a simple Windows backup setup for the `badb_app_v1` PostgreSQL database.

## Files

- `backup_badb.ps1` — PowerShell backup script
- `backup_badb.bat` — batch launcher for Task Scheduler

## What the script does

- runs `pg_dump`
- writes backups into the repo's `sql_backups` folder
- prefixes the filename with date and time
- removes old backups after a retention period

Example output file:

```text
2026-04-02_14-30-badb_app_v1-full.sql
```

## Before first run

Make sure `pg_dump` is available in `PATH`.

Test in PowerShell:

```powershell
pg_dump --version
```

If that fails, add PostgreSQL's `bin` folder to your Windows `PATH`, for example:

```text
C:\Program Files\PostgreSQL\17\bin
```

## Authentication

The script does not store the password itself.

Use one of these:

1. Set a persistent `PGPASSWORD` user environment variable in Windows.
2. Better: create `%APPDATA%\postgresql\pgpass.conf`.

Example `pgpass.conf` line:

```text
localhost:5432:badb_app_v1:postgres:your_password_here
```

Then lock down the file so only your Windows user can read it.

## Manual run

From PowerShell inside `BADB_main`:

```powershell
.\windows_scripts\backup_badb.ps1
```

Or with the batch file:

```powershell
.\windows_scripts\backup_badb.bat
```

## Useful overrides

Use a different DB user:

```powershell
.\windows_scripts\backup_badb.ps1 -DbUser "Dalia"
```

Keep backups for 14 days:

```powershell
.\windows_scripts\backup_badb.ps1 -KeepDays 14
```

Write to a custom folder:

```powershell
.\windows_scripts\backup_badb.ps1 -BackupDir "C:\BADB\SQL_BACKUPS"
```

## Task Scheduler setup

1. Open `Task Scheduler`.
2. Click `Create Basic Task...`.
3. Name it `BADB daily backup`.
4. Choose the trigger:
   - `Daily` for once a day
   - `One time`, then in advanced settings repeat every 1 hour, if you want hourly
5. Choose `Start a program`.
6. Program/script:

```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
```

7. Add arguments:

```text
-NoProfile -ExecutionPolicy Bypass -File "C:\path\to\BADB_main\windows_scripts\backup_badb.ps1" -DbUser "postgres"
```

8. Start in:

```text
C:\path\to\BADB_main
```

If you prefer, you can schedule the `.bat` file instead:

- Program/script:

```text
C:\path\to\BADB_main\windows_scripts\backup_badb.bat
```

## Notes

- The repo already uses `sql_backups`, so this script writes there by default.
- If you want backups in a separate Windows folder, use `-BackupDir`.
- If you want plain SQL dumps with inserts only or compressed dumps, that can be added later.
