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
import FileUpload from 'primevue/fileupload'

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
const cycleData = ref([])
const selectedCycle = ref(null)

// ── Upload dialog ──
const showUpload = ref(false)
const uploadForm = ref({
  battery_id: null,
  equipment_type: 'generic',
  channel: null,
  protocol: '',
  notes: '',
})
const uploading = ref(false)
const uploadFileRef = ref(null)

const equipmentOptions = [
  { label: 'Generic CSV', value: 'generic' },
  { label: 'Neware', value: 'neware' },
  { label: 'Arbin', value: 'arbin' },
  { label: 'BioLogic', value: 'biologic' },
]

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
  selectedCycle.value = null
  cycleData.value = []
  try {
    const { data } = await api.get(`/api/cycling/sessions/${row.session_id}/summary`)
    summaryData.value = data
  } catch {
    summaryData.value = []
  }
}

async function loadCycleDetail(cycleNum) {
  if (!selectedSession.value) return
  selectedCycle.value = cycleNum
  try {
    const { data } = await api.get(`/api/cycling/sessions/${selectedSession.value.session_id}/cycles/${cycleNum}`)
    cycleData.value = data
  } catch {
    cycleData.value = []
  }
}

// ── Upload ──
async function doUpload(event) {
  const file = event.files?.[0]
  if (!file) return

  if (!uploadForm.value.battery_id) {
    toast.add({ severity: 'warn', summary: 'Ошибка', detail: 'Выберите аккумулятор', life: 3000 })
    return
  }

  uploading.value = true
  const formData = new FormData()
  formData.append('file', file)
  formData.append('battery_id', uploadForm.value.battery_id)
  formData.append('equipment_type', uploadForm.value.equipment_type)
  if (uploadForm.value.channel) formData.append('channel', uploadForm.value.channel)
  if (uploadForm.value.protocol) formData.append('protocol', uploadForm.value.protocol)
  if (uploadForm.value.notes) formData.append('notes', uploadForm.value.notes)

  try {
    const { data } = await api.post('/api/cycling/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    toast.add({
      severity: 'success',
      summary: 'Загружено',
      detail: `Сессия #${data.session_id} создана${data.duplicate ? ' (дубликат!)' : ''}`,
      life: 4000,
    })
    showUpload.value = false
    uploadForm.value = { battery_id: null, equipment_type: 'generic', channel: null, protocol: '', notes: '' }
    // Reload after processing delay
    setTimeout(loadData, 2000)
    setTimeout(loadData, 6000)
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: err.response?.data?.error || 'Не удалось загрузить файл',
      life: 5000,
    })
  } finally {
    uploading.value = false
  }
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
        :cycleData="cycleData"
        :selectedCycle="selectedCycle"
        :totalCycles="selectedSession.total_cycles || summaryData.length"
        @select-cycle="loadCycleDetail"
      />
      <div v-else-if="selectedSession.status === 'processing'" class="charts-loading">
        <i class="pi pi-spin pi-spinner"></i> Данные обрабатываются...
      </div>
      <div v-else-if="selectedSession.status === 'error'" class="charts-error">
        <i class="pi pi-exclamation-triangle"></i> {{ selectedSession.error_message || 'Ошибка обработки' }}
      </div>
      <div v-else class="charts-empty">Нет данных</div>
    </div>

    <!-- Upload dialog -->
    <Dialog v-model:visible="showUpload" header="Загрузить файл циклирования" :modal="true" style="width: 500px">
      <div class="upload-form">
        <div class="upload-field">
          <label>Аккумулятор *</label>
          <Select
            v-model="uploadForm.battery_id"
            :options="batteryOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Выберите аккумулятор"
            :filter="true"
            size="small"
            style="width: 100%"
          />
        </div>
        <div class="upload-field">
          <label>Оборудование</label>
          <Select
            v-model="uploadForm.equipment_type"
            :options="equipmentOptions"
            optionLabel="label"
            optionValue="value"
            size="small"
            style="width: 100%"
          />
        </div>
        <div class="upload-row">
          <div class="upload-field">
            <label>Канал</label>
            <input v-model.number="uploadForm.channel" type="number" class="upload-input" placeholder="—" />
          </div>
          <div class="upload-field">
            <label>Протокол</label>
            <input v-model="uploadForm.protocol" class="upload-input" placeholder="—" />
          </div>
        </div>
        <div class="upload-field">
          <label>Заметки</label>
          <textarea v-model="uploadForm.notes" class="upload-input upload-textarea" rows="2" placeholder="—"></textarea>
        </div>
        <div class="upload-field">
          <label>Файл (.csv, .xlsx, .txt) *</label>
          <FileUpload
            ref="uploadFileRef"
            mode="basic"
            accept=".csv,.xlsx,.xls,.txt"
            :maxFileSize="104857600"
            :auto="false"
            chooseLabel="Выбрать файл"
            :customUpload="true"
            @uploader="doUpload"
            :disabled="uploading"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Отмена" severity="secondary" text @click="showUpload = false" />
        <Button label="Загрузить" icon="pi pi-upload" :loading="uploading" @click="uploadFileRef?.upload()" />
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
</style>
