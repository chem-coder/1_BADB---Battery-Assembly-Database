<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import api from '@/services/api'
import { useStatus } from '@/composables/useStatus'
import PageHeader from '@/components/PageHeader.vue'

const { statusMsg, statusError, showStatus } = useStatus()

const recipes = ref([])
const activeUsers = ref([])
const newName = ref('')
let cachedMaterials = null

// Form state
const formVisible = ref(false)
const mode = ref(null)
const currentId = ref(null)
const titleText = ref('')
const titleEditing = ref(false)
const titleInput = ref('')

const form = ref({
  created_by: '',
  variant_label: '',
  role: '',
  notes: '',
})

const recipeLines = ref([])
let lineCounter = 0

function makeEmptyLine() {
  return {
    _key: lineCounter++,
    recipe_role: '',
    material_id: '',
    slurry_percent: '',
    line_notes: '',
    filteredMaterials: [],
  }
}

function resetForm() {
  form.value = { created_by: '', variant_label: '', role: '', notes: '' }
  titleText.value = ''
  titleEditing.value = false
  titleInput.value = ''
  mode.value = null
  currentId.value = null
  recipeLines.value = []
  formVisible.value = false
}

// API
async function loadRecipes() {
  try {
    const { data } = await api.get('/api/recipes')
    recipes.value = data
  } catch {
    console.error('Не удалось загрузить рецептуры')
  }
}

async function loadUsers() {
  const { data } = await api.get('/api/users')
  activeUsers.value = data.filter(u => u.active)
}

async function fetchMaterials() {
  if (cachedMaterials) return cachedMaterials
  const { data } = await api.get('/api/materials')
  cachedMaterials = data
  return cachedMaterials
}

async function fetchRecipeLines(recipeId) {
  const { data } = await api.get(`/api/recipes/${recipeId}/lines`)
  return data
}

function filterMaterialsByRole(materials, recipeRole) {
  if (!recipeRole || recipeRole === 'other') return materials
  const roleMap = {
    cathode_active: 'cathode_active',
    anode_active: 'anode_active',
    binder: 'binder',
    additive: 'conductive_additive',
    solvent: 'solvent',
  }
  const materialRole = roleMap[recipeRole]
  if (!materialRole) return materials
  return materials.filter(m => m.role === materialRole)
}

async function updateLineFiltering(line) {
  const materials = await fetchMaterials()
  line.filteredMaterials = filterMaterialsByRole(materials, line.recipe_role)

  // Auto-set recipe role from active material selection
  if (line.recipe_role === 'cathode_active') form.value.role = 'cathode'
  if (line.recipe_role === 'anode_active') form.value.role = 'anode'
}

function addLine() {
  const line = makeEmptyLine()
  recipeLines.value.push(line)
}

function removeLine(index) {
  recipeLines.value.splice(index, 1)
}

// Validation
function validate() {
  const missing = []
  if (!form.value.created_by) missing.push('Кто добавил')
  if (!form.value.role) missing.push('Роль электрода')
  if (missing.length) {
    showStatus('Заполните обязательные поля: ' + missing.join(', '), true)
    return false
  }

  if (recipeLines.value.length === 0) {
    showStatus('Добавьте хотя бы один компонент', true)
    return false
  }

  for (const line of recipeLines.value) {
    if (!line.material_id) {
      showStatus('Выберите материал для каждого компонента', true)
      return false
    }
    if (line.recipe_role !== 'solvent') {
      const pct = Number(line.slurry_percent)
      if (line.slurry_percent === '' || isNaN(pct) || pct < 0 || pct > 100) {
        showStatus('Укажите корректный % (0–100) для каждого компонента', true)
        return false
      }
    }
  }

  // Duplicate name+variant check
  const variant = (form.value.variant_label || '').trim()
  const exists = recipes.value.some(r => {
    if (mode.value === 'edit' && r.tape_recipe_id === currentId.value) return false
    return r.name === titleText.value && (r.variant_label || '') === variant
  })
  if (exists) {
    showStatus('Рецепт с таким названием и версией уже существует', true)
    return false
  }

  return true
}

