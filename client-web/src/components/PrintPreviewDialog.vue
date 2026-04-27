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
 *   - same dismissable-mask + maximize idiom as the electrochem file
 *     preview (commit 352dc03)
 *
 * Footer toolbar lets the user trigger the embedded page's own
 * `window.print()` (so Dalia's print CSS still applies), or escape
 * to a real new tab as a fallback.
 *
 * v-model:visible from parent. Renders nothing when `url` is empty —
 * the iframe is inside `v-if` so closing actually unloads it (memory
 * + auth-token revalidation on next open).
 */
import { computed, ref } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'

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

const iframeRef = ref(null)

function onPrint() {
  // Trigger the print dialog from inside the iframe so Dalia's
  // `@media print` rules apply. Falls back to printing this window
  // (useless for the dialog frame but better than nothing) if the
  // iframe isn't yet ready.
  const win = iframeRef.value?.contentWindow
  try {
    if (win && typeof win.print === 'function') win.print()
    else window.print()
  } catch {
    // Cross-origin guard — same-origin in our setup, but defensive
    window.print()
  }
}

function onOpenNewTab() {
  if (props.url) window.open(props.url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <Dialog
    v-model:visible="visibleProxy"
    :header="title"
    :style="{ width: '94vw', maxWidth: '1200px', height: '92vh' }"
    :contentStyle="{ padding: '0', display: 'flex', flexDirection: 'column' }"
    modal
    maximizable
    dismissableMask
  >
    <div class="pp-shell">
      <iframe
        v-if="visible && url"
        ref="iframeRef"
        :src="url"
        class="pp-iframe"
        title="Печать"
      />
    </div>
    <template #footer>
      <div class="pp-footer">
        <Button
          icon="pi pi-print"
          label="Печать"
          severity="primary"
          size="small"
          @click="onPrint"
        />
        <Button
          icon="pi pi-external-link"
          label="Открыть в новой вкладке"
          severity="secondary"
          text
          size="small"
          @click="onOpenNewTab"
        />
        <span class="pp-spacer" />
        <Button
          label="Закрыть"
          severity="secondary"
          text
          size="small"
          @click="visibleProxy = false"
        />
      </div>
    </template>
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
.pp-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.pp-spacer {
  flex: 1;
}
</style>
