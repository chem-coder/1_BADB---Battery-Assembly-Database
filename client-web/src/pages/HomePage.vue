<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import PageHeader from '@/components/PageHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'

const router = useRouter()

const tapes = ref([])
const electrodes = ref([])
const assemblies = ref([])
const projects = ref([])
const errors = ref({ tapes: false, electrodes: false, assembly: false, projects: false })

const kpis = computed(() => [
  {
    key: 'tapes',
    label: 'Ленты',
    icon: 'pi pi-sliders-h',
    route: '/tapes',
    total: errors.value.tapes ? '—' : tapes.value.length,
    lines: errors.value.tapes ? [] : [
      `В работе: ${tapes.value.filter(t => t.status === 'processing').length}`,
      `Черновик: ${tapes.value.filter(t => !t.status || t.status === 'draft').length}`,
    ],
  },
  {
    key: 'electrodes',
    label: 'Электроды',
    icon: 'pi pi-stop-circle',
    route: '/electrodes',
    total: errors.value.electrodes ? '—' : electrodes.value.length,
    lines: errors.value.electrodes ? [] : [
      `В работе: ${electrodes.value.filter(e => e.status === 'processing').length}`,
      `Черновик: ${electrodes.value.filter(e => !e.status || e.status === 'draft').length}`,
    ],
  },
  {
    key: 'assembly',
    label: 'Сборки',
    icon: 'pi pi-box',
    route: '/assembly',
    total: errors.value.assembly ? '—' : assemblies.value.length,
    lines: errors.value.assembly ? [] : [
      `В работе: ${assemblies.value.filter(a => a.status === 'processing').length}`,
      `Черновик: ${assemblies.value.filter(a => !a.status || a.status === 'draft').length}`,
    ],
  },
  {
    key: 'projects',
    label: 'Проекты',
    icon: 'pi pi-folder',
    route: '/reference/projects',
    total: errors.value.projects ? '—' : projects.value.length,
    lines: errors.value.projects ? [] : [
      `Всего: ${projects.value.length}`,
    ],
  },
])

const recentTapes = computed(() =>
  [...tapes.value].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)
)
const recentElectrodes = computed(() =>
  [...electrodes.value].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)
)
const recentAssemblies = computed(() =>
  [...assemblies.value].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)
)

onMounted(async () => {
  const [tapesRes, electrodesRes, assemblyRes, projectsRes] = await Promise.allSettled([
    api.get('/api/tapes'),
    api.get('/api/electrodes'),
    api.get('/api/assembly'),
    api.get('/api/projects'),
  ])
  if (tapesRes.status === 'fulfilled') tapes.value = tapesRes.value.data
  else errors.value.tapes = true
  if (electrodesRes.status === 'fulfilled') electrodes.value = electrodesRes.value.data
  else errors.value.electrodes = true
  if (assemblyRes.status === 'fulfilled') assemblies.value = assemblyRes.value.data
  else errors.value.assembly = true
  if (projectsRes.status === 'fulfilled') projects.value = projectsRes.value.data
  else errors.value.projects = true
})
</script>

