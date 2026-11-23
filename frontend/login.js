/* PlacaVision — inicio de sesión y creación de la cuenta inicial. */
'use strict';

(function () {
  const $ = (sel) => document.querySelector(sel);
  const nextUrl = () => {
    const n = new URLSearchParams(location.search).get('next') || '';
    return /^#[a-z]+$/.test(n) ? '/' + n : '/#inicio';
  };

  async function post(path, body) {
    const res = await fetch(path, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const d = data && data.detail;
      throw new Error(typeof d === 'string' ? d : `Error ${res.status}`);
    }
    return data;
  }

  function showError(form, msg) {
    const box = $(`#${form}-error`);
    box.querySelector('span').textContent = msg;
    box.hidden = !msg;
  }

  function setBusy(btn, busy) {
    btn.disabled = busy;
    btn.classList.toggle('is-loading', busy);
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function show(id) {
    $('#auth-loading').hidden = true;
    $('#login-form').hidden = id !== 'login';
    $('#setup-form').hidden = id !== 'setup';
    const first = id === 'login' ? $('#login-user') : $('#setup-name');
    first.focus();
  }

  /* Mostrar / ocultar contraseña */
  document.querySelectorAll('.pass-toggle').forEach((b) => {
    b.addEventListener('click', () => {
      const input = document.getElementById(b.dataset.toggle);
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      b.setAttribute('aria-pressed', visible ? 'false' : 'true');
      b.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
      b.querySelector('use').setAttribute('href', visible ? '#i-eye' : '#i-eye-off');
      input.focus();
    });
  });

  /* Aviso de Bloq Mayús */
  $('#login-pass').addEventListener('keyup', (e) => {
    $('#login-caps').hidden = !(e.getModifierState && e.getModifierState('CapsLock'));
  });

  /* Reglas y fortaleza de la contraseña nueva */
  function checkRules() {
    const p = $('#setup-pass').value;
    const u = $('#setup-user').value.trim().toLowerCase();
    const rules = {
      len: p.length >= 8,
      mix: /[A-Za-z]/.test(p) && /\d/.test(p),
      user: !u || !p.toLowerCase().includes(u),
    };
    document.querySelectorAll('#pass-rules li').forEach((li) => li.classList.toggle('is-ok', !!p && rules[li.dataset.rule]));
    let score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
    if (/\d/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    const bar = $('#strength-bar');
    bar.style.width = `${(score / 5) * 100}%`;
    bar.dataset.level = score <= 2 ? 'low' : score <= 3 ? 'mid' : 'high';
    return rules.len && rules.mix && rules.user;
  }
  $('#setup-pass').addEventListener('input', checkRules);
  $('#setup-user').addEventListener('input', checkRules);

  /* Enviar login */
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = $('#login-user').value.trim();
    const pass = $('#login-pass').value;
    if (!user || !pass) { showError('login', 'Escribe tu usuario y tu contraseña.'); (user ? $('#login-pass') : $('#login-user')).focus(); return; }
    showError('login', '');
    const btn = $('#login-submit');
    setBusy(btn, true);
    try {
      await post('/api/auth/login', { username: user, password: pass });
      location.replace(nextUrl());
    } catch (err) {
      showError('login', err.message);
      $('#login-pass').value = '';
      $('#login-pass').focus();
      $('#auth-card').classList.remove('is-shake'); void $('#auth-card').offsetWidth; $('#auth-card').classList.add('is-shake');
    } finally {
      setBusy(btn, false);
    }
  });

  /* Enviar cuenta inicial */
  $('#setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#setup-name').value.trim();
    const user = $('#setup-user').value.trim();
    const p1 = $('#setup-pass').value;
    const p2 = $('#setup-pass2').value;
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(user)) { showError('setup', 'El usuario debe tener de 3 a 32 caracteres: letras, números, punto, guion o guion bajo.'); $('#setup-user').focus(); return; }
    if (!checkRules()) { showError('setup', 'La contraseña no cumple los requisitos de la lista.'); $('#setup-pass').focus(); return; }
    if (p1 !== p2) { showError('setup', 'Las contraseñas no coinciden.'); $('#setup-pass2').focus(); return; }
    showError('setup', '');
    const btn = $('#setup-submit');
    setBusy(btn, true);
    try {
      await post('/api/auth/setup', { username: user, name, password: p1 });
      location.replace(nextUrl());
    } catch (err) {
      showError('setup', err.message);
    } finally {
      setBusy(btn, false);
    }
  });

  /* Estado inicial */
  fetch('/api/auth/status', { credentials: 'same-origin' })
    .then((r) => r.json())
    .then((st) => {
      if (st.user) { location.replace(nextUrl()); return; }
      show(st.setup_required ? 'setup' : 'login');
    })
    .catch(() => {
      show('login');
      showError('login', 'No se pudo conectar con el servidor. Verifica que esté en ejecución.');
    });
})();
