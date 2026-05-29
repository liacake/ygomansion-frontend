// ─── Config ──────────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:8080/api';
const YGOPRO_BASE = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';

// ─── Auth State ───────────────────────────────────────────────────────────────
const Auth = {
  getToken()    { return localStorage.getItem('gm_token'); },
  getUser()     { const u = localStorage.getItem('gm_user'); return u ? JSON.parse(u) : null; },
  getUserId()   { return this.getUser()?.id ?? null; },
  getUsername() { return this.getUser()?.username ?? null; },
  hasRole(r)    { return this.getUser()?.roles?.includes(r) ?? false; },
  isAdmin()     { return this.hasRole('ADMIN'); },

  isLoggedIn()  { return !!this.getToken(); },

  setSession(token) {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const user = { id: payload.userId, username: payload.sub, roles: payload.roles ?? [] };
    localStorage.setItem('gm_token', token);
    localStorage.setItem('gm_user', JSON.stringify(user));
  },

  clear() {
    localStorage.removeItem('gm_token');
    localStorage.removeItem('gm_user');
  },

  logout() {
    this.clear();
    window.location.href = 'login.html';
  }
};

// ─── HTTP Helper ──────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers ?? {}) };
  const token = Auth.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  if (res.status === 401) {
    Auth.clear();
    window.location.href = 'login.html';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ─── Card Type Definitions ─────────────────────────────────────────────────
const CARD_TYPE_GROUPS = [
  { label: 'Monster', types: ['Normal Monster','Effect Monster','Ritual Monster','Fusion Monster','Synchro Monster','XYZ Monster','Pendulum Effect Monster','Link Monster','Tuner Monster','Flip Effect Monster','Gemini Monster','Spirit Monster','Toon Monster','Union Effect Monster'] },
  { label: 'Spell',   types: ['Spell Card','Normal Spell Card','Continuous Spell Card','Equip Spell Card','Field Spell Card','Quick-Play Spell Card','Ritual Spell Card'] },
  { label: 'Trap',    types: ['Trap Card','Normal Trap Card','Continuous Trap Card','Counter Trap Card'] },
];
const ALL_CARD_TYPES = CARD_TYPE_GROUPS.flatMap(g => g.types);

const ATTRIBUTES = ['DARK','EARTH','FIRE','LIGHT','WATER','WIND','DIVINE'];
const MONSTER_RACES = ['Aqua','Beast','Beast-Warrior','Cyberse','Dinosaur','Divine-Beast','Dragon','Fairy','Fiend','Fish','Insect','Machine','Plant','Psychic','Pyro','Reptile','Rock','Sea Serpent','Spellcaster','Thunder','Warrior','Winged Beast','Wyrm','Zombie'];
const SPELL_RACES  = ['Normal','Continuous','Equip','Field','Quick-Play','Ritual'];
const TRAP_RACES   = ['Normal','Continuous','Counter'];

const LEVELS = [1,2,3,4,5,6,7,8,9,10,11,12];
const SCALES = Array.from({length:14},(_,i)=>i);
const LINKS  = [1,2,3,4,5,6,7,8];

function canHaveAtk(type) {
  if (!type) return false;
  const lo = type.toLowerCase();
  return !lo.includes('spell') && !lo.includes('trap');
}
function canHaveDef(type) {
  if (!type) return false;
  const lo = type.toLowerCase();
  return !lo.includes('spell') && !lo.includes('trap') && !lo.includes('link');
}
function canHaveLevel(type) {
  if (!type) return false;
  const lo = type.toLowerCase();
  return !lo.includes('spell') && !lo.includes('trap') && !lo.includes('xyz') && !lo.includes('link') && !lo.includes('pendulum');
}
function canHaveScale(type)   { return type?.toLowerCase().includes('pendulum') ?? false; }
function canHaveLink(type)    { return type?.toLowerCase().includes('link') ?? false; }
function canHaveRaces(type) {
  if (!type) return [];
  const lo = type.toLowerCase();
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
  return card.imageUrl || (card.card_images?.[0]?.image_url) || null;
}

function renderCardItem(card, linkHref) {
  const img = cardImageSrc(card);
  const atkDef = formatAtkDef(card.atk, card.def);
  const ownerName = card.ownerUsername;
  const ownerId   = card.ownerId;
  const ownerImg  = card.ownerImage;

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

// ─── Ygopro card normalizer ───────────────────────────────────────────────────
function normalizeYgoproCard(c) {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    atk: c.atk,
    def: c.def,
    level: c.level,
    scale: c.scale,
    linkval: c.linkval,
    attribute: c.attribute,
    race: c.race,
    archetype: c.archetype,
    effect: c.desc,
    imageUrl: c.card_images?.[0]?.image_url ?? null,
  };
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
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

// ─── Render Navbar ────────────────────────────────────────────────────────────
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
         <a href="login.html" class="btn btn-secondary btn-sm">Login</a>
         <a href="register.html" class="btn btn-primary btn-sm">Register</a>
       </li>`;

  const html = `
    <nav class="navbar">
      <div class="nav-inner">
        <a href="index.html" class="nav-brand">☽ Ghost Mansion</a>
        <ul class="nav-links" id="navLinks">
          <li><a href="index.html">Home</a></li>
          <li><a href="cards.html">Cards</a></li>
          <li><a href="decks.html">Decks</a></li>
          ${loggedIn ? `<li><a href="card-new.html">+ New Card</a></li>
                        <li><a href="deck-new.html">+ New Deck</a></li>` : ''}
          ${authLinks}
        </ul>
        <button class="hamburger" id="hamburger" aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
      </div>
    </nav>`;

  document.getElementById('navbar').innerHTML = html;

  document.getElementById('hamburger')?.addEventListener('click', () => {
    document.getElementById('navLinks')?.classList.toggle('open');
  });

  setActiveNav();
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function renderFooter() {
  const el = document.getElementById('footer');
  if (el) el.innerHTML = `<footer>Ghost Mansion &mdash; Yu-Gi-Oh Card Manager &mdash; Powered by <a href="https://ygoprodeck.com" target="_blank">YGOPRODeck API</a></footer>`;
}

// ─── Build select options ─────────────────────────────────────────────────────
function buildTypeSelect(selectEl, includeAll = true) {
  let html = includeAll ? '<option value="">All Types</option>' : '<option value="" disabled selected>Select Type</option>';
  for (const g of CARD_TYPE_GROUPS) {
    html += `<optgroup label="${escHtml(g.label)}">`;
    for (const t of g.types) html += `<option value="${escHtml(t)}">${escHtml(t)}</option>`;
    html += '</optgroup>';
  }
  selectEl.innerHTML = html;
}

function buildOptions(selectEl, vals, placeholder = '', selectedVal = null) {
  let html = placeholder ? `<option value="">${escHtml(placeholder)}</option>` : '';
  for (const v of vals) html += `<option value="${escHtml(v)}" ${String(v) === String(selectedVal) ? 'selected' : ''}>${escHtml(v)}</option>`;
  selectEl.innerHTML = html;
}

// ─── Require auth guard ────────────────────────────────────────────────────────
function requireAuth() {
  if (!Auth.isLoggedIn()) { window.location.href = 'login.html'; return false; }
  return true;
}

// ─── URL param helpers ────────────────────────────────────────────────────────
function getParam(name) { return new URLSearchParams(location.search).get(name); }
