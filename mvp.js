let workspaceRevision = 0;
let workspaceSaveQueue = Promise.resolve();
let csrfToken = '';
let professionalProfile = null;

const profileTextFields = ['fullName','phone','crnNumber','crnState','crnStatus','courseName','institution','courseStart','courseEnd','specialization','additionalTraining','bio','clinicName','clinicAddress','city','state','instagram','website'];

function profileInitials(name='') {
  return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase() || 'N';
}

function renderProfessionalProfile(profile) {
  professionalProfile = profile;
  const form = $('#professionalProfileForm');
  if (!form) return;
  for (const key of profileTextFields) {
    const field = form.elements.namedItem(key);
    if (field) field.value = profile[key] || '';
  }
  form.elements.namedItem('email').value = profile.email || '';
  const modes = new Set(profile.serviceModes || []);
  form.querySelectorAll('[name="serviceModes"]').forEach(input => { input.checked = modes.has(input.value); });
}

function updateProfessionalIdentity(profile) {
  const name = profile.fullName || 'Nutricionista';
  const initials = profileInitials(name);
  $('#professionalName').textContent = name;
  $('#professionalEmail').textContent = profile.email || '';
  $('#professionalInitials').textContent = initials;
  $('#profileShortcut').textContent = initials;
  $('#welcomeGreeting').innerHTML = `Olá, ${escapeHtml(name.split(/\s+/)[0])} <span class="wave">✳</span>`;
}

$('#professionalProfileForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const profile = Object.fromEntries(profileTextFields.map(key => [key, values.get(key) || '']));
  profile.serviceModes = values.getAll('serviceModes');
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const result = await requestApi('/api/profile', { method: 'PUT', body: JSON.stringify({ profile }) });
    renderProfessionalProfile({ ...result.profile, email: professionalProfile.email });
    updateProfessionalIdentity(professionalProfile);
    toast('Perfil profissional salvo.');
  } catch (error) {
    toast(error.message);
  } finally {
    submit.disabled = false;
  }
});

async function requestApi(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (csrfToken && options.method && options.method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir esta ação.');
  return result;
}

function queueWorkspaceSave() {
  if (!csrfToken) return;
  const snapshot = JSON.parse(JSON.stringify({ patients, consultations, appointments, plans }));
  workspaceSaveQueue = workspaceSaveQueue.then(async () => {
    const result = await requestApi('/api/workspace', { method: 'PUT', body: JSON.stringify({ revision: workspaceRevision, data: snapshot }) });
    workspaceRevision = result.revision;
  }).catch(error => {
    toast(error.message);
    if (error.message.includes('outra janela')) setTimeout(() => location.reload(), 1800);
  });
}

function openAppointmentForm() {
  if (!patients.length) { toast('Cadastre um paciente antes de agendar uma consulta.'); setView('pacientes'); return; }
  const form = $('#appointmentForm');
  form.reset();
  setPersistentDropdownOptions('appointmentPatient', patients.map(patient => ({ value: patient.id, label: patient.name })), 'Selecione um paciente', 'Nenhum paciente cadastrado.', true);
  setPersistentDropdownOptions('appointmentKind', [{ value: 'Primeira consulta', label: 'Primeira consulta' }, { value: 'Consulta de retorno', label: 'Consulta de retorno' }, { value: 'Acompanhamento', label: 'Acompanhamento' }], 'Selecione o tipo', 'Nenhuma opção disponível.', true);
  setPersistentDropdownOptions('appointmentMode', [{ value: 'Presencial', label: 'Presencial' }, { value: 'Online', label: 'Online' }], 'Selecione o formato', 'Nenhuma opção disponível.', true);
  setPersistentDropdownOptions('appointmentStatus', [{ value: 'Confirmada', label: 'Confirmada' }, { value: 'Aguardando confirmação', label: 'Aguardando confirmação' }], 'Selecione o status', 'Nenhuma opção disponível.', true);
  $('#appointmentFormDate').value = $('#agendaDate')?.value || dateInputValue();
  $('#appointmentBackdrop').classList.remove('hidden');
  $('#appointmentPatientTrigger').focus();
}

function closeAppointmentForm() {
  closePersistentDropdowns();
  $('#appointmentBackdrop').classList.add('hidden');
  $('#appointmentForm').reset();
  setPersistentDropdown('appointmentPatient', '');
  setPersistentDropdown('appointmentKind', 'Primeira consulta');
  setPersistentDropdown('appointmentMode', 'Presencial');
  setPersistentDropdown('appointmentStatus', 'Confirmada');
}

function renderWelcomeDate() {
  const nowDate = new Date();
  $('#welcomeDate').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(nowDate).toLocaleUpperCase('pt-BR');
  $('#todayLabel').textContent = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(nowDate);
}

async function startWorkspace() {
  document.body.classList.add('workspace-loading');
  try {
    const [identity, workspace, profileResult] = await Promise.all([requestApi('/api/me'), requestApi('/api/workspace'), requestApi('/api/profile')]);
    if (identity.role !== 'professional') { location.href = '/portal.html'; return; }
    csrfToken = identity.csrf;
    workspaceRevision = workspace.revision;
    patients = workspace.data.patients || [];
    consultations = workspace.data.consultations || [];
    appointments = workspace.data.appointments || [];
    plans = workspace.data.plans || [];
    renderProfessionalProfile({ ...profileResult.profile, email: identity.profile.email });
    updateProfessionalIdentity(professionalProfile);
    $('#agendaDate').value = dateInputValue();
    $('#dashboardAgendaDate').textContent = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date());
    renderWelcomeDate(); renderPatients(); renderSchedule(); renderPlans();
    document.body.classList.remove('workspace-loading');
  } catch (error) {
    if (error.message.includes('login') || error.message.includes('autorizado')) location.href = '/login.html';
    else { document.body.classList.remove('workspace-loading'); toast(error.message); }
  }
}

