<script setup>
/**
 * GanttChart — full Gantt chart inside the Tape Constructor.
 *
 * Layout:
 *  - Y axis: 8 stages (rows)
 *  - X axis: time (dates from step data)
 *  - Each tape = colored horizontal bar per stage
 *  - Bars show: operator name, date
 *  - Click on bar → emits stage navigation event
 *
 * Props:
 *  - stages: TAPE_STAGES config array
 *  - tapeStates: Map<tapeId, useTapeState()> — all loaded tapes
 *  - tapeNames: Map<tapeId, string>
 *  - targetTapeId: ID of target tape (highlighted)
 *
 * Emits:
 *  - navigate(stageCode) — click on a bar navigates to that stage
 */
import { computed } from 'vue'

const props = defineProps({
  stages:       { type: Array, required: true },
  tapeStates:   { type: Object, default: () => ({}) },
  tapeNames:    { type: Object, default: () => ({}) },
  targetTapeId: { type: [Number, String], default: null },
  refs:         { type: Object, default: () => ({}) },
})

const emit = defineEmits(['navigate'])

const TAPE_COLORS = ['#003274', '#2ECC94', '#E67E22', '#9B59B6', '#E74C3C', '#1ABC9C', '#F39C12', '#3498DB']

const tapeIds = computed(() => Object.keys(props.tapeStates))

// Build Gantt data: for each tape × stage, extract date, operator, status
function getStepInfo(tapeId, stageCode) {
  const ts = props.tapeStates[tapeId]
  if (!ts) return { status: 'pending', date: null, operator: '', time: '' }

  const status = ts.stageStatus(stageCode)

  if (stageCode === 'general_info') {
    return {
      status: ts.general?.createdAt ? 'done' : 'pending',
      date: ts.general?.createdAt ? ts.general.createdAt.split('T')[0] : null,
      operator: resolveUser(ts, ts.general?.createdBy),
      time: ts.general?.createdAt ? formatTime(ts.general.createdAt) : '',
    }
  }

  const step = ts.steps?.[stageCode]
  if (!step) return { status, date: null, operator: '', time: '' }

  return {
    status,
    date: step.date || null,
    operator: resolveUser(ts, step.operator),
    time: step.time || '',
  }
}

function resolveUser(ts, userId) {
  if (!userId) return ''
  const users = props.refs?.users || []
  const u = users.find(x => String(x.user_id) === String(userId))
  return u ? shortName(u.name) : ''
}

function shortName(fullName) {
  if (!fullName) return ''
  const parts = fullName.trim().split(/\s+/)
  if (parts.length <= 1) return fullName
  // "Иванов Иван Иванович" → "Иванов И.И."
  return parts[0] + ' ' + parts.slice(1).map(p => p[0] + '.').join('')
}

