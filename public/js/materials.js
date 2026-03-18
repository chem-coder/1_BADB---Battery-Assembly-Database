const newNameInput = document.getElementById('new-material-name');
const newRoleSelect = document.getElementById('new-material-role');
const createMaterialBtn = document.getElementById('createMaterialBtn');

const materialsList = document.getElementById('materialsList');

const roleMap = {
  cathode_active: 'катодный активный материал',
  anode_active: 'анодный активный материал',
  binder: 'связующее',
  conductive_additive: 'проводящая добавка',
  solvent: 'растворитель',
  other: 'другое'
};

const toggleInstancesBtn = document.getElementById('toggleInstancesBtn');
const toggleCompositionsBtn = document.getElementById('toggleCompositionsBtn');

let allMaterialsExpanded = false;
let compositionsExpanded = false;
let editingMaterialId = null;
let currentEdit = null; 

function exitEditMode(row) {
  const summary = row.querySelector('summary');
  summary.innerHTML = row.dataset.originalContent;
  currentEdit = null;
}

function captureOpenState() {
  return {
    materials: Array.from(
      materialsList.querySelectorAll('details[data-type="material"][open]')
    ).map(d => d.dataset.id),
    
    instances: Array.from(
      materialsList.querySelectorAll('details[data-type="instance"][open]')
    ).map(d => d.dataset.id)
  };
}

function restoreOpenState(state) {
  state.materials.forEach(id => {
    const d = materialsList.querySelector(
      `details[data-type="material"][data-id="${id}"]`
    );
    if (d) d.open = true;
  });
  
  state.instances.forEach(id => {
    const d = materialsList.querySelector(
      `details[data-type="instance"][data-id="${id}"]`
    );
    if (d) d.open = true;
  });
}



// -------- API --------

async function fetchMaterials() {
  const res = await fetch('/api/materials');
  if (!res.ok) throw new Error('Ошибка загрузки материалов');
  return res.json();
}

async function createMaterial(data) {
  const res = await fetch('/api/materials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка создания');
  }
  
  return res.json();
}

