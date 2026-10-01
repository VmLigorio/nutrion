const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])).replace(/\n/g, '<br>');
let portalCsrf = '';

const profileGroups = [
  { title: 'Identificação e contato', fields: [['name', 'Nome completo'], ['email', 'E-mail'], ['phone', 'Telefone'], ['birthDate', 'Data de nascimento', 'date']] },
  { title: 'Objetivo e acompanhamento', fields: [['goal', 'Objetivo do atendimento'], ['status', 'Situação']] },
  { title: 'Contexto de saúde', fields: [['healthNotes', 'Condições de saúde, diagnósticos ou cirurgias'], ['medications', 'Medicamentos e suplementos'], ['allergies', 'Alergias, intolerâncias ou restrições']] },
  { title: 'Rotina e hábitos', fields: [['foodRoutine', 'Rotina alimentar'], ['foodPreferences', 'Preferências e alimentos evitados'], ['activity', 'Atividade física'], ['sleepRoutine', 'Sono e rotina diária']] },
];

const measurementGroups = [
  { title: 'Medidas principais', fields: [['weightKg', 'Peso', 'kg'], ['heightCm', 'Altura', 'cm'], ['waistCm', 'Cintura', 'cm']] },
  { title: 'Circunferências', fields: [['neckCm', 'Pescoço'], ['bustCm', 'Busto / tórax'], ['underBustCm', 'Abaixo do busto'], ['armholeCm', 'Cava'], ['armCm', 'Braço / bíceps'], ['forearmCm', 'Antebraço'], ['wristCm', 'Punho'], ['abdomenCm', 'Abdômen'], ['highHipCm', 'Quadril alto'], ['hipCm', 'Quadril'], ['thighCm', 'Coxa'], ['kneeCm', 'Joelho'], ['calfCm', 'Panturrilha'], ['ankleCm', 'Tornozelo']] },
  { title: 'Larguras e comprimentos', fields: [['shoulderWidthCm', 'Largura dos ombros'], ['shoulderLengthCm', 'Comprimento do ombro'], ['backWidthCm', 'Largura das costas'], ['frontWidthCm', 'Largura frontal do tórax'], ['armLengthCm', 'Comprimento do braço / manga'], ['frontTorsoLengthCm', 'Comprimento frente: ombro à cintura'], ['backTorsoLengthCm', 'Comprimento costas: nuca à cintura'], ['waistToHipCm', 'Cintura ao quadril'], ['insideLegLengthCm', 'Comprimento interno da perna'], ['outsideLegLengthCm', 'Comprimento externo da perna'], ['riseLengthCm', 'Gancho / altura do cavalo'], ['skirtLengthCm', 'Comprimento de saia / vestido']] },
];

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(date);
}

function formatValue(value, type) {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'date') return formatDate(value);
  if (typeof value === 'number') return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return String(value);
}

function infoItem(label, value, type) {
  const formatted = formatValue(value, type);
  return formatted ? `<div class="portal-info-item"><span>${esc(label)}</span><strong>${esc(formatted)}</strong></div>` : '';
}

function renderProfile(patient) {
  const content = profileGroups.map(group => {
    const items = group.fields.map(([key, label, type]) => {
      let value = patient[key];
      if (key === 'status') value = value === 'retorno' ? 'Retorno pendente' : value === 'ativo' ? 'Acompanhamento ativo' : value;
      return infoItem(label, value, type);
    }).join('');
    return items ? `<section class="portal-info-group"><h3>${esc(group.title)}</h3><div class="portal-info-grid">${items}</div></section>` : '';
  }).join('');

  const measureCards = measurementGroups.map(group => {
    const items = group.fields.map(([key, label, unit]) => {
      const value = patient[key];
      if (value === null || value === undefined || value === '') return '';
      return infoItem(label, `${formatValue(value)} ${unit || 'cm'}`);
    }).join('');
    return items ? `<section class="portal-info-group"><h3>${esc(group.title)}</h3><div class="portal-info-grid">${items}</div></section>` : '';
  }).join('');
  const measurementMeta = [infoItem('Data das medidas', patient.measurementDate, 'date'), infoItem('Observações das medidas', patient.measurementNotes)].join('');
  const measurements = measureCards || measurementMeta
    ? `<section class="portal-info-group"><div class="portal-info-group-heading"><h3>Medidas corporais e de costura</h3><small>Registros feitos pela nutricionista</small></div>${measureCards}${measurementMeta ? `<div class="portal-info-grid portal-measurement-meta">${measurementMeta}</div>` : ''}</section>`
    : '<section class="portal-info-group"><h3>Medidas corporais e de costura</h3><p class="portal-empty-note">Nenhuma medida foi registrada até o momento.</p></section>';

  document.querySelector('#portalProfile').innerHTML = `${content}${measurements}`;
}

