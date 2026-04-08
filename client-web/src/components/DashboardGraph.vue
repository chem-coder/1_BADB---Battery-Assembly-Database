<script setup>
/**
 * DashboardGraph — Interactive entity relationship graph using Cytoscape.js.
 * Shows connections between projects, tapes, recipes, electrode batches, batteries.
 */
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import cytoscape from 'cytoscape'

const props = defineProps({
  graphData: { type: Object, default: () => ({ nodes: [], edges: [] }) },
})

const router = useRouter()
const containerRef = ref(null)
let cy = null
const tooltip = ref({ visible: false, x: 0, y: 0, label: '', type: '', details: '' })

const NODE_COLORS = {
  project: '#003274',
  tape: '#52C9A6',
  recipe: '#6CACE4',
  material: '#8A939D',
  electrode_batch: '#025EA1',
  battery: '#D3A754',
}

const NODE_SHAPES = {
  project: 'diamond',
  tape: 'round-rectangle',
  recipe: 'ellipse',
  material: 'ellipse',
  electrode_batch: 'hexagon',
  battery: 'star',
}

function initCytoscape() {
  if (!containerRef.value) return
  if (cy) cy.destroy()

  const elements = []

  for (const node of props.graphData.nodes) {
    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        label: node.label,
        type: node.type,
        ...node.data,
      },
    })
  }

  for (const edge of props.graphData.edges) {
    elements.push({
      group: 'edges',
      data: {
        source: edge.source,
        target: edge.target,
        type: edge.type,
      },
    })
  }

  cy = cytoscape({
    container: containerRef.value,
    elements,
    style: [
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'font-size': '10px',
          'font-family': 'Rosatom, system-ui, sans-serif',
          'text-wrap': 'ellipsis',
          'text-max-width': '80px',
          'text-valign': 'bottom',
          'text-margin-y': 4,
          'color': '#333',
          'width': 32,
          'height': 32,
          'border-width': 2,
          'border-color': '#fff',
        },
      },
      // Node type styles
      ...Object.entries(NODE_COLORS).map(([type, color]) => ({
        selector: `node[type="${type}"]`,
        style: {
          'background-color': color,
          'shape': NODE_SHAPES[type] || 'ellipse',
          'width': type === 'project' ? 44 : type === 'tape' ? 36 : 28,
          'height': type === 'project' ? 44 : type === 'tape' ? 36 : 28,
        },
      })),
      {
        selector: 'edge',
        style: {
          'width': 1.5,
          'line-color': 'rgba(0, 50, 116, 0.2)',
          'target-arrow-color': 'rgba(0, 50, 116, 0.3)',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 0.7,
        },
      },
      {
        selector: 'edge[type="contains"]',
        style: { 'line-color': 'rgba(0, 50, 116, 0.25)', 'width': 2 },
      },
      {
        selector: 'edge[type="uses_recipe"]',
        style: { 'line-color': 'rgba(108, 172, 228, 0.4)' },
      },
      {
        selector: 'edge[type="assembled_into"]',
        style: { 'line-color': 'rgba(211, 167, 84, 0.4)', 'width': 2 },
      },
      // Highlight state
      {
        selector: 'node.highlighted',
        style: {
          'border-width': 3,
          'border-color': '#003274',
          'overlay-color': '#003274',
          'overlay-padding': 4,
          'overlay-opacity': 0.1,
        },
      },
      {
        selector: 'node.dimmed',
        style: { 'opacity': 0.2 },
      },
      {
        selector: 'edge.dimmed',
        style: { 'opacity': 0.1 },
      },
    ],
    layout: {
      name: 'cose',
      animate: true,
      animationDuration: 800,
      nodeRepulsion: 8000,
      idealEdgeLength: 80,
      gravity: 0.5,
      padding: 30,
    },
    minZoom: 0.3,
    maxZoom: 3,
    wheelSensitivity: 0.3,
  })

  // ── Interactions ──
  cy.on('tap', 'node', (evt) => {
    const node = evt.target
    // Highlight this node and its neighbors
    cy.elements().removeClass('highlighted dimmed')
    const neighborhood = node.neighborhood().add(node)
    cy.elements().not(neighborhood).addClass('dimmed')
    neighborhood.addClass('highlighted')
  })

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      // Click on background — reset
      cy.elements().removeClass('highlighted dimmed')
      tooltip.value.visible = false
    }
  })

  cy.on('dbltap', 'node', (evt) => {
    const data = evt.target.data()
    const type = data.type
    const id = data.id.split('-')[1]
    if (type === 'project') router.push(`/reference/projects`)
    else if (type === 'tape') router.push('/tapes')
    else if (type === 'recipe') router.push('/reference/recipes')
    else if (type === 'battery') router.push('/assembly')
    else if (type === 'electrode_batch') router.push('/electrodes')
  })

  cy.on('mouseover', 'node', (evt) => {
    const node = evt.target
    const pos = node.renderedPosition()
    const data = node.data()
    tooltip.value = {
      visible: true,
      x: pos.x + 20,
      y: pos.y - 10,
      label: data.label,
      type: data.type,
      details: formatDetails(data),
    }
    containerRef.value.style.cursor = 'pointer'
  })

  cy.on('mouseout', 'node', () => {
    tooltip.value.visible = false
    if (containerRef.value) containerRef.value.style.cursor = 'default'
  })
}