async function updateMaterial(id, data) {
  const res = await fetch(`/api/materials/${id}`, {
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

async function deleteMaterial(id) {
  const res = await fetch(`/api/materials/${id}`, {
    method: 'DELETE'
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.error || 'Ошибка удаления');
    return false;
  }
  return true;
}

async function fetchInstances(materialId) {
  const res = await fetch(`/api/materials/${materialId}/instances`);
  if (!res.ok) throw new Error('Ошибка загрузки экземпляров');
  return res.json();
}

async function createInstance(materialId, data) {
  const res = await fetch(`/api/materials/${materialId}/instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка создания экземпляра');
  }
  
  return res.json();
}

async function updateInstance(id, data) {
  const res = await fetch(`/api/materials/instances/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка обновления экземпляра');
  }
  
  return res.json();
}

async function deleteInstance(id) {
  const res = await fetch(`/api/materials/instances/${id}`, {
    method: 'DELETE'
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка удаления экземпляра');
  }
}

createMaterialBtn.addEventListener('click', async () => {
  const name = newNameInput.value.trim();
  const role = newRoleSelect.value;
  
  if (!name) {
    alert('Название обязательно');
    return;
  }
  
  if (!role) {
    alert('Роль обязательна');
    return;
  }
  
  try {
    if (editingMaterialId) {
      await updateMaterial(editingMaterialId, { name, role });
      editingMaterialId = null;
      createMaterialBtn.textContent = 'Добавить';
    } else {
      await createMaterial({ name, role });
    }
    
    newNameInput.value = '';
    newRoleSelect.value = '';
    loadMaterials();
  } catch (err) {
    alert(err.message);
  }
});

function renderMaterials(materials) {
  materialsList.innerHTML = '';
  
  materials
  .sort((a, b) => a.name.localeCompare(b.name))
  .forEach(material => {
    
    const details = document.createElement('details');
    details.classList.add('tree-row', 'level-material');
    details.dataset.type = 'material';
    details.dataset.id = material.material_id;
    details.dataset.role = material.role;
    
    // collapsed by default
    details.open = false;
    
    const summary = document.createElement('summary');
    
    const title = document.createElement('span');
    title.classList.add('row-title');
    title.textContent = material.name;
    title.style = "display:inline-block; width:10vw;";
    
    const role = document.createElement('span');
    role.classList.add('row-meta');
    role.textContent = `${roleMap[material.role] || material.role}`;
    role.style = "display:inline-block; width:25vw;";
    role.dataset.role = material.role;
    
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = '✏️';
    editBtn.dataset.action = 'edit';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = '🗑';
    deleteBtn.dataset.action = 'delete';
    
    summary.appendChild(title);
    summary.appendChild(role);
    summary.appendChild(editBtn);
    summary.appendChild(deleteBtn);
    
    details.appendChild(summary);
    
    const childrenContainer = document.createElement('div');
    childrenContainer.classList.add('children-container');
    details.appendChild(childrenContainer);
    
    details.addEventListener('toggle', async () => {
      if (!details.open) return;
      
      // prevent reloading if already loaded
      if (childrenContainer.dataset.loaded === 'true') return;
      
      try {
        const instances = await fetchInstances(material.material_id);
        
        instances
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(inst => {
          const instDetails = document.createElement('details');
          instDetails.classList.add('tree-row', 'level-instance');
          instDetails.dataset.type = 'instance';
          instDetails.dataset.id = inst.material_instance_id;
          instDetails.dataset.notes = inst.notes || '';
          
          instDetails.open = false;
          
          const instSummary = document.createElement('summary');
          
          const instTitle = document.createElement('span');
          instTitle.classList.add('row-title');
          instTitle.textContent = inst.name;
          instTitle.style = "display:inline-block; width:35.6vw;";
          
          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.textContent = '✏️';
          editBtn.dataset.action = 'edit';
          
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.textContent = '🗑';
          deleteBtn.dataset.action = 'delete';
          
          instSummary.appendChild(instTitle);
          instSummary.appendChild(editBtn);
          instSummary.appendChild(deleteBtn);
          
          instDetails.appendChild(instSummary);
          
          const instChildren = document.createElement('div');
          instChildren.classList.add('children-container');
          instDetails.appendChild(instChildren);
          
          instDetails.addEventListener('toggle', async () => {
            if (!instDetails.open) return;
            
            if (instChildren.dataset.loaded === 'true') return;
            
            try {
              const res = await fetch(`/api/materials/instances/${inst.material_instance_id}/components`);
              if (!res.ok) throw new Error('Ошибка загрузки состава');
              
              const components = await res.json();
              
              components.forEach(comp => {
                const compDetails = document.createElement('details');
                compDetails.classList.add('tree-row', 'level-component');
                compDetails.dataset.type = 'component';
                compDetails.dataset.id = comp.material_instance_component_id;
                compDetails.dataset.materialName = comp.material_name || '';
                compDetails.dataset.massFraction = comp.mass_fraction;
                compDetails.dataset.notes = comp.notes || '';
                
                compDetails.open = false;
                
                const compSummary = document.createElement('summary');
                
                const nameSpan = document.createElement('span');
                nameSpan.classList.add('row-title');
                nameSpan.textContent = comp.component_name;
                nameSpan.style = "display:inline-block; width:10vw;";
                
                const percentSpan = document.createElement('span');
                percentSpan.classList.add('row-meta');
                percentSpan.textContent = (comp.mass_fraction * 100).toFixed(2) + ' %';
                percentSpan.style.marginLeft = '1rem';
                percentSpan.style = "display:inline-block; width:10vw;";
                
                const editBtn = document.createElement('button');
                editBtn.type = 'button';
                editBtn.textContent = '✏️';
                editBtn.dataset.action = 'edit';
                
                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.textContent = '🗑';
                deleteBtn.dataset.action = 'delete';
                
                compSummary.appendChild(nameSpan);
                compSummary.appendChild(percentSpan);
                compSummary.appendChild(editBtn);
                compSummary.appendChild(deleteBtn);
                
                compDetails.appendChild(compSummary);
                
                instChildren.appendChild(compDetails);
              });
              
              /* + Состав button */
              const addComponentBtn = document.createElement('button');
              addComponentBtn.type = 'button';
              addComponentBtn.textContent = '+ Состав';
              addComponentBtn.style.marginLeft = '3rem';
              
              addComponentBtn.onclick = () => {
                
                if (instChildren.querySelector('.component-create-row')) return;
                
                const createRow = document.createElement('div');
                createRow.classList.add('component-create-row');
                createRow.style.marginLeft = '3rem';
                
                // Populate the material select options with material instances
                const materialSelect = document.createElement('select');
                materialSelect.style.marginRight = '0.5rem';
                
                // load all material instances for dropdown
                fetch('/api/materials/instances')
                .then(res => {
                  if (!res.ok) throw new Error('Ошибка загрузки экземпляров');
                  return res.json();
                })
                .then(allInstances => {
                  
                  const placeholderOption = document.createElement('option');
                  placeholderOption.value = '';
                  placeholderOption.textContent = '— экземпляр —';
                  materialSelect.appendChild(placeholderOption);
                  
                  allInstances.forEach(i => {
                    const opt = document.createElement('option');
                    opt.value = i.material_instance_id;
                    opt.textContent = i.name;
                    materialSelect.appendChild(opt);
                  });
                  
                })
                .catch(err => console.error(err));
                
                const percentInput = document.createElement('input');
                percentInput.type = 'number';
                percentInput.step = '0.01';
                percentInput.min = '0';
                percentInput.max = '100';
                percentInput.placeholder = '%';
                percentInput.style.width = '80px';
                
                const notesInput = document.createElement('textarea');
                notesInput.rows = 2;
                notesInput.placeholder = 'Комментарий (необязательно)';
                notesInput.style.display = 'block';
                notesInput.style.marginTop = '0.4rem';
                
                const saveBtn = document.createElement('button');
                saveBtn.type = 'button';
                saveBtn.textContent = 'Сохранить';
                
                const cancelBtn = document.createElement('button');
                cancelBtn.type = 'button';
                cancelBtn.textContent = 'Отмена';
                
                createRow.appendChild(materialSelect);
                createRow.appendChild(percentInput);
                createRow.appendChild(notesInput);
                
                createRow.appendChild(saveBtn);
                createRow.appendChild(cancelBtn);
                
                instChildren.appendChild(createRow);
                
                percentInput.focus();
                
                saveBtn.onclick = async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  const materialId = materialSelect.value;
                  const percent = Number(percentInput.value) / 100;
                  
                  if (!materialId) return;
                  if (!Number.isFinite(percent) || percent <= 0 || percent > 1) return;
                  
                  try {
                    const res = await fetch(
                      `/api/materials/instances/${inst.material_instance_id}/components`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          component_material_instance_id: Number(materialId),
                          mass_fraction: percent
                        })
                      }
                    );
                    
                    if (!res.ok) throw new Error('Ошибка создания компонента');
                    
                    const newComp = await res.json();
                    
                    const compDetails = document.createElement('details');
                    compDetails.classList.add('tree-row', 'level-component');
                    compDetails.dataset.type = 'component';
                    compDetails.dataset.id = newComp.material_instance_component_id;
                    compDetails.dataset.materialName = newComp.material_name;
                    compDetails.dataset.massFraction = newComp.mass_fraction;
                    compDetails.dataset.notes = newComp.notes || '';
                    
                    const compSummary = document.createElement('summary');
                    
                    const nameSpan = document.createElement('span');
                    nameSpan.classList.add('row-title');
                    nameSpan.textContent = newComp.component_name;
                    
                    const percentSpan = document.createElement('span');
                    percentSpan.classList.add('row-meta');
                    percentSpan.textContent = (newComp.mass_fraction * 100).toFixed(2) + ' %';
                    percentSpan.style.marginLeft = '1rem';
                    
                    const editBtn = document.createElement('button');
                    editBtn.type = 'button';
                    editBtn.textContent = '✏️';
                    editBtn.dataset.action = 'edit';
                    
                    const deleteBtn = document.createElement('button');
                    deleteBtn.type = 'button';
                    deleteBtn.textContent = '🗑';
                    deleteBtn.dataset.action = 'delete';
                    
                    compSummary.appendChild(nameSpan);
                    compSummary.appendChild(percentSpan);
                    compSummary.appendChild(editBtn);
                    compSummary.appendChild(deleteBtn);
                    compDetails.appendChild(compSummary);
                    
                    instChildren.insertBefore(compDetails, createRow);
                    createRow.remove();
                    
                  } catch (err) {
                    console.error(err);
                  }
                };
                
                cancelBtn.onclick = () => {
                  createRow.remove();
                };
                
                percentInput.addEventListener('keydown', (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveBtn.click();
                  }
                  if (e.key === 'Escape') {
                    cancelBtn.click();
                  }
                });
              };
              
              instChildren.appendChild(addComponentBtn);
              
              instChildren.dataset.loaded = 'true';
              
            } catch (err) {
              console.error(err);
            }
          });
          
          childrenContainer.appendChild(instDetails);
        });
        
        /* + Экземпляр button */
        const addInstanceBtn = document.createElement('button');
        addInstanceBtn.type = 'button';
        addInstanceBtn.textContent = '+ Экземпляр';
        addInstanceBtn.style.marginLeft = '1.5rem';
        
        addInstanceBtn.onclick = () => {
          
          if (childrenContainer.querySelector('.instance-create-row')) return;
          
          const createRow = document.createElement('div');
          createRow.classList.add('instance-create-row');
          createRow.style.marginLeft = '1.5rem';
          
          const input = document.createElement('input');
          input.type = 'text';
          input.placeholder = 'Название экземпляра';
          input.style.marginRight = '0.5rem';
          
          const notesInput = document.createElement('textarea');
          notesInput.rows = 2;
          notesInput.placeholder = 'Комментарий (необязательно)';
          notesInput.style.display = 'block';
          notesInput.style.marginTop = '0.4rem';
          
          const saveBtn = document.createElement('button');
          saveBtn.type = 'button';
          saveBtn.textContent = 'Сохранить';
          
          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.textContent = 'Отмена';
          
          createRow.appendChild(input);
          createRow.appendChild(notesInput);
          createRow.appendChild(saveBtn);
          createRow.appendChild(cancelBtn);
          
          childrenContainer.appendChild(createRow);
          
          input.focus();
          
          saveBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const name = input.value.trim();
            if (!name) return;
            
            try {
              await createInstance(material.material_id, {
                name,
                notes: notesInput.value.trim() || null
              });
              
              childrenContainer.dataset.loaded = '';
              childrenContainer.innerHTML = '';
              details.dispatchEvent(new Event('toggle'));
              
            } catch (err) {
              console.error(err);
            }
          };
          
          cancelBtn.onclick = () => {
            createRow.remove();
          };
          
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              saveBtn.click();
            }
            if (e.key === 'Escape') {
              cancelBtn.click();
            }
          });
          
        };
        
        childrenContainer.appendChild(addInstanceBtn);
        
        childrenContainer.dataset.loaded = 'true';
        
      } catch (err) {
        console.error(err);
      }
    });
    
    materialsList.appendChild(details);
  });
}


