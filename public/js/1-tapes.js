
// -------- State and helpers --------

const addInput = document.getElementById('tape-name');
const nameInput = document.getElementById('tape-name-input');
const form = document.forms['tape-form'];
const title = form.querySelector('h2');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const recipeMaterialsSaveBtn = document.getElementById('0-recipe-materials-save-btn');
const tapesList = document.getElementById('tapesList');

const createdBySelect = document.getElementById('tape-created-by');
const dryingOperatorSelect = document.getElementById('0-drying_am-operator');
const projectSelect   = document.getElementById('project_id');
const tapeTypeSelect  = document.getElementById('tape_type');
const recipeSelect    = document.getElementById('tape-recipe-id'); // already added in HTML

const tapePageState = window.tapePageState = {
  form: {
    mode: null,
    isRestoringTape: false,
    fields: {
      name: '',
      notes: '',
      created_by: '',
      project_id: '',
      tape_type: '',
      tape_recipe_id: '',
      calc_mode: 'from_active_mass',
      target_mass_g: ''
    }
  },
  selection: {
    currentTapeId: null,
    currentTape: null
  },
  recipe: {
    currentLines: [],
    selectedInstancesByLineId: {},
    instanceCacheByMaterialId: {},
    instanceComponentsCache: {},
    restoringActuals: []
  },
  reference: {
    users: [],
    projects: [],
    currentRecipes: [],
    foils: [],
    coatingMethods: [],
    dryMixingMethods: [],
    wetMixingMethods: [],
    dryingAtmospheres: []
  },
  tapes: {
    items: []
  },
  workflow: {
    drying_am: null,
    drying_tape: null,
    drying_pressed_tape: null,
    weighing: null,
    mixing: null,
    coating: null,
    calendering: null
  },
  derived: {
    targetDryMassByLineId: {},
    plannedMassByLineId: {},
    expandedCalculation: []
  },
  ui: {
    name: {
      isEditing: false
    },
    panels: {
      mixing: {
        dryParamsVisible: false,
        wetParamsVisible: false
      }
    },
    delays: {
      weighing: '',
      mixing: '',
      coating: '',
      drying_tape: '',
      calendering: '',
      drying_pressed_tape: '',
      liveSinceLastStep: ''
    },
    sections: {
      visibility: {
        '0-general-info': true,
        '0-tape-recipe-materials': false,
        '0-drying_materials': false,
        '1-slurry': false,
        '2-tape': false,
        'calculations-expanded': true
      },
      open: {
        '0-general-info': true,
        '0-tape-recipe-materials': false,
        '0-drying_materials': false,
        '1-slurry': false,
        '2-tape': false,
        'calculations-expanded': false
      }
    },
    savedSnapshots: {
      general_info: null,
      recipe_materials: null,
      drying_am: null,
      weighing: null,
      mixing: null,
      coating: null,
      drying_tape: null,
      calendering: null,
      drying_pressed_tape: null
    },
    dirtySteps: {
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
    }
  }
};

const state = tapePageState;

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

function renderFormVisibility() {
  if (state.form.mode) {
    showForm();
  } else {
    hideForm();
  }
}

function renderSectionState() {
  Object.entries(state.ui.sections.visibility).forEach(([id, isVisible]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = !isVisible;
  });

  Object.entries(state.ui.sections.open).forEach(([id, isOpen]) => {
    const el = document.getElementById(id);
    if (!el || typeof el.open === 'undefined') return;
    el.open = Boolean(isOpen);
  });
}

function renderPanelState() {
  const dryParams = document.getElementById('mix-dry-params');
  if (dryParams) {
    dryParams.hidden = !state.ui.panels.mixing.dryParamsVisible;
  }

  const wetParams = document.getElementById('mix-wet-params');
  if (wetParams) {
    wetParams.hidden = !state.ui.panels.mixing.wetParamsVisible;
  }

  const coatingParams = document.getElementById('2-coating-params');
  if (coatingParams) {
    coatingParams.hidden = false;
  }
}

function renderDelayState() {
  const delayMap = {
    weighing: '1-weighing-delay',
    mixing: '1-mixing-delay',
    coating: '2-coating-delay',
    drying_tape: '2a-drying_tape-delay',
    calendering: '2-calendering-delay',
    drying_pressed_tape: '2b-drying_pressed_tape-delay'
  };

  Object.entries(delayMap).forEach(([key, elementId]) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = state.ui.delays[key] || '';
  });

  const liveSinceEl = document.getElementById('live-since-last-step');
  if (liveSinceEl) {
    liveSinceEl.textContent = state.ui.delays.liveSinceLastStep || '';
  }
}

function renderTapeForm() {
  writeTopLevelFormStateToDom();
  renderCalcModeLabel();
  if (saveBtn) {
    saveBtn.textContent = state.form.mode === 'edit'
      ? 'Сохранить изменения'
      : 'Создать ленту';
  }
  renderFormVisibility();
  renderSectionState();
  renderPanelState();
}

function setMode(nextMode, { render = true } = {}) {
  state.form.mode = nextMode || null;
  if (render) renderTapeForm();
}

function setTapes(tapes, { render = true } = {}) {
  state.tapes.items = Array.isArray(tapes) ? tapes : [];
  if (state.selection.currentTapeId) {
    state.selection.currentTape =
      state.tapes.items.find((t) => Number(t.tape_id) === Number(state.selection.currentTapeId)) || null;
  }
  if (render) renderTapesList();
}

function setCurrentTape(tape, { mode = null, render = true } = {}) {
  state.selection.currentTape = tape || null;
  state.selection.currentTapeId = tape?.tape_id ?? null;
  if (mode !== null) {
    setMode(mode, { render });
  } else if (render) {
    renderTapeForm();
  }
}

function clearCurrentTapeSelection() {
  setCurrentTape(null);
}

function setSectionVisibility(sectionId, isVisible, { render = true } = {}) {
  state.ui.sections.visibility[sectionId] = Boolean(isVisible);
  if (render) renderSectionState();
}

function setSectionOpen(sectionId, isOpen, { render = true } = {}) {
  state.ui.sections.open[sectionId] = Boolean(isOpen);
  if (render) renderSectionState();
}

function setSectionsVisibility(nextVisibility, { render = true } = {}) {
  state.ui.sections.visibility = {
    ...state.ui.sections.visibility,
    ...nextVisibility
  };
  if (render) renderSectionState();
}

function setSectionsOpen(nextOpen, { render = true } = {}) {
  state.ui.sections.open = {
    ...state.ui.sections.open,
    ...nextOpen
  };
  if (render) renderSectionState();
}

function resetSectionState() {
  state.ui.sections.visibility = {
    '0-general-info': true,
    '0-tape-recipe-materials': false,
    '0-drying_materials': false,
    '1-slurry': false,
    '2-tape': false,
    'calculations-expanded': true
  };
  state.ui.sections.open = {
    '0-general-info': true,
    '0-tape-recipe-materials': false,
    '0-drying_materials': false,
    '1-slurry': false,
    '2-tape': false,
    'calculations-expanded': false
  };
  renderSectionState();
}

function setNameEditing(isEditing, { render = true } = {}) {
  state.ui.name.isEditing = Boolean(isEditing);
  if (render) applyNameStateToDom();
}

function setMixingParamsVisibility({ dryParamsVisible, wetParamsVisible }) {
  state.ui.panels.mixing = {
    dryParamsVisible: Boolean(dryParamsVisible),
    wetParamsVisible: Boolean(wetParamsVisible)
  };
  renderPanelState();
}

function sortForSnapshot(value) {
  if (Array.isArray(value)) {
    return value.map(sortForSnapshot);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortForSnapshot(value[key]);
        return acc;
      }, {});
  }
  return value ?? null;
}

function serializeSnapshot(value) {
  return JSON.stringify(sortForSnapshot(value));
}

function getCurrentSnapshot(stepCode) {
  if (stepCode === 'general_info') {
    return serializeSnapshot({
      name: state.form.fields.name || '',
      notes: state.form.fields.notes || '',
      created_by: state.form.fields.created_by || '',
      project_id: state.form.fields.project_id || '',
      tape_type: state.form.fields.tape_type || '',
      tape_recipe_id: state.form.fields.tape_recipe_id || '',
      calc_mode: state.form.fields.calc_mode || 'from_active_mass',
      target_mass_g: state.form.fields.target_mass_g || ''
    });
  }

  if (stepCode === 'recipe_materials') {
    return serializeSnapshot({
      selectedInstancesByLineId: state.recipe.selectedInstancesByLineId
    });
  }

  if (stepCode === 'drying_am' || stepCode === 'weighing' || stepCode === 'mixing' ||
      stepCode === 'coating' || stepCode === 'drying_tape' ||
      stepCode === 'calendering' || stepCode === 'drying_pressed_tape') {
    return serializeSnapshot(state.workflow[stepCode]);
  }

  return null;
}

function markSavedSnapshot(stepCode) {
  if (!(stepCode in state.ui.savedSnapshots)) return;
  state.ui.savedSnapshots[stepCode] = getCurrentSnapshot(stepCode);
}

function markAllSavedSnapshotsCurrent() {
  Object.keys(state.ui.savedSnapshots).forEach((stepCode) => {
    markSavedSnapshot(stepCode);
  });
}

function refreshDirtyFromSnapshots() {
  if (state.form.isRestoringTape) return;

  Object.keys(state.ui.savedSnapshots).forEach((stepCode) => {
    dirtySteps[stepCode] =
      state.ui.savedSnapshots[stepCode] !== getCurrentSnapshot(stepCode);
  });

  refreshParentDirtyStates();
}

function setRecipeLines(lines) {
  state.recipe.currentLines = Array.isArray(lines) ? lines : [];
}

function setSelectedInstancesByLineId(nextMap) {
  state.recipe.selectedInstancesByLineId = nextMap || {};
  refreshDirtyFromSnapshots();
}

function setSelectedInstanceForLine(recipeLineId, value) {
  setSelectedInstancesByLineId({
    ...state.recipe.selectedInstancesByLineId,
    [recipeLineId]: value || null
  });
}

