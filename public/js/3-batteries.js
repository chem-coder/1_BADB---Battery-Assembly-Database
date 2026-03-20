const projectSelect = document.getElementById('battery_project_id');
const createdBySelect = document.getElementById('battery_created_by');

let currentBatteryId = null;
let batteries = [];
let tapes = [];

let cathodeBatches = [];
let anodeBatches = [];

let cathodeTapes = [];
let anodeTapes = [];

let cathodeElectrodes = [];
let anodeElectrodes = [];

let selectedCathodes = [];
let selectedAnodes = [];
let stackReadOnly = false;
let lastSavedSectionStates = {};
let isRestoringBattery = false;
let savedElectrochemEntries = [];

// -------- API helpers --------

// -------- FORM SERIALIZATION --------

function serializeFieldset(fieldset) {
  
  const data = {};
  const elements = fieldset.querySelectorAll('input, select, textarea');
  
  elements.forEach(el => {
    
    if (!el.name) return;
    
    if (el.type === 'checkbox') {
      data[el.name] = el.checked;
    } else if (el.type === 'radio') {
      
      if (el.checked) {
        data[el.name] = el.value;
      }
      
    } else {
      
      data[el.name] = el.value || null;
      
    }
    
  });
  
  return data;
  
}

function populateFieldset(fieldset, data) {
  
  if (!fieldset || !data) return;
  
  fieldset.querySelectorAll('[name]').forEach(el => {
    
    const key = el.name;
    
    if (!(key in data)) return;
    
    if (el.type === 'checkbox') {
      el.checked = Boolean(data[key]);
    } else if (el.type === 'radio') {
      el.checked = String(el.value) === String(data[key]);
    } else {
      el.value = data[key] ?? '';
    }
    
  });
  
}

function clearFieldset(fieldset) {
  
  if (!fieldset) return;
  
  fieldset.querySelectorAll('[name]').forEach(el => {
    
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked = false;
    } else {
      el.value = '';
    }
    
  });
  
}

function markSectionsSaved(sectionKeys) {
  sectionKeys.forEach(sectionKey => {
    lastSavedSectionStates[sectionKey] = captureSectionState(sectionKey);
  });
  updateDirtyFlags();
}

function markBatteryStateSaved() {
  lastSavedSectionStates = captureAllSectionStates();
  updateDirtyFlags();
}

function hasUnsavedBatteryChanges() {
  return Object.keys(captureAllSectionStates()).some(sectionKey => {
    return captureSectionState(sectionKey) !== lastSavedSectionStates[sectionKey];
  });
}

async function refreshBatteryReferenceData() {
  await Promise.all([
    loadUsers(),
    loadProjects(),
    loadSeparators(),
    loadElectrolytes()
  ]);

  updateElectrolyteVolume();
}

function captureNamedState(root) {
  
  if (!root) return 'null';
  
  const fields = Array.from(root.querySelectorAll('[name]')).map(el => {
    if (el.type === 'checkbox' || el.type === 'radio') {
      return {
        name: el.name,
        type: el.type,
        value: el.value,
        checked: el.checked
      };
    }

    return {
      name: el.name,
      type: el.type,
      value: el.value ?? ''
    };
  });

  return JSON.stringify(fields);
}

function getActiveConfigFieldset() {
  const formFactor = document.getElementById('battery_form_factor').value;
  
  if (formFactor === 'coin') return document.getElementById('coin_config');
  if (formFactor === 'pouch') return document.getElementById('pouch_config');
  if (formFactor === 'cylindrical') return document.getElementById('cyl_config');
  
  return null;
}

function getActiveAssemblyFieldset() {
  const formFactor = document.getElementById('battery_form_factor').value;
  
  if (formFactor === 'coin') return document.getElementById('coin_assembly');
  if (formFactor === 'pouch') return document.getElementById('pouch_assembly');
  if (formFactor === 'cylindrical') return document.getElementById('cyl_assembly');
  
  return null;
}

function captureSectionState(sectionKey) {
  if (sectionKey === 'battery_meta') {
    return captureNamedState(document.getElementById('battery_meta'));
  }

  if (sectionKey === 'battery_config') {
    return captureNamedState(getActiveConfigFieldset());
  }

  if (sectionKey === 'electrode_sources') {
    return captureNamedState(document.getElementById('battery_electrode_sources'));
  }

  if (sectionKey === 'battery_stack') {
    return JSON.stringify({
      selectedCathodes: selectedCathodes.map(e => ({
        electrode_id: e.electrode_id,
        electrode_mass_g: e.electrode_mass_g ?? null
      })),
      selectedAnodes: selectedAnodes.map(e => ({
        electrode_id: e.electrode_id,
        electrode_mass_g: e.electrode_mass_g ?? null
      }))
    });
  }

  if (sectionKey === 'battery_assembly') {
    return captureNamedState(getActiveAssemblyFieldset());
  }

  if (sectionKey === 'battery_qc') {
    return captureNamedState(document.getElementById('battery_qc'));
  }

  if (sectionKey === 'battery_electrochem') {
    return JSON.stringify({
      electrochem_notes: document.getElementById('electrochem_notes')?.value ?? '',
      electrochem_files: document.getElementById('electrochem_files')?.value ?? '',
      saved_entries: savedElectrochemEntries
    });
  }

  return 'null';
}

function captureAllSectionStates() {
  return {
    battery_meta: captureSectionState('battery_meta'),
    battery_config: captureSectionState('battery_config'),
    electrode_sources: captureSectionState('electrode_sources'),
    battery_stack: captureSectionState('battery_stack'),
    battery_assembly: captureSectionState('battery_assembly'),
    battery_qc: captureSectionState('battery_qc'),
    battery_electrochem: captureSectionState('battery_electrochem')
  };
}

function setSectionDirty(sectionKey, isDirty) {
  const markerId =
  sectionKey === 'battery_meta' ? 'dirty-battery-meta'
  : sectionKey === 'battery_config' ? 'dirty-battery-config'
  : sectionKey === 'electrode_sources' ? 'dirty-electrode-sources'
  : sectionKey === 'battery_stack' ? 'dirty-battery-stack'
  : sectionKey === 'battery_assembly' ? 'dirty-battery-assembly'
  : sectionKey === 'battery_qc' ? 'dirty-battery-qc'
  : sectionKey === 'battery_electrochem' ? 'dirty-battery-electrochem'
  : null;
  
  const el = markerId ? document.getElementById(markerId) : null;
  
  if (el) {
    el.classList.toggle('visible', Boolean(isDirty));
  }
}

function clearDirtyFlags() {
  [
    'battery_meta',
    'battery_config',
    'electrode_sources',
    'battery_stack',
    'battery_assembly',
    'battery_qc',
    'battery_electrochem'
  ].forEach(sectionKey => {
    setSectionDirty(sectionKey, false);
  });
}

function updateDirtyFlags() {
  Object.keys(captureAllSectionStates()).forEach(sectionKey => {
    const current = captureSectionState(sectionKey);
    const saved = lastSavedSectionStates[sectionKey];
    setSectionDirty(sectionKey, current !== saved);
  });
}

function getBatterySelectionMode() {
  const formFactor = document.getElementById('battery_form_factor')?.value;
  const coinMode = document.getElementById('coin_cell_mode')?.value;

  return {
    formFactor,
    coinMode
  };
}

function setStackReadOnly(isReadOnly) {
  stackReadOnly = Boolean(isReadOnly);

  document
  .querySelectorAll(
    '#stack_cathode_table_body input[type="checkbox"], #stack_anode_table_body input[type="checkbox"]'
  )
  .forEach(cb => {
    cb.disabled = stackReadOnly || cb.dataset.available !== 'true';
  });

  const stackBuilder = document.getElementById('battery_stack_builder');

  if (stackBuilder) {
    stackBuilder.dataset.stackLocked = stackReadOnly ? 'true' : 'false';
    stackBuilder.classList.toggle('locked', stackReadOnly);
  }
}

