<script setup>
/**
 * TapesPage — "Подготовка лент"
 * Unified view: CrudTable (with constructor checkboxes) + TapeConstructor.
 *
 * The old TapeFormPage is replaced by the inline Constructor.
 * Table has a checkbox column "В конструктор" to add tapes to the Constructor zone.
 */
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import PageHeader from '@/components/PageHeader.vue'
import SaveIndicator from '@/components/SaveIndicator.vue'
import CrudTable from '@/components/CrudTable.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import TapeConstructor from '@/components/TapeConstructor.vue'
import Checkbox from 'primevue/checkbox'

const router = useRouter()
const toast = useToast()
const authStore = useAuthStore()
const crudTable = ref(null)
const constructorRef = ref(null)

// ── Data ───────────────────────────────────────────────────────────────
const tapes = ref([])
const loading = ref(false)

async function loadTapes() {
  loading.value = true
  try {
    const { data } = await api.get('/api/tapes')
    tapes.value = data
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить ленты', life: 3000 })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadTapes()
  loadRefData()
})

// ── Column config ──────────────────────────────────────────────────────
const columns = [
  { field: '_constructor', header: '🔧',         minWidth: '45px', width: '45px', sortable: false, filterable: false },
  { field: 'name',         header: 'Название',   minWidth: '100px' },
  { field: 'role',         header: 'Тип',        minWidth: '80px',  width: '110px' },
  { field: 'recipe_name',  header: 'Рецепт',     minWidth: '80px' },
  { field: 'created_at',   header: 'Создана',    minWidth: '80px',  width: '110px' },
  { field: 'updated_at',   header: 'Обновлена',  minWidth: '80px',  width: '110px' },
  { field: 'status',       header: 'Статус',     minWidth: '80px',  width: '115px' },
]

// ── Create new tape ──────────────────────────────────────────────────
async function createNewTape() {
  try {
    const payload = {
      name: `Новая лента ${new Date().toLocaleDateString('ru-RU')}`,
      created_by: String(authStore.user?.userId || ''),
    }
    const { data: created } = await api.post('/api/tapes', payload)
    await loadTapes()
    // Auto-add to constructor
    if (created.tape_id) {
      constructorIds.value.push(created.tape_id)
    }
    toast.add({ severity: 'success', summary: 'Создано', detail: `Лента #${created.tape_id}`, life: 2000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: e.response?.data?.error || 'Не удалось создать ленту', life: 3000 })
  }
}

// ── Save indicator (delete flow) ──────────────────────────────────────
const pendingDelete = ref([])
const saveState = ref('idle')
let saveTimer = null

function onDelete(items) {
  pendingDelete.value = items
  saveState.value = 'idle'
}

async function confirmSave() {
  try {
    // Handle delete flow
    if (pendingDelete.value.length) {
      for (const item of pendingDelete.value) {
        await api.delete(`/api/tapes/${item.tape_id}`)
      }
      pendingDelete.value = []
      crudTable.value?.clearSelection()
      await loadTapes()
    }
    // Handle constructor dirty saves
    if (constructorDirty.value && constructorRef.value) {
      await constructorRef.value.saveAll()
    }
    saveState.value = 'saved'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveState.value = 'idle' }, 2000)
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось сохранить', life: 3000 })
  }
}

function discardChanges() {
  if (pendingDelete.value.length) {
    pendingDelete.value = []
    crudTable.value?.clearSelection()
  }
  if (constructorDirty.value && constructorRef.value) {
    constructorRef.value.discardAll()
  }
  saveState.value = 'idle'
}

onUnmounted(() => clearTimeout(saveTimer))

// ── Constructor: selected tapes ───────────────────────────────────────
const constructorIds = ref([])
const constructorDirty = ref(false)

function toggleConstructor(tapeId) {
  const idx = constructorIds.value.indexOf(tapeId)
  if (idx >= 0) {
    constructorIds.value.splice(idx, 1)
  } else {
    constructorIds.value.push(tapeId)
  }
}

function isInConstructor(tapeId) {
  return constructorIds.value.includes(tapeId)
}

// ── Reference data (shared between all tape states in constructor) ────
// NOTE: plain reactive — NO inner ref() wrappers.
// Vue auto-unwraps refs inside reactive, so .value would silently break.
const refData = reactive({
  users: [],
  projects: [],
  recipes: [],
  atmospheres: [],
  dryMixingMethods: [],
  wetMixingMethods: [],
  foils: [],
  coatingMethods: [],
})