function setInstanceCacheByMaterialId(nextCache) {
  state.recipe.instanceCacheByMaterialId = nextCache || {};
}

function setInstanceComponentsCache(nextCache) {
  state.recipe.instanceComponentsCache = nextCache || {};
}

function setRestoringActuals(actuals) {
  state.recipe.restoringActuals = Array.isArray(actuals) ? actuals : [];
}

function setFormFields(nextFields, { render = false } = {}) {
  state.form.fields = nextFields || getDefaultTopLevelFormFields();
  refreshDirtyFromSnapshots();
  if (render) renderTapeForm();
}

function setFormField(field, value, { render = false } = {}) {
  setFormFields({
    ...state.form.fields,
    [field]: value
  }, { render });
}

function setReferenceUsers(users) {
  state.reference.users = Array.isArray(users) ? users : [];
}

function setReferenceProjects(projects) {
  state.reference.projects = Array.isArray(projects) ? projects : [];
}

function setReferenceCurrentRecipes(recipes) {
  state.reference.currentRecipes = Array.isArray(recipes) ? recipes : [];
}

function setReferenceFoils(foils) {
  state.reference.foils = Array.isArray(foils) ? foils : [];
}

function setReferenceCoatingMethods(methods) {
  state.reference.coatingMethods = Array.isArray(methods) ? methods : [];
}

function setReferenceDryMixingMethods(items) {
  state.reference.dryMixingMethods = Array.isArray(items) ? items : [];
}

function setReferenceWetMixingMethods(items) {
  state.reference.wetMixingMethods = Array.isArray(items) ? items : [];
}

function setReferenceDryingAtmospheres(items) {
  state.reference.dryingAtmospheres = Array.isArray(items) ? items : [];
}

function setWorkflowState(nextWorkflow, { apply = false } = {}) {
  state.workflow = nextWorkflow || getDefaultWorkflowState();
  refreshDelayState();
  refreshDirtyFromSnapshots();
  if (apply) renderWorkflowState();
}

function setWorkflowStep(stepKey, stepValue, { apply = false, applyFn = null } = {}) {
  state.workflow[stepKey] = stepValue;
  refreshDelayState();
  refreshDirtyFromSnapshots();
  if (applyFn) {
    applyFn();
    return;
  }
  if (apply) renderWorkflowState();
}

function updateWorkflowStepField(stepKey, field, value) {
  setWorkflowStep(stepKey, {
    ...state.workflow[stepKey],
    [field]: value
  });
}

function setWeighingActualsByLineId(nextMap) {
  setWorkflowStep('weighing', {
    ...state.workflow.weighing,
    actualsByLineId: nextMap || {}
  });
}

function setWeighingActualForLine(recipeLineId, patch) {
  const current = state.workflow.weighing.actualsByLineId[recipeLineId] || getDefaultWeighingActual();
  setWeighingActualsByLineId({
    ...state.workflow.weighing.actualsByLineId,
    [recipeLineId]: {
      ...current,
      ...patch
    }
  });
}

function setDerivedCalculationState(nextDerived, { render = true } = {}) {
  state.derived = {
    ...state.derived,
    ...nextDerived
  };
  if (render) renderDerivedState();
}

function mergeRestoringActualsIntoState(restoringActuals = []) {
  const actualsByLineId = { ...state.workflow.weighing.actualsByLineId };
  const selectedInstances = { ...state.recipe.selectedInstancesByLineId };

  restoringActuals.forEach((saved) => {
    const recipeLineId = Number(saved.recipe_line_id);
    actualsByLineId[recipeLineId] = {
      measure_mode: saved.measure_mode || 'mass',
      actual_mass_g: saved.actual_mass_g ?? '',
      actual_volume_ml: saved.actual_volume_ml ?? ''
    };

    if (saved.material_instance_id && !selectedInstances[recipeLineId]) {
      selectedInstances[recipeLineId] = String(saved.material_instance_id);
    }
  });

  setWeighingActualsByLineId(actualsByLineId);
  setSelectedInstancesByLineId(selectedInstances);
}

function resetForm() {
  form.reset();
  
  resetTopLevelFormState();
  resetWorkflowState();
  resetSectionState();
  setMode(null);
  clearCurrentTapeSelection();
  setRecipeLines([]);
  setSelectedInstancesByLineId({});
  setInstanceCacheByMaterialId({});
  setInstanceComponentsCache({});
  setRestoringActuals([]);
  renderWorkflowState();
  renderTapeForm();
  markAllSavedSnapshotsCurrent();
  refreshDirtyFromSnapshots();
}

function getDefaultTopLevelFormFields() {
  return {
    name: '',
    notes: '',
    created_by: '',
    project_id: '',
    tape_type: '',
    tape_recipe_id: '',
    calc_mode: 'from_active_mass',
    target_mass_g: ''
  };
}

function getDefaultWeighingActual() {
  return {
    measure_mode: 'mass',
    actual_mass_g: '',
    actual_volume_ml: ''
  };
}

function getDefaultWorkflowState() {
  return {
    drying_am: {
      performed_by: '',
      date: '',
      time: '',
      comments: '',
      temperature_c: '80',
      atmosphere: 'vacuum',
      target_duration_min: '120',
      other_parameters: ''
    },
    drying_tape: {
      performed_by: '',
      date: '',
      time: '',
      comments: '',
      temperature_c: '80',
      atmosphere: 'vacuum',
      target_duration_min: '120',
      other_parameters: ''
    },
    drying_pressed_tape: {
      performed_by: '',
      date: '',
      time: '',
      comments: '',
      temperature_c: '80',
      atmosphere: 'vacuum',
      target_duration_min: '120',
      other_parameters: ''
    },
    weighing: {
      performed_by: '',
      date: '',
      time: '',
      comments: '',
      actualsByLineId: {}
    },
    mixing: {
      performed_by: '',
      started_at_date: '',
      started_at_time: '',
      comments: '',
      slurry_volume_ml: '',
      dry_mixing_id: '',
      dry_start_date: '',
      dry_start_time: '',
      dry_duration_min: '',
      dry_rpm: '',
      wet_mixing_id: '',
      wet_start_date: '',
      wet_start_time: '',
      wet_duration_min: '',
      wet_rpm: '',
      viscosity_cP: ''
    },
    coating: {
      performed_by: '',
      date: '',
      time: '',
      comments: '',
      foil_id: '',
      coating_id: '',
      gap_um: '',
      coat_temp_c: '',
      coat_time_min: '',
      method_comments: ''
    },
    calendering: {
      performed_by: '',
      date: '',
      time: '',
      comments: '',
      temp_c: '',
      pressure_value: '',
      pressure_units: '',
      draw_speed_m_min: '',
      init_thickness_microns: '',
      final_thickness_microns: '',
      no_passes: '',
      other_params: '',
      shine: false,
      curl: false,
      dots: false,
      other_check: false,
      other_text: ''
    }
  };
}

function resetDerivedCalculationState() {
  setDerivedCalculationState({
    targetDryMassByLineId: {},
    plannedMassByLineId: {},
    expandedCalculation: []
  }, { render: false });
}

function resetWorkflowState() {
  setWorkflowState(getDefaultWorkflowState(), { apply: false });
}

function applyNameStateToDom() {
  const currentName = (state.form.fields.name || '').trim();

  title.textContent = currentName || '— без названия —';
  nameInput.value = currentName;
  const showInput = state.ui.name.isEditing || !currentName;
  nameInput.hidden = !showInput;
  title.hidden = showInput;
}

function renderCalcModeLabel() {
  if (!activeMassLabel) return;
  activeMassLabel.textContent =
    state.form.fields.calc_mode === 'from_slurry_mass'
      ? 'Общая масса суспензии, г'
      : 'Масса активного материала, г';
}

function writeTopLevelFormStateToDom() {
  form.elements['notes'].value = state.form.fields.notes || '';
  form.elements['created_by'].value = state.form.fields.created_by || '';
  form.elements['project_id'].value = state.form.fields.project_id || '';
  form.elements['tape_type'].value = state.form.fields.tape_type || '';
  form.elements['tape_recipe_id'].value = state.form.fields.tape_recipe_id || '';
  form.elements['calc_mode'].value = state.form.fields.calc_mode || 'from_active_mass';
  form.elements['target_mass_g'].value = state.form.fields.target_mass_g || '';
  applyNameStateToDom();
}

function setTopLevelFormState(patch, { render = true } = {}) {
  setFormFields({
    ...state.form.fields,
    ...patch
  }, { render });
}

function resetTopLevelFormState() {
  setFormFields(getDefaultTopLevelFormFields());
  title.textContent = '';
  nameInput.value = '';
  state.ui.name.isEditing = false;
  writeTopLevelFormStateToDom();
}

