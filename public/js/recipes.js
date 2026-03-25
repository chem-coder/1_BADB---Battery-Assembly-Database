const addInput = document.getElementById('recipe-name');
const nameInput = document.getElementById('recipe-name-input');
const form = document.forms['recipe-form'];
const title = form.querySelector('h2');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const recipesList = document.getElementById('recipesList');
const createdBySelect = document.getElementById('recipe-created-by');
const addRecipeLine = document.getElementById('add-recipe-line');

let mode = null;       // 'create' | 'edit'
let currentId = null;
let cachedMaterials = null;
let recipeLines = [];
let initialFormState = null;

function showForm() {
  form.hidden = false;
  addInput.disabled = true;
}

function hideForm() {
  form.hidden = true;
  addInput.disabled = false;
}

function captureRecipeLinesState() {
  return Array.from(document.querySelectorAll('.recipe-line-row')).map(row => ({
    recipe_role: row.querySelector('[data-field="recipe_role"]')?.value || '',
    material_id: row.querySelector('[data-field="material_id"]')?.value || '',
    slurry_percent: row.querySelector('[data-field="slurry_percent"]')?.value || '',
    line_notes: row.querySelector('[data-field="line_notes"]')?.value || ''
  }));
}

function captureFormState() {
  return JSON.stringify({
    mode,
    title: title.textContent,
    nameInput: nameInput.value,
    created_by: createdBySelect.value,
    role: form.elements.role.value,
    variant_label: form.elements.variant_label.value,
    notes: form.elements.notes.value,
    lines: captureRecipeLinesState()
  });
}

function markFormPristine() {
  initialFormState = captureFormState();
}

function hasUnsavedChanges() {
  if (!mode) return false;
  return captureFormState() !== initialFormState;
}

function resetForm() {
  form.reset();
  
  title.textContent = '';
  title.hidden = false;
  nameInput.hidden = true;
  
  addInput.value = '';
  addInput.blur();
  
  mode = null;
  currentId = null;
  initialFormState = null;
  
  hideForm();
  clearRecipeLines();
  //        appendRecipeLineRow(0); // keep composition ready for next create
}

function formDataToObject(form) {
  return Object.fromEntries(new FormData(form));
}


// -------- API helpers --------

async function fetchAllRecipes() {
  const res = await fetch('/api/recipes');
  return res.json();
}

async function fetchMaterials() {
  if (cachedMaterials) return cachedMaterials;
  
  const res = await fetch('/api/materials');
  cachedMaterials = await res.json();
  return cachedMaterials;
}

async function loadRecipes() {
  const recipes = await fetchAllRecipes();
  renderRecipes(recipes);
}

async function loadUsers() {
  const res = await fetch('/api/users');
  const users = await res.json();
  
  createdBySelect.innerHTML =
  '<option value="">— выбрать пользователя —</option>';
  
  users
  .filter(u => u.active)
  .forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.user_id;
    opt.textContent = u.name;
    createdBySelect.appendChild(opt);
  });
}

async function createRecipe(data) {
  const res = await fetch('/api/recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Ошибка сохранения рецепта');
  }
  
  return res.json();
}

// This is where things start to get different

async function updateRecipe(id, data) {
  const res = await fetch(`/api/recipes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка обновления');
  }
  
  return res.json();
}

async function deleteRecipe(id) {
  const res = await fetch(`/api/recipes/${id}`, {
    method: 'DELETE'
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Ошибка удаления рецепта');
  }
}

async function duplicateRecipe(id, createdBy) {
  const res = await fetch(`/api/recipes/${id}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ created_by: createdBy })
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Ошибка дублирования рецепта');
  }
  
  return res.json();
}


async function fetchRecipeLines (recipeId) {
  const res = await fetch(`/api/recipes/${recipeId}/lines`);
  if (!res.ok) throw new Error('Ошибка загрузки составляющих');
  return res.json();
}

async function populateMaterialSelect(row) {
  const select = row.querySelector('.material-select');
  if (!select) return;
  
  const roleSelect = row.querySelector('.role-select');
  const recipeRole = roleSelect.value;
  const recipeHeaderRole = form.elements.role.value; // cathode / anode
  
  const materials = await fetchMaterials();
  
  select.innerHTML = '<option value="">— выбрать —</option>';
  
  materials.forEach(m => {
    let allowed = false;
    
    if (recipeRole === 'binder' && m.role === 'binder') {
      allowed = true;
    }
    
    if (recipeRole === 'additive' && m.role === 'conductive_additive') {
      allowed = true;
    }
    
    if (recipeRole === 'solvent' && m.role === 'solvent') {
      allowed = true;
    }
    
    if (
      (recipeRole === 'cathode_active' && m.role === 'cathode_active') ||
      (recipeRole === 'anode_active' && m.role === 'anode_active')
    ) {
      allowed = true;
    }
    
    if (!allowed) return;
    
    const opt = document.createElement('option');
    opt.value = m.material_id;
    opt.textContent = m.name;
    select.appendChild(opt);
  });
}

