<script setup>
/**
 * ElectrodesPage — "Электроды"
 * Cascade filters (Role → Project → Tape) + CrudTable of cut batches + inline Constructor.
 * Follows TapesPage pattern: CrudTable + TapeConstructor (parametrized for electrodes).
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import PageHeader from '@/components/PageHeader.vue'
import SaveIndicator from '@/components/SaveIndicator.vue'
import CrudTable from '@/components/CrudTable.vue'
import TapeConstructor from '@/components/TapeConstructor.vue'
import Checkbox from 'primevue/checkbox'
import { ELECTRODE_STAGES } from '@/config/electrodeStages'
import { useElectrodeState } from '@/composables/useElectrodeState'

const router = useRouter()
const toast = useToast()
const crudTable = ref(null)

const roleRu = { cathode: 'Катод', anode: 'Анод' }

// ── Reference data ──
const tapes = ref([])
const projects = ref([])

// ── Selection (cascade filters) ──
const selectedRole = ref('')
const selectedProjectId = ref('')
const selectedTapeId = ref('')

// ── Cut batches ──
const cutBatches = ref([])
const loading = ref(false)

// ── Columns ──
const columns = [
  { field: '_constructor', header: '🔧', minWidth: '45px', width: '45px', sortable: false, filterable: false },
  { field: 'cut_batch_id', header: '№ партии', minWidth: '70px', width: '90px' },
  { field: 'created_at', header: 'Дата', minWidth: '90px', width: '120px' },
  { field: 'shape_display', header: 'Форма', minWidth: '80px', width: '130px' },
  { field: 'electrode_count', header: 'Электродов', minWidth: '80px', width: '100px' },
  { field: 'status_display', header: 'Статус', minWidth: '80px', width: '100px' },
]

// ── Computed ──
const filteredTapes = computed(() => {
  return tapes.value.filter(t =>
    (!selectedRole.value || t.role === selectedRole.value) &&
    (!selectedProjectId.value || String(t.project_id) === String(selectedProjectId.value))
  )
})

const cathodeTapes = computed(() => filteredTapes.value.filter(t => t.role === 'cathode'))
const anodeTapes = computed(() => filteredTapes.value.filter(t => t.role === 'anode'))

// Enrich cutBatches for CrudTable
const tableData = computed(() =>
  cutBatches.value.map(b => ({
    ...b,
    shape_display: b.shape === 'circle'
      ? (b.diameter_mm ? `Круг ⌀${b.diameter_mm}` : 'Круг')
      : b.shape === 'rectangle'
        ? (b.length_mm && b.width_mm ? `${b.length_mm}×${b.width_mm}` : 'Прямоуг.')
        : '—',
    status_display: batchStatus(b),
  }))
)

// ── API ──
async function loadTapes() {
  try {
    const { data } = await api.get('/api/tapes/for-electrodes')
    tapes.value = data
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить ленты', life: 3000 })
  }
}

async function loadProjects() {
  try {
    const { data } = await api.get('/api/projects?project_id=0')
    projects.value = data
  } catch {}
}

async function loadCutBatches(tapeId) {
  loading.value = true
  try {
    const { data } = await api.get(`/api/tapes/${tapeId}/electrode-cut-batches`)
    cutBatches.value = data
  } catch {
    cutBatches.value = []
  } finally {
    loading.value = false
  }
}

function onTapeChange() {
  const tape = tapes.value.find(t => String(t.tape_id) === String(selectedTapeId.value))
  if (tape) {
    selectedRole.value = tape.role || selectedRole.value
    selectedProjectId.value = String(tape.project_id) || selectedProjectId.value
  }
  constructorIds.value = []
  if (selectedTapeId.value && selectedProjectId.value) {
    loadCutBatches(Number(selectedTapeId.value))
  } else {
    cutBatches.value = []
  }
}

function onRoleOrProjectChange() {
  selectedTapeId.value = ''
  cutBatches.value = []
  constructorIds.value = []
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('ru-RU')
}

function batchStatus(batch) {
  if (batch.drying_end) return 'готово'
  if (batch.drying_start) return 'сушится'
  return 'в работе'
}

function createBatch() {
  if (!selectedTapeId.value) return
  router.push(`/electrodes/new?tape=${selectedTapeId.value}`)
}

// ── Constructor (same pattern as TapesPage) ──
const constructorIds = ref([])

function toggleConstructor(batchId) {
  const idx = constructorIds.value.indexOf(batchId)
  if (idx >= 0) constructorIds.value.splice(idx, 1)
  else constructorIds.value.push(batchId)
}

function isInConstructor(batchId) {
  return constructorIds.value.includes(batchId)
}

function toggleAllConstructor() {
  if (constructorIds.value.length > 0) {
    constructorIds.value.splice(0)
  } else {
    const visible = crudTable.value?.filteredData || tableData.value
    constructorIds.value = visible.map(b => b.cut_batch_id)
  }
}

// State factory for TapeConstructor
function electrodeStateFactory(id) {
  return useElectrodeState({ batchId: id })
}

// ── Delete flow ──
const pendingDelete = ref([])
const saveState = ref('idle')
let saveTimer = null

function onDelete(items) {
  pendingDelete.value = items
  saveState.value = 'idle'
}

async function confirmSave() {
  try {
    for (const item of pendingDelete.value) {
      await api.delete(`/api/electrodes/electrode-cut-batches/${item.cut_batch_id}`)
    }
    pendingDelete.value = []
    crudTable.value?.clearSelection()
    if (selectedTapeId.value) await loadCutBatches(Number(selectedTapeId.value))
    saveState.value = 'saved'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveState.value = 'idle' }, 2000)
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось удалить', life: 3000 })
  }
}

function discardChanges() {
  pendingDelete.value = []
  crudTable.value?.clearSelection()
  saveState.value = 'idle'
}

onMounted(async () => {
  await Promise.allSettled([loadTapes(), loadProjects()])
})
onUnmounted(() => clearTimeout(saveTimer))
</script>

<template>
  <div class="electrodes-page">
    <PageHeader title="Электроды" icon="pi pi-stop-circle">
      <template #actions>
        <SaveIndicator
          :visible="pendingDelete.length > 0 || saveState === 'saved'"
          :saved="saveState === 'saved'"
          @save="confirmSave"
          @cancel="discardChanges"
        />
      </template>
    </PageHeader>

    <!-- Cascade filters -->
    <div class="filter-bar">
      <div class="filter-group">
        <label>Тип</label>
        <select v-model="selectedRole" @change="onRoleOrProjectChange">
          <option value="">Все</option>
          <option value="cathode">Катоды</option>
          <option value="anode">Аноды</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Проект</label>
        <select v-model="selectedProjectId" @change="onRoleOrProjectChange">
          <option value="">Все</option>
          <option v-for="p in projects" :key="p.project_id" :value="p.project_id">{{ p.name }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Лента</label>
        <select v-model="selectedTapeId" @change="onTapeChange">
          <option value="">— выбрать —</option>
          <optgroup v-if="cathodeTapes.length" label="Катоды">
            <option v-for="t in cathodeTapes" :key="t.tape_id" :value="t.tape_id">
              #{{ t.tape_id }} — {{ t.name }}
            </option>
          </optgroup>
          <optgroup v-if="anodeTapes.length" label="Аноды">
            <option v-for="t in anodeTapes" :key="t.tape_id" :value="t.tape_id">
              #{{ t.tape_id }} — {{ t.name }}
            </option>
          </optgroup>
        </select>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!selectedTapeId" class="empty-hint">
      <i class="pi pi-info-circle"></i> Выберите ленту для просмотра партий электродов
    </div>

    <!-- Batch table -->
    <CrudTable
      v-if="selectedTapeId"
      ref="crudTable"
      :columns="columns"
      :data="tableData"
      :loading="loading"
      id-field="cut_batch_id"
      table-name="Партии нарезки"
      show-add
      row-clickable
      @add="createBatch"
      @delete="onDelete"
      @row-click="(data) => toggleConstructor(data.cut_batch_id)"
      @header-click="(field) => field === '_constructor' && toggleAllConstructor()"
    >
      <template #col-_constructor="{ data }">
        <Checkbox
          :modelValue="isInConstructor(data.cut_batch_id)"
          @update:modelValue="toggleConstructor(data.cut_batch_id)"
          :binary="true"
          v-tooltip.right="'В конструктор'"
        />
      </template>
      <template #col-cut_batch_id="{ data }">
        <span class="batch-id">#{{ data.cut_batch_id }}</span>
      </template>
      <template #col-created_at="{ data }">{{ formatDate(data.created_at) }}</template>
      <template #col-electrode_count="{ data }">{{ Number(data.electrode_count) || 0 }}</template>
      <template #col-status_display="{ data }">
        <span :class="['status-badge', `status-badge--${data.status_display === 'готово' ? 'done' : data.status_display === 'сушится' ? 'drying' : 'work'}`]">
          {{ data.status_display }}
        </span>
      </template>
    </CrudTable>

    <!-- Constructor (same component as TapesPage, parametrized for electrodes) -->
    <TapeConstructor
      v-if="selectedTapeId"
      :selectedTapeIds="constructorIds"
      :tapeList="tableData"
      :stageConfigs="ELECTRODE_STAGES"
      :stateFactory="electrodeStateFactory"
      idField="cut_batch_id"
      title="КОНСТРУКТОР ЭЛЕКТРОДОВ"
      emptyHint="Отметьте партии в таблице для работы в конструкторе"
    />
  </div>
</template>

<style scoped>
.electrodes-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.electrodes-page :deep(.page-header) { margin-bottom: 3px !important; }

/* ── Cascade filter bar ── */
.filter-bar {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: flex-end;
}
.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.filter-group label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
}
.filter-group select {
  padding: 0.4rem 0.5rem;
  border: 1px solid #D1D7DE;
  border-radius: 6px;
  font-size: 13px;
  min-width: 180px;
}
.filter-group select:focus {
  border-color: #003274;
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 50, 116, 0.12);
}

/* ── Table cells ── */
.batch-id { color: #003274; font-weight: 600; }
.status-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}
.status-badge--done { background: rgba(82, 201, 166, 0.15); color: #1a8a64; }
.status-badge--drying { background: rgba(211, 167, 84, 0.15); color: #9a7030; }
.status-badge--work { background: rgba(0, 50, 116, 0.08); color: #003274; }

.empty-hint {
  color: #6B7280;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 0;
  justify-content: center;
}
</style>