function updateElectrodeCheckboxStates() {
  const { formFactor, coinMode } = getBatterySelectionMode();

  const cathodeCheckboxes = Array.from(
    document.querySelectorAll('#stack_cathode_table_body input[type="checkbox"]')
  );

  const anodeCheckboxes = Array.from(
    document.querySelectorAll('#stack_anode_table_body input[type="checkbox"]')
  );

  if (stackReadOnly) {
    cathodeCheckboxes.forEach(cb => { cb.disabled = true; });
    anodeCheckboxes.forEach(cb => { cb.disabled = true; });
    return;
  }

  cathodeCheckboxes.forEach(cb => {
    cb.disabled = cb.dataset.available !== 'true';
  });

  anodeCheckboxes.forEach(cb => {
    cb.disabled = cb.dataset.available !== 'true';
  });

  if (formFactor === 'pouch' || formFactor === 'cylindrical') {
    return;
  }

  if (formFactor === 'coin' && coinMode === 'half_cell') {
    const selectedTotal =
    selectedCathodes.length + selectedAnodes.length;

    if (selectedTotal === 0) return;

    const selectedCathodeIds =
    selectedCathodes.map(e => e.electrode_id);

    const selectedAnodeIds =
    selectedAnodes.map(e => e.electrode_id);

    cathodeCheckboxes.forEach(cb => {
      if (cb.dataset.available !== 'true') return;

      if (!selectedCathodeIds.includes(Number(cb.value))) {
        cb.disabled = true;
      }
    });

    anodeCheckboxes.forEach(cb => {
      if (cb.dataset.available !== 'true') return;

      if (!selectedAnodeIds.includes(Number(cb.value))) {
        cb.disabled = true;
      }
    });

    return;
  }

  if (formFactor === 'coin' && coinMode === 'full_cell') {
    if (selectedCathodes.length > 0) {
      const selectedCathodeIds =
      selectedCathodes.map(e => e.electrode_id);

      cathodeCheckboxes.forEach(cb => {
        if (cb.dataset.available !== 'true') return;

        if (!selectedCathodeIds.includes(Number(cb.value))) {
          cb.disabled = true;
        }
      });
    }

    if (selectedAnodes.length > 0) {
      const selectedAnodeIds =
      selectedAnodes.map(e => e.electrode_id);

      anodeCheckboxes.forEach(cb => {
        if (cb.dataset.available !== 'true') return;

        if (!selectedAnodeIds.includes(Number(cb.value))) {
          cb.disabled = true;
        }
      });
    }
  }
}

function applySavedElectrodeState(data) {
  const hasSavedElectrodes =
  Array.isArray(data.electrodes) && data.electrodes.length > 0;

  setStackReadOnly(hasSavedElectrodes);
  updateElectrodeCheckboxStates();
}

function resetElectrodeUiState() {
  setStackReadOnly(false);
  updateElectrodeCheckboxStates();
}

function hasMeaningfulValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function hasCoinConfigDownstreamSelections() {
  const sourceSelected =
  hasMeaningfulValue(document.getElementById('cathode_tape_id')?.value) ||
  hasMeaningfulValue(document.getElementById('cathode_cut_batch_id')?.value) ||
  hasMeaningfulValue(document.getElementById('anode_tape_id')?.value) ||
  hasMeaningfulValue(document.getElementById('anode_cut_batch_id')?.value);
  
  const sourceSelectionSaved =
  captureSectionState('electrode_sources') === lastSavedSectionStates.electrode_sources;

  return sourceSelected && sourceSelectionSaved;
}

function isCommentField(el) {
  return Boolean(el?.name) && (
    el.name === 'battery_notes' ||
    el.name === 'qc_notes' ||
    el.name === 'electrochem_notes' ||
    el.name.endsWith('_notes')
  );
}

function hasSavedQcLock() {
  const ocvValue = document.getElementById('qc_ocv_v')?.value;
  const esrValue = document.getElementById('qc_esr_mohm')?.value;
  const qcSaved =
  captureSectionState('battery_qc') === lastSavedSectionStates.battery_qc;

  return hasMeaningfulValue(ocvValue) && hasMeaningfulValue(esrValue) && qcSaved;
}

function isBatteryAssemblyComplete(data) {
  const hasConfig =
  Boolean(data.coin_config || data.pouch_config || data.cyl_config);

  const hasSources =
  Array.isArray(data.electrode_sources) && data.electrode_sources.length > 0;

  const hasElectrodes =
  Array.isArray(data.electrodes) && data.electrodes.length > 0;

  const hasAssembly =
  Boolean(data.separator) && Boolean(data.electrolyte);

  return hasConfig && hasSources && hasElectrodes && hasAssembly;
}

function syncBatteryStatusSelect(battery, assemblyData) {
  const select = document.getElementById('battery_status');

  if (!select) return;

  const complete = isBatteryAssemblyComplete(assemblyData);

  if (!complete) {
    select.disabled = true;
    select.value = '';
    return;
  }

  select.disabled = false;
  select.value = battery.status || 'assembled';
}

async function refreshBatteryStatusState() {
  if (!currentBatteryId) return;

  const res = await fetch(`/api/batteries/${currentBatteryId}/assembly`);

  if (!res.ok) {
    throw new Error('Не удалось обновить статус батареи');
  }

  const assemblyData = await res.json();
  syncBatteryStatusSelect(assemblyData.battery, assemblyData);
}

