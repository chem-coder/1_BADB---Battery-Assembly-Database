
// -------- State and helpers --------

const addInput = document.getElementById('tape-name');
const nameInput = document.getElementById('tape-name-input');
const form = document.forms['tape-form'];
const title = form.querySelector('h2');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const recipeMaterialsSaveBtn = document.getElementById('0-recipe-materials-save-btn');
const tapesList = document.getElementById('tapesList');

let mode = null;
let currentTapeId = null;

const createdBySelect = document.getElementById('tape-created-by');
const dryingOperatorSelect = document.getElementById('0-drying_am-operator');
const projectSelect   = document.getElementById('project_id');
const tapeTypeSelect  = document.getElementById('tape_type');
const recipeSelect    = document.getElementById('tape-recipe-id'); // already added in HTML

let currentRecipeLines = [];
let selectedInstanceByLineId = {};
let instanceCacheByMaterialId = {};
let instanceComponentsCache = {};
let coatingMethodsCache = [];
let isRestoringTape = false;

function showForm() {
  form.hidden = false;
  addInput.disabled = true;
  startLiveSinceLastStepTimer();
}

function hideForm() {
  form.hidden = true;
  addInput.disabled = false;
  stopLiveSinceLastStepTimer();
}

function resetForm() {
  form.reset();
  
  title.textContent = '';
  title.hidden = false;
  
  nameInput.value = '';
  nameInput.hidden = true;
  
  mode = null;
  currentTapeId = null;
  
  if (saveBtn) saveBtn.textContent = 'Создать ленту';
  hideForm();
}

function fillSelect(selectEl, items, valueKey, labelFn, placeholderHtml) {
  const current = selectEl.value;
  
  selectEl.innerHTML = placeholderHtml;
  
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item[valueKey];
    opt.textContent = labelFn(item);
    selectEl.appendChild(opt);
  });
  
  // restore selection if still present
  if (current && [...selectEl.options].some(o => o.value === current)) {
    selectEl.value = current;
  }
}

// -------- API helpers --------

async function fetchUsers() {
  const res = await fetch('/api/users');
  return res.json();
}

async function fetchProjects() {
  const res = await fetch('/api/projects');
  return res.json();
}

async function fetchRecipes(role) {
  const params = new URLSearchParams();
  
  if (role) {
    params.append('role', role);
  }
  
  const qs = params.toString();
  const url = qs ? `/api/recipes?${qs}` : '/api/recipes';
  
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки рецептов');
  }
  
  return res.json();
}

async function fetchRecipeLines(recipeId) {
  const res = await fetch(`/api/recipes/${recipeId}/lines`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки состава рецепта');
  }
  return res.json();
}

async function fetchMaterialInstances(materialId) {
  if (!materialId) return [];
  
  // simple cache to avoid refetching repeatedly
  if (instanceCacheByMaterialId[materialId]) {
    return instanceCacheByMaterialId[materialId];
  }
  
  const res = await fetch(`/api/materials/${materialId}/instances`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки экземпляров материала');
  }
  
  const data = await res.json();
  instanceCacheByMaterialId[materialId] = data;
  
  return data;
}

async function fetchInstanceComponents(instanceId) {
  if (!instanceId) return [];
  
  const res = await fetch(`/api/materials/instances/${instanceId}/components`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки состава экземпляра');
  }
  
  return res.json();
}

async function createTape(data) {
  const res = await fetch('/api/tapes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка сохранения');
  }
  
  return res.json();
}

async function fetchTapes() {
  const res = await fetch('/api/tapes');
  return res.json();
}

async function loadTapes() {
  const tapes = await fetchTapes();
  renderTapes(tapes);
}

