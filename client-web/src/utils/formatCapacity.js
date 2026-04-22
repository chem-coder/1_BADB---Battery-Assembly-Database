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