// -------- Other helpers --------

function duplicateRecipeUI(recipe) {
  mode = 'create';
  currentId = null;
  
  showForm();
  
  const copyName = recipe.name + ' (копия)';
  title.textContent = copyName;
  nameInput.value = copyName;
  
  form.elements['role'].value = recipe.role || '';
  form.elements['variant_label'].value = recipe.variant_label || '';
  form.elements['notes'].value = recipe.notes || '';
  
  // created_by must be re-selected
  createdBySelect.value = '';
  
  // copy recipe lines
  fetchRecipeLines(recipe.tape_recipe_id)
  .then(async (lines) => {
    await renderRecipeLinesFromData(lines);
    markFormPristine();
  })
  .catch(() => {
    showStatus('Ошибка загрузки состава рецепта', true);
  });
}

function createRecipeLineRow(index) {
  const row = document.createElement('tr');
  row.className = 'recipe-line-row';
  row.dataset.index = index;
  
  row.innerHTML = `
    <td>
      <select class="role-select" data-field="recipe_role" required>
        <option value="">— выбрать —</option>
        <option value="cathode_active">катодный активный материал</option>
        <option value="anode_active">анодный активный материал</option>
        <option value="binder">связующее</option>
        <option value="additive">добавка</option>
        <option value="solvent">растворитель</option>
      </select>
    </td>
  
    <td>
      <select class="material-select" data-field="material_id" required>
        <option value="">— выбрать —</option>
      </select>
    </td>
  
    <td>
      <input
        type="number"
        step="0.01"
        min="0"
        max="100"
        data-field="slurry_percent"
      >
    </td>
  
    <td>
      <input
        type="text"
        data-field="line_notes"
        placeholder="Комментарий"
      >
    </td>
  
    <td>
      <button type="button" class="delete-line">🗑</button>
    </td>
  `;
  
  row.querySelector('.delete-line').addEventListener('click', () => {
    row.remove();
  });
  
  return row;
}

async function appendRecipeLineRow(index, preset = null) {
  const container = document.getElementById('recipe-lines-rows');
  
  const row = createRecipeLineRow(index);
  container.appendChild(row);
  
  const roleSelect = row.querySelector('[data-field="recipe_role"]');
  
  // Apply preset role first
  if (preset) {
    roleSelect.value = preset.recipe_role ?? '';
  }
  
  // Attach role change listener
  roleSelect.addEventListener('change', () => {
    const selected = roleSelect.value;
    
    if (selected === 'cathode_active') {
      form.elements.role.value = 'cathode';
    }
    
    if (selected === 'anode_active') {
      form.elements.role.value = 'anode';
    }
    
    populateMaterialSelect(row);
  });
  
  // Now populate materials based on role
  await populateMaterialSelect(row);
  
  // Apply preset material AFTER filtering
  if (preset) {
    row.querySelector('[data-field="material_id"]').value =
    preset.material_id || '';
    
    row.querySelector('[data-field="line_notes"]').value =
    preset.line_notes ?? '';
    
    row.querySelector('[data-field="slurry_percent"]').value =
    preset.slurry_percent ?? '';
  }

  row.querySelectorAll('input, select').forEach(field => {
    field.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;

      e.preventDefault();
      e.stopPropagation();

      const newIndex = container.children.length;
      const newRow = await appendRecipeLineRow(newIndex);
      newRow.querySelector('[data-field="recipe_role"]')?.focus();
    });
  });
  
  return row;
}

function collectRecipeLinesFromDOM() {
  const rows = document.querySelectorAll('.recipe-line-row');
  const lines = [];
  
  rows.forEach(row => {
    const materialId = Number(
      row.querySelector('[data-field="material_id"]').value
    );
    
    const recipeRole =
    row.querySelector('[data-field="recipe_role"]').value;
    
    const percentRaw =
    row.querySelector('[data-field="slurry_percent"]').value;
    
    const slurryPercent =
    recipeRole === 'solvent'
      ? null
      : (percentRaw === '' ? null : Number(percentRaw));
    
    
    const lineNotes =
    row.querySelector('[data-field="line_notes"]').value || null;
    
    if (!materialId) return;
    
    lines.push({
      material_id: materialId,
      recipe_role: recipeRole,
      include_in_pct: recipeRole !== 'solvent',
      slurry_percent: slurryPercent,
      line_notes: lineNotes
    });
  });
  
  return lines;
}