function renderAppointments(appointments) {
  const sorted = [...appointments].sort((a, b) => `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`));
  document.querySelector('#portalAppointments').innerHTML = sorted.length ? sorted.map(item => `<article class="portal-record-card"><div class="portal-record-top"><strong>${esc(item.kind || 'Consulta')}</strong><span>${esc(formatDate(item.date))}${item.time ? ` · ${esc(item.time)}` : ''}</span></div><div class="portal-record-tags"><span>${esc(item.mode || 'Formato não informado')}</span><span>${esc(item.status || 'Agendada')}</span></div>${item.notes ? `<p>${esc(item.notes)}</p>` : ''}</article>`).join('') : '<p class="portal-empty-note">Você não tem consultas agendadas.</p>';
}

function renderConsultations(consultations) {
  const sorted = [...consultations].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  document.querySelector('#portalConsultations').innerHTML = sorted.length ? sorted.map(item => {
    const details = [
      ['Observações', item.notes], ['Ajustes combinados', item.adjustments], ['Próximos passos', item.nextSteps],
    ].filter(([, value]) => value).map(([label, value]) => `<p><strong>${label}:</strong> ${esc(value)}</p>`).join('');
    const metrics = [
      item.weightKg !== null && item.weightKg !== undefined ? infoItem('Peso', `${formatValue(item.weightKg)} kg`) : '',
      item.waistCm !== null && item.waistCm !== undefined ? infoItem('Cintura', `${formatValue(item.waistCm)} cm`) : '',
    ].filter(Boolean).join('');
    return `<article class="portal-record-card"><div class="portal-record-top"><strong>${esc(item.type || 'Consulta')}</strong><span>${esc(formatDate(item.date))}</span></div>${item.summary ? `<p>${esc(item.summary)}</p>` : ''}${details}${metrics ? `<div class="portal-info-grid portal-record-metrics">${metrics}</div>` : ''}</article>`;
  }).join('') : '<p class="portal-empty-note">Seu histórico de consultas aparecerá aqui.</p>';
}

function renderPlans(plans, professional) {
  const cards = plans.map(plan => `<article class="portal-plan-card"><header><div class="section-kicker">PLANO PUBLICADO · VERSÃO ${esc(plan.version)}</div><small>${esc(formatDate(plan.publishedAt))}</small></header><div class="patient-plan"><h2>${esc(plan.published.title)}</h2><p class="patient-plan-person">Preparado por ${esc(professional)}</p><div class="patient-plan-meals">${(plan.published.meals || []).map(meal => `<section class="patient-plan-meal"><div class="patient-plan-meal-title"><time>${esc(meal.time)}</time><h3>${esc(meal.name)}</h3></div><p>${esc(meal.foods)}</p>${meal.substitutions ? `<div class="patient-plan-substitutions"><strong>Substituições e observações</strong><p>${esc(meal.substitutions)}</p></div>` : ''}</section>`).join('')}</div>${plan.published.guidance ? `<section class="patient-plan-guidance"><h3>Orientações gerais</h3><p>${esc(plan.published.guidance)}</p></section>` : ''}</div><button class="button button-quiet portal-print" type="button">Imprimir ou salvar em PDF</button></article>`).join('');
  document.querySelector('#portalPlans').innerHTML = cards;
  document.querySelector('#portalEmpty').classList.toggle('hidden', plans.length > 0);
}

async function loadPortal() {
  try {
    const sessionResponse = await fetch('/api/me', { credentials: 'same-origin' });
    if (!sessionResponse.ok) { location.href = '/login.html?tipo=paciente'; return; }
    portalCsrf = (await sessionResponse.json()).csrf;
    const response = await fetch('/api/portal', { credentials: 'same-origin' });
    const data = await response.json();
    if (!response.ok) { location.href = '/login.html?tipo=paciente'; return; }
    document.querySelector('#portalPatientName').textContent = data.patient.name;
    document.querySelector('#portalProfessional').textContent = data.professional;
    renderProfile(data.patient);
    renderAppointments(data.appointments || []);
    renderConsultations(data.consultations || []);
    renderPlans(data.plans || [], data.professional);
  } catch { location.href = '/login.html?tipo=paciente'; }
}

document.querySelector('#portalLogout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': portalCsrf }, body: '{}' });
  location.href = '/login.html?tipo=paciente';
});
document.addEventListener('click', event => { if (event.target.closest('.portal-print')) window.print(); });
loadPortal();
