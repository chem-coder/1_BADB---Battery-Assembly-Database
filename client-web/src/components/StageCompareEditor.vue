<script setup>
/**
 * StageCompareEditor — table-based layout for the Tape Constructor.
 *
 * Proper HTML table: field labels as row headers, tape columns with inputs.
 * Column headers show tape names (first = target).
 * Draggable column headers for reordering tapes with smooth animation.
 * Per-field green/grey left border on cells.
 * Copy arrows on source columns — copies current stage only.
 */
import { ref, reactive, computed, watch, nextTick } from 'vue'
import AutoComplete from 'primevue/autocomplete'

const props = defineProps({
  stageCode: { type: String, required: true },
  stageConfig: { type: Object, required: true },
  tapeStates: { type: Object, default: () => ({}) },
  targetTapeId: { type: [Number, String], default: null },
  activeTapeId: { type: [Number, String], default: null },
  tabOrder: { type: Array, default: () => [] },
  tapeNames: { type: Object, default: () => ({}) },
  refs: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['reorder', 'select-tape'])

const fields = computed(() => props.stageConfig?.fields || [])

const sourceTapeIds = computed(() => props.tabOrder.filter(tid => String(tid) !== String(props.targetTapeId)))

function isActiveTape(tid) {
  return String(tid) === String(props.activeTapeId)
}

function onTapeHeaderClick(tid) {
  emit('select-tape', Number(tid))
}

function getRefOptions(field) {
  if (field.options) return field.options.map(o => ({ value: o.value, label: o.label }))
  if (field.ref && props.refs[field.ref]?.length) {
    const items = props.refs[field.ref]
    const idFields = {
      users: 'user_id', projects: 'project_id', recipes: 'tape_recipe_id',
      atmospheres: 'code', dryMixingMethods: 'dry_mixing_id',
      wetMixingMethods: 'wet_mixing_id', foils: 'foil_id', coatingMethods: 'coating_id',
    }
    const nameFields = {
      users: 'name', projects: 'name', recipes: 'name',
      atmospheres: 'display', dryMixingMethods: 'description',
      wetMixingMethods: 'description', foils: 'type', coatingMethods: 'comments',
    }
    const idKey = idFields[field.ref] || 'id'
    const nameKey = nameFields[field.ref] || 'name'
    return items.map(i => ({ value: i[idKey], label: i[nameKey] || `#${i[idKey]}` }))
  }
  return []
}

function getValue(tapeId, fieldKey) {
  const ts = props.tapeStates[String(tapeId)]
  return ts ? ts.getFieldValue(props.stageCode, fieldKey) : ''
}

function setValue(tapeId, fieldKey, value) {
  const ts = props.tapeStates[String(tapeId)]
  if (ts) ts.setFieldValue(props.stageCode, fieldKey, value)
}

// Get the tape ID immediately to the left of the given tape in tabOrder
function leftNeighbor(tid) {
  const idx = props.tabOrder.indexOf(String(tid))
  return idx > 0 ? props.tabOrder[idx - 1] : null
}

function copyField(sourceTapeId, fieldKey, destTapeId) {
  const dest = destTapeId || leftNeighbor(sourceTapeId)
  if (!dest) return
  const val = getValue(sourceTapeId, fieldKey)
  setValue(dest, fieldKey, val)
  // Sync local AC model for destination tape
  const f = fields.value.find(ff => ff.key === fieldKey)
  if (f?.type === 'select') {
    acModels[acKey(String(dest), fieldKey)] = resolveAcOption(dest, f)
  }
}

// Copy all fields of the CURRENT stage only (not all stages)
function copyAllCurrentStage(sourceTapeId) {
  for (const f of fields.value) {
    copyField(sourceTapeId, f.key)
  }
}

function onSetNow(tapeId) {
  const ts = props.tapeStates[String(tapeId)]
  if (ts) ts.setNow(props.stageCode)
}

function fieldHasData(tapeId, fieldKey) {
  const v = getValue(tapeId, fieldKey)
  return v !== '' && v !== null && v !== undefined
}

// ── AutoComplete adapter for select fields (DS pattern) ──
// Local models allow free typing without revert (v-model two-way binding)
const acModels = reactive({})
const acSuggestions = ref({})

function acKey(tid, fieldKey) {
  return `${tid}__${fieldKey}`
}

// Resolve stored value → option object {value, label}
function resolveAcOption(tapeId, field) {
  const val = getValue(tapeId, field.key)
  if (!val && val !== 0) return null
  const opts = getRefOptions(field)
  return opts.find(o => String(o.value) === String(val)) || null
}

// Sync local models from tape state (on stage/tab navigation)
function syncAcModels() {
  for (const tid of props.tabOrder) {
    for (const f of fields.value) {
      if (f.type === 'select') {
        acModels[acKey(tid, f.key)] = resolveAcOption(tid, f)
      }
    }
  }
}

watch([() => props.stageCode, () => props.tabOrder], syncAcModels, { immediate: true, deep: true })

function searchAc(field, event) {
  const query = (event.query || '').toLowerCase()
  const opts = getRefOptions(field)
  acSuggestions.value[field.key] = opts.filter(o => o.label.toLowerCase().includes(query))
}

function onAcItemSelect(tapeId, field, e) {
  // Commit selected option to tape state
  if (e.value && typeof e.value === 'object') {
    setValue(tapeId, field.key, e.value.value)
  }
  // Blur input after selection (DS pattern — use component ref, not event target)
  setTimeout(() => {
    const comp = acRefs[acKey(tapeId, field.key)]
    comp?.$el?.querySelector('input')?.blur()
  }, 50)
}

function clearAcValue(tapeId, field) {
  setValue(tapeId, field.key, '')
  acModels[acKey(tapeId, field.key)] = null
}

// ── Template refs for AutoComplete instances ──
const acRefs = {}
function setAcRef(tid, fieldKey, el) {
  const key = acKey(tid, fieldKey)
  if (el) acRefs[key] = el; else delete acRefs[key]
}

// PrimeVue hardcodes hide() when query becomes empty (line 459-461 in AutoComplete.vue).
// @clear fires right after — re-show dropdown with all options.
function onAcClear(tid, field) {
  acSuggestions.value[field.key] = getRefOptions(field)
  nextTick(() => {
    const comp = acRefs[acKey(tid, field.key)]
    if (comp?.show) comp.show()
  })
}

// ── Drag-and-drop column headers with visual feedback ──
const dragColIdx = ref(null)
const dropTargetColIdx = ref(null)

function onColDragStart(idx, e) {
  dragColIdx.value = idx
  e.dataTransfer.effectAllowed = 'move'
  // Set drag image with slight transparency
  if (e.target) {
    e.target.style.opacity = '0.4'
  }
}

function onColDragOver(idx, e) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  if (dragColIdx.value !== null && dragColIdx.value !== idx) {
    dropTargetColIdx.value = idx
  }
}

