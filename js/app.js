/*const DEFAULT_API_BASE_URL = 'http://200.45.133.87:8000';*/
const DEFAULT_API_BASE_URL = 'http://api.prog1.com.ar';
const storageKey = 'clinicaApiBaseUrl';

const state = {
  apiBaseUrl: localStorage.getItem(storageKey) || DEFAULT_API_BASE_URL,
  activeTurnoId: null,
  turnoDialogMode: 'view',
  messageTimer: null,
  pacientes: [],
  medicos: [],
};

const resources = {
  pacientes: {
    path: '/pacientes',
    rowsId: 'pacientesRows',
    dataKey: 'pacientes',
    emptyLabel: 'No hay pacientes cargados en la API',
    editable: false,
    deletable: false,
    columns: [
      (item) => item.id,
      (item) => fullName(item),
      (item) => item.email,
      (item) => item.edad,
      (item) => item.obra_social,
    ],
  },
  medicos: {
    path: '/medicos',
    rowsId: 'medicosRows',
    dataKey: 'medicos',
    emptyLabel: 'No hay médicos cargados en la API',
    editable: false,
    deletable: false,
    columns: [
      (item) => item.id,
      (item) => fullName(item),
      (item) => item.email,
      (item) => item.especialidad,
      (item) => item.tiempo_trabajando,
    ],
  },
  turnos: {
    path: '/turnos',
    rowsId: 'turnosRows',
    dataKey: 'turnos',
    emptyLabel: 'No hay turnos cargados en la API',
    editable: true,
    deletable: true,
    columns: [
      (item) => item.id,
      (item) => formatDate(item.fecha),
      (item) => formatTime(item.hora),
      (item) => fullName(item.paciente) || item.pacienteId,
      (item) => fullName(item.medico) || item.medicoId,
      (item) => item.estado,
    ],
  },
  tratamientos: {
    path: '/tratamientos',
    rowsId: 'tratamientosRows',
    dataKey: 'tratamientos',
    emptyLabel: 'No hay tratamientos cargados en la API',
    editable: false,
    deletable: false,
    columns: [
      (item) => item.id,
      (item) => item.nombre,
      (item) => item.descripcion,
      (item) => fullName(item.paciente) || item.pacienteId,
      (item) => fullName(item.medico) || item.medicoId,
    ],
  },
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('apiBaseUrl').value = state.apiBaseUrl;
  bindTabs();
  bindToolbar();
  bindForms();
  bindRefreshButtons();
  bindTurnoDialog();
  refreshAll();
});

function bindTabs() {
  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => {
      const sectionId = button.dataset.section;
      document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));
      button.classList.add('active');
      document.getElementById(sectionId).classList.add('active');
    });
  });
}

function bindToolbar() {
  document.getElementById('saveApiUrl').addEventListener('click', async () => {
    const value = document.getElementById('apiBaseUrl').value.trim().replace(/\/+$/, '');
    if (!value) {
      showMessage('La URL de la API no puede quedar vacía.', 'error');
      return;
    }

    state.apiBaseUrl = value;
    localStorage.setItem(storageKey, value);
    showMessage('URL aplicada. Actualizando datos...', 'success');
    await refreshAll(true);
  });

  document.getElementById('refreshAll').addEventListener('click', () => refreshAll(true));
}

function bindForms() {
  document.querySelectorAll('form[data-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const resourceName = form.dataset.form;
      const payload = formToPayload(form);

      try {
        setStatus('loading', 'Enviando...');
        const response = await apiFetch(resources[resourceName].path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        form.reset();
        showMessage(`Registro creado correctamente. ID: ${response.data?.id ?? 'sin informar'}.`, 'success');
        await refreshResource(resourceName);
        await refreshRelatedData(resourceName);
        updateRelationSelects();
        setStatus('ok', 'API conectada');
      } catch (error) {
        setStatus('error', 'Error de API');
        showMessage(error.message, 'error');
      }
    });
  });
}

function bindRefreshButtons() {
  document.querySelectorAll('[data-refresh]').forEach((button) => {
    button.addEventListener('click', () => refreshResource(button.dataset.refresh));
  });
}

async function refreshAll(showSuccessMessage = false) {
  setStatus('loading', 'Conectando...');

  try {
    await Promise.all(Object.keys(resources).map(refreshResource));
    updateRelationSelects();
    setStatus('ok', 'API conectada');
    if (showSuccessMessage) {
      showMessage('Datos actualizados correctamente.', 'success', true);
    }
  } catch (error) {
    setStatus('error', 'Error de API');
    showMessage(error.message, 'error');
  }
}

