<script setup>
/**
 * BatteryElectrochemEditor — per-battery file-attachment UI for
 * electrochemical measurement files (EIS, CV, GITT, etc.). Closes the
 * last 🟡 Vue parity gap (G2, Phase γ).
 *
 * Mounted one-per-battery in the AssemblyPage constructor section,
 * alongside the capacity card. Reads the cached file list via the
 * shared `useBackendCache` handle passed as a prop, so the parent
 * page controls load/invalidate lifecycle (consistent with the
 * capacity-panels pattern above it).
 *
 * The component owns only the local upload queue (`staged`) — files
 * the user has picked but not yet submitted. Each staged file gets an
 * optional per-file notes input. Clicking "Загрузить" walks the queue
 * sequentially, POSTing one entry per request (see MAX_FILE_BYTES for
 * why).
 *
 * Backend contract:
 *   - POST /api/batteries/battery_electrochem
 *     { battery_id, entries: [{file_name, file_content_base64, electrochem_notes}] }
 *     → inserts all, returns full list for that battery.
 *   - GET /api/batteries/battery_electrochem/:battery_id → array or null.
 *   - No DELETE endpoint (add-only, for now — entry in Dalia PR backlog).
 *
 * Download: file_link is `/uploads/electrochem/...`, served by
 * `express.static` in app.js:21 without auth (pre-existing Dalia
 * behavior — flagged separately in the Dalia PR backlog, not fixed
 * here).
 */
import { ref, computed, onBeforeUnmount } from 'vue'
import { useToast } from 'primevue/usetoast'
import { fileToBase64 } from '@/utils/fileToBase64'
import { errorMessageRu } from '@/utils/errorClassifier'
import api from '@/services/api'

// Per-file client-side cap. Express JSON body limit is 10 MB (app.js:19)
// and base64 encoding inflates payloads by ~1.34× — so 6 MB raw leaves
// a comfortable margin (6 × 1.34 ≈ 8 MB base64 + wrapper, well under
// 10 MB). We also POST one file per request so the batch size never
// compounds.
const MAX_FILE_BYTES = 6 * 1024 * 1024

const props = defineProps({
  batteryId: { type: Number, required: true },
  // useBackendCache instance — { cache, loading, errors, load, invalidate, ... }
  cache: { type: Object, required: true },
})

const toast = useToast()

// ── Cache-backed state (parent-owned) ──────────────────────────────
const files = computed(() => props.cache.cache.value[props.batteryId] || [])
const loading = computed(() => props.cache.loading.value[props.batteryId] || false)
const errorCode = computed(() => props.cache.errors.value[props.batteryId])
// 'empty' is the "loaded-successfully-with-no-files" verdict from
// useBackendCache.isEmpty — treat it like a no-error state, not a UI
// error. (The parent doesn't set isEmpty on this cache, so this case
// won't fire here, but it's cheap to guard for future moves.)
const errorMsg = computed(() => {
  if (!errorCode.value || errorCode.value === 'empty') return null
  return errorMessageRu(errorCode.value)
})

// ── Local upload queue (component-owned) ───────────────────────────
const staged = ref([])      // [{ file: File, notes: string }]
const uploading = ref(false)

function onPick(e) {
  const picked = Array.from(e.target.files || [])
  for (const f of picked) {
    if (f.size > MAX_FILE_BYTES) {
      toast.add({
        severity: 'warn',
        summary: 'Файл слишком большой',
        detail: `«${f.name}» больше 6 МБ — пропущен. Разделите файл или сожмите.`,
        life: 4500,
      })
      continue
    }
    staged.value.push({ file: f, notes: '' })
  }
  // Clear the input so re-picking the same file triggers @change again.
  e.target.value = ''
}

function removeStaged(i) {
  staged.value.splice(i, 1)
}

