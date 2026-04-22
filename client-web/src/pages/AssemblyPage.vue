<script setup>
/**
 * AssemblyPage — "Аккумуляторы"
 * Shows ALL batteries with CrudTable + inline TapeConstructor (battery mode).
 * Follows TapesPage / ElectrodesPage pattern.
 */
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import PageHeader from '@/components/PageHeader.vue'
import SaveIndicator from '@/components/SaveIndicator.vue'
import CrudTable from '@/components/CrudTable.vue'
import TapeConstructor from '@/components/TapeConstructor.vue'
import BatteryElectrochemEditor from '@/components/BatteryElectrochemEditor.vue'
import Checkbox from 'primevue/checkbox'
import { BATTERY_STAGES } from '@/config/batteryStages'
import { useBatteryState } from '@/composables/useBatteryState'
import { useBackendCache } from '@/composables/useBackendCache'
import { errorMessageRu } from '@/utils/errorClassifier'
import { fmtCapacity, capacityIncompleteHint } from '@/utils/formatCapacity'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const authStore = useAuthStore()
const crudTable = ref(null)

// ── Data ──
const batteries = ref([])
const loading = ref(false)

// ── Reference data for constructor dropdowns ──
const refData = reactive({
  projects: [],
  separators: [],
  electrolytes: [],
  cathodeTapes: [],
  anodeTapes: [],
  electrodeBatches: [],
})

async function loadRefData() {
  const endpoints = [
    { key: 'projects', url: '/api/projects?project_id=0' },
    { key: 'separators', url: '/api/separators' },
    { key: 'electrolytes', url: '/api/electrolytes' },
  ]
  const results = await Promise.allSettled(endpoints.map(e => api.get(e.url)))
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') refData[endpoints[i].key] = r.value.data
  })

  // Load tapes and split by role
  try {
    const { data: tapes } = await api.get('/api/tapes')
    refData.cathodeTapes = tapes.filter(t => t.role === 'cathode')
    refData.anodeTapes = tapes.filter(t => t.role === 'anode')
  } catch {}

  // Load electrode batches with labels
  try {
    const { data: batches } = await api.get('/api/electrodes/electrode-cut-batches')
    refData.electrodeBatches = batches.map(b => ({
      ...b,
      _label: `#${b.cut_batch_id} — ${b.tape_name || ''} (${b.electrode_count || 0} шт.)`,
    }))
  } catch {}
}

const ffLabels = { coin: 'Монета', pouch: 'Пакет', cylindrical: 'Цилиндр' }
const statusLabels = { draft: 'Черновик', assembled: 'Собран', testing: 'Тест', completed: 'Готов', failed: 'Брак' }

// ── Columns ──
const columns = [
  { field: '_constructor', header: '🔧', minWidth: '45px', width: '45px', sortable: false, filterable: false },
  // Synthetic column: "🖨️ Print" opens Dalia's print-friendly report page
  // (/workflow/battery-print.html?battery_id=X) in a new tab. Matches the
  // same pattern used in ElectrodesPage for the electrode-batch print.
  { field: '_print', header: '🖨️', minWidth: '42px', width: '42px', sortable: false, filterable: false },
  { field: 'battery_id', header: '№', minWidth: '55px', width: '65px' },
  { field: 'project_name', header: 'Проект', minWidth: '120px' },
  { field: 'form_factor', header: 'Форм-фактор', minWidth: '90px', width: '110px' },
  { field: 'status_display', header: 'Статус', minWidth: '80px', width: '100px' },
  { field: 'created_by_name', header: 'Оператор', minWidth: '100px' },
  { field: 'created_at', header: 'Создан', minWidth: '80px', width: '110px' },
  { field: 'notes', header: 'Заметки', minWidth: '120px', sortable: false, filterable: false },
]

// ── Computed: enriched data ──
const tableData = computed(() =>
  batteries.value.map(b => ({
    ...b,
    status_display: statusLabels[b.status] || b.status || 'Черновик',
  }))
)

// ── API ──
async function loadBatteries() {
  loading.value = true
  try {
    const { data } = await api.get('/api/batteries')
    batteries.value = data
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить аккумуляторы', life: 3000 })
  } finally {
    loading.value = false
  }
}

