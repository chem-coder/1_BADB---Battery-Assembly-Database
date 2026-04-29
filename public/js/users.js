const usersList = document.getElementById('usersList');
const showAddUserFormBtn = document.getElementById('showAddUserFormBtn');
const addUserFieldset = document.getElementById('addUserFieldset');
const addUserForm = document.getElementById('addUserForm');
const saveNewUserBtn = document.getElementById('saveNewUserBtn');
const exitNewUserBtn = document.getElementById('exitNewUserBtn');
const dirtyUserCreate = document.getElementById('dirty-user-create');
const userFormLegend = document.getElementById('userFormLegend');

const newUserName = document.getElementById('newUserName');
const newUserLogin = document.getElementById('newUserLogin');
const newUserPasswordField = document.getElementById('newUserPasswordField');
const newUserPassword = document.getElementById('newUserPassword');
const newUserPasswordLabel = document.getElementById('newUserPasswordLabel');
const confirmUserPasswordField = document.getElementById('confirmUserPasswordField');
const confirmUserPassword = document.getElementById('confirmUserPassword');
const resetUserPasswordField = document.getElementById('resetUserPasswordField');
const showResetUserPasswordBtn = document.getElementById('showResetUserPasswordBtn');
const cancelUserPasswordResetField = document.getElementById('cancelUserPasswordResetField');
const cancelResetUserPasswordBtn = document.getElementById('cancelResetUserPasswordBtn');
const newUserRole = document.getElementById('newUserRole');
const newUserPosition = document.getElementById('newUserPosition');
const newUserDepartment = document.getElementById('newUserDepartment');
const newUserActive = document.getElementById('newUserActive');

const UNDECIDED_LABEL = 'Не определено';
const UNDECIDED_DEPARTMENT_VALUE = '__undecided__';
const ROLE_LABELS = {
  employee: 'Сотрудник',
  lead: 'Руководитель',
  admin: 'Администратор'
};

let currentUsers = [];
let currentDepartments = [];
let formMode = 'create';
let currentEditUserId = null;
let createFormDirty = false;
let passwordResetVisible = false;
let savedUserFormSnapshot = '';

showAddUserFormBtn.hidden = true;

// -------- API helpers --------

async function readJsonResponse(res, fallbackError) {
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || fallbackError);
  }

  return data;
}

async function fetchUsers() {
  const res = await fetch('/api/users');
  return readJsonResponse(res, 'Ошибка загрузки пользователей');
}

async function fetchDepartments() {
  const res = await fetch('/api/departments');
  return readJsonResponse(res, 'Ошибка загрузки отделов');
}

