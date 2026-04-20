<script setup>
/**
 * CyclingStylePopover — per-session style overrides (color / line / marker).
 * Controlled by parent via `toggle(event)` exposed method — parent sets the
 * current session + current style, then calls `.toggle(event)` on the ref to
 * position the PrimeVue Popover at the click target.
 *
 * Emits `update(partial)` on every change (parent persists to localStorage).
 * Emits `reset()` when user clicks "По умолчанию" — parent clears the entry.
 */
import { ref, computed } from 'vue'
import Popover from 'primevue/popover'
import {
  COLOR_PRESETS,
  LINE_DASH_PRESETS,
  POINT_STYLE_OPTIONS,
} from '@/composables/useCyclingStyles'

const props = defineProps({
  session: { type: Object, default: null },       // { session_id, battery_id, ... }
  sessionLabel: { type: String, default: '' },    // e.g. "Акк. №5"
  defaultColor: { type: String, default: '#003274' },
  style: { type: Object, default: () => ({}) },   // current effective override
})

const emit = defineEmits(['update', 'reset'])

const popRef = ref(null)

function toggle(event) {
  popRef.value?.toggle(event)
}
defineExpose({ toggle })

const effectiveColor = computed(() => props.style.color || props.defaultColor)
const thicknessOptions = [1, 1.5, 2, 3, 4]

function isActiveColor(c) {
  const cur = (props.style.color || '').toLowerCase()
  return cur === c.toLowerCase()
}
function isActiveDash(value) {
  const cur = props.style.borderDash
  // null / undefined / [] all mean "solid"
  const isSolid = (arr) => !arr || (Array.isArray(arr) && arr.length === 0)
  if (isSolid(value)) return isSolid(cur)
  if (!Array.isArray(cur) || !Array.isArray(value)) return false
  if (cur.length !== value.length) return false
  return cur.every((n, i) => n === value[i])
}

function onColorPick(c) { emit('update', { color: c }) }
function onColorInput(e) { emit('update', { color: e.target.value }) }
function onThickness(t) { emit('update', { borderWidth: t }) }
function onDash(v) { emit('update', { borderDash: v }) }
function onPointStyle(v) { emit('update', { pointStyle: v }) }
function onPointRadius(e) {
  const n = Number(e.target.value)
  emit('update', { pointRadius: Number.isFinite(n) ? n : null })
}
function onReset() { emit('reset') }
</script>

<template>
  <Popover ref="popRef">
    <div class="style-popover">
      <div class="style-popover__head">
        <strong>Стиль:</strong>
        <span>{{ sessionLabel || (session ? `№${session.session_id}` : '—') }}</span>
      </div>

      <div class="style-row">
        <label class="style-label">Цвет</label>
        <div class="style-colors">
          <button
            v-for="c in COLOR_PRESETS"
            :key="c"
            class="style-color-swatch"
            :class="{ 'is-active': isActiveColor(c) }"
            :style="{ background: c }"
            :title="c"
            @click="onColorPick(c)"
          ></button>
          <input
            type="color"
            class="style-color-picker"
            :value="effectiveColor"
            @input="onColorInput"
            title="Свой цвет"
          />
        </div>
      </div>

      <div class="style-row">
        <label class="style-label">Толщина</label>
        <div class="style-seg">
          <button
            v-for="t in thicknessOptions"
            :key="t"
            class="style-seg-btn"
            :class="{ 'is-active': Number(style.borderWidth) === t }"
            @click="onThickness(t)"
          >{{ t }}</button>
        </div>
      </div>

      <div class="style-row">
        <label class="style-label">Линия</label>
        <div class="style-seg">
          <button
            v-for="p in LINE_DASH_PRESETS"
            :key="p.key"
            class="style-seg-btn style-seg-btn--dash"
            :class="{ 'is-active': isActiveDash(p.value) }"
            @click="onDash(p.value)"
            :title="p.key"
          >{{ p.label }}</button>
        </div>
      </div>

      <div class="style-row">
        <label class="style-label">Маркер</label>
        <div class="style-seg">
          <button
            v-for="p in POINT_STYLE_OPTIONS"
            :key="p.key"
            class="style-seg-btn style-seg-btn--marker"
            :class="{ 'is-active': style.pointStyle === p.value }"
            @click="onPointStyle(p.value)"
            :title="p.key"
          >{{ p.label }}</button>
        </div>
      </div>

      <div class="style-row">
        <label class="style-label">Размер точки
          <span class="style-radius-val">{{ style.pointRadius ?? 0 }}</span>
        </label>
        <input
          type="range"
          min="0"
          max="10"
          step="0.5"
          :value="style.pointRadius ?? 0"
          class="style-radius-slider"
          @input="onPointRadius"
        />
      </div>

      <div class="style-popover__foot">
        <button class="style-reset-btn" @click="onReset">По умолчанию</button>
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.style-popover {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 4px 2px;
  min-width: 260px;
}
.style-popover__head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.08);
  font-size: 13px;
  color: #1F2937;
}
.style-popover__head strong { color: #003274; }
.style-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.style-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 50, 116, 0.55);
  display: flex;
  align-items: center;
  gap: 8px;
}
.style-radius-val {
  display: inline-block;
  min-width: 22px;
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
  font-weight: 600;
  font-size: 11px;
  text-align: center;
  letter-spacing: 0;
  text-transform: none;
}
.style-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.style-color-swatch {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: transform 0.1s;
}
.style-color-swatch:hover { transform: scale(1.1); }
.style-color-swatch.is-active { border-color: #003274; box-shadow: 0 0 0 1px white inset; }
.style-color-picker {
  width: 24px;
  height: 24px;
  border: 1px solid rgba(0, 50, 116, 0.2);
  background: white;
  border-radius: 4px;
  padding: 0;
  cursor: pointer;
}
.style-seg {
  display: inline-flex;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 6px;
  overflow: hidden;
  background: white;
  flex-wrap: wrap;
}
.style-seg-btn {
  min-width: 28px;
  padding: 4px 8px;
  border: none;
  border-right: 1px solid rgba(0, 50, 116, 0.08);
  background: white;
  color: rgba(0, 50, 116, 0.7);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.1s;
}
.style-seg-btn:last-child { border-right: none; }
.style-seg-btn:hover:not(.is-active) { background: rgba(0, 50, 116, 0.05); }
.style-seg-btn.is-active {
  background: #003274;
  color: white;
  font-weight: 600;
}
.style-seg-btn--dash { font-size: 14px; line-height: 1; padding: 4px 10px; letter-spacing: -2px; }
.style-seg-btn--marker { font-size: 13px; line-height: 1; }
.style-radius-slider {
  width: 100%;
  accent-color: #003274;
  cursor: pointer;
}
.style-popover__foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 6px;
  border-top: 1px solid rgba(0, 50, 116, 0.08);
}
.style-reset-btn {
  padding: 4px 10px;
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: 6px;
  background: transparent;
  color: #E74C3C;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.style-reset-btn:hover { background: #E74C3C; color: white; }
</style>
