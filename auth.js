const jsonRequest = async (url, body) => {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Não foi possível continuar.');
  return result;
};
const meetsPasswordPolicy = value => [...value].length >= 8 && [...value].length <= 256 && /\p{Lu}/u.test(value) && /\p{N}/u.test(value) && /[^\p{L}\p{N}\s]/u.test(value);

const authForm = document.querySelector('#professionalAuth');
if (authForm) {
  let mode = new URLSearchParams(location.search).get('tipo') === 'paciente' ? 'patient' : 'login';
  const buttons = [...document.querySelectorAll('[data-auth-mode]')];
    const nameField = authForm.elements.name;
  const patientLink = document.querySelector('.patient-link');
  function setMode(next) {
    mode = next;
    buttons.forEach(button => button.classList.toggle('active', button.dataset.authMode === next));
    nameField.closest('label').classList.toggle('hidden', next !== 'register');
    authForm.elements.email.closest('label').classList.toggle('hidden', next === 'patient');
    authForm.elements.email.required = next !== 'patient';
    let access = authForm.querySelector('[name="accessCode"]');
    if (!access) {
      access = document.createElement('input'); access.name = 'accessCode'; access.autocomplete = 'username'; access.placeholder = 'NTR-XXXXXXXXXX';
      const label = document.createElement('label'); label.textContent = 'Código de acesso'; label.append(access); authForm.insertBefore(label, authForm.querySelector('.auth-error'));
    }
    access.closest('label').classList.toggle('hidden', next !== 'patient');
    access.required = next === 'patient';
    authForm.elements.password.autocomplete = next === 'register' ? 'new-password' : 'current-password';
    document.querySelector('#authTitle').textContent = next === 'register' ? 'Crie sua conta' : next === 'patient' ? 'Acesse seu portal' : 'Acesse sua conta';
    document.querySelector('#authIntro').textContent = next === 'patient' ? 'Use o código e a senha definidos ao ativar seu convite.' : next === 'register' ? 'Sua conta profissional fica separada das demais.' : 'Organize sua prática nutricional com segurança.';
    document.querySelector('#authSubmit').textContent = next === 'register' ? 'Criar conta' : next === 'patient' ? 'Entrar no portal' : 'Entrar';
    document.querySelector('#passwordHint').classList.toggle('hidden', next !== 'register');
    document.querySelector('#authError').classList.add('hidden');
    patientLink.textContent = next === 'patient' ? 'Acesso da nutricionista →' : 'Sou paciente e quero acessar meu plano →';
    patientLink.href = next === 'patient' ? '/' : '?tipo=paciente';
  }
  buttons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.authMode)));
  patientLink.addEventListener('click', event => { if (mode !== 'patient' && patientLink.href.endsWith('tipo=paciente')) { event.preventDefault(); setMode('patient'); } });
  authForm.addEventListener('submit', async event => {
    event.preventDefault();
    const errorBox = document.querySelector('#authError'); errorBox.classList.add('hidden');
    const form = new FormData(authForm);
    const body = mode === 'patient' ? { accessCode: form.get('accessCode'), password: form.get('password') } : { name: form.get('name'), email: form.get('email'), password: form.get('password') };
    if (mode === 'register' && !meetsPasswordPolicy(body.password)) { errorBox.textContent = 'A senha precisa ter no mínimo 8 caracteres, uma letra maiúscula, um número e um símbolo.'; errorBox.classList.remove('hidden'); return; }
    try { await jsonRequest(mode === 'register' ? '/api/register' : mode === 'patient' ? '/api/patient/login' : '/api/login', body); location.href = mode === 'patient' ? '/portal.html' : '/index.html'; }
    catch (error) { errorBox.textContent = error.message; errorBox.classList.remove('hidden'); }
  });
  setMode(mode);
}

const activateForm = document.querySelector('#activateForm');
if (activateForm) activateForm.addEventListener('submit', async event => {
  event.preventDefault();
  const errorBox = document.querySelector('#activateError'); errorBox.classList.add('hidden');
  const values = new FormData(activateForm); const password = values.get('password');
  if (!meetsPasswordPolicy(password)) { errorBox.textContent = 'A senha precisa ter no mínimo 8 caracteres, uma letra maiúscula, um número e um símbolo.'; errorBox.classList.remove('hidden'); return; }
  if (password !== values.get('confirm')) { errorBox.textContent = 'As senhas não conferem.'; errorBox.classList.remove('hidden'); return; }
  try {
    const result = await jsonRequest('/api/patient/activate', { token: new URLSearchParams(location.search).get('token'), password });
    activateForm.classList.add('hidden');
    const success = document.querySelector('#activationSuccess'); success.innerHTML = `<div class="access-code-card"><strong>Seu código de acesso</strong><b>${result.accessCode}</b><p>Guarde este código. Você usará junto com sua senha para entrar no portal.</p><a class="auth-submit" href="/portal.html">Ir para meu portal</a></div>`; success.classList.remove('hidden');
  } catch (error) { errorBox.textContent = error.message; errorBox.classList.remove('hidden'); }
});