async function createBattery() {
  try {
    const { data } = await api.post('/api/batteries', {
      project_id: 1,
      created_by: String(authStore.user?.userId || ''),
      form_factor: 'coin',
    })
    await loadBatteries()
    constructorIds.value = [data.battery_id]
    toast.add({ severity: 'success', summary: 'Создан', detail: `Аккумулятор #${data.battery_id}`, life: 2000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Не удалось создать', life: 3000 })
  }
}

function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('ru-RU')
}

// ── Constructor (same pattern as TapesPage / ElectrodesPage) ──
const constructorIds = ref([])

function toggleConstructor(batteryId) {
  const idx = constructorIds.value.indexOf(batteryId)
  if (idx >= 0) constructorIds.value.splice(idx, 1)
  else constructorIds.value.push(batteryId)
}

function isInConstructor(batteryId) {
  return constructorIds.value.includes(batteryId)
}

function toggleAllConstructor() {
  if (constructorIds.value.length > 0) {
    constructorIds.value.splice(0)
  } else {
    const visible = crudTable.value?.filteredData || tableData.value
    constructorIds.value = visible.map(b => b.battery_id)
  }
}

function batteryStateFactory(id) {
  return useBatteryState({ batteryId: id })
}

// Battery print — opens Dalia's /workflow/battery-print.html in a new
// tab. Same pattern as ElectrodesPage (commit bdf51ed). The print page
// fetches /api/batteries/:id/report which the auth-header patch on her
// print JS (commit 2cca4b4) doesn't yet cover — her battery-print.js
// still lacks the Bearer token. Works in dev via config.authBypass;
// production needs the same two-line patch (pending separate commit).
function openBatteryPrint(batteryId) {
  if (!batteryId) return
  const url = `/workflow/battery-print.html?battery_id=${encodeURIComponent(batteryId)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

// ── Capacity summary (Dalia's commit 026efbf) ─────────────────────
// Fetched lazily via /api/batteries/:id/assembly when a battery is in
// the constructor. The /assembly endpoint is a heavy read — 9 subqueries
// + a hidden side-effect UPDATE on batteries.status inside
// ensureBatteryAssembledStatus. A lighter /capacity_summary endpoint
// would make the concurrency cap unnecessary; that's tracked in the
// Dalia-PR backlog (drawer_BADB_decisions_3de8b01e).
//
// Migrated from an inline fetch/cache/semaphore (commits 93d9471,
// c24890e era) to useBackendCache (Phase 0.1). Behavior preserved:
// load on toggle-in, invalidate on toggle-out for free retry on
// transient failures. Error classification now flows through the
// shared errorClassifier util.
const capacity = useBackendCache({
  fetchFn: async (batteryId) => {
    const { data } = await api.get(`/api/batteries/${batteryId}/assembly`)
    return data?.capacity_summary || null
  },
  // "Empty" = draft battery, no cathode + no anode. UI shows the "fill
  // recipe masses" hint; classifier picks 'empty' over HTTP-error codes.
  isEmpty: (summary) =>
    !summary || (summary.cathode_count === 0 && summary.anode_count === 0),
  maxConcurrent: 3,
})

// Re-load summaries when constructorIds changes (user opens/closes a
// battery). Getter form `() => [...constructorIds.value]` is critical:
// a deep-watch on the ref directly receives `oldValue === newValue`
// when the array is mutated in-place via splice/push (Vue 3 reuses
// the same reference — no pre-change snapshot). Spreading into a new
// array on each call means the watcher compares two distinct arrays
// and delivers a real `oldIds` we can diff against. Without this, the
// cache-clear block below would be a no-op on every toggle-close
// (the common path: user unchecks a battery from the table).
watch(() => [...constructorIds.value], (ids, oldIds) => {
  const now = new Set(ids)
  for (const old of (oldIds || [])) {
    if (!now.has(old)) capacity.invalidate(old)
  }
  for (const id of ids) {
    if (!capacity.isLoaded(id)) capacity.load(id)
  }
})

// Capacity values use the shared `fmtCapacity` from utils (same 3-decimal
// "X.XXX мАч" format as Dalia's print-report — single source of truth).
// Only `fmtRatio` stays local — it's dimensionless and not in the util.
function fmtRatio(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(3)
}

// Context 'capacity' is interpreted by errorMessageRu — 'empty' becomes
// "заполните массы…", the other codes get generic auth/server/network
// messages. One line vs the old 10-line inline function.
function capacityErrorMessage(id) {
  return errorMessageRu(capacity.errors.value[id], 'capacity')
}

// ── Electrochem file attachments (G2 — Phase γ) ────────────────────
// Per-battery list of uploaded electrochem files. Same useBackendCache
// pattern as `capacity` above, one fetch per battery-in-constructor.
// No isEmpty — the editor treats "loaded with zero files" as a normal
// "Файлы не прикреплены" state rather than an error, so 'empty' code
// isn't needed.
const electrochemFiles = useBackendCache({
  fetchFn: async (batteryId) => {
    const { data } = await api.get(`/api/batteries/battery_electrochem/${batteryId}`)
    return Array.isArray(data) ? data : []
  },
  maxConcurrent: 3,
})

watch(() => [...constructorIds.value], (ids, oldIds) => {
  const now = new Set(ids)
  for (const old of (oldIds || [])) {
    if (!now.has(old)) electrochemFiles.invalidate(old)
  }
  for (const id of ids) {
    if (!electrochemFiles.isLoaded(id)) electrochemFiles.load(id)
  }
})

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
      await api.delete(`/api/batteries/${item.battery_id}`)
    }
    pendingDelete.value = []
    crudTable.value?.clearSelection()
    await loadBatteries()
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

// ── Init ──
onMounted(async () => {
  await Promise.allSettled([loadBatteries(), loadRefData()])
  const batteryId = Number(route.params.id)
  if (batteryId && Number.isInteger(batteryId)) {
    constructorIds.value = [batteryId]
  }
})
onUnmounted(() => clearTimeout(saveTimer))
</script>

<template>
  <div class="assembly-page">
    <PageHeader title="Аккумуляторы" icon="pi pi-box">
      <template #actions>
        <SaveIndicator
          :visible="pendingDelete.length > 0 || saveState === 'saved'"
          :saved="saveState === 'saved'"
          @save="confirmSave"
          @cancel="discardChanges"
        />
      </template>
    </PageHeader>

    <CrudTable
      ref="crudTable"
      :columns="columns"
      :data="tableData"
      :loading="loading"
      id-field="battery_id"
      table-name="Аккумуляторы"
      show-add
      row-clickable
      @add="createBattery"
      @delete="onDelete"
      @row-click="(data) => toggleConstructor(data.battery_id)"
      @header-click="(field) => field === '_constructor' && toggleAllConstructor()"
    >
      <template #col-_constructor="{ data }">
        <Checkbox
          :modelValue="isInConstructor(data.battery_id)"
          @update:modelValue="toggleConstructor(data.battery_id)"
          :binary="true"
          v-tooltip.right="'В конструктор'"
        />
      </template>
      <template #col-_print="{ data }">
        <button
          class="print-btn"
          title="Печать отчёта по аккумулятору (откроется в новой вкладке)"
          @click.stop="openBatteryPrint(data.battery_id)"
        >
          <i class="pi pi-print"></i>
        </button>
      </template>
      <template #col-battery_id="{ data }">
        <strong class="battery-id">#{{ data.battery_id }}</strong>
      </template>
      <template #col-form_factor="{ data }">
        <span v-if="data.form_factor" class="ff-badge">
          {{ ffLabels[data.form_factor] || data.form_factor }}
        </span>
        <span v-else class="text-muted">—</span>
      </template>
      <template #col-status_display="{ data }">
        <span :class="['status-badge', `status-badge--${data.status || 'draft'}`]">
          {{ data.status_display }}
        </span>
      </template>
      <template #col-created_at="{ data }">{{ formatDate(data.created_at) }}</template>
      <template #col-notes="{ data }">
        <span class="notes-text">{{ data.notes || '' }}</span>
      </template>
    </CrudTable>

    <!-- Capacity summary (Dalia's commit 026efbf) — one card per
         battery currently in the constructor. Shows cathode/anode
         capacity (theor + actual), limiting cell capacity, and N/P
         ratio. Computed live on the backend via enrichBatteryElectrodesWithCapacity
         + buildBatteryCapacitySummary. Lets the user see the numbers
         without having to open the print page. -->
    <div v-if="constructorIds.length > 0" class="capacity-panels">
      <div
        v-for="id in constructorIds"
        :key="`cap-${id}`"
        class="capacity-card glass-card"
      >
        <div class="capacity-head">
          <span class="capacity-title">Ёмкость · Аккумулятор #{{ id }}</span>
          <span v-if="capacity.loading.value[id]" class="capacity-loading">
            <i class="pi pi-spin pi-spinner" style="font-size:11px"></i> расчёт…
          </span>
        </div>

        <template v-if="capacity.cache.value[id]">
          <div class="capacity-grid">
            <div class="capacity-cell">
              <div class="capacity-label">Катод ({{ capacity.cache.value[id].cathode_count }} шт.)</div>
              <div class="capacity-value">
                <div>теор.: <strong>{{ fmtCapacity(capacity.cache.value[id].cathode_capacity_theoretical_mAh) }}</strong></div>
                <div class="capacity-actual-row">
                  факт.: <strong>{{ fmtCapacity(capacity.cache.value[id].cathode_capacity_actual_mAh) }}</strong>
                  <i
                    v-if="capacity.cache.value[id].cathode_capacity_actual_mAh == null && capacityIncompleteHint(capacity.cache.value[id], 'battery-cathode')"
                    class="pi pi-question-circle capacity-hint-icon"
                    v-tooltip.top="capacityIncompleteHint(capacity.cache.value[id], 'battery-cathode')"
                  ></i>
                </div>
              </div>
            </div>
            <div class="capacity-cell">
              <div class="capacity-label">Анод ({{ capacity.cache.value[id].anode_count }} шт.)</div>
              <div class="capacity-value">
                <div>теор.: <strong>{{ fmtCapacity(capacity.cache.value[id].anode_capacity_theoretical_mAh) }}</strong></div>
                <div class="capacity-actual-row">
                  факт.: <strong>{{ fmtCapacity(capacity.cache.value[id].anode_capacity_actual_mAh) }}</strong>
                  <i
                    v-if="capacity.cache.value[id].anode_capacity_actual_mAh == null && capacityIncompleteHint(capacity.cache.value[id], 'battery-anode')"
                    class="pi pi-question-circle capacity-hint-icon"
                    v-tooltip.top="capacityIncompleteHint(capacity.cache.value[id], 'battery-anode')"
                  ></i>
                </div>
              </div>
            </div>
            <div class="capacity-cell capacity-cell--primary">
              <div class="capacity-label" title="Ограничивающая ёмкость ячейки — min(катод, анод)">Ёмкость ячейки</div>
              <div class="capacity-value">
                <div>теор.: <strong>{{ fmtCapacity(capacity.cache.value[id].limiting_capacity_theoretical_mAh) }}</strong></div>
                <div class="capacity-actual-row">
                  факт.: <strong>{{ fmtCapacity(capacity.cache.value[id].limiting_capacity_actual_mAh) }}</strong>
                  <i
                    v-if="capacity.cache.value[id].limiting_capacity_actual_mAh == null && capacityIncompleteHint(capacity.cache.value[id], 'battery-np')"
                    class="pi pi-question-circle capacity-hint-icon"
                    v-tooltip.top="capacityIncompleteHint(capacity.cache.value[id], 'battery-np')"
                  ></i>
                </div>
              </div>
            </div>
            <div class="capacity-cell" title="N/P ratio = Q_анод / Q_катод; обычно 1.05–1.2 для Li-ion">
              <div class="capacity-label">N/P соотношение</div>
              <div class="capacity-value">
                <div>теор.: <strong>{{ fmtRatio(capacity.cache.value[id].np_theoretical) }}</strong></div>
                <div class="capacity-actual-row">
                  факт.: <strong>{{ fmtRatio(capacity.cache.value[id].np_actual) }}</strong>
                  <i
                    v-if="!Number.isFinite(Number(capacity.cache.value[id].np_actual)) && capacityIncompleteHint(capacity.cache.value[id], 'battery-np')"
                    class="pi pi-question-circle capacity-hint-icon"
                    v-tooltip.top="capacityIncompleteHint(capacity.cache.value[id], 'battery-np')"
                  ></i>
                </div>
              </div>
            </div>
          </div>
        </template>
        <template v-else-if="!capacity.loading.value[id]">
          <div
            class="capacity-empty"
            :class="{
              'capacity-empty--auth':    capacity.errors.value[id] === 'auth',
              'capacity-empty--server':  capacity.errors.value[id] === 'server' || capacity.errors.value[id] === 'network',
              'capacity-empty--missing': capacity.errors.value[id] === 'missing',
            }"
          >
            {{ capacityErrorMessage(id) }}
          </div>
        </template>
      </div>
    </div>

    <!-- Constructor -->
    <TapeConstructor
      :selectedTapeIds="constructorIds"
      :tapeList="tableData"
      :stageConfigs="BATTERY_STAGES"
      :stateFactory="batteryStateFactory"
      :refs="refData"
      idField="battery_id"
      entityType="battery"
      title="КОНСТРУКТОР АККУМУЛЯТОРОВ"
      emptyHint="Отметьте аккумуляторы в таблице для работы в конструкторе"
    />

    <!-- Electrochem file uploads (G2) — one card per battery in the
         constructor. Follows the capacity-panels layout pattern above.
         The editor component manages its own staged upload queue and
         reads the cached file list from the shared useBackendCache
         handle passed via `:cache`. -->
    <div v-if="constructorIds.length > 0" class="electrochem-panels">
      <BatteryElectrochemEditor
        v-for="id in constructorIds"
        :key="`ec-${id}`"
        :batteryId="id"
        :cache="electrochemFiles"
      />
    </div>
  </div>
</template>

<style scoped>
.assembly-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.assembly-page :deep(.page-header) { margin-bottom: 3px !important; }

/* ── Electrochem panels (G2): one card per battery, stacked
   vertically — same flex-column pattern as .capacity-panels. ── */
.electrochem-panels {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.battery-id { color: #003274; }
.ff-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
  border: 0.5px solid rgba(0, 50, 116, 0.15);
}
.status-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}
.status-badge--draft { background: rgba(107, 114, 128, 0.12); color: #6B7280; }
.status-badge--assembled { background: rgba(0, 50, 116, 0.08); color: #003274; }
.status-badge--testing { background: rgba(211, 167, 84, 0.15); color: #9a7030; }
.status-badge--completed { background: rgba(82, 201, 166, 0.15); color: #1a8a64; }
.status-badge--failed { background: rgba(231, 76, 60, 0.12); color: #c0392b; }
.text-muted { color: rgba(0, 50, 116, 0.28); font-size: 13px; }
.notes-text { font-size: 13px; color: rgba(0, 50, 116, 0.7); }

/* Print button (same visual language as ElectrodesPage equivalent) */
.print-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: rgba(0, 50, 116, 0.55);
  cursor: pointer;
  border-radius: 5px;
  transition: all 0.15s;
}
.print-btn:hover {
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
}
.print-btn i { font-size: 13px; }

/* Capacity summary panel — one card per battery currently in the
   constructor. Sits between the table and the TapeConstructor. */
.capacity-panels {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.capacity-card {
  padding: 0.9rem 1.1rem;
}
.capacity-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.6rem;
  padding-bottom: 0.4rem;
  border-bottom: 0.5px solid rgba(0, 50, 116, 0.08);
}
.capacity-title {
  font-size: 13px;
  font-weight: 600;
  color: #003274;
  letter-spacing: 0.01em;
}
.capacity-loading {
  font-size: 11px;
  color: rgba(0, 50, 116, 0.55);
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.capacity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
}
.capacity-cell {
  padding: 0.45rem 0.6rem;
  border: 0.5px solid rgba(0, 50, 116, 0.08);
  border-radius: 6px;
  background: rgba(0, 50, 116, 0.02);
}
.capacity-cell--primary {
  background: rgba(82, 201, 166, 0.06);
  border-color: rgba(82, 201, 166, 0.25);
}
.capacity-label {
  font-size: 11px;
  font-weight: 600;
  color: #6B7280;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 4px;
}
.capacity-value {
  font-size: 13px;
  color: #003274;
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
}
.capacity-value strong { font-weight: 600; }
.capacity-actual-row {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.capacity-hint-icon {
  font-size: 12px;
  color: rgba(212, 164, 65, 0.80);
  cursor: help;
}
.capacity-empty {
  font-size: 12px;
  color: rgba(0, 50, 116, 0.55);
  padding: 0.5rem 0;
  font-style: italic;
}
/* Error-specific tinting: auth/server errors are red, missing is muted
   orange, default "empty draft" keeps the subtle blue tone above. */
.capacity-empty--auth,
.capacity-empty--server {
  color: #c0392b;
  font-style: normal;
}
.capacity-empty--missing {
  color: #9a7030;
  font-style: normal;
}
</style>