function clearRecipeLines() {
  const container = document.getElementById('recipe-lines-rows');
  container.innerHTML = '';
}


// -------- Rendering --------

function renderRecipes(recipes) {
  recipesList.innerHTML = '';
  
  recipes.forEach(r => {
    const li = document.createElement('li');
    li.className = 'user-row';
    li.dataset.recipeId = r.tape_recipe_id;
    
    const info = document.createElement('div');
    info.className = 'user-info';
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = r.name;
    nameSpan.style="display:inline-block; width:14vw;"
    
    const roleSpan = document.createElement('span');
    roleSpan.textContent = r.role === 'cathode' ? 'катод' : 'анод';
    roleSpan.style="display:inline-block; width:7vw;"
    
    // Percent span
    const percentSpan = document.createElement('span');
    percentSpan.style = "display:inline-block; width:1.5vw;";
    
    if (r.active_percent !== null && r.active_percent !== undefined) {
      percentSpan.textContent = `${r.active_percent}%`;
    } else {
      percentSpan.textContent = '';
    }
    
    // Active material span
    const activeSpan = document.createElement('span');
    activeSpan.style = "display:inline-block; width:10vw;";
    activeSpan.textContent = r.active_material_name || '';
    
    // Variant span
    const variantSpan = document.createElement('span');
    variantSpan.style = "display:inline-block; width:20vw;";
    variantSpan.textContent = r.variant_label || '';
    
    info.appendChild(nameSpan);
    info.appendChild(roleSpan);
    info.appendChild(percentSpan);
    info.appendChild(activeSpan);
    info.appendChild(variantSpan);
    
    const actions = document.createElement('div');
    actions.className = 'actions';
    
    const duplicateBtn = document.createElement('button');
    duplicateBtn.textContent = '📄';
    duplicateBtn.title = 'Дублировать';
    
    duplicateBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      duplicateRecipeUI(r);
    };
    
    // ✏️ EDIT
    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️';
    editBtn.title = 'Редактировать';
    editBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      mode = 'edit';
      currentId = r.tape_recipe_id;
      
      showForm();
      
      title.textContent = r.name;
      nameInput.value = r.name;
      
      form.elements['created_by'].value = r.created_by || '';
      form.elements['role'].value = r.role || '';
      form.elements['variant_label'].value = r.variant_label || '';
      form.elements['notes'].value = r.notes || '';
      
      const lines = await fetchRecipeLines(r.tape_recipe_id);
      await renderRecipeLinesFromData(lines);
      markFormPristine();
    };
    
    // 🗑 DELETE
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑';
    deleteBtn.title = 'Удалить';
    deleteBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (!confirm(`Удалить рецепт "${r.name}"?`)) return;
      
      try {
        await deleteRecipe(r.tape_recipe_id);
        showStatus('Рецепт удалён');
        loadRecipes();
      } catch (err) {
        showStatus(err.message, true);
      }
    };
    
    actions.appendChild(editBtn);
    actions.appendChild(duplicateBtn);
    actions.appendChild(deleteBtn);
    
    li.appendChild(info);
    li.appendChild(actions);
    
    recipesList.appendChild(li);
  });
}

async function renderRecipeLinesFromData(lines) {
  if (!Array.isArray(lines)) return;
  
  clearRecipeLines();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    await appendRecipeLineRow(i, line);
  }
}

// -------- Status helper --------

const statusBox = document.querySelector('.status-feedback');

function showStatus(msg, isError = false) {
  statusBox.textContent = msg;
  statusBox.style.color = isError ? '#b00020' : 'darkcyan';
  
  setTimeout(() => {
    statusBox.textContent = '';
  }, 1000);
}


// -------- Events --------

addRecipeLine.addEventListener('click', async () => {
  const container = document.getElementById('recipe-lines-rows');
  const index = container.children.length;
  await appendRecipeLineRow(index);
});

addInput.addEventListener('keydown', async(e) => {
  if (e.key !== 'Enter') return;
  
  e.preventDefault();
  if (!form.hidden) return;
  
  const name = addInput.value.trim();
  if (!name) return;
  
  mode = 'create';
  currentId = null;
  
  title.textContent = name;
  nameInput.value = name;
  
  showForm();
  clearRecipeLines();
  await appendRecipeLineRow(0);
  markFormPristine();
  
  addInput.value = '';
});

