<script setup>
/**
 * UsersPage — "Пользователи" (администрирование)
 * Uses CrudTable + SaveIndicator (from Design System).
 * Simple CRUD with Dialog for create/edit.
 */
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import PageHeader from '@/components/PageHeader.vue'
import SaveIndicator from '@/components/SaveIndicator.vue'
import CrudTable from '@/components/CrudTable.vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'

const toast = useToast()
const crudTable = ref(null)

// ── Data ───────────────────────────────────────────────────────────────
const users = ref([])
const departments = ref([])
const loading = ref(false)
const UNDECIDED_LABEL = 'Не определено'
const roleOptions = [
  { label: 'Сотрудник', value: 'employee' },
  { label: 'Руководитель', value: 'lead' },
  { label: 'Администратор', value: 'admin' },
]
const activeOptions = [
  { label: 'активен', value: true },
  { label: 'неактивен', value: false },
]
const departmentOptions = computed(() => [
  { department_id: null, name: UNDECIDED_LABEL },
  ...departments.value,
])

async function loadUsers() {
  loading.value = true
  try {
    const { data } = await api.get('/api/users')
    users.value = data.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить пользователей', life: 3000 })
  } finally {
    loading.value = false
  }
}

async function loadDepartments() {
  try {
    const { data } = await api.get('/api/departments')
    departments.value = data
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить отделы', life: 3000 })
  }
}

onMounted(() => { loadUsers(); loadDepartments() })

// ── Column config ──────────────────────────────────────────────────────
const columns = [
  { field: 'name',            header: 'Имя',        minWidth: '150px' },
  { field: 'login',           header: 'Логин',      minWidth: '100px', width: '140px' },
  { field: 'position',        header: 'Должность',  minWidth: '120px', width: '200px' },
  { field: 'department_name', header: 'Отдел',       minWidth: '80px',  width: '120px' },
  { field: 'role',            header: 'Роль',        minWidth: '70px',  width: '100px' },
  { field: 'active',          header: 'Статус',      minWidth: '70px',  width: '100px' },
  { field: 'last_login',      header: 'Последний вход', minWidth: '90px', width: '140px' },
]

// ── Save indicator (delete flow) ──────────────────────────────────────
const pendingDelete = ref([])
const saveState = ref('idle')
let saveTimer = null

function onDelete(items) {
  pendingDelete.value = items
  saveState.value = 'idle'
}

async function confirmSave() {
  try {
    for (const item of pendingDelete.value) {
      await api.delete(`/api/users/${item.user_id}`)
    }
    pendingDelete.value = []
    saveState.value = 'saved'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveState.value = 'idle' }, 2000)
    crudTable.value?.clearSelection()
    await loadUsers()
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось удалить', life: 3000 })
  }
}

function discardChanges() {
  pendingDelete.value = []
  saveState.value = 'idle'
  crudTable.value?.clearSelection()
}

onUnmounted(() => clearTimeout(saveTimer))

// ── Form (Dialog) ─────────────────────────────────────────────────────
const formVisible = ref(false)
const mode = ref(null)
const currentId = ref(null)
const passwordResetVisible = ref(false)

const form = ref({
  name: '',
  login: '',
  password: '',
  confirmPassword: '',
  active: true,
  role: '',
  position: '',
  department_id: '',
})

function resetForm() {
  form.value = {
    name: '',
    login: '',
    password: '',
    confirmPassword: '',
    active: true,
    role: '',
    position: '',
    department_id: '',
  }
  mode.value = null
  currentId.value = null
  passwordResetVisible.value = false
  formVisible.value = false
}

function openCreate() {
  resetForm()
  mode.value = 'create'
  formVisible.value = true
}

function openEdit(user) {
  mode.value = 'edit'
  currentId.value = user.user_id
  form.value = {
    name: user.name || '',
    login: user.login || '',
    password: '',
    confirmPassword: '',
    active: user.active,
    role: user.role || '',
    position: user.position || '',
    department_id: user.department_id ?? null,
  }
  formVisible.value = true
}

function openPasswordReset() {
  passwordResetVisible.value = true
}