function onColDragLeave(e) {
  // Only clear if we actually left the element (not entering a child)
  const related = e.relatedTarget
  if (!e.currentTarget.contains(related)) {
    dropTargetColIdx.value = null
  }
}

function onColDrop(idx, e) {
  e.preventDefault()
  dropTargetColIdx.value = null
  if (dragColIdx.value === null || dragColIdx.value === idx) return
  const arr = [...props.tabOrder]
  const [moved] = arr.splice(dragColIdx.value, 1)
  arr.splice(idx, 0, moved)
  emit('reorder', arr)
  dragColIdx.value = null
}

function onColDragEnd(e) {
  if (e.target) e.target.style.opacity = ''
  dragColIdx.value = null
  dropTargetColIdx.value = null
}
</script>

<template>
  <div class="compare-editor">
    <table class="ce-table">
      <thead>
        <tr>
          <th class="ce-th-label">{{ stageConfig.label }}</th>
          <!-- All tape column headers from tabOrder -->
          <th
            v-for="(tid, i) in tabOrder"
            :key="tid"
            class="ce-th-tape"
            :class="{
              'ce-th-tape--active': isActiveTape(tid),
              'ce-th-tape--drop': dropTargetColIdx === i && dragColIdx !== null && dragColIdx !== i,
              'ce-th-tape--dragging': dragColIdx === i,
            }"
            draggable="true"
            @click="onTapeHeaderClick(tid)"
            @dragstart="onColDragStart(i, $event)"
            @dragover="onColDragOver(i, $event)"
            @dragleave="onColDragLeave"
            @drop="onColDrop(i, $event)"
            @dragend="onColDragEnd"
          >
            <span class="th-tape-name">{{ tapeNames[tid] || `#${tid}` }}</span>
            <button
              v-if="tabOrder.indexOf(String(tid)) > 0"
              class="copy-all-btn"
              @click.stop="copyAllCurrentStage(tid)"
              title="Копировать все поля этапа"
            ><i class="pi pi-angle-double-left" style="font-size:10px"></i> всё</button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="field in fields" :key="field.key" class="ce-row">
          <!-- Row label -->
          <td class="ce-td-label">{{ field.label }}</td>

          <!-- Tape cells — unified loop -->
          <td
            v-for="tid in tabOrder"
            :key="tid"
            class="ce-td"
            :class="{
              'ce-td--filled': fieldHasData(tid, field.key),
              'ce-td--active': isActiveTape(tid),
              'ce-td--dimmed': activeTapeId && !isActiveTape(tid),
            }"
          >
            <div class="cell-wrap" :class="{ 'cell-wrap--source': String(tid) !== String(targetTapeId) && tabOrder.length > 1 }">
              <button
                v-if="tabOrder.indexOf(String(tid)) > 0"
                class="copy-btn"
                @click="copyField(tid, field.key)"
                title="Копировать в целевую ленту"
              ><i class="pi pi-angle-left"></i></button>
            <textarea
              v-if="field.type === 'textarea'"
              :value="getValue(tid, field.key)"
              @input="setValue(tid, field.key, $event.target.value)"
              class="ce-input ce-textarea"
              rows="2"
            />
            <div v-else-if="field.type === 'select'" class="ce-select-wrap">
              <AutoComplete
                :ref="(el) => setAcRef(tid, field.key, el)"
                v-model="acModels[tid + '__' + field.key]"
                :suggestions="acSuggestions[field.key] || []"
                @complete="searchAc(field, $event)"
                @item-select="onAcItemSelect(tid, field, $event)"
                @clear="onAcClear(tid, field)"
                optionLabel="label"
                dropdown
                completeOnFocus
                :scrollHeight="'200px'"
                placeholder=""
              />
              <button
                v-if="getValue(tid, field.key)"
                class="ce-select-clear"
                @click.stop="clearAcValue(tid, field)"
                title="Очистить"
              ><i class="pi pi-times"></i></button>
            </div>
            <div v-else-if="field.type === 'time'" class="time-cell">
              <input type="time" :value="getValue(tid, field.key)" @input="setValue(tid, field.key, $event.target.value)" class="ce-input ce-input--time" />
              <button class="now-btn" @click="onSetNow(tid)" title="Сейчас"><i class="pi pi-clock"></i></button>
            </div>
            <input
              v-else
              :type="field.type === 'date' ? 'date' : field.type"
              :value="getValue(tid, field.key)"
              @input="setValue(tid, field.key, $event.target.value)"
              class="ce-input"
              :step="field.type === 'number' ? '0.0001' : undefined"
            />
            </div><!-- /cell-wrap -->
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.compare-editor {
  flex: 1;
  min-width: 0;
  overflow: auto;
}

