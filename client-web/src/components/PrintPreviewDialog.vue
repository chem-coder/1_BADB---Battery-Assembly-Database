<script setup>
/**
 * PrintPreviewDialog — modal overlay around an iframe that loads
 * Dalia's `/workflow/*-print.html` pages.
 *
 * Why an in-app overlay instead of `window.open(_blank)`:
 *   - the user keeps context: the underlying constructor / table is
 *     visible behind the dimmed backdrop, no «изолированной системы»
 *     feeling
 *   - no popup blocker / tab-clutter
 *
 * No print/escape-tab buttons in the footer — Dalia's report page
 * already renders its own «Печать» / «Сохранить как PDF» controls
 * inside the iframe, and duplicating them in the wrapper just
 * confused the user (commit 80b365d feedback). No `maximizable`
 * either; the dialog already takes ~94 vw × 92 vh which is enough
 * for the print preview.
 *
 * v-model:visible from parent. Iframe `v-if` unloads on close so
 * memory + auth-token revalidation reset cleanly on the next open.
 */
import { computed } from 'vue'
import Dialog from 'primevue/dialog'

const props = defineProps({
  visible: { type: Boolean, default: false },
  url:     { type: String,  default: '' },
  title:   { type: String,  default: 'Предпросмотр' },
})
const emit = defineEmits(['update:visible'])

const visibleProxy = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
})
</script>

<template>
  <Dialog
    v-model:visible="visibleProxy"
    :header="title"
    :style="{ width: '94vw', maxWidth: '1200px', height: '92vh' }"
    :contentStyle="{ padding: '0', display: 'flex', flexDirection: 'column' }"
    modal
    dismissableMask
  >
    <div class="pp-shell">
      <iframe
        v-if="visible && url"
        :src="url"
        class="pp-iframe"
        title="Печать"
      />
    </div>
  </Dialog>
</template>

<style scoped>
.pp-shell {
  flex: 1;
  display: flex;
  background: #fff;
  min-height: 0;
}
.pp-iframe {
  flex: 1;
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}
</style>
