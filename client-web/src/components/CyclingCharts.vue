<script setup>
/**
 * CyclingCharts — interactive charts for battery cycling data.
 * 1. Capacity vs Cycle (discharge capacity fade)
 * 2. Coulombic Efficiency vs Cycle
 * 3. Voltage Profile (V vs Q for one or more cycles — overlay mode)
 * 4. dQ/dV (differential capacity) — computed from voltage profile
 *
 * Features: multi-cycle overlay, PNG export, cycle toggle chips.
 */
import { ref, computed } from 'vue'
import { Line, Scatter } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  SubTitle,
  Tooltip,
  Legend,
  Filler,
  ScatterController,
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, SubTitle, Tooltip, Legend, Filler, ScatterController, zoomPlugin)

// Multi-session props — each session carries its own summary + cycleDataMap
// + color. See CyclingPage.activeSessionViews for the shape.
const props = defineProps({
  sessions: { type: Array, default: () => [] },
  // Cycle selection is global (applies to every session on the chart). If
  // a session doesn't have a given cycle, it's silently skipped in the
  // voltage/dQdV panels — no error.
  selectedCycles: { type: Array, default: () => [] },
  maxSelected: { type: Number, default: 20 },
  // User-supplied experiment name (appears as chart titles + PNG filename
  // prefix). Empty string → fall back to auto-generated titles.
  experimentLabel: { type: String, default: '' },
  // Publication-style toggle: single color per session in voltage profile,
  // minimal legend, no tooltip hints — matches how papers render it.
  publicationMode: { type: Boolean, default: false },
  // 'Ah' | 'mAh_per_g'. When 'mAh_per_g', capacity axes are divided by
  // each session's active_mass_mg to show specific capacity. Only meaningful
  // when sessions have active_mass_mg populated — the parent toggles the
  // prop back to 'Ah' when any active session lacks mass.
  capacityUnit: { type: String, default: 'Ah' },
  // When true, render summary tables under the capacity chart showing
  // raw numbers per cycle (matches colleague's Excel output, useful for
  // paper-ready reports and for copy-pasting into other tools).
  showTables: { type: Boolean, default: true },
  // 'both' | 'charge' | 'discharge'. Standard filter in electrochemistry
  // software (BTS / NOVA / EC-Lab): you often want to look at just the
  // charge curve (phase-transition analysis on lithiation) or just the
  // discharge curve (delithiation + capacity fade). Applied to voltage
  // profile + dQ/dV. Capacity+CE chart is per-cycle summary and not
  // filterable by step.
  stepFilter: { type: String, default: 'both' },
  // Moving-average window for dQ/dV smoothing. 1 = no smoothing (raw
  // differentiated signal, every noise spike visible), 5 = our default
  // (good balance for clean ELITECH data), 11-15 = heavy smoothing
  // recommended for noisy cells where peaks get buried in measurement
  // jitter. Clamped to [1, 21] inside computeDQDV.
  smoothingWindow: { type: Number, default: 5 },
  // 'absolute' | 'retention'. Controls what the capacity chart plots:
  //   absolute  — discharge/charge capacity in Ah or mAh/g (default).
  //   retention — C(n) / C(first_valid) × 100 % per session. Scientific
  //     standard for fade visualization in Li-ion papers. First cycle of
  //     each session is the reference (100 %); if cycle 1 is a formation
  //     cycle, the user can still see the full fade curve.
  capacityView: { type: String, default: 'absolute' },
  // Per-session style overrides — keyed by session_id. Each entry can set
  // any subset of { color, borderWidth, borderDash, pointStyle, pointRadius }
  // to replace the palette/gradient defaults. Applied to voltage profile +
  // dQ/dV only (capacity+CE chart stays automatic for clarity).
  sessionStyles: { type: Object, default: () => ({}) },
})

// Convert a capacity value (Ah) to the current display unit based on
// session-specific active mass. Returns null if mode is mAh/g but mass is
// missing (we'd otherwise divide by zero/null and poison the axis).
function convertCapacity(ah, session) {
  if (ah == null) return null
  if (props.capacityUnit !== 'mAh_per_g') return ah
  const massMg = Number(session?.active_mass_mg)
  if (!Number.isFinite(massMg) || massMg <= 0) return null
  // mAh/g = Ah × 1000 / (mass_mg / 1000) = Ah × 1_000_000 / mass_mg
  return (ah * 1_000_000) / massMg
}

// First valid discharge capacity (Ah) for a session — used as the 100 %
// reference in retention mode. "Valid" means non-null, finite and > 0;
// early cycles of some ELITECH files have a placeholder 0 from the
// pre-formation step that we must skip. Returns null when no reference
// can be found; callers then emit null y-values so retention plots
// simply show a gap instead of NaNs.
function firstValidDischargeCap(session) {
  const rows = session?.summary
  if (!Array.isArray(rows)) return null
  for (const row of rows) {
    const c = Number(row?.discharge_capacity_ah)
    if (Number.isFinite(c) && c > 0) return c
  }
  return null
}

// Project a raw Ah capacity into the currently active view (absolute or
// retention). Kept as a single helper so both charge and discharge
// datasets pick up the same formula and retention toggle is atomic.
function projectCapacity(ah, session, refCap) {
  if (ah == null || !Number.isFinite(ah)) return null
  if (props.capacityView === 'retention') {
    if (!refCap || refCap <= 0) return null
    return (ah / refCap) * 100
  }
  return convertCapacity(ah, session)
}

// Axis labels match the active unit / view. English, publication style
// ("Capacity, Ah" / "C, mAh/g" / "Retention, %") — matches the lab
// colleague's Excel output and the convention in Li-ion journals.
function capacityAxisLabel() {
  if (props.capacityView === 'retention') return 'Retention, %'
  return props.capacityUnit === 'mAh_per_g' ? 'C, mAh/g' : 'Capacity, Ah'
}

// Format a capacity number for table cells. mAh/g gets 2 decimal places
// (typical for electrode-scale cells with capacities 50-300 mAh/g),
// absolute Ah gets 5 (cell-level values often < 0.01 Ah on coin cells).
function formatCap(ah, session) {
  const v = convertCapacity(ah, session)
  if (v == null || !Number.isFinite(v)) return '—'
  return props.capacityUnit === 'mAh_per_g' ? v.toFixed(2) : v.toFixed(5)
}
function formatPct(v) {
  return (v == null || !Number.isFinite(v)) ? '—' : v.toFixed(2)
}
function formatVolt(v) {
  return (v == null || !Number.isFinite(v)) ? '—' : v.toFixed(3)
}

// ── Raw datapoints viewer (inline panel, always visible) ───────────────
// Replaces the earlier modal — users missed the "click row → opens modal"
// affordance. The panel sits under the summary tables with explicit
// session + cycle pickers, filter, search, and paginated raw point view.
//
// rawSession / rawCycle track the currently-inspected (session, cycle).
// First user interaction with a summary row auto-selects it here; the
// user can then change session/cycle via the dropdowns above the table.
const rawSession = ref(null)
const rawCycle = ref(null)
const rawFilter = ref('all')        // 'all' | 'charge' | 'discharge' | 'rest' | 'cccv'
const rawSearchMin = ref(null)      // voltage range lo
const rawSearchMax = ref(null)      // voltage range hi
const rawPage = ref(0)
const RAW_PAGE_SIZE = 500

function selectRawView(session, cycleNumber) {
  rawSession.value = session
  rawCycle.value = cycleNumber
  rawPage.value = 0
}

// Auto-select first active session + first cycle when none is chosen yet
// and data arrives. Keeps the panel useful out-of-the-box without a click.
const rawAutoSession = computed(() => {
  if (rawSession.value && props.sessions.some(s => s.session_id === rawSession.value.session_id)) {
    return rawSession.value
  }
  return props.sessions[0] || null
})
const rawAutoCycle = computed(() => {
  const s = rawAutoSession.value
  if (!s?.summary?.length) return null
  // Use user-chosen cycle if valid, else first cycle with data, else first
  // cycle from summary.
  if (rawCycle.value != null && s.summary.some(r => r.cycle_number === rawCycle.value)) {
    return rawCycle.value
  }
  const loaded = Object.keys(s.cycleDataMap || {}).map(Number).filter(n => !isNaN(n))
  if (loaded.length) return loaded.sort((a, b) => a - b)[0]
  return s.summary[0]?.cycle_number ?? null
})

// All cycles available for the dropdown — based on the active session's summary.
const rawCycleOptions = computed(() => {
  const s = rawAutoSession.value
  if (!s?.summary) return []
  return s.summary.map(r => {
    const hasData = !!(s.cycleDataMap?.[r.cycle_number]?.length)
    return { value: r.cycle_number, loaded: hasData }
  })
})