async function createUser(payload) {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
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

function showStatus(msg, isError = false) {
  const existing = document.querySelector('.inline-status');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = 'inline-status';
  el.textContent = msg;
  el.style.margin = '0.75rem 0';
  el.style.color = isError ? '#b00020' : '#2e7d32';

  addUserFieldset.after(el);
  setTimeout(() => el.remove(), 2500);
}

function getCurrentAuthUser() {
  return window.BADB_AUTH?.getCurrentUser?.() || null;
}

function isCurrentUserAdmin() {
  return getCurrentAuthUser()?.role === 'admin';
}

function isCurrentAuthUser(user) {
  const currentUser = getCurrentAuthUser();
  return Boolean(currentUser?.userId && String(currentUser.userId) === String(user?.user_id));
}

function canManageUser(user) {
  return isCurrentUserAdmin() || isCurrentAuthUser(user);
}

function renderAddUserButtonAccess() {
  showAddUserFormBtn.hidden = !isCurrentUserAdmin();
}

// -------- User form --------

function setCreateFormDirty(isDirty) {
  createFormDirty = Boolean(isDirty);
  dirtyUserCreate.style.display = createFormDirty ? 'inline' : 'none';
}

function getUserFormSnapshot() {
  return JSON.stringify({
    mode: formMode,
    userId: currentEditUserId,
    name: newUserName.value,
    login: newUserLogin.value,
    role: newUserRole.value,
    position: newUserPosition.value,
    departmentId: newUserDepartment.value,
    active: newUserActive.value,
    passwordResetVisible,
    password: passwordResetVisible || formMode === 'create' ? newUserPassword.value : '',
    confirmPassword: passwordResetVisible ? confirmUserPassword.value : ''
  });
}

function markUserFormClean() {
  savedUserFormSnapshot = getUserFormSnapshot();
  setCreateFormDirty(false);
}

function refreshUserFormDirty() {
  setCreateFormDirty(getUserFormSnapshot() !== savedUserFormSnapshot);
}

function hasUnsavedCreateUserChanges() {
  return !addUserFieldset.hidden && createFormDirty;
}

function confirmDiscardCreateUserChanges() {
  if (!hasUnsavedCreateUserChanges()) return true;
  return confirm('Есть несохранённые изменения. Выйти без сохранения?');
}

function resetCreateUserForm() {
  addUserForm.reset();
  newUserActive.value = 'true';
  passwordResetVisible = false;
  configurePasswordFields();
  markUserFormClean();
}

function hideCreateUserForm() {
  resetCreateUserForm();
  addUserFieldset.hidden = true;
  showAddUserFormBtn.disabled = false;
  newUserRole.disabled = false;
  formMode = 'create';
  currentEditUserId = null;
}

function showCreateUserForm() {
  formMode = 'create';
  currentEditUserId = null;
  renderCreateUserSelects();
  userFormLegend.textContent = 'Новый пользователь';
  resetCreateUserForm();
  addUserFieldset.hidden = false;
  showAddUserFormBtn.disabled = true;
  markUserFormClean();
  newUserName.focus();
}

function showEditUserForm(user) {
  if (!confirmDiscardCreateUserChanges()) return;

  formMode = 'edit';
  currentEditUserId = user.user_id;
  renderCreateUserSelects();
  resetCreateUserForm();

  userFormLegend.textContent = 'Редактирование пользователя';
  configurePasswordFields();

  newUserName.value = user.name || '';
  newUserLogin.value = user.login || '';
  newUserRole.value = user.role || '';
  newUserPosition.value = user.position || UNDECIDED_LABEL;
  newUserDepartment.value = user.department_id == null
    ? UNDECIDED_DEPARTMENT_VALUE
    : String(user.department_id);
  newUserActive.value = String(Boolean(user.active));
  newUserRole.disabled = !isCurrentUserAdmin();

  addUserFieldset.hidden = false;
  showAddUserFormBtn.disabled = true;
  markUserFormClean();
  newUserName.focus();
}

function configurePasswordFields() {
  if (formMode === 'create') {
    newUserPasswordField.hidden = false;
    confirmUserPasswordField.hidden = true;
    resetUserPasswordField.hidden = true;
    cancelUserPasswordResetField.hidden = true;
    newUserPasswordLabel.textContent = 'Пароль';
    newUserPassword.placeholder = '';
    newUserPassword.required = true;
    confirmUserPassword.required = false;
    confirmUserPassword.value = '';
    return;
  }

  newUserPasswordLabel.textContent = 'Новый пароль';
  newUserPassword.placeholder = 'Минимум 6 символов';
  newUserPasswordField.hidden = !passwordResetVisible;
  confirmUserPasswordField.hidden = !passwordResetVisible;
  resetUserPasswordField.hidden = passwordResetVisible;
  cancelUserPasswordResetField.hidden = !passwordResetVisible;
  newUserPassword.required = passwordResetVisible;
  confirmUserPassword.required = passwordResetVisible;

  if (!passwordResetVisible) {
    newUserPassword.value = '';
    confirmUserPassword.value = '';
  }
}

function validatePasswordReset() {
  if (formMode !== 'edit' || !passwordResetVisible) return true;

  if (!newUserPassword.value || newUserPassword.value.length < 6) {
    showStatus('Новый пароль должен быть не короче 6 символов', true);
    newUserPassword.focus();
    return false;
  }

  if (newUserPassword.value !== confirmUserPassword.value) {
    showStatus('Пароли не совпадают', true);
    confirmUserPassword.focus();
    return false;
  }

  return true;
}

function renderCreateUserSelects() {
  const positions = Array.from(new Set(
    currentUsers
      .map(user => (user.position || '').trim())
      .filter(Boolean)
      .filter(position => position !== UNDECIDED_LABEL)
  )).sort((a, b) => a.localeCompare(b));

  newUserPosition.replaceChildren(
    new Option('Выберите должность', ''),
    new Option(UNDECIDED_LABEL, UNDECIDED_LABEL),
    ...positions.map(position => new Option(position, position))
  );

  newUserDepartment.replaceChildren(
    new Option('Выберите отдел', ''),
    new Option(UNDECIDED_LABEL, UNDECIDED_DEPARTMENT_VALUE),
    ...currentDepartments.map(department => new Option(department.name, String(department.department_id)))
  );
}

function buildUserPayload() {
  const departmentValue = newUserDepartment.value;
  const password = newUserPassword.value || '';
  const payload = {
    name: newUserName.value.trim(),
    login: newUserLogin.value.trim(),
    active: newUserActive.value === 'true',
    role: newUserRole.value,
    position: newUserPosition.value.trim(),
    department_id: departmentValue === UNDECIDED_DEPARTMENT_VALUE ? null : Number(departmentValue)
  };

  if (formMode === 'create' || passwordResetVisible) {
    payload.password = password;
  }

  if (formMode === 'edit' && passwordResetVisible) {
    payload.reset_password = true;
  }

  return payload;
}

// -------- Rendering --------

function formatRole(role) {
  return ROLE_LABELS[role] || role || UNDECIDED_LABEL;
}

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

      const meta = document.createElement('div');
      meta.className = 'user-meta';
      meta.textContent = [
        `логин: ${user.login || UNDECIDED_LABEL}`,
        `роль: ${formatRole(user.role)}`,
        `должность: ${user.position || UNDECIDED_LABEL}`,
        `отдел: ${user.department_name || UNDECIDED_LABEL}`
      ].join(' · ');

      info.appendChild(nameSpan);
      info.appendChild(statusSpan);
      info.appendChild(meta);

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
          await loadUsers();
        } catch (err) {
          showStatus(err.message, true);
        }
      };

      if (canManageUser(user)) {
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
      }

      li.appendChild(info);
      li.appendChild(actions);

      usersList.appendChild(li);
    });
}

