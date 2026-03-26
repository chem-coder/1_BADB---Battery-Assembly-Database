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
import { ref, computed } from 'vue'

const props = defineProps({
  stageCode: { type: String, required: true },
  stageConfig: { type: Object, required: true },
  tapeStates: { type: Object, default: () => ({}) },
  targetTapeId: { type: [Number, String], default: null },
  tabOrder: { type: Array, default: () => [] },
  tapeNames: { type: Object, default: () => ({}) },
  refs: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['reorder'])

const fields = computed(() => props.stageConfig?.fields || [])

const sourceTapeIds = computed(() => props.tabOrder.filter(tid => String(tid) !== String(props.targetTapeId)))

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

function copyField(sourceTapeId, fieldKey) {
  const val = getValue(sourceTapeId, fieldKey)
  setValue(props.targetTapeId, fieldKey, val)
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
          <!-- Target tape column header (no star, no green underline) -->
          <th
            v-if="targetTapeId"
            class="ce-th-tape"
            :class="{
              'ce-th-tape--drop': dropTargetColIdx === 0 && dragColIdx !== null && dragColIdx !== 0,
              'ce-th-tape--dragging': dragColIdx === 0,
            }"
            draggable="true"
            @dragstart="onColDragStart(0, $event)"
            @dragover="onColDragOver(0, $event)"
            @dragleave="onColDragLeave"
            @drop="onColDrop(0, $event)"
            @dragend="onColDragEnd"
          >
            <span class="th-tape-name">{{ tapeNames[targetTapeId] || `#${targetTapeId}` }}</span>
          </th>
          <!-- Source tape column headers -->
          <th
            v-for="(tid, i) in sourceTapeIds"
            :key="tid"
            class="ce-th-tape"
            :class="{
              'ce-th-tape--drop': dropTargetColIdx === (i + 1) && dragColIdx !== null && dragColIdx !== (i + 1),
              'ce-th-tape--dragging': dragColIdx === (i + 1),
            }"
            draggable="true"
            @dragstart="onColDragStart(i + 1, $event)"
            @dragover="onColDragOver(i + 1, $event)"
            @dragleave="onColDragLeave"
            @drop="onColDrop(i + 1, $event)"
            @dragend="onColDragEnd"
          >
            <span class="th-tape-name">{{ tapeNames[tid] || `#${tid}` }}</span>
            <button
              class="copy-all-btn"
              @click.stop="copyAllCurrentStage(tid)"
              :title="`Копировать все поля этапа «${stageConfig.label}» в первую ленту`"
            >
              <i class="pi pi-chevron-left" style="font-size:8px"></i>
              <i class="pi pi-chevron-left" style="font-size:8px;margin-left:-4px"></i>
              Всё
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="field in fields" :key="field.key" class="ce-row">
          <!-- Row label -->
          <td class="ce-td-label">{{ field.label }}</td>

          <!-- Target tape cell -->
          <td
            v-if="targetTapeId"
            class="ce-td"
            :class="{ 'ce-td--filled': fieldHasData(targetTapeId, field.key) }"
          >
            <textarea
              v-if="field.type === 'textarea'"
              :value="getValue(targetTapeId, field.key)"
              @input="setValue(targetTapeId, field.key, $event.target.value)"
              class="ce-input ce-textarea"
              rows="2"
            />
            <select
              v-else-if="field.type === 'select'"
              :value="getValue(targetTapeId, field.key)"
              @change="setValue(targetTapeId, field.key, $event.target.value)"
              class="ce-input ce-select"
            >
              <option value="">—</option>
              <option v-for="opt in getRefOptions(field)" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <div v-else-if="field.type === 'time'" class="time-cell">
              <input type="time" :value="getValue(targetTapeId, field.key)" @input="setValue(targetTapeId, field.key, $event.target.value)" class="ce-input ce-input--time" />
              <button class="now-btn" @click="onSetNow(targetTapeId)" title="Сейчас"><i class="pi pi-clock"></i></button>
            </div>
            <input
              v-else
              :type="field.type === 'date' ? 'date' : field.type"
              :value="getValue(targetTapeId, field.key)"
              @input="setValue(targetTapeId, field.key, $event.target.value)"
              class="ce-input"
              :step="field.type === 'number' ? '0.0001' : undefined"
            />
          </td>

          <!-- Source tape cells -->
          <td
            v-for="tid in sourceTapeIds"
            :key="tid"
            class="ce-td"
            :class="{ 'ce-td--filled': fieldHasData(tid, field.key) }"
          >
            <div class="source-cell">
              <button class="copy-btn" @click="copyField(tid, field.key)" :title="`Копировать в первую ленту`">
                <i class="pi pi-chevron-left"></i>
              </button>
              <div class="source-input-wrap">
                <textarea
                  v-if="field.type === 'textarea'"
                  :value="getValue(tid, field.key)"
                  @input="setValue(tid, field.key, $event.target.value)"
                  class="ce-input ce-textarea"
                  rows="2"
                />
                <select
                  v-else-if="field.type === 'select'"
                  :value="getValue(tid, field.key)"
                  @change="setValue(tid, field.key, $event.target.value)"
                  class="ce-input ce-select"
                >
                  <option value="">—</option>
                  <option v-for="opt in getRefOptions(field)" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
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
              </div>
            </div>
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
  width: 100%;
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
  min-width: 160px;
  transition: background 0.2s, box-shadow 0.2s;
  position: relative;
}
.ce-th-tape:active { cursor: grabbing; }
.ce-th-tape:last-child { border-right: none; }

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
  color: rgba(0, 50, 116, 0.35);
  cursor: pointer;
  transition: all 0.2s;
  vertical-align: middle;
}
.copy-all-btn:hover {
  background: rgba(82, 201, 166, 0.10);
  border-color: rgba(82, 201, 166, 0.35);
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
  color: rgba(0, 50, 116, 0.15);
  flex-shrink: 0;
  margin-top: 4px;
  transition: all 0.2s;
  font-size: 9px;
}
.copy-btn:hover {
  background: rgba(82, 201, 166, 0.15);
  color: #2a9d78;
}

/* ── Inputs ── */
.ce-input,
.ce-select,
.ce-textarea {
  width: 100%;
  padding: 4px 7px;
  border: 1px solid rgba(0, 50, 116, 0.10);
  border-radius: 5px;
  font-size: 12px;
  font-family: inherit;
  background: white;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}

.ce-input:hover:not(:focus),
.ce-select:hover:not(:focus),
.ce-textarea:hover:not(:focus) {
  border-color: rgba(82, 201, 166, 0.45);
  box-shadow: 2px 3px 8px rgba(82, 201, 166, 0.18);
}

.ce-input:focus,
.ce-select:focus,
.ce-textarea:focus {
  border-color: #003366;
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 51, 102, 0.12);
}

.ce-textarea {
  resize: vertical;
  min-height: 30px;
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
</style>