async function saveBatteryStatus() {
  if (!currentBatteryId) return;

  const status = document.getElementById('battery_status').value || null;

  const res = await fetch(`/api/batteries/${currentBatteryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка сохранения статуса батареи');
  }

  return res.json();
}

function updateBatteryLocks() {
  const hasElectrodes = selectedCathodes.length > 0 || selectedAnodes.length > 0;
  
  document.getElementById('battery_project_id').disabled = hasElectrodes;
  document.getElementById('battery_created_by').disabled = hasElectrodes;
  document.getElementById('battery_form_factor').disabled = hasElectrodes;
  document.getElementById('cathode_tape_id').disabled = hasElectrodes;
  document.getElementById('cathode_cut_batch_id').disabled = hasElectrodes;
  document.getElementById('anode_tape_id').disabled = hasElectrodes;
  document.getElementById('anode_cut_batch_id').disabled = hasElectrodes;
  
  const coinConfigLocked =
  document.getElementById('battery_form_factor').value === 'coin' &&
  (hasElectrodes || hasCoinConfigDownstreamSelections());
  
  document.getElementById('coin_cell_mode').disabled = coinConfigLocked;
  document.getElementById('coin_size_code').disabled = coinConfigLocked;
  document.getElementById('coin_half_cell_type').disabled = coinConfigLocked;
  
  const banner = document.getElementById('assembly_locked_banner');
  
  if (banner) {
    banner.classList.toggle('visible', hasElectrodes);
  }

  const qcLocked = hasSavedQcLock();

  document
  .querySelectorAll('form[name="battery_assembly_log_form"] input, form[name="battery_assembly_log_form"] select, form[name="battery_assembly_log_form"] textarea')
  .forEach(el => {
    if (!el.name) return;

    if (el.closest('#battery_electrochem')) {
      el.disabled = false;
      el.readOnly = false;
      return;
    }

    if (el.id === 'battery_status') {
      el.readOnly = false;
      return;
    }

    if (isCommentField(el)) {
      el.disabled = false;
      el.readOnly = false;
      return;
    }

    if (qcLocked) {
      el.disabled = true;
      el.readOnly = true;
    } else {
      el.readOnly = false;
    }
  });
}



// -------- GENERIC API SAVE --------

async function saveSection(url, payload) {
  
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'API error');
  }
  
  return res.json();
  
}


// -------- SAVE Helpers --------

async function saveBatteryConfig() {
  
  const coinFs  = document.getElementById('coin_config');
  const pouchFs = document.getElementById('pouch_config');
  const cylFs   = document.getElementById('cyl_config');
  
  let fieldset;
  let table;
  
  if (!coinFs.hidden) {
    fieldset = coinFs;
    table = 'battery_coin_config';
  } else if (!pouchFs.hidden) {
    fieldset = pouchFs;
    table = 'battery_pouch_config';
  } else if (!cylFs.hidden) {
    fieldset = cylFs;
    table = 'battery_cyl_config';
  } else {
    alert('No configuration section is active.');
    return;
  }
  
  const payload = serializeFieldset(fieldset);
  
  let res = await fetch(`/api/batteries/${table}/${currentBatteryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (res.status === 404) {
    res = await fetch(`/api/batteries/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        battery_id: currentBatteryId,
        ...payload
      })
    });
  }
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert('Failed to save configuration: ' + (err.error || res.status));
    return;
  }
  
  markSectionsSaved(['battery_config']);
  await refreshBatteryStatusState();
  
  alert('Configuration saved.');
}



async function saveElectrodeSources() {
  
  if (!currentBatteryId) {
    alert('Сначала создайте элемент.');
    return;
  }
  
  const formFactor = document.getElementById('battery_form_factor').value;
  const mode = document.getElementById('coin_cell_mode')?.value;
  const halfType = document.getElementById('coin_half_cell_type')?.value;

  let payload = {
    battery_id: currentBatteryId
  };

  if (formFactor === 'coin' && mode === 'half_cell') {

    if (halfType === 'cathode_vs_li') {
      payload.cathode_tape_id = document.getElementById('cathode_tape_id')?.value || null;
      payload.cathode_cut_batch_id = document.getElementById('cathode_cut_batch_id')?.value || null;
      payload.cathode_source_notes = document.getElementById('cathode_source_notes')?.value || null;
    }

    if (halfType === 'anode_vs_li') {
      payload.anode_tape_id = document.getElementById('anode_tape_id')?.value || null;
      payload.anode_cut_batch_id = document.getElementById('anode_cut_batch_id')?.value || null;
      payload.anode_source_notes = document.getElementById('anode_source_notes')?.value || null;
    }

  } else {

    payload.cathode_tape_id = document.getElementById('cathode_tape_id')?.value || null;
    payload.cathode_cut_batch_id = document.getElementById('cathode_cut_batch_id')?.value || null;
    payload.cathode_source_notes = document.getElementById('cathode_source_notes')?.value || null;

    payload.anode_tape_id = document.getElementById('anode_tape_id')?.value || null;
    payload.anode_cut_batch_id = document.getElementById('anode_cut_batch_id')?.value || null;
    payload.anode_source_notes = document.getElementById('anode_source_notes')?.value || null;

  }
  
  const res = await fetch('/api/batteries/battery_electrode_sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert('Ошибка сохранения источников электродов: ' + (err.error || res.status));
    return;
  }
  
  markSectionsSaved(['electrode_sources']);
  await refreshBatteryStatusState();
  
  alert('Источники электродов сохранены.');
}

async function saveElectrodeStack() {
  
  if (!currentBatteryId) {
    alert('Сначала создайте элемент.');
    return;
  }
  
  const stack = buildStackPayload();
  
  if (!stack || stack.length === 0) {
    alert('Стек электродов пуст.');
    return;
  }
  
  const res = await fetch(`/api/batteries/battery_electrodes/${currentBatteryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stack)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert('Ошибка сохранения стека: ' + (err.error || res.status));
    return;
  }
  
  markSectionsSaved(['battery_stack']);
  await refreshBatteryStatusState();
  
  alert('Стек электродов сохранён.');
}


async function saveFieldsetSection(fieldsetId, routeBase) {
  if (!currentBatteryId) {
    alert('Сначала создайте элемент.');
    return null;
  }

  const fieldset = document.getElementById(fieldsetId);
  const payload = serializeFieldset(fieldset);

  let res = await fetch(`/api/batteries/${routeBase}/${currentBatteryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.status === 404) {
    res = await fetch(`/api/batteries/${routeBase}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        battery_id: currentBatteryId,
        ...payload
      })
    });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Ошибка сохранения: ${routeBase}`);
  }

  return res.json();
}

async function savePayloadSection(routeBase, payload) {
  if (!currentBatteryId) {
    alert('Сначала создайте элемент.');
    return null;
  }

  let res = await fetch(`/api/batteries/${routeBase}/${currentBatteryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.status === 404) {
    res = await fetch(`/api/batteries/${routeBase}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        battery_id: currentBatteryId,
        ...payload
      })
    });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Ошибка сохранения: ${routeBase}`);
  }

  return res.json();
}

function getActiveAssemblyContext() {
  const formFactor = document.getElementById('battery_form_factor').value;

  if (formFactor === 'coin') {
    return {
      formFactor,
      fieldsetId: 'coin_assembly',
      configRoute: 'battery_coin_config',
      separatorId: 'coin_separator_id',
      separatorNotesId: 'coin_separator_notes',
      electrolyteId: 'coin_electrolyte_id',
      electrolyteNotesId: 'coin_electrolyte_notes',
      totalVolumeId: 'coin_electrolyte_total_ul'
    };
  }

  if (formFactor === 'pouch') {
    return {
      formFactor,
      fieldsetId: 'pouch_assembly',
      configRoute: 'battery_pouch_config',
      separatorId: 'pouch_separator_id',
      separatorNotesId: 'pouch_separator_notes',
      electrolyteId: 'pouch_electrolyte_id',
      electrolyteNotesId: 'pouch_electrolyte_notes',
      totalVolumeId: 'pouch_electrolyte_total_ul'
    };
  }

  if (formFactor === 'cylindrical') {
    return {
      formFactor,
      fieldsetId: 'cyl_assembly',
      configRoute: 'battery_cyl_config',
      separatorId: 'cyl_separator_id',
      separatorNotesId: 'cyl_separator_notes',
      electrolyteId: 'cyl_electrolyte_id',
      electrolyteNotesId: 'cyl_electrolyte_notes',
      totalVolumeId: 'cyl_electrolyte_total_ul'
    };
  }

  return null;
}

async function saveAssemblyParams() {
  if (!currentBatteryId) {
    alert('Сначала создайте элемент.');
    return;
  }

  const ctx = getActiveAssemblyContext();

  if (!ctx) {
    alert('Не выбран форм-фактор');
    return;
  }

  try {
    const fieldset = document.getElementById(ctx.fieldsetId);
    const payload = serializeFieldset(fieldset);

    // split payload by destination table
    const separatorPayload = {
      separator_id: payload.separator_id,
      separator_notes: payload.separator_notes
    };

    const electrolytePayload = {
      electrolyte_id: payload.electrolyte_id,
      electrolyte_notes: payload.electrolyte_notes,
      electrolyte_total_ul: payload.electrolyte_total_ul
    };

    const configPayload = { ...payload };
    delete configPayload.separator_id;
    delete configPayload.separator_notes;
    delete configPayload.electrolyte_id;
    delete configPayload.electrolyte_notes;
    delete configPayload.electrolyte_total_ul;

    // 1. save only the fields that belong to the form-factor config table
    if (Object.keys(configPayload).length > 0) {
      await savePayloadSection(ctx.configRoute, configPayload);
    }

    // 2. save separator
    await savePayloadSection('battery_sep_config', separatorPayload);

    // 3. save electrolyte
    await savePayloadSection('battery_electrolyte', electrolytePayload);
    markSectionsSaved(['battery_assembly']);
    await refreshBatteryStatusState();

    alert('Сохранено.');
  } catch (err) {
    console.error(err);
    alert(err.message || 'Ошибка сохранения параметров сборки');
  }
}


async function saveBatteryQc() {
  try {
    await saveFieldsetSection('battery_qc', 'battery_qc');
    markSectionsSaved(['battery_qc']);
    updateBatteryLocks();
    alert('Результаты QC сохранены.');
  } catch (err) {
    console.error(err);
    alert(err.message || 'Ошибка сохранения QC');
  }
}