function formatTime(isoOrTime) {
  if (!isoOrTime) return ''
  if (isoOrTime.includes('T')) {
    const d = new Date(isoOrTime)
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return isoOrTime.slice(0, 5) // "HH:mm"
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

// Status → color for bar
function barColor(tapeIdx, status) {
  if (status === 'done') return TAPE_COLORS[tapeIdx % TAPE_COLORS.length]
  if (status === 'active') return '#F39C12'
  if (status === 'warning') return '#F1C40F'
  return 'transparent'
}

function barTextColor(status) {
  if (status === 'done' || status === 'active') return 'white'
  if (status === 'warning') return '#333'
  return 'transparent'
}

// Enhanced status with warning detection (same logic as StageNavigator)
function enhancedStatus(tapeId, stageCode) {
  const ts = props.tapeStates[tapeId]
  if (!ts) return 'pending'
  const base = ts.stageStatus(stageCode)
  if (base !== 'pending') return base

  const myIdx = props.stages.findIndex(s => s.code === stageCode)
  for (let i = myIdx + 1; i < props.stages.length; i++) {
    if (ts.stageStatus(props.stages[i].code) === 'done') return 'warning'
  }
  return 'pending'
}

function isTarget(tapeId) {
  return String(tapeId) === String(props.targetTapeId)
}
</script>

<template>
  <div class="gantt">
    <!-- Legend -->
    <div class="gantt-legend">
      <span
        v-for="(tid, idx) in tapeIds"
        :key="tid"
        class="gantt-legend-item"
        :class="{ 'gantt-legend-item--target': isTarget(tid) }"
      >
        <span class="gantt-legend-dot" :style="{ background: TAPE_COLORS[idx % TAPE_COLORS.length] }"></span>
        <span class="gantt-legend-name">{{ tapeNames[tid] || `#${tid}` }}</span>
        <i v-if="isTarget(tid)" class="pi pi-star-fill gantt-legend-star"></i>
      </span>
    </div>

    <!-- Chart grid -->
    <div class="gantt-grid">
      <!-- Row per stage -->
      <div
        v-for="(stage, sIdx) in stages"
        :key="stage.code"
        class="gantt-row"
      >
        <div class="gantt-row-label" @click="emit('navigate', stage.code)">
          <span class="gantt-row-num">{{ sIdx + 1 }}</span>
          <span class="gantt-row-name">{{ stage.label }}</span>
        </div>
        <div class="gantt-row-bars">
          <div
            v-for="(tid, tIdx) in tapeIds"
            :key="tid"
            class="gantt-bar-wrap"
          >
            <button
              class="gantt-bar"
              :class="{
                'gantt-bar--empty': enhancedStatus(tid, stage.code) === 'pending',
                'gantt-bar--target': isTarget(tid),
              }"
              :style="{
                background: barColor(tIdx, enhancedStatus(tid, stage.code)),
                color: barTextColor(enhancedStatus(tid, stage.code)),
              }"
              :title="`${tapeNames[tid]} — ${stage.label}`"
              @click="emit('navigate', stage.code)"
            >
              <template v-if="enhancedStatus(tid, stage.code) !== 'pending'">
                <span class="gantt-bar-date">{{ formatDate(getStepInfo(tid, stage.code).date) }}</span>
                <span class="gantt-bar-op">{{ getStepInfo(tid, stage.code).operator }}</span>
              </template>
              <template v-else>
                <span class="gantt-bar-placeholder">—</span>
              </template>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gantt {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
}

/* Legend */
.gantt-legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 4px 0;
  border-bottom: 1px solid rgba(0, 50, 116, 0.08);
  margin-bottom: 4px;
}

.gantt-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: rgba(0, 50, 116, 0.7);
}

.gantt-legend-item--target {
  font-weight: 600;
  color: #003274;
}

.gantt-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.gantt-legend-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gantt-legend-star {
  font-size: 8px;
  color: #2ECC94;
}

/* Grid */
.gantt-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gantt-row {
  display: flex;
  align-items: stretch;
  min-height: 32px;
}

.gantt-row-label {
  width: 130px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}

.gantt-row-label:hover {
  background: rgba(0, 50, 116, 0.05);
}

.gantt-row-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  background: rgba(0, 50, 116, 0.08);
  color: rgba(0, 50, 116, 0.5);
  flex-shrink: 0;
}

.gantt-row-name {
  font-size: 11px;
  color: rgba(0, 50, 116, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Bars area */
.gantt-row-bars {
  flex: 1;
  display: flex;
  gap: 3px;
  align-items: center;
  padding: 2px 0;
}

.gantt-bar-wrap {
  flex: 1;
  min-width: 0;
}

.gantt-bar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 3px 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 10px;
  font-weight: 500;
  min-height: 26px;
  transition: all 0.15s;
  box-sizing: border-box;
}

.gantt-bar:hover:not(.gantt-bar--empty) {
  filter: brightness(1.1);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.gantt-bar--empty {
  background: rgba(0, 50, 116, 0.04) !important;
  cursor: pointer;
  border: 1px dashed rgba(0, 50, 116, 0.1);
}

.gantt-bar--target {
  box-shadow: 0 0 0 1.5px rgba(46, 204, 148, 0.5);
}

.gantt-bar-date {
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.gantt-bar-op {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}

.gantt-bar-placeholder {
  width: 100%;
  text-align: center;
  color: rgba(0, 50, 116, 0.15);
  font-size: 11px;
}
</style>