function cancelPasswordReset() {
  passwordResetVisible.value = false
  form.value.password = ''
  form.value.confirmPassword = ''
}

async function saveUser() {
  if (!mode.value) return
  const name = form.value.name?.trim()
  if (!name) {
    toast.add({ severity: 'warn', summary: 'Заполните имя', life: 3000 })
    return
  }

  if (!form.value.login?.trim()) {
    toast.add({ severity: 'warn', summary: 'Заполните логин', life: 3000 })
    return
  }
  if (mode.value === 'create' && !form.value.password) {
    toast.add({ severity: 'warn', summary: 'Заполните пароль', life: 3000 })
    return
  }
  if ((mode.value === 'create' || passwordResetVisible.value) && form.value.password.length < 6) {
    toast.add({ severity: 'warn', summary: 'Пароль должен быть не короче 6 символов', life: 3000 })
    return
  }
  if (mode.value === 'edit' && passwordResetVisible.value && form.value.password !== form.value.confirmPassword) {
    toast.add({ severity: 'warn', summary: 'Пароли не совпадают', life: 3000 })
    return
  }
  if (!form.value.role) {
    toast.add({ severity: 'warn', summary: 'Выберите роль', life: 3000 })
    return
  }
  if (!form.value.position?.trim()) {
    toast.add({ severity: 'warn', summary: 'Заполните должность', life: 3000 })
    return
  }
  if (form.value.department_id === '') {
    toast.add({ severity: 'warn', summary: 'Выберите отдел', life: 3000 })
    return
  }

  try {
    const payload = {
      name,
      login: form.value.login.trim(),
      active: form.value.active,
      role: form.value.role,
      position: form.value.position.trim(),
      department_id: form.value.department_id,
    }

    if (mode.value === 'create' || passwordResetVisible.value) {
      payload.password = form.value.password
    }

    if (mode.value === 'edit' && passwordResetVisible.value) {
      payload.reset_password = true
    }

    if (mode.value === 'create') {
      await api.post('/api/users', payload)
      toast.add({ severity: 'success', summary: 'Пользователь создан', life: 3000 })
    } else {
      await api.put(`/api/users/${currentId.value}`, payload)
      toast.add({ severity: 'success', summary: 'Изменения сохранены', life: 3000 })
    }
    resetForm()
    await loadUsers()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Ошибка сохранения', life: 3000 })
  }
}
</script>