async function saveRecipe() {
  if (!mode.value) return
  if (!validate()) return

  const lines = recipeLines.value.map(l => ({
    material_id: Number(l.material_id),
    recipe_role: l.recipe_role,
    slurry_percent: l.slurry_percent === '' ? null : Number(l.slurry_percent),
    line_notes: l.line_notes || null,
  }))

  const payload = {
    name: titleText.value,
    role: form.value.role,
    variant_label: form.value.variant_label || null,
    notes: form.value.notes || null,
    created_by: Number(form.value.created_by),
    lines,
  }

  try {
    if (mode.value === 'create') {
      await api.post('/api/recipes', payload)
      showStatus('Рецепт сохранён')
    } else {
      await api.put(`/api/recipes/${currentId.value}`, payload)
      showStatus('Изменения сохранены')
    }
    resetForm()
    loadRecipes()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка сохранения', true)
  }
}

async function deleteRecipe(r) {
  if (!confirm(`Удалить рецепт "${r.name}"?`)) return
  try {
    await api.delete(`/api/recipes/${r.tape_recipe_id}`)
    showStatus('Рецепт удалён')
    loadRecipes()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка удаления', true)
  }
}

// Actions
async function onAddEnter() {
  if (formVisible.value) return
  const name = newName.value.trim()
  if (!name) return

  mode.value = 'create'
  currentId.value = null
  titleText.value = name
  formVisible.value = true
  newName.value = ''

  cachedMaterials = null
  recipeLines.value = []
  addLine()
}

async function startEdit(r) {
  mode.value = 'edit'
  currentId.value = r.tape_recipe_id
  titleText.value = r.name

  form.value = {
    created_by: r.created_by || '',
    variant_label: r.variant_label || '',
    role: r.role || '',
    notes: r.notes || '',
  }

  formVisible.value = true
  cachedMaterials = null
  loadUsers()

  const lines = await fetchRecipeLines(r.tape_recipe_id)
  await loadLinesIntoForm(lines)
}

async function duplicateRecipeUI(r) {
  mode.value = 'create'
  currentId.value = null
  titleText.value = r.name + ' (копия)'

  form.value = {
    created_by: '',
    variant_label: r.variant_label || '',
    role: r.role || '',
    notes: r.notes || '',
  }

  formVisible.value = true
  cachedMaterials = null
  loadUsers()

  const lines = await fetchRecipeLines(r.tape_recipe_id)
  await loadLinesIntoForm(lines)
}

async function loadLinesIntoForm(lines) {
  const materials = await fetchMaterials()
  recipeLines.value = lines.map(l => ({
    _key: lineCounter++,
    recipe_role: l.recipe_role || '',
    material_id: l.material_id || '',
    slurry_percent: l.slurry_percent ?? '',
    line_notes: l.line_notes || '',
    filteredMaterials: filterMaterialsByRole(materials, l.recipe_role),
  }))
}

// Editable title
function startTitleEdit() {
  titleInput.value = titleText.value
  titleEditing.value = true
}

function finishTitleEdit() {
  const val = titleInput.value.trim()
  if (val) titleText.value = val
  titleEditing.value = false
}

function roleLabel(role) {
  return role === 'cathode' ? 'катод' : role === 'anode' ? 'анод' : role
}

// Invalidate material cache on window refocus
function onWindowFocus() { cachedMaterials = null }
onMounted(() => {
  window.addEventListener('focus', onWindowFocus)
  loadRecipes(); loadUsers()
})
onUnmounted(() => {
  window.removeEventListener('focus', onWindowFocus)
})
</script>

