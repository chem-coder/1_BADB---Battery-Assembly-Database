const params = new URLSearchParams(window.location.search);
const materialInstanceId = Number(params.get('material_instance_id'));

const titleEl = document.getElementById('materialDetailsTitle');
const metaEl = document.getElementById('materialDetailsMeta');
const statusEl = document.getElementById('detailsStatus');
const localStatusEl = document.getElementById('detailsLocalStatus');
const formEl = document.getElementById('materialDetailsForm');
const backToMaterialsBtn = document.getElementById('backToMaterialsBtn');

const specificCapacityInput = document.getElementById('specificCapacityInput');
const densityInput = document.getElementById('densityInput');
const notesInput = document.getElementById('materialPropertyNotesInput');
const filesInput = document.getElementById('materialPropertyFilesInput');
const saveFilesBtn = document.getElementById('saveMaterialPropertyFilesBtn');
const savedFilesBox = document.getElementById('materialPropertyFilesSaved');

let savedPropertyFiles = [];

function setStatus(message, isError = false) {
  statusEl.textContent = message || '';
  statusEl.style.color = isError ? '#a33' : '#2f6f44';
  if (localStatusEl) {
    localStatusEl.textContent = message || '';
    localStatusEl.style.color = isError ? '#a33' : '#2f6f44';
  }
}

function formatRole(role) {
  const roleMap = {
    cathode_active: 'катодный активный материал',
    anode_active: 'анодный активный материал',
    binder: 'связующее',
    conductive_additive: 'проводящая добавка',
    solvent: 'растворитель',
    other: 'другое'
  };

  return roleMap[role] || role || '—';
}

function renderSavedPropertyFiles(entries) {
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
        await deletePropertyFile(entry.material_property_file_id);
        savedPropertyFiles = savedPropertyFiles.filter(
          (file) => file.material_property_file_id !== entry.material_property_file_id
        );
        renderSavedPropertyFiles(savedPropertyFiles);
        setStatus('Файл удалён');
      } catch (err) {
        setStatus(err.message, true);
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = typeof reader.result === 'string'
        ? reader.result.split(',')[1]
        : '';
      resolve(result);
    };

    reader.onerror = () => reject(new Error(`Не удалось прочитать файл: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function fetchPropertyFiles() {
  const res = await fetch(`/api/materials/instances/${materialInstanceId}/properties/files`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Ошибка загрузки файлов свойств материала');
  }

  return data;
}

async function uploadPropertyFiles(entries) {
  const res = await fetch(`/api/materials/instances/${materialInstanceId}/properties/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Ошибка сохранения файлов свойств материала');
  }

  return data;
}

async function deletePropertyFile(fileId) {
  const res = await fetch(`/api/materials/property-files/${fileId}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Ошибка удаления файла свойств материала');
  }
}

async function loadMaterialDetails() {
  if (!Number.isInteger(materialInstanceId)) {
    setStatus('Некорректный material_instance_id', true);
    formEl.hidden = true;
    return;
  }

  const res = await fetch(`/api/materials/instances/${materialInstanceId}/properties`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Ошибка загрузки свойств материала');
  }

  const { instance, properties } = data;

  titleEl.textContent = instance.instance_name;
  metaEl.textContent = `${instance.material_name} | ${formatRole(instance.material_role)}`;

  specificCapacityInput.value = properties?.specific_capacity_mah_g ?? properties?.specific_capacity_mAh_g ?? '';
  densityInput.value = properties?.density_g_ml ?? '';
  notesInput.value = properties?.notes ?? '';
  savedPropertyFiles = await fetchPropertyFiles();
  renderSavedPropertyFiles(savedPropertyFiles);
  updateSaveFilesButtonVisibility();
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('');

  try {
    const res = await fetch(`/api/materials/instances/${materialInstanceId}/properties`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        specific_capacity_mah_g: specificCapacityInput.value,
        density_g_ml: densityInput.value,
        notes: notesInput.value
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || 'Ошибка сохранения свойств материала');
    }

    setStatus('Свойства материала сохранены. Можно закрыть вкладку или вернуться к материалам.');
    await loadMaterialDetails();
    localStatusEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    setStatus(err.message, true);
    localStatusEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

saveFilesBtn.addEventListener('click', async () => {
  setStatus('');

  try {
    const selectedFiles = Array.from(filesInput.files || []);
    if (selectedFiles.length === 0) return;

    const entries = await Promise.all(selectedFiles.map(async (file) => ({
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      file_content_base64: await fileToBase64(file)
    })));

    savedPropertyFiles = await uploadPropertyFiles(entries);
    renderSavedPropertyFiles(savedPropertyFiles);
    filesInput.value = '';
    updateSaveFilesButtonVisibility();
    setStatus('Файлы сохранены');
  } catch (err) {
    setStatus(err.message, true);
  }
});

filesInput.addEventListener('change', updateSaveFilesButtonVisibility);

backToMaterialsBtn?.addEventListener('click', () => {
  window.location.href = '/reference/materials.html';
});

loadMaterialDetails().catch((err) => {
  setStatus(err.message, true);
  formEl.hidden = true;
});
