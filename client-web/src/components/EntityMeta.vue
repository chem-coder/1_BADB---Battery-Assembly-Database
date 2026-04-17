<script setup>
defineProps({
  createdByName: { type: String, default: null },
  createdAt: { type: String, default: null },
  updatedByName: { type: String, default: null },
  updatedAt: { type: String, default: null },
})

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}
</script>

<template>
  <div class="entity-meta" v-if="createdByName || createdAt || updatedByName || updatedAt">
    <div v-if="createdByName || createdAt" class="entity-meta-line">
      <span class="entity-meta-label">Создано:</span>
      <span class="entity-meta-value">{{ createdByName || '—' }}, {{ formatDateTime(createdAt) }}</span>
    </div>
    <div v-if="updatedByName || updatedAt" class="entity-meta-line">
      <span class="entity-meta-label">Изменено:</span>
      <span class="entity-meta-value">{{ updatedByName || '—' }}, {{ formatDateTime(updatedAt) }}</span>
    </div>
  </div>
</template>

<style scoped>
.entity-meta {
  padding: 8px 16px;
  border-top: 1px solid rgba(0, 50, 116, 0.08);
  font-size: 12px;
  color: #6B7280;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.entity-meta-label {
  font-weight: 600;
  margin-right: 4px;
}
.entity-meta-value {
  color: #8A939D;
}
</style>
