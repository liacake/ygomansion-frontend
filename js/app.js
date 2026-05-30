// ─── Config ──────────────────────────────────────────────────────────────────
const API_BASE    = 'http://localhost:8080/api';
const YGOPRO_BASE = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';

// ─── JWT helpers ──────────────────────────────────────────────────────────────
function jwtDecode(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

function jwtIsExpired(token) {
  const payload = jwtDecode(token);
  if (!payload || !payload.exp) return true;
  return Date.now() / 1000 > payload.exp;
}

// ─── Auth State ───────────────────────────────────────────────────────────────
const Auth = {
  getToken() {
    const t = localStorage.getItem('gm_token');
    if (!t) return null;
    if (jwtIsExpired(t)) { this.clear(); return null; }
    return t;
  },
  getUser() {
    const u = localStorage.getItem('gm_user');
    return u ? JSON.parse(u) : null;
  },
  getUserId()   { return this.getUser()?.id   ?? null; },
  getUsername() { return this.getUser()?.username ?? null; },
  hasRole(r)    { return this.getUser()?.roles?.includes(r) ?? false; },
  isAdmin()     { return this.hasRole('ADMIN'); },
  isLoggedIn() { return !!this.getToken(); },

  setSession(token) {
    const payload = jwtDecode(token);
    if (!payload) throw new Error('Invalid token received from server');
    const user = {
      id:       payload.userId,
      username: payload.sub,
      roles:    payload.roles ?? [],
      exp:      payload.exp   ?? null,
    };
    localStorage.setItem('gm_token', token);
    localStorage.setItem('gm_user', JSON.stringify(user));
    this._scheduleExpiry(payload.exp);
  },

  _expiryTimer: null,
  _scheduleExpiry(exp) {
    if (this._expiryTimer) clearTimeout(this._expiryTimer);
    if (!exp) return;
    const msLeft = exp * 1000 - Date.now();
    if (msLeft <= 0) { this.clear(); return; }
    const warnAt = msLeft - 30_000;
    if (warnAt > 0) {
      this._expiryTimer = setTimeout(() => showSessionBanner(30), warnAt);
    }
    setTimeout(() => { this.clear(); showSessionBanner(0); }, msLeft);
  },
  restoreExpiry() {
    const t = localStorage.getItem('gm_token');
    if (!t) return;
    const payload = jwtDecode(t);
    if (payload?.exp) this._scheduleExpiry(payload.exp);
  },
  clear() {
    localStorage.removeItem('gm_token');
    localStorage.removeItem('gm_user');
    if (this._expiryTimer) { clearTimeout(this._expiryTimer); this._expiryTimer = null; }
  },
  logout() {
    this.clear();
    window.location.href = 'login.html';
  },
};

(function checkOnLoad() {
  const raw = localStorage.getItem('gm_token');
  if (raw && jwtIsExpired(raw)) {
    Auth.clear();
  } else if (raw) {
    Auth.restoreExpiry();
  }
})();

// ─── Session-expired banner ───────────────────────────────────────────────────
function showSessionBanner(secondsLeft) {
  document.getElementById('_sessionBanner')?.remove();
  const msg = secondsLeft > 0
    ? `Your session expires in ${secondsLeft}s — save your work.`
    : 'Your session has expired. Please log in again.';
  const banner = document.createElement('div');
  banner.id = '_sessionBanner';
  banner.className = 'session-banner';
  banner.innerHTML = `
    <span>⚠ ${escHtml(msg)}</span>
    ${secondsLeft === 0
      ? `<a href="login.html" class="btn btn-primary btn-sm">Log in</a>`
      : `<button class="btn btn-ghost btn-sm" onclick="this.closest('#_sessionBanner').remove()">Dismiss</button>`}`;
  document.body.appendChild(banner);
  if (secondsLeft > 0) setTimeout(() => banner.remove(), 15_000);
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers ?? {}) };
  const token   = Auth.getToken();
  if (!token && opts._requiresAuth) { showSessionBanner(0); throw new Error('Session expired'); }
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (res.status === 401) { Auth.clear(); showSessionBanner(0); throw new Error('Session expired'); }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Card Type Definitions ────────────────────────────────────────────────────
const CARD_TYPE_GROUPS = [
  { label: 'Monster', types: [
    'Normal Monster','Effect Monster','Ritual Monster','Fusion Monster',
    'Synchro Monster','XYZ Monster','Pendulum Effect Monster','Link Monster',
    'Tuner Monster','Flip Effect Monster','Gemini Monster','Spirit Monster',
    'Toon Monster','Union Effect Monster',
  ]},
  { label: 'Spell', types: [
    'Spell Card','Normal Spell Card','Continuous Spell Card','Equip Spell Card',
    'Field Spell Card','Quick-Play Spell Card','Ritual Spell Card',
  ]},
  { label: 'Trap', types: [
    'Trap Card','Normal Trap Card','Continuous Trap Card','Counter Trap Card',
  ]},
];
const ALL_CARD_TYPES = CARD_TYPE_GROUPS.flatMap(g => g.types);
const ATTRIBUTES    = ['DARK','EARTH','FIRE','LIGHT','WATER','WIND','DIVINE'];
const MONSTER_RACES = ['Aqua','Beast','Beast-Warrior','Cyberse','Dinosaur','Divine-Beast','Dragon','Fairy','Fiend','Fish','Insect','Machine','Plant','Psychic','Pyro','Reptile','Rock','Sea Serpent','Spellcaster','Thunder','Warrior','Winged Beast','Wyrm','Zombie'];
const SPELL_RACES   = ['Normal','Continuous','Equip','Field','Quick-Play','Ritual'];
const TRAP_RACES    = ['Normal','Continuous','Counter'];
const LEVELS = [1,2,3,4,5,6,7,8,9,10,11,12];
const SCALES = Array.from({ length: 14 }, (_, i) => i);
const LINKS  = [1,2,3,4,5,6,7,8];