function renderElectrochemSavedFiles(entries) {
  const target = document.getElementById('electrochem_files_saved');

  if (!target) return;

  if (!Array.isArray(entries) || entries.length === 0) {
    target.innerHTML = '';
    return;
  }

  target.innerHTML = '';

  entries.forEach((entry, index) => {
    const row = document.createElement('div');
    const link = document.createElement('a');
    const note = document.createElement('span');
    
    link.href = entry.file_link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = entry.file_name || entry.file_link;
    
    note.textContent = entry.electrochem_notes
      ? ` | ${entry.electrochem_notes}`
      : '';
    
    row.append(`${index + 1}. `);
    row.appendChild(link);
    row.appendChild(note);
    target.appendChild(row);
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      const result = typeof reader.result === 'string'
        ? reader.result.split(',')[1]
        : '';
      resolve(result);
    };
    
    reader.onerror = () => {
      reject(new Error(`Не удалось прочитать файл: ${file.name}`));
    };
    
    reader.readAsDataURL(file);
  });
}

async function saveBatteryElectrochem() {
  if (!currentBatteryId) {
    alert('Сначала создайте элемент.');
    return;
  }

  try {
    const filesInput = document.getElementById('electrochem_files');
    const notesInput = document.getElementById('electrochem_notes');

    const selectedFiles = Array.from(filesInput.files || []);
    
    if (selectedFiles.length === 0) {
      alert('Выберите хотя бы один файл испытаний.');
      return;
    }

    const entries = await Promise.all(selectedFiles.map(async (file) => ({
      file_name: file.name,
      file_content_base64: await fileToBase64(file),
      electrochem_notes: notesInput.value || null
    })));

    const payload = {
      entries
    };

    const res = await fetch('/api/batteries/battery_electrochem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        battery_id: currentBatteryId,
        ...payload
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка сохранения электрохимических испытаний');
    }

    const saved = await res.json();

    savedElectrochemEntries = Array.isArray(saved) ? saved : [];
    filesInput.value = '';
    notesInput.value = '';
    renderElectrochemSavedFiles(savedElectrochemEntries);
    markSectionsSaved(['battery_electrochem']);
    updateBatteryLocks();
    alert('Результаты электрохимических испытаний сохранены.');
  } catch (err) {
    console.error(err);
    alert(err.message || 'Ошибка сохранения электрохимических испытаний');
  }
}


async function updateBatteryMeta(id, data) {
  
  const res = await fetch(`/api/batteries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка обновления аккумулятора');
  }
  
  return res.json();
  
}



// -------- LOAD Helpers --------

async function loadProjects() {
  
  const current = projectSelect.value;
  
  const res = await fetch('/api/projects?project_id=0');
  const data = await res.json();
  
  console.log('loadProjects current before rebuild =', projectSelect.value);
  projectSelect.innerHTML =
  '<option value="">— выбрать проект —</option>';
  
  data.forEach(p => {
    
    const option = document.createElement('option');
    
    option.value = p.project_id;
    option.textContent = p.name;
    
    projectSelect.appendChild(option);
    
  });
  
  projectSelect.value = current;
  
}

async function loadUsers() {
  
  const current = createdBySelect.value;
  
  const res = await fetch('/api/users');
  const data = await res.json();
  
  console.log('loadUsers current before rebuild =', createdBySelect.value);
  createdBySelect.innerHTML =
  '<option value="">— выбрать пользователя —</option>';
  
  data.forEach(u => {
    
    const option = document.createElement('option');
    
    option.value = u.user_id;
    option.textContent = u.full_name || u.name;
    
    createdBySelect.appendChild(option);
    
  });
  
  createdBySelect.value = current;
  
}

async function loadBatteries() {
  
  const res = await fetch('/api/batteries');
  
  if (!res.ok) {
    console.error('Failed to load batteries');
    return;
  }
  
  batteries = await res.json();
  
  renderBatteriesList();
  
}


async function loadSeparators() {
  const res = await fetch('/api/separators');

  if (!res.ok) {
    console.error('Failed to load separators');
    return;
  }

  const data = await res.json();

  const selects = [
    document.getElementById('coin_separator_id'),
    document.getElementById('pouch_separator_id'),
    document.getElementById('cyl_separator_id')
  ].filter(Boolean);

  selects.forEach(select => {
    const current = select.value;

    select.innerHTML = '<option value="">— выбрать сепаратор —</option>';

    data.forEach(s => {
      const option = document.createElement('option');
      option.value = s.sep_id;
      option.textContent = `#${s.sep_id} | ${s.name || '—'}`;
      select.appendChild(option);
    });

    select.value = current;
  });
}

async function loadElectrolytes() {
  const res = await fetch('/api/electrolytes');

  if (!res.ok) {
    console.error('Failed to load electrolytes');
    return;
  }

  const data = await res.json();

  const selects = [
    document.getElementById('coin_electrolyte_id'),
    document.getElementById('pouch_electrolyte_id'),
    document.getElementById('cyl_electrolyte_id')
  ].filter(Boolean);

  selects.forEach(select => {
    const current = select.value;

    select.innerHTML = '<option value="">— выбрать электролит —</option>';

    data.forEach(e => {
      const option = document.createElement('option');
      option.value = e.electrolyte_id;
      option.textContent = `#${e.electrolyte_id} | ${e.name || '—'}`;
      select.appendChild(option);
    });

    select.value = current;
  });
}


async function loadTapes() {
  
  const res = await fetch('/api/tapes/for-electrodes');
  
  if (!res.ok) {
    console.error('Failed to load tapes');
    return;
  }
  
  tapes = await res.json();
  
  renderTapeOptions();
  
}


async function loadCathodeBatches(tapeId) {
  
  const res =
  await fetch(`/api/tapes/${tapeId}/electrode-cut-batches`);
  
  if (!res.ok) {
    console.error('Failed to load cathode batches');
    return;
  }
  
  cathodeBatches = await res.json();
  
  renderCathodeBatchOptions();
  
}

async function loadAnodeBatches(tapeId) {
  
  const res =
  await fetch(`/api/tapes/${tapeId}/electrode-cut-batches`);
  
  if (!res.ok) {
    console.error('Failed to load anode batches');
    return;
  }
  
  anodeBatches = await res.json();
  
  renderAnodeBatchOptions();
  
}


async function loadCathodeElectrodes(batchId) {
  
  const res =
  await fetch(`/api/electrodes/electrode-cut-batches/${batchId}/electrodes`);
  
  if (!res.ok) {
    console.error('Failed to load cathode electrodes');
    return;
  }
  
  cathodeElectrodes = (await res.json()).filter(e => e.status_code === 1);
  
  renderCathodeElectrodeTable();
  
}

async function loadAnodeElectrodes(batchId) {
  
  const res =
  await fetch(`/api/electrodes/electrode-cut-batches/${batchId}/electrodes`);
  
  if (!res.ok) {
    console.error('Failed to load anode electrodes');
    return;
  }
  
  anodeElectrodes = (await res.json()).filter(e => e.status_code === 1);
  
  renderAnodeElectrodeTable();
  
}


// Load saved battery data
async function loadElectrodeSources(batteryId) {
  
  const res = await fetch(`/api/batteries/battery_electrode_sources/${batteryId}`);
  
  if (!res.ok) {
    console.error('Failed to load electrode sources');
    return;
  }
  
  const data = await res.json();
  
  if (!data) return;
  
  const cathodeTape = document.getElementById('cathode_tape_id');
  const cathodeBatch = document.getElementById('cathode_cut_batch_id');
  
  const anodeTape = document.getElementById('anode_tape_id');
  const anodeBatch = document.getElementById('anode_cut_batch_id');
  
  cathodeTape.value = data.cathode_tape_id || '';
  anodeTape.value = data.anode_tape_id || '';
  
  if (data.cathode_tape_id) {
    await loadCathodeBatches(data.cathode_tape_id);
    cathodeBatch.value = data.cathode_cut_batch_id || '';
  }
  
  if (data.anode_tape_id) {
    await loadAnodeBatches(data.anode_tape_id);
    anodeBatch.value = data.anode_cut_batch_id || '';
  }
  
}

