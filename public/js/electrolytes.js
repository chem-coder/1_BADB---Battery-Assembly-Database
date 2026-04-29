const addInput = document.getElementById('electrolyte-name');
const nameInput = document.getElementById('electrolyte-name-input');
const form = document.forms['electrolyte-form'];
const title = form.querySelector('h2');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const saveFilesBtn = document.getElementById('saveFilesBtn');
const createdBySelect = document.getElementById('electrolyte-created-by');
const typeSelect = document.getElementById('electrolyte_type');
const filesInput = document.getElementById('electrolyte-files-input');
const savedFilesBox = document.getElementById('electrolyte-files-saved');

const electrolytesList = document.getElementById('electrolytesList');

let mode = null; // 'create' | 'edit'
let currentId = null;
let savedElectrolyteFiles = [];
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
    electrolyte_type: form.elements['electrolyte_type'].value,
    solvent_system: form.elements['solvent_system'].value,
    salts: form.elements['salts'].value,
    concentration: form.elements['concentration'].value,
    additives: form.elements['additives'].value,
    notes: form.elements['notes'].value,
    status: form.elements['status'].value,
    pending_files: Array.from(filesInput.files || []).map(file => file.name),
    saved_files: savedElectrolyteFiles.map(file => file.electrolyte_file_id)
  });
}

function markFormPristine() {
  initialFormState = captureFormState();
}

function hasUnsavedChanges() {
  if (!mode) return false;
  return captureFormState() !== initialFormState;
}

function clearSavedElectrolyteFiles() {
  savedElectrolyteFiles = [];
  renderSavedElectrolyteFiles(savedElectrolyteFiles);
}

function updateSaveFilesButtonVisibility() {
  saveFilesBtn.hidden = !filesInput.files || filesInput.files.length === 0;
}

function resetForm() {
  form.reset();
  title.textContent = '';
  mode = null;
  currentId = null;
  initialFormState = null;
  filesInput.value = '';
  clearSavedElectrolyteFiles();
  updateSaveFilesButtonVisibility();
  hideForm();
}

function formDataToObject(formEl) {
  const data = {};

  Array.from(new FormData(formEl).entries()).forEach(([key, value]) => {
    if (value instanceof File) return;
    data[key] = value;
  });

  return data;
}

function populateElectrolyteForm(el) {
  form.elements['electrolyte_type'].value = el.electrolyte_type || '';
  form.elements['solvent_system'].value = el.solvent_system || '';
  form.elements['salts'].value = el.salts || '';
  form.elements['concentration'].value = el.concentration || '';
  form.elements['additives'].value = el.additives || '';
  form.elements['notes'].value = el.notes || '';
  form.elements['status'].value = el.status || 'active';
}