<template>
  <div class="home-page">
    <div class="glass-card header-card">
      <PageHeader title="Главная" />
    </div>

    <!-- KPI cards -->
    <div class="kpi-grid">
      <div
        v-for="kpi in kpis"
        :key="kpi.key"
        class="glass-card kpi-card"
        @click="router.push(kpi.route)"
      >
        <div class="kpi-label">
          <i :class="kpi.icon" class="kpi-icon"></i>
          {{ kpi.label }}
        </div>
        <div class="kpi-number">{{ kpi.total }}</div>
        <div v-for="(line, i) in kpi.lines" :key="i" class="kpi-detail">{{ line }}</div>
      </div>
    </div>

    <!-- Recent records -->
    <div class="recent-grid">
      <!-- Последние ленты -->
      <div class="glass-card recent-card">
        <div class="recent-card-title">Последние ленты</div>
        <p v-if="!recentTapes.length && !errors.tapes" class="empty-state">Нет записей</p>
        <p v-else-if="errors.tapes" class="empty-state">Не удалось загрузить</p>
        <DataTable
          v-else
          :value="recentTapes"
          rowHover
          @rowClick="e => router.push(`/tapes/${e.data.tape_id}`)"
          class="recent-table"
          style="cursor: pointer"
        >
          <Column field="name" header="Название">
            <template #body="{ data }">{{ data.name || '— без названия —' }}</template>
          </Column>
          <Column field="status" header="Статус" style="width: 120px">
            <template #body="{ data }"><StatusBadge :status="data.status ?? 'draft'" /></template>
          </Column>
        </DataTable>
      </div>

      <!-- Последние электроды -->
      <div class="glass-card recent-card">
        <div class="recent-card-title">Последние электроды</div>
        <p v-if="!recentElectrodes.length && !errors.electrodes" class="empty-state">Нет записей</p>
        <p v-else-if="errors.electrodes" class="empty-state">Не удалось загрузить</p>
        <DataTable
          v-else
          :value="recentElectrodes"
          rowHover
          @rowClick="e => router.push(`/electrodes/${e.data.cut_batch_id}`)"
          class="recent-table"
          style="cursor: pointer"
        >
          <Column field="batch_label" header="Название">
            <template #body="{ data }">{{ data.batch_label || '— без названия —' }}</template>
          </Column>
          <Column field="status" header="Статус" style="width: 120px">
            <template #body="{ data }"><StatusBadge :status="data.status ?? 'draft'" /></template>
          </Column>
        </DataTable>
      </div>

      <!-- Последние сборки -->
      <div class="glass-card recent-card">
        <div class="recent-card-title">Последние сборки</div>
        <p v-if="!recentAssemblies.length && !errors.assembly" class="empty-state">Нет записей</p>
        <p v-else-if="errors.assembly" class="empty-state">Не удалось загрузить</p>
        <DataTable
          v-else
          :value="recentAssemblies"
          rowHover
          @rowClick="e => router.push(`/assembly/${e.data.battery_id}`)"
          class="recent-table"
          style="cursor: pointer"
        >
          <Column field="battery_label" header="Название">
            <template #body="{ data }">{{ data.battery_label || '— без названия —' }}</template>
          </Column>
          <Column field="status" header="Статус" style="width: 120px">
            <template #body="{ data }"><StatusBadge :status="data.status ?? 'draft'" /></template>
          </Column>
        </DataTable>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.header-card { padding: 1.25rem 1.5rem 1rem; }

/* KPI grid */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.kpi-card {
  padding: 1.25rem;
  cursor: pointer;
}

.kpi-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
}

.kpi-icon {
  font-size: 13px;
}

.kpi-number {
  font-size: 28px;
  font-weight: 700;
  color: #003274;
  margin: 6px 0 4px;
}

.kpi-detail {
  font-size: 12px;
  color: #6B7280;
}

/* Recent records grid */
.recent-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.recent-card {
  padding: 0;
  overflow: hidden;
}

.recent-card-title {
  padding: 0.85rem 1.25rem 0.6rem;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
  border-bottom: 1px solid rgba(180, 210, 255, 0.25);
}

.empty-state {
  text-align: center;
  padding: 2rem 1rem;
  color: #6B7280;
  font-size: 13px;
}

/* DataTable inside glass-card — transparent background */
.recent-card :deep(.p-datatable-table-container),
.recent-card :deep(.p-datatable) {
  background: transparent;
}

.recent-card :deep(.p-datatable-thead > tr > th) {
  background: rgba(0, 50, 116, 0.055);
  color: #003274;
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid rgba(180, 210, 255, 0.35);
}

.recent-card :deep(.p-datatable-tbody > tr) {
  background: transparent;
  border-bottom: 1px solid rgba(180, 210, 255, 0.18);
}

.recent-card :deep(.p-datatable-tbody > tr:last-child) {
  border-bottom: none;
}

.recent-card :deep(.p-datatable-tbody > tr:hover) {
  background: rgba(0, 50, 116, 0.04) !important;
}
</style>
