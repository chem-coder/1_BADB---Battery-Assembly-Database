<script setup>
/**
 * CyclingCharts — interactive charts for battery cycling data.
 * 1. Capacity vs Cycle (discharge capacity fade)
 * 2. Coulombic Efficiency vs Cycle
 * 3. Voltage Profile (V vs time for selected cycle)
 */
import { computed } from 'vue'
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
  cycleData: { type: Array, default: () => [] },
  selectedCycle: { type: Number, default: null },
  totalCycles: { type: Number, default: 0 },
})

const emit = defineEmits(['select-cycle'])

// ── Capacity vs Cycle ──
const capacityChartData = computed(() => {
  const labels = props.summary.map(s => s.cycle_number)
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
        pointRadius: 2,
        pointHoverRadius: 5,
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
      if (cycle !== undefined) emit('select-cycle', cycle)
    }
  },
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
    title: { display: true, text: 'Ёмкость vs Цикл', font: { size: 13, weight: 600 }, color: '#003274', padding: { bottom: 10 } },
    tooltip: {
      callbacks: {
        afterBody: () => 'Клик — показать профиль цикла',
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

// ── Voltage Profile (selected cycle) ──
const voltageChartData = computed(() => {
  if (!props.cycleData.length) return { labels: [], datasets: [] }

  // Separate charge and discharge
  const charge = props.cycleData.filter(d => d.step_type === 'charge' || d.step_type === 'cccv')
  const discharge = props.cycleData.filter(d => d.step_type === 'discharge')
  const rest = props.cycleData.filter(d => d.step_type === 'rest')

  // Use capacity_ah as X-axis if available, otherwise time_s
  const hasCapacity = props.cycleData.some(d => d.capacity_ah != null)

  function makeDataset(points, label, color) {
    return {
      label,
      data: points.map(p => ({
        x: hasCapacity ? p.capacity_ah : p.time_s,
        y: p.voltage_v,
      })),
      borderColor: color,
      pointRadius: 0,
      borderWidth: 1.5,
      showLine: true,
    }
  }

  const datasets = []
  if (charge.length) datasets.push(makeDataset(charge, 'Заряд', '#E74C3C'))
  if (discharge.length) datasets.push(makeDataset(discharge, 'Разряд', '#003274'))
  if (rest.length) datasets.push(makeDataset(rest, 'Покой', '#6B7280'))

  return { datasets }
})

const voltageOptions = computed(() => {
  const hasCapacity = props.cycleData.some(d => d.capacity_ah != null)
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
      title: {
        display: true,
        text: props.selectedCycle !== null ? `Профиль цикла #${props.selectedCycle}` : 'Профиль напряжения',
        font: { size: 13, weight: 600 },
        color: '#003274',
        padding: { bottom: 10 },
      },
    },
    scales: {
      y: { title: { display: true, text: 'Напряжение (V)', font: { size: 10 } }, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,50,116,0.05)' } },
      x: {
        type: 'linear',
        title: { display: true, text: hasCapacity ? 'Ёмкость (Ah)' : 'Время (с)', font: { size: 10 } },
        ticks: { font: { size: 10 } },
        grid: { display: false },
      },
    },
  }
})

// ── Quick cycle buttons ──
const cycleButtons = computed(() => {
  const total = props.totalCycles || props.summary.length
  if (total <= 10) return props.summary.map(s => s.cycle_number)
  // Show first 3, middle, last 3
  const btns = new Set()
  for (let i = 0; i < Math.min(3, total); i++) btns.add(i)
  btns.add(Math.floor(total / 2))
  for (let i = Math.max(0, total - 3); i < total; i++) btns.add(i)
  return [...btns].sort((a, b) => a - b)
})
</script>

<template>
  <div class="cycling-charts">
    <!-- Top row: capacity + efficiency -->
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-wrap">
          <Line v-if="summary.length" :data="capacityChartData" :options="capacityOptions" />
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-wrap">
          <Line v-if="summary.length" :data="efficiencyChartData" :options="efficiencyOptions" />
        </div>
      </div>
    </div>

    <!-- Cycle selector -->
    <div class="cycle-selector">
      <span class="cycle-label">Профиль цикла:</span>
      <button
        v-for="c in cycleButtons"
        :key="c"
        :class="['cycle-btn', selectedCycle === c ? 'active' : '']"
        @click="emit('select-cycle', c)"
      >{{ c }}</button>
    </div>

    <!-- Voltage profile -->
    <div v-if="cycleData.length" class="chart-card chart-card--wide">
      <div class="chart-wrap chart-wrap--tall">
        <Scatter :data="voltageChartData" :options="voltageOptions" />
      </div>
    </div>
    <div v-else-if="selectedCycle !== null" class="chart-loading">
      <i class="pi pi-spin pi-spinner"></i> Загрузка данных цикла...
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
}
.chart-card--wide { grid-column: 1 / -1; }

.chart-wrap { position: relative; height: 240px; }
.chart-wrap--tall { height: 300px; }

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
}
.cycle-btn:hover { background: rgba(0, 50, 116, 0.06); }
.cycle-btn.active {
  background: #003274;
  color: white;
  border-color: #003274;
}

.chart-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 1.5rem;
  font-size: 13px;
  color: rgba(0, 50, 116, 0.4);
}

@media (max-width: 768px) {
  .charts-row { grid-template-columns: 1fr; }
}
</style>