// Source points — filtered + paginated
const rawPoints = computed(() => {
  const s = rawAutoSession.value
  const c = rawAutoCycle.value
  if (!s || c == null) return []
  return s.cycleDataMap?.[c] || []
})

const rawFiltered = computed(() => {
  let pts = rawPoints.value
  if (rawFilter.value !== 'all') {
    pts = pts.filter(p => p.step_type === rawFilter.value)
  }
  // Range inputs: an empty field is null/''; Number(null) = 0 which
  // *is* finite, so we MUST check for "has a real value" first — otherwise
  // the filter becomes "voltage_v <= 0" and rejects every positive reading.
  const loRaw = rawSearchMin.value
  const hiRaw = rawSearchMax.value
  const hasLo = loRaw !== null && loRaw !== '' && Number.isFinite(Number(loRaw))
  const hasHi = hiRaw !== null && hiRaw !== '' && Number.isFinite(Number(hiRaw))
  if (hasLo) {
    const lo = Number(loRaw)
    pts = pts.filter(p => (p.voltage_v ?? -Infinity) >= lo)
  }
  if (hasHi) {
    const hi = Number(hiRaw)
    pts = pts.filter(p => (p.voltage_v ?? Infinity) <= hi)
  }
  return pts
})

const rawPageCount = computed(() =>
  Math.max(1, Math.ceil(rawFiltered.value.length / RAW_PAGE_SIZE))
)
const rawPagePoints = computed(() => {
  const start = rawPage.value * RAW_PAGE_SIZE
  return rawFiltered.value.slice(start, start + RAW_PAGE_SIZE)
})

// Emit when user wants to fetch a cycle that isn't cached yet — parent
// already has the fetch machinery via toggle-cycle / replace-cycles.
function requestRawCycle(cycleNumber) {
  if (cycleNumber == null) return
  rawCycle.value = cycleNumber
  rawPage.value = 0
  const s = rawAutoSession.value
  if (s && !s.cycleDataMap?.[cycleNumber]?.length) {
    emit('toggle-cycle', cycleNumber)
  }
}

// Panel "📐 Как считаем" — collapsed by default
const formulasOpen = ref(false)

// toggle-cycle — add/remove one cycle (across all active sessions)
// replace-cycles — swap the whole selection (used by quick filters)
const emit = defineEmits(['toggle-cycle', 'replace-cycles'])

// ── Compatibility helpers for the rest of the component ────────────────
// Aggregated "summary" across all sessions — used for cycle-filter buttons
// ("Все (N)" needs to know the full range). We take the union of cycle
// numbers seen in any session, sorted, deduped.
const mergedSummary = computed(() => {
  const seen = new Set()
  const out = []
  for (const s of props.sessions) {
    for (const row of s.summary || []) {
      if (seen.has(row.cycle_number)) continue
      seen.add(row.cycle_number)
      out.push({ cycle_number: row.cycle_number })
    }
  }
  out.sort((a, b) => a.cycle_number - b.cycle_number)
  return out
})

// Aggregated loading set across sessions — so a single spinner on a chip
// lights up regardless of which session is fetching cycle N.
const mergedLoadingSet = computed(() => {
  const all = new Set()
  for (const s of props.sessions) {
    for (const c of s.loadingCycles || []) all.add(c)
  }
  return all
})

// For the legacy "summary" variable used by filter functions, expose the
// merged list under the old name so we don't have to rename everywhere.
// (We still use props.sessions for actual chart data.)
const summary = mergedSummary

// Chart refs for PNG export
const capacityChartRef = ref(null)
const voltageChartRef = ref(null)
const dqdvChartRef = ref(null)

// ── Session label helper (shown in chart legends) ──
// Primary format: "Акк. №5" — battery number is the scientific anchor.
// If the user activates two cycling runs of the same cell (e.g. "Cell 5
// at 25°C" and "Cell 5 at 45°C"), they get suffixed: "Акк. №5а" /
// "Акк. №5б" — same anchor, differentiable. We use Cyrillic а-з first
// (up to 8 runs of one cell is plenty), falling back to digits beyond.
// If the session has no battery attached at all, show "№42" bare.
const BATTERY_RUN_SUFFIX = ['', 'а', 'б', 'в', 'г', 'д', 'е', 'ж', 'з']

function sessionShortLabel(s) {
  if (!s.battery_id) return `№${s.session_id}`
  // How many active sessions share this battery_id? Which index is this one?
  const peers = props.sessions.filter(x => x.battery_id === s.battery_id)
  if (peers.length <= 1) return `Акк. №${s.battery_id}`
  const idx = peers.findIndex(x => x.session_id === s.session_id)
  const suffix = BATTERY_RUN_SUFFIX[idx + 1] ?? String(idx + 1)
  return `Акк. №${s.battery_id}${suffix}`
}

// Translucent fill for the capacity fill-under-line (session.color + alpha).
// Supports both #RRGGBB and hsl() strings (we use HSL for auto-generated
// colors beyond the curated palette).
function fillColor(color, alpha = 0.08) {
  if (color?.startsWith('hsl(')) {
    // hsl(h, s%, l%) → hsla(h, s%, l%, alpha)
    return color.replace(/^hsl\((.+)\)$/, `hsla($1, ${alpha})`)
  }
  const h = String(color || '#003274').replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Cycle-index alpha gradient. For voltage profile + dQ/dV we want old
// cycles faded (they're context / "what was") and new cycles vivid
// (they're the current state of the cell). Linear interp 0.35 → 1.0
// across the selected cycles. When only one cycle is picked, full alpha.
function cycleAlpha(cycleIdx, totalCycles) {
  if (totalCycles <= 1) return 1.0
  return 0.35 + (cycleIdx / (totalCycles - 1)) * 0.65
}

// Client-side decimation. Long cycles (2000+ raw points × N overlayed
// cycles × M sessions) choke Chart.js; beyond ~500 points per line a
// curve is visually indistinguishable from its decimated version anyway.
// We keep every Nth point with the first and last always included so
// start/end voltage limits don't drift.
const RENDER_POINT_CAP = 500
function decimate(points) {
  if (!points || points.length <= RENDER_POINT_CAP) return points
  const step = Math.ceil(points.length / RENDER_POINT_CAP)
  const out = []
  for (let i = 0; i < points.length; i += step) out.push(points[i])
  // Always include the last point (capacity endpoint, cutoff voltage)
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1])
  return out
}

// Shared Chart.js animation config — 150ms is short enough to feel
// instant but smooth enough to avoid jarring jumps when data changes.
// Default (1000ms) made multi-session toggles feel sluggish.
const FAST_ANIM = { duration: 150, easing: 'easeOutQuad' }

// Legend dedup + adaptive sort.
//
// Dedup: one entry per unique "anchor" (everything before " · "). For
// voltage profile / dQ/dV that's "Ц{N}_Акк. №X" — one entry per cycle
// per session. For capacity+CE that's "Акк. №X" — one entry per session.
//
// Sort (voltage/dQdV only): cycle number first, then session label.
// Without sorting, datasets are ordered "all cycles of session 1, then
// all cycles of session 2, …" which makes comparing the same cycle
// across sessions tedious (user has to scan back and forth across the
// whole legend). Sorted output puts "Ц1_Акк№1а, Ц1_Акк№1б, Ц2_Акк№1а,
// Ц2_Акк№1б, …" — same cycle adjacent, session pairs grouped visually.
//
// Session-only labels (capacity+CE chart) are kept in original insertion
// order (which matches the activeSessionIds order, the user's anchor).
function dedupeLegend(chart) {
  const seen = new Map()
  chart.data.datasets.forEach((ds, idx) => {
    const sessionKey = (ds.label || '').split(' · ')[0] || ds.label
    if (seen.has(sessionKey)) return
    seen.set(sessionKey, {
      text: sessionKey,
      fillStyle: ds.borderColor,
      strokeStyle: ds.borderColor,
      lineWidth: 2,
      hidden: false,
      datasetIndex: idx,
    })
  })
  const entries = Array.from(seen.values())

  // Parse "Ц{N}_..." prefix. Entries without the prefix stay at the top
  // in their original (insertion) order.
  const parseCycle = (text) => {
    const m = (text || '').match(/^Ц(\d+)_(.+)/)
    return m ? { cycle: Number(m[1]), rest: m[2] } : null
  }
  entries.sort((a, b) => {
    const ap = parseCycle(a.text)
    const bp = parseCycle(b.text)
    if (!ap && !bp) return 0          // both are session-only, keep order
    if (!ap) return -1                 // non-cycle stays first
    if (!bp) return 1
    if (ap.cycle !== bp.cycle) return ap.cycle - bp.cycle
    return ap.rest.localeCompare(bp.rest, 'ru')
  })
  return entries
}