<template>
  <div class="recipes-page">
    <PageHeader title="Рецептуры" icon="pi pi-file-edit" />

    <input
      v-model="newName"
      class="add-input"
      :disabled="formVisible"
      placeholder="+ Добавить рецепт"
      autocomplete="off"
      @keydown.enter="onAddEnter"
    />

    <!-- Form -->
    <form v-if="formVisible" autocomplete="off" @submit.prevent="saveRecipe">
      <fieldset>
        <legend>Метаданные</legend>
        <label>Кто добавил</label>
        <select
          v-model="form.created_by"
          :class="{ 'required-missing': !form.created_by && mode }"
          @focus="loadUsers"
        >
          <option value="">— выбрать пользователя —</option>
          <option v-for="u in activeUsers" :key="u.user_id" :value="u.user_id">{{ u.name }}</option>
        </select>
        <RouterLink to="/reference/users" target="_blank" class="ref-link">Управление пользователями</RouterLink>
      </fieldset>

      <fieldset>
        <legend>Описание рецепта</legend>

        <input
          v-if="titleEditing"
          v-model="titleInput"
          @blur="finishTitleEdit"
          @keydown.enter.prevent="finishTitleEdit"
        />
        <h2 v-else style="cursor: pointer" @click="startTitleEdit">{{ titleText }}</h2>

        <label>Вариант/версия</label>
        <input v-model="form.variant_label" type="text" placeholder="A / B / low binder / v2" />

        <label>Роль электрода</label>
        <select
          v-model="form.role"
          :class="{ 'required-missing': !form.role && mode }"
        >
          <option value="">— выбрать —</option>
          <option value="cathode">катод</option>
          <option value="anode">анод</option>
        </select>

        <label>Комментарии</label>
        <textarea v-model="form.notes" rows="3" placeholder="Кратко: что это за рецепт и чем отличается"></textarea>
      </fieldset>

      <fieldset>
        <legend>Состав рецепта</legend>
        <div style="overflow-x: auto">
          <table class="recipe-table">
            <thead>
              <tr>
                <th>Функциональная роль</th>
                <th>Материал</th>
                <th>% в пасте</th>
                <th>Заметки</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, idx) in recipeLines" :key="line._key" class="recipe-line-row">
                <td>
                  <select v-model="line.recipe_role" @change="updateLineFiltering(line)">
                    <option value="">— выбрать —</option>
                    <option value="cathode_active">катодный активный материал</option>
                    <option value="anode_active">анодный активный материал</option>
                    <option value="binder">Связующее</option>
                    <option value="additive">Добавка</option>
                    <option value="solvent">Растворитель</option>
                  </select>
                </td>
                <td>
                  <select v-model="line.material_id">
                    <option value="">— выбрать —</option>
                    <option
                      v-for="m in line.filteredMaterials"
                      :key="m.material_id"
                      :value="m.material_id"
                    >{{ m.name }}</option>
                  </select>
                </td>
                <td>
                  <input v-model="line.slurry_percent" type="number" step="0.01" min="0" max="100" />
                </td>
                <td>
                  <input v-model="line.line_notes" type="text" placeholder="Комментарий" />
                </td>
                <td>
                  <button type="button" class="btn-icon btn-icon--danger" @click="removeLine(idx)"><i class="pi pi-trash"></i></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button type="button" @click="addLine">+ Добавить компонент</button>
        <RouterLink to="/reference/materials" target="_blank" class="ref-link">Управление материалами</RouterLink>
      </fieldset>

      <button type="submit">Сохранить запись</button>
      <button type="button" @click="resetForm">Выйти</button>
    </form>

    <div
      v-if="statusMsg"
      class="status-feedback"
      :style="{ color: statusError ? '#b00020' : 'darkcyan' }"
    >
      {{ statusMsg }}
    </div>

    <!-- List -->
    <ul class="items-list">
      <li v-for="r in recipes" :key="r.tape_recipe_id" class="item-row">
        <div class="item-info">
          <span style="display: inline-block; width: 14vw">{{ r.name }}</span>
          <span style="display: inline-block; width: 7vw">{{ roleLabel(r.role) }}</span>
          <span v-if="r.active_percent != null" style="display: inline-block; width: 4vw">{{ r.active_percent }}%</span>
          <span v-else style="display: inline-block; width: 4vw"></span>
          <span style="display: inline-block; width: 10vw">{{ r.active_material_name || '' }}</span>
          <span style="display: inline-block; width: 20vw">{{ r.variant_label || '' }}</span>
        </div>
        <div class="actions">
          <button class="btn-icon" title="Редактировать" @click="startEdit(r)"><i class="pi pi-pencil"></i></button>
          <button class="btn-icon" title="Дублировать" @click="duplicateRecipeUI(r)"><i class="pi pi-copy"></i></button>
          <button class="btn-icon btn-icon--danger" title="Удалить" @click="deleteRecipe(r)"><i class="pi pi-trash"></i></button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.recipes-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.recipes-page :deep(.page-header) { margin-bottom: 3px !important; }