async function onUpload() {
  if (uploading.value || !staged.value.length) return
  uploading.value = true
  // Snapshot batteryId so the whole upload walk targets one battery
  // even if a theoretical prop swap happened mid-loop. Given the
  // parent's :key="ec-${id}" this card unmounts on removal rather than
  // prop-mutating, but the snapshot is a one-line footgun-removal.
  const bid = props.batteryId
  const total = staged.value.length
  // Track the exact items that failed so we can re-stage only those
  // (users retry the specific failing files, not re-pick everything).
  const failedItems = []

  try {
    // Sequential per-file POSTs. Keeps each JSON body under the 10 MB
    // Express cap even when the user stages multiple near-limit files,
    // and lets partial failures be surfaced (e.g. 3 of 5 uploaded).
    for (const s of staged.value) {
      try {
        const b64 = await fileToBase64(s.file)
        await api.post('/api/batteries/battery_electrochem', {
          battery_id: bid,
          entries: [{
            file_name: s.file.name,
            file_content_base64: b64,
            electrochem_notes: s.notes || null,
          }],
        })
      } catch (e) {
        console.error('[Electrochem] upload failed for', s.file.name, e)
        failedItems.push(s)
      }
    }

    // Refresh the cached list via the parent's cache handle. The POST
    // response already contains the updated list, but invalidate-then-
    // load keeps the cache as the single source of truth.
    props.cache.invalidate(bid)
    await props.cache.load(bid)

    const failed = failedItems.length
    if (failed === 0) {
      toast.add({
        severity: 'success',
        summary: 'Загружено',
        detail: `Файлов: ${total}`,
        life: 2500,
      })
      staged.value = []
    } else if (failed < total) {
      toast.add({
        severity: 'warn',
        summary: 'Частичная загрузка',
        detail: `Не удалось загрузить ${failed} из ${total} — оставлены в очереди для повторной попытки.`,
        life: 5000,
      })
      // Keep ONLY the failing rows so user retries the exact subset —
      // not the already-uploaded ones (which would create duplicates
      // since the backend has no unique constraint on file_name).
      staged.value = failedItems
    } else {
      toast.add({
        severity: 'error',
        summary: 'Ошибка загрузки',
        detail: 'Не удалось загрузить ни одного файла.',
        life: 5000,
      })
      // Keep the staged queue intact so user can retry without re-picking.
    }
  } finally {
    uploading.value = false
  }
}

// ── Formatters ─────────────────────────────────────────────────────
function formatDate(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

// Warn (don't block) when the card unmounts with unsent files — the
// user most likely didn't mean to discard them. Vue can't block
// unmount from a confirm() cleanly, so a toast is the honest UX.
onBeforeUnmount(() => {
  if (staged.value.length > 0) {
    toast.add({
      severity: 'warn',
      summary: 'Файлы не загружены',
      detail: `${staged.value.length} шт. в очереди — их нужно будет добавить снова.`,
      life: 3500,
    })
  }
})
</script>

<template>
  <section class="electrochem-card">
    <div class="ec-head">
      <span class="ec-title">Электрохимия · Аккумулятор #{{ batteryId }}</span>
      <span v-if="loading" class="ec-loading">
        <i class="pi pi-spin pi-spinner" style="font-size:11px"></i> загрузка…
      </span>
    </div>

    <!-- Existing uploaded files -->
    <div v-if="!loading && files.length > 0" class="ec-list">
      <div
        v-for="f in files"
        :key="f.battery_electrochem_id"
        class="ec-row"
      >
        <a
          :href="f.file_link"
          :download="f.file_name"
          target="_blank"
          rel="noopener noreferrer"
          class="ec-file-link"
          :title="`Скачать ${f.file_name}`"
        >
          <i class="pi pi-download"></i>
          <span class="ec-file-name">{{ f.file_name }}</span>
        </a>
        <span class="ec-uploaded-at">{{ formatDate(f.uploaded_at) }}</span>
        <div v-if="f.electrochem_notes" class="ec-notes">{{ f.electrochem_notes }}</div>
      </div>
    </div>

    <!-- Fetch error (auth/server/network — not "empty") -->
    <div v-else-if="!loading && errorMsg" class="ec-empty ec-empty--error">
      {{ errorMsg }}
    </div>

    <!-- Empty state -->
    <div v-else-if="!loading" class="ec-empty">Файлы не прикреплены</div>

    <!-- Staged upload queue -->
    <div v-if="staged.length > 0" class="ec-staged">
      <div
        v-for="(s, i) in staged"
        :key="i"
        class="ec-stage-row"
      >
        <span class="ec-file-name" :title="s.file.name">
          {{ s.file.name }}
          <span class="ec-file-size">({{ formatSize(s.file.size) }})</span>
        </span>
        <input
          type="text"
          v-model="s.notes"
          placeholder="Заметки (необязательно)"
          class="ec-notes-input"
          :disabled="uploading"
        >
        <button
          type="button"
          class="ec-remove"
          :disabled="uploading"
          @click="removeStaged(i)"
          title="Убрать из очереди"
        >✕</button>
      </div>
      <button
        type="button"
        class="ec-upload"
        :disabled="uploading || staged.length === 0"
        @click="onUpload"
      >
        <i class="pi pi-cloud-upload"></i>
        {{ uploading ? 'Загрузка…' : `Загрузить (${staged.length})` }}
      </button>
    </div>

    <!-- File picker -->
    <label class="ec-pick" :class="{ 'ec-pick--disabled': uploading }">
      <input
        type="file"
        multiple
        :disabled="uploading"
        @change="onPick"
        class="ec-pick-input"
      >
      <i class="pi pi-plus"></i>
      <span>Добавить файлы (до 7 МБ каждый)</span>
    </label>
  </section>
</template>

<style scoped>
.electrochem-card {
  border: 1px solid rgba(0, 50, 116, 0.12);
  border-radius: 10px;
  background: white;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ec-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.06);
}

