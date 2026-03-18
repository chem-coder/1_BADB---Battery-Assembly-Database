const addInput = document.getElementById('electrolyte-name');
const nameInput = document.getElementById('electrolyte-name-input');
const form = document.forms['electrolyte-form'];
const title = form.querySelector('h2');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const createdBySelect = document.getElementById('electrolyte-created-by');
const typeSelect = document.getElementById('electrolyte_type');

const electrolytesList = document.getElementById('electrolytesList');

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

async function createElectrolyte (data) {
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


// -------- Rendering --------
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
    editBtn.onclick = () => {
      mode = 'edit';
      currentId = el.electrolyte_id;
      
      // show form
      showForm();
      
      // title + name
      title.textContent = el.name;
      nameInput.value = el.name;
      
      // fill fields we have
      form.elements['electrolyte_type'].value = el.electrolyte_type;
      form.elements['solvent_system'].value = el.solvent_system || '';
      form.elements['salts'].value = el.salts || '';
      form.elements['concentration'].value = el.concentration || '';
      form.elements['additives'].value = el.additives || '';
      form.elements['notes'].value = el.notes || '';
      form.elements['status'].value = el.status || 'active';
      
      if (el.created_by) {
        createdBySelect.value = el.created_by;
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
  
  // title + name
  const copyName = el.name + ' (копия)';
  title.textContent = copyName;
  nameInput.value = copyName;
  
  // fill fields
  form.elements['electrolyte_type'].value = el.electrolyte_type;
  form.elements['solvent_system'].value = el.solvent_system || '';
  form.elements['salts'].value = el.salts || '';
  form.elements['concentration'].value = el.concentration || '';
  form.elements['additives'].value = el.additives || '';
  form.elements['notes'].value = el.notes || '';
  form.elements['status'].value = el.status || 'active';
  
  createdBySelect.value = '';
  
  // IMPORTANT: reset things that must be new
  createdBySelect.value = '';
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
  typeSelect.classList.remove('required-missing');
  createdBySelect.classList.remove('required-missing');
  
  if (!typeSelect.value) {
    missing.push('Тип электролита');
    typeSelect.classList.add('required-missing');
  }
  
  if (!createdBySelect.value) {
    missing.push('Кто добавил');
    createdBySelect.classList.add('required-missing');
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
  data.created_by = Number(data.created_by);
  data.name = title.textContent;
  
  try {
    if (mode === 'create') {
      await createElectrolyte(data);
      showStatus('Электролит сохранён');
    }
    
    if (mode === 'edit') {
      await updateElectrolyte(currentId, data);
      showStatus('Изменения сохранены');
    }
    
    resetForm();
    loadElectrolytes();   // refresh list
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

async function loadElectrolytes() {
  const list = document.getElementById('electrolytesList');
  if (!list) return;
  
  try {
    const res = await fetch('/api/electrolytes');
    const data = await res.json();
    
    renderElectrolytes(data);
  } catch (err) {
    console.error(err);
  }
}

hideForm();
loadUsers();
loadElectrolytes();