async function refreshRelatedData(resourceName) {
  if (resourceName === 'pacientes' || resourceName === 'medicos') {
    await Promise.allSettled([
      refreshResource('turnos'),
      refreshResource('tratamientos'),
    ]);
  }
}

async function refreshResource(resourceName) {
  const resource = resources[resourceName];
  const response = await apiFetch(resource.path);
  const items = response.data?.[resource.dataKey] || [];
  if (resourceName === 'pacientes' || resourceName === 'medicos') {
    state[resourceName] = items;
  }
  renderRows(resource, items);
  if (resourceName === 'pacientes' || resourceName === 'medicos') {
    updateRelationSelects();
  }
}

async function apiFetch(path, options = {}) {
  const url = `${state.apiBaseUrl}${path}`;
  let response;

  try {
    response = await fetch(url, options);
  } catch (error) {
    if (window.location.protocol === 'https:' && url.startsWith('http://')) {
      throw new Error(`No se pudo conectar con ${url}. Este sitio está abierto por HTTPS y el navegador bloquea llamadas a APIs HTTP. Expón la API con HTTPS o crea un proxy HTTPS en el mismo dominio del frontend.`);
    }
    throw new Error(`No se pudo conectar con ${url}. Si la API responde desde curl o Postman, el navegador probablemente la está bloqueando por CORS. Habilita CORS en el backend o sirve el frontend desde el mismo origen que la API.`);
  }

  let body = null;
  try {
    body = await response.json();
  } catch (error) {
    body = null;
  }

  if (!response.ok || body?.success === false) {
    const message = body?.error?.message || body?.message || `La API respondió con estado ${response.status}.`;
    throw new Error(message);
  }

  return body || {};
}

function renderRows(resource, items) {
  const tbody = document.getElementById(resource.rowsId);
  tbody.innerHTML = '';

  if (!items.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'empty-row';
    cell.colSpan = resource.columns.length + 1;
    cell.textContent = resource.emptyLabel || 'Sin registros para mostrar';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement('tr');
    resource.columns.forEach((getter) => {
      const cell = document.createElement('td');
      const value = getter(item);
      cell.textContent = value === null || value === undefined || value === '' ? '-' : value;
      row.appendChild(cell);
    });

    row.appendChild(renderActionCell(resource, item));
    tbody.appendChild(row);
  });
}

function renderActionCell(resource, item) {
  const cell = document.createElement('td');
  const actions = document.createElement('div');
  actions.className = 'row-actions';

  if (resource.dataKey === 'turnos') {
    actions.appendChild(createActionButton('Ver', () => openTurnoDialog(item.id, 'view')));
    actions.appendChild(createActionButton('Editar', () => openTurnoDialog(item.id, 'edit')));
    actions.appendChild(createActionButton('Eliminar', () => deleteTurno(item.id), 'danger'));
  } else {
    actions.appendChild(createActionButton('Editar', null, '', true, 'El backend no expone PUT para este recurso'));
    actions.appendChild(createActionButton('Eliminar', null, 'danger', true, 'El backend no expone DELETE para este recurso'));
  }

  cell.appendChild(actions);
  return cell;
}

function updateRelationSelects() {
  updateSelectGroup({
    selector: '.paciente-select',
    items: state.pacientes,
    defaultLabel: 'Seleccionar paciente',
    emptyLabel: 'No hay pacientes cargados',
  });

  updateSelectGroup({
    selector: '.medico-select',
    items: state.medicos,
    defaultLabel: 'Seleccionar médico',
    optionalLabel: 'Sin médico asignado',
    emptyLabel: 'No hay médicos cargados',
  });
}

function updateSelectGroup({ selector, items, defaultLabel, optionalLabel, emptyLabel }) {
  document.querySelectorAll(selector).forEach((select) => {
    const previousValue = select.value;
    const isOptional = select.dataset.optional === 'true';
    const firstOption = document.createElement('option');
    firstOption.value = '';
    firstOption.textContent = isOptional ? optionalLabel : defaultLabel;

    select.innerHTML = '';
    select.appendChild(firstOption);

    if (!items.length) {
      firstOption.textContent = isOptional ? optionalLabel : emptyLabel;
      select.disabled = !isOptional;
      return;
    }

    select.disabled = false;
    items.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = formatEntityOption(item);
      select.appendChild(option);
    });

    if (previousValue && items.some((item) => String(item.id) === previousValue)) {
      select.value = previousValue;
    }
  });
}

function createActionButton(label, onClick, variant = '', disabled = false, title = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `small-button ${variant}`.trim();
  button.textContent = label;
  button.disabled = disabled;
  button.title = title;

  if (onClick) {
    button.addEventListener('click', onClick);
  }

  return button;
}