// ── Capacity + CE (combined plot, dual Y-axis) ─────────────────────────
// Matches the lab colleague's Excel style (reference image on file):
//   Left Y  — capacity as solid line + FILLED circle markers (discharge)
//             and optional dashed line + HOLLOW circle markers (charge).
//             Both in the session's color (the "capacity" color family).
//   Right Y — Coulombic efficiency in a DIFFERENT color family (ochre),
//             thin line + small circles. Immediately readable as
//             "that yellow line lives on the right axis".
//
// stepFilter respected:
//   'discharge' — only the discharge line (standard capacity-fade view)
//   'charge'    — only the charge line (recovers truncated last cycles)
//   'both'      — both overlaid; charge uses hollow markers + dashed
//
// CE colour rule:
//   Single session  → fixed BADB ochre (#D3A754), matches colleague's yellow
//   Multi session   → derive from each session color but desaturate to
//                     avoid confusion with the capacity lines
const CE_COLOR = '#D3A754'  // BADB ochre — single-session CE default

const capacityChartData = computed(() => {
  const datasets = []
  const selectedSet = new Set(props.selectedCycles)
  const isSolo = props.sessions.length === 1
  const showDischarge = props.stepFilter !== 'charge'
  const showCharge = props.stepFilter === 'charge' || props.stepFilter === 'both'

  for (const s of props.sessions) {
    if (!s.summary?.length) continue

    // In retention mode we normalize each session against its own first
    // valid discharge cap → every session starts at 100%. refCap is null
    // when the session has no valid discharge cap at all; projectCapacity
    // then emits null y-values and Chart.js leaves the points empty
    // instead of throwing.
    const refCap = props.capacityView === 'retention' ? firstValidDischargeCap(s) : null

    // Discharge line — filled circle markers (colleague's convention)
    if (showDischarge) {
      datasets.push({
        label: sessionShortLabel(s),
        data: s.summary.map(row => ({
          x: row.cycle_number,
          y: projectCapacity(row.discharge_capacity_ah, s, refCap),
        })),
        yAxisID: 'y',
        borderColor: s.color,
        backgroundColor: s.color,       // filled marker
        fill: false,
        tension: 0.2,
        pointRadius: s.summary.map(row => selectedSet.has(row.cycle_number) ? 5 : 3),
        pointBackgroundColor: s.color,
        pointBorderColor: s.color,
        pointStyle: 'circle',
        pointHoverRadius: 6,
        borderWidth: 1.8,
      })
    }

    // Charge line — HOLLOW circle markers + dashed (colleague's convention)
    if (showCharge) {
      datasets.push({
        label: showDischarge ? `${sessionShortLabel(s)} · charge` : sessionShortLabel(s),
        data: s.summary.map(row => ({
          x: row.cycle_number,
          y: projectCapacity(row.charge_capacity_ah, s, refCap),
        })),
        yAxisID: 'y',
        borderColor: s.color,
        backgroundColor: '#ffffff',     // hollow center
        borderDash: [4, 2],
        tension: 0.2,
        pointRadius: 3,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: s.color,
        pointStyle: 'circle',
        pointBorderWidth: 1.6,
        borderWidth: 1.4,
      })
    }

    // CE — DISTINCT color family (ochre for single-session matching the
    // colleague's plot; desaturated session-color blend for multi).
    const ceColor = isSolo ? CE_COLOR : fillColor(s.color, 0.45)
    datasets.push({
      label: `${sessionShortLabel(s)} · CE`,
      data: s.summary.map(row => ({
        x: row.cycle_number,
        y: row.coulombic_efficiency,
      })),
      yAxisID: 'y1',
      borderColor: ceColor,
      backgroundColor: ceColor,
      tension: 0.2,
      pointRadius: 2.2,
      pointBackgroundColor: ceColor,
      pointBorderColor: ceColor,
      pointStyle: 'circle',
      borderWidth: 1.2,
    })
  }

  return { datasets }
})

const capacityOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: FAST_ANIM,
  onClick: (evt, elements, chart) => {
    // Click → toggle the cycle from the first clicked point. Only handle
    // clicks on the capacity dataset (left Y); CE clicks are just noise.
    if (elements.length > 0) {
      const el = elements[0]
      const ds = chart.data.datasets[el.datasetIndex]
      // Skip CE datasets (they end in "· CE")
      if (ds?.label?.endsWith('· CE')) return
      const pt = ds?.data?.[el.index]
      const cycle = typeof pt === 'object' ? pt.x : pt
      if (cycle !== undefined) emit('toggle-cycle', cycle)
    }
  },
  plugins: {
    legend: {
      // Solo mode: no legend (subtitle explains symbology — matches how
      // colleague's Excel plots render). Multi-session: show legend so
      // user can tell cells apart by color.
      display: props.sessions.length > 1,
      position: 'bottom',
      labels: { boxWidth: 12, font: { size: 11 }, generateLabels: dedupeLegend },
    },
    title: {
      display: true,
      text: props.experimentLabel
        ? props.experimentLabel
        : (props.sessions.length > 1
            ? `Capacity & CE · ${props.sessions.length} cells`
            : 'Capacity & Coulombic Efficiency'),
      font: { size: 13, weight: 600 },
      color: '#003274',
      padding: { bottom: 4 },
    },
    subtitle: {
      display: true,
      text: (() => {
        // Line-style legend (replaces the Chart.js legend in solo mode):
        //   ● discharge, ○ charge, ▭ CE → (right axis, ochre)
        const parts = []
        if (props.stepFilter !== 'charge') parts.push('● discharge')
        if (props.stepFilter === 'charge' || props.stepFilter === 'both') parts.push('○ charge')
        parts.push('▭ CE →')
        return parts.join('   ')
      })(),
      font: { size: 11, style: 'italic' },
      color: '#6B7280',
      padding: { bottom: 8 },
    },
    tooltip: {
      callbacks: { afterBody: () => 'Клик по ёмкости — добавить/убрать цикл' },
    },
    // Zoom/pan: X-only on capacity+CE chart. The dual Y-axis (capacity
    // + CE) panning together would misalign CE values on each axis, so
    // we lock Y. Shift+drag to pan; wheel/pinch to zoom a cycle range.
    zoom: {
      pan:  { enabled: true, mode: 'x', modifierKey: 'shift' },
      zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
    },
  },
  scales: {
    // Left Y: discharge capacity — absolute (Ah) or specific (mAh/g)
    // depending on capacityUnit prop. beginAtZero makes fade readable;
    // if Y starts mid-range, a 5% fade looks like 50%.
    y: {
      type: 'linear',
      position: 'left',
      title: { display: true, text: capacityAxisLabel(), font: { size: 10 } },
      beginAtZero: true,
      ticks: { font: { size: 10 } },
      grid: { color: 'rgba(0,50,116,0.05)' },
    },
    // Right Y: Coulombic efficiency (%). Keep 70-101 default so first-
    // cycle formation dips are visible; outliers auto-extend the range.
    y1: {
      type: 'linear',
      position: 'right',
      title: { display: true, text: 'Coulombic efficiency, %', font: { size: 10 } },
      suggestedMin: 70,
      suggestedMax: 101,
      ticks: { font: { size: 10 } },
      grid: { display: false },  // avoid double grid lines with y
    },
    x: {
      type: 'linear',
      title: { display: true, text: 'Cycle number', font: { size: 10 } },
      ticks: { font: { size: 10 }, stepSize: 1 },
      grid: { display: false },
    },
  },
}))

// Coulombic efficiency is now folded into capacityChart's right Y-axis
// (see "Combined Capacity + CE" above) — no separate chart needed.

// ── Voltage Profile (overlay: sessions × selected cycles) ──
// Visual encoding:
//   color = session (stable, from palette)
//   line thickness = cycle position (earlier cycles thinner; later thicker)
//     makes capacity fade visible at a glance
//   solid = discharge, dashed = charge (same as single-session)
const hasCapacity = computed(() => {
  for (const s of props.sessions) {
    for (const cycleNum of props.selectedCycles) {
      const points = s.cycleDataMap?.[cycleNum] || []
      if (points.some(d => d.capacity_ah != null)) return true
    }
  }
  return false
})

// Apply per-session user overrides on top of palette/gradient defaults.
// The color override is folded back through fillColor() so the alpha
// gradient (old cycles fade, new cycles vivid) is preserved even when the
// user picks a custom base color. Line/dash/marker/radius replace their
// auto-computed counterparts as-is.
function applySessionStyle(ds, sstyle) {
  if (!sstyle) return ds
  if (sstyle.borderWidth != null && Number.isFinite(Number(sstyle.borderWidth))) {
    ds.borderWidth = Number(sstyle.borderWidth)
  }
  if (sstyle.borderDash !== undefined) {
    // null / empty array → explicit "solid"; set to undefined so Chart.js uses default line.
    ds.borderDash = Array.isArray(sstyle.borderDash) && sstyle.borderDash.length
      ? sstyle.borderDash
      : undefined
  }
  if (sstyle.pointStyle) {
    ds.pointStyle = sstyle.pointStyle
  }
  if (sstyle.pointRadius != null && Number.isFinite(Number(sstyle.pointRadius))) {
    ds.pointRadius = Number(sstyle.pointRadius)
    ds.pointBackgroundColor = ds.borderColor
    ds.pointBorderColor = ds.borderColor
  }
  return ds
}

