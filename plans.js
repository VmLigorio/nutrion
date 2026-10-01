let plans = [];
let editingPlanId = null;
let previewPlanId = null;
let previewUnsavedData = null;

function clonePlanData(data) { return JSON.parse(JSON.stringify(data)); }
function planPatientName(id) { return patients.find(patient => patient.id === id)?.name || 'Paciente não encontrado'; }
function planDate(iso) { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)); }
function planText(value) { return escapeHtml(value || '').replace(/\n/g, '<br>'); }

function renderPlans() {
  const sorted = [...plans].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  $('#planCards').innerHTML = sorted.map(plan => {
    const data = plan.draft || plan.published;
    const publishedCount = plan.versions.length;
    const state = publishedCount ? (plan.draft ? `Publicado v${publishedCount} · alterações em rascunho` : `Publicado v${publishedCount}`) : 'Rascunho';
    return `<article class="plan-card"><div class="plan-card-head"><span class="plan-glyph">▤</span><span class="plan-state">${state}</span></div><h3>${escapeHtml(data.title)}</h3><p>Plano de ${escapeHtml(planPatientName(plan.patientId))}</p><div class="plan-card-meta"><span>${data.meals.length} ${data.meals.length === 1 ? 'refeição' : 'refeições'} · ${planDate(plan.updatedAt)}</span><strong>${publishedCount ? `${publishedCount} ${publishedCount === 1 ? 'versão' : 'versões'}` : 'Não publicado'}</strong></div><div class="plan-card-actions"><button type="button" class="plan-action" data-plan-preview="${escapeHtml(plan.id)}">Prévia</button><button type="button" class="plan-action primary" data-plan-edit="${escapeHtml(plan.id)}">Editar plano →</button></div></article>`;
  }).join('');
  $('#emptyPlans').classList.toggle('hidden', plans.length > 0);
  $('#plansCount').textContent = String(plans.filter(plan => plan.versions.length > 0).length).padStart(2, '0');
  const drafts = plans.filter(plan => plan.draft).length;
  $('#plansDraftNote').textContent = drafts ? `${drafts} ${drafts === 1 ? 'rascunho aguardando revisão' : 'rascunhos aguardando revisão'}` : 'Nenhum rascunho';
}

