#!/usr/bin/env node
/**
 * BADB Database Backup / Restore Script
 * Cross-platform (Mac/Windows), uses pg_dump/pg_restore.
 *
 * Standards:
 *   - Pre-flight checks (DB connectivity, disk space)
 *   - Post-backup verification (pg_restore --list)
 *   - SHA-256 checksum for integrity across transfers
 *   - Manifest with metadata (tables, PG version, row counts)
 *   - Lock file to prevent concurrent backups
 *   - Append-only log file for audit trail
 *   - Rotation with guaranteed minimum retention
 *
 * Usage:
 *   node scripts/backup.js                      # backup (custom format)
 *   node scripts/backup.js --format=plain       # backup (readable SQL)
 *   node scripts/backup.js --restore latest     # restore latest backup
 *   node scripts/backup.js --restore <file>     # restore specific file
 *   node scripts/backup.js --keep-days=30       # rotate: keep 30 days
 *   node scripts/backup.js --copy-to=/mnt/nas   # copy backup to shared path
 *   node scripts/backup.js --dry-run            # show what would be done
 *   node scripts/backup.js --list               # list available backups
 *   node scripts/backup.js --verify <file>      # verify a dump file
 */

const { spawnSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

// ── Config ────────────────────────────────────────────────────────────
const config = require('../config')
const DB_USER = config.db.user
const DB_NAME = config.db.database
const BACKUP_DIR = path.join(__dirname, '..', 'sql_backups', 'auto')
const LOG_FILE = path.join(BACKUP_DIR, 'backup.log')
const LOCK_FILE = path.join(BACKUP_DIR, '.backup.lock')

const DEFAULTS = {
  format: 'custom',
  keepDays: 30,
  keepMin: 5,
}

// ── Logging ───────────────────────────────────────────────────────────
function log(message, level = 'INFO') {
  const ts = new Date().toISOString()
  const line = `[${ts}] [${level}] ${message}`
  console.log(`  ${message}`)
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, line + '\n')
  } catch { /* log file write failure is non-fatal */ }
}

function logError(message) { log(message, 'ERROR') }

// ── Lock file (prevent concurrent backups) ────────────────────────────
function acquireLock() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  if (fs.existsSync(LOCK_FILE)) {
    const lockData = fs.readFileSync(LOCK_FILE, 'utf8').trim()
    const lockAge = Date.now() - fs.statSync(LOCK_FILE).mtimeMs
    // Stale lock: older than 30 minutes → remove
    if (lockAge > 30 * 60 * 1000) {
      log(`Stale lock removed (age: ${Math.round(lockAge / 60000)} min, pid: ${lockData})`)
      fs.unlinkSync(LOCK_FILE)
    } else {
      logError(`Backup already running (pid: ${lockData}, age: ${Math.round(lockAge / 1000)}s). Aborting.`)
      process.exit(1)
    }
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid))
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE) } catch { /* ignore */ }
}

// ── Parse CLI args ────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2)
  const opts = { ...DEFAULTS }

  for (const arg of args) {
    if (arg.startsWith('--format='))    opts.format = arg.split('=')[1]
    if (arg.startsWith('--keep-days=')) opts.keepDays = parseInt(arg.split('=')[1], 10)
    if (arg.startsWith('--keep-min='))  opts.keepMin = parseInt(arg.split('=')[1], 10)
    if (arg.startsWith('--copy-to='))   opts.copyTo = arg.split('=')[1]
    if (arg === '--dry-run')            opts.dryRun = true
    if (arg === '--list')               opts.list = true
    if (arg === '--restore')            opts.restore = 'latest'
    if (arg.startsWith('--restore='))   opts.restore = arg.split('=')[1]
    if (arg === '--verify')             opts.verify = 'latest'
    if (arg.startsWith('--verify='))    opts.verify = arg.split('=')[1]
  }

  // Positional after --restore / --verify
  for (const flag of ['--restore', '--verify']) {
    const idx = args.indexOf(flag)
    if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
      opts[flag.slice(2)] = args[idx + 1]
    }
  }

  return opts
}