async function loadElectrodeStack(batteryId) {
  
  const res = await fetch(`/api/batteries/battery_electrodes/${batteryId}`);
  
  if (!res.ok) return;
  
  const stack = await res.json();
  
  if (!stack || stack.length === 0) return;
  
  // reset current selections
  selectedCathodes = [];
  selectedAnodes = [];
  
  for (const row of stack) {
    
    const electrode = {
      electrode_id: row.electrode_id,
      electrode_mass_g: row.electrode_mass_g ?? null
    };
    
    if (row.role === 'cathode') {
      selectedCathodes.push(electrode);
    }
    
    if (row.role === 'anode') {
      selectedAnodes.push(electrode);
    }
    
  }
  
  renderStackSummary();
  
}


// Load a battery for editing
async function loadBatteryAssembly(batteryId) {
  isRestoringBattery = true;
  
  const res = await fetch(`/api/batteries/${batteryId}/assembly`);
  
  if (!res.ok) {
    isRestoringBattery = false;
    console.error('Failed to load battery assembly');
    return;
  }
  
  const data = await res.json();

  clearFieldset(document.getElementById('coin_config'));
  clearFieldset(document.getElementById('pouch_config'));
  clearFieldset(document.getElementById('cyl_config'));
  clearFieldset(document.getElementById('coin_assembly'));
  clearFieldset(document.getElementById('pouch_assembly'));
  clearFieldset(document.getElementById('cyl_assembly'));
  clearFieldset(document.getElementById('battery_qc'));
  clearFieldset(document.getElementById('battery_electrode_sources'));
  clearFieldset(document.getElementById('battery_electrochem'));
  savedElectrochemEntries = [];
  resetElectrodeSelection();

  const battery = data.battery;

  document.getElementById('battery_project_id').value =
  battery.project_id ?? '';
  
  document.getElementById('battery_created_by').value =
  battery.created_by ?? '';
  
  document.getElementById('battery_form_factor').value =
  battery.form_factor ?? '';
  
  document.getElementById('battery_notes').value =
  battery.battery_notes ?? battery.notes ?? '';

  document.getElementById('battery_form_factor')
  .dispatchEvent(new Event('change'));
  
  populateFieldset(
    document.getElementById('coin_config'),
    data.coin_config
  );
  
  populateFieldset(
    document.getElementById('pouch_config'),
    data.pouch_config
  );
  
  populateFieldset(
    document.getElementById('cyl_config'),
    data.cyl_config
  );

  populateFieldset(document.getElementById('coin_assembly'), {
    ...(data.coin_config || {}),
    ...(data.separator || {}),
    ...(data.electrolyte || {})
  });

  populateFieldset(document.getElementById('pouch_assembly'), {
    ...(data.pouch_config || {}),
    ...(data.separator || {}),
    ...(data.electrolyte || {})
  });

  populateFieldset(document.getElementById('cyl_assembly'), {
    ...(data.cyl_config || {}),
    ...(data.separator || {}),
    ...(data.electrolyte || {})
  });

  populateFieldset(
    document.getElementById('battery_qc'),
    data.qc
  );
  syncBatteryStatusSelect(battery, data);

  savedElectrochemEntries = Array.isArray(data.electrochem) ? data.electrochem : [];
  document.getElementById('electrochem_notes').value =
  '';
  renderElectrochemSavedFiles(savedElectrochemEntries);
  
  document.getElementById('coin_cell_mode')
  .dispatchEvent(new Event('change'));
  
  document.getElementById('coin_half_cell_type')
  .dispatchEvent(new Event('change'));
  
  updateCoinLayoutDropCount();
  updateElectrolyteVolume();
  
  /* restore stack */
  
  if (Array.isArray(data.electrodes) && data.electrodes.length > 0) {
    
    selectedCathodes = [];
    selectedAnodes = [];
    
    data.electrodes.forEach(row => {
      
      const electrode = {
        electrode_id: row.electrode_id,
        electrode_mass_g: row.electrode_mass_g ?? null
      };
      
      if (row.role === 'cathode') {
        selectedCathodes.push(electrode);
      }
      
      if (row.role === 'anode') {
        selectedAnodes.push(electrode);
      }
    });
  }
  
  /* restore tape sources first */
  
  let savedCathodeBatchId = '';
  let savedAnodeBatchId = '';
  
  if (Array.isArray(data.electrode_sources)) {
    
    data.electrode_sources.forEach(src => {
      
      if (src.role === 'cathode') {
        
        if (src.tape_id) {
          document.getElementById('cathode_tape_id').value =
          src.tape_id;
        }

        document.getElementById('cathode_source_notes').value =
        src.source_notes ?? '';
        
        if (src.cut_batch_id) {
          savedCathodeBatchId = String(src.cut_batch_id);
        }
        
      }
      
      if (src.role === 'anode') {
        
        if (src.tape_id) {
          document.getElementById('anode_tape_id').value =
          src.tape_id;
        }

        document.getElementById('anode_source_notes').value =
        src.source_notes ?? '';
        
        if (src.cut_batch_id) {
          savedAnodeBatchId = String(src.cut_batch_id);
        }
        
      }
      
    });
    
  }
  
  /* load batches from restored tapes */
  
  const cathodeTapeId =
  document.getElementById('cathode_tape_id').value;
  
  if (cathodeTapeId) {
    await loadCathodeBatches(cathodeTapeId);
  }
  
  const anodeTapeId =
  document.getElementById('anode_tape_id').value;
  
  if (anodeTapeId) {
    await loadAnodeBatches(anodeTapeId);
  }
  
  /* restore saved batch selections */
  
  if (savedCathodeBatchId) {
    document.getElementById('cathode_cut_batch_id').value =
    savedCathodeBatchId;
  }
  
  if (savedAnodeBatchId) {
    document.getElementById('anode_cut_batch_id').value =
    savedAnodeBatchId;
  }
  
  /* load electrodes for restored batches */
  
  if (savedCathodeBatchId) {
    await loadCathodeElectrodes(savedCathodeBatchId);
  }
  
  if (savedAnodeBatchId) {
    await loadAnodeElectrodes(savedAnodeBatchId);
  }
  
  renderStackSummary();
  applySavedElectrodeState(data);
  isRestoringBattery = false;
  markBatteryStateSaved();
  updateBatteryLocks();
  
}


// -------- Rendering --------

function renderBatteriesList() {
  
  const list = document.getElementById('batteriesList');
  
  list.innerHTML = '';
  
  batteries.forEach(b => {
    
    const li = document.createElement('li');
    const btn = document.createElement('button');
    
    btn.type = 'button';
    const status =
    b.is_complete ? '✓ готово' : '⚠ не завершён';
    
    btn.textContent =
    `#${b.battery_id} | ${status} | ${b.project_name || '—'} | ${b.form_factor}`;
    
    btn.addEventListener('click', () => {
      populateBatteryForm(b);
    });
    
    li.appendChild(btn);
    list.appendChild(li);
    
  });
  
}

function renderTapeOptions() {
  
  const projectId =
  document.getElementById('battery_project_id').value;
  
  const cathodeSelect =
  document.getElementById('cathode_tape_id');
  
  const anodeSelect =
  document.getElementById('anode_tape_id');
  
  cathodeSelect.innerHTML =
  '<option value="">— выбрать ленту —</option>';
  
  anodeSelect.innerHTML =
  '<option value="">— выбрать ленту —</option>';
  
  const filtered = tapes.filter(t =>
    !projectId || t.project_id == projectId
  );
  
  filtered.forEach(t => {
    
    const option = document.createElement('option');
    
    option.value = t.tape_id;
    
    option.textContent =
    `#${t.tape_id} | ${t.name} | ${t.created_by}`;
    
    if (t.role === 'cathode') {
      cathodeSelect.appendChild(option.cloneNode(true));
    }
    
    if (t.role === 'anode') {
      anodeSelect.appendChild(option.cloneNode(true));
    }
    
  });
  
}