function addPlanMeal(meal = {}) {
  const entry = document.createElement('div');
  entry.className = 'plan-meal-entry';
  entry.dataset.mealId = meal.id || `meal-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  entry.innerHTML = `<div class="plan-meal-heading"><strong class="plan-meal-number">Refeição</strong><button type="button" class="remove-meal" aria-label="Remover refeição">×</button></div><div class="form-row"><label class="form-label">Nome da refeição<input name="mealName" required maxlength="70" placeholder="Ex.: Café da manhã" /></label><label class="form-label">Horário<input name="mealTime" type="time" required /></label></div><label class="form-label">Alimentos e porções<textarea name="mealFoods" rows="3" required placeholder="Um alimento e sua porção por linha"></textarea></label><label class="form-label">Substituições e observações<textarea name="mealSubstitutions" rows="2" placeholder="Opções combinadas para esta refeição"></textarea></label>`;
  entry.querySelector('[name="mealName"]').value = meal.name || '';
  entry.querySelector('[name="mealTime"]').value = meal.time || '';
  entry.querySelector('[name="mealFoods"]').value = meal.foods || '';
  entry.querySelector('[name="mealSubstitutions"]').value = meal.substitutions || '';
  $('#planMeals').append(entry);
  [...$('#planMeals').children].forEach((item, index) => { item.querySelector('.plan-meal-number').textContent = `Refeição ${index + 1}`; });
}

function closePlanEditor() { closePersistentDropdowns(); $('#planBackdrop').classList.add('hidden'); $('#planForm').reset(); $('#planMeals').innerHTML = ''; $('#planPatientSearch').value = ''; setPersistentDropdown('planPatient', ''); persistentDropdowns.get('planPatient')?.filter(''); $('#planPatientTrigger').disabled = false; $('#planPatientSearch').disabled = false; editingPlanId = null; }
function openPlanEditor(planId = null) {
  const plan = plans.find(item => item.id === Number(planId));
  editingPlanId = plan?.id ?? null;
  $('#planForm').reset();
  $('#planMeals').innerHTML = '';
  setPersistentDropdownOptions('planPatient', patients.map(patient => ({ value: patient.id, label: patient.name })), 'Selecione um paciente', 'Nenhum paciente encontrado.');
  $('#planPatientSearch').value = '';
  persistentDropdowns.get('planPatient')?.filter('');
  $('#planPatientTrigger').disabled = Boolean(plan);
  $('#planPatientSearch').disabled = Boolean(plan);
  $('#planModalTitle').textContent = plan ? 'Editar plano alimentar' : 'Novo plano alimentar';
  $('#planModalSubtitle').textContent = plan?.published ? `Versão publicada v${plan.versions.length}; alterações ficam em rascunho até nova publicação.` : 'Organize as refeições e orientações do paciente.';
  const data = plan?.draft || plan?.published;
  if (data) {
    setPersistentDropdown('planPatient', String(plan.patientId));
    $('#planForm [name="title"]').value = data.title;
    $('#planForm [name="guidance"]').value = data.guidance || '';
    data.meals.forEach(addPlanMeal);
  } else addPlanMeal();
  $('#planBackdrop').classList.remove('hidden');
  $('#planForm [name="title"]').focus();
}

function collectPlanData() {
  if (!$('#planForm').reportValidity()) return null;
  const titleInput = $('#planForm [name="title"]');
  if (!titleInput.value.trim()) { toast('Informe um nome para o plano.'); titleInput.focus(); return null; }
  const current = plans.find(plan => plan.id === editingPlanId);
  const patientId = current?.patientId ?? Number($('#planPatient').value);
  if (!patientId || !patients.some(patient => patient.id === patientId)) { toast('Selecione um paciente válido.'); return null; }
  const meals = [...$('#planMeals').querySelectorAll('.plan-meal-entry')].map(entry => ({
    id: entry.dataset.mealId,
    name: entry.querySelector('[name="mealName"]').value.trim(),
    time: entry.querySelector('[name="mealTime"]').value,
    foods: entry.querySelector('[name="mealFoods"]').value.trim(),
    substitutions: entry.querySelector('[name="mealSubstitutions"]').value.trim()
  })).sort((a, b) => a.time.localeCompare(b.time));
  if (!meals.length) { toast('Adicione ao menos uma refeição.'); return null; }
  const incompleteMeal = [...$('#planMeals').querySelectorAll('.plan-meal-entry')].find(entry =>
    !entry.querySelector('[name="mealName"]').value.trim() || !entry.querySelector('[name="mealFoods"]').value.trim()
  );
  if (incompleteMeal) { toast('Preencha o nome, os alimentos e as porções de cada refeição.'); [...incompleteMeal.querySelectorAll('[name="mealName"], [name="mealFoods"]')].find(field => !field.value.trim()).focus(); return null; }
  return { patientId, title: titleInput.value.trim(), guidance: $('#planForm [name="guidance"]').value.trim(), meals };
}

function getOrCreatePlan(data) {
  let plan = plans.find(item => item.id === editingPlanId);
  if (!plan) {
    plan = { id: Date.now(), patientId: data.patientId, published: null, draft: null, versions: [], updatedAt: new Date().toISOString() };
    plans.unshift(plan);
    editingPlanId = plan.id;
  }
  return plan;
}

function savePlanDraft() {
  const data = collectPlanData();
  if (!data) return;
  const plan = getOrCreatePlan(data);
  plan.draft = clonePlanData(data);
  plan.updatedAt = new Date().toISOString();
  renderPlans();
  persist();
  closePlanEditor();
  toast('Rascunho salvo para este paciente.');
}

function publishPlan(event) {
  event.preventDefault();
  const data = collectPlanData();
  if (!data) return;
  const plan = getOrCreatePlan(data);
  const version = plan.versions.length + 1;
  const publishedAt = new Date().toISOString();
  plan.versions.push({ version, publishedAt, data: clonePlanData(data) });
  plan.published = clonePlanData(data);
  plan.draft = null;
  plan.updatedAt = publishedAt;
  renderPlans();
  persist();
  closePlanEditor();
  toast(`Versão ${version} publicada para ${planPatientName(plan.patientId)}.`);
}

function closePlanPreview() { closePersistentDropdowns(); $('#planPreviewBackdrop').classList.add('hidden'); previewPlanId = null; previewUnsavedData = null; }
function openPlanPreview(planId = null, unsavedData = null) {
  previewPlanId = planId === null ? null : Number(planId);
  previewUnsavedData = unsavedData;
  const plan = plans.find(item => item.id === previewPlanId);
  const options = unsavedData ? [{ value: 'unsaved', label: 'Prévia não salva' }] : [
    ...(plan?.draft ? [{ value: 'draft', label: 'Rascunho atual' }] : []),
    ...[...(plan?.versions || [])].reverse().map(item => ({ value: `v${item.version}`, label: `Versão ${item.version} · ${planDate(item.publishedAt)}` }))
  ];
  setPersistentDropdownOptions('planPreviewVersion', options, 'Selecione uma versão', 'Nenhuma versão disponível.');
  setPersistentDropdown('planPreviewVersion', options[0]?.value || '');
  $('#planPreviewVersionTrigger').disabled = Boolean(unsavedData);
  renderPlanPreview();
  $('#planPreviewBackdrop').classList.remove('hidden');
}

function selectedPlanPreview() {
  if (previewUnsavedData) return { data: previewUnsavedData, label: 'Prévia não salva', published: false };
  const plan = plans.find(item => item.id === previewPlanId);
  if (!plan) return null;
  const choice = $('#planPreviewVersion').value;
  if (choice === 'draft') return { data: plan.draft, label: 'Rascunho — ainda não publicado', published: false };
  const version = plan.versions.find(item => `v${item.version}` === choice);
  return version ? { data: version.data, label: `Versão ${version.version} · publicada em ${planDate(version.publishedAt)}`, published: true } : null;
}

function renderPlanPreview() {
  const selected = selectedPlanPreview();
  if (!selected) return;
  const { data, label, published } = selected;
  $('#planPreviewStatus').textContent = label;
  $('#planPrint').disabled = !published;
  $('#planPrint').title = published ? 'Abre a impressão para salvar como PDF' : 'Publique o plano para exportar o PDF';
  $('#planPreviewContent').innerHTML = `<div class="patient-plan"><div class="patient-plan-header"><span class="patient-plan-brand">NUTRION</span><span>${published ? 'PLANO PUBLICADO' : 'PRÉVIA DO RASCUNHO'}</span></div><h2>${escapeHtml(data.title)}</h2><p class="patient-plan-person">Para ${escapeHtml(planPatientName(data.patientId))}</p><div class="patient-plan-meals">${data.meals.map(meal => `<section class="patient-plan-meal"><div class="patient-plan-meal-title"><time>${escapeHtml(meal.time)}</time><h3>${escapeHtml(meal.name)}</h3></div><p>${planText(meal.foods)}</p>${meal.substitutions ? `<div class="patient-plan-substitutions"><strong>Substituições e observações</strong><p>${planText(meal.substitutions)}</p></div>` : ''}</section>`).join('')}</div>${data.guidance ? `<section class="patient-plan-guidance"><h3>Orientações gerais</h3><p>${planText(data.guidance)}</p></section>` : ''}</div>`;
}

function printSelectedPlan() {
  const selected = selectedPlanPreview();
  if (!selected?.published) return;
  $('#printPlan').innerHTML = `<div class="print-plan-header"><img src="outputs/nutrion-brasao-transparente.png" alt="" /><span>NUTRION</span></div>${$('#planPreviewContent').innerHTML}<p class="print-plan-footer">Plano publicado · ${escapeHtml(selected.label)}</p>`;
  window.print();
}

$$('[data-action="new-plan"]').forEach(button => button.addEventListener('click', () => openPlanEditor()));
$('#planClose').addEventListener('click', closePlanEditor);
$('#planCancel').addEventListener('click', closePlanEditor);
$('#planBackdrop').addEventListener('click', event => { if (event.target === $('#planBackdrop')) closePlanEditor(); });
$('#planPatientSearch').addEventListener('input', event => {
  const dropdown = persistentDropdowns.get('planPatient');
  dropdown?.filter(event.currentTarget.value);
  if (dropdown && !dropdown.isOpen()) dropdown.open();
});
$('#addMeal').addEventListener('click', () => addPlanMeal());
$('#planMeals').addEventListener('click', event => {
  const remove = event.target.closest('.remove-meal');
  if (!remove) return;
  const entries = [...$('#planMeals').children];
  if (entries.length === 1) { toast('O plano precisa de ao menos uma refeição.'); return; }
  remove.closest('.plan-meal-entry').remove();
  [...$('#planMeals').children].forEach((item, index) => { item.querySelector('.plan-meal-number').textContent = `Refeição ${index + 1}`; });
});
$('#savePlanDraft').addEventListener('click', savePlanDraft);
$('#planForm').addEventListener('submit', publishPlan);
$('#planEditorPreview').addEventListener('click', () => { const data = collectPlanData(); if (data) openPlanPreview(null, data); });
$('#planCards').addEventListener('click', event => {
  const edit = event.target.closest('[data-plan-edit]');
  const preview = event.target.closest('[data-plan-preview]');
  if (edit) openPlanEditor(edit.dataset.planEdit);
  if (preview) openPlanPreview(preview.dataset.planPreview);
});
$('#planPreviewClose').addEventListener('click', closePlanPreview);
$('#planPreviewBackdrop').addEventListener('click', event => { if (event.target === $('#planPreviewBackdrop')) closePlanPreview(); });
$('#planPreviewVersion').addEventListener('change', renderPlanPreview);
$('#planPrint').addEventListener('click', printSelectedPlan);
document.addEventListener('keydown', event => { if (event.key === 'Escape') { if (!$('#planPreviewBackdrop').classList.contains('hidden')) closePlanPreview(); else if (!$('#planBackdrop').classList.contains('hidden')) closePlanEditor(); } });
renderPlans();