async function loadRefData() {
  try { refData.users = (await api.get('/api/users')).data } catch {}
  try { refData.projects = (await api.get('/api/projects')).data } catch {}
  try { refData.recipes = (await api.get('/api/recipes')).data } catch {}
  try { refData.atmospheres = (await api.get('/api/reference/drying-atmospheres')).data } catch {}
  try { refData.dryMixingMethods = (await api.get('/api/reference/dry-mixing-methods')).data } catch {}
  try { refData.wetMixingMethods = (await api.get('/api/reference/wet-mixing-methods')).data } catch {}
  try { refData.foils = (await api.get('/api/reference/foils')).data } catch {}
  try { refData.coatingMethods = (await api.get('/api/reference/coating-methods')).data } catch {}
}

// ── SaveIndicator visibility ─────────────────────────────────────────
// Show indicator for delete flow OR constructor dirty state
const indicatorVisible = ref(false)

function updateIndicator() {
  indicatorVisible.value = pendingDelete.value.length > 0 || saveState.value === 'saved' || constructorDirty.value
}

// ── Helpers ────────────────────────────────────────────────────────────
function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('ru-RU')
}
</script>

<template>
  <div class="tapes-page">

    <PageHeader title="Подготовка лент" icon="pi pi-bars">
      <template #actions>
        <SaveIndicator
          :visible="pendingDelete.length > 0 || constructorDirty || saveState === 'saved'"
          :saved="saveState === 'saved'"
          @save="confirmSave"
          @cancel="discardChanges"
        />
      </template>
    </PageHeader>

    <!-- ── Table (collapsible via max-height) ── -->
    <CrudTable
      ref="crudTable"
      :columns="columns"
      :data="tapes"
      :loading="loading"
      id-field="tape_id"
      table-name="Ленты"
      :show-rename="false"
      :export-end="true"
      show-add
      @add="createNewTape"
      @delete="onDelete"
    >
      <!-- Constructor checkbox column -->
      <template #col-_constructor="{ data }">
        <Checkbox
          :modelValue="isInConstructor(data.tape_id)"
          @update:modelValue="toggleConstructor(data.tape_id)"
          :binary="true"
          v-tooltip.right="'В конструктор'"
        />
      </template>

      <!-- Custom cell: Название (bold) -->
      <template #col-name="{ data }">
        <strong>{{ data.name || '— без названия —' }}</strong>
      </template>

      <!-- Custom cell: Тип (cathode/anode badge) -->
      <template #col-role="{ data }">
        <span v-if="data.role"
          :class="['type-badge', data.role === 'cathode' ? 'type-badge--cathode' : 'type-badge--anode']">
          {{ data.role === 'cathode' ? 'Катод' : data.role === 'anode' ? 'Анод' : data.role }}
        </span>
        <span v-else class="text-muted">—</span>
      </template>

      <!-- Custom cell: Создана -->
      <template #col-created_at="{ data }">{{ formatDate(data.created_at) }}</template>

      <!-- Custom cell: Обновлена -->
      <template #col-updated_at="{ data }">{{ formatDate(data.updated_at) }}</template>

      <!-- Custom cell: Статус (StatusBadge component) -->
      <template #col-status="{ data }">
        <StatusBadge :status="data.status ?? 'draft'" />
      </template>
    </CrudTable>

    <!-- ── Constructor zone ── -->
    <TapeConstructor
      ref="constructorRef"
      :selectedTapeIds="constructorIds"
      :tapeList="tapes"
      :refs="refData"
      :authStore="authStore"
      @dirty="constructorDirty = $event"
    />

  </div>
</template>

<style scoped>
.tapes-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.tapes-page :deep(.page-header) {
  margin-bottom: 3px !important;
}

/* ── Page-specific cell styles only ── */
.type-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
}
.type-badge--cathode {
  background: rgba(0, 50, 116, 0.10);
  color: #003274;
  border: 0.5px solid rgba(0, 50, 116, 0.18);
}
.type-badge--anode {
  background: rgba(82, 201, 166, 0.14);
  color: #1d7a5f;
  border: 0.5px solid rgba(82, 201, 166, 0.35);
}
.text-muted {
  color: rgba(0, 50, 116, 0.28);
  font-size: 13px;
}
</style>