function canHaveAtk(type)   { const lo = type?.toLowerCase() ?? ''; return !lo.includes('spell') && !lo.includes('trap'); }
function canHaveDef(type)   { const lo = type?.toLowerCase() ?? ''; return !lo.includes('spell') && !lo.includes('trap') && !lo.includes('link'); }
function canHaveLevel(type) { const lo = type?.toLowerCase() ?? ''; return !lo.includes('spell') && !lo.includes('trap') && !lo.includes('xyz') && !lo.includes('link') && !lo.includes('pendulum'); }
function canHaveScale(type) { return type?.toLowerCase().includes('pendulum') ?? false; }
function canHaveLink(type)  { return type?.toLowerCase().includes('link') ?? false; }
function canHaveRaces(type) {
  const lo = type?.toLowerCase() ?? '';
  if (lo.includes('spell')) return SPELL_RACES;
  if (lo.includes('trap'))  return TRAP_RACES;
  return MONSTER_RACES;
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function formatAtkDef(atk, def) {
  if (atk == null && def == null) return '';
  const a = atk != null ? atk : '?';
  const d = def != null ? def : '?';
  return `ATK ${a} / DEF ${d}`;
}

function cardImageSrc(card) {
  return card.imageUrl || card.card_images?.[0]?.image_url || null;
}

function renderCardItem(card, linkHref) {
  const img      = cardImageSrc(card);
  const atkDef   = formatAtkDef(card.atk, card.def);
  const ownerName= card.ownerUsername;
  const ownerId  = card.ownerId;
  const ownerImg = card.ownerImage;
  return `
    <a href="${linkHref}" class="card-item">
      ${img
        ? `<img class="card-item-img" src="${escHtml(img)}" alt="${escHtml(card.name)}" loading="lazy">`
        : `<div class="card-item-img-placeholder">🂠</div>`}
      <div class="card-item-body">
        <div class="card-item-name">${escHtml(card.name)}</div>
        <div class="card-item-type">${escHtml(card.type ?? '')}${card.race ? ` / ${escHtml(card.race)}` : ''}</div>
        ${atkDef ? `<div class="card-item-stats">${escHtml(atkDef)}</div>` : ''}
        ${ownerName && ownerId ? `
          <div class="card-item-owner">
            ${ownerImg ? `<img src="${escHtml(ownerImg)}" alt="">` : ''}
            <span>${escHtml(ownerName)}</span>
          </div>` : ''}
      </div>
    </a>`;
}

// ─── YGOPRODeck normalizer ────────────────────────────────────────────────────
function normalizeYgoproCard(c) {
  return {
    id:        c.id,
    name:      c.name,
    type:      c.type,
    atk:       c.atk,
    def:       c.def,
    level:     c.level,
    scale:     c.scale,
    linkval:   c.linkval,
    attribute: c.attribute,
    race:      c.race,
    archetype: c.archetype,
    effect:    c.desc,
    imageUrl:  c.card_images?.[0]?.image_url ?? null,
  };
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showAlert(el, msg, type = 'error') {
  el.className = `alert alert-${type} show`;
  el.textContent = msg;
  if (type !== 'error') setTimeout(() => el.classList.remove('show'), 4000);
}
function hideAlert(el) { el.classList.remove('show'); }

function setLoading(btn, yes, label = '') {
  if (!btn) return;
  btn.disabled = yes;
  if (yes) { btn._orig = btn.textContent; btn.textContent = label || 'Loading…'; }
  else     { btn.textContent = btn._orig ?? btn.textContent; }
}

// ─── Nav active state ─────────────────────────────────────────────────────────
function setActiveNav() {
  const page = location.pathname.split('/').pop();
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === page);
  });
}

