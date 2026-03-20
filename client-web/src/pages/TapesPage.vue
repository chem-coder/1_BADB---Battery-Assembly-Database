<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import ContextMenu from 'primevue/contextmenu'
import PageHeader from '@/components/PageHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'

const router = useRouter()
const toast = useToast()

const tapes = ref([])
const loading = ref(false)
const selectedTape = ref(null)
const firstRow = ref(0)  // tracks paginator offset for global row numbers
const cm = ref(null)

const contextMenuItems = [
  {
    label: 'Открыть',
    icon: 'pi pi-folder-open',
    command: () => router.push(`/tapes/${selectedTape.value?.tape_id}`),
  },
  { separator: true },
  {
    label: 'Удалить',
    icon: 'pi pi-trash',
    class: 'cm-danger',
    command: () => confirmDelete(selectedTape.value),
  },
]

function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('ru-RU')
}

function onRowContextMenu(event) {
  selectedTape.value = event.data
  cm.value.show(event.originalEvent)
}

function openDotsMenu(event, tape) {
  selectedTape.value = tape
  cm.value.show(event)
}

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

async function confirmDelete(tape) {
  if (!tape) return
  if (!confirm(`Удалить ленту "${tape.name}"?`)) return
  try {
    await api.delete(`/api/tapes/${tape.tape_id}`)
    toast.add({ severity: 'success', summary: 'Удалено', life: 3000 })
    await loadTapes()
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось удалить', life: 3000 })
  }
}

onMounted(loadTapes)
</script>

<template>
  <div class="tapes-page">

    <PageHeader title="Подготовка лент" icon="pi pi-sliders-h" />

    <!-- Right-click / dots context menu -->
    <ContextMenu ref="cm" :model="contextMenuItems" />

    <div class="glass-card table-card">

      <!-- Toolbar inside card -->
      <div class="table-toolbar">
        <span class="table-section-label">Ленты</span>
        <Button
          label="Новая лента"
          icon="pi pi-plus"
          size="small"
          @click="router.push('/tapes/new')"
          class="btn-new"
        />
      </div>

      <DataTable
        :value="tapes"
        :loading="loading"
        sortMode="single"
        removableSort
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 100]"
        v-model:first="firstRow"
        stateStorage="session"
        stateKey="tapes-list-state"
        rowHover
        contextMenu
        v-model:contextMenuSelection="selectedTape"
        @rowContextmenu="onRowContextMenu"
        @rowClick="e => router.push(`/tapes/${e.data.tape_id}`)"
        class="tvel-table"
        style="cursor: pointer"
      >

        <!-- № global row number -->
        <Column header="№" style="width: 48px">
          <template #body="{ index }">
            <span class="row-num">{{ firstRow + index + 1 }}</span>
          </template>
        </Column>

        <!-- Название -->
        <Column field="name" header="Название" sortable>
          <template #body="{ data }">
            <strong>{{ data.name || '— без названия —' }}</strong>
          </template>
        </Column>

        <!-- Тип — colored badge -->
        <Column field="role" header="Тип" sortable style="width: 110px">
          <template #body="{ data }">
            <span
              v-if="data.role"
              :class="['type-badge', data.role === 'cathode' ? 'type-badge--cathode' : 'type-badge--anode']"
            >
              {{ data.role === 'cathode' ? 'Катод' : data.role === 'anode' ? 'Анод' : data.role }}
            </span>
            <span v-else class="text-muted">—</span>
          </template>
        </Column>

        <!-- Рецепт -->
        <Column field="recipe_name" header="Рецепт" sortable />

        <!-- Создана -->
        <Column field="created_at" header="Создана" sortable style="width: 110px">
          <template #body="{ data }">{{ formatDate(data.created_at) }}</template>
        </Column>

        <!-- Обновлена -->
        <Column field="updated_at" header="Обновлена" sortable style="width: 110px">
          <template #body="{ data }">{{ formatDate(data.updated_at) }}</template>
        </Column>

        <!-- Операторы — placeholder -->
        <Column header="Операторы" style="width: 110px">
          <template #body>
            <span class="text-muted">—</span>
          </template>
        </Column>

        <!-- Статус -->
        <Column field="status" header="Статус" style="width: 115px">
          <template #body="{ data }">
            <StatusBadge :status="data.status ?? 'draft'" />
          </template>
        </Column>

        <!-- Three-dots action menu -->
        <Column header="" style="width: 44px">
          <template #body="{ data }">
            <Button
              icon="pi pi-ellipsis-h"
              text
              rounded
              size="small"
              severity="secondary"
              @click.stop="openDotsMenu($event, data)"
              class="btn-dots"
              title="Действия"
            />
          </template>
        </Column>

      </DataTable>
    </div>
  </div>