const voltageChartData = computed(() => {
  const datasets = []
  const sortedCycles = [...props.selectedCycles].sort((a, b) => a - b)
  const useCapacity = hasCapacity.value
  const nCycles = sortedCycles.length

  for (const s of props.sessions) {
    const sstyle = props.sessionStyles?.[s.session_id] || null
    // Color: user override replaces the palette base, gradient (alpha) still applies.
    const colorBase = sstyle?.color || s.color

    sortedCycles.forEach((cycleNum, cIdx) => {
      const points = s.cycleDataMap?.[cycleNum] || []
      if (!points.length) return

      // Decimate for rendering only — raw points stay in cycleDataMap for
      // dQ/dV (which needs every point for peak resolution). Voltage
      // profile curves at 500 points are visually indistinguishable from
      // 2000+ and render 4× faster at 10-session overlays.
      const charge = decimate(points.filter(d => d.step_type === 'charge' || d.step_type === 'cccv'))
      const discharge = decimate(points.filter(d => d.step_type === 'discharge'))

      // Publication mode (matches colleague's Excel plots): single session
      // color with alpha gradient across cycles, everything dashed, thin.
      // Interactive mode: thickness grows with cycle index + alpha gradient
      // + charge=dashed / discharge=solid distinction.
      const thickness = props.publicationMode
        ? 1.0
        : 1.0 + (nCycles > 1 ? (cIdx / (nCycles - 1)) * 1.2 : 0.6)

      const alpha = cycleAlpha(cIdx, nCycles)
      const cycleColor = fillColor(colorBase, alpha)

      // In publication mode, both halves use the same dash (matches
      // colleague's figure — nothing distinguishes charge vs discharge
      // visually, the shape of the curve does that). In interactive mode,
      // charge=dashed / discharge=solid stays.
      const chargeDash = [4, 2]
      const dischargeDash = props.publicationMode ? [4, 2] : undefined

      // X-axis value for each point: capacity (converted to mAh/g if unit
      // is specific), or time if capacity data isn't available at all.
      const xOf = (p) => useCapacity ? convertCapacity(p.capacity_ah, s) : p.time_s

      // Step filter: 'charge' hides discharge lines, 'discharge' hides
      // charge, 'both' keeps everything.
      const showCharge = props.stepFilter !== 'discharge'
      const showDischarge = props.stepFilter !== 'charge'

      if (showCharge && charge.length) {
        datasets.push(applySessionStyle({
          label: `Ц${cycleNum}_${sessionShortLabel(s)} · заряд`,
          data: charge.map(p => ({ x: xOf(p), y: p.voltage_v })),
          borderColor: cycleColor,
          backgroundColor: cycleColor,
          pointRadius: 0,
          borderWidth: thickness,
          borderDash: chargeDash,
          showLine: true,
        }, sstyle))
      }
      if (showDischarge && discharge.length) {
        datasets.push(applySessionStyle({
          label: `Ц${cycleNum}_${sessionShortLabel(s)} · разряд`,
          data: discharge.map(p => ({ x: xOf(p), y: p.voltage_v })),
          borderColor: cycleColor,
          backgroundColor: cycleColor,
          pointRadius: 0,
          borderWidth: thickness,
          borderDash: dischargeDash,
          showLine: true,
        }, sstyle))
      }
    })
  }

  return { datasets }
})

const voltageOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: FAST_ANIM,
  plugins: {
    legend: {
      display: !props.publicationMode,  // publication figures don't carry legends
      position: 'bottom',
      labels: { boxWidth: 12, font: { size: 10 }, generateLabels: dedupeLegend },
    },
    title: {
      display: true,
      text: (() => {
        if (props.experimentLabel) return `${props.experimentLabel} — профиль V`
        if (!props.selectedCycles.length) return 'Профиль напряжения'
        const cLabel = `${props.selectedCycles.length} ${props.selectedCycles.length === 1 ? 'цикл' : 'циклов'}`
        if (props.sessions.length <= 1) return `Профиль напряжения — ${cLabel}`
        return `Профиль напряжения — ${props.sessions.length} измерений × ${cLabel}`
      })(),
      font: { size: 13, weight: 600 },
      color: '#003274',
      padding: { bottom: 10 },
    },
    // Zoom/pan: XY on voltage profile — a plateau analysis typically
    // zooms into a specific V window (e.g. 3.2–3.6 V for LFP) AND a
    // capacity window at the same time. Shift+drag pans, wheel/pinch zooms.
    zoom: {
      pan:  { enabled: true, mode: 'xy', modifierKey: 'shift' },
      zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' },
    },
  },
  scales: {
    y: { title: { display: true, text: 'E, V', font: { size: 10 } }, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,50,116,0.05)' } },
    x: {
      type: 'linear',
      title: {
        display: true,
        text: hasCapacity.value ? capacityAxisLabel() : 'Time, s',
        font: { size: 10 },
      },
      ticks: { font: { size: 10 } },
      grid: { display: false },
    },
  },
}))

// ── dQ/dV computation ──
/**
 * Compute dQ/dV from voltage/capacity points.
 * - Input: sorted datapoints for a cycle (mixed charge/discharge steps).
 * - Output: array of {x: voltage, y: |dQ/dV|} for charge and discharge separately.
 * - Uses |dV| threshold to skip flat/noisy regions.
 * - Smoothing: moving average with configurable window (clamped to [1, 21]).
 *   window=1 → no smoothing (raw signal, every measurement spike).
 *   window=5 → default; good for clean ELITECH data.
 *   window=11..15 → heavy smoothing for noisy cells.
 */
function computeDQDV(points, smoothingWindow = 5) {
  const charge = points.filter(d => (d.step_type === 'charge' || d.step_type === 'cccv') && d.voltage_v != null && d.capacity_ah != null)
  const discharge = points.filter(d => d.step_type === 'discharge' && d.voltage_v != null && d.capacity_ah != null)

  // Clamp to [1, 21] and coerce to integer. Non-finite / NaN falls back to 5.
  const wRaw = Number(smoothingWindow)
  const w = Number.isFinite(wRaw) ? Math.max(1, Math.min(21, Math.round(wRaw))) : 5

  function process(steps) {
    if (steps.length < 2) return []
    const raw = []
    for (let i = 1; i < steps.length; i++) {
      // Skip pairs spanning a step boundary. ELITECH resets capacity_ah
      // at the start of each step; if we compute dQ = Q[i] - Q[i-1] across
      // the CC→CV (or any multi-step) seam, dQ is a large negative number
      // not representing real charge transfer — it's an integration reset.
      // |dQ/dV| at that seam is a false peak. Same guard helps any file
      // with rest steps interleaved between charge sub-steps.
      if (steps[i].step_number !== steps[i - 1].step_number) continue
      const dV = steps[i].voltage_v - steps[i - 1].voltage_v
      const dQ = steps[i].capacity_ah - steps[i - 1].capacity_ah
      if (Math.abs(dV) < 0.002) continue  // skip nearly-flat regions (mV noise)
      const dqdv = Math.abs(dQ / dV)
      if (!Number.isFinite(dqdv) || dqdv > 1e6) continue
      const v = (steps[i].voltage_v + steps[i - 1].voltage_v) / 2
      raw.push({ x: v, y: dqdv })
    }
    raw.sort((a, b) => a.x - b.x)

    // window=1 is a no-op — return raw early (cheaper + matches the "no
    // smoothing" mental model: slider at minimum = see the real signal).
    if (w <= 1) return raw

    // Moving average smoothing (configurable window)
    const half = Math.floor(w / 2)
    const smoothed = []
    for (let i = 0; i < raw.length; i++) {
      const from = Math.max(0, i - half)
      const to = Math.min(raw.length, i + half + 1)
      let sum = 0
      for (let j = from; j < to; j++) sum += raw[j].y
      smoothed.push({ x: raw[i].x, y: sum / (to - from) })
    }
    return smoothed
  }

  return { charge: process(charge), discharge: process(discharge) }
}

