// ═══════════════════════════════════════════════════════
// BADB Server Configuration
// All tunable parameters are here. Edit this section only.
// ═══════════════════════════════════════════════════════

module.exports = {
  // --- Server ---
  port: process.env.PORT || 3003,

  // --- Auth Bypass (dev only) ---
  // Set AUTH_BYPASS=true in .env to skip login screen during development.
  // NEVER enable in production. Remove from .env before demo/deploy.
  // authBypass: process.env.AUTH_BYPASS === 'true',
  // bypassLogin: process.env.BYPASS_LOGIN || 'dsmenyaylov',

  // --- Database ---
  db: {
    user: process.env.DB_USER || 'Dalia',
    database: process.env.DB_NAME || 'badb_app_v1',
  },

  // --- JWT Authentication ---
  jwt: {
    secret: process.env.JWT_SECRET || 'badb-dev-secret-change-in-production',
    expiresIn: '8h',               // token lifetime (lab shift = 8 hours)
  },

  // --- Password Hashing ---
  bcrypt: {
    rounds: 10,                     // bcrypt salt rounds (10 = ~100ms, 12 = ~300ms)
  },

  // --- Brute-Force Protection ---
  rateLimit: {
    maxFailedAttempts: 10,          // failed logins before lockout
    lockoutWindowMinutes: 60,       // lockout duration in minutes (1 hour)
  },

  // --- Roles ---
  // admin = Админ, lead = Лид (руководитель группы), employee = Сотрудник
  roles: {
    list: ['employee', 'lead', 'admin'],
    default: 'employee',
  },

  // --- Submissions ---
  submissions: {
    sources: ['excel', 'web', 'api', 'import'],
    statuses: ['accepted', 'rejected', 'processing', 'processed'],
  },
};