/* ══ Table ══ */
.ce-table {
  width: auto;
  border-collapse: collapse;
  table-layout: fixed;
}

/* ── Header ── */
.ce-table thead {
  position: sticky;
  top: 0;
  z-index: 2;
}

.ce-th-label {
  width: 140px;
  padding: 8px 10px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 50, 116, 0.50);
  background: rgba(0, 50, 116, 0.03);
  border-bottom: 1.5px solid rgba(0, 50, 116, 0.10);
  border-right: 1px solid rgba(0, 50, 116, 0.06);
}

.ce-th-tape {
  padding: 7px 10px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: rgba(0, 50, 116, 0.65);
  background: rgba(0, 50, 116, 0.03);
  border-bottom: 1.5px solid rgba(0, 50, 116, 0.10);
  border-right: 1px solid rgba(0, 50, 116, 0.06);
  cursor: grab;
  user-select: none;
  white-space: nowrap;
  width: 190px;
  min-width: 140px;
  transition: background 0.2s, box-shadow 0.2s;
  position: relative;
}
.ce-th-tape:active { cursor: grabbing; }
.ce-th-tape:last-child { border-right: none; }

/* Active tape header */
.ce-th-tape--active {
  background: rgba(0, 50, 116, 0.08) !important;
  color: #003274;
}

/* Drag states */
.ce-th-tape--dragging {
  opacity: 0.4;
}

.ce-th-tape--drop {
  background: rgba(82, 201, 166, 0.12) !important;
  box-shadow: inset 0 -2.5px 0 0 #2a9d78;
}
.ce-th-tape--drop::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 4px;
  bottom: 4px;
  width: 2.5px;
  background: #2a9d78;
  border-radius: 1px;
}

.th-tape-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
  vertical-align: middle;
}

/* ── Copy All button in header ── */
.copy-all-btn {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  margin-left: 6px;
  padding: 1px 6px 1px 3px;
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 4px;
  background: transparent;
  font-size: 9px;
  font-weight: 500;
  font-family: inherit;
  color: rgba(0, 50, 116, 0.50);
  cursor: pointer;
  transition: all 0.2s;
  vertical-align: middle;
  border-color: rgba(0, 50, 116, 0.18);
}
.copy-all-btn:hover {
  background: rgba(82, 201, 166, 0.12);
  border-color: rgba(82, 201, 166, 0.45);
  color: #2a9d78;
}