const dqdvChartData = computed(() => {
  const datasets = []
  const sortedCycles = [...props.selectedCycles].sort((a, b) => a - b)
  const nCycles = sortedCycles.length

  for (const s of props.sessions) {
    const sstyle = props.sessionStyles?.[s.session_id] || null
    const colorBase = sstyle?.color || s.color
    sortedCycles.forEach((cycleNum, cIdx) => {
      const points = s.cycleDataMap?.[cycleNum] || []
      if (!points.length) return

      const { charge, discharge } = computeDQDV(points, props.smoothingWindow)
      const thickness = 1.0 + (nCycles > 1 ? (cIdx / (nCycles - 1)) * 1.0 : 0.5)
      // Old cycles fade, new cycles vivid — same convention as voltage profile
      const alpha = cycleAlpha(cIdx, nCycles)
      const cycleColor = fillColor(colorBase, alpha)
      const showCharge = props.stepFilter !== 'discharge'
      const showDischarge = props.stepFilter !== 'charge'

      if (showCharge && charge.length) {
        datasets.push(applySessionStyle({
          label: `Ц${cycleNum}_${sessionShortLabel(s)} · заряд`,
          data: charge,
          borderColor: cycleColor,
          backgroundColor: cycleColor,
          pointRadius: 0,
          borderWidth: thickness,
          borderDash: [4, 2],
          showLine: true,
        }, sstyle))
      }
      if (showDischarge && discharge.length) {
        datasets.push(applySessionStyle({
          label: `Ц${cycleNum}_${sessionShortLabel(s)} · разряд`,
          data: discharge,
          borderColor: cycleColor,
          backgroundColor: cycleColor,
          pointRadius: 0,
          borderWidth: thickness,
          showLine: true,
        }, sstyle))
      }
    })
  }

  return { datasets }
})

const dqdvOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: FAST_ANIM,
  plugins: {
    legend: {
      display: !props.publicationMode,
      position: 'bottom',
      labels: { boxWidth: 12, font: { size: 10 }, generateLabels: dedupeLegend },
    },
    title: {
      display: true,
      text: props.experimentLabel
        ? `${props.experimentLabel} — dQ/dV`
        : 'Дифференциальная ёмкость (|dQ/dV|)',
      font: { size: 13, weight: 600 },
      color: '#003274',
      padding: { bottom: 10 },
    },
    // Zoom/pan: XY on dQ/dV — isolating a single peak (V range) and
    // seeing its height (|dQ/dV| range) both matter for phase analysis.
    zoom: {
      pan:  { enabled: true, mode: 'xy', modifierKey: 'shift' },
      zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' },
    },
  },
  scales: {
    y: { title: { display: true, text: '|dQ/dV|, Ah/V', font: { size: 10 } }, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,50,116,0.05)' } },
    x: {
      type: 'linear',
      title: { display: true, text: 'E, V', font: { size: 10 } },
      ticks: { font: { size: 10 } },
      grid: { display: false },
    },
  },
}))

// ── Quick filters (replace whole selection) ────────────────────────────
// All helpers clamp to maxSelected — the lazy-fetch loop in CyclingPage
// doesn't scale past ~20 cycles without noticeable lag, and the voltage
// overlay becomes unreadable past that anyway.
const allCycleNumbers = computed(() => mergedSummary.value.map(s => s.cycle_number))

// UI state for the custom-range popover
const rangeOpen = ref(false)
const rangeFrom = ref(null)
const rangeTo = ref(null)

// "Каждый N-й" — plain number input + a few preset buttons next to it.
// PrimeVue's Select kept fighting our height overrides, and users want
// to enter arbitrary values anyway (N = 50 on a 10000-cycle run is
// common), so a native <input type="number"> is both simpler and more
// scalable. `everyNStep` holds the current value.
const everyNStep = ref(null)

function onEveryNApply() {
  const n = Number(everyNStep.value)
  if (!Number.isFinite(n) || n < 1) return
  selectEveryNth(Math.round(n))
}

function clampToMax(list) {
  if (list.length <= props.maxSelected) return list
  // Prefer evenly-spaced decimation over "first N"
  const step = Math.ceil(list.length / props.maxSelected)
  const out = []
  for (let i = 0; i < list.length; i += step) out.push(list[i])
  // Ensure last cycle is always included (most interesting for fade)
  if (out[out.length - 1] !== list[list.length - 1]) out.push(list[list.length - 1])
  return out.slice(0, props.maxSelected)
}

function selectAll() {
  emit('replace-cycles', clampToMax(allCycleNumbers.value))
}

function selectEveryNth(n) {
  if (n < 1) return
  const all = allCycleNumbers.value
  if (!all.length) return
  // Include the first cycle (formation) always, then 1+N, 1+2N, ...
  const picked = []
  for (let i = 0; i < all.length; i += n) picked.push(all[i])
  // Also include the last cycle so the end of life is visible
  if (picked[picked.length - 1] !== all[all.length - 1]) picked.push(all[all.length - 1])
  emit('replace-cycles', clampToMax(picked))
}

function applyRange() {
  const all = allCycleNumbers.value
  if (!all.length) return
  const min = Math.min(...all)
  const max = Math.max(...all)
  const from = Math.max(min, Number(rangeFrom.value) || min)
  const to   = Math.min(max, Number(rangeTo.value) || max)
  if (from > to) return
  const picked = all.filter(c => c >= from && c <= to)
  emit('replace-cycles', clampToMax(picked))
  rangeOpen.value = false
}

function clearSelection() {
  emit('replace-cycles', [])
}

// Dynamic labels: "Каждый 5й (3)" — preview how many the filter would pick
function countEveryNth(n) {
  const all = allCycleNumbers.value
  if (!all.length || n < 1) return 0
  const picked = []
  for (let i = 0; i < all.length; i += n) picked.push(all[i])
  if (picked[picked.length - 1] !== all[all.length - 1]) picked.push(all[all.length - 1])
  return Math.min(picked.length, props.maxSelected)
}

// ── Quick cycle buttons ──
const cycleButtons = computed(() => {
  const numbers = mergedSummary.value.map(s => s.cycle_number)
  if (!numbers.length) return []  // guard: empty summary → no buttons
  if (numbers.length <= 12) return numbers

  // Pick representative cycles: first/last 3 + evenly spaced midpoints
  const picks = new Set()
  for (let i = 0; i < Math.min(3, numbers.length); i++) picks.add(numbers[i])
  for (let i = Math.max(0, numbers.length - 3); i < numbers.length; i++) picks.add(numbers[i])
  for (const frac of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const i = Math.floor((numbers.length - 1) * frac)
    picks.add(numbers[i])
  }
  return [...picks].sort((a, b) => a - b)
})

const selectedSet = computed(() => new Set(props.selectedCycles))
// loadingSet — union across all sessions (chip spinner is a global "is
// any session fetching this cycle?" indicator; the per-session chip above
// the charts shows which specific session is loading)
const loadingSet = mergedLoadingSet

function handleToggle(cycleNum) {
  emit('toggle-cycle', cycleNum)
}

// ── PNG export ──
function sanitizeFilename(str) {
  return String(str).replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]/g, '_').slice(0, 80)
}

