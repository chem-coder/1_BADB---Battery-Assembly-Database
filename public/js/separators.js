const addInput = document.getElementById('separator-name');
const nameInput = document.getElementById('separator-name-input');
const form = document.forms['separator-form'];
const title = form.querySelector('h2');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const exitBtn = document.getElementById('exitBtn');
const saveFilesBtn = document.getElementById('saveFilesBtn');
const createdBySelect = document.getElementById('separator-created-by');
const filesInput = document.getElementById('separator-files');
const savedFilesBox = document.getElementById('separator-files-saved');

const separatorsList = document.getElementById('separatorsList');
const statusSelect = form.querySelector('select[name="status"]');
const depletedInput = form.querySelector('input[name="depleted_at"]');
const depletedWrapper = document.getElementById('depleted-wrapper');
const structureSelect = document.getElementById('separator-structure-id');

let mode = null; // 'create' | 'edit'
let currentId = null;
let savedSeparatorFiles = [];
let initialFormState = null;

function showForm() {
  form.hidden = false;
  addInput.disabled = true;
}

function hideForm() {
  form.hidden = true;
  addInput.disabled = false;
}

function captureFormState() {
  return JSON.stringify({
    mode,
    title: title.textContent,
    nameInput: nameInput.value,
    supplier: form.elements['supplier'].value,
    brand: form.elements['brand'].value,
    batch: form.elements['batch'].value,
    air_perm: form.elements['air_perm'].value,
    air_perm_units: form.elements['air_perm_units'].value,
    thickness_um: form.elements['thickness_um'].value,
    porosity: form.elements['porosity'].value,
    comments: form.elements['comments'].value,
    status: form.elements['status'].value,
    depleted_at: form.elements['depleted_at'].value,
    structure_id: structureSelect.value,
    file_path: form.elements['file_path'].value,
    pending_files: Array.from(filesInput.files || []).map(file => file.name),
    saved_files: savedSeparatorFiles.map(file => file.separator_file_id)
  });
}

function markFormPristine() {
  initialFormState = captureFormState();
}

function hasUnsavedChanges() {
  if (!mode) return false;
  return captureFormState() !== initialFormState;
}

function populateSeparatorForm(sep) {
  form.elements['supplier'].value = sep.supplier || '';
  form.elements['brand'].value = sep.brand || '';
  form.elements['batch'].value = sep.batch || '';
  form.elements['air_perm'].value = sep.air_perm ?? '';
  form.elements['air_perm_units'].value = sep.air_perm_units || '';
  form.elements['thickness_um'].value = sep.thickness_um ?? '';
  form.elements['porosity'].value = sep.porosity ?? '';
  form.elements['comments'].value = sep.comments || '';
  form.elements['status'].value = sep.status || 'available';
  form.elements['depleted_at'].value = sep.depleted_at || '';
  form.elements['file_path'].value = sep.file_path || '';

  document.getElementById('separator-structure-id').value = sep.structure_id || '';
}

function renderSavedSeparatorFiles(entries) {
  savedFilesBox.innerHTML = '';

  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  entries.forEach((entry, index) => {
    const row = document.createElement('div');
    const link = document.createElement('a');
    const deleteBtn = document.createElement('button');

    link.href = entry.download_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = entry.file_name || `Файл ${index + 1}`;

    deleteBtn.type = 'button';
    deleteBtn.textContent = '🗑';
    deleteBtn.title = 'Удалить файл';
    deleteBtn.style.marginLeft = '0.5rem';
    deleteBtn.onclick = async () => {
      const fileName = entry.file_name || `Файл ${index + 1}`;

      if (!confirm(`Удалить файл "${fileName}"?`)) return;

      try {
        await deleteSeparatorFile(entry.separator_file_id);
        savedSeparatorFiles = savedSeparatorFiles.filter(
          (file) => file.separator_file_id !== entry.separator_file_id
        );
        renderSavedSeparatorFiles(savedSeparatorFiles);
        markFormPristine();
        showStatus('Файл удалён');
      } catch (err) {
        showStatus(err.message, true);
      }
    };

    row.append(`${index + 1}. `);
    row.appendChild(link);
    row.appendChild(deleteBtn);
    savedFilesBox.appendChild(row);
  });
}

function updateSaveFilesButtonVisibility() {
  saveFilesBtn.hidden = !filesInput.files || filesInput.files.length === 0;
}

function clearSavedSeparatorFiles() {
  savedSeparatorFiles = [];
  renderSavedSeparatorFiles(savedSeparatorFiles);
}

function resetForm() {
  form.reset();
  title.textContent = '';
  mode = null;
  currentId = null;
  initialFormState = null;
  clearSavedSeparatorFiles();
  updateSaveFilesButtonVisibility();
  hideForm();
}