function renderCathodeBatchOptions() {
  
  const select =
  document.getElementById('cathode_cut_batch_id');
  
  select.innerHTML =
  '<option value="">— выбрать партию —</option>';
  
  cathodeBatches.forEach(b => {
    
    const option = document.createElement('option');
    
    option.value = b.cut_batch_id;
    
    option.textContent =
    `#${b.cut_batch_id} | ${b.created_by}`;
    
    select.appendChild(option);
    
  });
  
}

function renderAnodeBatchOptions() {
  
  const select =
  document.getElementById('anode_cut_batch_id');
  
  select.innerHTML =
  '<option value="">— выбрать партию —</option>';
  
  anodeBatches.forEach(b => {
    
    const option = document.createElement('option');
    
    option.value = b.cut_batch_id;
    
    option.textContent =
    `#${b.cut_batch_id} | ${b.created_by}`;
    
    select.appendChild(option);
    
  });
  
}


function renderCathodeElectrodeTable() {
  
  const body =
  document.getElementById('stack_cathode_table_body');
  
  body.innerHTML = '';
  //      selectedCathodes = [];
  //     renderStackSummary();
  
  cathodeElectrodes.forEach((e, index) => {
    
    const tr = document.createElement('tr');
    
    const numCell = document.createElement('td');
    numCell.textContent = index + 1;
    tr.appendChild(numCell);
    
    const idCell = document.createElement('td');
    idCell.textContent = e.electrode_id;
    tr.appendChild(idCell);
    
    const massCell = document.createElement('td');
    massCell.textContent = e.electrode_mass_g ?? '';
    tr.appendChild(massCell);
    
    const selectCell = document.createElement('td');
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = e.electrode_id;
    checkbox.dataset.available = e.status_code === 1 ? 'true' : 'false';
    checkbox.checked = selectedCathodes.some(
      el => el.electrode_id === e.electrode_id
    );
    
    checkbox.addEventListener('change', e => {
      
      const electrodeId = Number(e.target.value);
      
      if (e.target.checked) {
        
        const electrode =
        cathodeElectrodes.find(
          el => el.electrode_id === electrodeId
        );
        
        if (!selectedCathodes.some(el => el.electrode_id === electrodeId)) {
          selectedCathodes.push(electrode);
        }
        
      } else {
        
        selectedCathodes =
        selectedCathodes.filter(
          el => el.electrode_id !== electrodeId
        );
        
      }
      
      renderStackSummary();
      updateElectrodeCheckboxStates();
      updateBatteryLocks();
      updateDirtyFlags();
      
    });
    
    selectCell.appendChild(checkbox);
    tr.appendChild(selectCell);
    
    body.appendChild(tr);
    
  });

  updateElectrodeCheckboxStates();
  
}

function renderAnodeElectrodeTable() {
  
  const body =
  document.getElementById('stack_anode_table_body');
  
  body.innerHTML = '';
  //      selectedAnodes = [];
  //      renderStackSummary();
  
  anodeElectrodes.forEach((e, index) => {
    
    const tr = document.createElement('tr');
    
    const numCell = document.createElement('td');
    numCell.textContent = index + 1;
    tr.appendChild(numCell);
    
    const idCell = document.createElement('td');
    idCell.textContent = e.electrode_id;
    tr.appendChild(idCell);
    
    const massCell = document.createElement('td');
    massCell.textContent = e.electrode_mass_g ?? '';
    tr.appendChild(massCell);
    
    const selectCell = document.createElement('td');
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = e.electrode_id;
    checkbox.dataset.available = e.status_code === 1 ? 'true' : 'false';
    checkbox.checked = selectedAnodes.some(
      el => el.electrode_id === e.electrode_id
    );
    
    checkbox.addEventListener('change', e => {
      
      const electrodeId = Number(e.target.value);
      
      if (e.target.checked) {
        
        const electrode =
        anodeElectrodes.find(
          el => el.electrode_id === electrodeId
        );
        
        if (!selectedAnodes.some(el => el.electrode_id === electrodeId)) {
          selectedAnodes.push(electrode);
        }
        
      } else {
        
        selectedAnodes =
        selectedAnodes.filter(
          el => el.electrode_id !== electrodeId
        );
        
      }
      
      renderStackSummary();
      updateElectrodeCheckboxStates();
      updateBatteryLocks();
      updateDirtyFlags();
      
    });
    
    selectCell.appendChild(checkbox);
    tr.appendChild(selectCell);
    
    body.appendChild(tr);
    
  });

  updateElectrodeCheckboxStates();
  
}


function renderStackSummary() {
  
  const body =
  document.getElementById('battery_stack_summary_body');
  
  body.innerHTML = '';
  
  const mode =
  document.getElementById('coin_cell_mode')?.value;
  
  const halfType =
  document.getElementById('coin_half_cell_type')?.value;
  
  let cathodes = [...selectedCathodes];
  let anodes = [...selectedAnodes];
  
  /* ---------- enforce selection rules ---------- */
  
  if (mode === 'half_cell') {
    
    if (halfType === 'cathode_vs_li') {
      cathodes = cathodes.slice(0, 1);
      anodes = [];
    }
    
    if (halfType === 'anode_vs_li') {
      anodes = anodes.slice(0, 1);
      cathodes = [];
    }
    
  }
  
  if (mode === 'full_cell') {
    
    cathodes = cathodes.slice(0, 1);
    anodes = anodes.slice(0, 1);
    
  }
  
  /* ---------- sort by mass (descending) ---------- */
  
  cathodes.sort((a,b)=>b.electrode_mass_g-a.electrode_mass_g);
  anodes.sort((a,b)=>b.electrode_mass_g-a.electrode_mass_g);
  
  /* ---------- interleave A-C-A-C ---------- */
  
  const stack = [];
  
  const max =
  Math.max(cathodes.length, anodes.length);
  
  for (let i=0;i<max;i++){
    
    if (anodes[i]) {
      stack.push({
        role:'Анод',
        ...anodes[i]
      });
    }
    
    if (cathodes[i]) {
      stack.push({
        role:'Катод',
        ...cathodes[i]
      });
    }
    
  }
  
  /* ---------- render stack ---------- */
  
  stack.forEach((e,index)=>{
    
    const tr = document.createElement('tr');
    
    const posCell = document.createElement('td');
    posCell.textContent = index+1;
    tr.appendChild(posCell);
    
    const idCell = document.createElement('td');
    idCell.textContent = e.electrode_id;
    tr.appendChild(idCell);
    
    const roleCell = document.createElement('td');
    roleCell.textContent = e.role;
    tr.appendChild(roleCell);
    
    const massCell = document.createElement('td');
    massCell.textContent = e.electrode_mass_g ?? '';
    tr.appendChild(massCell);
    
    body.appendChild(tr);
    
  });
  
}



// -------- Status helper --------

function buildStackPayload() {
  
  const stack = [];
  
  let position = 1;
  
  const cathodes = [...selectedCathodes];
  const anodes = [...selectedAnodes];
  
  const maxLen = Math.max(cathodes.length, anodes.length);
  
  for (let i = 0; i < maxLen; i++) {
    
    if (anodes[i]) {
      stack.push({
        electrode_id: anodes[i].electrode_id,
        role: 'anode',
        position_index: position++
      });
    }
    
    if (cathodes[i]) {
      stack.push({
        electrode_id: cathodes[i].electrode_id,
        role: 'cathode',
        position_index: position++
      });
    }
    
  }
  
  stack.forEach((row, index) => {
    row.position_index = index + 1;
  });
  
  return stack;
  
}