// Publication-grade PNG export:
//   - White background (default Chart.js canvas is transparent, which
//     looks fine in browser but bad when pasted into Word/PDF)
//   - 2× device pixel ratio → sharper lines on retina / print
//   - Filename prefixed with experimentLabel when provided, otherwise
//     session ids (back-compat)
function exportChartPNG(chartRef, name) {
  const inst = chartRef.value?.chart
  if (!inst) return

  // Render canvas at 2× resolution via Chart.js own option
  const originalRatio = inst.options.devicePixelRatio
  inst.options.devicePixelRatio = Math.max(2, window.devicePixelRatio || 1)
  inst.resize()

  // Build a new canvas with white background underneath
  const src = inst.canvas
  const tmp = document.createElement('canvas')
  tmp.width = src.width
  tmp.height = src.height
  const ctx = tmp.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, tmp.width, tmp.height)
  ctx.drawImage(src, 0, 0)

  const url = tmp.toDataURL('image/png', 1)

  // Restore DPR so on-screen rendering stays normal
  inst.options.devicePixelRatio = originalRatio
  inst.resize()

  const link = document.createElement('a')
  link.href = url
  const prefix = props.experimentLabel
    ? sanitizeFilename(props.experimentLabel)
    : 'cycling_' + (props.sessions.map(s => s.session_id).join('_') || 'x')
  link.download = `${prefix}_${sanitizeFilename(name)}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Reset zoom/pan state on a chart to its default bounds. The plugin
// registers a resetZoom() method on every Chart instance; vue-chartjs
// wraps the instance in `.chart` on the component ref. No-op if the
// chart isn't mounted yet (happens when the user clicks the button
// before data is loaded).
function resetZoom(chartRef) {
  const inst = chartRef?.value?.chart
  if (inst && typeof inst.resetZoom === 'function') inst.resetZoom()
}
</script>

<template>
  <div class="cycling-charts">
    <!-- Top: combined Capacity + CE chart (dual Y-axis, publication style) -->
    <div class="chart-card chart-card--wide">
      <button class="chart-reset-zoom-btn" title="Сброс зума (Shift+drag — панорама, колесо — масштаб)" @click="resetZoom(capacityChartRef)">
        <i class="pi pi-refresh"></i>
      </button>
      <button class="chart-export-btn" title="Скачать PNG" @click="exportChartPNG(capacityChartRef, 'capacity_and_ce')">
        <i class="pi pi-download"></i>
      </button>
      <div class="chart-wrap chart-wrap--tall">
        <Line v-if="summary.length" ref="capacityChartRef" :data="capacityChartData" :options="capacityOptions" />
      </div>
    </div>

    <!-- Per-cycle summary tables — one per active session (replicates the
         colleague's Excel tab with Chg/DChg/CE columns). Shown below the
         capacity chart so the user can see numbers + plot together. -->
    <div v-if="showTables && sessions.length" class="summary-tables">
      <div
        v-for="s in sessions"
        :key="s.session_id"
        class="summary-table-wrap"
      >
        <div class="summary-table-head" :style="{ borderColor: s.color }">
          <span class="summary-table-chip" :style="{ background: s.color }"></span>
          <strong>{{ sessionShortLabel(s) }}</strong>
          <span v-if="s.file_name" class="summary-table-sub" :title="s.file_name">
            · {{ s.file_name }}
          </span>
          <span v-if="s.active_mass_mg" class="summary-table-sub">
            · масса AM: {{ Number(s.active_mass_mg).toFixed(3) }} mg
          </span>
        </div>
        <div class="summary-table-scroll">
          <table class="summary-table">
            <thead>
              <tr>
                <th>Цикл</th>
                <th :title="capacityUnit === 'mAh_per_g' ? 'Charge specific capacity, mAh per gram of active material' : 'Charge capacity, Ah'">
                  Chg {{ capacityUnit === 'mAh_per_g' ? '(mAh/g)' : '(Ah)' }}
                </th>
                <th :title="capacityUnit === 'mAh_per_g' ? 'Discharge specific capacity' : 'Discharge capacity'">
                  DChg {{ capacityUnit === 'mAh_per_g' ? '(mAh/g)' : '(Ah)' }}
                </th>
                <th title="Coulombic efficiency: DChg / Chg × 100">CE (%)</th>
                <th title="Energy efficiency: E_dch / E_chg × 100 (round-trip)">EE (%)</th>
                <th title="Среднее напряжение заряда">V̄ chg</th>
                <th title="Среднее напряжение разряда">V̄ dch</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in s.summary"
                :key="row.cycle_number"
                class="summary-row"
                :class="{ 'summary-row--active': rawAutoSession?.session_id === s.session_id && rawAutoCycle === row.cycle_number }"
                :title="'Показать сырые точки этого цикла ниже'"
                @click="selectRawView(s, row.cycle_number)"
              >
                <td class="cell-cycle">{{ row.cycle_number }}</td>
                <td>{{ formatCap(row.charge_capacity_ah, s) }}</td>
                <td>{{ formatCap(row.discharge_capacity_ah, s) }}</td>
                <td>{{ formatPct(row.coulombic_efficiency) }}</td>
                <td>{{ formatPct(row.energy_efficiency) }}</td>
                <td>{{ formatVolt(row.avg_charge_voltage_v) }}</td>
                <td>{{ formatVolt(row.avg_discharge_voltage_v) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 📐 Collapsible formulas panel (scientific transparency) -->
    <div v-if="sessions.length" class="formulas-panel">
      <button class="formulas-head" @click="formulasOpen = !formulasOpen">
        <i :class="formulasOpen ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"></i>
        📐 Как считаются параметры
        <span class="formulas-hint">{{ formulasOpen ? 'скрыть' : 'показать формулы' }}</span>
      </button>
      <div v-if="formulasOpen" class="formulas-body">
        <dl class="formulas-list">
          <dt>Ёмкость заряда / разряда (Ah)</dt>
          <dd>
            <code>Q = ∑<sub>steps</sub> max<sub>step</sub>(∫ |I|·dt / 3600)</code>
            <small>Трапецоидальное интегрирование |тока| по времени, per-step максимум (корректно для CCCV: CC + CV шаги складываются), затем суммирование по шагам того же типа внутри одного цикла.</small>
          </dd>
          <dt>Удельная ёмкость (mAh/g)</dt>
          <dd>
            <code>Q<sub>spec</sub> = Q · 10<sup>6</sup> / m<sub>AM</sub></code>
            <small>Q в ампер-часах, m<sub>AM</sub> в милиграммах активного материала. Формула выводится из 1 Ah = 1000 mAh и m(g) = m(mg)/1000.</small>
          </dd>
          <dt>Кулоновская эффективность, CE (%)</dt>
          <dd>
            <code>CE = Q<sub>DChg</sub> / Q<sub>Chg</sub> × 100</code>
            <small>Показывает долю лития, возвращаемого из анода. CE &lt; 100% — часть заряда идёт на необратимые процессы (SEI, разложение электролита).</small>
          </dd>
          <dt>Энергетическая эффективность, EE (%)</dt>
          <dd>
            <code>EE = E<sub>DChg</sub> / E<sub>Chg</sub> × 100</code>
            <small>Round-trip energy efficiency. Учитывает потери на перенапряжение (voltage hysteresis), чего CE не отражает.</small>
          </dd>
          <dt>Среднее напряжение (V̄)</dt>
          <dd>
            <code>V̄ = ⟨V⟩<sub>step</sub></code>
            <small>Арифметическое среднее напряжения по точкам шага. Рост ΔV̄ = V̄<sub>chg</sub> − V̄<sub>dch</sub> отражает рост поляризации / омического сопротивления (старение ячейки).</small>
          </dd>
          <dt>Дифференциальная ёмкость, dQ/dV (Ah/V)</dt>
          <dd>
            <code>|dQ/dV| = |ΔQ<sub>i,i-1</sub> / ΔV<sub>i,i-1</sub>|</code>
            <small>Пары точек внутри одного шага, |ΔV| &gt; 2 mV (отсечка шума). Сглаживание: скользящее среднее w=5. Пики соответствуют фазовым переходам материала.</small>
          </dd>
          <dt>Классификация step_type</dt>
          <dd>
            <code>«Гальваностат» + I̅ &gt; 0 → charge, I̅ &lt; 0 → discharge</code>
            <small>«Вольтметр» (OCV-измерение) → rest. «Потенциостат» → cccv при I ≠ 0, rest при I = 0. Для файлов без «Тип работы» (EN locale) — только по знаку среднего тока шага.</small>
          </dd>
        </dl>
      </div>
    </div>

    <!-- Quick filters (replace whole selection) -->
    <div v-if="summary.length" class="cycle-filters">
      <span class="cycle-label">Фильтры:</span>
      <button class="filter-btn" @click="selectAll">
        Все ({{ Math.min(allCycleNumbers.length, maxSelected) }})
      </button>
      <span class="filter-every-group">
        <span class="filter-every-prefix">каждый</span>
        <input
          v-model.number="everyNStep"
          type="number"
          min="1"
          :max="allCycleNumbers.length"
          class="filter-input"
          placeholder="N"
          :disabled="allCycleNumbers.length < 2"
          :title="'1, 1+N, 1+2N, ...'"
          @change="onEveryNApply"
          @keydown.enter="onEveryNApply"
        />
        <span class="filter-every-suffix">-й</span>
      </span>
      <!-- Custom range popover -->
      <div class="filter-range" :class="{ 'is-open': rangeOpen }">
        <button class="filter-btn" @click="rangeOpen = !rangeOpen">
          Диапазон…
        </button>
        <div v-if="rangeOpen" class="range-popover">
          <span>от</span>
          <input v-model.number="rangeFrom" type="number" class="range-input"
                 :min="allCycleNumbers[0]" :max="allCycleNumbers[allCycleNumbers.length - 1]"
                 :placeholder="allCycleNumbers[0]" />
          <span>до</span>
          <input v-model.number="rangeTo" type="number" class="range-input"
                 :min="allCycleNumbers[0]" :max="allCycleNumbers[allCycleNumbers.length - 1]"
                 :placeholder="allCycleNumbers[allCycleNumbers.length - 1]" />
          <button class="filter-btn filter-btn--apply" @click="applyRange">Применить</button>
        </div>
      </div>
      <button
        class="filter-btn filter-btn--clear"
        :disabled="!selectedCycles.length"
        @click="clearSelection"
      >
        Очистить
      </button>
      <span class="cycle-hint">
        выбрано {{ selectedCycles.length }} из {{ allCycleNumbers.length }}
      </span>
    </div>

    <!-- Cycle selector (representative chips when many cycles) -->
    <div class="cycle-selector">
      <span class="cycle-label">Циклы:</span>
      <template v-for="(c, idx) in cycleButtons" :key="c">
        <!-- "…" between non-consecutive chip numbers so the user sees the
             selection is a sparse subset, not a complete range -->
        <span
          v-if="idx > 0 && c - cycleButtons[idx - 1] > 1"
          class="cycle-gap"
          aria-hidden="true"
        >…</span>
        <button
          :class="['cycle-btn', selectedSet.has(c) ? 'active' : '', loadingSet.has(c) ? 'loading' : '']"
          @click="handleToggle(c)"
        >
          <i v-if="loadingSet.has(c)" class="pi pi-spin pi-spinner" style="font-size:9px;margin-right:3px"></i>
          {{ c }}
        </button>
      </template>
    </div>

    <!-- Voltage profile (overlay of selected cycles) -->
    <div v-if="selectedCycles.length" class="chart-card chart-card--wide">
      <button class="chart-reset-zoom-btn" title="Сброс зума (Shift+drag — панорама, колесо — масштаб)" @click="resetZoom(voltageChartRef)">
        <i class="pi pi-refresh"></i>
      </button>
      <button class="chart-export-btn" title="Скачать PNG" @click="exportChartPNG(voltageChartRef, 'voltage_profile')">
        <i class="pi pi-download"></i>
      </button>
      <div class="chart-wrap chart-wrap--tall">
        <Scatter ref="voltageChartRef" :data="voltageChartData" :options="voltageOptions" />
      </div>
    </div>
    <div v-else class="chart-placeholder">
      <i class="pi pi-chart-line"></i>
      Выберите цикл(ы) выше или кликните по точке на графике ёмкости
    </div>

    <!-- dQ/dV plot -->
    <div v-if="selectedCycles.length" class="chart-card chart-card--wide">
      <button class="chart-reset-zoom-btn" title="Сброс зума (Shift+drag — панорама, колесо — масштаб)" @click="resetZoom(dqdvChartRef)">
        <i class="pi pi-refresh"></i>
      </button>
      <button class="chart-export-btn" title="Скачать PNG" @click="exportChartPNG(dqdvChartRef, 'dqdv')">
        <i class="pi pi-download"></i>
      </button>
      <div class="chart-wrap chart-wrap--tall">
        <Scatter ref="dqdvChartRef" :data="dqdvChartData" :options="dqdvOptions" />
      </div>
    </div>

    <!-- 🔍 Raw datapoints panel — at the bottom so users scan charts
         first, then dig into the numbers for verification. Defaults to
         the first active session + first cycle with data; row click in
         the summary table above updates the selection. -->
    <div v-if="sessions.length" class="raw-panel">
      <div class="raw-panel-head">
        <span class="raw-panel-title">🔍 Сырые точки</span>

        <!-- Session picker (only shown when > 1 active) -->
        <template v-if="sessions.length > 1">
          <label class="raw-label">Измерение:</label>
          <select
            class="raw-select"
            :value="rawAutoSession?.session_id"
            @change="e => selectRawView(sessions.find(x => x.session_id === Number(e.target.value)), rawAutoCycle)"
          >
            <option v-for="s in sessions" :key="s.session_id" :value="s.session_id">
              {{ sessionShortLabel(s) }}
            </option>
          </select>
        </template>

        <label class="raw-label">Цикл:</label>
        <select
          class="raw-select"
          :value="rawAutoCycle"
          @change="e => requestRawCycle(Number(e.target.value))"
        >
          <option v-for="opt in rawCycleOptions" :key="opt.value" :value="opt.value">
            Ц{{ opt.value }}{{ opt.loaded ? '' : ' (не загружен)' }}
          </option>
        </select>

        <label class="raw-label">Шаг:</label>
        <div class="raw-filter-btns">
          <button
            v-for="opt in [
              { v: 'all',       l: 'Все' },
              { v: 'charge',    l: 'Заряд' },
              { v: 'discharge', l: 'Разряд' },
              { v: 'cccv',      l: 'CCCV' },
              { v: 'rest',      l: 'Отдых' },
            ]"
            :key="opt.v"
            class="raw-filter-btn"
            :class="{ 'is-active': rawFilter === opt.v }"
            @click="rawFilter = opt.v; rawPage = 0"
          >{{ opt.l }}</button>
        </div>

        <label class="raw-label">V от</label>
        <input v-model.number="rawSearchMin" type="number" step="0.01" class="raw-range" placeholder="—"
               @input="rawPage = 0" />
        <label class="raw-label">до</label>
        <input v-model.number="rawSearchMax" type="number" step="0.01" class="raw-range" placeholder="—"
               @input="rawPage = 0" />

        <span class="raw-count">
          <strong>{{ rawFiltered.length }}</strong>
          <span class="raw-count-total">/ {{ rawPoints.length }} точек</span>
        </span>
      </div>

      <!-- Points table or hint to pick a cycle -->
      <div v-if="rawPoints.length" class="raw-table-scroll">
        <table class="raw-table">
          <thead>
            <tr>
              <th class="c-idx">#</th>
              <th>t (с)</th>
              <th>V</th>
              <th>I (A)</th>
              <th>Q (Ah)</th>
              <th>step</th>
              <th>type</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, idx) in rawPagePoints" :key="rawPage * 500 + idx">
              <td class="c-idx">{{ rawPage * 500 + idx + 1 }}</td>
              <td>{{ p.time_s == null ? '—' : p.time_s.toFixed(2) }}</td>
              <td>{{ p.voltage_v == null ? '—' : p.voltage_v.toFixed(5) }}</td>
              <td>{{ p.current_a == null ? '—' : p.current_a.toExponential(4) }}</td>
              <td>{{ p.capacity_ah == null ? '—' : p.capacity_ah.toExponential(4) }}</td>
              <td>{{ p.step_number ?? '—' }}</td>
              <td>
                <span class="raw-type-chip" :data-type="p.step_type">{{ p.step_type || '—' }}</span>
              </td>
            </tr>
            <tr v-if="!rawPagePoints.length">
              <td colspan="7" class="raw-empty">Нет точек под фильтр</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="raw-empty-panel">
        Цикл не загружен. Выберите цикл выше или в блоке «Циклы» — данные
        подгрузятся и появятся здесь.
      </div>

      <!-- Pagination -->
      <div v-if="rawPageCount > 1" class="raw-pagination">
        <button class="raw-pg-btn" :disabled="rawPage === 0" @click="rawPage = 0">« первая</button>
        <button class="raw-pg-btn" :disabled="rawPage === 0" @click="rawPage--">‹ назад</button>
        <span class="raw-pg-info">Страница {{ rawPage + 1 }} из {{ rawPageCount }}</span>
        <button class="raw-pg-btn" :disabled="rawPage >= rawPageCount - 1" @click="rawPage++">вперёд ›</button>
        <button class="raw-pg-btn" :disabled="rawPage >= rawPageCount - 1" @click="rawPage = rawPageCount - 1">последняя »</button>
      </div>
    </div>

  </div>
</template>

<style scoped>
.cycling-charts { display: flex; flex-direction: column; gap: 1rem; }

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.chart-card {
  border: 1px solid rgba(0, 50, 116, 0.06);
  border-radius: 8px;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.5);
  position: relative;
}
.chart-card--wide { grid-column: 1 / -1; }

.chart-wrap { position: relative; height: 240px; }
.chart-wrap--tall { height: 300px; }

/* PNG export button — top-right corner */
.chart-export-btn,
.chart-reset-zoom-btn {
  position: absolute;
  top: 6px;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid rgba(0, 50, 116, 0.1);
  background: rgba(255, 255, 255, 0.85);
  color: #003274;
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
  z-index: 2;
}
.chart-export-btn { right: 6px; }
.chart-reset-zoom-btn { right: 38px; }  /* sits to the left of PNG button */
.chart-card:hover .chart-export-btn,
.chart-card:hover .chart-reset-zoom-btn {
  opacity: 1;
}
.chart-export-btn:hover,
.chart-reset-zoom-btn:hover {
  background: #003274;
  color: white;
}

/* ── Cycle filters (quick-select) ── */
.cycle-filters {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  padding: 0.35rem 0;
}
.filter-btn {
  padding: 3px 10px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 6px;
  background: white;
  font-size: 12px;
  font-weight: 500;
  color: #003274;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.filter-btn:hover:not(:disabled) {
  background: #003274;
  color: white;
  border-color: #003274;
}
.filter-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.filter-btn--clear {
  margin-left: auto;
  background: transparent;
  color: #E74C3C;
  border-color: rgba(231, 76, 60, 0.25);
}
.filter-btn--clear:hover:not(:disabled) {
  background: #E74C3C;
  color: white;
  border-color: #E74C3C;
}
.filter-btn--apply {
  background: #003274;
  color: white;
  border-color: #003274;
}

/* "каждый N-й" — plain inline group: label text + number input + "-й" text.
   Native <input> sizes naturally to match the filter-btn pills (same
   padding, border, font), so there's nothing to fight. */
.filter-every-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 6px;
  background: white;
  font-size: 12px;
  color: #003274;
}
.filter-every-prefix,
.filter-every-suffix {
  font-weight: 500;
  color: rgba(0, 50, 116, 0.6);
}
.filter-input {
  width: 60px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: #003274;
  font-family: inherit;
  padding: 0 2px;
  outline: none;
  text-align: center;
  /* Hide browser default number spinners for a cleaner inline look */
  -moz-appearance: textfield;
}
.filter-input::-webkit-outer-spin-button,
.filter-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.filter-input:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.filter-every-group:focus-within {
  border-color: #003274;
  box-shadow: 0 0 0 2px rgba(0, 50, 116, 0.12);
}

/* Range popover — inline bubble */
.filter-range { position: relative; }
.range-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: white;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  z-index: 10;
  font-size: 12px;
  color: #4B5563;
}
.range-input {
  width: 60px;
  padding: 3px 6px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  text-align: center;
}
.range-input:focus { outline: none; border-color: #003274; }

/* ── Cycle selector ── */
.cycle-selector {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}
.cycle-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 50, 116, 0.4);
  margin-right: 4px;
}
.cycle-btn {
  padding: 3px 10px;
  border: 1px solid rgba(0, 50, 116, 0.1);
  border-radius: 6px;
  background: white;
  font-size: 12px;
  font-weight: 500;
  color: #003274;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
}
.cycle-btn:hover { background: rgba(0, 50, 116, 0.06); }
.cycle-btn.active {
  background: #003274;
  color: white;
  border-color: #003274;
}
.cycle-btn.loading {
  opacity: 0.7;
}
.cycle-hint {
  font-size: 10px;
  color: rgba(0, 50, 116, 0.4);
  margin-left: 6px;
}
.cycle-gap {
  color: rgba(0, 50, 116, 0.35);
  font-size: 11px;
  padding: 0 1px;
  user-select: none;
}

/* ── Per-session summary tables (mimics colleague's Excel layout) ── */
.summary-tables {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.summary-table-wrap {
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 8px;
  background: white;
  overflow: hidden;
}
.summary-table-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12px;
  color: #1F2937;
  background: rgba(0, 50, 116, 0.02);
  border-bottom: 2px solid;   /* color set inline via :style */
}
.summary-table-head strong { color: #003274; font-weight: 700; }
.summary-table-chip {
  width: 10px; height: 10px; border-radius: 50%;
  flex-shrink: 0;
}
.summary-table-sub {
  color: #6B7280;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.summary-table-scroll {
  overflow-x: auto;
  max-height: 260px;
  overflow-y: auto;
}
.summary-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
.summary-table thead th {
  background: rgba(0, 50, 116, 0.04);
  color: #003274;
  font-weight: 600;
  text-align: right;
  padding: 4px 10px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.1);
  position: sticky;
  top: 0;
  z-index: 1;
  white-space: nowrap;
}
.summary-table thead th:first-child {
  text-align: center;
}
.summary-table tbody td {
  padding: 3px 10px;
  text-align: right;
  border-bottom: 1px solid rgba(0, 50, 116, 0.04);
  color: #1F2937;
}
.summary-table tbody tr:last-child td { border-bottom: none; }
.summary-table tbody tr:hover td { background: rgba(0, 50, 116, 0.03); }
.cell-cycle {
  text-align: center !important;
  font-weight: 600;
  color: #003274 !important;
}
.summary-row { cursor: pointer; transition: background 0.08s; }
.summary-row:hover td { background: rgba(211, 167, 84, 0.08); }

/* ── Formulas panel ── */
.formulas-panel {
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 8px;
  background: white;
  overflow: hidden;
}
.formulas-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: rgba(0, 50, 116, 0.02);
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: #003274;
  text-align: left;
  transition: background 0.12s;
}
.formulas-head:hover { background: rgba(0, 50, 116, 0.05); }
.formulas-hint {
  margin-left: auto;
  font-weight: 400;
  font-size: 11px;
  color: rgba(0, 50, 116, 0.45);
}
.formulas-body { padding: 10px 16px 14px; }
.formulas-list { margin: 0; }
.formulas-list dt {
  font-size: 12px;
  font-weight: 700;
  color: #003274;
  margin-top: 10px;
}
.formulas-list dt:first-child { margin-top: 0; }
.formulas-list dd {
  margin: 3px 0 0;
  font-size: 12px;
  line-height: 1.4;
}
.formulas-list code {
  display: inline-block;
  background: rgba(0, 50, 116, 0.06);
  padding: 2px 8px;
  border-radius: 4px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 12px;
  color: #003274;
}
.formulas-list small {
  display: block;
  margin-top: 3px;
  color: #6B7280;
  font-size: 11px;
}

/* ── Raw datapoints panel (inline, always visible) ── */
.raw-panel {
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 8px;
  background: white;
  overflow: hidden;
}
.raw-panel-head {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 8px 14px;
  background: rgba(0, 50, 116, 0.02);
  border-bottom: 1px solid rgba(0, 50, 116, 0.06);
}
.raw-panel-title {
  font-size: 13px;
  font-weight: 700;
  color: #003274;
  margin-right: 4px;
}
.raw-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(0, 50, 116, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.raw-select {
  padding: 3px 8px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 4px;
  background: white;
  font-size: 12px;
  font-family: inherit;
  color: #003274;
  cursor: pointer;
}
.raw-select:focus { outline: none; border-color: #003274; box-shadow: 0 0 0 2px rgba(0, 50, 116, 0.12); }

.raw-empty-panel {
  padding: 2rem;
  text-align: center;
  color: rgba(0, 50, 116, 0.5);
  font-size: 12px;
}
.raw-filter-btns {
  display: inline-flex;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 6px;
  overflow: hidden;
}
.raw-filter-btn {
  padding: 3px 8px;
  border: none;
  background: white;
  font-size: 11px;
  font-family: inherit;
  color: rgba(0, 50, 116, 0.7);
  cursor: pointer;
  border-right: 1px solid rgba(0, 50, 116, 0.1);
  transition: all 0.12s;
}
.raw-filter-btn:last-child { border-right: none; }
.raw-filter-btn:hover:not(.is-active) { background: rgba(0, 50, 116, 0.04); color: #003274; }
.raw-filter-btn.is-active { background: #003274; color: white; }
.raw-range {
  width: 70px;
  padding: 3px 6px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 4px;
  font-size: 11px;
  font-family: inherit;
  text-align: center;
}
.raw-count { margin-left: auto; font-size: 11px; color: rgba(0, 50, 116, 0.55); }
.raw-count strong { color: #003274; }

.raw-table-scroll {
  max-height: 420px;
  overflow-y: auto;
  border: 1px solid rgba(0, 50, 116, 0.06);
  border-radius: 6px;
}
.raw-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
.raw-table thead th {
  position: sticky;
  top: 0;
  background: rgba(0, 50, 116, 0.04);
  padding: 4px 8px;
  text-align: right;
  font-weight: 600;
  color: #003274;
  border-bottom: 1px solid rgba(0, 50, 116, 0.1);
  white-space: nowrap;
  z-index: 1;
}
.raw-table thead th.c-idx { text-align: center; width: 40px; }
.raw-table tbody td {
  padding: 2px 8px;
  text-align: right;
  border-bottom: 1px solid rgba(0, 50, 116, 0.03);
  color: #1F2937;
}
.raw-table tbody td.c-idx { text-align: center; color: rgba(0, 50, 116, 0.45); }
.raw-table tbody tr:hover td { background: rgba(0, 50, 116, 0.02); }
.raw-type-chip {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  background: rgba(0, 50, 116, 0.06);
  color: rgba(0, 50, 116, 0.7);
}
.raw-type-chip[data-type="charge"] { background: rgba(82, 201, 166, 0.15); color: #0E6B50; }
.raw-type-chip[data-type="discharge"] { background: rgba(0, 50, 116, 0.15); color: #003274; }
.raw-type-chip[data-type="cccv"] { background: rgba(211, 167, 84, 0.2); color: #8B6914; }
.raw-type-chip[data-type="rest"] { background: rgba(107, 114, 128, 0.12); color: #4B5563; }
.raw-empty { text-align: center; padding: 2rem; color: rgba(0, 50, 116, 0.4); }

.raw-pagination {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  padding-top: 6px;
}
.raw-pg-btn {
  padding: 3px 10px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 4px;
  background: white;
  font-size: 11px;
  font-family: inherit;
  color: #003274;
  cursor: pointer;
}
.raw-pg-btn:hover:not(:disabled) { background: #003274; color: white; }
.raw-pg-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.raw-pg-info { font-size: 11px; color: rgba(0, 50, 116, 0.55); min-width: 180px; text-align: center; }

.chart-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 2.5rem 1rem;
  font-size: 12px;
  color: rgba(0, 50, 116, 0.4);
  border: 1px dashed rgba(0, 50, 116, 0.1);
  border-radius: 8px;
}

@media (max-width: 768px) {
  .charts-row { grid-template-columns: 1fr; }
}
</style>