function enterEditMode(_li, user) {
  showEditUserForm(user);
}

// -------- Events --------

showAddUserFormBtn.addEventListener('click', showCreateUserForm);

addUserForm.addEventListener('input', refreshUserFormDirty);
addUserForm.addEventListener('change', refreshUserFormDirty);

showResetUserPasswordBtn.addEventListener('click', () => {
  passwordResetVisible = true;
  configurePasswordFields();
  refreshUserFormDirty();
  newUserPassword.focus();
});

cancelResetUserPasswordBtn.addEventListener('click', () => {
  passwordResetVisible = false;
  configurePasswordFields();
  refreshUserFormDirty();
});

addUserForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!addUserForm.reportValidity()) return;
  if (!validatePasswordReset()) return;

  saveNewUserBtn.disabled = true;

  try {
    if (formMode === 'create') {
      await createUser(buildUserPayload());
      showStatus('Пользователь создан');
    } else {
      await updateUser(currentEditUserId, buildUserPayload());
      showStatus('Изменения сохранены');
    }

    hideCreateUserForm();
    await loadUsers();
  } catch (err) {
    showStatus(err.message, true);
  } finally {
    saveNewUserBtn.disabled = false;
  }
});

exitNewUserBtn.addEventListener('click', () => {
  if (!confirmDiscardCreateUserChanges()) return;
  hideCreateUserForm();
});

window.addEventListener('beforeunload', (e) => {
  if (!hasUnsavedCreateUserChanges()) return;
  e.preventDefault();
  e.returnValue = '';
});

const usersLogoutGuard = {
  hasUnsavedChanges: hasUnsavedCreateUserChanges,
  discardUnsavedChanges: hideCreateUserForm
};

window.BADB_PAGE_LOGOUT_GUARD = usersLogoutGuard;
window.BADB_AUTH?.registerLogoutGuard?.(usersLogoutGuard);

// -------- Init --------

async function loadUsers() {
  try {
    const [users, departments] = await Promise.all([
      fetchUsers(),
      fetchDepartments()
    ]);

    currentUsers = Array.isArray(users) ? users : [];
    currentDepartments = Array.isArray(departments) ? departments : [];
    renderAddUserButtonAccess();
    renderCreateUserSelects();
    renderUsers(currentUsers);
  } catch (err) {
    showStatus(err.message || 'Ошибка загрузки пользователей', true);
  }
}

window.addEventListener('badb:login', () => {
  loadUsers();
});

loadUsers();