// ─── Render Navbar — Modernized with scroll effect ────────────────────────────
function renderNavbar() {
  const loggedIn = Auth.isLoggedIn();
  const user     = Auth.getUser();
  const authLinks = loggedIn
    ? `<li class="nav-right">
         <span class="nav-user">⚔ ${escHtml(user.username)}</span>
         <a href="profile.html?id=${user.id}" class="btn btn-ghost btn-sm">Profile</a>
         <button class="btn btn-secondary btn-sm" onclick="Auth.logout()">Logout</button>
       </li>`
    : `<li class="nav-right">
         <a href="login.html"    class="btn btn-secondary btn-sm">Login</a>
         <a href="register.html" class="btn btn-primary   btn-sm">Register</a>
       </li>`;

  document.getElementById('navbar').innerHTML = `
    <nav class="navbar" id="mainNavbar">
      <div class="nav-inner">
        <a href="index.html" class="nav-brand">☽ Ghost Mansion</a>
        <ul class="nav-links" id="navLinks">
          <li><a href="index.html">Home</a></li>
          <li><a href="cards.html">Cards</a></li>
          <li><a href="decks.html">Decks</a></li>
          ${loggedIn ? `
          <li><a href="card-new.html">+ New Card</a></li>
          <li><a href="deck-new.html">+ New Deck</a></li>` : ''}
          ${authLinks}
        </ul>
        <button class="hamburger" id="hamburger" aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
      </div>
    </nav>`;

  document.getElementById('hamburger')?.addEventListener('click', () => {
    document.getElementById('hamburger').classList.toggle('active');
    document.getElementById('navLinks')?.classList.toggle('open');
  });

  // Scroll effect for navbar
  const navbar = document.getElementById('mainNavbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  setActiveNav();
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function renderFooter() {
  const el = document.getElementById('footer');
  if (el) el.innerHTML = `<footer>Ghost Mansion &mdash; Yu-Gi-Oh Card Manager &mdash; Powered by <a href="https://ygoprodeck.com" target="_blank">YGOPRODeck API</a></footer>`;
}

// ─── Build select options ─────────────────────────────────────────────────────
function buildTypeSelect(selectEl, includeAll = true) {
  let html = includeAll
    ? '<option value="">All Types</option>'
    : '<option value="" disabled selected>Select Type</option>';
  for (const g of CARD_TYPE_GROUPS) {
    html += `<optgroup label="${escHtml(g.label)}">`;
    for (const t of g.types) html += `<option value="${escHtml(t)}">${escHtml(t)}</option>`;
    html += '</optgroup>';
  }
  selectEl.innerHTML = html;
}

function buildOptions(selectEl, vals, placeholder = '', selectedVal = null) {
  let html = placeholder ? `<option value="">${escHtml(placeholder)}</option>` : '';
  for (const v of vals) {
    html += `<option value="${escHtml(v)}" ${String(v) === String(selectedVal) ? 'selected' : ''}>${escHtml(v)}</option>`;
  }
  selectEl.innerHTML = html;
}

// ─── Auth guard ───────────────────────────────────────────────────────────────
function requireAuth() {
  if (!Auth.isLoggedIn()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// ─── URL param helper ─────────────────────────────────────────────────────────
function getParam(name) { return new URLSearchParams(location.search).get(name); }

// ─── Image Upload Widget — Modernized ──────────────────────────────────────────
function createImageWidget(containerEl, { savedUrl = null, onResult } = {}) {
  containerEl.innerHTML = `
    <div class="img-widget">
      <div class="img-widget-preview" id="_iwPreview">
        ${savedUrl
          ? `<img src="${escHtml(savedUrl)}" alt="Current image" id="_iwImg">`
          : `<div class="img-widget-placeholder" id="_iwPlaceholder">🂠<br><span>No image</span></div>`}
      </div>
      <div class="img-widget-controls">
        <label class="btn btn-secondary btn-sm" style="cursor:pointer">
          Upload file
          <input type="file" id="_iwFile" accept="image/*" style="display:none">
        </label>
        <span class="img-widget-or">or</span>
        <input class="form-input" id="_iwUrl" type="url"
               placeholder="Paste image URL…"
               value="${escHtml(savedUrl && !savedUrl.startsWith('data:') ? savedUrl : '')}">
        <button class="btn btn-ghost btn-sm" id="_iwClear" type="button" title="Clear image">✕</button>
      </div>
      <div class="form-error" id="_iwErr"></div>
    </div>`;

  const fileInput = containerEl.querySelector('#_iwFile');
  const urlInput  = containerEl.querySelector('#_iwUrl');
  const clearBtn  = containerEl.querySelector('#_iwClear');
  const errEl     = containerEl.querySelector('#_iwErr');
  let current = savedUrl || null;

  function setPreview(src) {
    const area = containerEl.querySelector('#_iwPreview');
    if (src) {
      area.innerHTML = `<img src="${escHtml(src)}" alt="Preview" id="_iwImg" style="max-width:100%;border-radius:var(--radius)">`;
    } else {
      area.innerHTML = `<div class="img-widget-placeholder" id="_iwPlaceholder">🂠<br><span>No image</span></div>`;
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { errEl.textContent = 'File too large (max 5 MB).'; return; }
    if (!file.type.startsWith('image/')) { errEl.textContent = 'Only image files are accepted.'; return; }
    errEl.textContent = '';
    const reader = new FileReader();
    reader.onload = e => { current = e.target.result; urlInput.value = ''; setPreview(current); onResult && onResult(current); };
    reader.readAsDataURL(file);
  });

  urlInput.addEventListener('change', () => {
    const val = urlInput.value.trim();
    errEl.textContent = '';
    if (!val) { current = null; setPreview(null); onResult && onResult(null); return; }
    current = val; setPreview(val); onResult && onResult(val);
  });
  urlInput.addEventListener('blur', () => urlInput.dispatchEvent(new Event('change')));

  clearBtn.addEventListener('click', () => {
    current = null; urlInput.value = ''; fileInput.value = ''; errEl.textContent = '';
    setPreview(null); onResult && onResult(null);
  });

  return { getValue() { return current; }, setValue(src) { current = src; setPreview(src); if (src && !src.startsWith('data:')) urlInput.value = src; } };
}

// ─── Upload image to server ──────────────────────────────────────────────────
async function uploadImageIfNeeded(entityType, entityId, imageValue) {
  if (!imageValue) return null;
  if (!imageValue.startsWith('data:')) return imageValue;
  const res  = await fetch(imageValue);
  const blob = await res.blob();
  const form = new FormData();
  form.append('file', blob, 'upload.' + (blob.type.split('/')[1] || 'jpg'));
  const token = Auth.getToken();
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  const response = await fetch(`${API_BASE}/${entityType}/${entityId}/image`, {
    method: 'POST', headers, body: form,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Image upload failed (${response.status})`);
  }
  const data = await response.json();
  return data.imageUrl;
}
