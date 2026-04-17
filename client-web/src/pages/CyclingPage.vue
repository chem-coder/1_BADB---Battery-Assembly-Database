<script setup>
/**
 * CyclingPage — Battery cycling test results.
 * Upload cycling data files → view sessions → interactive charts.
 */
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import PageHeader from '@/components/PageHeader.vue'
import CrudTable from '@/components/CrudTable.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'

const CyclingCharts = defineAsyncComponent(() => import('@/components/CyclingCharts.vue'))

const router = useRouter()
const toast = useToast()
const authStore = useAuthStore()

// ── Data ──
const sessions = ref([])
const batteries = ref([])
const loading = ref(true)
const selectedSession = ref(null)
const summaryData = ref([])
// Multi-cycle overlay state:
// - selectedCycles: cycles the user has activated (chips + chart click)
// - cycleDataMap:   cycleNumber → datapoints[] (lazy-loaded, cached per session)
// - loadingCycles:  cycles currently being fetched (for chip spinner)
const selectedCycles = ref([])
const cycleDataMap = ref({})
const loadingCycles = ref([])
const MAX_SELECTED_CYCLES = 6

// ── Upload dialog ──
// Multi-file upload model:
//   - files[] — one row per picked file, with its own battery assignment
//   - defaultBatteryId — optional "apply to all" shortcut when uploading many
//     files for the same cell; per-file Select overrides this
//   - uploadForm — metadata shared across all files in this batch
const showUpload = ref(false)
const files = ref([])  // [{ file: File, battery_id: number|null, state, error, session_id }]
const defaultBatteryId = ref(null)
const uploadForm = ref({
  equipment_type: 'auto',
  channel: null,
  protocol: '',
  notes: '',
})
const uploading = ref(false)
const fileInputRef = ref(null)

const FILE_STATES = {
  pending: { icon: 'pi pi-file', label: 'Ожидает' },
  uploading: { icon: 'pi pi-spin pi-spinner', label: 'Загрузка...' },
  done: { icon: 'pi pi-check-circle', label: 'Готово' },
  error: { icon: 'pi pi-times-circle', label: 'Ошибка' },
}

// "Determine automatically" is the default — the parser peeks at the file
// and picks the right format. Only pick manually if autodetect fails or you
// want to force a specific interpretation.
const equipmentOptions = [
  { label: 'Определить автоматически', value: 'auto' },
  { label: 'ELITECH P-20X8 (TXT)', value: 'elitech' },
  { label: 'Generic CSV', value: 'generic' },
  { label: 'Neware BTS — скоро', value: 'neware' },
  { label: 'Arbin MITS Pro — скоро', value: 'arbin' },
  { label: 'BioLogic EC-Lab — скоро', value: 'biologic' },
]

// ── Multi-file helpers ──────────────────────────────────────────────────
function onFilesPicked(event) {
  const picked = Array.from(event.target?.files || [])
  // Dedupe by name+size against already-staged files so picking the same
  // file twice doesn't create duplicate upload rows.
  const existing = new Set(files.value.map(f => `${f.file.name}|${f.file.size}`))
  for (const file of picked) {
    const key = `${file.name}|${file.size}`
    if (existing.has(key)) continue
    files.value.push({
      file,
      battery_id: defaultBatteryId.value,
      state: 'pending',
      error: null,
      session_id: null,
    })
  }
  // Reset input so picking the same file after removing it works again.
  if (event.target) event.target.value = ''
}

function removeFileAt(idx) {
  if (files.value[idx]?.state === 'uploading') return
  files.value.splice(idx, 1)
}

