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

const props = defineProps({
  summary: { type: Array, default: () => [] },
  cycleDataMap: { type: Object, default: () => ({}) },
  selectedCycles: { type: Array, default: () => [] },
  loadingCycles: { type: Array, default: () => [] },
  totalCycles: { type: Number, default: 0 },
  sessionId: { type: Number, default: 0 },
})

const emit = defineEmits(['toggle-cycle'])

// Chart refs for PNG export
const capacityChartRef = ref(null)
const efficiencyChartRef = ref(null)
const voltageChartRef = ref(null)
const dqdvChartRef = ref(null)

// ── Color palette for multi-cycle overlay ──
// Ordered, distinct, colorblind-friendlyish
const CYCLE_COLORS = [
  '#003274', // BADB blue
  '#E74C3C', // red
  '#52C9A6', // green
  '#D3A754', // ochre
  '#8E44AD', // purple
  '#16A085', // teal
  '#E67E22', // orange
  '#2C3E50', // slate
]
function colorForIndex(idx) {
  return CYCLE_COLORS[idx % CYCLE_COLORS.length]
}

// ── Capacity vs Cycle ──
const capacityChartData = computed(() => {
  const labels = props.summary.map(s => s.cycle_number)
  // Highlight selected cycles with larger point radius
  const selectedSet = new Set(props.selectedCycles)
  const pointRadius = props.summary.map(s => selectedSet.has(s.cycle_number) ? 5 : 2)
  const pointBg = props.summary.map(s => selectedSet.has(s.cycle_number) ? '#D3A754' : '#003274')

  return {
    labels,
    datasets: [
      {
        label: 'Разряд (Ah)',
        data: props.summary.map(s => s.discharge_capacity_ah),
        borderColor: '#003274',
        backgroundColor: 'rgba(0, 50, 116, 0.06)',
        fill: true,
        tension: 0.2,
        pointRadius,
        pointBackgroundColor: pointBg,
        pointHoverRadius: 6,
      },
      {
        label: 'Заряд (Ah)',
        data: props.summary.map(s => s.charge_capacity_ah),
        borderColor: '#52C9A6',
        backgroundColor: 'transparent',
        borderDash: [4, 2],
        tension: 0.2,
        pointRadius: 1,
      },
    ],
  }
})

const capacityOptions = {
  responsive: true,
  maintainAspectRatio: false,
  onClick: (evt, elements) => {
    if (elements.length > 0) {
      const idx = elements[0].index
      const cycle = props.summary[idx]?.cycle_number
      if (cycle !== undefined) emit('toggle-cycle', cycle)
    }
  },
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
    title: { display: true, text: 'Ёмкость vs Цикл', font: { size: 13, weight: 600 }, color: '#003274', padding: { bottom: 10 } },
    tooltip: {
      callbacks: {
        afterBody: () => 'Клик — добавить/убрать цикл',
      },
    },
  },
  scales: {
    y: { title: { display: true, text: 'Ёмкость (Ah)', font: { size: 10 } }, beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,50,116,0.05)' } },
    x: { title: { display: true, text: 'Цикл', font: { size: 10 } }, ticks: { font: { size: 10 } }, grid: { display: false } },
  },
}

// ── Coulombic Efficiency ──
const efficiencyChartData = computed(() => ({
  labels: props.summary.map(s => s.cycle_number),
  datasets: [{
    label: 'Кулоновская эффективность (%)',
    data: props.summary.map(s => s.coulombic_efficiency),
    borderColor: '#D3A754',
    backgroundColor: 'rgba(211, 167, 84, 0.06)',
    fill: true,
    tension: 0.2,
    pointRadius: 2,
  }],
}))

const efficiencyOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    title: { display: true, text: 'Кулоновская эффективность', font: { size: 13, weight: 600 }, color: '#003274', padding: { bottom: 10 } },
  },
  scales: {
    y: { title: { display: true, text: '%', font: { size: 10 } }, suggestedMin: 95, suggestedMax: 101, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,50,116,0.05)' } },
    x: { title: { display: true, text: 'Цикл', font: { size: 10 } }, ticks: { font: { size: 10 } }, grid: { display: false } },
  },
}

// ── Voltage Profile (overlay of selected cycles) ──
const hasCapacity = computed(() => {
  for (const cycleNum of props.selectedCycles) {
    const points = props.cycleDataMap[cycleNum] || []
    if (points.some(d => d.capacity_ah != null)) return true
  }
  return false
})

const voltageChartData = computed(() => {
  const datasets = []
  const sortedCycles = [...props.selectedCycles].sort((a, b) => a - b)
  const useCapacity = hasCapacity.value

  sortedCycles.forEach((cycleNum, idx) => {
    const points = props.cycleDataMap[cycleNum] || []
    if (!points.length) return

    const color = colorForIndex(idx)
    const charge = points.filter(d => d.step_type === 'charge' || d.step_type === 'cccv')
    const discharge = points.filter(d => d.step_type === 'discharge')

    if (charge.length) {
      datasets.push({
        label: `Цикл ${cycleNum} · заряд`,
        data: charge.map(p => ({
          x: useCapacity ? p.capacity_ah : p.time_s,
          y: p.voltage_v,
        })),
        borderColor: color,
        backgroundColor: color,
        pointRadius: 0,
        borderWidth: 1.6,
        borderDash: [4, 2],
        showLine: true,
      })
    }
    if (discharge.length) {
      datasets.push({
        label: `Цикл ${cycleNum} · разряд`,
        data: discharge.map(p => ({
          x: useCapacity ? p.capacity_ah : p.time_s,
          y: p.voltage_v,
        })),
        borderColor: color,
        backgroundColor: color,
        pointRadius: 0,
        borderWidth: 1.6,
        showLine: true,
      })
    }
  })

  return { datasets }
})

const voltageOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
    title: {
      display: true,
      text: props.selectedCycles.length
        ? `Профиль напряжения — ${props.selectedCycles.length} ${props.selectedCycles.length === 1 ? 'цикл' : 'циклов'}`
        : 'Профиль напряжения',
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

  sortedCycles.forEach((cycleNum, idx) => {
    const points = props.cycleDataMap[cycleNum] || []
    if (!points.length) return

    const color = colorForIndex(idx)
    const { charge, discharge } = computeDQDV(points)

    if (charge.length) {
      datasets.push({
        label: `Цикл ${cycleNum} · заряд`,
        data: charge,
        borderColor: color,
        backgroundColor: color,
        pointRadius: 0,
        borderWidth: 1.5,
        borderDash: [4, 2],
        showLine: true,
      })
    }
    if (discharge.length) {
      datasets.push({
        label: `Цикл ${cycleNum} · разряд`,
        data: discharge,
        borderColor: color,
        backgroundColor: color,
        pointRadius: 0,
        borderWidth: 1.5,
        showLine: true,
      })
    }
  })

  return { datasets }
})

const dqdvOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
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

// ── Quick cycle buttons ──
const cycleButtons = computed(() => {
  const numbers = props.summary.map(s => s.cycle_number)
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
const loadingSet = computed(() => new Set(props.loadingCycles))

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
  link.download = `cycling_session_${props.sessionId || 'x'}_${sanitizeFilename(name)}.png`
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

    <!-- Cycle selector -->
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