/* ── Body rows ── */
.ce-row:hover .ce-td-label,
.ce-row:hover .ce-td {
  background: rgba(82, 201, 166, 0.03);
}

.ce-td-label {
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 500;
  color: rgba(0, 50, 116, 0.55);
  border-bottom: 1px solid rgba(0, 50, 116, 0.05);
  border-right: 1px solid rgba(0, 50, 116, 0.06);
  background: white;
  vertical-align: middle;
}

.ce-td {
  padding: 4px 8px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.05);
  border-right: 1px solid rgba(0, 50, 116, 0.06);
  background: white;
  vertical-align: middle;
  transition: border-left-color 0.2s;
  border-left: 2.5px solid rgba(0, 50, 116, 0.06);
}
.ce-td:last-child { border-right: none; }

/* Per-field fill indicator */
.ce-td--filled {
  border-left-color: #2a9d78;
}

/* Active tape column — subtle highlight */
.ce-td--active {
  background: rgba(0, 50, 116, 0.025);
}

/* Dimmed (non-active) columns when there IS an active selection */
.ce-td--dimmed {
  opacity: 0.55;
}
.ce-td--dimmed:hover {
  opacity: 0.85;
}

/* ── Source cell: copy button + input ── */
.source-cell {
  display: flex;
  align-items: flex-start;
  gap: 3px;
}
.source-input-wrap {
  flex: 1;
  min-width: 0;
}

.copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  color: rgba(0, 50, 116, 0.35);
  flex-shrink: 0;
  margin-top: 4px;
  transition: all 0.2s;
  font-size: 9px;
}
.copy-btn:hover {
  background: rgba(82, 201, 166, 0.15);
  color: #2a9d78;
}

/* ── Inputs (Design System style) ── */
.ce-input,
.ce-textarea {
  width: 100%;
  height: 32px;
  padding: 4px 8px;
  border: 1.5px solid rgba(0, 50, 116, 0.12);
  border-radius: 6px;
  font-size: 12.5px;
  font-family: inherit;
  background: white;
  color: #1a2a3a;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  box-sizing: border-box;
}

.ce-input::placeholder {
  color: rgba(0, 50, 116, 0.3);
}

.ce-input:hover:not(:focus),
.ce-textarea:hover:not(:focus) {
  border-color: rgba(82, 201, 166, 0.5);
  box-shadow: 0 2px 6px rgba(82, 201, 166, 0.15);
}

.ce-input:focus,
.ce-textarea:focus {
  border-color: #2a9d78;
  outline: none;
  box-shadow: 0 0 0 2.5px rgba(42, 157, 120, 0.12);
}

.ce-textarea {
  resize: vertical;
  height: auto;
  min-height: 48px;
}

.time-cell {
  display: flex;
  gap: 3px;
  align-items: center;
}
.ce-input--time {
  flex: 1;
}
.now-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
  color: rgba(0, 50, 116, 0.30);
  flex-shrink: 0;
  transition: all 0.2s;
  font-size: 11px;
}
.now-btn:hover {
  background: rgba(82, 201, 166, 0.10);
  color: #2a9d78;
}

/* ── Cell wrap (copy button + input for source columns) ── */
.cell-wrap {
  display: flex;
  align-items: center;
  gap: 0;
  width: 100%;
}
.cell-wrap--source {
  gap: 3px;
}
.cell-wrap > .ce-input,
.cell-wrap > .ce-textarea,
.cell-wrap > .ce-select-wrap,
.cell-wrap > .time-cell {
  flex: 1;
  min-width: 0;
}

/* ── Select wrapper (DS select-ac-wrap pattern) ── */
/* NO custom :deep() overrides — global.css handles all PrimeVue styling */
.ce-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
}
.ce-select-wrap :deep(.p-autocomplete) {
  width: 100%;
}
.ce-select-wrap :deep(.p-autocomplete-input) {
  height: 32px !important;
  min-height: 32px !important;
  padding: 4px 32px 4px 8px !important;
  font-size: 12.5px !important;
}
.ce-select-wrap :deep(.p-autocomplete-dropdown) {
  width: 26px !important;
  padding: 0 !important;
}
/* Clear button — compact, positioned before dropdown arrow */
.ce-select-clear {
  position: absolute;
  right: 30px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: #b0b5be;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
  transition: color 0.15s, background 0.15s;
  z-index: 2;
}
.ce-select-clear :deep(.pi) {
  font-size: 10px !important;
}
.ce-select-clear:hover {
  color: #666;
  background: rgba(0, 0, 0, 0.06);
}
</style>