function splitIsoToDateTime(value) {
  if (!value) return { date: '', time: '' };
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return { date: '', time: '' };
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` };
}

function combineDateAndTime(date, time) {
  if (!date || !time) return null;
  return `${date}T${time}`;
}

function setElValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}

function setElChecked(id, checked) {
  const el = document.getElementById(id);
  if (el) el.checked = Boolean(checked);
}

function renderDryingStep(step, prefix) {
  if (!step) return;
  setElValue(`${prefix}-operator`, step.performed_by);
  setElValue(`${prefix}-date`, step.date);
  setElValue(`${prefix}-time`, step.time);
  setElValue(`${prefix}-notes`, step.comments);
  setElValue(`${prefix}-temperature`, step.temperature_c);
  setElValue(`${prefix}-atmosphere`, step.atmosphere);
  setElValue(`${prefix}-target-duration`, step.target_duration_min);
  setElValue(`${prefix}-other_param`, step.other_parameters);
}

function renderDryingAmStep() {
  renderDryingStep(state.workflow.drying_am, '0-drying_am');
}

function renderDryingCoatedTapeStep() {
  renderDryingStep(state.workflow.drying_tape, '2a-drying_tape');
}

function renderDryingPressedTapeStep() {
  renderDryingStep(state.workflow.drying_pressed_tape, '2b-drying_pressed_tape');
}

function renderWeighingStep() {
  const step = state.workflow.weighing;
  setElValue('1-weighing-operator', step.performed_by);
  setElValue('1-weighing-date', step.date);
  setElValue('1-weighing-time', step.time);
  setElValue('1-weighing-notes', step.comments);
}

function renderMixingStep() {
  const step = state.workflow.mixing;
  setElValue('1-mixing-operator', step.performed_by);
  setElValue('1-mixing-started_at-date', step.started_at_date);
  setElValue('1-mixing-started_at-time', step.started_at_time);
  setElValue('1-mixing-comments', step.comments);
  setElValue('1-mixing-slurry_volume_ml', step.slurry_volume_ml);
  setElValue('1-mixing-dry_mixing_id', step.dry_mixing_id);
  setElValue('dry-start-date', step.dry_start_date);
  setElValue('dry-start-time', step.dry_start_time);
  setElValue('dry-duration-min', step.dry_duration_min);
  setElValue('dry-rpm', step.dry_rpm);
  setElValue('1-mixing-wet_mixing_id', step.wet_mixing_id);
  setElValue('wet-start-date', step.wet_start_date);
  setElValue('wet-start-time', step.wet_start_time);
  setElValue('wet-duration-min', step.wet_duration_min);
  setElValue('wet-rpm', step.wet_rpm);
  setElValue('wet-viscosity_cP', step.viscosity_cP);
  updateMixParamsVisibility();
}

function renderCoatingStep() {
  const step = state.workflow.coating;
  setElValue('2-coating-operator', step.performed_by);
  setElValue('2-coating-date', step.date);
  setElValue('2-coating-time', step.time);
  setElValue('2-cathode-tape-notes', step.comments);
  setElValue('2-coating-foil_id', step.foil_id);
  setElValue('2-coating-coating_id', step.coating_id);
  setElValue('2-coating-gap-um', step.gap_um);
  setElValue('2-coating-temp-c', step.coat_temp_c);
  setElValue('2-coating-time-min', step.coat_time_min);
  setElValue('2-coating-method-comments', step.method_comments);
}

function renderCalenderingStep() {
  const step = state.workflow.calendering;
  setElValue('2-calendering-operator', step.performed_by);
  setElValue('2-calendering-date', step.date);
  setElValue('2-calendering-time', step.time);
  setElValue('2-calendering-notes', step.comments);
  setElValue('2-calendering-temp_c', step.temp_c);
  setElValue('2-calendering-pressure_value', step.pressure_value);
  setElValue('2-calendering-pressure_units', step.pressure_units);
  setElValue('2-calendering-draw_speed_m_min', step.draw_speed_m_min);
  setElValue('2-calendering-init_thickness_microns', step.init_thickness_microns);
  setElValue('2-calendering-final_thickness_microns', step.final_thickness_microns);
  setElValue('2-calendering-no_passes', step.no_passes);
  setElValue('2-calendering-other_params', step.other_params);
  setElChecked('2-cal-shine', step.shine);
  setElChecked('2-cal-curl', step.curl);
  setElChecked('2-cal-dots', step.dots);
  setElChecked('2-cal-other-check', step.other_check);
  setElValue('2-cal-other-text', step.other_text);
  const otherTextEl = document.getElementById('2-cal-other-text');
  if (otherTextEl) otherTextEl.disabled = !step.other_check;
}

function renderWorkflowState() {
  renderDryingAmStep();
  renderDryingCoatedTapeStep();
  renderDryingPressedTapeStep();
  renderWeighingStep();
  renderMixingStep();
  renderCoatingStep();
  renderCalenderingStep();
}

function fillSelect(selectEl, items, valueKey, labelFn, placeholderHtml, selectedValue = '') {
  selectEl.innerHTML = placeholderHtml;
  
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item[valueKey];
    opt.textContent = labelFn(item);
    selectEl.appendChild(opt);
  });
  
  if (selectedValue && [...selectEl.options].some(o => o.value === String(selectedValue))) {
    selectEl.value = String(selectedValue);
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
  if (state.recipe.instanceCacheByMaterialId[materialId]) {
    return state.recipe.instanceCacheByMaterialId[materialId];
  }
  
  const res = await fetch(`/api/materials/${materialId}/instances`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки экземпляров материала');
  }
  
  const data = await res.json();
  state.recipe.instanceCacheByMaterialId[materialId] = data;
  
  return data;
}

async function loadMaterialInstancesForRecipeLines(lines) {
  const uniqueMaterialIds = [...new Set(
    (Array.isArray(lines) ? lines : [])
      .map((line) => Number(line.material_id))
      .filter((materialId) => Number.isFinite(materialId) && materialId > 0)
  )];

  if (!uniqueMaterialIds.length) {
    setInstanceCacheByMaterialId({});
    return;
  }

  const nextCache = { ...state.recipe.instanceCacheByMaterialId };

  await Promise.all(uniqueMaterialIds.map(async (materialId) => {
    if (!nextCache[materialId]) {
      nextCache[materialId] = await fetchMaterialInstances(materialId);
    }
  }));

  setInstanceCacheByMaterialId(nextCache);
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
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки списка лент');
  }
  return res.json();
}

async function loadTapes() {
  try {
    const tapes = await fetchTapes();
    setTapes(Array.isArray(tapes) ? tapes : []);
  } catch (err) {
    console.error(err);
    setTapes([]);
    showStatus(err.message || 'Ошибка загрузки списка лент', true);
  }
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

  for (const line of state.recipe.currentLines) {
    const recipeLineId = line.recipe_line_id;
    const instanceId = state.recipe.selectedInstancesByLineId[recipeLineId];

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

  for (const line of state.recipe.currentLines) {
    const recipeLineId = line.recipe_line_id;
    const instanceId = state.recipe.selectedInstancesByLineId[recipeLineId];

    if (!instanceId) continue;
    const actual = state.workflow.weighing.actualsByLineId[recipeLineId] || getDefaultWeighingActual();
    const measureMode = actual.measure_mode || 'mass';
    const value = measureMode === 'volume'
      ? Number(actual.actual_volume_ml)
      : Number(actual.actual_mass_g);

    const payload = {
      recipe_line_id: recipeLineId,
      material_instance_id: Number(instanceId),
      measure_mode: measureMode,
      actual_mass_g: null,
      actual_volume_ml: null
    };

    if (Number.isFinite(value) && value > 0) {
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
  setReferenceDryingAtmospheres(items);
  
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
  setReferenceDryMixingMethods(items);
  
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
  setReferenceWetMixingMethods(items);
  
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
  const value = state.recipe.selectedInstancesByLineId[recipeLineId] || '';
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

function renderRecipeLines() {
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
  
  state.recipe.currentLines.forEach(line => {
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

    const slurryPlaceholderOpt = document.createElement('option');
    slurryPlaceholderOpt.value = '';
    slurryPlaceholderOpt.textContent = '— выбрать экземпляр —';
    slurryInstanceSelect.appendChild(slurryPlaceholderOpt);
    
    const instances = state.recipe.instanceCacheByMaterialId[line.material_id] || [];
    const prev = state.recipe.selectedInstancesByLineId[line.recipe_line_id] || '';

    instances
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .forEach(inst => {
        const opt1 = document.createElement('option');
        opt1.value = inst.material_instance_id;
        opt1.textContent = inst.name || `ID ${inst.material_instance_id}`;
        instanceSelect.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = inst.material_instance_id;
        opt2.textContent = inst.name || `ID ${inst.material_instance_id}`;
        slurryInstanceSelect.appendChild(opt2);
      });

    if (prev) {
      const prevValue = String(prev);
      if ([...instanceSelect.options].some((option) => option.value === prevValue)) {
        instanceSelect.value = prevValue;
      }
      if ([...slurryInstanceSelect.options].some((option) => option.value === prevValue)) {
        slurryInstanceSelect.value = prevValue;
      }
    }
    
    // store selection in state
    function setInstanceForLine(recipeLineId, value) {
      setSelectedInstanceForLine(recipeLineId, value);
      syncInstanceSelectsForLine(recipeLineId);
      recalculatePlannedMasses();
    }
    
    instanceSelect.addEventListener('change', () => {
      setInstanceForLine(line.recipe_line_id, instanceSelect.value || '');
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

    const actualState = state.workflow.weighing.actualsByLineId[line.recipe_line_id] || getDefaultWeighingActual();
    modeSelect.value = actualState.measure_mode || 'mass';
    valueInput.value = modeSelect.value === 'volume'
      ? (actualState.actual_volume_ml ?? '')
      : (actualState.actual_mass_g ?? '');

    modeSelect.addEventListener('change', () => {
      const nextMode = modeSelect.value || 'mass';
      const currentActual = state.workflow.weighing.actualsByLineId[line.recipe_line_id] || getDefaultWeighingActual();
      const nextValue = nextMode === 'volume'
        ? (currentActual.actual_volume_ml ?? '')
        : (currentActual.actual_mass_g ?? '');

      setWeighingActualForLine(line.recipe_line_id, nextMode === 'volume'
        ? { measure_mode: nextMode, actual_mass_g: '' }
        : { measure_mode: nextMode, actual_volume_ml: '' });
      valueInput.value = nextValue;
    });

    valueInput.addEventListener('input', () => {
      const measureMode = (state.workflow.weighing.actualsByLineId[line.recipe_line_id]?.measure_mode) || modeSelect.value || 'mass';
      setWeighingActualForLine(line.recipe_line_id, measureMode === 'volume'
        ? { actual_volume_ml: valueInput.value }
        : { actual_mass_g: valueInput.value });
    });

  });

  applyDefaultCoatingFoil();
}

function clearRecipeLines() {
  const container = document.getElementById('recipe-lines-container');
  if (container) {
    container.innerHTML = '';
  }
  const slurryBody = document.getElementById('slurry-actuals-body');
  if (slurryBody) {
    slurryBody.innerHTML = '';
  }
  resetDerivedCalculationState();
  renderDerivedState();
}

function clearRecipeStateAndUi({ clearRecipeField = false } = {}) {
  setRecipeLines([]);
  setSelectedInstancesByLineId({});
  setInstanceCacheByMaterialId({});
  setWeighingActualsByLineId({});
  setRestoringActuals([]);

  if (clearRecipeField) {
    setFormFields({
      ...state.form.fields,
      tape_recipe_id: ''
    });
  }

  clearRecipeLines();
}

function renderDerivedState() {
  const rows = Array.from(
    document.querySelectorAll('#recipe-lines-container .recipe-line-row')
  );

  rows.forEach(row => {
    const lineId = Number(row.dataset.recipeLineId);

    const targetDrySpan = row.querySelector('.target-dry-mass');
    if (targetDrySpan) {
      const value = state.derived.targetDryMassByLineId[lineId];
      targetDrySpan.textContent = Number.isFinite(value) ? value.toFixed(4) : '';
    }

    const plannedSpan = row.querySelector('.planned-mass');
    if (plannedSpan) {
      const value = state.derived.plannedMassByLineId[lineId];
      plannedSpan.textContent = Number.isFinite(value) ? value.toFixed(4) : '';
    }

    const slurryPlannedCell = document.querySelector(
      `.planned-amount-cell[data-recipe-line-id="${lineId}"]`
    );
    if (slurryPlannedCell) {
      const value = state.derived.plannedMassByLineId[lineId];
      slurryPlannedCell.textContent = Number.isFinite(value) ? value.toFixed(4) : '';
    }
  });

  renderExpandedCalculation();
}

function renderExpandedCalculation() {
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
  
  state.derived.expandedCalculation.forEach(block => {
    
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

function renderUsersSelects() {
  const placeholder = '<option value="">— выбрать пользователя —</option>';

  fillSelect(
    createdBySelect,
    state.reference.users,
    'user_id',
    (u) => u.name,
    placeholder,
    state.form.fields.created_by
  );

  const operatorSelects = Array.from(document.querySelectorAll('select[id$="-operator"]'));
  operatorSelects.forEach((sel) => {
    let selectedValue = '';

    if (sel.id === '0-drying_am-operator') selectedValue = state.workflow.drying_am.performed_by;
    if (sel.id === '1-weighing-operator') selectedValue = state.workflow.weighing.performed_by;
    if (sel.id === '1-mixing-operator') selectedValue = state.workflow.mixing.performed_by;
    if (sel.id === '2-coating-operator') selectedValue = state.workflow.coating.performed_by;
    if (sel.id === '2a-drying_tape-operator') selectedValue = state.workflow.drying_tape.performed_by;
    if (sel.id === '2-calendering-operator') selectedValue = state.workflow.calendering.performed_by;
    if (sel.id === '2b-drying_pressed_tape-operator') selectedValue = state.workflow.drying_pressed_tape.performed_by;

    fillSelect(
      sel,
      state.reference.users,
      'user_id',
      (u) => u.name,
      placeholder,
      selectedValue
    );
  });
}

function renderProjectsSelect() {
  fillSelect(
    projectSelect,
    state.reference.projects,
    'project_id',
    (p) => p.name,
    '<option value="">— выбрать проект —</option>',
    state.form.fields.project_id
  );
}

function renderRecipesSelect() {
  fillSelect(
    recipeSelect,
    state.reference.currentRecipes,
    'tape_recipe_id',
    (r) => (r.variant_label ? `${r.name} — ${r.variant_label}` : r.name),
    '<option value="">— выбрать рецепт —</option>',
    state.form.fields.tape_recipe_id
  );
}

function renderFoilsSelect() {
  const select = document.getElementById('2-coating-foil_id');
  if (!select) return;

  fillSelect(
    select,
    state.reference.foils,
    'foil_id',
    (f) => f.type,
    '<option value="">— выбрать фольгу —</option>',
    state.workflow.coating.foil_id
  );
}

function renderCoatingMethodsSelect() {
  const select = document.getElementById('2-coating-coating_id');
  if (!select) return;

  select.innerHTML = '<option value="">— выбрать метод —</option>';

  state.reference.coatingMethods.forEach((method) => {
    const opt = document.createElement('option');
    opt.value = method.coating_id;
    opt.textContent = method.comments || method.name;
    select.appendChild(opt);
  });

  if (
    state.workflow.coating.coating_id &&
    [...select.options].some((option) => option.value === String(state.workflow.coating.coating_id))
  ) {
    select.value = String(state.workflow.coating.coating_id);
  }
}

function getInstanceNameFromState(materialId, instanceId) {
  const instances = state.recipe.instanceCacheByMaterialId[materialId] || [];
  const match = instances.find((inst) => String(inst.material_instance_id) === String(instanceId));
  return match?.name || '';
}

function recalculatePlannedMasses() {
  const mode = state.form.fields.calc_mode || 'from_active_mass';
  const inputValue = Number(state.form.fields.target_mass_g);
  
  resetDerivedCalculationState();
  
  if (!state.recipe.currentLines.length) {
    renderDerivedState();
    return;
  }
  if (!Number.isFinite(inputValue) || inputValue <= 0) {
    renderDerivedState();
    return;
  }
  
  let target; // active dry mass (g)
  
  if (mode !== 'from_active_mass' && mode !== 'from_slurry_mass') {
    renderDerivedState();
    return;
  }
  
  if (mode === 'from_active_mass') {
    target = inputValue;
  }
  
  if (mode === 'from_slurry_mass' && !Number.isFinite(inputValue)) {
    renderDerivedState();
    return;
  }
  
  // Find active material line
  const activeLine = state.recipe.currentLines.find(l =>
    l.recipe_role === 'cathode_active' ||
    l.recipe_role === 'anode_active'
  );
  
  if (!activeLine) {
    renderDerivedState();
    return;
  }
  if (!Number.isFinite(Number(activeLine.slurry_percent))) {
    renderDerivedState();
    return;
  }
  
  const activePercent = Number(activeLine.slurry_percent);
  if (!Number.isFinite(activePercent) || activePercent <= 0) {
    renderDerivedState();
    return;
  }
  
  if (mode === 'from_slurry_mass') {
    const totalWetMass = inputValue;
    
    const totalDryPercent = state.recipe.currentLines
    .filter(l => l.include_in_pct)
    .reduce((sum, l) => sum + Number(l.slurry_percent || 0), 0);
    if (totalDryPercent > 100) {
      renderDerivedState();
      return;
    }
    if (!Number.isFinite(totalDryPercent) || totalDryPercent <= 0) {
      renderDerivedState();
      return;
    }
    
    const totalDryMassFromWet = totalWetMass * (totalDryPercent / 100);
    
    target = totalDryMassFromWet * (activePercent / totalDryPercent);
  }
  
  // Total dry mass = total dry solids mass required
  // derived from requested active mass and active material fraction
  if (!Number.isFinite(target) || target <= 0) {
    renderDerivedState();
    return;
  }
  if (activePercent > 100) {
    renderDerivedState();
    return;
  }
  const totalDryMass = target / (activePercent / 100);
  
  const lineMap = {};
  state.recipe.currentLines.forEach(l => {
    lineMap[l.recipe_line_id] = l;
  });
  
  const expandedData = [];
  
  // 1) Build TARGET dry mass per material_id from recipe lines
  const targetDryByMaterialId = {};   // { material_id: target_dry_g }
  const remainingDryByMaterialId = {}; // { material_id: remaining_dry_g }
  
  // Only lines with include_in_pct=true (i.e., slurry_percent present) define dry targets
  state.recipe.currentLines.forEach(l => {
    if (!l || !l.include_in_pct) return;
    if (l.slurry_percent === null || l.slurry_percent === undefined || l.slurry_percent === '') return;
    
    const pct = Number(l.slurry_percent);
    if (!Number.isFinite(pct) || pct <= 0) return;
    
    const matId = Number(l.material_id);
    if (!Number.isFinite(matId)) return;
    
    const dry = totalDryMass * (pct / 100);
    
    targetDryByMaterialId[matId] = (targetDryByMaterialId[matId] || 0) + dry;
  });
  
  state.recipe.currentLines.forEach((line) => {
    const lineId = Number(line.recipe_line_id);
    if (!line) return;

    const matId = Number(line.material_id);
    const value = targetDryByMaterialId[matId];
    state.derived.targetDryMassByLineId[lineId] = Number.isFinite(value) ? value : null;
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
  
  for (const line of state.recipe.currentLines) {
    const lineId = Number(line.recipe_line_id);
    if (!line) continue;
    
    const selectedInstanceId = state.recipe.selectedInstancesByLineId[lineId];
    
    if (!selectedInstanceId) {
      state.derived.plannedMassByLineId[lineId] = null;
      continue;
    }
    
    const lineMaterialId = Number(line.material_id);
    const needDry = Number(remainingDryByMaterialId[lineMaterialId] || 0);
    
    // If this line's material is already satisfied by previous mixtures, show 0.0000 g to weigh
    if (!Number.isFinite(needDry) || needDry <= 0) {
      state.derived.plannedMassByLineId[lineId] = 0;
      continue;
    }
    
    // Ensure composition is loaded
    if (!state.recipe.instanceComponentsCache[selectedInstanceId]) {
      fetchInstanceComponents(selectedInstanceId)
      .then(components => {
        setInstanceComponentsCache({
          ...state.recipe.instanceComponentsCache,
          [selectedInstanceId]: components
        });
        recalculatePlannedMasses(); // re-run after loading
      })
      .catch(console.error);
      
      continue; // wait until components are loaded
    }
    
    let components = state.recipe.instanceComponentsCache[selectedInstanceId];
    
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
      state.derived.plannedMassByLineId[lineId] = null;
      continue;
    }
    
    // Required instance mass to supply the remaining dry mass of this line's material
    // (This is the "to weigh" mass of the instance.)
    const instanceMassToWeigh = needDry / fLine;
    
    expandedData.push({
      role: recipeRoleLabel(line.recipe_role),
      material: line.material_name,
      instanceName: getInstanceNameFromState(line.material_id, selectedInstanceId),
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
    
    state.derived.plannedMassByLineId[lineId] = instanceMassToWeigh;
    
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
    const aIndex = state.recipe.currentLines.findIndex(l =>
      recipeRoleLabel(l.recipe_role) === a.role &&
      l.material_name === a.material
    );
    const bIndex = state.recipe.currentLines.findIndex(l =>
      recipeRoleLabel(l.recipe_role) === b.role &&
      l.material_name === b.material
    );
    return aIndex - bIndex;
  });
  
  setDerivedCalculationState({ expandedCalculation: expandedData });
}

function renderTapesList() {
  tapesList.innerHTML = '';

  if (!Array.isArray(state.tapes.items) || state.tapes.items.length === 0) {
    const li = document.createElement('li');
    li.className = 'user-row';
    li.textContent = 'Ленты не найдены';
    tapesList.appendChild(li);
    return;
  }
  
  state.tapes.items.forEach(t => {
    const li = document.createElement('li');
    li.className = 'user-row';
    
    const info = document.createElement('div');
    info.className = 'user-info';
    
    const nameSpan = document.createElement('strong');
    nameSpan.textContent = t.name || '— без названия —';

    const statusSpan = document.createElement('small');
    statusSpan.style.color = '#666';
    statusSpan.textContent = ` — Статус: ${t.workflow_status_label || 'Выбор экземпляров'}`;
    
    const dateSpan = document.createElement('small');
    dateSpan.style.color = '#666';
    dateSpan.textContent =
    ' — ' + new Date(t.created_at).toLocaleDateString();
    
    info.appendChild(nameSpan);
    info.appendChild(statusSpan);
    info.appendChild(dateSpan);
    
    const actions = document.createElement('div');
    actions.className = 'actions';
    
    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️';

    editBtn.onclick = async() => {
      try {
        const restoreData = await fetchTapeRestoreData(t);
        normalizeTapeRestoreDataIntoState(restoreData);
        await renderTapeRestoreFromState(restoreData);
      } catch (err) {
        console.error(err);
        showStatus('Ошибка загрузки ленты', true);
      }
    };
    
    
    const duplicateBtn = document.createElement('button');
    duplicateBtn.textContent = '📄';
    
    duplicateBtn.onclick = () => {
      clearCurrentTapeSelection();
      setMode('create');
      clearCurrentTapeSelection();
      
      const copyName = t.name + ' (копия)';
      resetSectionState();
      setTopLevelFormState({
        ...getDefaultTopLevelFormFields(),
        name: copyName,
        notes: t.notes || ''
      });
      setNameEditing(false);
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

async function fetchTapeRestoreData(tape) {
  const tapeId = Number(tape?.tape_id);
  if (!Number.isInteger(tapeId)) {
    throw new Error('Некорректный tape_id');
  }

  const stepCodes = ['drying_am', 'weighing', 'mixing', 'coating', 'drying_tape', 'calendering', 'drying_pressed_tape'];

  const stepEntries = await Promise.all(stepCodes.map(async (code) => {
    const res = await fetch(`/api/tapes/${tapeId}/steps/by-code/${code}`);
    if (!res.ok) {
      throw new Error(`Restore failed for ${code}`);
    }
    return [code, await res.json()];
  }));

  const actuals = tape.tape_recipe_id ? await fetchTapeActuals(tapeId) : [];

  return {
    tape,
    stepsByCode: Object.fromEntries(stepEntries),
    actuals
  };
}

function normalizeDryingRestoreStep(drying) {
  if (!drying) return getDefaultWorkflowState().drying_am;
  const { date, time } = splitIsoToDateTime(drying.started_at);
  return {
    performed_by: String(drying.performed_by ?? ''),
    date,
    time,
    comments: drying.comments ?? '',
    temperature_c: drying.temperature_c ?? '',
    atmosphere: drying.atmosphere ?? 'vacuum',
    target_duration_min: drying.target_duration_min ?? '',
    other_parameters: drying.other_parameters ?? ''
  };
}

function normalizeTapeRestoreDataIntoState(restoreData) {
  const { tape, stepsByCode, actuals } = restoreData;
  const defaults = getDefaultWorkflowState();

  state.form.isRestoringTape = true;
  setCurrentTape(tape, { mode: 'edit', render: false });
  setNameEditing(false, { render: false });

  setSectionsVisibility({
    '0-general-info': true,
    '0-tape-recipe-materials': true,
    '0-drying_materials': true,
    '1-slurry': true,
    '2-tape': true
  }, { render: false });
  setSectionsOpen({
    '0-general-info': false,
    '0-tape-recipe-materials': false,
    '0-drying_materials': false,
    '1-slurry': false,
    '2-tape': false
  }, { render: false });

  setTopLevelFormState({
    name: (tape?.name || '').trim(),
    notes: tape?.notes || '',
    created_by: tape?.created_by || '',
    project_id: tape?.project_id || '',
    tape_type: tape?.role || '',
    tape_recipe_id: tape?.tape_recipe_id || '',
    calc_mode: tape?.calc_mode || 'from_active_mass',
    target_mass_g: tape?.target_mass_g || ''
  }, { render: false });

  const restoredSelections = {};
  actuals.forEach((a) => {
    if (a.material_instance_id) {
      restoredSelections[a.recipe_line_id] = String(a.material_instance_id);
    }
  });

  setSelectedInstancesByLineId(restoredSelections);
  setRestoringActuals(actuals);

  setWorkflowStep('drying_am', normalizeDryingRestoreStep(stepsByCode.drying_am));
  setWorkflowStep('drying_tape', normalizeDryingRestoreStep(stepsByCode.drying_tape));
  setWorkflowStep('drying_pressed_tape', normalizeDryingRestoreStep(stepsByCode.drying_pressed_tape));

  if (stepsByCode.weighing) {
    const { date, time } = splitIsoToDateTime(stepsByCode.weighing.started_at);
    setWorkflowStep('weighing', {
      ...defaults.weighing,
      performed_by: String(stepsByCode.weighing.performed_by ?? ''),
      date,
      time,
      comments: stepsByCode.weighing.comments ?? ''
    });
  } else {
    setWorkflowStep('weighing', defaults.weighing);
  }

  if (stepsByCode.mixing) {
    const started = splitIsoToDateTime(stepsByCode.mixing.started_at);
    const dryStarted = splitIsoToDateTime(stepsByCode.mixing.dry_start_time);
    const wetStarted = splitIsoToDateTime(stepsByCode.mixing.wet_start_time);
    setWorkflowStep('mixing', {
      ...defaults.mixing,
      performed_by: String(stepsByCode.mixing.performed_by ?? ''),
      started_at_date: started.date,
      started_at_time: started.time,
      comments: stepsByCode.mixing.comments ?? '',
      slurry_volume_ml: stepsByCode.mixing.slurry_volume_ml ?? '',
      dry_mixing_id: stepsByCode.mixing.dry_mixing_id ?? '',
      dry_start_date: dryStarted.date,
      dry_start_time: dryStarted.time,
      dry_duration_min: stepsByCode.mixing.dry_duration_min ?? '',
      dry_rpm: stepsByCode.mixing.dry_rpm ?? '',
      wet_mixing_id: stepsByCode.mixing.wet_mixing_id ?? '',
      wet_start_date: wetStarted.date,
      wet_start_time: wetStarted.time,
      wet_duration_min: stepsByCode.mixing.wet_duration_min ?? '',
      wet_rpm: stepsByCode.mixing.wet_rpm ?? '',
      viscosity_cP: stepsByCode.mixing.viscosity_cp ?? ''
    });
  } else {
    setWorkflowStep('mixing', defaults.mixing);
  }

  if (stepsByCode.coating) {
    const started = splitIsoToDateTime(stepsByCode.coating.started_at);
    setWorkflowStep('coating', {
      ...defaults.coating,
      performed_by: String(stepsByCode.coating.performed_by ?? ''),
      date: started.date,
      time: started.time,
      comments: stepsByCode.coating.comments ?? '',
      foil_id: stepsByCode.coating.foil_id ?? '',
      coating_id: stepsByCode.coating.coating_id ?? '',
      gap_um: stepsByCode.coating.gap_um ?? '',
      coat_temp_c: stepsByCode.coating.coat_temp_c ?? '',
      coat_time_min: stepsByCode.coating.coat_time_min ?? '',
      method_comments: stepsByCode.coating.method_comments ?? ''
    });
  } else {
    setWorkflowStep('coating', defaults.coating);
  }

  if (stepsByCode.calendering) {
    const started = splitIsoToDateTime(stepsByCode.calendering.started_at);
    const appearance = stepsByCode.calendering.appearance || '';
    setWorkflowStep('calendering', {
      ...defaults.calendering,
      performed_by: String(stepsByCode.calendering.performed_by ?? ''),
      date: started.date,
      time: started.time,
      comments: stepsByCode.calendering.comments ?? '',
      temp_c: stepsByCode.calendering.temp_c ?? '',
      pressure_value: stepsByCode.calendering.pressure_value ?? '',
      pressure_units: stepsByCode.calendering.pressure_units ?? '',
      draw_speed_m_min: stepsByCode.calendering.draw_speed_m_min ?? '',
      init_thickness_microns: stepsByCode.calendering.init_thickness_microns ?? '',
      final_thickness_microns: stepsByCode.calendering.final_thickness_microns ?? '',
      no_passes: stepsByCode.calendering.no_passes ?? '',
      other_params: stepsByCode.calendering.other_params ?? '',
      shine: appearance.includes('Блеск'),
      curl: appearance.includes('Закрутка'),
      dots: appearance.includes('Точечки'),
      other_check: appearance.includes('Другое:'),
      other_text: appearance.includes('Другое:')
        ? appearance.split('Другое:')[1]?.split(';')[0]?.trim() || ''
        : ''
    });
  } else {
    setWorkflowStep('calendering', defaults.calendering);
  }
}

async function renderTapeRestoreFromState(restoreData) {
  const currentName = (restoreData.tape?.name || '').trim();

  await loadRecipesDropdown({
    selectedValue: state.form.fields.tape_recipe_id,
    clearOnInvalid: true
  });
  renderTapeForm();

  if (state.form.fields.tape_recipe_id) {
    await loadRecipeLinesIntoStateAndRender(state.form.fields.tape_recipe_id, {
      restoringActuals: [...state.recipe.restoringActuals]
    });
  } else {
    clearRecipeStateAndUi({ clearRecipeField: false });
    markAllSavedSnapshotsCurrent();
    setRestoringActuals([]);
    state.form.isRestoringTape = false;
    refreshDirtyFromSnapshots();
  }

  renderWorkflowState();

  refreshDelayState();

  if (!currentName) {
    nameInput.focus();
  }
}

// -------- Status helper --------

const statusBox = document.querySelector('.status-feedback');
const inlineStatusTimeouts = new WeakMap();
let pendingSavePromise = null;

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

function getInlineStatusEl(buttonId) {
  const button = document.getElementById(buttonId);
  if (!button) return null;

  const statusEl = button.nextElementSibling;
  if (statusEl && statusEl.classList.contains('inline-save-status')) {
    return statusEl;
  }

  return null;
}

function showInlineStatus(buttonId, msg, isError = false) {
  const statusEl = getInlineStatusEl(buttonId);
  if (!statusEl) {
    showStatus(msg, isError);
    return;
  }

  statusEl.textContent = msg;
  statusEl.classList.toggle('is-error', Boolean(isError));

  const existingTimeout = inlineStatusTimeouts.get(statusEl);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const timeoutId = setTimeout(() => {
    if (statusEl.textContent === msg) {
      statusEl.textContent = '';
      statusEl.classList.remove('is-error');
    }
    inlineStatusTimeouts.delete(statusEl);
  }, 1800);

  inlineStatusTimeouts.set(statusEl, timeoutId);
}

function trackPendingSave(promise) {
  const tracked = Promise.resolve(promise).finally(() => {
    if (pendingSavePromise === tracked) {
      pendingSavePromise = null;
    }
  });

  pendingSavePromise = tracked;
  return tracked;
}

async function waitForPendingSave() {
  if (!pendingSavePromise) return;
  await pendingSavePromise.catch(() => {});
}

// -------- Unsaved changes (dirty flags) --------

const dirtySteps = state.ui.dirtySteps;

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

function renderDirtyState() {
  Object.keys(dirtySteps).forEach((stepCode) => {
    updateDirtyMarker(stepCode);
  });
}

function refreshParentDirtyStates() {
  Object.entries(parentDirtyMap).forEach(([parent, children]) => {
    dirtySteps[parent] = children.some((child) => Boolean(dirtySteps[child]));
  });
  renderDirtyState();
}

function setStepDirty(stepCode, isDirty) {
  // Ignore programmatic restore for General Info (edit-mode loading)
  if (stepCode === 'general_info' && state.form.isRestoringTape && isDirty) return;
  
  dirtySteps[stepCode] = Boolean(isDirty);
  renderDirtyState();
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
      if (state.form.isRestoringTape) return;  // ignore programmatic restore
      refreshDirtyFromSnapshots();
    };
    
    el.addEventListener('input', mark);
    el.addEventListener('change', mark);
    
  });
})();
// -------- Time since previous step (helpers) --------

function parseDateTimeValue(dateValue, timeValue) {
  const d = dateValue || '';
  const t = timeValue || '';
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

function getDelayTextFromDates(prev, cur) {
  if (!prev || !cur) {
    return '';
  }
  
  const ms = cur.getTime() - prev.getTime();
  const text = formatDurationMs(ms);
  
  return text ? `Время с прошлого этапа: ${text}` : '';
}

// -------- Live timer since last step --------

let liveSinceTimerId = null;

function getLatestStepStart() {
  let latest = null;
  
  const stepStarts = [
    parseDateTimeValue(state.workflow.drying_am.date, state.workflow.drying_am.time),
    parseDateTimeValue(state.workflow.weighing.date, state.workflow.weighing.time),
    parseDateTimeValue(state.workflow.mixing.started_at_date, state.workflow.mixing.started_at_time),
    parseDateTimeValue(state.workflow.coating.date, state.workflow.coating.time),
    parseDateTimeValue(state.workflow.drying_tape.date, state.workflow.drying_tape.time),
    parseDateTimeValue(state.workflow.calendering.date, state.workflow.calendering.time),
    parseDateTimeValue(state.workflow.drying_pressed_tape.date, state.workflow.drying_pressed_tape.time)
  ];

  stepStarts.forEach((dt) => {
    if (!dt) return;
    if (!latest || dt.getTime() > latest.getTime()) latest = dt;
  });
  
  return latest;
}

function refreshDelayState() {
  state.ui.delays.weighing = getDelayTextFromDates(
    parseDateTimeValue(state.workflow.drying_am.date, state.workflow.drying_am.time),
    parseDateTimeValue(state.workflow.weighing.date, state.workflow.weighing.time)
  );
  state.ui.delays.mixing = getDelayTextFromDates(
    parseDateTimeValue(state.workflow.weighing.date, state.workflow.weighing.time),
    parseDateTimeValue(state.workflow.mixing.started_at_date, state.workflow.mixing.started_at_time)
  );
  state.ui.delays.coating = getDelayTextFromDates(
    parseDateTimeValue(state.workflow.mixing.started_at_date, state.workflow.mixing.started_at_time),
    parseDateTimeValue(state.workflow.coating.date, state.workflow.coating.time)
  );
  state.ui.delays.drying_tape = getDelayTextFromDates(
    parseDateTimeValue(state.workflow.coating.date, state.workflow.coating.time),
    parseDateTimeValue(state.workflow.drying_tape.date, state.workflow.drying_tape.time)
  );
  state.ui.delays.calendering = getDelayTextFromDates(
    parseDateTimeValue(state.workflow.drying_tape.date, state.workflow.drying_tape.time),
    parseDateTimeValue(state.workflow.calendering.date, state.workflow.calendering.time)
  );
  state.ui.delays.drying_pressed_tape = getDelayTextFromDates(
    parseDateTimeValue(state.workflow.calendering.date, state.workflow.calendering.time),
    parseDateTimeValue(state.workflow.drying_pressed_tape.date, state.workflow.drying_pressed_tape.time)
  );

  const latest = getLatestStepStart();
  if (!latest) {
    state.ui.delays.liveSinceLastStep = '';
    renderDelayState();
    return;
  }
  
  const ms = Date.now() - latest.getTime();
  const text = formatDurationMs(ms);
  
  state.ui.delays.liveSinceLastStep = text ? `С момента последнего этапа: ${text}` : '';
  renderDelayState();
}

function startLiveSinceLastStepTimer() {
  stopLiveSinceLastStepTimer();
  refreshDelayState();
  liveSinceTimerId = setInterval(refreshDelayState, 1000);
}

function stopLiveSinceLastStepTimer() {
  if (liveSinceTimerId) {
    clearInterval(liveSinceTimerId);
    liveSinceTimerId = null;
  }
}

// -------- Reference dropdowns --------

async function loadUsers() {
  try {
    const users = await fetchUsers();
    setReferenceUsers(users);
    renderUsersSelects();
  } catch (err) {
    logLoadError(err);
  }
}

async function loadProjects() {
  try {
    const projects = await fetchProjects();
    setReferenceProjects(projects);
    renderProjectsSelect();
  } catch (err) {
    logLoadError(err);
  }
}

async function loadRecipesDropdown({ selectedValue = null, clearOnInvalid = true } = {}) {
  try {
    const role = state.form.fields.tape_type || null;
    
    // If no role selected → show only placeholder
    if (!role) {
      recipeSelect.innerHTML = '<option value="">— выбрать рецепт —</option>';
      recipeSelect.value = '';
      clearRecipeStateAndUi({ clearRecipeField: true });
      return;
    }
    
    const desiredValue = String(
      selectedValue ?? state.form.fields.tape_recipe_id ?? ''
    );
    
    const recipes = await fetchRecipes(role);
    setReferenceCurrentRecipes(recipes);
    if (
      desiredValue &&
      recipes.some(r => String(r.tape_recipe_id) === desiredValue)
    ) {
      setFormField('tape_recipe_id', desiredValue);
    }
    renderRecipesSelect();
    
    // Auto-clear if previously selected recipe no longer valid
    if (
      clearOnInvalid &&
      desiredValue &&
      !recipes.some(r => String(r.tape_recipe_id) === desiredValue)
    ) {
      recipeSelect.value = '';
      clearRecipeStateAndUi({ clearRecipeField: true });
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
  setReferenceFoils(foils);
  renderFoilsSelect();
}

async function loadCoatingMethods() {
  
  const res = await fetch('/api/reference/coating-methods');
  const methods = await res.json();
  setReferenceCoatingMethods(methods);
  renderCoatingMethodsSelect();
}

function applyDefaultCoatingFoil() {
  if (state.workflow.coating.foil_id) return;

  const desiredFoil =
    state.form.fields.tape_type === 'cathode' ? 'al'
    : state.form.fields.tape_type === 'anode' ? 'cu'
    : '';

  if (!desiredFoil) return;

  const defaultFoil = state.reference.foils.find(
    (foil) => String(foil.type || '').trim().toLowerCase() === desiredFoil
  );

  if (defaultFoil) {
    updateWorkflowStepField('coating', 'foil_id', defaultFoil.foil_id);
    renderCoatingStep();
  }
}

function attachTopLevelFormStateSync() {
  const fieldMap = [
    ['notes', form.elements['notes']],
    ['created_by', form.elements['created_by']],
    ['project_id', form.elements['project_id']],
    ['tape_type', form.elements['tape_type']],
    ['tape_recipe_id', form.elements['tape_recipe_id']],
    ['calc_mode', form.elements['calc_mode']],
    ['target_mass_g', form.elements['target_mass_g']]
  ];

  fieldMap.forEach(([key, el]) => {
    if (!el) return;
    const sync = () => {
      setFormField(key, el.value || '');
    };
    el.addEventListener('input', sync);
    el.addEventListener('change', sync);
  });
}

function attachWorkflowStateSync() {
  const bindValueField = (id, stepKey, field, eventNames = ['input', 'change']) => {
    const el = document.getElementById(id);
    if (!el) return;
    const sync = () => updateWorkflowStepField(stepKey, field, el.value || '');
    eventNames.forEach((eventName) => el.addEventListener(eventName, sync));
  };

  const bindCheckedField = (id, stepKey, field) => {
    const el = document.getElementById(id);
    if (!el) return;
    const sync = () => updateWorkflowStepField(stepKey, field, Boolean(el.checked));
    el.addEventListener('change', sync);
  };

  [
    ['drying_am', '0-drying_am'],
    ['drying_tape', '2a-drying_tape'],
    ['drying_pressed_tape', '2b-drying_pressed_tape']
  ].forEach(([stepKey, prefix]) => {
    bindValueField(`${prefix}-operator`, stepKey, 'performed_by');
    bindValueField(`${prefix}-date`, stepKey, 'date');
    bindValueField(`${prefix}-time`, stepKey, 'time');
    bindValueField(`${prefix}-notes`, stepKey, 'comments');
    bindValueField(`${prefix}-temperature`, stepKey, 'temperature_c');
    bindValueField(`${prefix}-atmosphere`, stepKey, 'atmosphere');
    bindValueField(`${prefix}-target-duration`, stepKey, 'target_duration_min');
    bindValueField(`${prefix}-other_param`, stepKey, 'other_parameters');
  });

  bindValueField('1-weighing-operator', 'weighing', 'performed_by');
  bindValueField('1-weighing-date', 'weighing', 'date');
  bindValueField('1-weighing-time', 'weighing', 'time');
  bindValueField('1-weighing-notes', 'weighing', 'comments');

  bindValueField('1-mixing-operator', 'mixing', 'performed_by');
  bindValueField('1-mixing-started_at-date', 'mixing', 'started_at_date');
  bindValueField('1-mixing-started_at-time', 'mixing', 'started_at_time');
  bindValueField('1-mixing-comments', 'mixing', 'comments');
  bindValueField('1-mixing-slurry_volume_ml', 'mixing', 'slurry_volume_ml');
  bindValueField('1-mixing-dry_mixing_id', 'mixing', 'dry_mixing_id');
  bindValueField('dry-start-date', 'mixing', 'dry_start_date');
  bindValueField('dry-start-time', 'mixing', 'dry_start_time');
  bindValueField('dry-duration-min', 'mixing', 'dry_duration_min');
  bindValueField('dry-rpm', 'mixing', 'dry_rpm');
  bindValueField('1-mixing-wet_mixing_id', 'mixing', 'wet_mixing_id');
  bindValueField('wet-start-date', 'mixing', 'wet_start_date');
  bindValueField('wet-start-time', 'mixing', 'wet_start_time');
  bindValueField('wet-duration-min', 'mixing', 'wet_duration_min');
  bindValueField('wet-rpm', 'mixing', 'wet_rpm');
  bindValueField('wet-viscosity_cP', 'mixing', 'viscosity_cP');

  bindValueField('2-coating-operator', 'coating', 'performed_by');
  bindValueField('2-coating-date', 'coating', 'date');
  bindValueField('2-coating-time', 'coating', 'time');
  bindValueField('2-cathode-tape-notes', 'coating', 'comments');
  bindValueField('2-coating-foil_id', 'coating', 'foil_id');
  bindValueField('2-coating-coating_id', 'coating', 'coating_id');
  bindValueField('2-coating-gap-um', 'coating', 'gap_um');
  bindValueField('2-coating-temp-c', 'coating', 'coat_temp_c');
  bindValueField('2-coating-time-min', 'coating', 'coat_time_min');
  bindValueField('2-coating-method-comments', 'coating', 'method_comments');

  bindValueField('2-calendering-operator', 'calendering', 'performed_by');
  bindValueField('2-calendering-date', 'calendering', 'date');
  bindValueField('2-calendering-time', 'calendering', 'time');
  bindValueField('2-calendering-notes', 'calendering', 'comments');
  bindValueField('2-calendering-temp_c', 'calendering', 'temp_c');
  bindValueField('2-calendering-pressure_value', 'calendering', 'pressure_value');
  bindValueField('2-calendering-pressure_units', 'calendering', 'pressure_units');
  bindValueField('2-calendering-draw_speed_m_min', 'calendering', 'draw_speed_m_min');
  bindValueField('2-calendering-init_thickness_microns', 'calendering', 'init_thickness_microns');
  bindValueField('2-calendering-final_thickness_microns', 'calendering', 'final_thickness_microns');
  bindValueField('2-calendering-no_passes', 'calendering', 'no_passes');
  bindValueField('2-calendering-other_params', 'calendering', 'other_params');
  bindCheckedField('2-cal-shine', 'calendering', 'shine');
  bindCheckedField('2-cal-curl', 'calendering', 'curl');
  bindCheckedField('2-cal-dots', 'calendering', 'dots');
  bindCheckedField('2-cal-other-check', 'calendering', 'other_check');
  bindValueField('2-cal-other-text', 'calendering', 'other_text');
}

function attachSectionStateSync() {
  Object.keys(state.ui.sections.open).forEach((id) => {
    const el = document.getElementById(id);
    if (!el || typeof el.open === 'undefined') return;
    el.addEventListener('toggle', () => {
      setSectionOpen(id, el.open, { render: false });
    });
  });
}

async function loadRecipeLinesIntoStateAndRender(recipeId, { restoringActuals = [] } = {}) {
  if (!recipeId) {
    setRecipeLines([]);
    setSelectedInstancesByLineId({});
    setInstanceCacheByMaterialId({});
    setWeighingActualsByLineId({});
    setRestoringActuals([]);
    clearRecipeLines();
    return;
  }

  const lines = await fetchRecipeLines(recipeId);
  setRecipeLines(lines);

  if (!state.form.isRestoringTape) {
    setSelectedInstancesByLineId({});
    setWeighingActualsByLineId({});
  }
  setInstanceCacheByMaterialId({});

  if (restoringActuals.length) {
    mergeRestoringActualsIntoState(restoringActuals);
  }

  await loadMaterialInstancesForRecipeLines(state.recipe.currentLines);
  renderRecipeLines();
  recalculatePlannedMasses();
  applyDefaultCoatingFoil();

  if (state.form.isRestoringTape) {
    markAllSavedSnapshotsCurrent();
    setRestoringActuals([]);
    state.form.isRestoringTape = false;
    refreshDirtyFromSnapshots();
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

  try {
    const restoringActuals = [...state.recipe.restoringActuals];
    await loadRecipeLinesIntoStateAndRender(recipeId, { restoringActuals });
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
  
  setMode('create');
  clearCurrentTapeSelection();
  setTopLevelFormState({
    ...getDefaultTopLevelFormFields(),
    name
  });
  setNameEditing(false);

  addInput.value = '';
});


/* ------ name: editable ------ */

title.addEventListener('click', () => {
  setNameEditing(true);
  nameInput.focus();
});

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    nameInput.blur();
  }
});

nameInput.addEventListener('input', () => {
  setTopLevelFormState({ name: nameInput.value.trim() }, { render: false });
});

nameInput.addEventListener('blur', () => {
  const val = nameInput.value.trim();
  setTopLevelFormState({ name: val }, { render: false });
  setNameEditing(false);
});


// -------- Top General Tape Buttons --------

saveBtn.addEventListener('click', () => trackPendingSave((async () => {
  if (!state.form.mode) return;
  const data = { ...state.form.fields };
  
  // ADD THIS BLOCK
  if (!data.project_id || !data.tape_recipe_id || !data.created_by) {
    alert('Выберите проект, рецепт и пользователя');
    return;
  }
  
  try {
    if (state.form.mode === 'create') {
      const created = await createTape(data);
      
      await loadTapes();
      // keep the form open: switch to edit mode so step buttons keep working
      setCurrentTape(created, { mode: 'edit' });

      setSectionsVisibility({
        '0-tape-recipe-materials': true,
        '0-drying_materials': true,
        '1-slurry': true,
        '2-tape': true
      });
      setSectionsOpen({
        '0-tape-recipe-materials': true,
        '0-drying_materials': true,
        '1-slurry': false,
        '2-tape': false
      });
      
      markAllSavedSnapshotsCurrent();
      refreshDirtyFromSnapshots();
      showInlineStatus('saveBtn', 'Изменения сохранены');
      return;
    }
    
    if (state.form.mode === 'edit') {
      
      // 1. Update tape general info only
      await updateTape(state.selection.currentTapeId, data);
      setCurrentTape({
        ...(state.selection.currentTape || {}),
        tape_id: state.selection.currentTapeId,
        ...data,
        role: data.tape_type
      });

      await loadTapes();
      markSavedSnapshot('general_info');
      refreshDirtyFromSnapshots();
      showInlineStatus('saveBtn', 'Изменения сохранены');
      return;
    }
  } catch (err) {
    console.error(err);
    showInlineStatus('saveBtn', 'Ошибка сохранения', true);
  }
})()));

clearBtn.addEventListener('click', async () => {
  if (anyDirty()) {
    const ok = confirm('Changes not saved. Are you sure you want to leave?');
    if (!ok) return;
  }

  await waitForPendingSave();
  
  try {
    await loadTapes();
  } catch (err) {
    console.error(err);
  }

  // user chose to leave → clear flags so beforeunload doesn’t keep firing
  clearAllDirtySteps();
  
  resetForm();
});

recipeMaterialsSaveBtn.addEventListener('click', () => trackPendingSave((async () => {
  if (!state.selection.currentTapeId) {
    showInlineStatus('0-recipe-materials-save-btn', 'Сначала создайте ленту', true);
    return;
  }

  try {
    await saveSelectedInstances(state.selection.currentTapeId);
    markSavedSnapshot('recipe_materials');
    refreshDirtyFromSnapshots();
    showInlineStatus('0-recipe-materials-save-btn', 'Выбор экземпляров сохранён');
  } catch (err) {
    showInlineStatus('0-recipe-materials-save-btn', err.message, true);
  }
})()));

function buildDryingPayload(prefix) {
  const stepKey =
    prefix === '0-drying_am' ? 'drying_am'
    : prefix === '2a-drying_tape' ? 'drying_tape'
    : 'drying_pressed_tape';
  const step = state.workflow[stepKey];
  return {
    performed_by: Number(step.performed_by) || null,
    started_at: combineDateAndTime(step.date, step.time),
    comments: step.comments || null,
    temperature_c: Number(step.temperature_c) || null,
    atmosphere: step.atmosphere || null,
    target_duration_min: Number(step.target_duration_min) || null,
    other_parameters: step.other_parameters || null
  };
}

async function saveDryingStep({ code, prefix }) {
  if (!state.selection.currentTapeId) {
    alert('Сначала создайте ленту');
    return;
  }
  const payload = buildDryingPayload(prefix);
  
  const res = await fetch(
    `/api/tapes/${state.selection.currentTapeId}/steps/by-code/${code}`,
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
  
  btn.addEventListener('click', () => trackPendingSave((async () => {
    try {
      await saveDryingStep(cfg);
      markSavedSnapshot(cfg.code);
      refreshDirtyFromSnapshots();
      showInlineStatus(cfg.btnId, 'Изменения сохранены');
    } catch (err) {
      showInlineStatus(cfg.btnId, err.message, true);
    }
  })()));
});

const weighingSaveBtn = document.getElementById('1-weighing-save-btn');

weighingSaveBtn.addEventListener('click', () => trackPendingSave((async () => {
  
  if (!state.selection.currentTapeId) {
    showInlineStatus('1-weighing-save-btn', 'Сначала создайте ленту', true);
    return;
  }
  const step = state.workflow.weighing;
  const payload = {
    performed_by: Number(step.performed_by) || null,
    started_at: combineDateAndTime(step.date, step.time),
    comments: step.comments || null
  };
  
  try {
    const res = await fetch(
      `/api/tapes/${state.selection.currentTapeId}/steps/by-code/weighing`,
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

    await saveTapeActuals(state.selection.currentTapeId);
    
    markSavedSnapshot('weighing');
    refreshDirtyFromSnapshots();
    showInlineStatus('1-weighing-save-btn', 'Изменения сохранены');
    
  } catch (err) {
    showInlineStatus('1-weighing-save-btn', err.message, true);
  }
})()));

// -------- I.2. Save mixing --------

function updateMixParamsVisibility() {
  const mixingStep = state.workflow?.mixing || getDefaultWorkflowState().mixing;
  const drySelectedId = String(mixingStep.dry_mixing_id || '');
  const wetSelectedId = String(mixingStep.wet_mixing_id || '');

  const dryMethod = state.reference.dryMixingMethods.find(
    (item) => String(item.dry_mixing_id) === drySelectedId
  ) || null;
  const wetMethod = state.reference.wetMixingMethods.find(
    (item) => String(item.wet_mixing_id) === wetSelectedId
  ) || null;

  const dryCode = String(dryMethod?.name || '').trim().toLowerCase();
  const wetCode = String(wetMethod?.name || '').trim().toLowerCase();
  
  const hideDry =
  !dryCode ||
  dryCode === 'none' ||
  dryCode === 'hand';
  
  const hideWet =
  !wetCode ||
  wetCode === 'none' ||
  wetCode === 'hand';

  setMixingParamsVisibility({
    dryParamsVisible: !hideDry,
    wetParamsVisible: !hideWet
  });
}

// ---- Mixing params show/hide (empty method => hide params) ----
const dryMixSelect = document.getElementById('1-mixing-dry_mixing_id');
const wetMixSelect = document.getElementById('1-mixing-wet_mixing_id');

if (dryMixSelect) dryMixSelect.addEventListener('change', updateMixParamsVisibility);
if (wetMixSelect) wetMixSelect.addEventListener('change', updateMixParamsVisibility);

document.getElementById('1-mixing-save-btn').onclick = () => trackPendingSave((async () => {
  
  if (!state.selection.currentTapeId) {
    showInlineStatus('1-mixing-save-btn', 'Сначала сохраните ленту', true);
    return;
  }
  const step = state.workflow.mixing;
  
  // ---- Build payload ----
  const payload = {
    performed_by: step.performed_by || null,
    started_at: combineDateAndTime(step.started_at_date, step.started_at_time),
    comments: step.comments || null,
    slurry_volume_ml: step.slurry_volume_ml || null,
    dry_mixing_id: step.dry_mixing_id || null,
    dry_start_time: combineDateAndTime(step.dry_start_date, step.dry_start_time),
    dry_duration_min: step.dry_duration_min || null,
    dry_rpm: step.dry_rpm || null,
    wet_mixing_id: step.wet_mixing_id || null,
    wet_start_time: combineDateAndTime(step.wet_start_date, step.wet_start_time),
    wet_duration_min: step.wet_duration_min || null,
    wet_rpm: step.wet_rpm || null,
    viscosity_cP: step.viscosity_cP || null
  };
  
  const res = await fetch(
    `/api/tapes/${state.selection.currentTapeId}/steps/by-code/mixing`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );
  
  if (!res.ok) {
    showInlineStatus('1-mixing-save-btn', 'Ошибка сохранения этапа перемешивания', true);
    return;
  }
  
  markSavedSnapshot('mixing');
  refreshDirtyFromSnapshots();
  showInlineStatus('1-mixing-save-btn', 'Изменения сохранены');
})());

// -------- II.1. Save coating --------

function getSelectedCoatingMethod() {
  const selectedId = String(state.workflow.coating.coating_id || '');
  if (!selectedId) return null;
  return state.reference.coatingMethods.find(
    (method) => String(method.coating_id) === selectedId
  ) || null;
}

function applyCoatingMethodDefaultsToState({ force = false } = {}) {
  const method = getSelectedCoatingMethod();

  if (!method) {
    return;
  }

  const step = state.workflow.coating;
  const patch = {};

  if (force || !String(step.gap_um || '').trim()) {
    patch.gap_um = method.gap_um ?? '';
  }
  if (force || !String(step.coat_temp_c || '').trim()) {
    patch.coat_temp_c = method.coat_temp_c ?? '';
  }
  if (force || !String(step.coat_time_min || '').trim()) {
    patch.coat_time_min = method.coat_time_min ?? '';
  }
  if (Object.keys(patch).length > 0) {
    setWorkflowStep('coating', {
      ...step,
      ...patch
    });
  }
}

document.getElementById('2-coating-save-btn').onclick = () => trackPendingSave((async () => {
  
  const tapeId = state.selection.currentTapeId;
  if (!tapeId) {
    showInlineStatus('2-coating-save-btn', 'Сначала создайте ленту', true);
    return;
  }

  const step = state.workflow.coating;
  const gapValue = step.gap_um;
  
  if (!gapValue || !Number.isFinite(Number(gapValue)) || Number(gapValue) <= 0) {
    showInlineStatus('2-coating-save-btn', 'Укажите зазор, мкм', true);
    return;
  }
  
  const payload = {
    performed_by: step.performed_by || null,
    started_at: combineDateAndTime(step.date, step.time),
    comments: step.comments || null,
    foil_id: step.foil_id || null,
    coating_id: step.coating_id || null,
    gap_um: gapValue,
    coat_temp_c: step.coat_temp_c || null,
    coat_time_min: step.coat_time_min || null,
    method_comments: step.method_comments || null
  };
  
  const res = await fetch(`/api/tapes/${tapeId}/steps/by-code/coating`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    showInlineStatus(
      '2-coating-save-btn',
      err.error || 'Ошибка сохранения этапа нанесения',
      true
    );
    return;
  }
  
  markSavedSnapshot('coating');
  refreshDirtyFromSnapshots();
  showInlineStatus('2-coating-save-btn', 'Изменения сохранены');
})());

document
.getElementById('2-coating-coating_id')
.addEventListener('change', () => {
  applyCoatingMethodDefaultsToState({ force: true });
  renderCoatingStep();
});

// -------- II.2. Save calendering --------

function buildCalAppearance() {
  const values = [];
  const step = state.workflow.calendering;
  
  if (step.shine) values.push('Блеск');
  if (step.curl) values.push('Закрутка');
  if (step.dots) values.push('Точечки');
  if (step.other_check) {
    const other = String(step.other_text || '').trim();
    if (other) values.push('Другое: ' + other);
  }
  
  return values.join('; ');
}

document.getElementById('2-calendering-save-btn').onclick = () => trackPendingSave((async () => {
  
  const tapeId = state.selection.currentTapeId;
  const step = state.workflow.calendering;
  
  const payload = {
    
    performed_by: step.performed_by || null,
    started_at: combineDateAndTime(step.date, step.time),
    comments: step.comments || null,
    temp_c: step.temp_c || null,
    pressure_value: step.pressure_value || null,
    pressure_units: step.pressure_units || null,
    draw_speed_m_min: step.draw_speed_m_min || null,
    init_thickness_microns: step.init_thickness_microns || null,
    final_thickness_microns: step.final_thickness_microns || null,
    no_passes: step.no_passes || null,
    other_params: step.other_params || null,
    
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
    showInlineStatus('2-calendering-save-btn', text || 'Ошибка сохранения этапа каландрирования', true);
    return;
  }
  
  await res.json().catch(() => null);
  markSavedSnapshot('calendering');
  refreshDirtyFromSnapshots();
  showInlineStatus('2-calendering-save-btn', 'Изменения сохранены');
})());

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

  if (dateInput) dateInput.dispatchEvent(new Event('input', { bubbles: true }));
  if (timeInput) timeInput.dispatchEvent(new Event('input', { bubbles: true }));
});

// -------- Init --------

hideForm();
resetWorkflowState();
resetSectionState();
attachTopLevelFormStateSync();
attachWorkflowStateSync();
attachSectionStateSync();
resetTopLevelFormState();
renderWorkflowState();
renderPanelState();
markAllSavedSnapshotsCurrent();
refreshDirtyFromSnapshots();
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

// Mark mixing as dirty on any change inside the mixing fieldset
(() => {
  const fs = document.getElementById('1-mixing');
  if (!fs) return;
  
  fs.addEventListener('input', refreshDirtyFromSnapshots);
  fs.addEventListener('change', refreshDirtyFromSnapshots);
})();

// Mark recipe/materials as dirty on any edit in the actuals table
(() => {
  const tbody = document.getElementById('slurry-actuals-body');
  if (!tbody) return;
  
  const mark = () => {
    if (state.form.isRestoringTape) return; // do not mark dirty during restore
    refreshDirtyFromSnapshots();
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
      if (state.form.isRestoringTape) return;
      refreshDirtyFromSnapshots();
    };
    
    el.addEventListener('input', mark);
    el.addEventListener('change', mark);
    
  });
  
})();
