/* =========================================================
   DAYFLOW – auth.js  (login.html + signup.html)
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

async function handleGoogleLogin(response) {
  const errBox = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  const remember = document.getElementById('remember') ? document.getElementById('remember').checked : true;

  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>Signing in with Google…';
  setFormError(errBox, '');

  try {
    const session = await api.googleLogin(response.credential);
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
let CURRENT_OTP_PAYLOAD = null;

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

  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>Sending OTP…';
  setFormError(errBox, '');

  try {
    await api.sendOTP(email); // --> POST /api/auth/send-otp
    CURRENT_OTP_PAYLOAD = { employeeId, name, email, password, role };
    
    // Show OTP section
    document.getElementById('otp-section').style.display = 'block';
    document.getElementById('signup-btn').style.display = 'none';
    document.getElementById('google-signup-section').style.display = 'none';
    
    // Make form fields readonly while OTP is active
    ['employeeId', 'name', 'semail', 'spassword', 'confirm', 'role'].forEach(id => {
      document.getElementById(id).disabled = true;
    });
    
  } catch (e) {
    setFormError(errBox, esc(e.message));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verify Email';
  }
}

async function completeSignup() {
  if (!CURRENT_OTP_PAYLOAD) return;
  const errBox = document.getElementById('signup-error');
  const btn = document.getElementById('complete-signup-btn');
  const otpInput = document.getElementById('otp-input');
  const otp = otpInput.value.trim();
  
  if (otp.length !== 6) {
    setFormError(errBox, 'Please enter the 6-digit OTP.');
    return;
  }
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>Creating account…';
  setFormError(errBox, '');

  try {
    await api.signup({ ...CURRENT_OTP_PAYLOAD, otp }); // --> POST /api/auth/signup
    toast('Account created. Please sign in.', 'success', 'Welcome to Dayflow');
    location.replace('login.html?registered=' + encodeURIComponent(CURRENT_OTP_PAYLOAD.email));
  } catch (e) {
    setFormError(errBox, esc(e.message));
    btn.disabled = false;
    btn.textContent = 'Verify & Create account';
  }
}

function cancelOTP() {
  CURRENT_OTP_PAYLOAD = null;
  document.getElementById('otp-section').style.display = 'none';
  document.getElementById('signup-btn').style.display = 'block';
  document.getElementById('google-signup-section').style.display = 'block';
  document.getElementById('otp-input').value = '';
  document.getElementById('signup-error').style.display = 'none';
  
  ['employeeId', 'name', 'semail', 'spassword', 'confirm', 'role'].forEach(id => {
    document.getElementById(id).disabled = false;
  });
}

async function handleGoogleSignup(response) {
  const form = document.getElementById('signup-form');
  const errBox = document.getElementById('signup-error');
  const btn = document.getElementById('signup-btn');

  const employeeId = document.getElementById('employeeId').value.trim();
  const name = document.getElementById('name').value.trim();
  const role = document.getElementById('role').value;

  form.classList.add('was-validated');

  const empInput = document.getElementById('employeeId');
  
  if (!empInput.checkValidity() || !role) {
    setFormError(errBox, 'Please provide a valid Employee ID and select a Role before signing up with Google.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>Creating account via Google…';
  setFormError(errBox, '');

  try {
    await api.googleSignup({ employeeId, name, role, credential: response.credential });
    toast('Account created with Google. Please sign in.', 'success', 'Welcome to Dayflow');
    location.replace('login.html?registered=' + encodeURIComponent("Google Account"));
  } catch (e) {
    setFormError(errBox, esc(e.message));
    btn.disabled = false;
    btn.textContent = 'Create account';
  }
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
    document.getElementById('complete-signup-btn').onclick = completeSignup;
    document.getElementById('cancel-otp-btn').onclick = cancelOTP;
  }
});