// -------- Inline Edit Controller (Tree Rows) --------

function enterEditMode(row, type, id) {
  
  // prevent multiple edit states
  if (currentEdit) {
    exitEditMode(currentEdit);
  }
  
  currentEdit = row;
  
  const summary = row.querySelector('summary');
  const originalContent = summary.innerHTML;
  
  row.dataset.originalContent = originalContent;
  
  const titleSpan = summary.querySelector('.row-title');
  const currentText = titleSpan ? titleSpan.textContent : '';
  const input = document.createElement('input');
  if (type === 'component') {
    input.type = 'number';
    input.step = '0.01';
    input.min = '0';
    input.max = '100';
    input.value = (Number(row.dataset.massFraction) * 100).toFixed(2);
  } else {
    input.type = 'text';
    input.value = currentText;
  }
  
  summary.innerHTML = '';
  let notesInput = null;
  
  if (type === 'instance' || type === 'component') {
    notesInput = document.createElement('textarea');
    notesInput.rows = 2;
    notesInput.placeholder = 'Комментарий (необязательно)';
    notesInput.value = row.dataset.notes || '';
    notesInput.style.display = 'block';
    notesInput.style.marginTop = '0.4rem';
  }
  
  // To prevent input from shrinking when buttons are added
  input.style.flex = '1';
  
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Сохранить';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Отмена';
  
  summary.appendChild(input);
  
  if (notesInput) {
    summary.appendChild(notesInput);
  }
  
  summary.appendChild(saveBtn);
  summary.appendChild(cancelBtn);
  
  input.focus();
  
  saveBtn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const newValue = input.value.trim();
    if (!newValue) return;
    
    try {
      
      if (type === 'material') {
        await updateMaterial(Number(id), {
          name: newValue,
          role: row.dataset.role
        });
        
        exitEditMode(row);
        row.querySelector('.row-title').textContent = newValue;
        
        return;
      }
      
      if (type === 'instance') {
        
        const notesEl = summary.querySelector('textarea');
        const notesValue = notesEl ? notesEl.value.trim() || '' : '';
        
        await updateInstance(Number(id), {
          name: newValue,
          notes: notesValue || null
        });
        
        exitEditMode(row);
        row.querySelector('.row-title').textContent = newValue;
        row.dataset.notes = notesValue;
        return;
      }
      
      if (type === 'component') {
        
        const percent = Number(newValue) / 100;
        if (!Number.isFinite(percent) || percent <= 0 || percent > 1) return;
        
        const notesEl = summary.querySelector('textarea');
        
        const res = await fetch(`/api/materials/instances/components/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mass_fraction: percent,
            notes: notesEl ? notesEl.value.trim() || null : null
          })
        });
        
        if (!res.ok) throw new Error('Ошибка обновления компонента');
        
        exitEditMode(row);
        
        const nameSpan = row.querySelector('.row-title');
        const percentSpan = row.querySelector('.row-meta');
        
        nameSpan.textContent = row.dataset.materialName;
        percentSpan.textContent = (percent * 100).toFixed(2) + ' %';
        row.dataset.massFraction = percent;
        
        return;
      }
      
    } catch (err) {
      console.error(err);
    }
    
  };
  
  cancelBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    exitEditMode(row);
  };
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      saveBtn.click();
    }
    if (e.key === 'Escape') {
      cancelBtn.click();
    }
  });
}

// -------- Event listeners --------
toggleInstancesBtn.addEventListener('click', () => {
  const materialDetails = materialsList.querySelectorAll(
    'details[data-type="material"]'
  );
  
  allMaterialsExpanded = !allMaterialsExpanded;
  
  materialDetails.forEach(d => {
    d.open = allMaterialsExpanded;
  });
  
  if (!allMaterialsExpanded) {
    // collapse compositions too
    compositionsExpanded = false;
    toggleCompositionsBtn.disabled = true;
    
    const instanceDetails = materialsList.querySelectorAll(
      'details[data-type="instance"]'
    );
    
    instanceDetails.forEach(d => {
      d.open = false;
    });
  } else {
    toggleCompositionsBtn.disabled = false;
  }
});

toggleCompositionsBtn.addEventListener('click', () => {
  
  if (toggleCompositionsBtn.disabled) return;
  
  const instanceDetails = materialsList.querySelectorAll(
    'details[data-type="instance"]'
  );
  
  compositionsExpanded = !compositionsExpanded;
  
  instanceDetails.forEach(d => {
    d.open = compositionsExpanded;
  });
  
});

materialsList.addEventListener('click', async (e) => {
  
  const action = e.target.dataset.action;
  if (!action) return;
  
  const row = e.target.closest('details');
  if (!row) return;
  
  const type = row.dataset.type;
  const id = row.dataset.id;
  
  if (action === 'edit') {
    enterEditMode(row, type, id);
  }
  
  if (action === 'delete') {
    
    if (!confirm('Удалить?')) return;
    
    try {
      if (type === 'material') {
        const success = await deleteMaterial(Number(id));
        if (!success) return;
        row.remove();
        return;
      }
      
      if (type === 'instance') {
        await deleteInstance(Number(id));
        row.remove();
        return;
      }
      
      if (type === 'component') {
        await fetch(`/api/materials/instances/components/${id}`, {
          method: 'DELETE'
        });
        row.remove();
        return;
      }
      
    } catch (err) {
      console.error(err);
    }
  }
  
});



// -------- Init --------

async function loadMaterials() {
  const state = captureOpenState();
  const materials = await fetchMaterials();
  renderMaterials(materials);
  restoreOpenState(state);
}

loadMaterials();