</template>

<style scoped>
.tapes-page {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* glass-card wrapper */
.table-card {
  overflow: hidden;
  padding: 0;
}

/* ── Toolbar ── */
.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem 0.75rem;
  border-bottom: 1px solid rgba(180, 210, 255, 0.28);
}

.table-section-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 50, 116, 0.45);
}

.btn-new {
  background: #003274 !important;
  border-color: #003274 !important;
  color: #fff !important;
  font-size: 13px;
}
.btn-new:hover {
  background: #025EA1 !important;
  border-color: #025EA1 !important;
}

/* ── DataTable — transparent base ── */
.table-card :deep(.p-datatable-table-container),
.table-card :deep(.p-datatable) {
  background: transparent;
}

/* Header row */
.table-card :deep(.p-datatable-thead > tr > th) {
  background: rgba(0, 50, 116, 0.045);
  color: #003274;
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid rgba(180, 210, 255, 0.35);
  padding: 0.6rem 0.75rem;
}

/* Hide multiple-sort priority badge ("1") */
.table-card :deep(.p-sortable-column-badge) {
  display: none !important;
}

/* Body rows */
.table-card :deep(.p-datatable-tbody > tr) {
  background: transparent;
  border-bottom: 1px solid rgba(180, 210, 255, 0.18);
  transition: background 0.12s;
}
.table-card :deep(.p-datatable-tbody > tr:last-child) {
  border-bottom: none;
}
.table-card :deep(.p-datatable-tbody > tr:hover) {
  background: rgba(0, 50, 116, 0.04) !important;
}
.table-card :deep(.p-datatable-tbody > tr > td) {
  padding: 0.55rem 0.75rem;
}

/* ── Paginator ── */
.table-card :deep(.p-paginator) {
  background: transparent;
  border-top: 1px solid rgba(180, 210, 255, 0.25);
  padding: 0.5rem 0.75rem;
  font-size: 13px;
}

/* Active page button — subtle tint, same style as other UI selections */
.table-card :deep(.p-paginator-page.p-highlight),
.table-card :deep(.p-paginator .p-paginator-page[aria-current="page"]) {
  background: rgba(0, 50, 116, 0.10) !important;
  color: #003274 !important;
  border-color: rgba(0, 50, 116, 0.22) !important;
  border-radius: 6px;
  font-weight: 600;
}

/* Page size selector — smaller, less prominent */
.table-card :deep(.p-paginator .p-select),
.table-card :deep(.p-paginator .p-inputnumber) {
  font-size: 12px;
  opacity: 0.7;
  min-width: 3.5rem;
}
.table-card :deep(.p-paginator .p-select .p-select-label) {
  padding: 0.25rem 0.5rem;
  font-size: 12px;
}

/* ── Row number ── */
.row-num {
  font-size: 12px;
  color: rgba(0, 50, 116, 0.4);
  font-variant-numeric: tabular-nums;
}

/* ── Type badges ── */
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

/* ── Muted placeholder text ── */
.text-muted {
  color: rgba(0, 50, 116, 0.28);
  font-size: 13px;
}

/* ── Three-dots button — only visible on row hover ── */
.btn-dots {
  opacity: 0;
  transition: opacity 0.12s;
  color: rgba(0, 50, 116, 0.55) !important;
}
.table-card :deep(.p-datatable-tbody > tr:hover) .btn-dots {
  opacity: 1;
}
</style>
