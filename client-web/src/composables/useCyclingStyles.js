import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'

const DEFAULT_STYLE = {
  color: null,
  borderWidth: null,
  borderDash: null,
  pointStyle: null,
  pointRadius: null,
}

const LINE_DASH_PRESETS = [
  { key: 'solid', label: '───', value: null },
  { key: 'dashed', label: '┄┄┄', value: [4, 2] },
  { key: 'dotted', label: '⋯⋯⋯', value: [1, 2] },
  { key: 'dashdot', label: '─·─', value: [6, 3, 1, 3] },
]

const POINT_STYLE_OPTIONS = [
  { key: 'circle',    label: '●', value: 'circle' },
  { key: 'rect',      label: '■', value: 'rect' },
  { key: 'triangle',  label: '▲', value: 'triangle' },
  { key: 'cross',     label: '✕', value: 'cross' },
  { key: 'rectRot',   label: '◆', value: 'rectRot' },
  { key: 'star',      label: '★', value: 'star' },
]

const COLOR_PRESETS = [
  '#003274', '#E67E22', '#52C9A6', '#8E44AD',
  '#D3A754', '#16A085', '#E74C3C', '#2C3E50',
  '#F39C12', '#9B59B6', '#1ABC9C', '#3498DB',
  '#E91E63', '#00BCD4', '#4CAF50', '#607D8B',
]

let singleton = null

function storageKey(userId) {
  return `badb-cycling-styles-${userId || 'anon'}`
}

function loadFromStorage(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object') ? parsed : {}
  } catch {
    return {}
  }
}

function saveToStorage(userId, map) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(map))
  } catch {
    /* quota / private mode — ignore */
  }
}

export function useCyclingStyles() {
  if (singleton) return singleton

  const auth = useAuthStore()
  const userId = auth?.user?.user_id ?? auth?.user?.userId ?? 'anon'
  const styles = ref(loadFromStorage(userId))

  watch(styles, (v) => saveToStorage(userId, v), { deep: true })

  function getStyle(sessionId) {
    return { ...DEFAULT_STYLE, ...(styles.value[sessionId] || {}) }
  }

  function setStyle(sessionId, partial) {
    const current = styles.value[sessionId] || {}
    styles.value = {
      ...styles.value,
      [sessionId]: { ...current, ...partial },
    }
  }

  function resetStyle(sessionId) {
    const next = { ...styles.value }
    delete next[sessionId]
    styles.value = next
  }

  singleton = {
    styles,
    getStyle,
    setStyle,
    resetStyle,
    COLOR_PRESETS,
    LINE_DASH_PRESETS,
    POINT_STYLE_OPTIONS,
  }
  return singleton
}

export { COLOR_PRESETS, LINE_DASH_PRESETS, POINT_STYLE_OPTIONS, DEFAULT_STYLE }