function validateStackBalance() {
  
  const formFactor =
  document.getElementById('battery_form_factor').value;
  
  const coinCellMode =
  document.getElementById('coin_cell_mode').value;
  
  const cathodes = selectedCathodes.length;
  const anodes = selectedAnodes.length;
  
  // For half-cells, balance does not apply
  if (formFactor === 'coin' && coinCellMode === 'half_cell') {
    return true;
  }
  
  // For full cells / pouch / cylindrical, require equal counts
  if (cathodes !== anodes) {
    alert(
      `Несбалансированный стек: катодов = ${cathodes}, анодов = ${anodes}. ` +
      'Для полного элемента количество катодов и анодов должно совпадать.'
    );
    return false;
  }
  
  return true;
  
}

function validateStackSelection() {
  
  const formFactor =
  document.getElementById('battery_form_factor').value;
  
  const coinCellMode =
  document.getElementById('coin_cell_mode').value;
  
  const halfCellType =
  document.getElementById('coin_half_cell_type').value;
  
  const cathodes = selectedCathodes.length;
  const anodes = selectedAnodes.length;
  
  /* ----- coin half-cell rules ----- */
  
  if (formFactor === 'coin' && coinCellMode === 'half_cell') {
    
    if (halfCellType === 'cathode_vs_li') {
      
      if (cathodes === 0) {
        alert('Выберите хотя бы один катод');
        return false;
      }
      
      return true;
    }
    
    if (halfCellType === 'anode_vs_li') {
      
      if (anodes === 0) {
        alert('Выберите хотя бы один анод');
        return false;
      }
      
      return true;
    }
    
    alert('Выберите тип полуячейки');
    return false;
    
  }
  
  /* ----- full-cell / pouch / cylindrical rules ----- */
  
  if (cathodes === 0) {
    alert('Выберите хотя бы один катод');
    return false;
  }
  
  if (anodes === 0) {
    alert('Выберите хотя бы один анод');
    return false;
  }
  
  if (!validateStackBalance()) {
    return false;
  }
  
  return true;
  
}

function resetElectrodeSelection() {
  
  selectedCathodes = [];
  selectedAnodes = [];
  
  cathodeElectrodes = [];
  anodeElectrodes = [];
  
  cathodeBatches = [];
  anodeBatches = [];
  
  document.getElementById('cathode_tape_id').value = '';
  document.getElementById('anode_tape_id').value = '';
  
  document.getElementById('cathode_cut_batch_id').innerHTML =
  '<option value="">— выбрать партию —</option>';
  
  document.getElementById('anode_cut_batch_id').innerHTML =
  '<option value="">— выбрать партию —</option>';
  
  document.getElementById('stack_cathode_table_body').innerHTML = '';
  document.getElementById('stack_anode_table_body').innerHTML = '';
  
  resetElectrodeUiState();
  renderStackSummary();
  updateBatteryLocks();
  updateDirtyFlags();
  
}



// -------- Events --------

// prevent default form submission
document
.querySelector('form[name="battery_assembly_log_form"]')
.addEventListener('submit', (e) => {
  e.preventDefault();
});

document
.querySelector('form[name="battery_assembly_log_form"]')
.addEventListener('input', () => {
  if (isRestoringBattery) return;
  updateBatteryLocks();
  updateDirtyFlags();
});

document
.querySelector('form[name="battery_assembly_log_form"]')
.addEventListener('change', () => {
  if (isRestoringBattery) return;
  updateBatteryLocks();
  updateDirtyFlags();
});

document
.getElementById('battery_status')
.addEventListener('change', async () => {
  try {
    await saveBatteryStatus();
    markSectionsSaved(['battery_qc']);
    alert('Статус батареи сохранён.');
  } catch (err) {
    console.error(err);
    alert(err.message || 'Ошибка сохранения статуса батареи');
  }
});

/* ---------- EXIT BATTERIES ---------- */

const exitBatteriesBtn = document.getElementById('exitBatteriesBtn');

exitBatteriesBtn.addEventListener('click', () => {

  if (hasUnsavedBatteryChanges()) {
    const confirmExit = confirm('Выйти без сохранения?');
    
    if (!confirmExit) return;
  }

  currentBatteryId = null;
  lastSavedBatteryState = null;
  lastSavedSectionStates = {};

  // reset form
  document.querySelector('form[name="battery_assembly_log_form"]').reset();

  // hide workspace + header
  document.getElementById('battery_workspace').hidden = true;
  document.getElementById('battery_header').hidden = true;

  // clear electrode-related state (this function EXISTS)
  resetElectrodeSelection();
  updateBatteryLocks();

  // clear batteries list UI
  const list = document.getElementById('batteriesList');
  list.innerHTML = '';
  clearDirtyFlags();

  loadBatteries();

});


document.getElementById('battery_create_btn').onclick = async () => {
  
  const projectId = document.getElementById('battery_project_id').value;
  const createdBy = document.getElementById('battery_created_by').value;
  const formFactor = document.getElementById('battery_form_factor').value;
  const batteryNotes = document.getElementById('battery_notes').value;
  
  if (!projectId || !createdBy || !formFactor) {
    alert('Заполните проект, оператора и форм-фактор');
    return;
  }
  
  try {
    
    if (!currentBatteryId) {
      
      const payload = {
        project_id: Number(projectId),
        created_by: Number(createdBy),
        form_factor: formFactor,
        battery_notes: batteryNotes || null
      };
      
      const res = await fetch('/api/batteries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        throw new Error('Ошибка создания аккумулятора');
      }
      
      const battery = await res.json();
      
      currentBatteryId = battery.battery_id;
      
      unlockBatteryWorkspace({
        battery_id: battery.battery_id,
        project_id: battery.project_id,
        created_by: battery.created_by,
        form_factor: battery.form_factor,
        notes: battery.battery_notes ?? null
      });
      
      document.getElementById('battery_create_btn').textContent =
      'Сохранить шапку';
      
      await loadTapes();
      await loadBatteries();
      markBatteryStateSaved();
      
      return;
    }
    
    const headerPayload = {
      project_id: Number(projectId),
      created_by: Number(createdBy),
      form_factor: formFactor,
      battery_notes: batteryNotes || null
    };
    
    const updatedBattery = await updateBatteryMeta(
      currentBatteryId,
      headerPayload
    );
    
    unlockBatteryWorkspace(updatedBattery);
    await loadTapes();
    await loadBatteries();
    markBatteryStateSaved();
    
    alert('Шапка аккумулятора сохранена');
    
  } catch (err) {
    
    console.error(err);
    alert('Ошибка сохранения аккумулятора');
    
  }
  
};

async function populateBatteryForm(battery) {
  
  currentBatteryId = battery.battery_id;
  
  document.getElementById('battery_project_id').value =
  battery.project_id ?? '';
  
  document.getElementById('battery_created_by').value =
  battery.created_by ?? '';
  
  document.getElementById('battery_form_factor').value =
  battery.form_factor ?? '';
  
  document.getElementById('battery_notes').value =
  battery.notes ?? battery.battery_notes ?? '';
  
  const btn = document.getElementById('battery_create_btn');
  btn.textContent = 'Сохранить изменения';
  btn.dataset.mode = 'update';
  
  unlockBatteryWorkspace(battery);
  
  document.getElementById('battery_form_factor').dispatchEvent(
    new Event('change')
  );
  
  await loadTapes();
  
  await loadBatteryAssembly(battery.battery_id);
  
}


function unlockBatteryWorkspace(battery) {
  
  document.getElementById('battery_header').hidden = false;
  document.getElementById('battery_workspace').hidden = false;
  
  document.getElementById('battery_id_label').textContent =
  `#${battery.battery_id}`;
  
  const projectSelect =
  document.getElementById('battery_project_id');
  
  const operatorSelect =
  document.getElementById('battery_created_by');
  
  const formFactorSelect =
  document.getElementById('battery_form_factor');
  
  document.getElementById('battery_project_label').textContent =
  projectSelect.selectedOptions[0]?.textContent || '—';
  
  document.getElementById('battery_formfactor_label').textContent =
  formFactorSelect.selectedOptions[0]?.textContent || '—';
  
  document.getElementById('battery_operator_label').textContent =
  operatorSelect.selectedOptions[0]?.textContent || '—';
  
}


