/* =========================================================
   AXIOM – auth.js  (login.html + signup.html)
   ========================================================= */

/* ---------- shared ---------- */
if (getSession()) {
  // already signed in -> straight to the right dashboard
  const s = getSession();
  location.replace(s.role === 'hr' ? 'hr-dashboard.html' : 'employee-dashboard.html');
}

function setFormError(el, msg) {
  if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
  el.style.display = 'block';
  el.innerHTML = msg;
}

/* login page ------------------------------------------------ */
function fillDemo(email) {
  document.getElementById('email').value = email;
  document.getElementById('password').value = 'password123';
  toast('Demo credentials filled — press Sign in.', 'info', 'Ready');
}

async function resetDemo(ev) {
  ev.preventDefault();
  if (await confirmAction({ title: 'Reset demo data?', body: '<p class="mb-0 text-muted-2">All mock changes (check-ins, leaves, salary edits, signups) will be cleared.</p>', okText: 'Reset', okClass: 'btn-danger-soft' })) {
    resetMockDB();
    toast('Demo data has been reset.', 'success');
  }
}

/**
 * loginUser() — called by the login form.
 * UI logic only; the actual credential check happens in api.login()
 * (mock now → POST /api/auth/login later).
 */
async function loginUser() {
  const form = document.getElementById('login-form');
  const errBox = document.getElementById('login-error');
  const flash = document.getElementById('login-flash');
  const btn = document.getElementById('login-btn');

  form.classList.add('was-validated');
  if (!form.checkValidity()) { setFormError(errBox, ''); return; }

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const remember = document.getElementById('remember').checked;

  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>Signing in…';
  setFormError(errBox, '');

  try {
    const session = await api.login(email, password); // --> POST /api/auth/login
    setSession(session, remember);
    const params = new URLSearchParams(location.search);
    const next = params.get('next');
    location.replace(next || (session.role === 'hr' ? 'hr-dashboard.html' : 'employee-dashboard.html'));
  } catch (e) {
    setFormError(errBox, esc(e.message));
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
}


/* signup page ------------------------------------------------ */
/**
 * signupUser() — called by the signup form.
 * Frontend validation first, then api.signup()
 * (mock now → POST /api/auth/signup later).
 */
let CURRENT_SIGNUP_PAYLOAD = null;

async function signupUser() {
  const form = document.getElementById('signup-form');
  const errBox = document.getElementById('signup-error');
  const btn = document.getElementById('signup-btn');

  const employeeId = document.getElementById('employeeId').value.trim();
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('semail').value.trim();
  const password = document.getElementById('spassword').value;
  const confirm = document.getElementById('confirm').value;
  const role = document.getElementById('role').value;

  // custom validation: password match
  const confirmInput = document.getElementById('confirm');
  if (confirm && confirm !== password) {
    confirmInput.setCustomValidity('no-match');
    document.getElementById('confirm-feedback').textContent = 'Passwords do not match.';
  } else {
    confirmInput.setCustomValidity('');
  }

  form.classList.add('was-validated');
  if (!form.checkValidity()) { setFormError(errBox, ''); return; }
  if (!role) { setFormError(errBox, 'Please select a role.'); return; }

  // If HR, show the key dialog step
  if (role === 'hr') {
    CURRENT_SIGNUP_PAYLOAD = { employeeId, name, email, password, role };
    document.getElementById('hr-key-section').style.display = 'block';
    document.getElementById('signup-btn').style.display = 'none';
    ['employeeId', 'name', 'semail', 'spassword', 'confirm', 'role'].forEach(id => {
      document.getElementById(id).disabled = true;
    });
    return;
  }

  // If Employee, proceed directly
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>Creating account…';
  setFormError(errBox, '');

  try {
    await api.signup({ employeeId, name, email, password, role }); // --> POST /api/auth/signup
    toast('Account created. Please sign in.', 'success', 'Welcome to Axiom');
    if (typeof confetti !== 'undefined') confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    setTimeout(() => location.replace('login.html?registered=' + encodeURIComponent(email)), 1500);
  } catch (e) {
    setFormError(errBox, esc(e.message));
    btn.disabled = false;
    btn.textContent = 'Create account';
  }
}

async function completeHrSignup() {
  if (!CURRENT_SIGNUP_PAYLOAD) return;
  const errBox = document.getElementById('signup-error');
  const btn = document.getElementById('complete-hr-signup-btn');
  const companyKey = document.getElementById('companyKey').value.trim();
  
  if (!companyKey) {
    setFormError(errBox, 'Please enter the Company Key.');
    return;
  }
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>Creating account…';
  setFormError(errBox, '');

  try {
    await api.signup({ ...CURRENT_SIGNUP_PAYLOAD, companyKey }); // --> POST /api/auth/signup
    toast('Account created. Please sign in.', 'success', 'Welcome to Axiom');
    if (typeof confetti !== 'undefined') confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    setTimeout(() => location.replace('login.html?registered=' + encodeURIComponent(CURRENT_SIGNUP_PAYLOAD.email)), 1500);
  } catch (e) {
    setFormError(errBox, esc(e.message));
    btn.disabled = false;
    btn.textContent = 'Verify Key & Create account';
  }
}

function cancelHrKey() {
  CURRENT_SIGNUP_PAYLOAD = null;
  document.getElementById('hr-key-section').style.display = 'none';
  document.getElementById('signup-btn').style.display = 'block';
  document.getElementById('companyKey').value = '';
  document.getElementById('signup-error').style.display = 'none';
  
  ['employeeId', 'name', 'semail', 'spassword', 'confirm', 'role'].forEach(id => {
    document.getElementById(id).disabled = false;
  });
}


/* ---------- wire up (login vs signup page) ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    // surface message after signup / logout
    const params = new URLSearchParams(location.search);
    if (params.get('registered')) {
      const fl = document.getElementById('login-flash');
      fl.style.display = 'block';
      fl.innerHTML = `Account created for <b>${esc(params.get('registered'))}</b>. Sign in to continue.`;
      document.getElementById('email').value = params.get('registered');
    }
    if (params.get('loggedout')) toast('You have been logged out.', 'info', 'See you soon');
    if (params.get('expired')) toast('Your session expired. Please sign in again.', 'info', 'Session expired');

    loginForm.addEventListener('submit', e => { e.preventDefault(); loginUser(); });
    document.getElementById('pw-toggle').onclick = () => {
      const p = document.getElementById('password');
      p.type = p.type === 'password' ? 'text' : 'password';
    };
    return;
  }

  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', e => { e.preventDefault(); signupUser(); });
    document.getElementById('spw-toggle').onclick = () => {
      const p = document.getElementById('spassword');
      p.type = p.type === 'password' ? 'text' : 'password';
    };
    
    document.getElementById('complete-hr-signup-btn').onclick = completeHrSignup;
    document.getElementById('cancel-hr-key-btn').onclick = cancelHrKey;
  }
});