// ── Find pg tools ─────────────────────────────────────────────────────
function findPgTool(tool) {
  const candidates = [
    tool,
    `/Applications/Postgres.app/Contents/Versions/latest/bin/${tool}`,
    `/Applications/Postgres.app/Contents/Versions/16/bin/${tool}`,
    `/opt/homebrew/bin/${tool}`,
    `/usr/local/bin/${tool}`,
    `C:\\Program Files\\PostgreSQL\\16\\bin\\${tool}.exe`,
    `C:\\Program Files\\PostgreSQL\\15\\bin\\${tool}.exe`,
    `C:\\Program Files\\PostgreSQL\\14\\bin\\${tool}.exe`,
  ]

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
      const cmd = process.platform === 'win32' ? 'where' : 'which'
      const check = spawnSync(cmd, [candidate], { stdio: 'pipe' })
      if (check.status === 0) return check.stdout.toString().trim().split('\n')[0]
    } catch { /* continue */ }
  }
  return null
}

// ── Utilities ─────────────────────────────────────────────────────────
function timestamp() {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`
}

function fileSize(filePath) {
  const bytes = fs.statSync(filePath).size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileSizeBytes(filePath) {
  return fs.statSync(filePath).size
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256')
  const data = fs.readFileSync(filePath)
  hash.update(data)
  return hash.digest('hex')
}

function pgEnv() {
  return { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '', PAGER: '' }
}

// ── Pre-flight checks ─────────────────────────────────────────────────
function preflight(pgDump) {
  // 1. Check pg_dump version
  const ver = spawnSync(pgDump, ['--version'], { stdio: 'pipe', env: pgEnv() })
  if (ver.status !== 0) {
    logError('pg_dump --version failed')
    process.exit(1)
  }
  const pgVersion = ver.stdout.toString().trim()
  log(`pg_dump: ${pgVersion}`)

  // 2. Check DB connectivity
  const psql = findPgTool('psql')
  if (psql) {
    const ping = spawnSync(psql, [
      '--username', DB_USER, '--dbname', DB_NAME, '--no-password',
      '--command', 'SELECT 1',
    ], { stdio: 'pipe', env: pgEnv(), timeout: 10000 })

    if (ping.status !== 0) {
      logError(`БД ${DB_NAME} недоступна: ${ping.stderr?.toString().trim()}`)
      process.exit(1)
    }
    log(`БД ${DB_NAME} доступна`)
  }

  // 3. Check disk space (rough: warn if <500MB free)
  try {
    if (process.platform !== 'win32') {
      const df = spawnSync('df', ['-m', BACKUP_DIR], { stdio: 'pipe' })
      const lines = df.stdout.toString().trim().split('\n')
      if (lines.length >= 2) {
        const avail = parseInt(lines[1].split(/\s+/)[3], 10)
        if (avail < 500) {
          logError(`Мало места на диске: ${avail} MB свободно (нужно >500 MB)`)
          process.exit(1)
        }
        log(`Свободное место: ${avail} MB`)
      }
    }
  } catch { /* non-fatal */ }

  return pgVersion
}

// ── List backups ──────────────────────────────────────────────────────
function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return []
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.includes(DB_NAME) && (f.endsWith('.dump') || f.endsWith('.sql')))
    .sort()
    .reverse()
}

function printBackupList() {
  const files = listBackups()
  if (files.length === 0) {
    console.log('  Нет бэкапов в', BACKUP_DIR)
    return
  }
  console.log(`\n  Бэкапы (${files.length}):\n`)
  for (const f of files) {
    const fullPath = path.join(BACKUP_DIR, f)
    const size = fileSize(fullPath)
    const mtime = fs.statSync(fullPath).mtime.toLocaleString('ru-RU')
    // Check if checksum file exists
    const checksumFile = fullPath + '.sha256'
    const verified = fs.existsSync(checksumFile) ? ' [checksum]' : ''
    console.log(`  ${f}  (${size}, ${mtime})${verified}`)
  }
  console.log()
}

// ── Verify dump ───────────────────────────────────────────────────────
function verifyDump(filePath) {
  if (!filePath.endsWith('.dump')) {
    log('Верификация доступна только для .dump (custom format)')
    return true // plain SQL не верифицируется через pg_restore --list
  }

  const pgRestore = findPgTool('pg_restore')
  if (!pgRestore) {
    log('pg_restore не найден, верификация пропущена', 'WARN')
    return true
  }

  const result = spawnSync(pgRestore, ['--list', filePath], {
    stdio: 'pipe', env: pgEnv(),
  })

  if (result.status !== 0) {
    logError(`Верификация FAILED: дамп повреждён (${path.basename(filePath)})`)
    return false
  }

  // Count objects in dump
  const lines = result.stdout.toString().split('\n').filter(l => l.trim() && !l.startsWith(';'))
  log(`Верификация OK: ${lines.length} объектов в дампе`)
  return true
}

// ── Write manifest ────────────────────────────────────────────────────
function writeManifest(filePath, pgVersion, durationMs) {
  const psql = findPgTool('psql')
  let tableCount = '?'
  let totalRows = '?'

  if (psql) {
    // Table count
    const tc = spawnSync(psql, [
      '--username', DB_USER, '--dbname', DB_NAME, '--no-password', '--tuples-only', '--no-align', '--pset', 'pager=off',
      '--command', "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    ], { stdio: 'pipe', env: pgEnv() })
    if (tc.status === 0) tableCount = tc.stdout.toString().replace(/Pager usage is off\.\n?/g, '').trim()

    // Approximate total rows
    const rc = spawnSync(psql, [
      '--username', DB_USER, '--dbname', DB_NAME, '--no-password', '--tuples-only', '--no-align', '--pset', 'pager=off',
      '--command', "SELECT sum(n_live_tup) FROM pg_stat_user_tables",
    ], { stdio: 'pipe', env: pgEnv() })
    if (rc.status === 0) totalRows = rc.stdout.toString().replace(/Pager usage is off\.\n?/g, '').trim() || '0'
  }

  const manifest = {
    timestamp: new Date().toISOString(),
    database: DB_NAME,
    user: DB_USER,
    pgVersion,
    file: path.basename(filePath),
    sizeBytes: fileSizeBytes(filePath),
    sha256: sha256(filePath),
    tables: tableCount,
    approximateRows: totalRows,
    durationMs,
    hostname: require('os').hostname(),
    platform: process.platform,
  }

  const manifestPath = filePath + '.manifest.json'
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  log(`Manifest: ${path.basename(manifestPath)}`)
  return manifest
}

// ── Backup ────────────────────────────────────────────────────────────
function doBackup(opts) {
  const pgDump = findPgTool('pg_dump')
  if (!pgDump) {
    logError('pg_dump не найден. Установите PostgreSQL или добавьте в PATH.')
    console.error('  Mac: brew install postgresql или Postgres.app')
    console.error('  Win: https://www.postgresql.org/download/windows/')
    process.exit(1)
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true })

  console.log(`\n  ══════════════════════════════════════════`)
  console.log(`  BADB Backup`)
  console.log(`  ══════════════════════════════════════════`)

  // Pre-flight
  const pgVersion = preflight(pgDump)

  const ext = opts.format === 'plain' ? '.sql' : '.dump'
  const filename = `${timestamp()}_${DB_NAME}${ext}`
  const filePath = path.join(BACKUP_DIR, filename)

  const args = [
    '--username', DB_USER,
    '--dbname', DB_NAME,
    '--no-password',
    `--format=${opts.format === 'plain' ? 'plain' : 'custom'}`,
    '--verbose',
    '--file', filePath,
  ]

  log(`Формат: ${opts.format}, файл: ${filename}`)

  if (opts.dryRun) {
    log(`[dry-run] ${pgDump} ${args.join(' ')}`)
    log(`[dry-run] Ротация: keep ${opts.keepDays} дней, min ${opts.keepMin}`)
    return
  }

  // Acquire lock
  acquireLock()
  const startTime = Date.now()

  try {
    console.log(`  ──────────────────────────────────────────`)

    const result = spawnSync(pgDump, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: pgEnv(),
    })

    const duration = Date.now() - startTime

    if (result.status !== 0) {
      const stderr = result.stderr?.toString() || ''
      logError(`pg_dump failed (exit ${result.status}): ${stderr.slice(0, 500)}`)
      // Clean up partial file
      try { fs.unlinkSync(filePath) } catch { /* ignore */ }
      process.exit(1)
    }

    // Check file was actually created and is non-empty
    if (!fs.existsSync(filePath) || fileSizeBytes(filePath) === 0) {
      logError('Дамп создан, но файл пустой или отсутствует')
      process.exit(1)
    }

    log(`Бэкап создан: ${filename} (${fileSize(filePath)}) за ${(duration / 1000).toFixed(1)}s`)

    // Post-backup verification
    if (opts.format !== 'plain') {
      const valid = verifyDump(filePath)
      if (!valid) {
        logError('Дамп не прошёл верификацию — файл может быть повреждён')
        process.exit(1)
      }
    }

    // SHA-256 checksum
    const checksum = sha256(filePath)
    fs.writeFileSync(filePath + '.sha256', `${checksum}  ${filename}\n`)
    log(`SHA-256: ${checksum.slice(0, 16)}...`)

    // Manifest
    writeManifest(filePath, pgVersion, duration)

    // Copy to another location
    if (opts.copyTo) {
      try {
        fs.mkdirSync(opts.copyTo, { recursive: true })
        const destPath = path.join(opts.copyTo, filename)
        fs.copyFileSync(filePath, destPath)
        fs.copyFileSync(filePath + '.sha256', destPath + '.sha256')
        fs.copyFileSync(filePath + '.manifest.json', destPath + '.manifest.json')
        log(`Скопировано в: ${opts.copyTo}`)
      } catch (err) {
        logError(`Ошибка копирования в ${opts.copyTo}: ${err.message}`)
        process.exit(1)
      }
    }

    // Rotate old backups
    rotate(opts)

    const remaining = listBackups()
    log(`Всего бэкапов: ${remaining.length}`)
    console.log(`  ══════════════════════════════════════════\n`)

  } finally {
    releaseLock()
  }
}

// ── Rotate ────────────────────────────────────────────────────────────
function rotate(opts) {
  const files = listBackups()
  if (files.length <= opts.keepMin) return

  const cutoff = Date.now() - opts.keepDays * 24 * 60 * 60 * 1000
  let deleted = 0

  for (let i = opts.keepMin; i < files.length; i++) {
    const fullPath = path.join(BACKUP_DIR, files[i])
    const mtime = fs.statSync(fullPath).mtimeMs
    if (mtime < cutoff) {
      if (opts.dryRun) {
        log(`[dry-run] Удалить: ${files[i]}`)
      } else {
        fs.unlinkSync(fullPath)
        // Remove associated files (.sha256, .manifest.json)
        try { fs.unlinkSync(fullPath + '.sha256') } catch { /* ignore */ }
        try { fs.unlinkSync(fullPath + '.manifest.json') } catch { /* ignore */ }
        deleted++
      }
    }
  }

  if (deleted > 0) log(`Ротация: удалено ${deleted} старых бэкапов`)
}

// ── Restore ───────────────────────────────────────────────────────────
function doRestore(opts) {
  let targetFile = opts.restore

  if (targetFile === 'latest') {
    const files = listBackups()
    if (files.length === 0) {
      logError('Нет бэкапов для восстановления')
      process.exit(1)
    }
    targetFile = path.join(BACKUP_DIR, files[0])
  } else if (!path.isAbsolute(targetFile)) {
    const inBackupDir = path.join(BACKUP_DIR, targetFile)
    targetFile = fs.existsSync(inBackupDir) ? inBackupDir : path.resolve(targetFile)
  }

  if (!fs.existsSync(targetFile)) {
    logError(`Файл не найден: ${targetFile}`)
    process.exit(1)
  }

  // Verify checksum if available
  const checksumFile = targetFile + '.sha256'
  if (fs.existsSync(checksumFile)) {
    const expected = fs.readFileSync(checksumFile, 'utf8').split(/\s+/)[0]
    const actual = sha256(targetFile)
    if (expected !== actual) {
      logError(`Checksum MISMATCH! Файл повреждён.`)
      logError(`  Ожидалось: ${expected}`)
      logError(`  Получено:  ${actual}`)
      process.exit(1)
    }
    log('Checksum OK')
  }

  // Verify dump integrity
  if (targetFile.endsWith('.dump')) {
    if (!verifyDump(targetFile)) {
      logError('Дамп повреждён, восстановление отменено')
      process.exit(1)
    }
  }

  const isCustom = targetFile.endsWith('.dump')
  const tool = isCustom ? 'pg_restore' : 'psql'
  const pgTool = findPgTool(tool)

  if (!pgTool) {
    logError(`${tool} не найден. Установите PostgreSQL.`)
    process.exit(1)
  }

  console.log(`\n  ══════════════════════════════════════════`)
  console.log(`  BADB Restore`)
  console.log(`  ══════════════════════════════════════════`)
  log(`Файл: ${path.basename(targetFile)} (${fileSize(targetFile)})`)
  log(`БД: ${DB_NAME}, формат: ${isCustom ? 'custom' : 'plain SQL'}`)

  if (opts.dryRun) {
    log('[dry-run] Восстановление не выполнено')
    return
  }

  console.log(`  ──────────────────────────────────────────`)
  console.log(`  ВНИМАНИЕ: это перезапишет текущую БД ${DB_NAME}!`)
  console.log(`  Ожидание 5 секунд... (Ctrl+C для отмены)`)

  // 5 second safety delay (cross-platform)
  const waitEnd = Date.now() + 5000
  while (Date.now() < waitEnd) { /* busy wait — short enough to be acceptable */ }

  log(`Начало восстановления из ${path.basename(targetFile)}`)

  let result
  if (isCustom) {
    result = spawnSync(pgTool, [
      '--username', DB_USER,
      '--dbname', DB_NAME,
      '--no-password',
      '--clean',
      '--if-exists',
      '--verbose',
      targetFile,
    ], { stdio: 'inherit', env: pgEnv() })
  } else {
    result = spawnSync(pgTool, [
      '--username', DB_USER,
      '--dbname', DB_NAME,
      '--no-password',
      '--file', targetFile,
    ], { stdio: 'inherit', env: pgEnv() })
  }

  if (result.status !== 0) {
    logError(`Восстановление failed (exit ${result.status})`)
    process.exit(1)
  }

  log('Восстановление завершено!')
  console.log(`  ══════════════════════════════════════════\n`)
}

// ── Verify command ────────────────────────────────────────────────────
function doVerify(opts) {
  let targetFile = opts.verify

  if (targetFile === 'latest') {
    const files = listBackups()
    if (files.length === 0) {
      logError('Нет бэкапов для верификации')
      process.exit(1)
    }
    targetFile = path.join(BACKUP_DIR, files[0])
  } else if (!path.isAbsolute(targetFile)) {
    const inBackupDir = path.join(BACKUP_DIR, targetFile)
    targetFile = fs.existsSync(inBackupDir) ? inBackupDir : path.resolve(targetFile)
  }

  if (!fs.existsSync(targetFile)) {
    logError(`Файл не найден: ${targetFile}`)
    process.exit(1)
  }

  console.log(`\n  Верификация: ${path.basename(targetFile)} (${fileSize(targetFile)})`)

  // Checksum
  const checksumFile = targetFile + '.sha256'
  if (fs.existsSync(checksumFile)) {
    const expected = fs.readFileSync(checksumFile, 'utf8').split(/\s+/)[0]
    const actual = sha256(targetFile)
    if (expected === actual) {
      log('SHA-256 checksum: OK')
    } else {
      logError('SHA-256 checksum: MISMATCH — файл повреждён!')
      process.exit(1)
    }
  } else {
    log('SHA-256 checksum: файл .sha256 не найден')
  }

  // Dump structure
  if (targetFile.endsWith('.dump')) {
    verifyDump(targetFile)
  }

  // Manifest
  const manifestFile = targetFile + '.manifest.json'
  if (fs.existsSync(manifestFile)) {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
    log(`Manifest: ${manifest.tables} таблиц, ~${manifest.approximateRows} строк, ${manifest.pgVersion}`)
  }

  console.log()
}

// ── Main ──────────────────────────────────────────────────────────────
const opts = parseArgs()

if (opts.list) {
  printBackupList()
} else if (opts.verify) {
  doVerify(opts)
} else if (opts.restore) {
  doRestore(opts)
} else {
  doBackup(opts)
}