function validateRequiredFields() {
  let missing = [];
  const roleSelect = form.elements.role;
  
  createdBySelect.classList.remove('required-missing');
  roleSelect.classList.remove('required-missing');
  
  if (!createdBySelect.value) {
    missing.push('Кто добавил');
    createdBySelect.classList.add('required-missing');
  }
  
  if (!roleSelect.value) {
    missing.push('Роль электрода');
    roleSelect.classList.add('required-missing');
  }
  
  if (missing.length) {
    showStatus(
      'Заполните обязательные поля: ' + missing.join(', '),
      true
    );
    return false;
  }
  
  return true;
}

function validateRecipeLines() {
  const rows = document.querySelectorAll('.recipe-line-row');
  let totalPercent = 0;
  
  if (rows.length === 0) {
    alert('Добавьте хотя бы один компонент');
    return false;
  }
  
  for (const row of rows) {
    const materialId =
    row.querySelector('[data-field="material_id"]')?.value;
    
    const percent =
    row.querySelector('[data-field="slurry_percent"]')?.value;
    
    if (!materialId) {
      alert('Выберите материал для каждого компонента');
      return false;
    }
    
    const role =
    row.querySelector('[data-field="recipe_role"]')?.value;

    if (!role) {
      alert('Выберите функциональную роль для каждого компонента');
      return false;
    }
    
    if (role !== 'solvent') {
      if (percent === '' || isNaN(Number(percent))) {
        alert('Укажите корректный % для каждого компонента');
        return false;
      }
      
      const pct = Number(percent);
      if (pct < 0 || pct > 100) {
        alert('% должен быть в диапазоне 0–100');
        return false;
      }

      totalPercent += pct;
    }

    if (role === 'solvent' && percent !== '') {
      const pct = Number(percent);
      if (pct < 0 || pct > 100) {
        alert('% должен быть в диапазоне 0–100');
        return false;
      }
    }
  }

  if (Math.abs(totalPercent - 100) > 0.0001) {
    alert('Сумма % по компонентам рецепта должна быть ровно 100%.');
    return false;
  }
  
  return true;
}

function recipeNameVersionExists(name, variant, excludeId = null) {
  const items = document.querySelectorAll('#recipesList .user-row');
  
  for (const li of items) {
    const spans = li.querySelectorAll('.user-info span');
    const existingName = spans[0]?.textContent?.trim() || '';
    const existingVariant = spans[2]?.textContent?.trim() || '';
    
    const recipeId = li.dataset.recipeId
    ? Number(li.dataset.recipeId)
    : null;
    
    if (excludeId && recipeId === excludeId) continue;
    
    if (
      existingName === name &&
      (existingVariant || '') === (variant || '')
    ) {
      return true;
    }
  }
  return false;
}

saveBtn.addEventListener('click', async () => {
  if (!mode) return;
  
  if (!validateRequiredFields()) return;
  if (!validateRecipeLines()) return;
  
  const name = nameInput.value.trim();
  const variant = (form.elements.variant_label.value || '').trim();
  const excludeId = mode === 'edit' ? currentId : null;
  
  if (recipeNameVersionExists(name, variant, excludeId)) {
    alert(
      'Рецепт с таким названием и версией уже существует. \n' +
      'Пожалуйста, измените версию рецепта или его название.'
    );
    return; // HARD STOP — nothing is saved
  }
  
  const data = {
    role: form.elements.role.value,
    name: nameInput.value,
    variant_label: form.elements.variant_label.value || null,
    notes: form.elements.notes.value || null,
    created_by: Number(form.elements.created_by.value),
    lines: collectRecipeLinesFromDOM()
  };
  
  try {
    if (mode === 'create') {
      console.log('POST /api/recipes payload:', data);
      await createRecipe(data);
      showStatus('Рецепт сохранён');
    } else if (mode === 'edit') {
      await updateRecipe(currentId, data);
      showStatus('Изменения сохранены');
    }
    
    resetForm();
    loadRecipes();
  } catch (err) {
    showStatus(err.message, true);
  }
});

clearBtn.addEventListener('click', () => {
  if (!hasUnsavedChanges()) {
    resetForm();
    return;
  }

  if (confirm('Выйти без сохранения изменений?')) {
    resetForm();
  }
});
createdBySelect.addEventListener('focus', loadUsers);

// ------ name: editable ------
title.addEventListener('click', () => {
  nameInput.hidden = false;
  title.hidden = true;
  nameInput.focus();
});

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    nameInput.blur();
  }
});

nameInput.addEventListener('blur', () => {
  const val = nameInput.value.trim();
  if (!val) return;
  
  title.textContent = val;
  title.hidden = false;
  nameInput.hidden = true;
});

window.addEventListener('focus', () => {
  cachedMaterials = null;
});

// -------- Init --------

hideForm();
loadUsers();
loadRecipes();