async function updateTape(id, data) {
  const res = await fetch(`/api/tapes/${id}`, {
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

async function deleteTape(id) {
  const res = await fetch(`/api/tapes/${id}`, {
    method: 'DELETE'
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка удаления');
  }
}

async function fetchDryingStep(tapeId, operationCode) {
  if (!tapeId) return null;
  
  const qs = operationCode ? `?operation_code=${encodeURIComponent(operationCode)}` : '';
  const res = await fetch(`/api/tapes/${tapeId}/steps/drying${qs}`);
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки сушки');
  }
  
  return res.json(); // object or null
}

async function fetchTapeActuals(tapeId) {
  if (!tapeId) return [];
  
  const res = await fetch(`/api/tapes/${tapeId}/actuals`);
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки фактических данных');
  }
  
  return res.json(); // array
}

async function saveSelectedInstances(tapeId) {
  if (!tapeId) return;

  for (const line of currentRecipeLines) {
    const recipeLineId = line.recipe_line_id;
    const instanceId = selectedInstanceByLineId[recipeLineId];

    if (!instanceId) continue;

    const res = await fetch(`/api/tapes/${tapeId}/actuals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipe_line_id: recipeLineId,
        material_instance_id: Number(instanceId)
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка сохранения выбранных экземпляров');
    }
  }
}

async function saveTapeActuals(tapeId) {
  if (!tapeId) return;

  for (const line of currentRecipeLines) {
    const recipeLineId = line.recipe_line_id;
    const instanceId = selectedInstanceByLineId[recipeLineId];

    if (!instanceId) continue;

    const row = document.querySelector(
      `#slurry-actuals-body tr[data-recipe-line-id="${recipeLineId}"]`
    );

    if (!row) continue;

    const modeSelect = row.querySelector('.actual-mode-select');
    const valueInput = row.querySelector('.actual-value-input');

    if (!modeSelect || !valueInput) continue;

    const measureMode = modeSelect.value;
    const value = Number(valueInput.value);

    const payload = {
      recipe_line_id: recipeLineId,
      material_instance_id: Number(instanceId)
    };

    if (Number.isFinite(value) && value > 0) {
      payload.measure_mode = measureMode;

      if (measureMode === 'mass') {
        payload.actual_mass_g = value;
      }

      if (measureMode === 'volume') {
        payload.actual_volume_ml = value;
      }
    }

    const res = await fetch(`/api/tapes/${tapeId}/actuals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка сохранения фактических данных');
    }
  }
}

async function loadDryingAtmospheres(selectEl, selectedCode = '') {
  if (!selectEl) return;
  
  const res = await fetch('/api/reference/drying-atmospheres');
  if (!res.ok) throw new Error('Failed to load drying atmospheres');
  
  const items = await res.json();
  
  selectEl.innerHTML = '<option value="">— не выбрано —</option>';
  
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.code;         // store code in DB
    opt.textContent = item.display; // show Russian label
    selectEl.appendChild(opt);
  });
  
  if (selectedCode) {
    selectEl.value = selectedCode;
  }
}

async function loadDryMixingMethods(selectEl, selectedId = '') {
  if (!selectEl) return;
  
  const res = await fetch('/api/reference/dry-mixing-methods');
  if (!res.ok) throw new Error('Failed to load dry mixing methods');
  
  const items = await res.json();
  
  selectEl.innerHTML = '<option value="">— не выбрано —</option>';
  
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = String(item.dry_mixing_id);
    opt.dataset.code = item.name || '';  
    opt.textContent = item.description || item.name;
    selectEl.appendChild(opt);
  });
  
  if (selectedId) selectEl.value = String(selectedId);
}

async function loadWetMixingMethods(selectEl, selectedId = '') {
  if (!selectEl) return;
  
  const res = await fetch('/api/reference/wet-mixing-methods');
  if (!res.ok) throw new Error('Failed to load wet mixing methods');
  
  const items = await res.json();
  
  selectEl.innerHTML = '<option value="">— не выбрано —</option>';
  
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = String(item.wet_mixing_id);
    opt.dataset.code = item.name || '';    
    opt.textContent = item.description || item.name;
    selectEl.appendChild(opt);
  });
  
  if (selectedId) selectEl.value = String(selectedId);
}

// -------- Rendering --------

function recipeRoleLabel(recipeRole) {
  const map = {
    cathode_active: 'Aктивный материал: ',
    anode_active: 'Aктивный материал: ',
    binder: 'Связующее: ',
    additive: 'Проводящая добавка: ',
    solvent: 'Растворитель: ',
    other: 'Другое: '
  };
  
  return map[recipeRole] || recipeRole || '';
}

function syncInstanceSelectsForLine(recipeLineId) {
  const value = selectedInstanceByLineId[recipeLineId] || '';
  const selects = document.querySelectorAll(
    `[data-recipe-line-id="${recipeLineId}"].material-instance-select`
  );

  selects.forEach((select) => {
    if ([...select.options].some((option) => option.value === String(value))) {
      select.value = String(value);
    } else if (!value) {
      select.value = '';
    }
  });
}

function renderRecipeLines(lines, restoringActuals = []) {
  const container = document.getElementById('recipe-lines-container');
  if (!container) return;
  container.innerHTML = '';
  container.classList.add('recipe-lines-list');
  
  const slurryBody = document.getElementById('slurry-actuals-body');
  if (slurryBody) {
    slurryBody.innerHTML = '';
  }
  // ----- Header row -----
  const headerRow = document.createElement('div');
  headerRow.className = 'recipe-line-row recipe-line-header';
  
  const headers = [
    'Роль',
    'Материал',
    'Экземпляр материала',
    '% в сухой смеси',
    'Масса сухого компонента, г',
    'Масса экземпляра, г'
  ];
  
  headers.forEach(text => {
    const cell = document.createElement('div');
    cell.className = 'recipe-line-cell recipe-line-header-cell';
    cell.textContent = text;
    headerRow.appendChild(cell);
  });
  
  container.appendChild(headerRow);
  
  lines.forEach(line => {
    const row = document.createElement('div');
    row.className = 'recipe-line-row';
    row.dataset.recipeLineId = line.recipe_line_id;
    
    // role label (left)
    const roleInput = document.createElement('input');
    roleInput.type = 'text';
    roleInput.value = recipeRoleLabel(line.recipe_role);
    roleInput.disabled = true;
    
    // material name (middle)
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = line.material_name;
    nameInput.disabled = true;
    
    // material instance selector
    const instanceSelect = document.createElement('select');
    instanceSelect.className = 'material-instance-select';
    instanceSelect.dataset.recipeLineId = line.recipe_line_id;
    
    // placeholder option
    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = '— выбрать экземпляр —';
    instanceSelect.appendChild(placeholderOpt);
    
    const slurryInstanceSelect = document.createElement('select');
    slurryInstanceSelect.className = 'material-instance-select slurry-instance-select';
    slurryInstanceSelect.dataset.recipeLineId = line.recipe_line_id;
    slurryInstanceSelect.disabled = true;
    
    // load instances asynchronously (populate BOTH selects)
    fetchMaterialInstances(line.material_id)
    .then(instances => {
      const prev = selectedInstanceByLineId[line.recipe_line_id] || '';
      
      const sorted = instances
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      
      sorted.forEach(inst => {
        const opt1 = document.createElement('option');
        opt1.value = inst.material_instance_id;
        opt1.textContent = inst.name || `ID ${inst.material_instance_id}`;
        instanceSelect.appendChild(opt1);
        
        const opt2 = document.createElement('option');
        opt2.value = inst.material_instance_id;
        opt2.textContent = inst.name || `ID ${inst.material_instance_id}`;
        slurryInstanceSelect.appendChild(opt2);
      });
      
      // restore selection after options are appended (BOTH)
      if (prev) {
        syncInstanceSelectsForLine(line.recipe_line_id);
      }
      
      recalculatePlannedMasses();
    })
    .catch(err => console.error(err));
    
    // store selection in state
    function setInstanceForLine(recipeLineId, value) {
      selectedInstanceByLineId[recipeLineId] = value || null;

      syncInstanceSelectsForLine(recipeLineId);
      recalculatePlannedMasses();
    }
    
    instanceSelect.addEventListener('change', () => {
      setInstanceForLine(line.recipe_line_id, instanceSelect.value || '');
      setStepDirty('recipe_materials', true);
    });
    
    // percent (right) with % sign
    const pctInput = document.createElement('input');
    pctInput.classList.add('numeric');
    pctInput.type = 'text';           // text, so "96%" can be shown
    pctInput.disabled = true;
    
    if (line.include_in_pct) {
      pctInput.value =
      (line.slurry_percent === null || line.slurry_percent === undefined || line.slurry_percent === '')
      ? ''
      : `${Number(line.slurry_percent).toFixed(2)} %`
    } else {
      pctInput.value = '';
    }
    
    row.appendChild(roleInput);
    row.appendChild(nameInput);
    row.appendChild(instanceSelect);
    row.appendChild(pctInput);
    
    const targetDrySpan = document.createElement('span');
    targetDrySpan.className = 'target-dry-mass numeric';
    targetDrySpan.textContent = '';
    row.appendChild(targetDrySpan);
    
    const plannedSpan = document.createElement('span');
    plannedSpan.className = 'planned-mass numeric';
    plannedSpan.textContent = '';
    row.appendChild(plannedSpan);
    
    container.appendChild(row);
    
    // --- SLURRY ACTUALS ROW ---
    const tr = document.createElement('tr');
    tr.dataset.recipeLineId = line.recipe_line_id;
    
    // 1. Role
    const roleTd = document.createElement('td');
    roleTd.textContent = recipeRoleLabel(line.recipe_role);
    tr.appendChild(roleTd);
    
    // 2. Material instance (read-only mirror of planned selection)
    const instanceTd = document.createElement('td');
    const slurryPlaceholderOpt = document.createElement('option');
    slurryPlaceholderOpt.value = '';
    slurryPlaceholderOpt.textContent = '— выбрать экземпляр —';
    slurryInstanceSelect.appendChild(slurryPlaceholderOpt);
    
    instanceTd.appendChild(slurryInstanceSelect);
    tr.appendChild(instanceTd);
    
    // 3. Planned amount (reuse existing planned mass if available)
    const plannedTd = document.createElement('td');
    plannedTd.className = 'planned-amount-cell';
    plannedTd.classList.add('numeric');
    plannedTd.dataset.recipeLineId = line.recipe_line_id;
    tr.appendChild(plannedTd);
    
    // 4. Actual value (mode + input)
    const actualTd = document.createElement('td');
    
    const modeSelect = document.createElement('select');
    modeSelect.className = 'actual-mode-select';
    modeSelect.dataset.recipeLineId = line.recipe_line_id;
    modeSelect.innerHTML = `
            <option value="mass" selected>m (г)</option>
            <option value="volume">V (мкл)</option>
          `;
    modeSelect.value = 'mass';
    
    const valueInput = document.createElement('input');
    valueInput.type = 'number';
    valueInput.step = '0.0001';
    valueInput.className = 'actual-value-input';
    valueInput.dataset.recipeLineId = line.recipe_line_id;
    
    actualTd.appendChild(modeSelect);
    actualTd.appendChild(valueInput);
    tr.appendChild(actualTd);
    
    slurryBody.appendChild(tr);
    
    // restore actual value for this line if present
    const saved = restoringActuals.find(
      a => Number(a.recipe_line_id) === Number(line.recipe_line_id)
    );
    
    if (saved) {
      const modeSelect = tr.querySelector('.actual-mode-select');
      const valueInput = tr.querySelector('.actual-value-input');
      
      if (modeSelect && valueInput) {
        
        const restoredMode = saved.measure_mode || 'mass';
        modeSelect.value = restoredMode;
        
        if (restoredMode === 'mass') {
          valueInput.value = saved.actual_mass_g ?? '';
        }
        
        if (restoredMode === 'volume') {
          valueInput.value = saved.actual_volume_ml ?? '';
        }
      }
    }
    
    // restore selected instance from saved actuals (if not already chosen)
    if (saved && saved.material_instance_id && !selectedInstanceByLineId[line.recipe_line_id]) {
      selectedInstanceByLineId[line.recipe_line_id] = String(saved.material_instance_id);
      syncInstanceSelectsForLine(line.recipe_line_id);
    }
  });

  applyDefaultCoatingFoil();
}

function clearRecipeLines() {
  const container = document.getElementById('recipe-lines-container');
  if (container) {
    container.innerHTML = '';
  }
}

function renderExpandedCalculation(data) {
  const container = document.getElementById('expanded-calculation-container');
  if (!container) return;
  
  container.innerHTML = '';
  
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  
  const header = document.createElement('tr');
  header.innerHTML = `
          <th style="text-align:left;">Роль</th>
          <th style="text-align:left;">Материал</th>
          <th style="text-align:left;">Экземпляр</th>
          <th class="numeric">%</th>
          <th style="text-align:left;">Компонент</th>
          <th class="numeric">Масса компонента, г</th>
          <th class="numeric">Масса к навеске, г</th>
        `;
  table.appendChild(header);
  
  data.forEach(block => {
    
    const instanceMass = block.instanceMass;
    
    block.components.forEach((c, index) => {
      
      const tr = document.createElement('tr');
      
      if (index === 0) {
        tr.innerHTML += `<td>${block.role}</td>`;
        tr.innerHTML += `<td>${block.material}</td>`;
        tr.innerHTML += `<td>${block.instanceName}</td>`;
      } else {
        tr.innerHTML += `<td></td><td></td><td></td>`;
      }
      
      tr.innerHTML += `
              <td class="numeric">${(c.fraction * 100).toFixed(2)} %</td>
              <td>${c.material_name}</td>
              <td class="numeric">${c.mass.toFixed(4)}</td>
            `;
      
      if (index === 0) {
        tr.innerHTML += `<td class="numeric">${instanceMass.toFixed(4)}</td>`;
      } else {
        tr.innerHTML += `<td></td>`;
      }
      
      table.appendChild(tr);
    });
  });
  
  container.appendChild(table);
}

function recalculatePlannedMasses() {
  const mode = calcModeSelect.value;
  const inputValue = Number(activeMassInput.value);
  
  if (!currentRecipeLines.length) return;
  if (!Number.isFinite(inputValue) || inputValue <= 0) return;
  
  let target; // active dry mass (g)
  
  if (mode !== 'from_active_mass' && mode !== 'from_slurry_mass') return;
  
  if (mode === 'from_active_mass') {
    target = inputValue;
  }
  
  if (mode === 'from_slurry_mass' && !Number.isFinite(inputValue)) return;
  
  // Find active material line
  const activeLine = currentRecipeLines.find(l =>
    l.recipe_role === 'cathode_active' ||
    l.recipe_role === 'anode_active'
  );
  
  if (!activeLine) return;
  if (!Number.isFinite(Number(activeLine.slurry_percent))) return;
  
  const activePercent = Number(activeLine.slurry_percent);
  if (!Number.isFinite(activePercent) || activePercent <= 0) return;
  
  if (mode === 'from_slurry_mass') {
    const totalWetMass = inputValue;
    
    const totalDryPercent = currentRecipeLines
    .filter(l => l.include_in_pct)
    .reduce((sum, l) => sum + Number(l.slurry_percent || 0), 0);
    if (totalDryPercent > 100) return;
    if (!Number.isFinite(totalDryPercent) || totalDryPercent <= 0) return;
    
    const totalDryMassFromWet = totalWetMass * (totalDryPercent / 100);
    
    target = totalDryMassFromWet * (activePercent / totalDryPercent);
  }
  
  // Total dry mass = total dry solids mass required
  // derived from requested active mass and active material fraction
  if (!Number.isFinite(target) || target <= 0) return;
  if (activePercent > 100) return;
  const totalDryMass = target / (activePercent / 100);
  
  // Loop through rendered rows and compute required "to-weigh" masses
  const rows = Array.from(
    document.querySelectorAll('#recipe-lines-container .recipe-line-row')
  );
  if (!rows.length) return;
  
  const lineMap = {};
  currentRecipeLines.forEach(l => {
    lineMap[l.recipe_line_id] = l;
  });
  
  const expandedData = [];
  
  // 1) Build TARGET dry mass per material_id from recipe lines
  const targetDryByMaterialId = {};   // { material_id: target_dry_g }
  const remainingDryByMaterialId = {}; // { material_id: remaining_dry_g }
  
  // Only lines with include_in_pct=true (i.e., slurry_percent present) define dry targets
  currentRecipeLines.forEach(l => {
    if (!l || !l.include_in_pct) return;
    if (l.slurry_percent === null || l.slurry_percent === undefined || l.slurry_percent === '') return;
    
    const pct = Number(l.slurry_percent);
    if (!Number.isFinite(pct) || pct <= 0) return;
    
    const matId = Number(l.material_id);
    if (!Number.isFinite(matId)) return;
    
    const dry = totalDryMass * (pct / 100);
    
    targetDryByMaterialId[matId] = (targetDryByMaterialId[matId] || 0) + dry;
  });
  
  // Fill STEP 1–2 view: target dry mass column
  rows.forEach(row => {
    const lineId = Number(row.dataset.recipeLineId);
    const line = lineMap[lineId];
    if (!line) return;
    
    const span = row.querySelector('.target-dry-mass');
    if (!span) return;
    
    const matId = Number(line.material_id);
    const value = targetDryByMaterialId[matId];
    
    span.textContent = Number.isFinite(value)
    ? value.toFixed(4)
    : '';
  });
  
  // Initialize remaining = target
  Object.keys(targetDryByMaterialId).forEach(k => {
    remainingDryByMaterialId[k] = targetDryByMaterialId[k];
  });
  
  // 2) Aggregate ACTUAL contributions from selected instances (including solvents)
  const aggregatedByMaterialId = {}; // { material_id: mass_g }
  // contributions per recipe line (for overlap reporting)
  // lineContribByLineId[lineId][materialId] = mass_g
  const lineContribByLineId = {};
  
  for (const row of rows) {
    const lineId = Number(row.dataset.recipeLineId);
    const line = lineMap[lineId];
    if (!line) continue;
    
    const selectedInstanceId = selectedInstanceByLineId[lineId];
    const plannedCell = row.querySelector('.planned-mass');
    
    if (!selectedInstanceId) {
      if (plannedCell) plannedCell.textContent = '';
      
      const slurryPlannedCell = document.querySelector(
        `.planned-amount-cell[data-recipe-line-id="${lineId}"]`
      );
      
      if (slurryPlannedCell) {
        slurryPlannedCell.textContent = '';
      }
      
      continue;
    }
    
    const lineMaterialId = Number(line.material_id);
    const needDry = Number(remainingDryByMaterialId[lineMaterialId] || 0);
    
    // If this line's material is already satisfied by previous mixtures, show 0.0000 g to weigh
    if (!Number.isFinite(needDry) || needDry <= 0) {
      if (plannedCell) plannedCell.textContent = (0).toFixed(4);
      
      // mirror planned mass into slurry table
      const slurryPlannedCell = document.querySelector(
        `.planned-amount-cell[data-recipe-line-id="${lineId}"]`
      );
      
      if (slurryPlannedCell) {
        slurryPlannedCell.textContent = plannedCell.textContent;
      }
      
      continue;
    }
    
    // Ensure composition is loaded
    if (!instanceComponentsCache[selectedInstanceId]) {
      fetchInstanceComponents(selectedInstanceId)
      .then(components => {
        instanceComponentsCache[selectedInstanceId] = components;
        recalculatePlannedMasses(); // re-run after loading
      })
      .catch(console.error);
      
      continue; // wait until components are loaded
    }
    
    let components = instanceComponentsCache[selectedInstanceId];
    
    // Fallback: no composition defined → treat instance as 100% of itself (solid)
    if (!components || components.length === 0) {
      components = [{
        component_material_instance_id: null,
        component_name: line.material_name,
        material_id: lineMaterialId,
        material_name: line.material_name,
        material_role: null,
        mass_fraction: 1
      }];
    }
    
    // Find the fraction of THIS line's material inside the selected instance (by material_id)
    const match = components.find(c =>
      Number(c.material_id ?? c.component_material_id) === lineMaterialId
    );
    const fLine = match ? Number(match.mass_fraction) : NaN;
    
    if (!Number.isFinite(fLine) || fLine <= 0) {
      // If the instance does not contain the requested material_id, show blank and skip
      if (plannedCell) plannedCell.textContent = '';
      continue;
    }
    
    // Required instance mass to supply the remaining dry mass of this line's material
    // (This is the "to weigh" mass of the instance.)
    const instanceMassToWeigh = needDry / fLine;
    const instanceSelectEl = row.querySelector('.material-instance-select');
    
    expandedData.push({
      role: recipeRoleLabel(line.recipe_role),
      material: line.material_name,
      instanceName: instanceSelectEl && instanceSelectEl.selectedIndex >= 0
      ? instanceSelectEl.options[instanceSelectEl.selectedIndex].textContent
      : '',
      instanceMass: instanceMassToWeigh,
      components: components.map(comp => {
        const frac = Number(comp.mass_fraction);
        const safeFrac = Number.isFinite(frac) && frac > 0 ? frac : 0;
        
        return {
          material_name: comp.material_name,
          fraction: safeFrac,
          mass: instanceMassToWeigh * safeFrac
        };
      })
    });
    
    if (plannedCell) {
      plannedCell.textContent = instanceMassToWeigh.toFixed(4);
      
      const slurryPlannedCell = document.querySelector(
        `.planned-amount-cell[data-recipe-line-id="${lineId}"]`
      );
      
      if (slurryPlannedCell) {
        slurryPlannedCell.textContent = instanceMassToWeigh.toFixed(4);
      }
    }
    
    // Add contributions of every component from this instance
    components.forEach(comp => {
      const frac = Number(comp.mass_fraction);
      if (!Number.isFinite(frac)) return;
      
      const mass = instanceMassToWeigh * frac;
      const mid = Number(comp.material_id);
      if (!Number.isFinite(mid)) return;
      
      // 1) total aggregation (unchanged behavior)
      aggregatedByMaterialId[mid] = (aggregatedByMaterialId[mid] || 0) + mass;
      
      // 2) per-line contribution tracking (NEW)
      if (!lineContribByLineId[lineId]) {
        lineContribByLineId[lineId] = {};
      }
      lineContribByLineId[lineId][mid] =
      (lineContribByLineId[lineId][mid] || 0) + mass;
    });
    
    // Subtract SOLID contributions from remaining targets (overlap accounting)
    components.forEach(comp => {
      const frac = Number(comp.mass_fraction);
      if (!Number.isFinite(frac)) return;
      
      const mid = Number(comp.material_id);
      if (!Number.isFinite(mid)) return;
      
      const role = comp.material_role;
      if (role === 'solvent') return;
      
      if (remainingDryByMaterialId[mid] == null) return;
      
      const mass = instanceMassToWeigh * frac;
      remainingDryByMaterialId[mid] -= mass;
      if (remainingDryByMaterialId[mid] < 0) {
        remainingDryByMaterialId[mid] = 0;
      }
    });
  }
  
  expandedData.sort((a, b) => {
    const aIndex = currentRecipeLines.findIndex(l =>
      recipeRoleLabel(l.recipe_role) === a.role &&
      l.material_name === a.material
    );
    const bIndex = currentRecipeLines.findIndex(l =>
      recipeRoleLabel(l.recipe_role) === b.role &&
      l.material_name === b.material
    );
    return aIndex - bIndex;
  });
  
  renderExpandedCalculation(expandedData);
}

function renderTapes(tapes) {
  tapesList.innerHTML = '';
  
  tapes.forEach(t => {
    const li = document.createElement('li');
    li.className = 'user-row';
    
    const info = document.createElement('div');
    info.className = 'user-info';
    
    const nameSpan = document.createElement('strong');
    nameSpan.textContent = t.name || '— без названия —';
    
    const dateSpan = document.createElement('small');
    dateSpan.style.color = '#666';
    dateSpan.textContent =
    ' — ' + new Date(t.created_at).toLocaleDateString();
    
    info.appendChild(nameSpan);
    info.appendChild(dateSpan);
    
    const actions = document.createElement('div');
    actions.className = 'actions';
    
    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️';
    
    async function restoreDryingStep({ code, prefix }) {
      
      if (!currentTapeId) return;
      
      document.getElementById('0-general-info').hidden = false;
      document.getElementById('0-tape-recipe-materials').hidden = false;
      document.getElementById('0-drying_materials').hidden = false;
      document.getElementById('1-slurry').hidden = false;
      document.getElementById('2-tape').hidden = false;
      
      document.getElementById('0-general-info').open = false;
      document.getElementById('0-tape-recipe-materials').open = false;
      document.getElementById('0-drying_materials').open = false;
      document.getElementById('1-slurry').open = false;
      document.getElementById('2-tape').open = false;
      
      const res = await fetch(
        `/api/tapes/${currentTapeId}/steps/by-code/${code}`
      );
      
      if (!res.ok) return;
      
      const drying = await res.json();
      const details = document.getElementById(prefix);
      
      if (!drying) {
        if (details) details.open = false;
        return;
      }
      
      if (details) details.open = true;
      
      const started = drying.started_at
      ? new Date(drying.started_at)
      : null;
      
      if (started) {
        const yyyy = started.getFullYear();
        const mm   = String(started.getMonth() + 1).padStart(2, '0');
        const dd   = String(started.getDate()).padStart(2, '0');
        const hh   = String(started.getHours()).padStart(2, '0');
        const min  = String(started.getMinutes()).padStart(2, '0');
        
        const dateInput = document.getElementById(`${prefix}-date`);
        const timeInput = document.getElementById(`${prefix}-time`);
        
        if (dateInput) dateInput.value = `${yyyy}-${mm}-${dd}`;
        if (timeInput) timeInput.value = `${hh}:${min}`;
      }
      
      const map = {
        operator: 'performed_by',
        notes: 'comments',
        temperature: 'temperature_c',
        atmosphere: 'atmosphere',
        'target-duration': 'target_duration_min',
        other_param: 'other_parameters'
      };
      
      Object.entries(map).forEach(([suffix, field]) => {
        const el = document.getElementById(`${prefix}-${suffix}`);
        if (!el) return;
        el.value = drying[field] ?? '';
      });
    }
    
    editBtn.onclick = async() => {
      mode = 'edit';
      currentTapeId = t.tape_id;
      window.isRestoringTape = true
      
      // --- RESTORE DRYING STEP ---
      await Promise.all([
        restoreDryingStep({ code: 'drying_am',           prefix: '0-drying_am' }),
        restoreDryingStep({ code: 'drying_tape',         prefix: '2a-drying_tape' }),
        restoreDryingStep({ code: 'drying_pressed_tape', prefix: '2b-drying_pressed_tape' })
      ]);
      
      // --- RESTORE WEIGHING STEP (I.1 header) ---
      {
        const resWeigh = await fetch(`/api/tapes/${currentTapeId}/steps/by-code/weighing`);
        if (resWeigh.ok) {
          const weighing = await resWeigh.json();
          
          if (weighing && weighing.started_at) {
            const dt = new Date(weighing.started_at);
            
            const yyyy = dt.getFullYear();
            const mm   = String(dt.getMonth() + 1).padStart(2, '0');
            const dd   = String(dt.getDate()).padStart(2, '0');
            const hh   = String(dt.getHours()).padStart(2, '0');
            const min  = String(dt.getMinutes()).padStart(2, '0');
            
            document.getElementById('1-weighing-date').value = `${yyyy}-${mm}-${dd}`;
            document.getElementById('1-weighing-time').value = `${hh}:${min}`;
          } else {
            document.getElementById('1-weighing-date').value = '';
            document.getElementById('1-weighing-time').value = '';
          }
          
          document.getElementById('1-weighing-operator').value = String(weighing?.performed_by ?? '');
          document.getElementById('1-weighing-notes').value    = weighing?.comments ?? '';
        }
      }
      
      // --- RESTORE MIXING STEP ---
      const res = await fetch(`/api/tapes/${currentTapeId}/steps/by-code/mixing`);
      if (!res.ok) throw new Error('Mixing load failed');
      
      const mixing = await res.json();
      
      if (mixing) {
        
        // started_at -> 1-mixing-started_at-date/time
        if (mixing.started_at) {
          const dt = new Date(mixing.started_at);
          
          const yyyy = dt.getFullYear();
          const mm   = String(dt.getMonth() + 1).padStart(2, '0');
          const dd   = String(dt.getDate()).padStart(2, '0');
          const hh   = String(dt.getHours()).padStart(2, '0');
          const min  = String(dt.getMinutes()).padStart(2, '0');
          
          document.getElementById('1-mixing-started_at-date').value = `${yyyy}-${mm}-${dd}`;
          document.getElementById('1-mixing-started_at-time').value = `${hh}:${min}`;
        } else {
          document.getElementById('1-mixing-started_at-date').value = '';
          document.getElementById('1-mixing-started_at-time').value = '';
        }
        
        // performed_by, comments
        document.getElementById('1-mixing-operator').value  = mixing.performed_by || '';
        document.getElementById('1-mixing-comments').value  = mixing.comments || '';
        
        // slurry volume + method ids
        document.getElementById('1-mixing-slurry_volume_ml').value = mixing.slurry_volume_ml ?? '';
        document.getElementById('1-mixing-dry_mixing_id').value    = mixing.dry_mixing_id ?? '';
        document.getElementById('1-mixing-wet_mixing_id').value    = mixing.wet_mixing_id ?? '';
        
        // dry params
        if (mixing.dry_start_time) {
          const dt = new Date(mixing.dry_start_time);
          document.getElementById('dry-start-date').value = dt.toISOString().slice(0, 10);
          document.getElementById('dry-start-time').value = dt.toISOString().slice(11, 16);
        } else {
          document.getElementById('dry-start-date').value = '';
          document.getElementById('dry-start-time').value = '';
        }
        document.getElementById('dry-duration-min').value = mixing.dry_duration_min ?? '';
        document.getElementById('dry-rpm').value          = mixing.dry_rpm ?? '';
        
        // wet params
        if (mixing.wet_start_time) {
          const dt = new Date(mixing.wet_start_time);
          document.getElementById('wet-start-date').value = dt.toISOString().slice(0, 10);
          document.getElementById('wet-start-time').value = dt.toISOString().slice(11, 16);
        } else {
          document.getElementById('wet-start-date').value = '';
          document.getElementById('wet-start-time').value = '';
        }
        document.getElementById('wet-duration-min').value = mixing.wet_duration_min ?? '';
        document.getElementById('wet-rpm').value          = mixing.wet_rpm ?? '';
        document.getElementById('wet-viscosity_cP').value = mixing.viscosity_cp ?? '';
        
        // IMPORTANT: run once, after method ids are set
        updateMixParamsVisibility();
        
      } else {
        
        // clear fields if no mixing step exists
        document.getElementById('1-mixing-started_at-date').value = '';
        document.getElementById('1-mixing-started_at-time').value = '';
        document.getElementById('1-mixing-operator').value = '';
        document.getElementById('1-mixing-comments').value = '';
        document.getElementById('1-mixing-slurry_volume_ml').value = '';
        document.getElementById('1-mixing-dry_mixing_id').value = '';
        document.getElementById('1-mixing-wet_mixing_id').value = '';
        document.getElementById('dry-start-date').value = '';
        document.getElementById('dry-start-time').value = '';
        document.getElementById('dry-duration-min').value = '';
        document.getElementById('dry-rpm').value = '';
        document.getElementById('wet-start-date').value = '';
        document.getElementById('wet-start-time').value = '';
        document.getElementById('wet-duration-min').value = '';
        document.getElementById('wet-rpm').value = '';
        document.getElementById('wet-viscosity_cP').value = '';
        
        updateMixParamsVisibility(); // will hide blocks because selects are blank
      }
      
      // --- RESTORE COATING STEP ---
      const resCoating = await fetch(
        `/api/tapes/${currentTapeId}/steps/by-code/coating`
      );
      
      if (!resCoating.ok) throw new Error('Coating load failed');
      
      const coating = await resCoating.json();
      
      if (coating) {
        
        // ----- header -----
        
        document.getElementById('2-coating-operator').value =
        coating.performed_by || '';
        
        document.getElementById('2-cathode-tape-notes').value =
        coating.comments || '';
        
        if (coating.started_at) {
          
          const dt = new Date(coating.started_at);
          
          const yyyy = dt.getFullYear();
          const mm = String(dt.getMonth() + 1).padStart(2,'0');
          const dd = String(dt.getDate()).padStart(2,'0');
          const hh = String(dt.getHours()).padStart(2,'0');
          const min = String(dt.getMinutes()).padStart(2,'0');
          
          document.getElementById('2-coating-date').value =
          `${yyyy}-${mm}-${dd}`;
          
          document.getElementById('2-coating-time').value =
          `${hh}:${min}`;
          
        } else {
          
          document.getElementById('2-coating-date').value = '';
          document.getElementById('2-coating-time').value = '';
          
        }
        
        // ----- subtype fields (tape_step_coating) -----
        
        document.getElementById('2-coating-foil_id').value =
        coating.foil_id ?? '';
        
        document.getElementById('2-coating-coating_id').value =
        coating.coating_id ?? '';
        document.getElementById('2-coating-gap-um').value =
        coating.gap_um ?? '';
        document.getElementById('2-coating-temp-c').value =
        coating.coat_temp_c ?? '';
        document.getElementById('2-coating-time-min').value =
        coating.coat_time_min ?? '';
        document.getElementById('2-coating-method-comments').value =
        coating.method_comments ?? '';
        
        updateCoatingParamsVisibility(false);
        
      }
      
      // --- RESTORE CALENDERING STEP ---
      const resCal = await fetch(
        `/api/tapes/${currentTapeId}/steps/by-code/calendering`
      );
      
      if (!resCal.ok) throw new Error('Calendering load failed');
      
      const cal = await resCal.json();
      
      if (cal) {
        
        // ----- header -----
        
        document.getElementById('2-calendering-operator').value =
        cal.performed_by || '';
        
        document.getElementById('2-calendering-notes').value =
        cal.comments || '';
        
        if (cal.started_at) {
          const dt = new Date(cal.started_at);
          
          const yyyy = dt.getFullYear();
          const mm = String(dt.getMonth() + 1).padStart(2,'0');
          const dd = String(dt.getDate()).padStart(2,'0');
          const hh = String(dt.getHours()).padStart(2,'0');
          const min = String(dt.getMinutes()).padStart(2,'0');
          
          document.getElementById('2-calendering-date').value =
          `${yyyy}-${mm}-${dd}`;
          
          document.getElementById('2-calendering-time').value =
          `${hh}:${min}`;
        } else {
          document.getElementById('2-calendering-date').value = '';
          document.getElementById('2-calendering-time').value = '';
        }
        
        
        // ----- parameters -----
        
        document.getElementById('2-calendering-temp_c').value =
        cal.temp_c ?? '';
        
        document.getElementById('2-calendering-pressure_value').value =
        cal.pressure_value ?? '';
        
        document.getElementById('2-calendering-pressure_units').value =
        cal.pressure_units ?? '';
        
        document.getElementById('2-calendering-draw_speed_m_min').value =
        cal.draw_speed_m_min ?? '';
        
        document.getElementById('2-calendering-init_thickness_microns').value =
        cal.init_thickness_microns ?? '';
        
        document.getElementById('2-calendering-final_thickness_microns').value =
        cal.final_thickness_microns ?? '';
        
        document.getElementById('2-calendering-no_passes').value =
        cal.no_passes ?? '';
        
        document.getElementById('2-calendering-other_params').value =
        cal.other_params ?? '';
        
        
        // ----- appearance parsing -----
        
        const appearance = cal.appearance || '';
        
        document.getElementById('2-cal-shine').checked =
        appearance.includes('Блеск');
        
        document.getElementById('2-cal-curl').checked =
        appearance.includes('Закрутка');
        
        document.getElementById('2-cal-dots').checked =
        appearance.includes('Точечки');
        
        if (appearance.includes('Другое:')) {
          
          document.getElementById('2-cal-other-check').checked = true;
          document.getElementById('2-cal-other-text').disabled = false;
          
          const otherText =
          appearance.split('Другое:')[1]?.split(';')[0]?.trim() || '';
          
          document.getElementById('2-cal-other-text').value = otherText;
          
        } else {
          
          document.getElementById('2-cal-other-check').checked = false;
          document.getElementById('2-cal-other-text').disabled = true;
          document.getElementById('2-cal-other-text').value = '';
          
        }
        
      }
      
      // --- Refresh all step delays (after all restore assignments are done) ---
      refreshWeighingDelay();
      refreshMixingDelay();
      refreshCoatingDelay();
      refreshDryingTapeDelay();
      refreshCalenderingDelay();
      refreshDryingPressedTapeDelay();
      
      // --- END OF STEP RESTORATION ---
      window.isRestoringTape = false;
      
      if (saveBtn) saveBtn.textContent = 'Сохранить изменения';
      
      showForm();
      
      if (!currentTapeId) {
        document.getElementById('0-tape-recipe-materials').hidden = true;
        document.getElementById('0-drying_materials').hidden = true;
        document.getElementById('1-slurry').hidden = true;
        document.getElementById('2-tape').hidden = true;
      }
      
      const currentName = (t.name || '').trim();
      window.isRestoringTape = true;
      
      title.textContent = currentName || '— без названия —';
      nameInput.value = currentName;
      
      // If unnamed, immediately open inline rename
      if (!currentName) {
        nameInput.hidden = false;
        title.hidden = true;
        nameInput.focus();
      } else {
        title.hidden = false;
        nameInput.hidden = true;
      }
      
      form.elements['notes'].value = t.notes || '';
      // --- populate general info ---
      form.elements['created_by'].value = t.created_by || '';
      form.elements['project_id'].value = t.project_id || '';
      form.elements['tape_type'].value = t.role || '';
      
      // Load recipes first, then restore selection
      await loadRecipesDropdown();
      
      form.elements['tape_recipe_id'].value = t.tape_recipe_id || '';
      form.elements['calc_mode'].value = t.calc_mode || 'from_active_mass';
      form.elements['target_mass_g'].value = t.target_mass_g || '';
      
      if (t.tape_recipe_id) {
        
        isRestoringTape = true;
        
        const actuals = await fetchTapeActuals(currentTapeId);
        
        selectedInstanceByLineId = {};
        window._restoringActuals = actuals;
        
        actuals.forEach(a => {
          if (a.material_instance_id) {
            selectedInstanceByLineId[a.recipe_line_id] =
            String(a.material_instance_id);
          }
        });
        
        recipeSelect.dispatchEvent(new Event('change'));
        
        // NOTE: do NOT clear isRestoringTape / _restoringActuals here.
        // They are cleared at the end of the recipe change handler
        // after fetchRecipeLines/render completes.
      }
      window.isRestoringTape = false;
    };
    
    
    const duplicateBtn = document.createElement('button');
    duplicateBtn.textContent = '📄';
    
    duplicateBtn.onclick = () => {
      mode = 'create';
      currentTapeId = null;
      if (saveBtn) saveBtn.textContent = 'Создать ленту';
      
      showForm();
      
      const copyName = t.name + ' (копия)';
      title.textContent = copyName;
      nameInput.value = copyName;
      
      form.elements['notes'].value = t.notes || '';
    };
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑';
    
    deleteBtn.onclick = async () => {
      if (!confirm(`Удалить ленту "${t.name}"?`)) return;
      
      try {
        await deleteTape(t.tape_id);
        loadTapes();
      } catch (err) {
        console.error(err);
      }
    };
    
    actions.appendChild(editBtn);
    actions.appendChild(duplicateBtn);
    actions.appendChild(deleteBtn);
    
    li.appendChild(info);
    li.appendChild(actions);
    
    tapesList.appendChild(li);
  });
}

// -------- Status helper --------

const statusBox = document.querySelector('.status-feedback');

function logLoadError(err) {
  console.error(err);
}

function showStatus(msg, isError = false) {
  if (!statusBox) return;

  statusBox.textContent = msg;
  statusBox.style.color = isError ? '#b00020' : 'darkcyan';

  setTimeout(() => {
    if (statusBox.textContent === msg) {
      statusBox.textContent = '';
    }
  }, 1200);
}

// -------- Unsaved changes (dirty flags) --------

const dirtySteps = {
  general_info: false,
  recipe_materials: false,
  drying_materials: false,
  drying_am: false,
  slurry: false,
  weighing: false,
  mixing: false,
  tape: false,
  coating: false,
  drying_tape: false,
  calendering: false,
  drying_pressed_tape: false
};

const parentDirtyMap = {
  drying_materials: ['drying_am'],
  slurry: ['weighing', 'mixing'],
  tape: ['coating', 'drying_tape', 'calendering', 'drying_pressed_tape']
};

function updateDirtyMarker(stepCode) {
  const markerId =
  stepCode === 'general_info' ? 'dirty-general-info'
  : stepCode === 'recipe_materials' ? 'dirty-recipe-materials'
  : stepCode === 'drying_materials' ? 'dirty-drying_materials'
  : stepCode === 'drying_am' ? 'dirty-drying_am'
  : stepCode === 'slurry' ? 'dirty-slurry'
  : stepCode === 'weighing' ? 'dirty-weighing'
  : stepCode === 'mixing' ? 'dirty-mixing'
  : stepCode === 'tape' ? 'dirty-tape'
  : stepCode === 'coating' ? 'dirty-coating'
  : stepCode === 'drying_tape' ? 'dirty-drying_tape'
  : stepCode === 'calendering' ? 'dirty-calendering'
  : stepCode === 'drying_pressed_tape' ? 'dirty-drying_pressed_tape'
  : null;
  
  const el = markerId ? document.getElementById(markerId) : null;
  if (el) el.style.display = dirtySteps[stepCode] ? 'inline' : 'none';
}

function refreshParentDirtyStates() {
  Object.entries(parentDirtyMap).forEach(([parent, children]) => {
    dirtySteps[parent] = children.some((child) => Boolean(dirtySteps[child]));
    updateDirtyMarker(parent);
  });
}

function setStepDirty(stepCode, isDirty) {
  // Ignore programmatic restore for General Info (edit-mode loading)
  if (stepCode === 'general_info' && window.isRestoringTape && isDirty) return;
  
  dirtySteps[stepCode] = Boolean(isDirty);
  updateDirtyMarker(stepCode);
  refreshParentDirtyStates();
}

function anyDirty() {
  return Object.values(dirtySteps).some(Boolean);
}

function clearAllDirtySteps() {
  Object.keys(dirtySteps).forEach((stepCode) => {
    setStepDirty(stepCode, false);
  });
}

// Warn on tab close / reload when anything is dirty
window.addEventListener('beforeunload', (e) => {
  if (!anyDirty()) return;
  e.preventDefault();
  e.returnValue = '';
});

// Mark general info dirty on any user edits inside the General Info block
(() => {
  const generalDetails = document.getElementById('0-general-info');
  if (!generalDetails) return;
  
  const fields = generalDetails.querySelectorAll('input, select, textarea');
  
  fields.forEach(el => {
    
    const mark = () => {
      if (window.isRestoringTape) return;  // ignore programmatic restore
      setStepDirty('general_info', true);
    };
    
    el.addEventListener('input', mark);
    el.addEventListener('change', mark);
    
  });
})();
// -------- Time since previous step (helpers) --------

function readDateTimeFromInputs(dateId, timeId) {
  const d = document.getElementById(dateId)?.value || '';
  const t = document.getElementById(timeId)?.value || '';
  if (!d || !t) return null;
  
  const dt = new Date(`${d}T${t}`);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  
  if (h <= 0) return `${m} мин`;
  return `${h} ч ${m} мин`;
}

function setDelayText(outId, prevDateId, prevTimeId, curDateId, curTimeId) {
  const out = document.getElementById(outId);
  if (!out) return;
  
  const prev = readDateTimeFromInputs(prevDateId, prevTimeId);
  const cur  = readDateTimeFromInputs(curDateId, curTimeId);
  
  if (!prev || !cur) {
    out.textContent = '';
    return;
  }
  
  const ms = cur.getTime() - prev.getTime();
  const text = formatDurationMs(ms);
  
  out.textContent = text ? `Время с прошлого этапа: ${text}` : '';
}

// -------- Live timer since last step --------

let liveSinceTimerId = null;

const stepStartInputPairs = [
  ['0-drying_am-date', '0-drying_am-time'],
  ['1-weighing-date', '1-weighing-time'],
  ['1-mixing-started_at-date', '1-mixing-started_at-time'],
  ['2-coating-date', '2-coating-time'],
  ['2a-drying_tape-date', '2a-drying_tape-time'],
  ['2-calendering-date', '2-calendering-time'],
  ['2b-drying_pressed_tape-date', '2b-drying_pressed_tape-time']
];

function getLatestStepStart() {
  let latest = null;
  
  stepStartInputPairs.forEach(([dateId, timeId]) => {
    const dt = readDateTimeFromInputs(dateId, timeId);
    if (!dt) return;
    if (!latest || dt.getTime() > latest.getTime()) latest = dt;
  });
  
  return latest;
}

function updateLiveSinceLastStep() {
  const out = document.getElementById('live-since-last-step');
  if (!out) return;
  
  const latest = getLatestStepStart();
  if (!latest) {
    out.textContent = '';
    return;
  }
  
  const ms = Date.now() - latest.getTime();
  const text = formatDurationMs(ms);
  
  out.textContent = text ? `С момента последнего этапа: ${text}` : '';
}

function startLiveSinceLastStepTimer() {
  stopLiveSinceLastStepTimer();
  updateLiveSinceLastStep();
  liveSinceTimerId = setInterval(updateLiveSinceLastStep, 1000);
}

function stopLiveSinceLastStepTimer() {
  if (liveSinceTimerId) {
    clearInterval(liveSinceTimerId);
    liveSinceTimerId = null;
  }
}

// -------- Time since previous step (mixing) --------

function refreshWeighingDelay() {
  setDelayText(
    '1-weighing-delay',
    '0-drying_am-date',
    '0-drying_am-time',
    '1-weighing-date',
    '1-weighing-time'
  );
}

function refreshMixingDelay() {
  setDelayText(
    '1-mixing-delay',
    '1-weighing-date',
    '1-weighing-time',
    '1-mixing-started_at-date',
    '1-mixing-started_at-time'
  );
}

function refreshCoatingDelay() {
  setDelayText(
    '2-coating-delay',
    '1-mixing-started_at-date',
    '1-mixing-started_at-time',
    '2-coating-date',
    '2-coating-time'
  );
}

function refreshDryingTapeDelay() {
  setDelayText(
    '2a-drying_tape-delay',
    '2-coating-date',
    '2-coating-time',
    '2a-drying_tape-date',
    '2a-drying_tape-time'
  );
}

function refreshCalenderingDelay() {
  setDelayText(
    '2-calendering-delay',
    '2a-drying_tape-date',
    '2a-drying_tape-time',
    '2-calendering-date',
    '2-calendering-time'
  );
}

function refreshDryingPressedTapeDelay() {
  setDelayText(
    '2b-drying_pressed_tape-delay',
    '2-calendering-date',
    '2-calendering-time',
    '2b-drying_pressed_tape-date',
    '2b-drying_pressed_tape-time'
  );
}

// -------- Reference dropdowns --------

async function loadUsers() {
  try {
    const users = await fetchUsers();
    
    const placeholder = '<option value="">— выбрать пользователя —</option>';
    
    // 1) always fill "Кто добавил"
    fillSelect(
      createdBySelect,
      users,
      'user_id',
      u => u.name,
      placeholder
    );
    
    // 2) fill every operator select on the page
    const operatorSelects = Array.from(document.querySelectorAll('select[id$="-operator"]'));
    
    operatorSelects.forEach(sel => {
      fillSelect(
        sel,
        users,
        'user_id',
        u => u.name,
        placeholder
      );
    });
    
  } catch (err) {
    logLoadError(err);
  }
}

async function loadProjects() {
  try {
    const projects = await fetchProjects();
    
    fillSelect(
      projectSelect,
      projects,
      'project_id',
      p => p.name,
      '<option value="">— выбрать проект —</option>'
    );
  } catch (err) {
    logLoadError(err);
  }
}

async function loadRecipesDropdown() {
  try {
    const role = tapeTypeSelect.value || null;
    
    // If no role selected → show only placeholder
    if (!role) {
      recipeSelect.innerHTML = '<option value="">— выбрать рецепт —</option>';
      recipeSelect.value = '';
      clearRecipeLines();
      return;
    }
    
    const previousValue = recipeSelect.value;
    
    const recipes = await fetchRecipes(role);
    
    fillSelect(
      recipeSelect,
      recipes,
      'tape_recipe_id',
      r => (r.variant_label ? `${r.name} — ${r.variant_label}` : r.name),
      '<option value="">— выбрать рецепт —</option>'
    );
    
    // Auto-clear if previously selected recipe no longer valid
    if (
      previousValue &&
      !recipes.some(r => String(r.tape_recipe_id) === previousValue)
    ) {
      recipeSelect.value = '';
      clearRecipeLines();
    }
    
  } catch (err) {
    logLoadError(err);
  }
}

async function loadFoils() {
  
  const res = await fetch('/api/reference/foils');
  
  if (!res.ok) {
    throw new Error(`Failed to load foils: ${res.status}`);
  }
  
  const foils = await res.json();
  
  const select = document.getElementById('2-coating-foil_id');
  
  select.innerHTML = '<option value="">— выбрать фольгу —</option>';
  
  foils.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.foil_id;
    opt.textContent = f.type;
    select.appendChild(opt);
  });
}

async function loadCoatingMethods() {
  
  const res = await fetch('/api/reference/coating-methods');
  const methods = await res.json();
  coatingMethodsCache = Array.isArray(methods) ? methods : [];
  
  const select = document.getElementById('2-coating-coating_id');
  
  select.innerHTML =
  '<option value="">— выбрать метод —</option>';
  
  methods.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.coating_id;
    opt.textContent = m.comments || m.name;
    opt.dataset.gapUm = m.gap_um ?? '';
    opt.dataset.tempC = m.coat_temp_c ?? '';
    opt.dataset.timeMin = m.coat_time_min ?? '';
    opt.dataset.comments = m.comments || '';
    select.appendChild(opt);
  });
}

function applyDefaultCoatingFoil() {
  const foilSelect = document.getElementById('2-coating-foil_id');
  if (!foilSelect) return;
  if (foilSelect.value) return;

  const desiredFoil =
    tapeTypeSelect.value === 'cathode' ? 'al'
    : tapeTypeSelect.value === 'anode' ? 'cu'
    : '';

  if (!desiredFoil) return;

  const defaultOption = Array.from(foilSelect.options).find(
    (option) => String(option.textContent || '').trim().toLowerCase() === desiredFoil
  );

  if (defaultOption) {
    foilSelect.value = defaultOption.value;
  }
}

// -------- Events --------

// refresh reference dropdowns on focus (same pattern as reference pages)
createdBySelect.addEventListener('focus', loadUsers);
projectSelect.addEventListener('focus', loadProjects);
recipeSelect.addEventListener('focus', loadRecipesDropdown);
tapeTypeSelect.addEventListener('change', loadRecipesDropdown);
tapeTypeSelect.addEventListener('change', applyDefaultCoatingFoil);

// When recipe changes: load lines + reset instance selections + clear planned masses
recipeSelect.addEventListener('change', async () => {
  const recipeId = recipeSelect.value;
  
  if (!recipeId) {
    currentRecipeLines = [];
    selectedInstanceByLineId = {};   // reset instance selections
    instanceCacheByMaterialId = {};  // reset instance cache
    clearRecipeLines();
    return;
  }
  
  try {
    // capture restore payload BEFORE any await (so it survives window._restoringActuals being cleared)
    const restoringActuals = Array.isArray(window._restoringActuals)
    ? window._restoringActuals
    : [];
    
    const lines = await fetchRecipeLines(recipeId);
    currentRecipeLines = lines;
    
    if (!isRestoringTape) {
      selectedInstanceByLineId = {};   // reset only on manual recipe change
    }
    instanceCacheByMaterialId = {};    // cache must be cleared either way
    
    renderRecipeLines(lines, restoringActuals);
    
    recalculatePlannedMasses();
    applyDefaultCoatingFoil();
    
    // finish restore AFTER lines have been fetched + rendered
    if (isRestoringTape) {
      window._restoringActuals = null;
      isRestoringTape = false;
    }
    
  } catch (err) {
    console.error(err);
  }
});

const activeMassInput = document.getElementById('target-mass-g');
const calcModeSelect  = document.getElementById('calc-mode');
const activeMassLabel = document.querySelector('label[for="target-mass-g"]');

// Update label based on calculation mode
calcModeSelect.addEventListener('change', () => {
  if (calcModeSelect.value === 'from_slurry_mass') {
    activeMassLabel.textContent = 'Общая масса суспензии, г';
  } else {
    activeMassLabel.textContent = 'Масса активного материала, г';
  }
});

activeMassInput.addEventListener('input', recalculatePlannedMasses);
calcModeSelect.addEventListener('change', recalculatePlannedMasses);

addInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  
  e.preventDefault();
  if (!form.hidden) return;
  
  const name = addInput.value.trim();
  if (!name) return;
  
  mode = 'create';
  currentTapeId = null;
  
  title.textContent = name;
  nameInput.value = name;
  
  showForm();
  
  addInput.value = '';
});


/* ------ name: editable ------ */

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


// -------- Top General Tape Buttons --------

saveBtn.addEventListener('click', async () => {
  if (!mode) return;
  
  const data = Object.fromEntries(new FormData(form));
  data.name = title.textContent;
  
  // ADD THIS BLOCK
  if (!data.project_id || !data.tape_recipe_id || !data.created_by) {
    alert('Выберите проект, рецепт и пользователя');
    return;
  }
  
  try {
    if (mode === 'create') {
      const created = await createTape(data);
      
      await loadTapes();
      // keep the form open: switch to edit mode so step buttons keep working
      currentTapeId = created.tape_id;
      mode = 'edit';
      saveBtn.textContent = 'Сохранить изменения';
      
      document.getElementById('0-tape-recipe-materials').hidden = false;
      document.getElementById('0-drying_materials').hidden = false;
      document.getElementById('1-slurry').hidden = false;
      document.getElementById('2-tape').hidden = false;
      
      document.getElementById('0-tape-recipe-materials').open = true;
      document.getElementById('0-drying_materials').open = true;
      
      document.getElementById('1-slurry').open = false;
      document.getElementById('2-tape').open = false;
      
      clearAllDirtySteps();
      showStatus('Изменения сохранены');
      return;
    }
    
    if (mode === 'edit') {
      
      // 1. Update tape general info only
      await updateTape(currentTapeId, data);

      await loadTapes();
      setStepDirty('general_info', false);
      showStatus('Изменения сохранены');
      return;
    }
  } catch (err) {
    console.error(err);
    showStatus('Ошибка сохранения', true);
  }
});

clearBtn.addEventListener('click', () => {
  if (anyDirty()) {
    const ok = confirm('Changes not saved. Are you sure you want to leave?');
    if (!ok) return;
  }
  
  // user chose to leave → clear flags so beforeunload doesn’t keep firing
  clearAllDirtySteps();
  
  resetForm();
});

recipeMaterialsSaveBtn.addEventListener('click', async () => {
  if (!currentTapeId) {
    showStatus('Сначала создайте ленту', true);
    return;
  }

  try {
    await saveSelectedInstances(currentTapeId);
    setStepDirty('recipe_materials', false);
    showStatus('Выбор экземпляров сохранён');
  } catch (err) {
    showStatus(err.message, true);
  }
});

// -------- Drying step helpers (generic for all drying blocks) --------

function getStartedAt(prefix) {
  const date = document.getElementById(`${prefix}-date`)?.value || '';
  const time = document.getElementById(`${prefix}-time`)?.value || '';
  if (!date || !time) return null;
  return `${date}T${time}`;
}

function buildDryingPayload(prefix) {
  return {
    performed_by: Number(document.getElementById(`${prefix}-operator`)?.value) || null,
    started_at: getStartedAt(prefix),
    comments: document.getElementById(`${prefix}-notes`)?.value || null,
    temperature_c: Number(document.getElementById(`${prefix}-temperature`)?.value) || null,
    atmosphere: document.getElementById(`${prefix}-atmosphere`)?.value || null,
    target_duration_min: Number(document.getElementById(`${prefix}-target-duration`)?.value) || null,
    other_parameters: document.getElementById(`${prefix}-other_param`)?.value || null
  };
}

async function saveDryingStep({ code, prefix }) {
  if (!currentTapeId) {
    alert('Сначала создайте ленту');
    return;
  }
  
  const payload = buildDryingPayload(prefix);
  
  const res = await fetch(
    `/api/tapes/${currentTapeId}/steps/by-code/${code}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка сохранения');
  }
}

// Wire all drying save buttons 
[
  { code: 'drying_am',           prefix: '0-drying_am',            btnId: '0-drying_am-save-btn' },
  { code: 'drying_tape',         prefix: '2a-drying_tape',         btnId: '2a-drying_tape-save-btn' },
  { code: 'drying_pressed_tape', prefix: '2b-drying_pressed_tape', btnId: '2b-drying_pressed_tape-save-btn' }
].forEach(cfg => {
  const btn = document.getElementById(cfg.btnId);
  if (!btn) return;
  
  btn.addEventListener('click', async () => {
    try {
      await saveDryingStep(cfg);
      setStepDirty(cfg.code, false);
      showStatus('Изменения сохранены');
    } catch (err) {
      showStatus(err.message, true);
    }
  });
});

const weighingSaveBtn = document.getElementById('1-weighing-save-btn');

weighingSaveBtn.addEventListener('click', async () => {
  
  if (!currentTapeId) {
    alert('Сначала создайте ленту');
    return;
  }
  
  const date = document.getElementById('1-weighing-date').value;
  const time = document.getElementById('1-weighing-time').value;
  
  let startedAt = null;
  if (date && time) {
    startedAt = `${date}T${time}`;
  }
  
  const payload = {
    performed_by: Number(document.getElementById('1-weighing-operator').value) || null,
    started_at: startedAt,
    comments: document.getElementById('1-weighing-notes').value || null
  };
  
  try {
    const res = await fetch(
      `/api/tapes/${currentTapeId}/steps/by-code/weighing`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка сохранения');
    }

    await saveTapeActuals(currentTapeId);
    
    setStepDirty('weighing', false);
    showStatus('Изменения сохранены');
    
  } catch (err) {
    showStatus(err.message, true);
  }
});

// -------- I.2. Save mixing --------

function updateMixParamsVisibility() {
  const drySelect = document.getElementById('1-mixing-dry_mixing_id');
  const wetSelect = document.getElementById('1-mixing-wet_mixing_id');
  
  const dryParams = document.getElementById('mix-dry-params');
  const wetParams = document.getElementById('mix-wet-params');
  
  const dryCode =
  drySelect?.selectedOptions?.[0]?.dataset?.code || '';
  
  const wetCode =
  wetSelect?.selectedOptions?.[0]?.dataset?.code || '';
  
  const hideDry =
  !dryCode ||
  dryCode === 'none' ||
  dryCode === 'hand';
  
  const hideWet =
  !wetCode ||
  wetCode === 'none' ||
  wetCode === 'hand';
  
  dryParams.hidden = hideDry;
  wetParams.hidden = hideWet;
}

// ---- Mixing params show/hide (empty method => hide params) ----
const dryMixSelect = document.getElementById('1-mixing-dry_mixing_id');
const wetMixSelect = document.getElementById('1-mixing-wet_mixing_id');
const dryParamsBox = document.getElementById('mix-dry-params');
const wetParamsBox = document.getElementById('mix-wet-params');
updateMixParamsVisibility();

if (dryMixSelect) dryMixSelect.addEventListener('change', updateMixParamsVisibility);
if (wetMixSelect) wetMixSelect.addEventListener('change', updateMixParamsVisibility);

document.getElementById('1-mixing-save-btn').onclick = async () => {
  
  if (!currentTapeId) {
    alert('Сначала сохраните ленту.');
    return;
  }
  
  // ---- Top-level step fields ----
  const performed_by = document.getElementById('1-mixing-operator').value || null;
  const comments     = document.getElementById('1-mixing-comments').value || null;
  
  const date = document.getElementById('1-mixing-started_at-date').value;
  const time = document.getElementById('1-mixing-started_at-time').value;
  
  let started_at = null;
  if (date && time) {
    started_at = new Date(`${date}T${time}`);
  }
  
  const slurry_volume_ml =
  document.getElementById('1-mixing-slurry_volume_ml').value || null;
  
  const dry_mixing_id =
  document.getElementById('1-mixing-dry_mixing_id').value || null;
  
  const wet_mixing_id =
  document.getElementById('1-mixing-wet_mixing_id').value || null;
  
  // ---- Dry params ----
  const dryDate = document.getElementById('dry-start-date').value;
  const dryTime = document.getElementById('dry-start-time').value;
  
  let dry_start_time = null;
  if (dryDate && dryTime) {
    dry_start_time = new Date(`${dryDate}T${dryTime}`);
  }
  
  const dry_duration_min =
  document.getElementById('dry-duration-min').value || null;
  
  const dry_rpm =
  document.getElementById('dry-rpm').value || null;
  
  // ---- Wet params ----
  const wetDate = document.getElementById('wet-start-date').value;
  const wetTime = document.getElementById('wet-start-time').value;
  
  let wet_start_time = null;
  if (wetDate && wetTime) {
    wet_start_time = new Date(`${wetDate}T${wetTime}`);
  }
  
  const wet_duration_min = document.getElementById('wet-duration-min').value || null;
  const wet_rpm = document.getElementById('wet-rpm').value || null;
  const viscosity_cP = document.getElementById('wet-viscosity_cP').value || null;
  
  // ---- Build payload ----
  const payload = {
    performed_by,
    started_at,
    comments,
    slurry_volume_ml,
    dry_mixing_id,
    dry_start_time,
    dry_duration_min,
    dry_rpm,
    wet_mixing_id,
    wet_start_time,
    wet_duration_min,
    wet_rpm,
    viscosity_cP
  };
  
  const res = await fetch(
    `/api/tapes/${currentTapeId}/steps/by-code/mixing`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );
  
  if (!res.ok) {
    showStatus('Ошибка сохранения этапа перемешивания', true);
    return;
  }
  
  setStepDirty('mixing', false);
  showStatus('Изменения сохранены');
};

// -------- II.1. Save coating --------

function updateCoatingParamsVisibility(applyDefaults = false) {
  const select = document.getElementById('2-coating-coating_id');
  const params = document.getElementById('2-coating-method-preview');
  const gapInput = document.getElementById('2-coating-gap-um');
  const tempInput = document.getElementById('2-coating-temp-c');
  const timeInput = document.getElementById('2-coating-time-min');
  const commentsInput = document.getElementById('2-coating-method-comments');

  if (!select || !params) return;

  const selectedOption = select.selectedOptions[0] || null;
  params.hidden = !select.value;

  if (!select.value || !selectedOption) {
    if (gapInput) gapInput.value = '';
    if (tempInput) tempInput.value = '';
    if (timeInput) timeInput.value = '';
    if (commentsInput) commentsInput.value = '';
    return;
  }

  if (applyDefaults || (gapInput && !gapInput.value)) {
    if (gapInput) gapInput.value = selectedOption.dataset.gapUm || '';
  }
  if (applyDefaults || (tempInput && !tempInput.value)) {
    if (tempInput) tempInput.value = selectedOption.dataset.tempC || '';
  }
  if (applyDefaults || (timeInput && !timeInput.value)) {
    if (timeInput) timeInput.value = selectedOption.dataset.timeMin || '';
  }
  if (applyDefaults || (commentsInput && !commentsInput.value)) {
    if (commentsInput) commentsInput.value = selectedOption.dataset.comments || '';
  }
}

document.getElementById('2-coating-save-btn').onclick = async () => {
  
  const tapeId = currentTapeId;
  const gapValue = document.getElementById('2-coating-gap-um').value;
  
  if (!gapValue || !Number.isFinite(Number(gapValue)) || Number(gapValue) <= 0) {
    showStatus('Укажите зазор, мкм', true);
    return;
  }
  
  const date = document.getElementById('2-coating-date').value;
  const time = document.getElementById('2-coating-time').value;
  
  let started_at = null;
  if (date && time) started_at = `${date}T${time}`;
  
  const payload = {
    performed_by: document.getElementById('2-coating-operator').value || null,
    started_at,
    comments: document.getElementById('2-cathode-tape-notes').value || null,
    foil_id: document.getElementById('2-coating-foil_id').value || null,
    coating_id: document.getElementById('2-coating-coating_id').value || null,
    gap_um: gapValue,
    coat_temp_c: document.getElementById('2-coating-temp-c').value || null,
    coat_time_min: document.getElementById('2-coating-time-min').value || null,
    method_comments: document.getElementById('2-coating-method-comments').value || null
  };
  
  const res = await fetch(`/api/tapes/${tapeId}/steps/by-code/coating`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    showStatus('Ошибка сохранения этапа нанесения', true);
    return;
  }
  
  setStepDirty('coating', false);
  showStatus('Изменения сохранены');
};

document
.getElementById('2-coating-coating_id')
.addEventListener('change', () => updateCoatingParamsVisibility(true));

// -------- II.2. Save calendering --------

function buildCalAppearance() {
  const values = [];
  
  if (document.getElementById('2-cal-shine').checked)
    values.push('Блеск');
  
  if (document.getElementById('2-cal-curl').checked)
    values.push('Закрутка');
  
  if (document.getElementById('2-cal-dots').checked)
    values.push('Точечки');
  
  if (document.getElementById('2-cal-other-check').checked) {
    const other = document.getElementById('2-cal-other-text').value.trim();
    if (other) values.push('Другое: ' + other);
  }
  
  return values.join('; ');
}

document.getElementById('2-calendering-save-btn').onclick = async () => {
  
  const tapeId = currentTapeId;
  
  const date = document.getElementById('2-calendering-date').value;
  const time = document.getElementById('2-calendering-time').value;
  
  let started_at = null;
  if (date && time) started_at = `${date}T${time}`;
  
  const payload = {
    
    performed_by: document.getElementById('2-calendering-operator').value || null,
    started_at: started_at,
    comments: document.getElementById('2-calendering-notes').value || null,
    
    temp_c: document.getElementById('2-calendering-temp_c').value || null,
    
    pressure_value:
    document.getElementById('2-calendering-pressure_value').value || null,
    
    pressure_units:
    document.getElementById('2-calendering-pressure_units').value || null,
    
    draw_speed_m_min:
    document.getElementById('2-calendering-draw_speed_m_min').value || null,
    
    init_thickness_microns:
    document.getElementById('2-calendering-init_thickness_microns').value || null,
    
    final_thickness_microns:
    document.getElementById('2-calendering-final_thickness_microns').value || null,
    
    no_passes:
    document.getElementById('2-calendering-no_passes').value || null,
    
    other_params:
    document.getElementById('2-calendering-other_params').value || null,
    
    appearance: buildCalAppearance()
  };
  
  const res = await fetch(
    `/api/tapes/${tapeId}/steps/by-code/calendering`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );
  
  if (!res.ok) {
    const text = await res.text();
    showStatus(text || 'Ошибка сохранения этапа каландрирования', true);
    return;
  }
  
  await res.json().catch(() => null);
  setStepDirty('calendering', false);
  showStatus('Изменения сохранены');
};

document.getElementById('2-cal-other-check').addEventListener('change', e => {
  document.getElementById('2-cal-other-text').disabled = !e.target.checked;
});

// ---- NOW buttons (scoped to their own fieldset) ----
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.date-time-now-button');
  if (!btn) return;
  
  const scope = btn.closest('.mix-params') || btn.closest('fieldset');
  if (!scope) return;
  
  const dateInput = scope.querySelector('input[type="date"]');
  const timeInput = scope.querySelector('input[type="time"]');
  
  const now = new Date();
  
  if (dateInput) {
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }
  
  if (timeInput) {
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    timeInput.value = `${hh}:${min}`;
  }
});

// -------- Init --------

hideForm();
loadTapes();
loadUsers();
loadProjects();
loadRecipesDropdown();

const dryingAtmosphereSelectIds = [
  '0-drying_am-atmosphere',
  '2a-drying_tape-atmosphere',
  '2b-drying_pressed_tape-atmosphere'
];

dryingAtmosphereSelectIds.forEach(id => {
  loadDryingAtmospheres(
    document.getElementById(id),
    'vacuum'
  ).catch(console.error);
});

loadDryMixingMethods(document.getElementById('1-mixing-dry_mixing_id'))
.then(updateMixParamsVisibility)
.catch(console.error);

loadWetMixingMethods(document.getElementById('1-mixing-wet_mixing_id'))
.then(updateMixParamsVisibility)
.catch(console.error);

loadFoils(document.getElementById('2-coating-foil_id'))
.then(applyDefaultCoatingFoil)
.catch(console.error);

loadCoatingMethods(document.getElementById('2-coating-coating_id'))
.catch(console.error);

updateMixParamsVisibility();

['0-drying_am-date', '0-drying_am-time', '1-weighing-date', '1-weighing-time']
.forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', refreshWeighingDelay);
  el.addEventListener('change', refreshWeighingDelay);
});