function applyDefaultBatteryToAll() {
  if (!defaultBatteryId.value) return
  for (const f of files.value) {
    // Don't override rows that already uploaded successfully.
    if (f.state !== 'done') f.battery_id = defaultBatteryId.value
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

function resetUploadDialog() {
  files.value = []
  defaultBatteryId.value = null
  uploadForm.value = { equipment_type: 'auto', channel: null, protocol: '', notes: '' }
}

// Progress helpers for the dynamic "Загрузить (N)" / "Загрузка... (K/N)" button
const uploadStats = computed(() => {
  const total = files.value.length
  const done = files.value.filter(f => f.state === 'done').length
  const err  = files.value.filter(f => f.state === 'error').length
  const pend = files.value.filter(f => f.state === 'pending').length
  return { total, done, err, pend }
})

const columns = [
  { field: 'session_id', header: '#', width: 60, sortable: true },
  { field: 'battery_id', header: 'Аккумулятор', width: 120, sortable: true },
  { field: 'equipment_type', header: 'Оборудование', width: 120, sortable: true, filterable: true },
  { field: 'total_cycles', header: 'Циклов', width: 80, sortable: true },
  { field: 'status', header: 'Статус', width: 100, sortable: true, filterable: true },
  { field: 'file_name', header: 'Файл', width: 180 },
  { field: 'uploader_name', header: 'Загрузил', width: 130, filterable: true },
  { field: 'uploaded_at', header: 'Дата', width: 140, sortable: true },
]

// ── Load ──
async function loadData() {
  loading.value = true
  try {
    const [sessionsRes, batteriesRes] = await Promise.allSettled([
      api.get('/api/cycling/sessions'),
      api.get('/api/batteries'),
    ])
    if (sessionsRes.status === 'fulfilled') sessions.value = sessionsRes.value.data
    if (batteriesRes.status === 'fulfilled') batteries.value = batteriesRes.value.data
  } catch { /* silent */ }
  loading.value = false
}

onMounted(loadData)

// ── Session selection → load charts ──
async function onSessionClick(row) {
  selectedSession.value = row
  // Clear per-session cycle overlay state
  selectedCycles.value = []
  cycleDataMap.value = {}
  loadingCycles.value = []
  try {
    const { data } = await api.get(`/api/cycling/sessions/${row.session_id}/summary`)
    summaryData.value = data
  } catch {
    summaryData.value = []
  }
}

// Toggle a cycle in the overlay:
// - if already selected → remove (but keep data cached for quick re-enable)
// - if not selected → add; lazy-fetch datapoints if not cached
// - cap at MAX_SELECTED_CYCLES to avoid chart clutter / memory blowup
// - guards against session-switch races: captures session_id at entry and
//   bails out if the user switched sessions before the fetch resolved.
async function toggleCycle(cycleNum) {
  if (!selectedSession.value) return

  const idx = selectedCycles.value.indexOf(cycleNum)
  if (idx >= 0) {
    selectedCycles.value = selectedCycles.value.filter(c => c !== cycleNum)
    return
  }

  if (selectedCycles.value.length >= MAX_SELECTED_CYCLES) {
    toast.add({
      severity: 'warn',
      summary: 'Лимит циклов',
      detail: `Можно сравнивать до ${MAX_SELECTED_CYCLES} циклов одновременно`,
      life: 3000,
    })
    return
  }

  // Capture session at entry — used to detect session switch mid-flight.
  const capturedSessionId = selectedSession.value.session_id

  // Add to selection immediately (chip turns active)
  selectedCycles.value = [...selectedCycles.value, cycleNum]

  // If already cached, done
  if (cycleDataMap.value[cycleNum]) return

  // Fetch datapoints
  loadingCycles.value = [...loadingCycles.value, cycleNum]
  try {
    const { data } = await api.get(`/api/cycling/sessions/${capturedSessionId}/cycles/${cycleNum}`)
    // Bail out if the user switched sessions while the fetch was in flight —
    // otherwise we'd stomp the new session's cycleDataMap with old data.
    if (selectedSession.value?.session_id !== capturedSessionId) return
    cycleDataMap.value = { ...cycleDataMap.value, [cycleNum]: data }
  } catch {
    // Only mutate state if we're still on the same session.
    if (selectedSession.value?.session_id === capturedSessionId) {
      selectedCycles.value = selectedCycles.value.filter(c => c !== cycleNum)
      toast.add({
        severity: 'error',
        summary: 'Ошибка',
        detail: `Не удалось загрузить цикл ${cycleNum}`,
        life: 3000,
      })
    }
  } finally {
    // Same session guard — loadingCycles was reset on session switch.
    if (selectedSession.value?.session_id === capturedSessionId) {
      loadingCycles.value = loadingCycles.value.filter(c => c !== cycleNum)
    }
  }
}

// ── Upload ──────────────────────────────────────────────────────────────
// Sequential upload — each file becomes its own cycling_sessions row. We
// don't parallelize because:
//   (a) parser spawns a python subprocess (CPU) — parallel slams the server
//   (b) UX: clear per-file progress + stable ordering
// Files that already succeeded (state='done') are skipped on retry, so the
// user can fix a battery_id for the failed row and re-click "Загрузить".
async function doUpload() {
  if (files.value.length === 0) {
    toast.add({ severity: 'warn', summary: 'Нет файлов', detail: 'Выберите хотя бы один файл', life: 3000 })
    return
  }
  // Validate: every pending file must have a battery assigned.
  const missing = files.value.filter(f => f.state !== 'done' && !f.battery_id)
  if (missing.length) {
    toast.add({
      severity: 'warn',
      summary: 'Не все аккумуляторы выбраны',
      detail: `Осталось выбрать: ${missing.length} файл(ов)`,
      life: 4000,
    })
    return
  }

  uploading.value = true
  for (const f of files.value) {
    if (f.state === 'done') continue
    f.state = 'uploading'
    f.error = null

    const formData = new FormData()
    formData.append('file', f.file)
    formData.append('battery_id', f.battery_id)
    formData.append('equipment_type', uploadForm.value.equipment_type)
    if (uploadForm.value.channel) formData.append('channel', uploadForm.value.channel)
    if (uploadForm.value.protocol) formData.append('protocol', uploadForm.value.protocol)
    if (uploadForm.value.notes) formData.append('notes', uploadForm.value.notes)

    try {
      const { data } = await api.post('/api/cycling/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      f.state = 'done'
      f.session_id = data.session_id
      f.duplicate = !!data.duplicate
    } catch (err) {
      f.state = 'error'
      f.error = err.response?.data?.error || 'Не удалось загрузить файл'
    }
  }
  uploading.value = false

  const { done, err } = uploadStats.value
  if (err === 0) {
    toast.add({
      severity: 'success',
      summary: 'Загрузка завершена',
      detail: `Создано ${done} сессий`,
      life: 4000,
    })
    showUpload.value = false
    resetUploadDialog()
  } else {
    toast.add({
      severity: 'warn',
      summary: 'Загрузка с ошибками',
      detail: `Готово: ${done}, ошибок: ${err}. Проверьте файлы в списке.`,
      life: 6000,
    })
    // Keep dialog open so user can see per-file errors and retry.
  }
  // Reload sessions list so newly processed ones show up (parser is async).
  setTimeout(loadData, 2000)
  setTimeout(loadData, 6000)
}

async function deleteSession(items) {
  const deletedIds = []
  for (const item of items) {
    const id = item.session_id ?? item
    try {
      await api.delete(`/api/cycling/sessions/${id}`)
      deletedIds.push(id)
    } catch { /* silent */ }
  }
  await loadData()
  if (selectedSession.value && deletedIds.includes(selectedSession.value.session_id)) {
    selectedSession.value = null
    summaryData.value = []
    selectedCycles.value = []
    cycleDataMap.value = {}
    loadingCycles.value = []
  }
}

function formatDate(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const batteryOptions = computed(() =>
  batteries.value.map(b => ({
    label: `#${b.battery_id} ${b.form_factor || ''} ${b.project_name || ''}`.trim(),
    value: b.battery_id,
  }))
)
</script>

<template>
  <div class="cycling-page">
    <PageHeader title="Циклирование" icon="pi pi-sync">
      <template #actions>
        <Button label="Загрузить файл" icon="pi pi-upload" size="small" @click="showUpload = true" />
      </template>
    </PageHeader>

    <!-- Sessions table -->
    <CrudTable
      :columns="columns"
      :data="sessions"
      id-field="session_id"
      table-name="Сессии циклирования"
      @row-click="onSessionClick"
      @delete="deleteSession"
    >
      <template #col-battery_id="{ data }">
        <span class="battery-link" @click.stop="router.push(`/assembly/${data.battery_id}`)">
          Акк. #{{ data.battery_id }}
        </span>
      </template>
      <template #col-status="{ data }">
        <StatusBadge :status="data.status" />
      </template>
      <template #col-uploaded_at="{ data }">
        {{ formatDate(data.uploaded_at) }}
      </template>
      <template #col-file_name="{ data }">
        <span :title="data.file_name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:170px;">
          {{ data.file_name }}
        </span>
      </template>
    </CrudTable>

    <!-- Charts area -->
    <div v-if="selectedSession" class="charts-area glass-card">
      <div class="charts-header">
        <div class="charts-title">
          Сессия #{{ selectedSession.session_id }}
          — Акк. #{{ selectedSession.battery_id }}
          <span v-if="selectedSession.project_name" class="charts-project">{{ selectedSession.project_name }}</span>
        </div>
        <div class="charts-meta">
          {{ selectedSession.total_cycles }} циклов
          · {{ selectedSession.equipment_type }}
          <span v-if="selectedSession.protocol"> · {{ selectedSession.protocol }}</span>
        </div>
      </div>

      <CyclingCharts
        v-if="summaryData.length"
        :summary="summaryData"
        :cycleDataMap="cycleDataMap"
        :selectedCycles="selectedCycles"
        :loadingCycles="loadingCycles"
        :totalCycles="selectedSession.total_cycles || summaryData.length"
        :sessionId="selectedSession.session_id"
        @toggle-cycle="toggleCycle"
      />
      <div v-else-if="selectedSession.status === 'processing'" class="charts-loading">
        <i class="pi pi-spin pi-spinner"></i> Данные обрабатываются...
      </div>
      <div v-else-if="selectedSession.status === 'error'" class="charts-error">
        <i class="pi pi-exclamation-triangle"></i> {{ selectedSession.error_message || 'Ошибка обработки' }}
      </div>
      <div v-else class="charts-empty">Нет данных</div>
    </div>

    <!-- Upload dialog — multi-file -->
    <Dialog v-model:visible="showUpload" header="Загрузить файлы циклирования"
            :modal="true" style="width: 760px" :closable="!uploading">
      <div class="upload-form">

        <!-- File picker: hidden native <input>, custom Button triggers it -->
        <div class="upload-field">
          <div class="file-picker-row">
            <input
              ref="fileInputRef"
              type="file"
              multiple
              accept=".csv,.xlsx,.xls,.txt"
              @change="onFilesPicked"
              style="display:none"
            />
            <Button
              label="Выбрать файлы"
              icon="pi pi-folder-open"
              outlined
              :disabled="uploading"
              @click="fileInputRef?.click()"
            />
            <span v-if="files.length" class="file-picker-count">
              {{ files.length }} файл(ов) выбрано
              <span v-if="uploadStats.done > 0" class="file-picker-done">· {{ uploadStats.done }} готово</span>
              <span v-if="uploadStats.err > 0"  class="file-picker-err">· {{ uploadStats.err }} с ошибкой</span>
            </span>
            <span v-else class="file-picker-hint">Можно выбрать несколько файлов сразу (Ctrl/⌘ + клик)</span>
          </div>
        </div>

        <!-- Per-file list with per-file battery Select -->
        <div v-if="files.length" class="file-list">
          <div v-for="(f, idx) in files" :key="f.file.name + '|' + f.file.size"
               class="file-row" :class="`file-row--${f.state}`">
            <i class="file-row-icon" :class="FILE_STATES[f.state].icon" :title="FILE_STATES[f.state].label"></i>
            <div class="file-row-name">
              <div class="file-row-title" :title="f.file.name">{{ f.file.name }}</div>
              <div class="file-row-sub">
                {{ formatFileSize(f.file.size) }}
                <span v-if="f.session_id" class="file-row-session">· сессия #{{ f.session_id }}</span>
                <span v-if="f.duplicate" class="file-row-dup">· дубликат</span>
                <span v-if="f.error" class="file-row-error">· {{ f.error }}</span>
              </div>
            </div>
            <Select
              v-model="f.battery_id"
              :options="batteryOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="Акк."
              :filter="true"
              size="small"
              style="width: 200px; flex-shrink: 0"
              :disabled="uploading || f.state === 'done'"
            />
            <Button
              icon="pi pi-times"
              severity="secondary"
              text
              rounded
              size="small"
              :disabled="uploading && f.state === 'uploading'"
              @click="removeFileAt(idx)"
            />
          </div>
        </div>

        <!-- Shared settings: apply to every file in this batch -->
        <fieldset class="upload-shared">
          <legend>Общие параметры</legend>

          <div class="upload-field">
            <label>Аккумулятор по умолчанию</label>
            <div class="default-battery-row">
              <Select
                v-model="defaultBatteryId"
                :options="batteryOptions"
                optionLabel="label"
                optionValue="value"
                placeholder="Новым файлам — этот аккумулятор..."
                :filter="true"
                size="small"
                :disabled="uploading"
                style="flex: 1"
              />
              <Button
                label="Применить ко всем"
                size="small"
                severity="secondary"
                :disabled="!defaultBatteryId || !files.length || uploading"
                @click="applyDefaultBatteryToAll"
              />
            </div>
          </div>

          <div class="upload-field">
            <label>Формат</label>
            <Select
              v-model="uploadForm.equipment_type"
              :options="equipmentOptions"
              optionLabel="label"
              optionValue="value"
              size="small"
              :disabled="uploading"
              style="width: 100%"
            />
          </div>

          <div class="upload-row">
            <div class="upload-field">
              <label>Канал</label>
              <input v-model.number="uploadForm.channel" type="number" class="upload-input" placeholder="—" :disabled="uploading" />
            </div>
            <div class="upload-field">
              <label>Протокол</label>
              <input v-model="uploadForm.protocol" class="upload-input" placeholder="—" :disabled="uploading" />
            </div>
          </div>

          <div class="upload-field">
            <label>Заметки</label>
            <textarea v-model="uploadForm.notes" class="upload-input upload-textarea" rows="2" placeholder="—" :disabled="uploading"></textarea>
          </div>
        </fieldset>

      </div>
      <template #footer>
        <Button label="Отмена" severity="secondary" text :disabled="uploading" @click="showUpload = false" />
        <Button
          :label="uploading
            ? `Загрузка... (${uploadStats.done + uploadStats.err}/${uploadStats.total})`
            : (uploadStats.err > 0 ? `Повторить (${uploadStats.err})` : `Загрузить${files.length ? ' (' + files.length + ')' : ''}`)"
          icon="pi pi-upload"
          :loading="uploading"
          :disabled="uploading || files.length === 0"
          @click="doUpload"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.cycling-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.battery-link {
  color: #003274;
  font-weight: 600;
  cursor: pointer;
}
.battery-link:hover { text-decoration: underline; }

/* ── Charts ── */
.charts-area { padding: 1.25rem; }
.charts-header { margin-bottom: 1rem; }
.charts-title {
  font-size: 14px;
  font-weight: 700;
  color: #003274;
}
.charts-project {
  font-size: 12px;
  font-weight: 500;
  color: #6B7280;
  margin-left: 6px;
}
.charts-meta {
  font-size: 12px;
  color: #6B7280;
  margin-top: 2px;
}

.charts-loading, .charts-error, .charts-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 2rem;
  font-size: 13px;
  color: rgba(0, 50, 116, 0.4);
}
.charts-error { color: #E74C3C; }

/* ── Upload form ── */
.upload-form { display: flex; flex-direction: column; gap: 0.85rem; }
.upload-field { display: flex; flex-direction: column; gap: 4px; }
.upload-field label {
  font-size: 12px;
  font-weight: 600;
  color: #4B5563;
}
.upload-row { display: flex; gap: 0.75rem; }
.upload-row .upload-field { flex: 1; }
.upload-input {
  width: 100%;
  padding: 6px 10px;
  border: 1.5px solid rgba(0, 50, 116, 0.12);
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  color: #333;
  background: white;
}
.upload-input:focus { border-color: #003274; outline: none; }
.upload-textarea { resize: vertical; min-height: 48px; }

/* ── Multi-file upload ── */
.file-picker-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.file-picker-count {
  font-size: 12px;
  color: #4B5563;
  font-weight: 500;
}
.file-picker-done { color: #27AE60; margin-left: 4px; }
.file-picker-err  { color: #E74C3C; margin-left: 4px; }
.file-picker-hint { font-size: 12px; color: #9CA3AF; font-style: italic; }

.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 8px;
  background: rgba(0, 50, 116, 0.02);
}
.file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 6px;
  background: white;
  border: 1px solid rgba(0, 50, 116, 0.06);
  transition: background 0.15s;
}
.file-row-icon {
  width: 1.1rem;
  font-size: 0.95rem;
  text-align: center;
  flex-shrink: 0;
  color: #6B7280;
}
.file-row--uploading { background: #fff8e1; border-color: rgba(241, 196, 15, 0.4); }
.file-row--uploading .file-row-icon { color: #F39C12; }
.file-row--done      { background: #e8f5e9; border-color: rgba(39, 174, 96, 0.4); }
.file-row--done .file-row-icon { color: #27AE60; }
.file-row--error     { background: #fdecea; border-color: rgba(231, 76, 60, 0.4); }
.file-row--error .file-row-icon { color: #E74C3C; }

.file-row-name {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.file-row-title {
  font-size: 13px;
  font-weight: 600;
  color: #1F2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-row-sub {
  font-size: 11px;
  color: #6B7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-row-session { color: #003274; font-weight: 500; }
.file-row-dup     { color: #F39C12; }
.file-row-error   { color: #E74C3C; font-weight: 500; }

/* ── Shared settings block ── */
.upload-shared {
  border: 1px solid rgba(0, 50, 116, 0.1);
  border-radius: 8px;
  padding: 0.75rem 1rem 1rem;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: rgba(0, 50, 116, 0.015);
}
.upload-shared legend {
  padding: 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: #4B5563;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.default-battery-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.default-battery-row > :first-child { flex: 1; min-width: 0; }
</style>
