// Gera os SVGs animados do README (assets/*.svg). Sem dependências. Node >= 18.
// Uso: GITHUB_TOKEN=... node scripts/generate.mjs   (local: usa `gh auth token` se faltar)
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const USER = process.env.GH_USER || 'Kaaunty';
const CITY = { name: 'Itatiba-SP', lat: -23.0036, lon: -46.8389, tz: 'America/Sao_Paulo' };
const OUT = new URL('../assets/', import.meta.url).pathname;
const FONT = "VT,monospace", FONT2 = "P2P,monospace";
const b64 = f => readFileSync(new URL('./fonts/' + f, import.meta.url)).toString('base64');
const FONTCSS = `@font-face{font-family:VT;src:url(data:font/woff2;base64,${b64('vt.woff2')}) format('woff2')}@font-face{font-family:P2P;src:url(data:font/woff2;base64,${b64('ps2p.woff2')}) format('woff2')}`;
mkdirSync(OUT, { recursive: true });

let token = process.env.GITHUB_TOKEN;
if (!token) { try { token = execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {} }

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const LANG = { 'C#': '#7c4dff', TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#4b8bbe', Shell: '#89e051', HTML: '#e34c26', CSS: '#7e57c2', Go: '#00add8', Java: '#e76f00' };
const langColor = l => LANG[l] || '#8b949e';

async function gql(query) {
  const r = await fetch('https://api.github.com/graphql', { method: 'POST', headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors)); return j.data;
}
const rest = async p => (await fetch('https://api.github.com' + p, { headers: token ? { Authorization: `bearer ${token}` } : {} })).json();

// ---------- dados ----------
const data = await gql(`{ user(login:"${USER}") { name bio location avatarUrl followers{totalCount}
  repositories(ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC, first:30, orderBy:{field:PUSHED_AT,direction:DESC}){ totalCount nodes{ name description stargazerCount primaryLanguage{name} } }
  contributionsCollection{ totalCommitContributions totalPullRequestContributions contributionCalendar{ totalContributions weeks{ contributionDays{ contributionCount date } } } } } }`);
const u = data.user;
const repos = u.repositories.nodes.filter(r => r.name !== USER);
const stars = u.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0);

const days = u.contributionsCollection.contributionCalendar.weeks.flatMap(w => w.contributionDays);
const todayStr = new Date().toISOString().slice(0, 10);
let cur = 0, best = 0, run = 0;
for (const d of days) { if (d.contributionCount > 0) { run++; best = Math.max(best, run); } else run = 0; }
{ // streak atual: conta de trás pra frente (hoje sem commit ainda não quebra)
  let i = days.length - 1; if (days[i].date >= todayStr && days[i].contributionCount === 0) i--;
  while (i >= 0 && days[i].contributionCount > 0) { cur++; i--; }
}
const total = u.contributionsCollection.contributionCalendar.totalContributions;

// commits recentes (eventos públicos)
const events = await rest(`/users/${USER}/events/public?per_page=100`);
let commits = [];
for (const e of Array.isArray(events) ? events : []) if (e.type === 'PushEvent') for (const c of (e.payload.commits || []).slice().reverse()) commits.push(`${e.repo.name.split('/')[1]}: ${c.message.split('\n')[0]}`);
if (commits.length < 6) for (const r of repos.slice(0, 5)) {
  const cs = await rest(`/repos/${USER}/${r.name}/commits?author=${USER}&per_page=4`);
  for (const c of Array.isArray(cs) ? cs : []) { const m = `${r.name}: ${c.commit.message.split('\n')[0]}`; if (!commits.includes(m)) commits.push(m); }
}
commits = commits.slice(0, 10);
if (!commits.length) commits = ['nada por aqui ainda...'];

// linguagens → livros
const langCount = {};
for (const r of u.repositories.nodes) if (r.primaryLanguage) langCount[r.primaryLanguage.name] = (langCount[r.primaryLanguage.name] || 0) + 1;
const langs = Object.entries(langCount).sort((a, b) => b[1] - a[1]).slice(0, 9);

// clima
let wx = { temp: null, code: 0, day: 1 };
try {
  const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${CITY.lat}&longitude=${CITY.lon}&current=temperature_2m,weather_code,is_day&timezone=${CITY.tz}`)).json();
  wx = { temp: w.current.temperature_2m, code: w.current.weather_code, day: w.current.is_day };
} catch {}
const rainy = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(wx.code);
const cloudy = wx.code >= 2 || rainy;
const sky = !wx.day ? '#0f1538' : rainy ? '#6f8197' : cloudy ? '#8fb4d8' : '#7ec8ff';

// avatar embutido
let avatar = '';
try { const b = Buffer.from(await (await fetch(u.avatarUrl + '&s=64')).arrayBuffer()); avatar = `data:image/png;base64,${b.toString('base64')}`; } catch {}

// ---------- HERO (grade 140x72, escala 5 => 700x360) ----------
const R = (x, y, w, h, f, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" ${extra}/>`;
const now = new Date(new Date().toLocaleString('en-US', { timeZone: CITY.tz }));
const hAng = ((now.getHours() % 12) + now.getMinutes() / 60) * 30, mAng = now.getMinutes() * 6;
const LH = 2.9, scrollH = commits.length * LH;
const lines = commits.map((c, i) => `<text x="0" y="${(i * LH + 2.4).toFixed(1)}">${esc(cut(c, 27))}</text>`).join('');
const books = langs.slice(0, 5).map(([l], i) => R(110 + i * 4, 30 - (6 + (i * 5) % 4), 3, 6 + (i * 5) % 4, langColor(l))).join('');
const books2 = langs.slice(5, 9).map(([l], i) => R(112 + i * 4, 41 - (5 + (i * 3) % 3), 3, 5 + (i * 3) % 3, langColor(l))).join('');
const stars_ = !wx.day ? Array.from({ length: 6 }, (_, i) => R(10 + (i * 7) % 32, 12 + (i * 5) % 10, 1, 1, '#fff', `class="tw" style="animation-delay:${i * .5}s"`)).join('') : '';
const sun = wx.day ? (cloudy ? '' : R(33, 13, 6, 6, '#ffd84a', 'class="sun"') + R(32, 14, 8, 4, '#ffd84a', 'class="sun"')) : R(33, 13, 5, 5, '#e8ecff') + R(35, 13, 3, 3, sky);
const rain = rainy ? Array.from({ length: 8 }, (_, i) => R(10 + i * 4, 11, 0.6, 3, '#cfe6ff', `class="rain" style="animation-delay:${(i * .17).toFixed(2)}s"`)).join('') : '';
const wxLabel = `${wx.temp != null ? Math.round(wx.temp) + '°C' : ''} ${rainy ? 'chuva' : cloudy ? 'nublado' : wx.day ? 'sol' : 'noite'}`.trim();

// plush do Gengar (pixel art, contorno automatico) sentado na estante
const gengar = (() => {
  const G = ['.p.....p.', '.pp...pp.', '.ppppppp.', 'pdepppepd', 'ppppppppp', 'pwpwpwpwp', '.ppppppp.', '.pp...pp.'];
  const C = { p: '#7a4bd0', d: '#5a2fa0', e: '#ff3355', w: '#ffffff', K: '#161026' };
  const H = G.length, W = G[0].length, at = (x, y) => (y < 0 || x < 0 || y >= H || x >= W ? '.' : G[y][x]);
  let o = '';
  for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
    let c = at(x, y);
    if (c === '.') c = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(n => n !== '.') ? 'K' : '.';
    if (c !== '.') o += `<rect x="${x}" y="${y}" width="1.03" height="1.03" fill="${C[c]}"/>`;
  }
  return `<g transform="translate(128.5,33.6) scale(.85)"><g class="plush">${o}</g></g>`;
})();
// rayquaza voando: corpo em ondas (segmentos animados) + cabeca em sprite (antenas, olho vermelho, garras vermelhas)
const rq = (() => {
  const HEAD = [
    'gl........',
    '.gl.ggg...',
    '..ggggyg..',
    'rrgggrgyy.',
    'rrdggggyy.',
    '..ddgggg..',
  ];
  const COL = { g: '#2fb83a', l: '#a6f07a', d: '#1a7a2c', y: '#f5d142', r: '#d8452a', K: '#101a10' };
  const H = HEAD.length, W = HEAD[0].length;
  const at = (x, y) => (y < 0 || x < 0 || y >= H || x >= W ? '.' : HEAD[y][x]);
  const px = (x, y) => { let c = at(x, y); if (c === '.') c = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(n => n !== '.') ? 'K' : '.'; return c; };
  let head = '';
  for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) { const c = px(x, y); if (c !== '.') head += `<rect x="${x}" y="${y}" width="1.03" height="1.03" fill="${COL[c]}"/>`; }
  const N = 30, SEG = 0.5;
  let outl = '', fill = '';
  for (let i = 0; i < N; i++) {
    const h = 0.9 + i * 0.042, x = i * SEG, y = -h / 2, d = `style="animation-delay:${(-i * 0.053).toFixed(3)}s"`;
    const ring = i % 7 === 5, tail = i < 4;
    outl += `<rect class="rs" ${d} x="${x - .05}" y="${y - .4}" width="${SEG + .1}" height="${h + .8}" fill="#101a10"/>`;
    fill += `<g class="rs" ${d}><rect x="${x}" y="${y}" width="${SEG + .06}" height="${h}" fill="${tail ? '#d8452a' : '#2fb83a'}"/><rect x="${x}" y="${y + h * .65}" width="${SEG + .06}" height="${h * .35}" fill="${tail ? '#a02a18' : '#1a7a2c'}"/>${ring ? `<rect x="${x - .05}" y="${y - .1}" width="${SEG + .15}" height="${h + .2}" fill="#f5d142"/>` : ''}</g>`;
  }
  const body = outl + fill;
  const hx = N * SEG - 0.8;
  const headG = `<g class="rs" style="animation-delay:${(-N * 0.053).toFixed(3)}s"><g transform="translate(${hx.toFixed(1)},-2.3) scale(.72)">${head}</g></g>`;
  return `<g transform="translate(6,19)"><g class="ray">${body}${headG}</g></g>`;
})();
const hero = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 72" width="700" height="360" shape-rendering="crispEdges" font-family="${FONT}">
<style>
${FONTCSS}
.cloud{animation:drift 14s linear infinite}@keyframes drift{from{transform:translateX(-14px)}to{transform:translateX(40px)}}
.sun{animation:pulse 3s ease-in-out infinite}@keyframes pulse{50%{opacity:.7}}
.tw{animation:tw 2s ease-in-out infinite}@keyframes tw{50%{opacity:.15}}
.rain{animation:fall .6s linear infinite}@keyframes fall{from{transform:translateY(0);opacity:1}to{transform:translateY(22px);opacity:0}}
.scroll{animation:sc ${Math.max(6, commits.length * 1.6)}s linear infinite}@keyframes sc{to{transform:translateY(-${scrollH}px)}}
.cur{animation:bl 1s steps(1) infinite}@keyframes bl{50%{opacity:0}}
.hand{transform-box:view-box;transform-origin:118px 12px}.m{animation:spin 60s linear infinite}.h{animation:spin 720s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.steam{animation:st 2.4s ease-in infinite}@keyframes st{from{transform:translateY(0);opacity:.8}to{transform:translateY(-6px);opacity:0}}
.plant{transform-box:fill-box;transform-origin:50% 100%;animation:sw 4s ease-in-out infinite}@keyframes sw{50%{transform:rotate(3deg)}}
.cat{transform-box:fill-box;transform-origin:50% 100%;animation:br 4s ease-in-out infinite}@keyframes br{50%{transform:scaleY(1.08)}}
.tail{transform-box:fill-box;transform-origin:100% 50%;animation:tl 4s ease-in-out infinite}@keyframes tl{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(6deg)}}
.z{font-family:P2P,monospace;fill:#cfe0ff;opacity:0;animation:zz 3.6s ease-in infinite}@keyframes zz{0%{transform:translate(0,0);opacity:0}15%{opacity:.95}100%{transform:translate(5px,-12px);opacity:0}}
.ray{animation:fly 9s linear infinite}@keyframes fly{from{transform:translateX(-24px)}to{transform:translateX(40px)}}
.rs{animation:wv 1.5s ease-in-out infinite}@keyframes wv{0%,100%{transform:translateY(-2.2px)}50%{transform:translateY(2.2px)}}
.rib{transform-box:fill-box;transform-origin:100% 50%;animation:rb .8s ease-in-out infinite}@keyframes rb{50%{transform:rotate(14deg)}}
.plush{transform-box:fill-box;transform-origin:50% 100%;animation:ps 3.5s ease-in-out infinite}@keyframes ps{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}
.glow{animation:gl 5s ease-in-out infinite}@keyframes gl{50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<defs><clipPath id="win"><rect x="10" y="12" width="32" height="24"/></clipPath><clipPath id="scr"><rect x="58" y="29" width="36" height="13"/></clipPath></defs>
${R(0, 0, 140, 72, '#161b2e')}
${Array.from({ length: 18 }, (_, i) => R(i * 8, 0, 3, 58, '#1b2138')).join('')}
${R(0, 58, 140, 14, '#5a3a24')}${R(0, 58, 140, 1, '#7a5233')}
${Array.from({ length: 7 }, (_, i) => R(0, 61 + i * 2, 140, 0.4, '#3f2616')).join('')}
<!-- janela -->
${R(7, 9, 38, 30, '#10131f')}${R(10, 12, 32, 24, sky)}
<g clip-path="url(#win)">${stars_}${sun}${rain}
<g class="cloud" ${cloudy ? '' : ''}>${R(12, 16, 9, 2, '#fff')}${R(14, 14, 5, 2, '#fff')}${R(25, 24, 7, 2, '#fff', 'opacity=".9"')}${R(27, 22, 3, 2, '#fff', 'opacity=".9"')}</g>${rq}</g>
${R(25, 12, 1, 24, '#10131f')}${R(10, 23, 32, 1, '#10131f')}${R(5, 39, 42, 2, '#4a3524')}
<text x="26" y="7.6" font-size="3.3" fill="#9aa6c8" text-anchor="middle">${esc(CITY.name)} · ${esc(wxLabel)}</text>
<!-- placa -->
${R(46, 3, 48, 10, '#0e0e14')}${R(47, 4, 46, 8, '#f3e7c9')}
<text x="70" y="9.9" font-family="${FONT2}" font-size="3.6" text-anchor="middle" fill="#1b1b22">KAUÃ FREITAS</text>
<!-- relógio -->
<circle cx="118" cy="12" r="6" fill="#0e0e14"/><circle cx="118" cy="12" r="5" fill="#f3e7c9"/>
<g stroke="#1b1b22" stroke-linecap="round"><line class="hand h" x1="118" y1="12" x2="118" y2="9" stroke-width=".9" style="transform:rotate(${hAng}deg)"/>
<line class="hand m" x1="118" y1="12" x2="118" y2="8" stroke-width=".6" style="transform:rotate(${mAng}deg)"/></g>
<!-- luz da lâmpada -->
<polygon class="glow" points="50,29 36,58 62,58 56,29" fill="#ffe27a" opacity=".12"/>
<!-- estantes -->
${R(108, 30, 30, 1.5, '#5a3a24')}${R(108, 41, 30, 1.5, '#5a3a24')}${books}${books2}${gengar}
<!-- monitor -->
${R(55, 22, 42, 24, '#2b3040')}${R(57, 24, 38, 20, '#0a1716')}${R(72, 46, 8, 3, '#222633')}
<text x="58.5" y="27.6" font-size="3.2" fill="#a6f7c8">$ git log --oneline</text>
<g clip-path="url(#scr)"><g transform="translate(58.5,29.2)" fill="#6ee7a0" font-size="3.2"><g class="scroll">${lines}<g transform="translate(0,${scrollH})">${lines}</g></g></g></g>
${R(84.2, 25.6, 1.3, 2, '#a6f7c8', 'class="cur"')}
<!-- mesa -->
${R(50, 49, 62, 2, '#8a5a2f')}${R(50, 51, 62, .6, '#5f3d1f')}${R(52, 51, 2, 7, '#6e4624')}${R(108, 51, 2, 7, '#6e4624')}
${R(64, 47.5, 18, 1.5, '#3b4152')}
<!-- lâmpada -->
${R(48, 47, 5, 2, '#2b3040')}${R(50, 33, 1, 14, '#2b3040')}${R(46, 31, 8, 3, '#ffd84a')}
<!-- caneca -->
${R(98, 45, 5, 4, '#f0f0f0')}${R(103, 46, 1.5, 2, '#f0f0f0')}
<g fill="#fff"><rect class="steam" x="99.5" y="43" width="1" height="2"/><rect class="steam" x="101.5" y="43" width="1" height="2" style="animation-delay:1.1s"/></g>
<!-- cadeira -->
${R(83, 52, 12, 2, '#2b3040')}${R(88, 54, 2, 4, '#2b3040')}${R(85, 58, 8, 1, '#2b3040')}
<!-- planta -->
<g class="plant">${R(16, 38, 1, 13, '#2f8f4a')}${R(11, 40, 5, 2, '#3fae5c')}${R(17, 44, 6, 2, '#3fae5c')}${R(12, 47, 4, 2, '#3fae5c')}${R(15, 36, 4, 2, '#3fae5c')}</g>
${R(12, 51, 9, 7, '#a0573a')}${R(11, 51, 11, 1.5, '#b8694a')}
<!-- gato -->
<g class="cat">${R(112, 54, 14, 4, '#e8933a')}${R(124, 52, 5, 6, '#e8933a')}${R(124, 50.5, 1.5, 2, '#e8933a')}${R(127.5, 50.5, 1.5, 2, '#e8933a')}${R(126, 54.4, 2, .6, '#4a2a10')}${R(114, 55.2, 8, .7, '#c97520')}</g>
<g class="tail">${R(106, 56, 7, 2, '#e8933a')}</g>
<g><text class="z" x="128" y="49" font-size="2.6">Z</text><text class="z" x="128" y="49" font-size="3.4" style="animation-delay:1.2s">Z</text><text class="z" x="128" y="49" font-size="4.4" style="animation-delay:2.4s">Z</text></g>
<text x="138" y="70.5" font-size="3" fill="#c9a07a" text-anchor="end" opacity=".7">@${esc(USER)}</text>
</svg>`;
writeFileSync(OUT + 'hero.svg', hero);

// ---------- cards ----------
const CARD = (w, h, body, extraStyle = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="${FONT}">
<style>${FONTCSS}.bl{animation:bl 1s steps(1) infinite}@keyframes bl{50%{opacity:0}}.fi{opacity:0;animation:fi .5s ease forwards}@keyframes fi{to{opacity:1}}${extraStyle}@media (prefers-reduced-motion:reduce){*{animation:none!important;opacity:1!important}}</style>
<rect width="${w}" height="${h}" rx="10" fill="#0d1117"/>
${body}</svg>`;
const card = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#111821" stroke="#1f2a37"/>`;

// about
{
  const name = esc(u.name || USER);
  const body = `${card(.5, .5, 699, 159)}
<text x="34" y="44" font-family="${FONT2}" font-size="12" fill="#3ddc84"><tspan class="bl">&gt;</tspan> ABOUT</text>
<text x="34" y="84" font-family="${FONT2}" font-size="20" fill="#f0f6fc">${name}</text>
<text x="34" y="110" font-size="22" fill="#c4ccd6">${esc(u.bio || '')}</text>
<text x="34" y="134" font-size="18" fill="#6b7787">${esc(u.location || '')} · ${u.followers.totalCount} followers · ${u.repositories.totalCount} repositories · * ${stars} stars</text>
${avatar ? `<rect x="570" y="22" width="108" height="108" fill="#fff"/><image href="${avatar}" x="574" y="26" width="100" height="100" style="image-rendering:pixelated"/>` : ''}`;
  writeFileSync(OUT + 'about.svg', CARD(700, 160, body));
}

// stats
{
  const cc = u.contributionsCollection;
  const items = [[cc.totalCommitContributions, 'COMMITS'], [cc.totalPullRequestContributions, 'PULL REQS'], [stars, 'STARS'], [best + 'D', 'BEST STREAK']];
  const cols = items.map(([v, l], i) => `<g class="fi" style="animation-delay:${i * .1}s"><text x="${30 + i * 160}" y="50" font-size="46" fill="#f0f6fc">${esc(v)}</text><text x="${30 + i * 160}" y="76" font-size="17" fill="#6b7787" letter-spacing="1">${l}</text></g>`).join('');
  writeFileSync(OUT + 'stats.svg', CARD(700, 96, `${card(.5, .5, 699, 95)}${cols}`));
}

// projects
{
  const list = repos.slice(0, 6);
  const rows = Math.ceil(list.length / 2), H = 70 + rows * 118;
  const icon = (name, color) => {
    let h = 2166136261; for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    let s = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { h = Math.imul(h, 1103515245) + 12345 >>> 0; if ((h >> 16) & 1) { s += `<rect x="${x * 8}" y="${y * 8}" width="8" height="8"/><rect x="${(7 - x) * 8}" y="${y * 8}" width="8" height="8"/>`; } }
    return `<rect width="64" height="64" fill="${color}" opacity=".18"/><g fill="${color}">${s}</g>`;
  };
  const cells = list.map((r, i) => {
    const x = 30 + (i % 2) * 320, y = 62 + Math.floor(i / 2) * 118, c = langColor(r.primaryLanguage?.name);
    return `<g class="fi" style="animation-delay:${i * .12}s">${card(x, y, 310, 106)}
<g transform="translate(${x + 12},${y + 12})">${icon(r.name, c)}</g>
<text x="${x + 90}" y="${y + 32}" font-family="${FONT2}" font-size="11" fill="#f0f6fc">${esc(cut(r.name, 17))}</text>
<text x="${x + 90}" y="${y + 52}" font-size="17" fill="#8b98a8">${esc(cut(r.description || 'A project in progress.', 30))}</text>
<text x="${x + 90}" y="${y + 90}" font-size="20" fill="#3ddc84">* ${r.stargazerCount}</text>
<circle cx="${x + 205}" cy="${y + 86}" r="4" fill="${c}"/><text x="${x + 216}" y="${y + 90}" font-size="17" fill="#8b98a8">${esc(r.primaryLanguage?.name || '—')}</text></g>`;
  }).join('');
  writeFileSync(OUT + 'projects.svg', CARD(700, H, `<text x="30" y="40" font-family="${FONT2}" font-size="16" fill="#3ddc84"><tspan class="bl">&gt;</tspan> PROJECTS</text><line x1="205" y1="34" x2="670" y2="34" stroke="#1f2a37" stroke-dasharray="3 3"/>${cells}`));
}

// activity
{
  const weeks = u.contributionsCollection.contributionCalendar.weeks.slice(-30);
  const max = Math.max(1, ...weeks.flatMap(w => w.contributionDays.map(d => d.contributionCount)));
  const col = n => n === 0 ? '#151c26' : n < max * .25 ? '#0e4429' : n < max * .5 ? '#006d32' : n < max * .75 ? '#26a641' : '#39d353';
  const cells = weeks.map((w, wi) => w.contributionDays.map((d, di) => `<rect class="fi" style="animation-delay:${(wi * .04).toFixed(2)}s" x="${34 + wi * 14}" y="${62 + di * 14}" width="11" height="11" rx="2" fill="${col(d.contributionCount)}"><title>${d.date}: ${d.contributionCount}</title></rect>`).join('')).join('');
  const stat = (y, l, v) => `<text x="500" y="${y}" font-size="17" fill="#6b7787">${l}</text><text x="500" y="${y + 24}" font-family="${FONT2}" font-size="15" fill="#f0f6fc">${v}</text>`;
  writeFileSync(OUT + 'activity.svg', CARD(700, 190, `<text x="34" y="40" font-family="${FONT2}" font-size="12" fill="#3ddc84"><tspan class="bl">&gt;</tspan> ACTIVITY</text>${cells}${stat(66, 'CURRENT STREAK', cur + ' days')}${stat(110, 'BEST STREAK', best + ' days')}${stat(154, 'THIS YEAR', total)}`));
}
console.log('ok:', { commits: commits.length, langs: langs.map(l => l[0]), wx, cur, best, total });