const formFactorSelect =
document.getElementById('battery_form_factor');

formFactorSelect.addEventListener('change', () => {
  
  const coinConfig = document.getElementById('coin_config');
  const pouchConfig = document.getElementById('pouch_config');
  const cylConfig = document.getElementById('cyl_config');
  
  const coinAssembly = document.getElementById('coin_assembly');
  const pouchAssembly = document.getElementById('pouch_assembly');
  const cylAssembly = document.getElementById('cyl_assembly');
  
  let totalVolumeInput = null;

  if (formFactorSelect.value === 'coin') {
    totalVolumeInput = document.getElementById('coin_electrolyte_total_ul');
  }

  if (formFactorSelect.value === 'pouch') {
    totalVolumeInput = document.getElementById('pouch_electrolyte_total_ul');
  }

  if (formFactorSelect.value === 'cylindrical') {
    totalVolumeInput = document.getElementById('cyl_electrolyte_total_ul');
  }
  
  coinConfig.hidden = true;
  pouchConfig.hidden = true;
  cylConfig.hidden = true;
  
  coinAssembly.hidden = true;
  pouchAssembly.hidden = true;
  cylAssembly.hidden = true;
  
  if (formFactorSelect.value === 'coin') {
    coinConfig.hidden = false;
    coinAssembly.hidden = false;
    totalVolumeInput.readOnly = true;
  }
  
  if (formFactorSelect.value === 'pouch') {
    pouchConfig.hidden = false;
    pouchAssembly.hidden = false;
    totalVolumeInput.readOnly = false;
  }
  
  if (formFactorSelect.value === 'cylindrical') {
    cylConfig.hidden = false;
    cylAssembly.hidden = false;
    totalVolumeInput.readOnly = false;
  }
  
  if (!isRestoringBattery) {
    selectedCathodes = selectedCathodes.slice(0, 1);
    selectedAnodes = selectedAnodes.slice(0, 1);
    renderCathodeElectrodeTable();
    renderAnodeElectrodeTable();
    renderStackSummary();
    updateElectrodeCheckboxStates();
    updateBatteryLocks();
    updateDirtyFlags();
  }
  
});


const coinCellModeSelect = document.getElementById('coin_cell_mode');
const halfCellTypeSelect = document.getElementById('coin_half_cell_type');

coinCellModeSelect.addEventListener('change', () => {
  
  const halfTypeBlock =
  document.getElementById('coin_half_cell_type_block');
  
  if (coinCellModeSelect.value === 'half_cell') {
    halfTypeBlock.hidden = false;
  } else {
    halfTypeBlock.hidden = true;
  }
  
  if (!isRestoringBattery) {
    selectedCathodes = selectedCathodes.slice(0, 1);
    selectedAnodes = selectedAnodes.slice(0, 1);
    renderCathodeElectrodeTable();
    renderAnodeElectrodeTable();
    renderStackSummary();
    updateElectrodeCheckboxStates();
    updateBatteryLocks();
    updateDirtyFlags();
  }
  
});

halfCellTypeSelect.addEventListener('change', () => { 
  
  const cathodeBlock =
  document.getElementById('cathode_source_block');
  
  const anodeBlock =
  document.getElementById('anode_source_block');
  
  const liFoilBlock =
  document.getElementById('li-foil_block');
  
  cathodeBlock.hidden = false;
  anodeBlock.hidden = false;
  liFoilBlock.hidden = true;
  
  if (halfCellTypeSelect.value === 'cathode_vs_li') {
    
    anodeBlock.hidden = true;
    liFoilBlock.hidden = false;
    
  }
  
  if (halfCellTypeSelect.value === 'anode_vs_li') {
    
    cathodeBlock.hidden = true;
    liFoilBlock.hidden = false;
    
  }
  
  resetElectrodeSelection();
  
  if (!isRestoringBattery) {
    updateBatteryLocks();
    updateDirtyFlags();
  }
  
});

document
.getElementById('battery_project_id')
.addEventListener('change', () => {
  console.log('battery_project_id changed to', document.getElementById('battery_project_id').value);
  resetElectrodeSelection();
  loadTapes();
  console.log('battery_project_id changed to', document.getElementById('battery_project_id').value);
  if (!isRestoringBattery) {
    updateBatteryLocks();
    updateDirtyFlags();
  }
});

document
.getElementById('cathode_tape_id')
.addEventListener('change', e => {
  
  const tapeId = e.target.value;
  
  if (!tapeId) return;
  
  loadCathodeBatches(tapeId);
  if (!isRestoringBattery) {
    updateBatteryLocks();
    updateDirtyFlags();
  }
  
});

document
.getElementById('anode_tape_id')
.addEventListener('change', e => {
  
  const tapeId = e.target.value;
  
  if (!tapeId) return;
  
  loadAnodeBatches(tapeId);
  if (!isRestoringBattery) {
    updateBatteryLocks();
    updateDirtyFlags();
  }
  
});

document
.getElementById('cathode_cut_batch_id')
.addEventListener('change', e => {
  
  const batchId = e.target.value;
  
  if (!batchId) return;
  
  loadCathodeElectrodes(batchId);
  if (!isRestoringBattery) {
    updateBatteryLocks();
    updateDirtyFlags();
  }
  
});

document
.getElementById('anode_cut_batch_id')
.addEventListener('change', e => {
  
  const batchId = e.target.value;
  
  if (!batchId) return;
  
  loadAnodeElectrodes(batchId);
  if (!isRestoringBattery) {
    updateBatteryLocks();
    updateDirtyFlags();
  }
  
});

const dropCountInput =
document.getElementById('electrolyte_drop_count');

const dropVolumeInput =
document.getElementById('electrolyte_drop_volume');

function updateCoinLayoutDropCount() {
  const formFactor =
  document.getElementById('battery_form_factor').value;

  if (formFactor !== 'coin') {
    dropCountInput.readOnly = false;
    return;
  }

  const selectedLayout = document.querySelector('input[name="coin_layout"]:checked')?.value;

  if (selectedLayout === 'SE' || selectedLayout === 'ES') {
    dropCountInput.value = '1';
    dropCountInput.readOnly = true;
    return;
  }

  if (
    selectedLayout === 'ESE' ||
    selectedLayout === 'SEE' ||
    selectedLayout === 'EES'
  ) {
    dropCountInput.value = '2';
    dropCountInput.readOnly = true;
    return;
  }

  dropCountInput.readOnly = false;
}

function updateElectrolyteVolume() {

  const formFactor =
  document.getElementById('battery_form_factor').value;

  const totalVolumeInput =
  document.getElementById('coin_electrolyte_total_ul');

  if (formFactor !== 'coin') {
    totalVolumeInput.value = '';
    return;
  }

  const count = Number(dropCountInput.value);
  const volume = Number(dropVolumeInput.value);

  if (!Number.isFinite(count) || !Number.isFinite(volume)) {
    totalVolumeInput.value = '';
    return;
  }

  totalVolumeInput.value = (count * volume).toFixed(1);

}

dropCountInput.addEventListener('input', updateElectrolyteVolume);
dropVolumeInput.addEventListener('input', updateElectrolyteVolume);
formFactorSelect.addEventListener('change', updateElectrolyteVolume);
formFactorSelect.addEventListener('change', updateCoinLayoutDropCount);

document
.querySelectorAll('input[name="coin_layout"]')
.forEach(radio => {
  radio.addEventListener('change', () => {
    updateCoinLayoutDropCount();
    updateElectrolyteVolume();
  });
});



// -------- Init --------

window.addEventListener('focus', async () => {
  
  const wasClean = !hasUnsavedBatteryChanges();
  
  await refreshBatteryReferenceData();
  
  if (currentBatteryId && wasClean) {
    markBatteryStateSaved();
  }
  
});

refreshBatteryReferenceData();
loadBatteries();
updateCoinLayoutDropCount();