function renderSavedElectrolyteFiles(entries) {
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
        await deleteElectrolyteFile(entry.electrolyte_file_id);
        savedElectrolyteFiles = savedElectrolyteFiles.filter(
          (file) => file.electrolyte_file_id !== entry.electrolyte_file_id
        );
        renderSavedElectrolyteFiles(savedElectrolyteFiles);
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

async function fetchElectrolytes() {
  const res = await fetch('/api/electrolytes');
  return res.json();
}

async function createElectrolyte(data) {
  const res = await fetch('/api/electrolytes', {
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

async function updateElectrolyte(id, data) {
  const res = await fetch(`/api/electrolytes/${id}`, {
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

async function fetchElectrolyteFiles(id) {
  const res = await fetch(`/api/electrolytes/${id}/files`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки файлов электролита');
  }

  return res.json();
}

async function uploadElectrolyteFiles(id, entries) {
  const res = await fetch(`/api/electrolytes/${id}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка сохранения файлов электролита');
  }

  return res.json();
}

async function deleteElectrolyteFile(fileId) {
  const res = await fetch(`/api/electrolytes/files/${fileId}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка удаления файла электролита');
  }
}

function renderElectrolytes(electrolytes) {
  electrolytesList.innerHTML = '';

  electrolytes.forEach(el => {
    const li = document.createElement('li');
    li.className = 'user-row';

    const info = document.createElement('div');
    info.className = 'user-info';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = el.name;

    const statusSpan = document.createElement('span');
    statusSpan.className = 'status';
    statusSpan.textContent =
      el.status === 'active' ? 'активный' :
      el.status === 'inactive' ? 'не используется' :
      'архив';

    const authorSpan = document.createElement('span');
    authorSpan.textContent = el.created_by_name;

    const dateSpan = document.createElement('span');
    dateSpan.textContent = new Date(el.created_at).toLocaleDateString();

    info.appendChild(nameSpan);
    info.appendChild(statusSpan);
    info.appendChild(authorSpan);
    info.appendChild(dateSpan);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️';
    editBtn.title = 'Редактировать';
    editBtn.onclick = async () => {
      mode = 'edit';
      currentId = el.electrolyte_id;

      showForm();

      title.textContent = el.name;
      nameInput.value = el.name;
      populateElectrolyteForm(el);

      if (el.created_by) {
        createdBySelect.value = el.created_by;
      }

      filesInput.value = '';
      clearSavedElectrolyteFiles();

      try {
        savedElectrolyteFiles = await fetchElectrolyteFiles(el.electrolyte_id);
        renderSavedElectrolyteFiles(savedElectrolyteFiles);
        markFormPristine();
      } catch (err) {
        showStatus(err.message, true);
      }
    };

    const duplicateBtn = document.createElement('button');
    duplicateBtn.textContent = '📄';
    duplicateBtn.title = 'Дублировать';
    duplicateBtn.onclick = () => {
      duplicateElectrolyte(el);
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'Удалить';
    deleteBtn.onclick = async () => {
      if (!confirm(`Удалить электролит "${el.name}"?`)) return;

      try {
        const res = await fetch(`/api/electrolytes/${el.electrolyte_id}`, {
          method: 'DELETE'
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Ошибка удаления');
        }

        loadElectrolytes();
      } catch (err) {
        showStatus(err.message, true);
      }
    };

    actions.appendChild(editBtn);
    actions.appendChild(duplicateBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(info);
    li.appendChild(actions);

    electrolytesList.appendChild(li);
  });
}

function duplicateElectrolyte(el) {
  mode = 'create';
  currentId = null;

  showForm();

  const copyName = `${el.name} (копия)`;
  title.textContent = copyName;
  nameInput.value = copyName;

  populateElectrolyteForm(el);
  createdBySelect.value = '';
  filesInput.value = '';
  clearSavedElectrolyteFiles();
  markFormPristine();
}

async function saveElectrolyteRecord() {
  if (!validateRequiredFields()) return null;

  const data = formDataToObject(form);
  delete data.created_by;
  data.name = title.textContent;

  const initialMode = mode;
  let savedElectrolyte = null;

  if (initialMode === 'create') {
    savedElectrolyte = await createElectrolyte(data);
    currentId = savedElectrolyte.electrolyte_id;
    mode = 'edit';
  } else if (initialMode === 'edit') {
    savedElectrolyte = await updateElectrolyte(currentId, data);
  }

  return {
    savedElectrolyte,
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

  savedElectrolyteFiles = await uploadElectrolyteFiles(currentId, entries);
  renderSavedElectrolyteFiles(savedElectrolyteFiles);
  filesInput.value = '';
  updateSaveFilesButtonVisibility();
  markFormPristine();

  return selectedFiles;
}

const statusBox = document.querySelector('.status-feedback');

function showStatus(msg, isError = false) {
  statusBox.textContent = msg;
  statusBox.style.color = isError ? '#b00020' : 'darkcyan';

  setTimeout(() => {
    statusBox.textContent = '';
  }, 1000);
}

async function loadUsers() {
  const res = await fetch('/api/users');
  const users = await res.json();

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

createdBySelect.addEventListener('focus', loadUsers);

addInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;

  e.preventDefault();

  if (!form.hidden) return;

  const name = addInput.value.trim();
  if (!name) return;

  mode = 'create';
  currentId = null;

  nameInput.value = name;
  title.textContent = name;

  showForm();

  addInput.value = '';
  clearSavedElectrolyteFiles();
  updateSaveFilesButtonVisibility();
  markFormPristine();
});

function validateRequiredFields() {
  const missing = [];

  typeSelect.classList.remove('required-missing');

  if (!typeSelect.value) {
    missing.push('Тип электролита');
    typeSelect.classList.add('required-missing');
  }

  if (missing.length) {
    showStatus(`Заполните обязательные поля: ${missing.join(', ')}`, true);
    return false;
  }

  return true;
}

saveBtn.addEventListener('click', async () => {
  if (!mode) return;

  try {
    const result = await saveElectrolyteRecord();
    if (!result) return;

    const selectedFiles = await uploadSelectedFiles();

    if (result.initialMode === 'create') {
      showStatus(
        selectedFiles.length > 0
          ? 'Электролит и файлы сохранены'
          : 'Электролит сохранён'
      );
    } else {
      showStatus(
        selectedFiles.length > 0
          ? 'Изменения и файлы сохранены'
          : 'Изменения сохранены'
      );
    }

    resetForm();
    loadElectrolytes();
  } catch (err) {
    showStatus(err.message, true);
  }
});

saveFilesBtn.addEventListener('click', async () => {
  if (!mode) return;

  try {
    if (mode === 'create') {
      const result = await saveElectrolyteRecord();
      if (!result) return;
      loadElectrolytes();
    }

    const selectedFiles = await uploadSelectedFiles();

    if (selectedFiles.length === 0) return;

    showStatus('Файлы сохранены');
    loadElectrolytes();
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

filesInput.addEventListener('change', updateSaveFilesButtonVisibility);

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

async function loadElectrolytes() {
  if (!electrolytesList) return;

  try {
    const data = await fetchElectrolytes();
    renderElectrolytes(data);
  } catch (err) {
    console.error(err);
  }
}

hideForm();
loadUsers();
loadElectrolytes();