.ec-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.50);
}

.ec-loading {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: rgba(0, 50, 116, 0.45);
}

.ec-empty {
  padding: 8px 2px;
  font-size: 13px;
  color: rgba(0, 50, 116, 0.45);
}

.ec-empty--error {
  color: rgba(200, 80, 70, 0.80);
}

.ec-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ec-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  padding: 6px 8px;
  background: rgba(0, 50, 116, 0.02);
  border-radius: 6px;
  font-size: 13px;
}

.ec-file-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #003274;
  text-decoration: none;
  font-weight: 500;
  min-width: 0;
}

.ec-file-link:hover {
  text-decoration: underline;
}

.ec-file-link .pi {
  font-size: 12px;
  opacity: 0.65;
  flex-shrink: 0;
}

.ec-file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.ec-uploaded-at {
  font-size: 11px;
  color: rgba(0, 50, 116, 0.5);
  white-space: nowrap;
}

.ec-notes {
  grid-column: 1 / -1;
  font-size: 12px;
  color: rgba(0, 50, 116, 0.65);
  padding: 2px 0 0 18px;
  font-style: italic;
}

.ec-staged {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px dashed rgba(0, 50, 116, 0.20);
  border-radius: 6px;
  background: rgba(212, 164, 65, 0.04);
}

.ec-stage-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, 1fr) 24px;
  gap: 8px;
  align-items: center;
}

.ec-file-size {
  font-size: 11px;
  color: rgba(0, 50, 116, 0.45);
  margin-left: 4px;
}

.ec-notes-input {
  height: 28px;
  padding: 3px 8px;
  border: 1px solid rgba(0, 50, 116, 0.18);
  border-radius: 5px;
  background: white;
  color: #003274;
  font: inherit;
  font-size: 12px;
}

.ec-notes-input:focus {
  outline: none;
  border-color: rgba(0, 50, 116, 0.5);
}

.ec-remove {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(200, 80, 70, 0.55);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}

.ec-remove:hover:not(:disabled) {
  background: rgba(200, 80, 70, 0.10);
  color: rgba(200, 80, 70, 0.9);
}

.ec-remove:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.ec-upload {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  align-self: flex-start;
  border: none;
  border-radius: 6px;
  background: #003274;
  color: white;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s;
}

.ec-upload:hover:not(:disabled) {
  background: rgba(0, 50, 116, 0.85);
}

.ec-upload:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ec-pick {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid rgba(0, 50, 116, 0.20);
  border-radius: 6px;
  background: rgba(0, 50, 116, 0.02);
  color: #003274;
  cursor: pointer;
  font-size: 13px;
  align-self: flex-start;
  transition: background 0.15s, border-color 0.15s;
}

.ec-pick:hover:not(.ec-pick--disabled) {
  background: rgba(0, 50, 116, 0.06);
  border-color: rgba(0, 50, 116, 0.4);
}

.ec-pick--disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ec-pick-input {
  display: none;
}

.ec-pick .pi {
  font-size: 13px;
}
</style>