<template>
  <div class="users-page">

    <PageHeader title="Пользователи" icon="pi pi-users">
      <template #actions>
        <SaveIndicator
          :visible="pendingDelete.length > 0 || saveState === 'saved'"
          :saved="saveState === 'saved'"
          @save="confirmSave"
          @cancel="discardChanges"
        />
      </template>
    </PageHeader>

    <CrudTable
      ref="crudTable"
      :columns="columns"
      :data="users"
      :loading="loading"
      id-field="user_id"
      table-name="Пользователи"
      show-add
      row-clickable
      @add="openCreate"
      @delete="onDelete"
      @row-click="(data) => openEdit(data)"
    >
      <template #col-name="{ data }">
        <strong>{{ data.name }}</strong>
      </template>
      <template #col-login="{ data }">
        <span class="login-text">{{ data.login || '—' }}</span>
      </template>
      <template #col-position="{ data }">
        <span class="position-text">{{ data.position || '—' }}</span>
      </template>
      <template #col-department_name="{ data }">
        {{ data.department_name || '—' }}
      </template>
      <template #col-role="{ data }">
        <span :class="['role-badge', data.role === 'admin' ? 'role-badge--admin' : data.role === 'lead' ? 'role-badge--lead' : 'role-badge--employee']">
          {{ data.role === 'admin' ? 'Админ' : data.role === 'lead' ? 'Лид' : 'Сотр.' }}
        </span>
      </template>
      <template #col-active="{ data }">
        <span :class="['status-pill', data.active ? 'status-pill--active' : 'status-pill--inactive']">
          {{ data.active ? 'активен' : 'неактивен' }}
        </span>
      </template>
      <template #col-last_login="{ data }">
        <span class="last-login">{{ data.last_login ? new Date(data.last_login).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—' }}</span>
      </template>
    </CrudTable>

    <!-- ── Create / Edit Dialog ── -->
    <Dialog
      v-model:visible="formVisible"
      :header="mode === 'create' ? 'Новый пользователь' : 'Редактирование пользователя'"
      :style="{ width: '420px' }"
      modal
      @hide="resetForm"
    >
      <form class="form-grid" @submit.prevent="saveUser">
        <label>Имя</label>
        <InputText v-model="form.name" placeholder="Имя пользователя" class="w-full" />

        <label>Логин</label>
        <InputText v-model="form.login" placeholder="Логин" class="w-full" />

        <label v-if="mode === 'edit' && !passwordResetVisible"></label>
        <Button
          v-if="mode === 'edit' && !passwordResetVisible"
          type="button"
          label="Сбросить пароль"
          severity="secondary"
          outlined
          @click="openPasswordReset"
        />

        <label v-if="mode === 'create' || passwordResetVisible">{{ mode === 'create' ? 'Пароль' : 'Новый пароль' }}</label>
        <InputText
          v-if="mode === 'create' || passwordResetVisible"
          v-model="form.password"
          type="password"
          :placeholder="mode === 'create' ? 'Временный пароль' : 'Минимум 6 символов'"
          autocomplete="new-password"
          class="w-full"
        />

        <label v-if="mode === 'edit' && passwordResetVisible">Подтвердите пароль</label>
        <InputText
          v-if="mode === 'edit' && passwordResetVisible"
          v-model="form.confirmPassword"
          type="password"
          placeholder="Повторите новый пароль"
          autocomplete="new-password"
          class="w-full"
        />

        <label v-if="mode === 'edit' && passwordResetVisible"></label>
        <Button
          v-if="mode === 'edit' && passwordResetVisible"
          type="button"
          label="Отмена сброса пароля"
          severity="secondary"
          text
          @click="cancelPasswordReset"
        />

        <label>Роль</label>
        <Select
          v-model="form.role"
          :options="roleOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Выберите роль"
          class="w-full"
        />

        <label>Должность</label>
        <div class="position-entry">
          <InputText v-model="form.position" placeholder="Должность" class="w-full" />
          <Button
            type="button"
            label="Не определено"
            severity="secondary"
            text
            @click="form.position = UNDECIDED_LABEL"
          />
        </div>

        <label>Отдел</label>
        <Select
          v-model="form.department_id"
          :options="departmentOptions"
          optionLabel="name"
          optionValue="department_id"
          placeholder="Выберите отдел"
          class="w-full"
        />

        <label>Статус</label>
        <Select
          v-model="form.active"
          :options="activeOptions"
          optionLabel="label"
          optionValue="value"
          class="w-full"
        />
      </form>

      <template #footer>
        <Button label="Отмена" severity="secondary" outlined @click="resetForm" />
        <Button :label="mode === 'create' ? 'Создать' : 'Сохранить'" @click="saveUser" />
      </template>
    </Dialog>

  </div>
</template>

<style scoped>
.users-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.users-page :deep(.page-header) {
  margin-bottom: 3px !important;
}

/* ── Form styles ── */
.form-grid {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 10px 16px;
  align-items: center;
}
.form-grid label {
  font-size: 13px;
  font-weight: 500;
  color: #003274;
}
.w-full { width: 100%; }
.position-entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
/* ── Page-specific cell styles ── */
.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}
.status-pill--active {
  background: rgba(82, 201, 166, 0.14);
  color: #1d7a5f;
  border: 0.5px solid rgba(82, 201, 166, 0.35);
}
.status-pill--inactive {
  background: rgba(176, 0, 32, 0.08);
  color: #b00020;
  border: 0.5px solid rgba(176, 0, 32, 0.15);
}
.position-text,
.login-text { color: #6B7280; font-size: 13px; }
.role-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}
.role-badge--admin { background: rgba(176, 0, 32, 0.1); color: #b00020; }
.role-badge--lead { background: rgba(211, 167, 84, 0.15); color: #9a7030; }
.role-badge--employee { background: rgba(0, 50, 116, 0.08); color: #003274; }
.last-login { color: #6B7280; font-size: 12px; }
</style>