function formatDetails(data) {
  const parts = []
  if (data.operator) parts.push(`Оператор: ${data.operator}`)
  if (data.status) parts.push(`Статус: ${data.status}`)
  if (data.role) parts.push(`Роль: ${data.role}`)
  if (data.electrodes) parts.push(`Электродов: ${data.electrodes}`)
  if (data.form_factor) parts.push(`Форм-фактор: ${data.form_factor}`)
  return parts.join(' | ')
}

const TYPE_LABELS = {
  project: 'Проект',
  tape: 'Лента',
  recipe: 'Рецепт',
  material: 'Материал',
  electrode_batch: 'Партия электродов',
  battery: 'Аккумулятор',
}

watch(() => props.graphData, () => {
  nextTick(() => initCytoscape())
}, { deep: true })

onMounted(() => {
  if (props.graphData.nodes.length > 0) {
    nextTick(() => initCytoscape())
  }
})

onUnmounted(() => {
  if (cy) cy.destroy()
})

function fitGraph() {
  if (cy) cy.fit(undefined, 30)
}

function resetHighlight() {
  if (cy) cy.elements().removeClass('highlighted dimmed')
}
</script>

<template>
  <div class="graph-wrapper">
    <div class="graph-toolbar">
      <button class="graph-btn" @click="fitGraph" title="Вписать в экран">
        <i class="pi pi-expand"></i>
      </button>
      <button class="graph-btn" @click="resetHighlight" title="Сбросить выделение">
        <i class="pi pi-replay"></i>
      </button>
      <div class="graph-legend">
        <span v-for="(color, type) in NODE_COLORS" :key="type" class="legend-item">
          <span class="legend-dot" :style="{ background: color }"></span>
          {{ TYPE_LABELS[type] || type }}
        </span>
      </div>
    </div>

    <div ref="containerRef" class="graph-container"></div>

    <!-- Tooltip -->
    <div v-if="tooltip.visible" class="graph-tooltip" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
      <div class="tooltip-type">{{ TYPE_LABELS[tooltip.type] || tooltip.type }}</div>
      <div class="tooltip-label">{{ tooltip.label }}</div>
      <div v-if="tooltip.details" class="tooltip-details">{{ tooltip.details }}</div>
    </div>

    <div v-if="!graphData.nodes.length" class="graph-empty">
      <i class="pi pi-sitemap" style="font-size: 2rem; color: #D1D7DE"></i>
      <p>Нет данных для графа</p>
    </div>
  </div>
</template>

<style scoped>
.graph-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.graph-toolbar {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.graph-btn {
  width: 32px;
  height: 32px;
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  color: #003274;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: background 0.15s;
}
.graph-btn:hover { background: rgba(255, 255, 255, 0.95); }

.graph-legend {
  display: flex;
  gap: 0.75rem;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 8px;
  font-size: 11px;
  color: #333;
}
.legend-item { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

.graph-container {
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.graph-tooltip {
  position: absolute;
  z-index: 20;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 8px;
  padding: 8px 12px;
  box-shadow: 0 4px 12px rgba(0, 50, 116, 0.12);
  pointer-events: none;
  max-width: 250px;
}
.tooltip-type { font-size: 10px; text-transform: uppercase; color: rgba(0, 50, 116, 0.5); font-weight: 700; letter-spacing: 0.05em; }
.tooltip-label { font-size: 13px; font-weight: 600; color: #003274; margin: 2px 0; }
.tooltip-details { font-size: 11px; color: #6B7280; }

.graph-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: #6B7280;
  font-size: 14px;
}
</style>