function formDataToObject(form) {
  const data = {};

  Array.from(new FormData(form).entries()).forEach(([key, value]) => {
    if (value instanceof File) return;
    data[key] = value;
  });

  return data;
}


// -------- API helpers --------

async function fetchSeparators() {
  const res = await fetch('/api/separators');
  return res.json();
}

async function createSeparator(data) {
  const res = await fetch('/api/separators', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Ошибка сохранения');
  }
  
  return res.json();
}

async function loadStructures() {
  const res = await fetch('/api/structures');
  const structures = await res.json();
  
  const select = document.getElementById('separator-structure-id');
  
  // CLEAR existing options first
  select.innerHTML = '<option value="">— выбрать —</option>';
  
  structures.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.sep_str_id;
    opt.textContent = s.name;
    select.appendChild(opt);
  });
}

async function updateSeparator(id, data) {
  const res = await fetch(`/api/separators/${id}`, {
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

async function fetchSeparatorFiles(id) {
  const res = await fetch(`/api/separators/${id}/files`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки файлов сепаратора');
  }

  return res.json();
}

async function uploadSeparatorFiles(id, entries) {
  const res = await fetch(`/api/separators/${id}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка сохранения файлов сепаратора');
  }

  return res.json();
}

async function deleteSeparatorFile(fileId) {
  const res = await fetch(`/api/separators/files/${fileId}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка удаления файла сепаратора');
  }
}

async function deleteSeparator(id) {
  const res = await fetch(`/api/separators/${id}`, {
    method: 'DELETE'
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Ошибка удаления');
  }
}


// -------- Rendering --------
function renderSeparators(separators) {
  separatorsList.innerHTML = '';
  
  separators.forEach(sep => {
    const li = document.createElement('li');
    li.className = 'user-row';
    
    const info = document.createElement('div');
    info.className = 'user-info';
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = sep.name;
    
    const statusSpan = document.createElement('span');
    statusSpan.className = 'status';
    statusSpan.textContent =
    sep.status === 'available' ? 'в наличии' :
    sep.status === 'used' ? 'израсходован' :
    'списан';
    
    info.appendChild(nameSpan);
    info.appendChild(statusSpan);
    
    const actions = document.createElement('div');
    actions.className = 'actions';
    
    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️';
    editBtn.title = 'Редактировать';          
    editBtn.onclick = async () => {
      mode = 'edit';
      currentId = sep.sep_id;
      
      // show form
      showForm();
      
      // title + name
      title.textContent = sep.name;
      nameInput.value = sep.name;

      populateSeparatorForm(sep);
      
      if (sep.created_by) {
        createdBySelect.value = sep.created_by;
      }

      filesInput.value = '';
      clearSavedSeparatorFiles();

      try {
        savedSeparatorFiles = await fetchSeparatorFiles(sep.sep_id);
        renderSavedSeparatorFiles(savedSeparatorFiles);
        markFormPristine();
      } catch (err) {
        showStatus(err.message, true);
      }
      
      updateDepletedState();
    };
    
    const duplicateBtn = document.createElement('button');
    duplicateBtn.textContent = '📄';
    duplicateBtn.title = 'Дублировать';
    
    duplicateBtn.onclick = () => {
      duplicateSeparator(sep);
    };
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑';
    deleteBtn.title = 'Удалить';
    deleteBtn.onclick = async () => {
      if (!confirm(`Удалить сепаратор "${sep.name}"?`)) return;
      
      try {
        await deleteSeparator(sep.sep_id);
        showStatus('Сепаратор удалён');
        loadSeparators();
      } catch (err) {
        showStatus(err.message, true);
      }
    };
    
    actions.appendChild(editBtn);
    actions.appendChild(duplicateBtn);
    actions.appendChild(deleteBtn);
    
    li.appendChild(info);
    li.appendChild(actions);
    
    separatorsList.appendChild(li);
  });
}

function duplicateSeparator(sep) {
  mode = 'create';
  currentId = null;
  
  showForm();
  
  // title + name
  const copyName = sep.name + ' (копия)';
  title.textContent = copyName;
  nameInput.value = copyName;

  populateSeparatorForm(sep);
  
  // IMPORTANT: reset things that must be new
  createdBySelect.value = '';
  form.elements['file_path'].value = '';
  depletedInput.value = '';
  filesInput.value = '';
  clearSavedSeparatorFiles();
  markFormPristine();
  
  updateDepletedState();
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

async function saveSeparatorRecord() {
  if (!validateRequiredFields()) return null;

  const data = formDataToObject(form);
  delete data.created_by;
  data.name = title.textContent;

  const initialMode = mode;
  let savedSeparator = null;

  if (initialMode === 'create') {
    savedSeparator = await createSeparator(data);
    currentId = savedSeparator.sep_id;
    mode = 'edit';
  } else if (initialMode === 'edit') {
    savedSeparator = await updateSeparator(currentId, data);
  }

  return {
    savedSeparator,
    initialMode
  };
}

async function uploadSelectedFiles() {
  const selectedFiles = Array.from(filesInput.files || []);

  if (selectedFiles.length === 0) {
    return [];
  }

  const entries = await Promise.all(selectedFiles.map(async (file) => ({
    file_name: file.name,
    mime_type: file.type || 'application/octet-stream',
    file_content_base64: await fileToBase64(file)
  })));

  savedSeparatorFiles = await uploadSeparatorFiles(currentId, entries);
  renderSavedSeparatorFiles(savedSeparatorFiles);
  filesInput.value = '';
  updateSaveFilesButtonVisibility();
  markFormPristine();

  return selectedFiles;
}

// ---------- Depleted Separator logic ----------

function updateDepletedState() {
  if (statusSelect.value === 'available') {
    depletedWrapper.hidden = true;
    depletedInput.value = '';
  } else {
    depletedWrapper.hidden = false;
  }
}

statusSelect.addEventListener('change', updateDepletedState);



// -------- Status helper --------

const statusBox = document.querySelector('.status-feedback');

function showStatus(msg, isError = false) {
  statusBox.textContent = msg;
  statusBox.style.color = isError ? '#b00020' : 'darkcyan';
  
  setTimeout(() => {
    statusBox.textContent = '';
  }, 1000);
}


// -------- Reference dropdowns --------

async function loadUsers() {
  const res = await fetch('/api/users');
  const users = await res.json();
  
  // CLEAR existing options first
  createdBySelect.replaceChildren(new Option(
    window.BADB_AUTH?.getAuditUserPlaceholder?.() || '— автоматически —',
    ''
  ));
  
  users
  .forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.user_id;
    opt.textContent = u.name;
    createdBySelect.appendChild(opt);
  });
}

// Refresh reference dropdowns on focus
structureSelect.addEventListener('focus', loadStructures);
createdBySelect.addEventListener('focus', loadUsers);


// -------- Events --------

addInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  
  e.preventDefault();
  
  if (!form.hidden) return;   // prevent double-create
  
  const name = addInput.value.trim();
  if (!name) return;
  
  mode = 'create';
  currentId = null;
  
  nameInput.value = name;
  title.textContent = name;
  
  showForm();
  
  addInput.value = '';
  markFormPristine();
});

function validateRequiredFields() {
  let missing = [];
  
  // clear previous highlights
  structureSelect.classList.remove('required-missing');
  
  if (!structureSelect.value) {
    missing.push('Тип структуры');
    structureSelect.classList.add('required-missing');
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

saveBtn.addEventListener('click', async () => {
  if (!mode) return;

  try {
    const { savedSeparator, initialMode } = await saveSeparatorRecord();
    const selectedFiles = await uploadSelectedFiles();

    if (savedSeparator) {
      const successMessage =
        initialMode === 'edit'
          ? (selectedFiles.length > 0 ? 'Изменения и файлы сохранены' : 'Изменения сохранены')
          : (selectedFiles.length > 0 ? 'Сепаратор и файлы сохранены' : 'Сепаратор сохранён');

      showStatus(successMessage);
    }
    
    resetForm();
    loadSeparators();   // refresh list
  } catch (err) {
    showStatus(err.message, true);
  }
  
});

saveFilesBtn.addEventListener('click', async () => {
  if (!filesInput.files || filesInput.files.length === 0) return;

  try {
    let createdNewSeparator = false;

    if (!currentId) {
      const result = await saveSeparatorRecord();

      if (!result?.savedSeparator) return;
      createdNewSeparator = result.initialMode === 'create';
    }

    await uploadSelectedFiles();

    if (createdNewSeparator) {
      loadSeparators();
      showStatus('Сепаратор и файлы сохранены');
    } else {
      showStatus('Файлы сохранены');
    }
  } catch (err) {
    showStatus(err.message, true);
  }
});

clearBtn.addEventListener('click', resetForm);
exitBtn.addEventListener('click', () => {
  if (!hasUnsavedChanges()) {
    resetForm();
    return;
  }

  if (confirm('Выйти без сохранения изменений?')) {
    resetForm();
  }
});
filesInput.addEventListener('change', updateSaveFilesButtonVisibility);

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


// -------- Init --------

async function loadSeparators() {
  const separators = await fetchSeparators();
  renderSeparators(separators);
}

hideForm();
updateDepletedState();
loadUsers();
loadStructures();
loadSeparators();