['1-weighing-date', '1-weighing-time', '1-mixing-started_at-date', '1-mixing-started_at-time']
.forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', refreshMixingDelay);
  el.addEventListener('change', refreshMixingDelay);
});

['1-mixing-started_at-date', '1-mixing-started_at-time', '2-coating-date', '2-coating-time']
.forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', refreshCoatingDelay);
  el.addEventListener('change', refreshCoatingDelay);
});

['2-coating-date', '2-coating-time', '2a-drying_tape-date', '2a-drying_tape-time']
.forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', refreshDryingTapeDelay);
  el.addEventListener('change', refreshDryingTapeDelay);
});

['2a-drying_tape-date', '2a-drying_tape-time', '2-calendering-date', '2-calendering-time']
.forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', refreshCalenderingDelay);
  el.addEventListener('change', refreshCalenderingDelay);
});

['2-calendering-date', '2-calendering-time', '2b-drying_pressed_tape-date', '2b-drying_pressed_tape-time']
.forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', refreshDryingPressedTapeDelay);
  el.addEventListener('change', refreshDryingPressedTapeDelay);
});      

// Mark mixing as dirty on any change inside the mixing fieldset
(() => {
  const fs = document.getElementById('1-mixing');
  if (!fs) return;
  
  fs.addEventListener('input', () => setStepDirty('mixing', true));
  fs.addEventListener('change', () => setStepDirty('mixing', true));
})();

// Mark recipe/materials as dirty on any edit in the actuals table
(() => {
  const tbody = document.getElementById('slurry-actuals-body');
  if (!tbody) return;
  
  const mark = () => {
    if (window.isRestoringTape) return; // do not mark dirty during restore
    setStepDirty('weighing', true);
  };
  
  tbody.addEventListener('input', mark);
  tbody.addEventListener('change', mark);
})();

// Generic dirty wiring for the remaining step fieldsets
(() => {
  
  const map = {
    '0-drying_am': 'drying_am',
    '1-weighing': 'weighing',
    '2-coating': 'coating',
    '2-drying_tape': 'drying_tape',
    '2-calendering': 'calendering',
    '2-drying_pressed_tape': 'drying_pressed_tape'
  };
  
  Object.entries(map).forEach(([elementId, stepCode]) => {
    
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const mark = () => {
      if (window.isRestoringTape) return;
      setStepDirty(stepCode, true);
    };
    
    el.addEventListener('input', mark);
    el.addEventListener('change', mark);
    
  });
  
})();
