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
  Tooltip,
  Legend,
  Filler,
  ScatterController,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ScatterController)

// Multi-session props — each session carries its own summary + cycleDataMap
// + color. See CyclingPage.activeSessionViews for the shape.
const props = defineProps({
  sessions: { type: Array, default: () => [] },
  // Cycle selection is global (applies to every session on the chart). If
  // a session doesn't have a given cycle, it's silently skipped in the
  // voltage/dQdV panels — no error.
  selectedCycles: { type: Array, default: () => [] },
  maxSelected: { type: Number, default: 20 },
})

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
const efficiencyChartRef = ref(null)
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

// Legend dedup: by default Chart.js generates one legend entry per
// dataset — which means per session × {discharge, charge} = 2 entries.
// Past ~5 sessions the legend hogs the chart. We collapse into one entry
// per session; the solid-vs-dashed convention is stable and explained
// once in the chip bar tooltip.
function dedupeLegend(chart) {
  const seen = new Map()
  chart.data.datasets.forEach((ds, idx) => {
    // Extract session prefix: "#42 Акк#5 · разряд" → "#42 Акк#5"
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
  return Array.from(seen.values())
}

// ── Capacity vs Cycle (one line per session, discharge only) ──────────
// This is the classic "capacity fade" plot. We show discharge capacity
// only by default — that's the scientific standard (most Li-ion papers
// plot discharge C vs cycle). Charge capacity is implicit: the CE chart
// already encodes charge/discharge ratio, and showing both lines on
// capacity just clutters the overlay. If a user needs to see the charge
// side explicitly, that belongs on a dedicated "irreversible capacity"
// plot (which we can add later).
const capacityChartData = computed(() => {
  const datasets = []
  const selectedSet = new Set(props.selectedCycles)

  for (const s of props.sessions) {
    if (!s.summary?.length) continue

    // Fill-under-line only in solo mode — overlap stacks ugly otherwise.
    const isSolo = props.sessions.length === 1
    datasets.push({
      label: sessionShortLabel(s),
      data: s.summary.map(row => ({
        x: row.cycle_number,
        y: row.discharge_capacity_ah,
      })),
      borderColor: s.color,
      backgroundColor: isSolo ? fillColor(s.color, 0.08) : 'transparent',
      fill: isSolo,
      tension: 0.2,
      pointRadius: s.summary.map(row => selectedSet.has(row.cycle_number) ? 5 : 2.5),
      pointBackgroundColor: s.summary.map(row =>
        selectedSet.has(row.cycle_number) ? '#D3A754' : s.color
      ),
      pointHoverRadius: 6,
      borderWidth: 1.8,
    })
  }

  return { datasets }
})

const capacityOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  onClick: (evt, elements, chart) => {
    // Click → toggle the cycle from the first clicked point. Works across
    // all session datasets — we read the point's .x (cycle_number) from
    // the dataset, not the index (labels aren't shared anymore now that
    // each session is its own dataset with x/y pairs).
    if (elements.length > 0) {
      const el = elements[0]
      const ds = chart.data.datasets[el.datasetIndex]
      const pt = ds?.data?.[el.index]
      const cycle = typeof pt === 'object' ? pt.x : pt
      if (cycle !== undefined) emit('toggle-cycle', cycle)
    }
  },
  plugins: {
    legend: {
      position: 'bottom',
      labels: { boxWidth: 12, font: { size: 11 }, generateLabels: dedupeLegend },
    },
    title: {
      display: true,
      text: props.sessions.length > 1
        ? `Ёмкость vs Цикл · ${props.sessions.length} измерений`
        : 'Ёмкость vs Цикл',
      font: { size: 13, weight: 600 },
      color: '#003274',
      padding: { bottom: 10 },
    },
    tooltip: {
      callbacks: { afterBody: () => 'Клик — добавить/убрать цикл' },
    },
  },
  scales: {
    y: { title: { display: true, text: 'Ёмкость (Ah)', font: { size: 10 } }, beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,50,116,0.05)' } },
    x: {
      type: 'linear',
      title: { display: true, text: 'Цикл', font: { size: 10 } },
      ticks: { font: { size: 10 }, stepSize: 1 },
      grid: { display: false },
    },
  },
}))

// ── Coulombic Efficiency (one line per session) ──
const efficiencyChartData = computed(() => {
  const datasets = []
  for (const s of props.sessions) {
    if (!s.summary?.length) continue
    datasets.push({
      label: sessionShortLabel(s),
      data: s.summary.map(row => ({
        x: row.cycle_number,
        y: row.coulombic_efficiency,
      })),
      borderColor: s.color,
      backgroundColor: 'transparent',
      tension: 0.2,
      pointRadius: 2.5,
      borderWidth: 1.8,
    })
  }
  return { datasets }
})

const efficiencyOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: props.sessions.length > 1,
      position: 'bottom',
      labels: { boxWidth: 12, font: { size: 11 }, generateLabels: dedupeLegend },
    },
    title: {
      display: true,
      text: props.sessions.length > 1
        ? `Кулоновская эффективность · ${props.sessions.length} измерений`
        : 'Кулоновская эффективность',
      font: { size: 13, weight: 600 },
      color: '#003274',
      padding: { bottom: 10 },
    },
  },
  scales: {
    y: { title: { display: true, text: '%', font: { size: 10 } }, suggestedMin: 70, suggestedMax: 101, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,50,116,0.05)' } },
    x: {
      type: 'linear',
      title: { display: true, text: 'Цикл', font: { size: 10 } },
      ticks: { font: { size: 10 }, stepSize: 1 },
      grid: { display: false },
    },
  },
}))

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

const voltageChartData = computed(() => {
  const datasets = []
  const sortedCycles = [...props.selectedCycles].sort((a, b) => a - b)
  const useCapacity = hasCapacity.value
  const nCycles = sortedCycles.length

  for (const s of props.sessions) {
    sortedCycles.forEach((cycleNum, cIdx) => {
      const points = s.cycleDataMap?.[cycleNum] || []
      if (!points.length) return

      const charge = points.filter(d => d.step_type === 'charge' || d.step_type === 'cccv')
      const discharge = points.filter(d => d.step_type === 'discharge')
      // Thickness grows from 1.0 (first cycle) to ~2.2 (last cycle)
      const thickness = 1.0 + (nCycles > 1 ? (cIdx / (nCycles - 1)) * 1.2 : 0.6)

      // Old cycles fade, new cycles vivid — within the session's color
      const alpha = cycleAlpha(cIdx, nCycles)
      const cycleColor = fillColor(s.color, alpha)

      if (charge.length) {
        datasets.push({
          label: `Ц${cycleNum}_${sessionShortLabel(s)} · заряд`,
          data: charge.map(p => ({
            x: useCapacity ? p.capacity_ah : p.time_s,
            y: p.voltage_v,
          })),
          borderColor: cycleColor,
          backgroundColor: cycleColor,
          pointRadius: 0,
          borderWidth: thickness,
          borderDash: [4, 2],
          showLine: true,
        })
      }
      if (discharge.length) {
        datasets.push({
          label: `Ц${cycleNum}_${sessionShortLabel(s)} · разряд`,
          data: discharge.map(p => ({
            x: useCapacity ? p.capacity_ah : p.time_s,
            y: p.voltage_v,
          })),
          borderColor: cycleColor,
          backgroundColor: cycleColor,
          pointRadius: 0,
          borderWidth: thickness,
          showLine: true,
        })
      }
    })
  }

  return { datasets }
})

const voltageOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: { boxWidth: 12, font: { size: 10 }, generateLabels: dedupeLegend },
    },
    title: {
      display: true,
      text: (() => {
        if (!props.selectedCycles.length) return 'Профиль напряжения'
        const cLabel = `${props.selectedCycles.length} ${props.selectedCycles.length === 1 ? 'цикл' : 'циклов'}`
        if (props.sessions.length <= 1) return `Профиль напряжения — ${cLabel}`
        return `Профиль напряжения — ${props.sessions.length} измерений × ${cLabel}`
      })(),
      font: { size: 13, weight: 600 },
      color: '#003274',
      padding: { bottom: 10 },
    },
  },
  scales: {
    y: { title: { display: true, text: 'Напряжение (V)', font: { size: 10 } }, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,50,116,0.05)' } },
    x: {
      type: 'linear',
      title: { display: true, text: hasCapacity.value ? 'Ёмкость (Ah)' : 'Время (с)', font: { size: 10 } },
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
 * - Smoothing: moving average window=5.
 */
function computeDQDV(points) {
  const charge = points.filter(d => (d.step_type === 'charge' || d.step_type === 'cccv') && d.voltage_v != null && d.capacity_ah != null)
  const discharge = points.filter(d => d.step_type === 'discharge' && d.voltage_v != null && d.capacity_ah != null)

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

    // Moving average smoothing
    const w = 5
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
    sortedCycles.forEach((cycleNum, cIdx) => {
      const points = s.cycleDataMap?.[cycleNum] || []
      if (!points.length) return

      const { charge, discharge } = computeDQDV(points)
      const thickness = 1.0 + (nCycles > 1 ? (cIdx / (nCycles - 1)) * 1.0 : 0.5)
      // Old cycles fade, new cycles vivid — same convention as voltage profile
      const alpha = cycleAlpha(cIdx, nCycles)
      const cycleColor = fillColor(s.color, alpha)

      if (charge.length) {
        datasets.push({
          label: `Ц${cycleNum}_${sessionShortLabel(s)} · заряд`,
          data: charge,
          borderColor: cycleColor,
          backgroundColor: cycleColor,
          pointRadius: 0,
          borderWidth: thickness,
          borderDash: [4, 2],
          showLine: true,
        })
      }
      if (discharge.length) {
        datasets.push({
          label: `Ц${cycleNum}_${sessionShortLabel(s)} · разряд`,
          data: discharge,
          borderColor: cycleColor,
          backgroundColor: cycleColor,
          pointRadius: 0,
          borderWidth: thickness,
          showLine: true,
        })
      }
    })
  }

  return { datasets }
})

const dqdvOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: { boxWidth: 12, font: { size: 10 }, generateLabels: dedupeLegend },
    },
    title: {
      display: true,
      text: 'Дифференциальная ёмкость (|dQ/dV|)',
      font: { size: 13, weight: 600 },
      color: '#003274',
      padding: { bottom: 10 },
    },
  },
  scales: {
    y: { title: { display: true, text: '|dQ/dV| (Ah/V)', font: { size: 10 } }, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,50,116,0.05)' } },
    x: {
      type: 'linear',
      title: { display: true, text: 'Напряжение (V)', font: { size: 10 } },
      ticks: { font: { size: 10 } },
      grid: { display: false },
    },
  },
}

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

function exportChartPNG(chartRef, name) {
  const inst = chartRef.value?.chart
  if (!inst) return
  const url = inst.toBase64Image('image/png', 1)
  const link = document.createElement('a')
  link.href = url
  // Filename includes all active session ids so multi-session exports are
  // self-labeling ("cycling_42_43_capacity.png" instead of a single id).
  const idPart = props.sessions.map(s => s.session_id).join('_') || 'x'
  link.download = `cycling_${idPart}_${sanitizeFilename(name)}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<template>
  <div class="cycling-charts">
    <!-- Top row: capacity + efficiency -->
    <div class="charts-row">
      <div class="chart-card">
        <button class="chart-export-btn" title="Скачать PNG" @click="exportChartPNG(capacityChartRef, 'capacity')">
          <i class="pi pi-download"></i>
        </button>
        <div class="chart-wrap">
          <Line v-if="summary.length" ref="capacityChartRef" :data="capacityChartData" :options="capacityOptions" />
        </div>
      </div>
      <div class="chart-card">
        <button class="chart-export-btn" title="Скачать PNG" @click="exportChartPNG(efficiencyChartRef, 'efficiency')">
          <i class="pi pi-download"></i>
        </button>
        <div class="chart-wrap">
          <Line v-if="summary.length" ref="efficiencyChartRef" :data="efficiencyChartData" :options="efficiencyOptions" />
        </div>
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

    <!-- Cycle selector (individual chips) -->
    <div class="cycle-selector">
      <span class="cycle-label">Циклы:</span>
      <button
        v-for="c in cycleButtons"
        :key="c"
        :class="['cycle-btn', selectedSet.has(c) ? 'active' : '', loadingSet.has(c) ? 'loading' : '']"
        @click="handleToggle(c)"
      >
        <i v-if="loadingSet.has(c)" class="pi pi-spin pi-spinner" style="font-size:9px;margin-right:3px"></i>
        {{ c }}
      </button>
      <span v-if="selectedCycles.length" class="cycle-hint">
        · клик по точке графика тоже добавляет цикл
      </span>
    </div>

    <!-- Voltage profile (overlay of selected cycles) -->
    <div v-if="selectedCycles.length" class="chart-card chart-card--wide">
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
      <button class="chart-export-btn" title="Скачать PNG" @click="exportChartPNG(dqdvChartRef, 'dqdv')">
        <i class="pi pi-download"></i>
      </button>
      <div class="chart-wrap chart-wrap--tall">
        <Scatter ref="dqdvChartRef" :data="dqdvChartData" :options="dqdvOptions" />
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
.chart-export-btn {
  position: absolute;
  top: 6px;
  right: 6px;
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
.chart-card:hover .chart-export-btn {
  opacity: 1;
}
.chart-export-btn:hover {
  background: #003274;
  color: white;
}

/* ── Cycle filters (quick-select) ── */
.cycle-filters {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  padding: 0.5rem 0.75rem;
  background: rgba(211, 167, 84, 0.06);
  border: 1px solid rgba(211, 167, 84, 0.2);
  border-radius: 8px;
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
