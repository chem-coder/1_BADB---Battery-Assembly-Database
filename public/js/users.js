const usersList = document.getElementById('usersList');
const addUserInput = document.getElementById('addUserInput');

// -------- API helpers --------

async function fetchUsers() {
  const res = await fetch('/api/users');
  return res.json();
}

async function createUser(name) {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name })
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Ошибка сохранения');
  }
  
  return res.json();
}

async function updateUser(id, data) {
  const res = await fetch(`/api/users/${id}`, {
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

async function deleteUser(id) {
  const res = await fetch(`/api/users/${id}`, {
    method: 'DELETE'
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Ошибка удаления');
  }
}


// -------- Rendering --------
function renderUsers(users) {
  usersList.innerHTML = '';
  
  users
  .sort((a, b) => a.name.localeCompare(b.name))
  .forEach(user => {
    const li = document.createElement('li');
    li.className = 'user-row';
    
    const info = document.createElement('div');
    info.className = 'user-info';
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = user.name;
    
    const statusSpan = document.createElement('span');
    statusSpan.className = 'status' + (user.active ? '' : ' inactive');
    statusSpan.textContent = user.active ? 'активен' : 'неактивен';
    
    info.appendChild(nameSpan);
    info.appendChild(statusSpan);
    
    const actions = document.createElement('div');
    actions.className = 'actions';
    
    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️';
    editBtn.title = 'Редактировать';
    editBtn.onclick = () => enterEditMode(li, user);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑';
    deleteBtn.title = 'Удалить';
    deleteBtn.onclick = async () => {
      if (!confirm('Вы уверены?')) return;
      
      try {
        await deleteUser(user.user_id);
        showStatus('Пользователь удалён');
        loadUsers();
      } catch (err) {
        showStatus(err.message, true);
      }
    };
    
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    
    li.appendChild(info);
    li.appendChild(actions);
    
    usersList.appendChild(li);
  });
}

function enterEditMode(li, user) {
  li.innerHTML = '';
  li.className = 'user-row edit-row';
  
  const nameInput = document.createElement('input');
  nameInput.value = user.name;
  
  const statusSelect = document.createElement('select');
  statusSelect.innerHTML = `
    <option value="true">активен</option>
    <option value="false">неактивен</option>
  `;
  statusSelect.value = user.active.toString();
  
  li.appendChild(nameInput);
  li.appendChild(statusSelect);
  
  nameInput.focus();
  
  li.onkeydown = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      try {
        await updateUser(user.user_id, {
          name: nameInput.value.trim(),
          active: statusSelect.value === 'true'
        });
        loadUsers();
      } catch (err) {
        showStatus(err.message, true);
      }
      return;
    }
    
    if (e.key === 'Escape') {
      loadUsers();
    }
  };
}


// -------- Events --------

addUserInput.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  
  e.preventDefault();
  
  const name = addUserInput.value.trim();
  if (!name) return;
  
  try {
    await createUser(name);
    addUserInput.value = '';
    loadUsers();
  } catch (err) {
    showStatus(err.message, true);
  }
});


// -------- Init --------

async function loadUsers() {
  const users = await fetchUsers();
  renderUsers(users);
}

loadUsers();