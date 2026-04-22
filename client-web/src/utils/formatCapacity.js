// ─── Capacity / mass / voltage formatters ───────────────────────────
// Shared formatters used wherever Dalia's capacity_summary numbers are
// displayed (ElectrodesPage, ElectrodeFormPage, AssemblyPage).
// Precision matches her formatCapacity / formatMass / formatArealCapacity
// in public/js/electrode-batch-print.js so the same value reads
// identically in Vue panels and in the printed report.

export function fmtCapacity(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(3)} мАч`
}

export function fmtArealCapacity(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(3)} мАч/см²`
}

export function fmtMass(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(4)} г`
}

export function fmtSpecCapacity(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(2)} мАч/г`
}

// Coating sidedness enum → Russian label. Blank/unknown returns dash.
export function fmtCoatingSidedness(v) {
  if (v === 'one_sided') return '1-сторонняя'
  if (v === 'two_sided') return '2-сторонняя'
  return '—'
}

// actual_fraction_status enum — tells the user whether the "факт"
// numbers in a capacity_summary are trustworthy (all input masses
// present) or derived with missing data.
export function fmtActualFractionStatus(v) {
  if (v === 'complete')   return 'полный'
  if (v === 'incomplete') return 'неполный'
  return '—'
}

// ─── capacityIncompleteHint ───────────────────────────────────────
// When a displayed capacity / N-P cell is "—" because the backend
// returned null, the user sees no explanation and no way to fix it.
// Root cause is always "some mass is missing somewhere upstream" —
// either in a tape recipe's actual masses, or in a batch's foil
// measurements, or in a material's specific_capacity. This helper
// returns a contextual Russian hint naming the exact page + form
// the user should open.
//
// `context` selects the message template:
//   - 'electrode'        — for electrode-batch capacity_summary
//                          (ElectrodesPage list + ElectrodeFormPage form).
//   - 'battery-np'       — for battery.capacity_summary.np_actual
//                          (AssemblyPage N/P cell).
//   - 'battery-cathode' / 'battery-anode'
//                        — for cathode/anode actual capacity cells
//                          (AssemblyPage capacity cells).
//
// Returns `null` when the "—" is explained by something else (e.g.
// auth error, empty summary) — callers should skip the tooltip in
// that case; upstream error messages already cover it.
export function capacityIncompleteHint(summary, context = 'electrode') {
  if (!summary) return null

  // ── Battery context ──
  // When only ONE side has missing actuals, point the user at THAT
  // side — don't tell them "both" if the other is already filled. The
  // battery summary doesn't expose per-side actual_fraction_status,
  // but it does expose cathode_capacity_actual_mAh / anode_… — when a
  // side's actual capacity is null, its masses are incomplete.
  const cathodeNull = summary.cathode_capacity_actual_mAh == null
  const anodeNull   = summary.anode_capacity_actual_mAh   == null

  if (context === 'battery-np') {
    if (!summary.cathode_count) return 'Не подключён катод — добавьте катодный электрод в секции «Электроды» конструктора.'
    if (!summary.anode_count)   return 'Не подключён анод — добавьте анодный электрод в секции «Электроды» конструктора.'
    if (cathodeNull && !anodeNull) {
      return 'Для фактического N/P не хватает массы катода. Откройте катодную ленту в «Подготовка лент» → «Фактические навески рецепта».'
    }
    if (anodeNull && !cathodeNull) {
      return 'Для фактического N/P не хватает массы анода. Откройте анодную ленту в «Подготовка лент» → «Фактические навески рецепта».'
    }
    // Both null (or an unexpected edge where np is null despite both
    // actuals being set — be explicit but generic).
    return 'Для фактического N/P нужны заполненные массы в рецептах обеих лент. Откройте ленты катода и анода в «Подготовка лент» → «Фактические навески рецепта».'
  }
  if (context === 'battery-cathode') {
    if (!summary.cathode_count) return 'Катод не подключён — добавьте электрод в секции «Электроды» конструктора.'
    return 'Часть навесок в рецепте катодной ленты не заполнена. Откройте ленту в «Подготовка лент» → «Фактические навески рецепта».'
  }
  if (context === 'battery-anode') {
    if (!summary.anode_count) return 'Анод не подключён — добавьте электрод в секции «Электроды» конструктора.'
    return 'Часть навесок в рецепте анодной ленты не заполнена. Откройте ленту в «Подготовка лент» → «Фактические навески рецепта».'
  }

  // ── Electrode-batch context (ElectrodesPage / ElectrodeFormPage) ──
  // Priority: actual_fraction_status is the primary signal; foil /
  // specific_capacity checks are secondary explanations that apply
  // even when status === 'complete' (very rare — defensive).
  const status = summary.actual_fraction_status
  if (status === 'unavailable') {
    return 'Фактические массы в рецепте ленты не заполнены. Откройте «Подготовка лент» → выберите нужную ленту → таблица «Фактические навески рецепта».'
  }
  if (status === 'incomplete') {
    return 'Часть навесок в рецепте ленты не заполнена. Откройте ленту в «Подготовка лент» и проверьте все строки рецепта.'
  }
  if (Number(summary.foil_measurement_count) === 0) {
    return 'Нет замеров массы фольги. Добавьте замер во вкладке замеров партии нарезки.'
  }
  if (!Number.isFinite(Number(summary.specific_capacity_mAh_g))) {
    return 'Не указана удельная ёмкость активного материала. Откройте материал в «Материалы» → свойства и заполните.'
  }
  return null
}