function bindTurnoDialog() {
  const dialog = document.getElementById('turnoDialog');
  const form = document.getElementById('turnoEditForm');
  const closeButtons = [
    document.getElementById('closeTurnoDialog'),
    document.getElementById('cancelTurnoDialog'),
  ];

  closeButtons.forEach((button) => {
    button.addEventListener('click', () => dialog.close());
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.turnoDialogMode !== 'edit' || !state.activeTurnoId) return;

    try {
      setStatus('loading', 'Guardando...');
      const payload = formToPayload(form);
      delete payload.id;

      await apiFetch(`/turnos/${state.activeTurnoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      dialog.close();
      showMessage(`Turno ${state.activeTurnoId} actualizado correctamente.`, 'success');
      await refreshResource('turnos');
      setStatus('ok', 'API conectada');
    } catch (error) {
      setStatus('error', 'Error de API');
      showMessage(error.message, 'error');
    }
  });
}

async function openTurnoDialog(id, mode) {
  try {
    setStatus('loading', 'Consultando...');
    const response = await apiFetch(`/turnos/${id}`);
    const turno = response.data?.turno;

    if (!turno) {
      throw new Error('La API no devolvió los datos del turno.');
    }

    state.activeTurnoId = id;
    state.turnoDialogMode = mode;
    fillTurnoDialog(turno, mode);
    document.getElementById('turnoDialog').showModal();
    setStatus('ok', 'API conectada');
  } catch (error) {
    setStatus('error', 'Error de API');
    showMessage(error.message, 'error');
  }
}

function fillTurnoDialog(turno, mode) {
  const isEdit = mode === 'edit';
  document.getElementById('turnoDialogTitle').textContent = isEdit ? `Editar turno #${turno.id}` : `Ver turno #${turno.id}`;
  document.getElementById('turnoId').value = turno.id;

  document.getElementById('turnoDetails').innerHTML = [
    ['Paciente', fullName(turno.paciente) || turno.pacienteId],
    ['Médico', fullName(turno.medico) || turno.medicoId],
    ['Fecha', formatDate(turno.fecha)],
    ['Hora', formatTime(turno.hora)],
    ['Motivo', turno.motivo],
    ['Estado', turno.estado],
  ].map(([label, value]) => `<div><strong>${label}</strong><span>${escapeHtml(value || '-')}</span></div>`).join('');

  document.getElementById('editPacienteId').value = turno.pacienteId || '';
  document.getElementById('editMedicoId').value = turno.medicoId || '';
  document.getElementById('editFecha').value = turno.fecha || '';
  document.getElementById('editHora').value = formatTime(turno.hora);
  document.getElementById('editMotivo').value = turno.motivo || '';
  document.getElementById('editEstado').value = turno.estado || '';

  document.getElementById('turnoDetails').hidden = isEdit;
  document.getElementById('turnoEditFields').hidden = !isEdit;
  document.getElementById('saveTurnoEdit').hidden = !isEdit;
}

async function deleteTurno(id) {
  const confirmed = window.confirm(`¿Eliminar el turno #${id}?`);
  if (!confirmed) return;

  try {
    setStatus('loading', 'Eliminando...');
    await apiFetch(`/turnos/${id}`, { method: 'DELETE' });
    showMessage(`Turno ${id} eliminado correctamente.`, 'success');
    await refreshResource('turnos');
    setStatus('ok', 'API conectada');
  } catch (error) {
    setStatus('error', 'Error de API');
    showMessage(error.message, 'error');
  }
}

function formToPayload(form) {
  const formData = new FormData(form);
  const payload = {};

  formData.forEach((value, key) => {
    const trimmed = typeof value === 'string' ? value.trim() : value;
    if (trimmed === '') return;

    if (key.endsWith('Id') || key === 'edad' || key === 'tiempo_trabajando') {
      payload[key] = Number(trimmed);
      return;
    }

    payload[key] = trimmed;
  });

  return payload;
}

function fullName(item) {
  if (!item) return '';
  return [item.nombre, item.apellido].filter(Boolean).join(' ');
}

function formatEntityOption(item) {
  const name = fullName(item) || `ID ${item.id}`;
  return `${name} (#${item.id})`;
}

function formatTime(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setStatus(type, text) {
  const status = document.getElementById('apiStatus');
  status.classList.remove('ok', 'error');

  if (type === 'ok') status.classList.add('ok');
  if (type === 'error') status.classList.add('error');

  status.querySelector('span:last-child').textContent = text;
}

function showMessage(text, type, autoHide = false) {
  const message = document.getElementById('message');
  clearTimeout(state.messageTimer);
  message.textContent = text;
  message.className = `message show ${type}`;

  if (autoHide) {
    state.messageTimer = setTimeout(() => {
      message.textContent = '';
      message.className = 'message';
    }, 3000);
  }
}
