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
import Checkbox from 'primevue/checkbox'
import { BATTERY_STAGES } from '@/config/batteryStages'
import { useBatteryState } from '@/composables/useBatteryState'

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
// the constructor. That endpoint is a heavy read (9 subqueries + a
// side-effect write to batteries.status inside ensureBatteryAssembledStatus)
// so we:
//   1. only load summaries for batteries currently in constructorIds;
//   2. cap concurrency at 3 parallel requests (prevents "toggle all"
//      fanning out to 50+ simultaneous /assembly calls);
//   3. cache by batteryId — re-open is a no-op unless the cache is
//      explicitly invalidated (toggle-close clears the entry so the
//      next toggle-in always re-fetches, giving free retry on transient
//      errors at no cost to happy-path traffic).
// A lighter server-side /capacity_summary endpoint would make points
// 1-2 unnecessary, but that's Dalia's backend scope.
const capacitySummaries = ref({})          // { [id]: capacity_summary | null }
const capacitySummaryErrors = ref({})       // { [id]: 'auth'|'server'|'empty'|null }
const capacitySummariesLoading = ref({})   // { [id]: bool }

const MAX_CONCURRENT_CAPACITY_FETCHES = 3
let _capacityInFlight = 0
const _capacityQueue = []

async function loadCapacitySummary(batteryId) {
  if (!batteryId) return
  if (capacitySummariesLoading.value[batteryId]) return
  // Throttle — wait our turn if 3 are already in flight.
  if (_capacityInFlight >= MAX_CONCURRENT_CAPACITY_FETCHES) {
    await new Promise(resolve => _capacityQueue.push(resolve))
  }
  // Re-check dedup after acquiring the slot: during our queue wait a
  // concurrent caller for the same ID may have raced past the top guard
  // and started its own fetch. Without this second check, we'd issue a
  // duplicate /assembly call — harmless for correctness but wasteful.
  if (capacitySummariesLoading.value[batteryId]) {
    const next = _capacityQueue.shift()
    if (next) next()
    return
  }
  _capacityInFlight++
  capacitySummariesLoading.value[batteryId] = true
  try {
    const { data } = await api.get(`/api/batteries/${batteryId}/assembly`)
    const summary = data?.capacity_summary || null
    capacitySummaries.value[batteryId] = summary
    // Distinguish "no data yet" (draft battery) from "failed to load".
    // empty = no cathode + no anode → UI shows "заполните массы" hint.
    capacitySummaryErrors.value[batteryId] =
      summary && (summary.cathode_count > 0 || summary.anode_count > 0)
        ? null
        : 'empty'
  } catch (err) {
    capacitySummaries.value[batteryId] = null
    // Classify the error so the UI can show a meaningful message instead
    // of collapsing 401 / 500 / network into the "draft battery" hint.
    const status = err?.response?.status
    capacitySummaryErrors.value[batteryId] =
      status === 401 || status === 403 ? 'auth' :
      status >= 500 ? 'server' :
      status === 404 ? 'missing' :
      'network'
  } finally {
    capacitySummariesLoading.value[batteryId] = false
    _capacityInFlight--
    const next = _capacityQueue.shift()
    if (next) next()
  }
}

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
    if (!now.has(old)) {
      // Battery dropped out of the constructor — purge the cached
      // summary + any error. Next toggle-in triggers a fresh fetch,
      // giving free retry on transient failures.
      delete capacitySummaries.value[old]
      delete capacitySummaryErrors.value[old]
    }
  }
  for (const id of ids) {
    if (capacitySummaries.value[id] === undefined) loadCapacitySummary(id)
  }
})

function fmtCap(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  // 3 decimals — matches Dalia's formatCapacity in battery-print.js,
  // so the same battery shows identical numbers in the inline panel
  // and the printed report.
  return `${n.toFixed(3)} мАч`
}
function fmtRatio(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(3)
}

// Friendly message per error state — lets the user distinguish an
// actual server issue from a "draft battery needs more data" case.
function capacityErrorMessage(id) {
  const e = capacitySummaryErrors.value[id]
  if (e === 'empty' || e == null) return 'Нет данных для расчёта — заполните массы в рецептах лент и удельную ёмкость в карточке материала.'
  if (e === 'auth')    return 'Требуется вход — обновите страницу и авторизуйтесь.'
  if (e === 'missing') return 'Аккумулятор не найден.'
  if (e === 'server')  return 'Ошибка сервера при расчёте. Попробуйте позже.'
  return 'Не удалось загрузить — проверьте подключение.'
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
          <span v-if="capacitySummariesLoading[id]" class="capacity-loading">
            <i class="pi pi-spin pi-spinner" style="font-size:11px"></i> расчёт…
          </span>
        </div>

        <template v-if="capacitySummaries[id]">
          <div class="capacity-grid">
            <div class="capacity-cell">
              <div class="capacity-label">Катод ({{ capacitySummaries[id].cathode_count }} шт.)</div>
              <div class="capacity-value">
                <div>теор.: <strong>{{ fmtCap(capacitySummaries[id].cathode_capacity_theoretical_mAh) }}</strong></div>
                <div>факт.: <strong>{{ fmtCap(capacitySummaries[id].cathode_capacity_actual_mAh) }}</strong></div>
              </div>
            </div>
            <div class="capacity-cell">
              <div class="capacity-label">Анод ({{ capacitySummaries[id].anode_count }} шт.)</div>
              <div class="capacity-value">
                <div>теор.: <strong>{{ fmtCap(capacitySummaries[id].anode_capacity_theoretical_mAh) }}</strong></div>
                <div>факт.: <strong>{{ fmtCap(capacitySummaries[id].anode_capacity_actual_mAh) }}</strong></div>
              </div>
            </div>
            <div class="capacity-cell capacity-cell--primary">
              <div class="capacity-label" title="Ограничивающая ёмкость ячейки — min(катод, анод)">Ёмкость ячейки</div>
              <div class="capacity-value">
                <div>теор.: <strong>{{ fmtCap(capacitySummaries[id].limiting_capacity_theoretical_mAh) }}</strong></div>
                <div>факт.: <strong>{{ fmtCap(capacitySummaries[id].limiting_capacity_actual_mAh) }}</strong></div>
              </div>
            </div>
            <div class="capacity-cell" title="N/P ratio = Q_анод / Q_катод; обычно 1.05–1.2 для Li-ion">
              <div class="capacity-label">N/P соотношение</div>
              <div class="capacity-value">
                <div>теор.: <strong>{{ fmtRatio(capacitySummaries[id].np_theoretical) }}</strong></div>
                <div>факт.: <strong>{{ fmtRatio(capacitySummaries[id].np_actual) }}</strong></div>
              </div>
            </div>
          </div>
        </template>
        <template v-else-if="!capacitySummariesLoading[id]">
          <div
            class="capacity-empty"
            :class="{
              'capacity-empty--auth':    capacitySummaryErrors[id] === 'auth',
              'capacity-empty--server':  capacitySummaryErrors[id] === 'server' || capacitySummaryErrors[id] === 'network',
              'capacity-empty--missing': capacitySummaryErrors[id] === 'missing',
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