/* ── Add input ── */
.add-input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #D1D7DE;
  border-radius: 6px;
  font-size: 13px;
  max-width: 360px;
}
.add-input:focus {
  border-color: #003274;
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 50, 116, 0.12);
}
.add-input:disabled { opacity: 0.5; }

/* ── Form ── */
form {
  background: #fff;
  border: 1px solid rgba(0, 50, 116, 0.1);
  border-radius: 10px;
  padding: 1.25rem;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}
fieldset {
  border: none;
  padding: 0;
  margin: 0 0 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
legend {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
  margin-bottom: 0.5rem;
}
label {
  font-size: 13px;
  font-weight: 600;
  color: #4B5563;
  margin-top: 0.25rem;
}
select, input[type="text"], input[type="number"], textarea {
  padding: 0.4rem 0.5rem;
  border: 1px solid #D1D7DE;
  border-radius: 6px;
  font-size: 13px;
  max-width: 360px;
}
select:focus, input:focus, textarea:focus {
  border-color: #003274;
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 50, 116, 0.12);
}
textarea { max-width: 500px; }
h2 { font-size: 18px; font-weight: 700; color: #003274; margin: 0.25rem 0; }
.required-missing { border-color: #D3A754 !important; }
.ref-link { font-size: 12px; color: #6B7280; margin-top: 0.25rem; }

/* ── Form buttons ── */
button[type="submit"] {
  padding: 0.5rem 1.2rem;
  background: #003274;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  margin-right: 0.5rem;
}
button[type="submit"]:hover { background: #002050; }
button[type="button"] {
  padding: 0.4rem 0.8rem;
  background: transparent;
  color: #003274;
  border: 1px solid #D1D7DE;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}
button[type="button"]:hover { background: rgba(0, 50, 116, 0.04); }

/* ── Recipe lines table ── */
.recipe-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 800px;
}
.recipe-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #4B5563;
  padding: 0.3rem 0.4rem;
  border-bottom: 1px solid #D1D7DE;
}
.recipe-table td {
  padding: 0.3rem 0.4rem;
  vertical-align: middle;
}
.recipe-table select,
.recipe-table input {
  width: 100%;
  max-width: none;
  padding: 0.35rem 0.4rem;
  border: 1px solid #D1D7DE;
  border-radius: 6px;
  font-size: 13px;
}
.recipe-table th:nth-child(1),
.recipe-table td:nth-child(1) { width: 180px; }
.recipe-table th:nth-child(2),
.recipe-table td:nth-child(2) { width: 260px; }

/* ── Status ── */
.status-feedback { font-size: 13px; padding: 0.4rem 0; }

/* ── Items list ── */
.items-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid rgba(0, 50, 116, 0.06);
  border-radius: 4px;
  transition: background 0.12s;
}
.item-row:hover { background: rgba(0, 50, 116, 0.03); }
.item-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 13px;
  color: #003274;
}
.actions {
  display: flex;
  gap: 0.15rem;
}

/* ── Icon buttons ── */
.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  color: #6B7280;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 13px;
  transition: background 0.12s, color 0.12s;
}
.btn-icon:hover { background: rgba(0, 50, 116, 0.06); color: #003274; }
.btn-icon--danger:hover { color: #b00020; }
</style>
