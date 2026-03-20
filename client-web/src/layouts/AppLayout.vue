<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import Toast from 'primevue/toast'

// ── Scroll-blur: show top blur overlay only when content is scrolled ──
const contentEl = ref(null)
const isScrolled = ref(false)
let onScroll = null

onMounted(() => {
  if (contentEl.value) {
    onScroll = () => { isScrolled.value = contentEl.value.scrollTop > 2 }
    contentEl.value.addEventListener('scroll', onScroll, { passive: true })
  }
  // Two separate artboards exported from the РЭНЕРА .ai file.
  // Pick one randomly — never combine them.
  const images = [
    "/assets/renera-pattern-1.webp",
    "/assets/renera-pattern-2.webp",
  ]
  const img = images[Math.floor(Math.random() * images.length)]

  // Random crop position: X in steps of 12.5% (8 positions across the wide image),
  // Y in steps of 25% (5 positions — shifts which row of elements is centred).
  const xSteps = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]
  const ySteps = [15, 30, 45, 60, 75]
  const x = xSteps[Math.floor(Math.random() * xSteps.length)]
  const y = ySteps[Math.floor(Math.random() * ySteps.length)]

  const root = document.documentElement
  root.style.setProperty('--pattern-img',   `url('${img}')`)
  root.style.setProperty('--pattern-pos-x', `${x}%`)
  root.style.setProperty('--pattern-pos-y', `${y}%`)
})

onUnmounted(() => {
  if (contentEl.value && onScroll) {
    contentEl.value.removeEventListener('scroll', onScroll)
  }
})
</script>

<template>
  <div class="app-layout">
    <AppSidebar />
    <div class="app-main">
      <Toast position="top-right" />
      <main ref="contentEl" class="app-content" :class="{ scrolled: isScrolled }">
        <!-- Scroll blur — fades in when content scrolls under top padding area -->
        <div class="scroll-blur-bar" :class="{ visible: isScrolled }"></div>
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ── Outer frame — exact corporate #003274, no overlays that shift the hue ── */
.app-layout {
  display: flex;
  flex-direction: row;
  min-height: 100vh;
  background: #003274;
  position: relative;
}

/* ── Main content area — Arc-style inset card, visible frame on all sides ── */
.app-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: calc(100vh - 16px); /* subtract top + bottom margin */
  margin: 8px 8px 8px 8px;    /* exposes #003274 frame on all 4 sides */
  border-radius: 14px;        /* all corners rounded — full inset card */
  background: linear-gradient(135deg, #D8E2EC 0%, #E8EDF5 50%, #F0F4F8 100%) fixed;
  overflow: hidden;            /* clips content to border-radius */
  position: relative;
}

/* РЭНЕРА pattern — position: fixed pins it to the viewport.
   Image and crop position are randomised on each page load via JS (onMounted).
   Fallback: pattern-1 centred at 50% 30% if JS hasn't run yet. */
.app-main::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image:   var(--pattern-img,   url('/assets/renera-pattern-1.webp'));
  background-position: var(--pattern-pos-x, 50%) var(--pattern-pos-y, 30%);
  background-size:    cover;
  background-repeat:  no-repeat;
  opacity: 0.19;
  pointer-events: none;
  z-index: 0;
}

.app-content {
  flex: 1;
  padding: 3rem;
  background: transparent;
  height: 100%;
  overflow-y: auto;      /* scroll container — enables sticky children */
  position: relative;
  z-index: 1;
}

/* ── Scroll blur bar — iOS-style top fade that appears on scroll ── */
.scroll-blur-bar {
  position: sticky;
  top: -3rem;            /* sit inside the top padding area */
  height: 3rem;          /* match app-content padding-top */
  max-width: 1200px;
  margin: -3rem auto 0;  /* centered, aligned with page content */
  z-index: 15;           /* below PageHeader (z:20), above content */
  pointer-events: none;

  backdrop-filter: blur(0px);
  -webkit-backdrop-filter: blur(0px);
  opacity: 0;
  transition: opacity 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease;
}

.scroll-blur-bar.visible {
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  opacity: 1;
}

/* ── PageHeader subtle shadow on scroll ── */
.app-content :deep(.page-header) {
  transition: box-shadow 0.4s ease;
}
.app-content.scrolled :deep(.page-header) {
  box-shadow:
    0 3px 12px rgba(0, 50, 116, 0.10),
    0 0 0 0.5px rgba(180, 210, 255, 0.35);
}
</style>
