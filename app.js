let appointments = [];
let consultations = [];
let patients = [];
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
function dateInputValue(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function initials(name){return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()}
function avatar(person, extra=''){const tone=['green','peach','blue','lilac'].includes(person.tone)?person.tone:'green';return `<span class="patient-avatar ${tone} ${escapeHtml(extra)}">${escapeHtml(person.initials||initials(person.name))}</span>`}
function patientRow(person){return `<tr><td><div class="patient-cell">${avatar(person)}<span class="patient-name"><button class="patient-open" data-patient-id="${escapeHtml(person.id)}" type="button">${escapeHtml(person.name)}</button><small>${escapeHtml(person.email||'Novo paciente')}</small></span></div></td><td><span class="goal-tag">${escapeHtml(person.goal)}</span></td><td>${escapeHtml(person.last||'Cadastro recente')}</td><td><span class="next-step ${person.status==='retorno'?'pending':''}"><i></i>${escapeHtml(person.next||'Definir próximo passo')}</span></td><td><button class="history-button" data-history-id="${escapeHtml(person.id)}" type="button">Histórico <span>→</span></button></td></tr>`}
function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
const persistentDropdowns=new Map();
function createPersistentDropdown(root){
  const name=root.dataset.field,trigger=root.querySelector('.goal-dropdown-trigger'),menu=root.querySelector('.goal-dropdown-menu'),display=root.querySelector('.goal-dropdown-value'),hidden=root.querySelector(`input[name="${name}"]`)||root.querySelector(`#${name}`),optionContainer=menu.querySelector('.persistent-dropdown-options')||menu,emptyState=menu.querySelector('.goal-dropdown-empty');
  const options=()=>$$('.goal-dropdown-option',optionContainer);
  const isOpen=()=>!menu.classList.contains('hidden');
  const close=(restoreFocus=false)=>{if(!isOpen())return false;menu.classList.add('hidden');trigger.setAttribute('aria-expanded','false');if(restoreFocus)trigger.focus();return true};
  const open=()=>{for(const dropdown of persistentDropdowns.values())dropdown.close();menu.classList.remove('hidden');trigger.setAttribute('aria-expanded','true')};
  const set=value=>{const selected=options().find(option=>option.dataset.value===String(value));hidden.value=selected?.dataset.value||'';display.textContent=selected?.textContent||root.dataset.placeholder||'Selecione';options().forEach(option=>option.setAttribute('aria-selected',String(option===selected)))};
  const bindOption=(option,index)=>{
    option.addEventListener('click',()=>{set(option.dataset.value);close(true);hidden.dispatchEvent(new Event('change',{bubbles:true}))});
    option.addEventListener('keydown',event=>{const available=options().filter(item=>!item.hidden);if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return}if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const current=available.indexOf(option),next=event.key==='Home'?0:event.key==='End'?available.length-1:(current+(event.key==='ArrowDown'?1:available.length-1))%available.length;available[next]?.focus()});
  };
  const setOptions=(items,placeholder='Selecione',emptyMessage='Nenhuma opção encontrada',selectFirst=false)=>{
    root.dataset.placeholder=placeholder;
    optionContainer.replaceChildren(...items.map((item,index)=>{const option=document.createElement('button');option.type='button';option.className='goal-dropdown-option';option.setAttribute('role','option');option.dataset.value=String(item.value);option.textContent=item.label;option.setAttribute('aria-selected','false');bindOption(option,index);return option}));
    if(emptyState)emptyState.textContent=emptyMessage;
    if(emptyState)emptyState.hidden=items.length>0;
    set(selectFirst&&items.length?String(items[0].value):'');
  };
  const filter=query=>{const normalized=String(query||'').trim().toLocaleLowerCase('pt-BR');let visible=0;options().forEach(option=>{option.hidden=!option.textContent.toLocaleLowerCase('pt-BR').includes(normalized);if(!option.hidden)visible++});if(emptyState)emptyState.hidden=visible>0};
  trigger.addEventListener('click',()=>isOpen()?close():open());
  trigger.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp'].includes(event.key))return;event.preventDefault();open();const available=options().filter(option=>!option.hidden);(event.key==='ArrowDown'?available[0]:available.at(-1))?.focus()});
  options().forEach(bindOption);
  set(hidden.value);
  return {root,close,set,isOpen,open,setOptions,filter};
}
$$('.persistent-dropdown').forEach(root=>persistentDropdowns.set(root.dataset.field,createPersistentDropdown(root)));
function setPersistentDropdown(name,value){persistentDropdowns.get(name)?.set(value)}
function setPersistentDropdownOptions(name,items,placeholder,emptyMessage,selectFirst=false){persistentDropdowns.get(name)?.setOptions(items,placeholder,emptyMessage,selectFirst)}
function closePersistentDropdowns(restoreFocus=false){let closed=false;for(const dropdown of persistentDropdowns.values())closed=dropdown.close(restoreFocus)||closed;return closed}
document.addEventListener('pointerdown',event=>{for(const dropdown of persistentDropdowns.values())if(!dropdown.root.contains(event.target))dropdown.close()});
document.addEventListener('focusin',event=>{for(const dropdown of persistentDropdowns.values())if(!dropdown.root.contains(event.target))dropdown.close()});
function renderPatients(){
  const q=($('#patientsSearch')?.value||$('#dashboardSearch')?.value||'').toLocaleLowerCase('pt-BR');
  const filter=$('#statusFilter')?.value||'todos';
  const matching=patients.filter(p=>p.name.toLocaleLowerCase('pt-BR').includes(q)&&(filter==='todos'||(filter==='ativo'?p.status==='ativo':p.status==='retorno')));
  if($('#allPatients')) $('#allPatients').innerHTML=matching.map(patientRow).join('');
  if($('#recentPatients')) $('#recentPatients').innerHTML=patients.slice(0,4).map(patientRow).join('');
  if($('#patientCount')) $('#patientCount').textContent=String(patients.length);
  if($('#allPatientCount')) $('#allPatientCount').textContent=String(patients.length).padStart(2,'0');
  const activeCount=patients.filter(p=>p.status==='ativo').length;
  const returnCount=patients.filter(p=>p.status==='retorno').length;
  if($('#activePatients')) $('#activePatients').textContent=String(activeCount).padStart(2,'0');
  if($('#pendingReturns')) $('#pendingReturns').textContent=String(returnCount).padStart(2,'0');
  if($('#activePatientsBar')) $('#activePatientsBar').style.width=`${patients.length?Math.round(activeCount/patients.length*100):0}%`;
  if($('#pendingReturnsBar')) $('#pendingReturnsBar').style.width=`${patients.length?Math.round(returnCount/patients.length*100):0}%`;
  if($('#emptyPatients')) $('#emptyPatients').classList.toggle('hidden',matching.length>0);
  if($('#allPatients')) $('#allPatients').closest('.table-wrap').classList.toggle('hidden',matching.length===0);
  const follow=patients.filter(p=>p.status==='retorno').slice(0,3);
  if($('#followList')) $('#followList').innerHTML=follow.length?follow.map(p=>`<div class="follow-item">${avatar(p)}<span class="follow-copy"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.follow||'Acompanhamento sinalizado pela profissional')}</small></span><span class="follow-date">Retorno</span></div>`).join(''):'<div class="empty-state"><strong>Nenhum retorno pendente</strong><p>Você pode sinalizar um retorno no perfil do paciente.</p></div>';
}
function renderSchedule(){
  const today=dateInputValue();
  const selectedDate=$('#agendaDate')?.value||today;
  const renderRows=list=>list.slice().sort((a,b)=>a.time.localeCompare(b.time)).map(a=>{
    const patient=patients.find(p=>String(p.id)===String(a.patientId));
    const cancel=a.status==='Cancelada'?'':`<button class="row-more appointment-cancel" data-appointment-id="${escapeHtml(a.id)}" type="button" aria-label="Cancelar consulta">×</button>`;
    return `<div class="schedule-row"><span class="schedule-time">${escapeHtml(a.time)}</span><span class="time-line"></span>${avatar(patient||{name:'Paciente',tone:'green'})}<span class="schedule-info"><strong>${escapeHtml(patient?.name||'Paciente')}</strong><small>${escapeHtml(a.kind||a.type||'Consulta')} · ${escapeHtml(a.mode||'Presencial')}</small></span><span class="schedule-status ${a.status==='Cancelada'?'confirmed':''}">${escapeHtml(a.status||'Confirmada')}</span>${cancel}</div>`;
  }).join('');
  const todays=appointments.filter(a=>a.date===today&&a.status!=='Cancelada');
  const selected=appointments.filter(a=>a.date===selectedDate);
  const todayRows=renderRows(todays), selectedRows=renderRows(selected);
  if($('#scheduleList')) $('#scheduleList').innerHTML=todayRows||'<div class="empty-state"><strong>Agenda livre hoje</strong><p>Adicione uma consulta para organizar o atendimento.</p></div>';
  if($('#agendaFullList')) $('#agendaFullList').innerHTML=selectedRows||'<div class="empty-state"><strong>Nenhuma consulta agendada</strong><p>Escolha outra data ou agende um atendimento.</p></div>';
  if($('#agendaDateLabel')) $('#agendaDateLabel').textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date(`${selectedDate}T12:00:00`));
  if($('#consultationsToday')) $('#consultationsToday').textContent=String(todays.length).padStart(2,'0');
  if($('#nextAppointment')) $('#nextAppointment').textContent=todays[0]?`Próxima às ${todays[0].time}`:'Nenhuma consulta hoje';
}
const measurementFields=[
  {group:'Circunferências',items:[['neckCm','Pescoço'],['bustCm','Busto / tórax'],['underBustCm','Abaixo do busto'],['armholeCm','Cava'],['armCm','Braço / bíceps'],['forearmCm','Antebraço'],['wristCm','Punho'],['abdomenCm','Abdômen'],['highHipCm','Quadril alto'],['hipCm','Quadril'],['thighCm','Coxa'],['kneeCm','Joelho'],['calfCm','Panturrilha'],['ankleCm','Tornozelo']]},
  {group:'Larguras e comprimentos de costura',items:[['shoulderWidthCm','Largura dos ombros'],['shoulderLengthCm','Comprimento do ombro'],['backWidthCm','Largura das costas'],['frontWidthCm','Largura frontal do tórax'],['armLengthCm','Comprimento do braço / manga'],['frontTorsoLengthCm','Comprimento frente: ombro à cintura'],['backTorsoLengthCm','Comprimento costas: nuca à cintura'],['waistToHipCm','Cintura ao quadril'],['insideLegLengthCm','Comprimento interno da perna'],['outsideLegLengthCm','Comprimento externo da perna'],['riseLengthCm','Gancho / altura do cavalo'],['skirtLengthCm','Comprimento de saia / vestido']]}
];
function addMeasurementInputs(){const section=$$('.form-section')[3];if(!section)return;const heading=section.querySelector('.form-section-title');heading.querySelector('strong').textContent='Medidas corporais e de costura';heading.querySelector('small').textContent='Circunferências, larguras e comprimentos opcionais; registre com a data da aferição.';const anchor=section.querySelector('.metric-row');const wrap=document.createElement('div');wrap.className='measurement-groups';wrap.innerHTML=measurementFields.map(group=>`<div class="measurement-group"><strong class="measurement-group-title">${group.group}<small>cm</small></strong><div class="measurement-group-grid">${group.items.map(([name,label])=>`<label class="form-label">${label} (cm)<input name="${name}" type="number" min="0" max="500" step="0.1" placeholder="Opcional" /></label>`).join('')}</div></div>`).join('');anchor.insertAdjacentElement('afterend',wrap)}
let currentHistoryPatientId=null;
function monthLabel(value){if(!value)return '';const [year,month]=value.split('-').map(Number);return new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(year,month-1,1))}
function previousMonth(value){const [year,month]=value.split('-').map(Number);return `${new Date(year,month-2,1).getFullYear()}-${String(new Date(year,month-2,1).getMonth()+1).padStart(2,'0')}`}
function monthlyRecords(patientId,month){return consultations.filter(item=>item.patientId===patientId&&item.date.startsWith(month)).sort((a,b)=>b.date.localeCompare(a.date))}
function latestMeasurement(records,key){return records.find(record=>record[key]!==null&&record[key]!==undefined&&record[key]!=='')?.[key]??null}
function metricCompareCard(label,key,unit,current,previous){const a=latestMeasurement(current,key),b=latestMeasurement(previous,key);let detail='Sem registros suficientes para comparar';if(a!==null&&b!==null){const delta=Number(a)-Number(b);detail=`Mês anterior: ${Number(b).toFixed(1)} ${unit} · variação: ${delta>0?'+':''}${delta.toFixed(1)} ${unit}`}else if(a!==null)detail=`Mês anterior sem medida registrada · atual: ${Number(a).toFixed(1)} ${unit}`;else if(b!==null)detail=`Sem medida atual · mês anterior: ${Number(b).toFixed(1)} ${unit}`;return `<article class="comparison-card"><span>${label}</span><strong>${a!==null?`${Number(a).toFixed(1)} ${unit}`:'—'}</strong><small>${detail}</small></article>`}
function renderHistory(){const patient=patients.find(p=>p.id===currentHistoryPatientId);if(!patient)return;const selected=$('#historyMonth').value;const current=monthlyRecords(patient.id,selected);const prevMonth=previousMonth(selected);const previous=monthlyRecords(patient.id,prevMonth);$('#historyPatientName').textContent=patient.name;$('#comparisonTitle').textContent=`${monthLabel(selected)} × ${monthLabel(prevMonth)}`;$('#monthConsultationCount').textContent=String(current.length);$('#comparisonCards').innerHTML=`<article class="comparison-card"><span>Consultas no mês</span><strong>${current.length} <small>vs. ${previous.length}</small></strong><small>${monthLabel(selected)} × ${monthLabel(prevMonth)}</small></article>${metricCompareCard('Último peso registrado','weightKg','kg',current,previous)}${metricCompareCard('Última cintura registrada','waistCm','cm',current,previous)}`;const list=$('#consultationList');list.innerHTML=current.map(item=>`<article class="consultation-entry"><div class="consultation-entry-date"><strong>${new Intl.DateTimeFormat('pt-BR',{day:'2-digit'}).format(new Date(`${item.date}T12:00:00`))}</strong><small>${new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(new Date(`${item.date}T12:00:00`))}</small></div><div class="consultation-entry-body"><div class="consultation-entry-top"><span class="consultation-type">${escapeHtml(item.type)}</span><time>${new Intl.DateTimeFormat('pt-BR',{weekday:'short'}).format(new Date(`${item.date}T12:00:00`))}</time></div><h4>${escapeHtml(item.summary)}</h4>${item.notes?`<p><strong>Observações:</strong> ${escapeHtml(item.notes)}</p>`:''}${item.adjustments?`<p><strong>Ajustes:</strong> ${escapeHtml(item.adjustments)}</p>`:''}${item.nextSteps?`<p><strong>Próximos passos:</strong> ${escapeHtml(item.nextSteps)}</p>`:''}<div class="consultation-measure-chips">${item.weightKg!=null?`<span>Peso <strong>${Number(item.weightKg).toFixed(1)} kg</strong></span>`:''}${item.waistCm!=null?`<span>Cintura <strong>${Number(item.waistCm).toFixed(1)} cm</strong></span>`:''}</div></div></article>`).join('');list.classList.toggle('hidden',current.length===0);$('#emptyConsultations').classList.toggle('hidden',current.length>0);$('#comparisonSection').classList.toggle('hidden',$('#compareMonths').checked===false)}
function openHistory(patientId){currentHistoryPatientId=Number(patientId);const month=new Date();$('#historyMonth').value=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`;$('#consultationFormWrap').classList.add('hidden');$('#consultationForm').reset();renderHistory();$('#historyBackdrop').classList.remove('hidden')}
function closeHistory(){ $('#historyBackdrop').classList.add('hidden');$('#consultationFormWrap').classList.add('hidden');$('#consultationForm').reset();currentHistoryPatientId=null }
function setView(name){$$('.view').forEach(view=>view.classList.remove('active-view'));$(`#view-${name}`)?.classList.add('active-view');$$('.nav-link').forEach(link=>link.classList.toggle('active',link.dataset.view===name));$('.profile-button')?.classList.toggle('active',name==='perfil');const label={inicio:'Visão geral',pacientes:'Pacientes',agenda:'Agenda',planos:'Planos alimentares',perfil:'Perfil profissional'}[name]||'Visão geral';$('#breadcrumbCurrent').textContent=label;$('#sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'})}
let editingPatientId=null;
function openModal(patient=null){editingPatientId=patient?.id??null;$('#patientInviteSection')?.classList.toggle('hidden',!editingPatientId);$('#deletePatient')?.classList.toggle('hidden',!editingPatientId);$('#inviteResult')?.classList.add('hidden');$('#modalTitle').textContent=editingPatientId?'Editar perfil do paciente':'Adicionar paciente';$('#patientForm button[type="submit"]').innerHTML=editingPatientId?'Salvar alterações <span>→</span>':'Salvar perfil <span>→</span>';$('#patientForm').reset();if(patient){for(const [key,value] of Object.entries(patient)){const field=$(`#patientForm [name="${key}"]`);if(field&&value!=null)field.value=value}}setPersistentDropdown('goal',patient?.goal||'Reeducação alimentar');setPersistentDropdown('status',patient?.status||'ativo');closePersistentDropdowns();$('#modalBackdrop').classList.remove('hidden');setTimeout(()=>$('#patientForm input[name="name"]').focus(),60)}
function closeModal(){ $('#modalBackdrop').classList.add('hidden');$('#patientForm').reset();setPersistentDropdown('goal','Reeducação alimentar');setPersistentDropdown('status','ativo');closePersistentDropdowns();editingPatientId=null }
let toastTimeout;
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('visible'),2800)}
function persist(){if(typeof queueWorkspaceSave==='function')queueWorkspaceSave()}
$$('.nav-link,[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
$$('[data-action="new-patient"]').forEach(button=>button.addEventListener('click',()=>openModal()));
$$('[data-action="new-appointment"]').forEach(button=>button.addEventListener('click',()=>openAppointmentForm()));
$('#dashboardSearch').addEventListener('input',()=>{setView('pacientes');$('#patientsSearch').value=$('#dashboardSearch').value;renderPatients()});
$('#patientsSearch').addEventListener('input',renderPatients);$('#statusFilter').addEventListener('change',renderPatients);
$('#modalClose').addEventListener('click',closeModal);$('#modalCancel').addEventListener('click',closeModal);
$('#deletePatient').addEventListener('click',async()=>{const patient=patients.find(item=>item.id===editingPatientId);if(!patient)return;if(!confirm(`Excluir permanentemente ${patient.name}, incluindo consultas, agenda, planos e acesso ao portal? Esta ação não pode ser desfeita.`))return;const button=$('#deletePatient');button.disabled=true;try{const result=await requestApi(`/api/patients/${encodeURIComponent(patient.id)}`,{method:'DELETE'});workspaceRevision=result.revision;patients=patients.filter(item=>item.id!==patient.id);consultations=consultations.filter(item=>String(item.patientId)!==String(patient.id));appointments=appointments.filter(item=>String(item.patientId)!==String(patient.id));plans=plans.filter(item=>String(item.patientId)!==String(patient.id));closeModal();renderPatients();renderPlans();renderSchedule();toast('Paciente e registros associados foram excluídos.')}catch(error){toast(error.message)}finally{button.disabled=false}});
$('#modalBackdrop').addEventListener('click',event=>{if(event.target===$('#modalBackdrop'))closeModal()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(closePersistentDropdowns(true))return;closeModal();closeHistory()}});
$('#patientForm').addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.currentTarget);const name=String(data.get('name')).trim();if(!name)return;const values=Object.fromEntries(data.entries());for(const key of data.keys()){const field=$(`#patientForm [name="${key}"]`);if(field?.type==='number')values[key]=values[key]===''?null:Number(values[key])}if(editingPatientId){patients=patients.map(p=>p.id===editingPatientId?{...p,...values,name,initials:initials(name)}:p);persist();renderPatients();renderPlans();renderSchedule();closeModal();toast(`Perfil de ${name} atualizado.`);return}const patient={...values,id:Date.now(),name,last:'Cadastro recente',next:'Definir próximo passo',status:values.status||'ativo',initials:initials(name),tone:['green','peach','blue','lilac'][patients.length%4],follow:'Novo paciente'};patients=[patient,...patients];persist();renderPatients();renderPlans();renderSchedule();closeModal();setView('pacientes');toast(`${name} foi adicionado(a) aos pacientes.`)});
document.addEventListener('click',event=>{const button=event.target.closest('.patient-open');if(!button)return;const patient=patients.find(p=>String(p.id)===button.dataset.patientId);if(patient)openModal(patient)});
document.addEventListener('click',event=>{const button=event.target.closest('.history-button');if(button)openHistory(button.dataset.historyId)});
$('#historyClose').addEventListener('click',closeHistory);$('#historyBackdrop').addEventListener('click',event=>{if(event.target===$('#historyBackdrop'))closeHistory()});
$('#historyMonth').addEventListener('change',renderHistory);$('#compareMonths').addEventListener('change',renderHistory);
$('#newConsultationButton').addEventListener('click',()=>{$('#consultationFormWrap').classList.remove('hidden');$('#consultDate').value=dateInputValue();$('#consultationForm textarea[name="summary"]').focus()});
$('#cancelConsultation').addEventListener('click',()=>{$('#consultationFormWrap').classList.add('hidden');$('#consultationForm').reset()});
$('#consultationForm').addEventListener('submit',event=>{event.preventDefault();if(currentHistoryPatientId===null)return;const values=Object.fromEntries(new FormData(event.currentTarget).entries());for(const key of ['weightKg','waistCm'])values[key]=values[key]===''?null:Number(values[key]);consultations.push({...values,id:Date.now(),patientId:currentHistoryPatientId});const patient=patients.find(item=>item.id===currentHistoryPatientId);if(patient){patient.last=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(new Date(`${values.date}T12:00:00`));patient.next=values.nextSteps.trim()||'Acompanhamento registrado'}$('#historyMonth').value=values.date.slice(0,7);$('#consultationFormWrap').classList.add('hidden');event.currentTarget.reset();renderHistory();renderPatients();renderSchedule();persist();toast('Consulta adicionada ao histórico.')});
$('#mobileMenu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
const today=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(new Date());$('#todayLabel').textContent=today;
addMeasurementInputs();renderPatients();renderSchedule();
