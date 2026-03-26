<script setup>
/**
 * StageNavigator — left sidebar of the Tape Constructor.
 *
 * Each stage row: number + label + graphical timeline bar below.
 * Timeline: grey track = full date range, green segment = this stage's date position.
 * Badge with date (дд.мм) sits on the green segment.
 * Bottom: date range "дд.мм.гггг — дд.мм.гггг" (earliest → latest across all stages).
 */
import { computed } from 'vue'

const props = defineProps({
  stages: { type: Array, required: true },
  activeStage: { type: String, default: '' },
  tapeStates: { type: Object, default: () => ({}) },
  activeTapeId: { type: [Number, String], default: null },
  tapeNames: { type: Object, default: () => ({}) },
  refs: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:activeStage'])

const activeTapeState = computed(() => {
  if (!props.activeTapeId) return null
  return props.tapeStates[props.activeTapeId] || null
})

function getStatus(ts, code) {
  return ts ? ts.stageStatus(code) : 'pending'
}

function stageStatusClass(code) {
  if (!activeTapeState.value) return 'pending'
  const baseStatus = getStatus(activeTapeState.value, code)
  if (baseStatus !== 'pending') return baseStatus
  const myIdx = props.stages.findIndex(s => s.code === code)
  for (let i = myIdx + 1; i < props.stages.length; i++) {
    if (getStatus(activeTapeState.value, props.stages[i].code) === 'done') return 'warning'
  }
  return 'pending'
}

function stageNumber(code) {
  const idx = props.stages.findIndex(s => s.code === code)
  return idx >= 0 ? idx + 1 : ''
}

// ── Timeline data ──
function getStageDate(code) {
  const ts = activeTapeState.value
  if (!ts) return null
  if (code === 'general_info') {
    return ts.general?.createdAt ? ts.general.createdAt.split('T')[0] : null
  }
  return ts.steps?.[code]?.date || null
}

function parseDateStr(s) {
  if (!s) return null
  return new Date(s + 'T00:00:00')
}

// Collect all dates across stages → min/max for shared time axis
const timeRange = computed(() => {
  const ts = activeTapeState.value
  if (!ts) return null

  const dates = []
  for (const stage of props.stages) {
    const d = getStageDate(stage.code)
    if (d) dates.push(parseDateStr(d))
  }
  if (dates.length === 0) return null

  const minMs = Math.min(...dates.map(d => d.getTime()))
  const maxMs = Math.max(...dates.map(d => d.getTime()))
  const minDate = new Date(minMs)
  const maxDate = new Date(maxMs)
  const spanMs = maxMs - minMs

  return { minDate, maxDate, minMs, maxMs, spanMs }
})

// Position of a stage's date on the shared timeline (0–100%)
function barPosition(code) {
  const tr = timeRange.value
  if (!tr) return null
  const dateStr = getStageDate(code)
  if (!dateStr) return null
  const d = parseDateStr(dateStr)
  if (!d) return null
  if (tr.spanMs === 0) return 50 // single day — center
  return 5 + ((d.getTime() - tr.minMs) / tr.spanMs) * 90
}

function formatDateShort(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}`
}

function formatDateFull(date) {
  if (!date) return ''
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

const dateRangeStart = computed(() => timeRange.value ? formatDateFull(timeRange.value.minDate) : '')
const dateRangeEnd = computed(() => timeRange.value ? formatDateFull(timeRange.value.maxDate) : '')
const isSingleDay = computed(() => timeRange.value?.spanMs === 0)
</script>

<template>
  <div class="stage-nav">
    <div class="stage-list">
      <button
        v-for="stage in stages"
        :key="stage.code"
        class="stage-item"
        :class="{
          'stage-item--active': activeStage === stage.code,
        }"
        @click="emit('update:activeStage', stage.code)"
      >
        <!-- Row: number + label -->
        <div class="stage-row">
          <span class="stage-number" :class="'stage-number--' + stageStatusClass(stage.code)">
            {{ stageNumber(stage.code) }}
          </span>
          <span class="stage-label">{{ stage.label }}</span>
        </div>

        <!-- Graphical timeline bar -->
        <div v-if="timeRange" class="stage-timeline">
          <!-- Grey track (full range) -->
          <div class="tl-track"></div>
          <!-- Green/yellow marker at date position -->
          <div
            v-if="barPosition(stage.code) !== null"
            class="tl-marker"
            :class="'tl-marker--' + stageStatusClass(stage.code)"
            :style="{ left: barPosition(stage.code) + '%' }"
          >
            <span class="tl-date">{{ formatDateShort(getStageDate(stage.code)) }}</span>
          </div>
        </div>
      </button>
    </div>

    <!-- Date range footer -->
    <div v-if="timeRange" class="timeline-range">
      <span>{{ dateRangeStart }}</span>
      <span v-if="!isSingleDay">{{ dateRangeEnd }}</span>
    </div>
  </div>
</template>

<style scoped>
.stage-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 200px;
  max-width: 240px;
  flex-shrink: 0;
}

.stage-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.stage-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px 10px 4px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: all 0.15s;
}

.stage-item:hover {
  background: rgba(0, 50, 116, 0.05);
}

.stage-item--active {
  background: rgba(0, 50, 116, 0.10);
}

.stage-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stage-label {
  font-size: 13px;
  color: rgba(0, 50, 116, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stage-item--active .stage-label {
  color: #003274;
  font-weight: 600;
}

/* ── Stage numbers ── */
.stage-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  border: 1.5px solid rgba(0, 50, 116, 0.2);
  color: rgba(0, 50, 116, 0.4);
  background: transparent;
  transition: all 0.2s;
}

.stage-number--done {
  background: #2ECC94;
  border-color: #2ECC94;
  color: white;
}

.stage-number--active {
  background: #F39C12;
  border-color: #F39C12;
  color: white;
}

.stage-number--warning {
  background: #F1C40F;
  border-color: #F1C40F;
  color: white;
}

.stage-item--active .stage-number {
  border-color: #003274;
  color: white;
  background: #003274;
}

/* ── Graphical timeline ── */
.stage-timeline {
  position: relative;
  height: 16px;
  margin-left: 30px; /* align with label */
  margin-right: 4px;
}

.tl-track {
  position: absolute;
  top: 7px;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(0, 50, 116, 0.08);
  border-radius: 1px;
}

.tl-marker {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  padding: 0 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.tl-marker--done {
  background: rgba(82, 201, 166, 0.12);
}

.tl-marker--warning {
  background: rgba(211, 167, 84, 0.12);
}

.tl-marker--pending {
  background: transparent;
}

.tl-date {
  font-size: 9px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.tl-marker--done .tl-date {
  color: #2a9d78;
}

.tl-marker--warning .tl-date {
  color: #D3A754;
}

/* ── Date range footer ── */
.timeline-range {
  display: flex;
  justify-content: space-between;
  padding: 2px 10px 0 40px;
  font-size: 9px;
  color: rgba(0, 50, 116, 0.3);
  font-variant-numeric: tabular-nums;
}
</style>
