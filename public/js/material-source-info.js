const params = new URLSearchParams(window.location.search);
const materialInstanceId = Number(params.get('material_instance_id'));

const titleEl = document.getElementById('sourceInfoTitle');
const metaEl = document.getElementById('sourceInfoMeta');
const statusEl = document.getElementById('sourceInfoStatus');
const localStatusEl = document.getElementById('sourceInfoLocalStatus');
const formEl = document.getElementById('materialSourceInfoForm');
const backToMaterialsBtn = document.getElementById('backToMaterialsBtn');

const supplierInput = document.getElementById('supplierInput');
const brandInput = document.getElementById('brandInput');
const modelCatalogInput = document.getElementById('modelCatalogInput');
const lotNumberInput = document.getElementById('lotNumberInput');
const dateOrderedInput = document.getElementById('dateOrderedInput');
const dateReceivedInput = document.getElementById('dateReceivedInput');
const qualityLabelInput = document.getElementById('qualityLabelInput');
const qualityScoreInput = document.getElementById('qualityScoreInput');
const evaluationNotesInput = document.getElementById('evaluationNotesInput');
const isEvaluatedInput = document.getElementById('isEvaluatedInput');
const filesInput = document.getElementById('materialSourceFilesInput');
const saveFilesBtn = document.getElementById('saveMaterialSourceFilesBtn');
const savedFilesBox = document.getElementById('materialSourceFilesSaved');

let savedSourceFiles = [];

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

function renderSavedSourceFiles(entries) {
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
        await deleteSourceFile(entry.material_source_file_id);
        savedSourceFiles = savedSourceFiles.filter(
          (file) => file.material_source_file_id !== entry.material_source_file_id
        );
        renderSavedSourceFiles(savedSourceFiles);
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

async function fetchSourceFiles() {
  const res = await fetch(`/api/materials/instances/${materialInstanceId}/source-info/files`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Ошибка загрузки файлов источника материала');
  }

  return data;
}

async function uploadSourceFiles(entries) {
  const res = await fetch(`/api/materials/instances/${materialInstanceId}/source-info/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Ошибка сохранения файлов источника материала');
  }

  return data;
}

async function deleteSourceFile(fileId) {
  const res = await fetch(`/api/materials/source-files/${fileId}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Ошибка удаления файла источника материала');
  }
}

async function loadSourceInfo() {
  if (!Number.isInteger(materialInstanceId)) {
    setStatus('Некорректный material_instance_id', true);
    formEl.hidden = true;
    return;
  }

  const res = await fetch(`/api/materials/instances/${materialInstanceId}/source-info`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Ошибка загрузки информации об источнике материала');
  }

  const { instance, source } = data;

  titleEl.textContent = instance.instance_name;
  metaEl.textContent = `${instance.material_name} | ${formatRole(instance.material_role)}`;

  supplierInput.value = source?.supplier ?? '';
  brandInput.value = source?.brand ?? '';
  modelCatalogInput.value = source?.model_or_catalog_no ?? '';
  lotNumberInput.value = source?.lot_number ?? '';
  dateOrderedInput.value = source?.date_ordered ? String(source.date_ordered).slice(0, 10) : '';
  dateReceivedInput.value = source?.date_received ? String(source.date_received).slice(0, 10) : '';
  qualityLabelInput.value = source?.quality_rating_label ?? '';
  qualityScoreInput.value = source?.quality_rating_score ?? '';
  evaluationNotesInput.value = source?.evaluation_notes ?? '';
  isEvaluatedInput.checked = Boolean(source?.is_evaluated);
  savedSourceFiles = await fetchSourceFiles();
  renderSavedSourceFiles(savedSourceFiles);
  updateSaveFilesButtonVisibility();
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('');

  try {
    const res = await fetch(`/api/materials/instances/${materialInstanceId}/source-info`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier: supplierInput.value,
        brand: brandInput.value,
        model_or_catalog_no: modelCatalogInput.value,
        lot_number: lotNumberInput.value,
        date_ordered: dateOrderedInput.value,
        date_received: dateReceivedInput.value,
        quality_rating_label: qualityLabelInput.value,
        quality_rating_score: qualityScoreInput.value,
        evaluation_notes: evaluationNotesInput.value,
        is_evaluated: isEvaluatedInput.checked
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || 'Ошибка сохранения информации об источнике материала');
    }

    setStatus('Источник материала сохранён. Можно закрыть вкладку или вернуться к материалам.');
    await loadSourceInfo();
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

    savedSourceFiles = await uploadSourceFiles(entries);
    renderSavedSourceFiles(savedSourceFiles);
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

loadSourceInfo().catch((err) => {
  setStatus(err.message, true);
  formEl.hidden = true;
});