document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#appointmentBackdrop').classList.contains('hidden')) closeAppointmentForm(); });
$('#appointmentClose').addEventListener('click', closeAppointmentForm);
$('#appointmentCancel').addEventListener('click', closeAppointmentForm);
$('#appointmentBackdrop').addEventListener('click', event => { if (event.target === $('#appointmentBackdrop')) closeAppointmentForm(); });
$('#appointmentForm').addEventListener('submit', event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  values.id = Date.now(); values.patientId = Number(values.patientId);
  if (!values.patientId || !patients.some(patient => patient.id === values.patientId)) { toast('Selecione um paciente válido.'); $('#appointmentPatientTrigger').focus(); return; }
  appointments.push(values);
  const patient = patients.find(item => item.id === values.patientId);
  if (patient) patient.next = `Consulta em ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${values.date}T12:00:00`))}`;
  closeAppointmentForm(); renderPatients(); renderSchedule(); persist(); toast('Consulta agendada.');
});
$('#agendaDate').addEventListener('change', renderSchedule);
$('#agendaToday').addEventListener('click', () => { $('#agendaDate').value = dateInputValue(); renderSchedule(); });
document.addEventListener('click', event => {
  const cancel = event.target.closest('.appointment-cancel');
  if (!cancel) return;
  const appointment = appointments.find(item => String(item.id) === cancel.dataset.appointmentId);
  if (appointment && confirm('Cancelar esta consulta?')) { appointment.status = 'Cancelada'; renderPatients(); renderSchedule(); persist(); toast('Consulta cancelada.'); }
});
$('#logoutButton').addEventListener('click', async () => {
  try { await requestApi('/api/logout', { method: 'POST', body: '{}' }); } finally { location.href = '/login.html'; }
});
$('#createInvite').addEventListener('click', async () => {
  const output = $('#inviteResult'); output.classList.add('hidden');
  try {
    const result = await requestApi('/api/patient-invite', { method: 'POST', body: JSON.stringify({ patientId: String(editingPatientId) }) });
    output.innerHTML = `<strong>Convite válido por ${result.expiresInHours} horas</strong><p>Código de acesso: <b>${escapeHtml(result.accessCode)}</b></p><label class="form-label">Link para enviar<input readonly value="${escapeHtml(result.inviteUrl)}" /></label><button type="button" class="button button-quiet" id="copyInvite">Copiar link</button>`;
    output.classList.remove('hidden');
  } catch (error) { toast(error.message); }
});
document.addEventListener('click', async event => {
  if (event.target.id !== 'copyInvite') return;
  const input = $('#inviteResult input');
  try { await navigator.clipboard.writeText(input.value); toast('Link copiado.'); }
  catch { input.select(); document.execCommand('copy'); toast('Link copiado.'); }
});

startWorkspace();
