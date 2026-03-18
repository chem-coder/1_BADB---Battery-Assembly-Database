const addInput = document.getElementById('separator-name');
const nameInput = document.getElementById('separator-name-input');
const form = document.forms['separator-form'];
const title = form.querySelector('h2');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const createdBySelect = document.getElementById('separator-created-by');

const separatorsList = document.getElementById('separatorsList');
const statusSelect = form.querySelector('select[name="status"]');
const depletedInput = form.querySelector('input[name="depleted_at"]');
const depletedWrapper = document.getElementById('depleted-wrapper');
const structureSelect = document.getElementById('separator-structure-id');

let mode = null; // 'create' | 'edit'
let currentId = null;

function showForm() {
  form.hidden = false;
  addInput.disabled = true;
}

function hideForm() {
  form.hidden = true;
  addInput.disabled = false;
}

function resetForm() {
  form.reset();
  title.textContent = '';
  mode = null;
  currentId = null;
  hideForm();
}

function formDataToObject(form) {
  return Object.fromEntries(new FormData(form));
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
    editBtn.onclick = () => {
      mode = 'edit';
      currentId = sep.sep_id;
      
      // show form
      showForm();
      
      // title + name
      title.textContent = sep.name;
      nameInput.value = sep.name;
      
      // fill fields we have
      form.elements['supplier'].value = sep.supplier || '';
      form.elements['brand'].value = sep.brand || '';
      form.elements['batch'].value = sep.batch || '';
      form.elements['comments'].value = sep.comments || '';
      form.elements['status'].value = sep.status || 'available';
      
      // structure + user (if present in list)
      if (sep.structure_id) {
        document.getElementById('separator-structure-id').value = sep.structure_id;
      }
      
      if (sep.created_by) {
        createdBySelect.value = sep.created_by;
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
  
  // fill fields
  form.elements['supplier'].value = sep.supplier || '';
  form.elements['brand'].value = sep.brand || '';
  form.elements['batch'].value = sep.batch || '';
  form.elements['comments'].value = sep.comments || '';
  form.elements['status'].value = sep.status || 'available';
  
  // structure
  if (sep.structure_id) {
    document.getElementById('separator-structure-id').value = sep.structure_id;
  }
  
  // IMPORTANT: reset things that must be new
  createdBySelect.value = '';
  form.elements['file_path'].value = '';
  depletedInput.value = '';
  
  updateDepletedState();
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
  createdBySelect.innerHTML = '<option value="">— выбрать пользователя —</option>';
  
  users
  .filter(u => u.active)
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
});

function validateRequiredFields() {
  let missing = [];
  
  // clear previous highlights
  createdBySelect.classList.remove('required-missing');
  structureSelect.classList.remove('required-missing');
  
  if (!createdBySelect.value) {
    missing.push('Кто добавил');
    createdBySelect.classList.add('required-missing');
  }
  
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
  
  if (!validateRequiredFields()) return;
  
  const data = formDataToObject(form);
  data.name = title.textContent;
  
  try {
    if (mode === 'create') {
      await createSeparator(data);
      showStatus('Сепаратор сохранён');
    }
    
    if (mode === 'edit') {
      await updateSeparator(currentId, data);
      showStatus('Изменения сохранены');
    }
    
    resetForm();
    loadSeparators();   // refresh list
  } catch (err) {
    showStatus(err.message, true);
  }
  
});

clearBtn.addEventListener('click', resetForm);

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