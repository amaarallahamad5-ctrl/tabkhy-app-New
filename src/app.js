(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const KEY = 'bayti_v1';          // user data (kept from v1 so nothing is lost)
const CKEY = 'bayti_content';    // cached remote content
const APP_VERSION = CONTENT_DEFAULT.version;
const NATIVE = typeof window.BaytiAndroid === 'object' && !!window.BaytiAndroid; // running inside the Android APK

/* ---------- content (built-in, overridable by content.json on GitHub) ---------- */
let C = CONTENT_DEFAULT;
try { const cc = JSON.parse(localStorage.getItem(CKEY)); if (cc && cc.rev > C.rev) C = Object.assign({}, CONTENT_DEFAULT, cc); } catch(e){}
let PANTRY_ALL = [];
function indexContent(){ PANTRY_ALL = C.pantry.flatMap(g=>g.items); }
indexContent();

const MEALS_NORMAL = [
  {k:'b',n:'الفطور',e:'🥐',bg:'var(--peach-l)'},
  {k:'l',n:'الغداء',e:'🍲',bg:'var(--sage-l)'},
  {k:'d',n:'العشاء',e:'🥗',bg:'var(--lav-l)'}
];
const MEALS_RAMADAN = [
  {k:'l',n:'الإفطار',e:'🌅',bg:'var(--peach-l)'},
  {k:'d',n:'بعد التراويح',e:'🍵',bg:'var(--lav-l)'},
  {k:'b',n:'السحور',e:'🌙',bg:'var(--sky-l)'}
];
let MEALS = MEALS_NORMAL;
const MCOLORS = ['#6F9C82','#8B7FC0','#D98E6A','#6E9FBF','#CC7F92','#B8963A','#5E8C8C','#9C6FA8'];
const CATS = [
  {k:'g',n:'بقالة',e:'🛒'},{k:'f',n:'خضار وفاكهة',e:'🥕'},{k:'m',n:'لحوم ودواجن',e:'🍗'},{k:'b',n:'فواتير',e:'💡'},
  {k:'h',n:'منظفات',e:'🧴'},{k:'t',n:'مواصلات',e:'🚌'},{k:'k',n:'أطفال',e:'🧸'},{k:'p',n:'صحة',e:'💊'},
  {k:'r',n:'أكل خارج البيت',e:'🍔'},{k:'c',n:'ملابس',e:'👕'},{k:'e',n:'تعليم ومدارس',e:'🎓'},{k:'s',n:'سكن وإيجار',e:'🏠'},{k:'i',n:'أقساط وديون',e:'💳'},{k:'z',n:'هدايا ومناسبات',e:'🎁'},{k:'o',n:'أخرى',e:'✨'}
];
const CURS = ['ج.م','ر.س','د.إ','د.ك','د.أ','ر.ق','$','€'];
const WD = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const WD_ORDER = [6,0,1,2,3,4,5];

/* ---------- state ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch(e){ return null; } };
const fresh = () => ({
  tasks: C.defaultTasks.map(t=>({id:uid(), e:t.e, n:t.n, f:t.f})), done:{}, meals:{}, miss:{},
  pantry:['أرز','مكرونة','عدس','فول','بيض','خبز','جبن','طماطم','بصل','بطاطس','ثوم','صلصة طماطم','حليب','شوفان'],
  shop:[], exp:{}, cur:'ج.م', limit:0, seen:false, affShift:0, affDay:'', ver:'',
  name:'', members:[], onboarded:false, theme:'auto', ramadan:false, fav:[], myRecipes:[],
  bills:[], goals:[], monthBudget:0, ach:{}, cnt:{}, hist:{}, best:0,
  fixed:{}, timers:[], cl:{}, myCl:[], notes:[], expiry:[], contacts:[], cooked:[]
});
const HAD_DATA = !!load();
let S = Object.assign(fresh(), load() || {});
S.tasks.forEach(t=>{ if(!t.f) t.f={t:'d'}; });          // migrate v1 tasks
if (!Array.isArray(S.shop)) S.shop = [];
(function migrate(){
  const raw = load() || {};
  if (HAD_DATA && raw.onboarded === undefined) S.onboarded = true;          // existing users skip the setup wizard
  if (HAD_DATA && !raw.cnt) S.cnt = {tasks: Object.values(S.done||{}).reduce((a,l)=>a+l.length,0)};
  // v4: paid bills were saved as today's spending -> move them to the month's fixed expenses
  if (HAD_DATA && !raw.fixed){
    Object.keys(S.exp||{}).forEach(k=>{ const keep = []; (S.exp[k]||[]).forEach(x=>{ if (x.bill){ const m = k.slice(0,7); (S.fixed[m] = S.fixed[m]||[]).push(x); } else keep.push(x); }); if (keep.length) S.exp[k] = keep; else delete S.exp[k]; });
  }
  // v4.1: every expense must have an id and a clean numeric amount
  [S.exp, S.fixed].forEach(box=>Object.keys(box||{}).forEach(k=>{ const L = (Array.isArray(box[k]) ? box[k] : []).filter(x=>x && isFinite(+x.a) && +x.a>0);
    L.forEach(x=>{ x.a = Math.round(+x.a*100)/100; if (!x.id) x.id = Date.now().toString(36)+Math.random().toString(36).slice(2,7); if (!x.t) x.t = Date.now(); if (!x.c) x.c = 'o'; });
    if (L.length) box[k] = L; else delete box[k]; }));
  // tidy: one-time tasks that ended more than 60 days ago
  const cut = new Date(); cut.setDate(cut.getDate()-60); const ck = `${cut.getFullYear()}-${String(cut.getMonth()+1).padStart(2,'0')}-${String(cut.getDate()).padStart(2,'0')}`;
  S.tasks = S.tasks.filter(t=>!(t.f && t.f.t==='o' && t.f.k < ck));
})();
MEALS = S.ramadan ? MEALS_RAMADAN : MEALS_NORMAL;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){ toast('تعذر الحفظ — الذاكرة ممتلئة'); } };

/* ---------- helpers ---------- */
const pad = n => String(n).padStart(2,'0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => keyOf(new Date());
const fromKey = k => { const [y,m,d] = k.split('-').map(Number); return new Date(y,m-1,d); };
const addDays = (k,n) => { const d = fromKey(k); d.setDate(d.getDate()+n); return keyOf(d); };
const ar = n => Number(n).toLocaleString('ar-EG',{maximumFractionDigits:2});
const money = n => `${ar(n)} ${S.cur}`;
const r2 = n => Math.round((+n||0)*100)/100;
const BIG_AMT = 20000;
/* "1,500" -> 1500, "١٢٫٥" -> 12.5, "250+80" -> 330, "3×25" -> 75. Returns NaN when not a valid number. */
function parseAmount(raw){
  let s = String(raw==null?'':raw).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  s = s.replace(/(ج\.?\s?م|جنيه|ريال|درهم|دينار|ر\.س|د\.إ|د\.ك|د\.أ|ر\.ق|EGP|SAR|AED|\$|€)/gi,'');
  s = s.replace(/[\s\u00A0\u200e\u200f\u061c]/g,'').replace(/[٬']/g,'').replace(/٫/g,'.').replace(/،/g,',').replace(/[×xX]/g,'*').replace(/÷/g,'/').replace(/[−–—]/g,'-');
  s = s.replace(/\d[\d,.]*/g, t => {
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return t.replace(/,/g,'');      // 1,500 / 12,500.75
    if (/^\d{1,3}(\.\d{3}){2,}$/.test(t)) return t.replace(/\./g,'');          // 1.250.000
    if (/^\d+,\d{1,2}$/.test(t)) return t.replace(',','.');                    // 12,5
    return t.replace(/,/g,'');
  });
  if (!s || !/^[\d.+\-*/()]+$/.test(s)) return NaN;
  let i = 0;
  const factor = () => { if (s[i]==='-'){ i++; return -factor(); } if (s[i]==='+'){ i++; return factor(); }
    if (s[i]==='('){ i++; const v = expr(); if (s[i]!==')') throw 0; i++; return v; }
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; return parseFloat(m[0]); };
  const term = () => { let v = factor(); while (s[i]==='*'||s[i]==='/'){ const o = s[i++], w = factor(); v = o==='*' ? v*w : v/w; } return v; };
  const expr = () => { let v = term(); while (s[i]==='+'||s[i]==='-'){ const o = s[i++], w = term(); v = o==='+' ? v+w : v-w; } return v; };
  try { const v = expr(); return (i===s.length && isFinite(v)) ? r2(v) : NaN; } catch(e){ return NaN; }
}
const toEn = s => String(s).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٫,،]/g,'.');
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayName = d => WD[d.getDay()];
const dateStr = d => d.toLocaleDateString('ar-EG',{day:'numeric',month:'long'});
const relDay = k => { const n = Math.round((fromKey(k)-fromKey(today()))/864e5); return n===0?'اليوم':n===1?'غداً':n===-1?'أمس':n===2?'بعد غد':dayName(fromKey(k)); };
const plural = (n, one, two, few, many) => n===1?one: n===2?two: n<=10?`${ar(n)} ${few}`:`${ar(n)} ${many}`;
const rand = a => a[Math.floor(Math.random()*a.length)];
const buzz = ms => { try { if (NATIVE) BaytiAndroid.haptic(Array.isArray(ms) || ms >= 12 ? 1 : 0); else if (!navigator.userActivation || navigator.userActivation.hasBeenActive) navigator.vibrate && navigator.vibrate(ms); } catch(e){} };
const doy = d => Math.floor((d - new Date(d.getFullYear(),0,0))/864e5);
let toastT;
const toast = (msg, action) => {
  const t=$('#toast'); t.innerHTML='';
  const sp=document.createElement('span'); sp.textContent=msg; t.appendChild(sp);
  if (action){ const b=document.createElement('button'); b.className='toast-act'; b.textContent=action.label; b.onclick=()=>{ t.classList.remove('show'); action.fn(); }; t.appendChild(b); }
  t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'), action?4500:2300);
};
const undoable = (msg, mutate) => {
  const snap = JSON.stringify(S); mutate(); save(); render();
  toast(msg, {label:'تراجع', fn:()=>{ S = JSON.parse(snap); save(); render(); toast('تم التراجع ↩️'); }});
};
const cnt = k => (S.cnt||{})[k]||0;
const inc = (k,n=1) => { S.cnt = S.cnt||{}; S.cnt[k] = Math.max(0,(S.cnt[k]||0)+n); };
const member = id => S.members.find(m=>m.id===id);
const avatar = (m, size=24) => m ? `<span class="av" style="background:${m.c};width:${size}px;height:${size}px;font-size:${Math.round(size*.5)}px">${esc((m.n.trim()[0])||'؟')}</span>` : '';
const CHECK_SVG = '<span class="chk"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
const X_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

/* ---------- navigation ---------- */
let tab = 'home';
function go(t){
  tab = t;
  $$('.view').forEach(v=>v.classList.toggle('active', v.id==='v-'+t));
  $$('.nav button').forEach(b=>b.classList.toggle('on', b.dataset.tab===t));
  window.scrollTo(0,0);
  render();
}
$$('.nav button').forEach(b=>b.onclick=()=>{ go(b.dataset.tab); buzz(8); });
$$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));

/* ---------- tasks logic ---------- */
function isDue(t, k){
  const d = fromKey(k), f = t.f || {t:'d'};
  if (f.t==='w') return (f.d||[]).includes(d.getDay());
  if (f.t==='m'){ const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); return d.getDate()===Math.min(f.d||1, last); }
  if (f.t==='o') return f.k===k;
  if (f.t==='y') return d.getMonth()+1===f.m && d.getDate()===f.d;
  return true;
}
function freqLabel(f){
  if (!f || f.t==='d') return 'يومياً';
  if (f.t==='w') return 'كل ' + WD_ORDER.filter(i=>(f.d||[]).includes(i)).map(i=>WD[i]).join(' و');
  if (f.t==='o') return `📅 ${relDayFull(f.k)}`;
  if (f.t==='y') return `🎂 كل سنة ${new Date(2024, f.m-1, f.d).toLocaleDateString('ar-EG',{day:'numeric',month:'long'})}`;
  return `شهرياً يوم ${ar(f.d)}`;
}
function relDayFull(k){ const r = relDay(k); const d = fromKey(k); return /^(اليوم|غداً|أمس|بعد غد)$/.test(r) ? r : `${dayName(d)} ${dateStr(d)}`; }
const fmtTime = t => { if (!t) return ''; const [h,m] = t.split(':').map(Number); const d = new Date(2024,0,1,h,m); return d.toLocaleTimeString('ar-EG',{hour:'numeric',minute:'2-digit'}); };
const byTime = (a,b) => (a.tm||'99') < (b.tm||'99') ? -1 : (a.tm||'99') > (b.tm||'99') ? 1 : 0;
function taskStats(k = today()){
  const ids = new Set(S.done[k]||[]); const due = S.tasks.filter(t=>isDue(t,k));
  return {due, ids, done: due.filter(t=>ids.has(t.id)).length, total: due.length};
}
function upcoming(days = 6){
  const out = [];
  for (let i=1;i<=days;i++){ const k = addDays(today(), i); S.tasks.filter(t=>t.f && t.f.t!=='d' && isDue(t,k)).forEach(t=>out.push({t,k})); }
  return out;
}

/* ---------- HOME ---------- */
function affIndex(){
  const t = today();
  if (S.affDay !== t){ S.affDay = t; S.affShift = 0; save(); }
  return (doy(fromKey(t)) + S.affShift) % C.affirmations.length;
}
function renderHome(){
  const h = new Date().getHours();
  const nm = S.name ? ` يا ${S.name}` : '';
  $('#greet').textContent = (h<12?'صباح الخير':h<18?'نهارك سعيد':'مساء الخير') + nm + (h<12?' ☀️':h<18?' 🌤️':' 🌙');
  $('#affLbl').textContent = S.ramadan ? '🌙 رمضان كريم' : '✨ رسالة اليوم';
  renderBillBanner(); updateHist();
  const st = streak(); $('#hStreak').textContent = `${ar(st)} ${st===1?'يوم':st===2?'يومان':st<=10?'أيام':'يوماً'}`;
  $('#hFire').textContent = st>=7?'🔥':st>=1?'✨':'🌱';
  $('#hStreakS').textContent = st ? `سلسلة الإنجاز — أفضل سلسلة: ${ar(Math.max(S.best,st))}` : 'أنجز كل مهام اليوم لتبدأ سلسلتك';
  $('#hAch').textContent = `🏅 ${ar(Object.keys(S.ach).length)}/${ar(ACH.length)}`;
  $('#affText').textContent = C.affirmations[affIndex()];
  const d = new Date(); $('#todayLbl').textContent = `${dayName(d)}، ${dateStr(d)}`;
  const {done,total} = taskStats();
  $('#hTasks').textContent = `${ar(done)}/${ar(total)}`;
  $('#hTasksS').textContent = total && done===total ? 'أنجزت كل شيء! 🎉' : done ? 'استمر، أنت رائع' : 'ابدأ يومك بخطوة صغيرة';
  $('#ring').style.strokeDashoffset = 163.4 * (1 - (total? done/total : 0));
  const list = S.exp[today()]||[]; const sum = daySum(today());
  $('#hSpend').textContent = money(sum);
  $('#hSpendS').textContent = list.length ? plural(list.length,'عملية واحدة','عمليتان','عمليات','عملية') : 'لا مصاريف اليوم';
  $('#hSpendM').textContent = `الشهر: ${money(monthTotal(ym()))}`;
  renderHomeV4(); renderHomeV42();
  const m = S.meals[today()]||{};
  $('#hMeals').innerHTML = MEALS.map(x=>`<div>${x.e} <span style="opacity:.7">${x.n}:</span> ${m[x.k]?esc(m[x.k]):'<span style="opacity:.5">لم تُحدد بعد</span>'}</div>`).join('');
  const left = S.shop.filter(i=>!i.done).length;
  $('#hShop').textContent = ar(left);
  $('#hShopS').textContent = left ? 'صنف للشراء' : 'القائمة فارغة';
  const up = upcoming(7)[0];
  $('#hNext').textContent = up ? `${up.t.e} ${up.t.n}` : 'لا شيء قريب';
  $('#hNextS').textContent = up ? relDay(up.k) : 'استمتع بوقتك ☕';
  const tip = C.tips[(doy(new Date())) % C.tips.length];
  $('#tipE').textContent = tip.e; $('#tipText').textContent = tip.t;
  $('#tipNo').textContent = `${ar((doy(new Date()) % C.tips.length)+1)} من ${ar(C.tips.length)}`;
}
$('#affNext').onclick = () => {
  const p = $('#affText'); p.style.opacity = 0;
  setTimeout(()=>{ S.affShift = (S.affShift+1)%C.affirmations.length; save(); p.textContent = C.affirmations[affIndex()]; p.style.opacity = 1; },250);
  buzz(8);
};

/* ---------- TASKS ---------- */
let seg = 'today', newFreq = 'd', newWd = [new Date().getDay()], whoFilter = 'all', newWho = '';
function renderTasks(){
  $$('#taskSeg button').forEach(b=>b.classList.toggle('on', b.dataset.seg===seg));
  $('#tasksToday').hidden = seg!=='today'; $('#tasksAll').hidden = seg!=='all'; $('#tasksCal').hidden = seg!=='cal';
  $('#addTaskForm').hidden = seg==='cal'; $('#libBtn2').hidden = seg==='cal';
  seg==='today' ? renderToday() : seg==='cal' ? renderCal() : renderAll();
  renderFreq();
}
function taskRow(t, done, opt = {}){
  return `<div class="task ${done?'done':''} ${opt.future?'future':''}" data-id="${t.id}" role="checkbox" aria-checked="${done}" tabindex="0">
    ${CHECK_SVG}
    <span class="meta"><span class="name">${t.tm?`<span class="tm">⏰ ${fmtTime(t.tm)}</span>`:''}<s>${esc(t.n)}</s></span>${(t.f && t.f.t!=='d') || member(t.who) ?`<small>${t.f && t.f.t!=='d'?`<span class="freq ${t.f.t}">${freqLabel(t.f)}</span> `:''}${member(t.who)?`<span class="who">${avatar(member(t.who),18)} ${esc(member(t.who).n)}</span>`:''}</small>`:''}</span>
    <span class="emo">${t.e}</span>${opt.del?`<button class="x2" data-tdel="${t.id}" aria-label="حذف">${X_SVG}</button>`:''}</div>`;
}
function renderToday(){
  const {due,done,total,ids} = taskStats();
  $('#tasksDate').textContent = `${dayName(new Date())}، ${dateStr(new Date())}`;
  const pct = total? Math.round(done/total*100):0;
  $('#tBar').style.width = pct+'%'; $('#tPct').textContent = ar(pct)+'٪';
  updateHist();
  const mf = $('#memberFilter'); mf.hidden = !S.members.length;
  if (S.members.length){
    if (whoFilter!=='all' && whoFilter!=='' && !member(whoFilter)) whoFilter='all';
    const c = w => due.filter(t=>w==='all' || (t.who||'')===w).length;
    mf.innerHTML = `<button class="mini ${whoFilter==='all'?'on':''}" data-wf="all">الكل <span class="nb">${ar(c('all'))}</span></button>` +
      S.members.map(m=>`<button class="mini ${whoFilter===m.id?'on':''}" data-wf="${m.id}">${avatar(m,22)} ${esc(m.n)} <span class="nb">${ar(c(m.id))}</span></button>`).join('') +
      `<button class="mini ${whoFilter===''?'on':''}" data-wf="">👥 مشترك <span class="nb">${ar(c(''))}</span></button>`;
  }
  const shown = (S.members.length && whoFilter!=='all' ? due.filter(t=>(t.who||'')===whoFilter) : due).slice().sort(byTime);
  $('#taskList').innerHTML = total ? (shown.length ? shown.map(t=>taskRow(t, ids.has(t.id))).join('') : `<div class="card empty"><span class="e">🎈</span>لا مهام لهذا الفرد اليوم</div>`)
    : `<div class="card empty"><span class="e">🌿</span>لا مهام لليوم، أضف مهمة أو اختر من الأفكار</div>`;
  const up = upcoming(6);
  $('#upH').hidden = !up.length;
  $('#upList').innerHTML = up.map(({t,k})=>`<div class="up">${t.e} ${esc(t.n)}<small>${relDay(k)}</small></div>`).join('');
}
function renderAll(){
  const groups = [['d','🌿 يومياً'],['w','📅 أسبوعياً'],['m','🗓️ شهرياً'],['o','📌 مواعيد في أيام محددة'],['y','🎂 مناسبات سنوية']];
  $('#allList').innerHTML = groups.map(([g,label])=>{
    let ts = S.tasks.filter(t=>(t.f||{t:'d'}).t===g);
    if (g==='o') ts = ts.slice().sort((a,b)=>a.f.k<b.f.k?-1:1);
    if (g==='y') ts = ts.slice().sort((a,b)=>(a.f.m*40+a.f.d)-(b.f.m*40+b.f.d));
    if (!ts.length) return '';
    return `<div class="group-h">${label} <span class="freq">${ar(ts.length)}</span></div>` + ts.map(t=>`
      <div class="task" style="cursor:default">
        <span class="emo">${t.e}</span>
        <span class="meta"><span class="name">${esc(t.n)}</span><small><span class="freq ${g}">${freqLabel(t.f)}</span> ${member(t.who)?`<span class="who">${avatar(member(t.who),18)} ${esc(member(t.who).n)}</span>`:''}</small></span>
        <button class="del" style="display:grid" data-del="${t.id}" aria-label="حذف">${X_SVG}</button>
      </div>`).join('');
  }).join('') || `<div class="card empty"><span class="e">🌿</span>لا توجد مهام بعد</div>`;
}
function renderFreq(){
  $$('#freqChips .mini').forEach(b=>b.classList.toggle('on', b.dataset.f===newFreq));
  $('#wdChips').hidden = newFreq!=='w'; $('#mdBox').hidden = newFreq!=='m'; $('#oBox').hidden = newFreq!=='o';
  if (!$('#oDate').value) $('#oDate').value = addDays(today(),1);
  const wc = $('#whoChips'); wc.hidden = !S.members.length;
  if (S.members.length){ if (newWho && !member(newWho)) newWho=''; wc.innerHTML = `<button type="button" class="mini ${newWho===''?'on':''}" data-who="">👥 مشترك</button>` + S.members.map(m=>`<button type="button" class="mini ${newWho===m.id?'on':''}" data-who="${m.id}">${avatar(m,22)} ${esc(m.n)}</button>`).join(''); }
  $('#wdChips').innerHTML = WD_ORDER.map(i=>`<button type="button" class="mini ${newWd.includes(i)?'on':''}" data-wd="${i}">${WD[i].replace('ال','')}</button>`).join('');
}
(function initMd(){ $('#mdSel').innerHTML = Array.from({length:31},(_,i)=>`<option value="${i+1}">يوم ${ar(i+1)} من كل شهر</option>`).join(''); $('#mdSel').value = String(new Date().getDate()); })();
$('#freqChips').onclick = e => { const b = e.target.closest('[data-f]'); if(!b) return; newFreq = b.dataset.f; renderFreq(); };
$('#wdChips').onclick = e => { const b = e.target.closest('[data-wd]'); if(!b) return; const i = +b.dataset.wd; newWd = newWd.includes(i) ? newWd.filter(x=>x!==i) : [...newWd,i]; if(!newWd.length) newWd=[i]; renderFreq(); };
$('#whoChips').onclick = e => { const b = e.target.closest('[data-who]'); if(!b) return; newWho = b.dataset.who; renderFreq(); };
$('#memberFilter').onclick = e => { const b = e.target.closest('[data-wf]'); if(!b) return; whoFilter = b.dataset.wf; renderToday(); };
$('#taskSeg').onclick = e => { const b = e.target.closest('[data-seg]'); if(!b) return; seg = b.dataset.seg; renderTasks(); };

function burst(el){
  const c = el.querySelector('.chk'); const colors=['#A9C8B5','#CFC6EC','#F7CFBA','#C3DCEC','#F3C7D1'];
  for(let i=0;i<10;i++){
    const s=document.createElement('i'); s.className='burst';
    const a = (Math.PI*2/10)*i, r = 26+Math.random()*12;
    s.style.cssText=`left:15px;top:15px;background:${colors[i%5]};--x:${Math.cos(a)*r}px;--y:${Math.sin(a)*r}px`;
    c.appendChild(s); setTimeout(()=>s.remove(),650);
  }
}
function confetti(){
  const colors=['#A9C8B5','#CFC6EC','#F7CFBA','#C3DCEC','#F3C7D1','#6F9C82'];
  for(let i=0;i<46;i++){
    const c=document.createElement('i'); c.className='confetti';
    c.style.cssText=`left:${Math.random()*100}vw;background:${rand(colors)};animation-duration:${1.6+Math.random()*1.6}s;animation-delay:${Math.random()*.4}s;transform:rotate(${Math.random()*360}deg)`;
    document.body.appendChild(c); setTimeout(()=>c.remove(),3800);
  }
}
function toggleTask(id, el, day){
  const t = day || today(); const arr = new Set(S.done[t]||[]);
  const on = !arr.has(id); on ? arr.add(id) : arr.delete(id);
  S.done[t] = [...arr];
  Object.keys(S.done).forEach(k=>{ if((fromKey(t)-fromKey(k))/864e5>90) delete S.done[k]; });
  save();
  el.classList.toggle('done', on); el.setAttribute('aria-checked', on);
  if (on){ burst(el); buzz(15); }
  inc('tasks', on?1:-1); updateHist(); save(); checkAch();
  if (day && day!==today()){ S.hist[day] = {d:taskStats(day).done, t:taskStats(day).total}; save(); renderCal(); return; }
  const {done,total} = taskStats(); const pct = total? Math.round(done/total*100):0;
  $('#tBar').style.width = pct+'%'; $('#tPct').textContent = ar(pct)+'٪';
  if (on && done===total){ setTimeout(()=>{ confetti(); const st = streak(); toast(st>1 ? `أحسنت! سلسلة ${daysAr(st)} متتالية 🔥` : 'أحسنت! أنجزت كل مهام اليوم 🎉'); buzz([20,60,20]); checkAch(); },300); }
}
$('#taskList').addEventListener('click', e=>{ const el = e.target.closest('.task'); if (el) toggleTask(el.dataset.id, el); });
$('#taskList').addEventListener('keydown', e=>{ if((e.key==='Enter'||e.key===' ') && e.target.classList.contains('task')){ e.preventDefault(); toggleTask(e.target.dataset.id, e.target);} });
$('#allList').addEventListener('click', e=>{
  const del = e.target.closest('[data-del]'); if(!del) return;
  const t = S.tasks.find(x=>x.id===del.dataset.del);
  undoable(`تم حذف «${t?t.n:''}»`, ()=>{ S.tasks = S.tasks.filter(x=>x.id!==del.dataset.del); });
});
const EMO = [['غسيل','🧺'],['أطباق','🍽️'],['مطبخ','🍳'],['حمام','🛁'],['كنس','🧹'],['مسح','🧽'],['قمامة','🗑️'],['نبات','🪴'],['زرع','🪴'],['سرير','🛏️'],['كوي','👕'],['كي','👕'],['ملابس','👕'],['شراء','🛒'],['تسوق','🛒'],['طبخ','🍲'],['أطفال','🧸'],['ثلاجة','🧊'],['شباك','🪟'],['نافذة','🪟'],['فاتورة','💡'],['فواتير','💡'],['دواء','💊'],['سيارة','🚗'],['قط','🐈'],['كلب','🐕'],['مذاكرة','📚']];
function addTask(n, e, f, who='', tm=''){
  if (S.tasks.some(t=>t.n===n && (t.who||'')===who && JSON.stringify(t.f)===JSON.stringify(f))) { toast('هذه المهمة موجودة بالفعل'); return false; }
  const t = {id:uid(), e, n, f, who}; if (tm) t.tm = tm; S.tasks.push(t); if (f.t==='o' || f.t==='y') inc('events'); save(); checkAch(); return true;
}
$('#addTaskForm').onsubmit = e => {
  e.preventDefault(); const v = $('#newTask').value.trim(); if(!v){ $('#newTask').focus(); return; }
  const m = EMO.find(([w])=>v.includes(w));
  if (newFreq==='o' && !/^\d{4}-\d{2}-\d{2}$/.test($('#oDate').value)){ toast('اختر التاريخ'); return; }
  const f = newFreq==='w' ? {t:'w', d:[...newWd]} : newFreq==='m' ? {t:'m', d:+$('#mdSel').value} : newFreq==='o' ? {t:'o', k:$('#oDate').value} : {t:'d'};
  if (addTask(v, m?m[1]:'✨', f, newWho)){ $('#newTask').value=''; renderTasks(); buzz(10); toast(f.t==='d' ? 'أضيفت لمهامك اليومية' : `أضيفت — ${freqLabel(f)}`); }
};

/* ---------- generic sheet ---------- */
const open = id => $(id).classList.add('show');
const close = id => $(id).classList.remove('show');
function sheet(html){ $('#genSheet').innerHTML = `<div class="grab"></div>${html}`; $('#genSheet').scrollTop = 0; open('#genOv'); }

// task library
function openLibrary(){
  const names = new Set(S.tasks.map(t=>t.n));
  const fl = {d:'يومي',w:'أسبوعي',m:'شهري'};
  sheet(`<h3>أفكار المهام</h3><p class="lead">أضف خطة جاهزة بلمسة، أو اختر مهام منفردة</p>` +
    ((C.plans||[]).length ? `<div class="lib-room"><h4>⚡ خطط جاهزة</h4>` + C.plans.map((p,i)=>`<button class="plan" data-plan="${i}"><span class="pe">${p.e}</span><span class="pt"><b>${esc(p.n)}</b><small>${esc(p.d)}، ${ar(p.tasks.length)} مهام</small></span><span class="pa">+ أضف</span></button>`).join('') + `</div>` : '') +
    C.taskLibrary.map(r=>`<div class="lib-room"><h4>${r.e} ${r.room}</h4><div class="chips" style="margin-top:0">` +
      r.items.map(it=>`<button class="lib-item ${names.has(it.n)?'added':''}" data-lib="${esc(it.n)}" data-e="${it.e}" data-f="${it.f}">${it.e} ${esc(it.n)} <span class="freq ${it.f}">${fl[it.f]}</span></button>`).join('') +
    `</div></div>`).join('') + `<button class="btn primary block" data-close>تم</button>`);
}
$('#libBtn1').onclick = openLibrary; $('#libBtn2').onclick = openLibrary;
$('#genSheet').addEventListener('click', e=>{
  if (e.target.closest('[data-close]')) { close('#genOv'); render(); return; }
  const lib = e.target.closest('[data-lib]');
  if (lib){
    if (lib.classList.contains('added')) { toast('موجودة بالفعل في مهامك'); return; }
    const fk = lib.dataset.f, d = new Date();
    const f = fk==='w' ? {t:'w', d:[d.getDay()]} : fk==='m' ? {t:'m', d:d.getDate()} : {t:'d'};
    if (addTask(lib.dataset.lib, lib.dataset.e, f)){ lib.classList.add('added'); buzz(10); toast(`أضيفت — ${freqLabel(f)}`); }
    return;
  }
  const pl = e.target.closest('[data-plan]');
  if (pl){ const p = C.plans[+pl.dataset.plan]; let n = 0; p.tasks.forEach(t=>{ if (!S.tasks.some(x=>x.n===t.n)){ S.tasks.push({id:uid(), e:t.e, n:t.n, f:t.f, who:''}); n++; } }); save(); buzz(15);
    toast(n ? `أضيفت ${ar(n)} مهام من «${p.n}» ✓` : 'كل مهام هذه الخطة موجودة لديك'); pl.querySelector('.pa').textContent = '✓ أضيفت'; return; }
  const fv = e.target.closest('[data-fav]');
  if (fv){ const n = fv.dataset.fav; S.fav = S.fav.includes(n) ? S.fav.filter(x=>x!==n) : [...S.fav, n]; save(); fv.classList.toggle('on', S.fav.includes(n)); buzz(10); toast(S.fav.includes(n) ? 'أضيفت إلى المفضلة ❤️' : 'أزيلت من المفضلة'); return; }
  const dr = e.target.closest('[data-delrec]');
  if (dr){ close('#genOv'); undoable('تم حذف وصفتك', ()=>{ S.myRecipes = S.myRecipes.filter(r=>r.id!==dr.dataset.delrec); }); return; }
  const rf = e.target.closest('[data-rf]'); if (rf){ browseFilter = rf.dataset.rf; renderBrowse(); return; }
  const ab = e.target.closest('[data-addrecipe]'); if (ab){ openAddRecipe(); return; }
  const pb = e.target.closest('[data-pay]'); if (pb){ close('#genOv'); payBill(pb.dataset.pay); return; }
  const csv = e.target.closest('[data-csv]'); if (csv){ exportCSV(); return; }
  const rs = e.target.closest('[data-recipe]'); if (rs){ openRecipe(rs.dataset.recipe); return; }
  const ms = e.target.closest('[data-addmiss]');
  if (ms){ const n = addToShop(ms.dataset.addmiss.split('|')); toast(n ? `أضيف ${ar(n)} للقائمة 🛒` : 'موجودة بالفعل في القائمة'); updateBadge(); return; }
  const use = e.target.closest('[data-use]');
  if (use){ const [k,name] = use.dataset.use.split('|'); setMeal(mKey,k,name); close('#genOv'); go('meals'); toast(`تم وضعها في ${MEALS.find(x=>x.k===k).n} ${relDay(mKey)}`); }
});
$$('.overlay').forEach(o=>o.addEventListener('click',e=>{ if(e.target===o && o.id!=='obOv'){ o.classList.remove('show'); if(o.id==='installOv'){S.seen=true;save();} if(o.id==='setOv') saveSettings(); if(o.id==='genOv') render(); } }));

/* ---------- MEALS ---------- */
let mKey = today();
const MEAT = ['دجاج','لحم مفروم','لحم','تونة','سمك','كبدة','سجق','جمبري'];
const isVeg = r => !r.i.some(i=>MEAT.includes(i));
const allRecipes = k => (C.recipes[k]||[]).concat((S.myRecipes||[]).filter(r=>r.k===k));
const RGROUPS = [...MEALS_NORMAL, {k:'x',n:'حلويات وسناكس',e:'🍰',bg:'var(--rose-l)'}, {k:'h',n:'صحي ودايت',e:'🥗',bg:'var(--sage-l)'}, {k:'k',n:'لانش بوكس المدرسة',e:'🎒',bg:'var(--sky-l)'}, {k:'j',n:'مشروبات وعصائر',e:'🥤',bg:'var(--peach-l)'}];
const RKEYS = RGROUPS.map(x=>x.k);
const findRecipe = name => { if (!name) return null; for (const k of RKEYS){ const r = allRecipes(k).find(r=>r.n===name); if (r) return Object.assign({k}, r); } return null; };
const missingOf = r => r.i.filter(i=>!S.pantry.includes(i));
function setMeal(k, type, name){ S.meals[k] = S.meals[k]||{}; S.meals[k][type] = name; save(); }
function renderMeals(){
  const d = fromKey(mKey);
  $('#mDay').textContent = relDay(mKey);
  $('#mDate').textContent = `${dayName(d)}، ${dateStr(d)}`;
  const m = S.meals[mKey]||{}; let anyMiss = false;
  $('#mealList').innerHTML = MEALS.map(x=>{
    const r = m[x.k] ? findRecipe(m[x.k]) : null; const miss = r ? missingOf(r) : [];
    if (miss.length) anyMiss = true;
    return `<div class="meal" id="meal-${x.k}">
      <div class="mi" style="background:${x.bg}">${x.e}</div>
      <div class="mb">
        <label for="mi-${x.k}">${x.n}${r?` <small style="color:var(--muted);font-weight:500">⏱ ${ar(r.m)} دقيقة</small>`:''}</label>
        <input id="mi-${x.k}" data-k="${x.k}" value="${esc(m[x.k]||'')}" placeholder="اكتب وجبتك أو اضغط «اقترح»" maxlength="60">
        ${miss.length?`<div class="miss">🛒 ينقصك: ${esc(miss.join('، '))}</div>`:''}
      </div>
      ${r?`<button class="info" data-recipe="${esc(r.n)}" aria-label="طريقة التحضير"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M8 7h6M8 11h6"/></svg></button>`:''}
    </div>`;}).join('');
  $('#missToShop').hidden = !anyMiss;
  renderPantry();
}
let mealTimer;
$('#mealList').addEventListener('input', e=>{
  const k = e.target.dataset.k; if(!k) return;
  setMeal(mKey, k, e.target.value);
  clearTimeout(mealTimer); mealTimer = setTimeout(()=>{ if (findRecipe(e.target.value.trim())) renderMeals(); }, 600);
});
$('#mealList').addEventListener('click', e=>{ const b = e.target.closest('[data-recipe]'); if (b) openRecipe(b.dataset.recipe); });
$('#mPrev').onclick = () => { mKey = addDays(mKey,-1); renderMeals(); };
$('#mNext').onclick = () => { mKey = addDays(mKey,1); renderMeals(); };
function pick(type, avoid = []){
  const scored = allRecipes(type).map(r=>({r, miss: missingOf(r).length}));
  const pool = scored.filter(x=>!avoid.includes(x.r.n));
  const src = pool.length ? pool : scored;
  const min = Math.min(...src.map(x=>x.miss));
  const best = src.filter(x=>x.miss===min);
  const favs = best.filter(x=>S.fav.includes(x.r.n));
  return (favs.length && Math.random()<.55 ? rand(favs) : rand(best)).r;
}
function genDay(k, avoidMap = {}){
  const cur = S.meals[k]||{}; const recent = recentNames(k);
  MEALS.forEach(x=>{ const r = pick(x.k, [cur[x.k], ...(avoidMap[x.k]||[]), ...recent].filter(Boolean)); setMeal(k, x.k, r.n); (avoidMap[x.k] = avoidMap[x.k]||[]).push(r.n); });
}
$('#genBtn').onclick = () => {
  const btn = $('#genBtn'); btn.classList.remove('spin'); void btn.offsetWidth; btn.classList.add('spin');
  genDay(mKey); renderMeals(); buzz(12);
  MEALS.forEach((x,i)=>setTimeout(()=>{ const el = $('#meal-'+x.k); el && el.classList.add('flash'); }, i*120));
  toast($('#missToShop').hidden ? 'خطة اليوم جاهزة من مخزونك 🍽️' : 'جاهز! بعض الوجبات تحتاج مكونات إضافية');
};
$('#genWeek').onclick = () => {
  const avoid = {};
  for (let i=0;i<7;i++) genDay(addDays(mKey,i), avoid);
  renderMeals(); buzz([10,40,10]); inc('weekPlans'); save(); checkAch();
  const days = Array.from({length:7},(_,i)=>addDays(mKey,i));
  sheet(`<h3>خطة الأسبوع جاهزة 🗓️</h3><p class="lead">من ${relDay(days[0])} حتى ${dayName(fromKey(days[6]))} — يمكنك تعديل أي يوم لاحقاً</p>` +
    days.map(k=>{ const m = S.meals[k]; return `<div class="card" style="padding:14px;margin-bottom:10px"><b>${relDay(k)} <small style="color:var(--muted);font-weight:500">${dateStr(fromKey(k))}</small></b>` +
      MEALS.map(x=>`<div style="margin-top:6px;font-weight:500" data-recipe="${esc(m[x.k])}">${x.e} ${esc(m[x.k])}</div>`).join('') + `</div>`; }).join('') +
    `<div class="row2" style="margin-top:6px"><button class="btn soft" data-addmiss="${esc(weekMissing(days).join('|'))}" ${weekMissing(days).length?'':'disabled'}>🛒 الناقص للتسوق (${ar(weekMissing(days).length)})</button><button class="btn primary" data-close>تم</button></div>`);
};
function weekMissing(days){ const s = new Set(); days.forEach(k=>{ const m = S.meals[k]||{}; MEALS.forEach(x=>{ const r = m[x.k] && findRecipe(m[x.k]); if (r) missingOf(r).forEach(i=>s.add(i)); }); }); return [...s]; }
$('#missToShop').onclick = () => { const n = addToShop(weekMissing([mKey])); toast(n ? `أضيف ${ar(n)} للقائمة 🛒` : 'موجودة بالفعل في القائمة'); updateBadge(); };
function openRecipe(name){
  const r = findRecipe(name); if(!r) return;
  const miss = missingOf(r);
  const mm = MEALS.find(x=>x.k===r.k) || RGROUPS.find(x=>x.k===r.k) || RGROUPS[1];
  setRecipeCtx(r);
  sheet(`<div class="rec-head"><h3>${esc(r.n)}</h3><button class="fav-btn ${S.fav.includes(r.n)?'on':''}" data-fav="${esc(r.n)}" aria-label="مفضلة">♥</button></div><p class="lead">${mm.e} ${mm.n}${r.id?'، ✍️ وصفتك':''}${isVeg(r)?'، 🥬 نباتية':''}</p>
    <div class="rec-meta"><span>⏱️ ${ar(r.m)} دقيقة</span><span>🧾 ${ar(r.i.length)} مكونات</span>${miss.length?`<span style="color:var(--peach-d)">ينقص ${ar(miss.length)}</span>`:'<span style="color:var(--sage-d)">✓ كل المكونات متوفرة</span>'}</div>
    <div class="pg"><h5>المكونات الأساسية</h5><div class="ing">${r.i.map(i=>`<span class="${S.pantry.includes(i)?'have':'need'}">${S.pantry.includes(i)?'✓':'+'} ${esc(i)}</span>`).join('')}</div></div>
    <div id="qtyBox">${qtyHTML(r, r.sv)}</div>
    <div class="pg"><h5>طريقة التحضير</h5><div class="rsteps">${r.s.map(s=>`<div>${esc(s)}</div>`).join('')}</div>${r.t?`<div class="rtip">💡 سر النجاح: ${esc(r.t)}</div>`:''}</div>
    <div class="row2" style="margin-bottom:10px"><button class="btn soft" data-timer="${esc(r.n)}|${r.m}">⏱️ مؤقت ${ar(r.m)} د</button><button class="btn primary cook-btn" data-cook="${esc(r.n)}">👩‍🍳 وضع الطبخ</button></div>
    <div class="row2">${miss.length?`<button class="btn soft" data-addmiss="${esc(miss.join('|'))}">🛒 أضف الناقص</button>`:(!MEAL_KEYS.includes(r.k) ? `<button class="btn soft" data-fav="${esc(r.n)}">♥ للمفضلة</button>` : `<button class="btn soft" data-use="${r.k}|${esc(r.n)}">📅 استخدمها</button>`)}<button class="btn primary" data-close>تم</button></div>${r.id?`<button class="btn block danger" style="margin-top:10px" data-delrec="${r.id}">حذف وصفتي</button>`:''}`);
}
let browseFilter = 'all';
$('#browseBtn').onclick = () => {
  browseFilter = 'all'; browseGroup = '';
  const total = RKEYS.reduce((a,k)=>a+allRecipes(k).length,0);
  sheet(`<h3>كل الوصفات</h3><p class="lead">${ar(total)} وصفة — الأخضر متوفر كله في مطبخك</p>
    <input class="inp search" id="recSearch" placeholder="🔍 ابحث باسم الوصفة أو مكوّن…">
    <div class="mf" id="recGroups"></div><div class="mf" id="recFilters"></div><div id="browseList"></div>
    <div class="row2"><button class="btn soft" data-addrecipe>✍️ أضف وصفتك</button><button class="btn primary" data-close>إغلاق</button></div>`);
  $('#recSearch').addEventListener('input', renderBrowse);
  renderBrowse();
};
function renderBrowse(){
  const q = ($('#recSearch')||{value:''}).value.trim();
  const F = [['all','الكل'],['fav','❤️ المفضلة'],['have','✓ متوفرة'],['quick','⚡ سريعة'],['veg','🥬 نباتية'],['mine','✍️ وصفاتي']];
  $('#recGroups').innerHTML = [['','🍽️ كل الأقسام'], ...RGROUPS.map(x=>[x.k, `${x.e} ${x.n}`])].map(([k,n])=>`<button class="mini ${browseGroup===k?'on':''}" data-rg="${k}">${n}</button>`).join('');
  $('#recFilters').innerHTML = F.map(([k,n])=>`<button class="mini ${browseFilter===k?'on':''}" data-rf="${k}">${n}</button>`).join('');
  const nq = normAr(q); const ok = r => (!q || normAr(r.n).includes(nq) || r.i.some(i=>normAr(i).includes(nq))) && (browseFilter==='all' || (browseFilter==='fav' && S.fav.includes(r.n)) || (browseFilter==='have' && !missingOf(r).length) || (browseFilter==='quick' && r.m<=15) || (browseFilter==='veg' && isVeg(r)) || (browseFilter==='mine' && r.id));
  const html = RGROUPS.filter(x=>!browseGroup || x.k===browseGroup).map(x=>{ const list = allRecipes(x.k).filter(ok); return list.length ? `<div class="lib-room"><h4>${x.e} ${x.n} <small style="color:var(--muted);font-weight:500">(${ar(list.length)})</small></h4><div class="chips" style="margin-top:0">` +
      list.map(r=>`<button class="lib-item ${missingOf(r).length?'':'added'}" data-recipe="${esc(r.n)}">${S.fav.includes(r.n)?'❤️ ':''}${esc(r.n)} <span class="freq">${ar(r.m)}د</span></button>`).join('') + `</div></div>` : ''; }).join('');
  $('#browseList').innerHTML = html || `<div class="empty"><span class="e">🔍</span>لا توجد وصفات مطابقة</div>`;
}
$('#addRecipeBtn').onclick = () => openAddRecipe();
function renderPantry(){
  $('#pantryCount').textContent = `(${ar(S.pantry.length)} متوفر)`;
  $('#pantryChips').innerHTML = C.pantry.map(g=>`<div class="pg"><h5>${g.e} ${g.g}</h5><div class="chips" style="margin-top:0">${g.items.map(p=>`<button class="chip ${S.pantry.includes(p)?'on':''}" data-p="${esc(p)}">${esc(p)}</button>`).join('')}</div></div>`).join('');
}
$('#pantryChips').addEventListener('click', e=>{
  const c = e.target.closest('[data-p]'); if(!c) return;
  const p = c.dataset.p; S.pantry = S.pantry.includes(p) ? S.pantry.filter(x=>x!==p) : [...S.pantry,p];
  save(); buzz(6);
  const open = $('#pantryBox').open; renderMeals(); $('#pantryBox').open = open;
});

/* ---------- SHOP ---------- */
function addToShop(names){
  let n = 0;
  names.forEach(nm=>{ nm = nm.trim(); if (!nm) return; const ex = S.shop.find(i=>i.n===nm); if (ex){ if (ex.done){ ex.done=false; n++; } return; } S.shop.unshift({id:uid(), n:nm, done:false}); n++; });
  save(); return n;
}
function updateBadge(){ const n = S.shop.filter(i=>!i.done).length; const b = $('#shopBadge'); b.hidden = !n; b.textContent = n>9?'+٩':ar(n); }
function renderShop(){
  const left = S.shop.filter(i=>!i.done), got = S.shop.filter(i=>i.done);
  $('#shopCount').textContent = left.length ? `(${ar(left.length)})` : '';
  const row = i => `<div class="shop-item ${i.done?'done':''}" data-s="${i.id}">${CHECK_SVG}<span class="name">${esc(i.n)}</span><button class="del" style="display:grid" data-sdel="${i.id}" aria-label="حذف">${X_SVG}</button></div>`;
  $('#shopList').innerHTML = S.shop.length ? shopGrouped(left, row) + (got.length?`<div class="group-h">✓ تم شراؤه (${ar(got.length)})</div>`+got.map(row).join('')+`<button class="btn soft block shop-exp" data-shopexp>💰 سجّل المشتريات كمصروف</button>`:'')
    : `<div class="card empty"><span class="e">🛒</span>القائمة فارغة — أضف ما تحتاجه أو اختر من الاقتراحات</div>`;
  const inList = new Set(S.shop.filter(i=>!i.done).map(i=>i.n));
  const need = weekMissing(Array.from({length:7},(_,i)=>addDays(today(),i))).filter(x=>!inList.has(x));
  const quick = C.quickShop.filter(x=>!inList.has(x) && !need.includes(x));
  $('#shopSugg').innerHTML = need.map(x=>`<button type="button" class="chip add need" data-q="${esc(x)}" title="ناقص لوجباتك">${esc(x)}</button>`).join('') + quick.map(x=>`<button type="button" class="chip add" data-q="${esc(x)}">${esc(x)}</button>`).join('');
  $('#clearShop').hidden = !got.length; $('#shareShop').hidden = !left.length;
  updateBadge();
}
$('#shopForm').onsubmit = e => { e.preventDefault(); const v = $('#shopInp').value; if(!v.trim()) return; const n = addToShop(v.split(/[،,\n]+/).reverse()); $('#shopInp').value=''; renderShop(); buzz(8); if(!n) toast('موجود بالفعل في القائمة'); };
$('#shopSugg').onclick = e => { const b = e.target.closest('[data-q]'); if(!b) return; addToShop([b.dataset.q]); renderShop(); buzz(6); };
$('#shopList').addEventListener('click', e=>{
  const d = e.target.closest('[data-sdel]'); if (d){ const it = S.shop.find(i=>i.id===d.dataset.sdel); undoable(`تم حذف «${it?it.n:''}»`, ()=>{ S.shop = S.shop.filter(i=>i.id!==d.dataset.sdel); }); return; }
  const el = e.target.closest('[data-s]'); if(!el) return;
  const it = S.shop.find(i=>i.id===el.dataset.s); it.done = !it.done;
  if (it.done){ buzz(12); inc('bought'); checkAch(); if (PANTRY_ALL.includes(it.n) && !S.pantry.includes(it.n)){ S.pantry.push(it.n); toast(`«${it.n}» أضيف إلى مخزون المطبخ 🧺`); } }
  save(); el.classList.toggle('done', it.done); setTimeout(renderShop, 350);
});
$('#clearShop').onclick = () => { const n = S.shop.filter(i=>i.done).length; undoable(`تم حذف ${ar(n)} من المشترى`, ()=>{ S.shop = S.shop.filter(i=>!i.done); }); };
$('#shareShop').onclick = async () => {
  const text = '🛒 قائمة التسوق — بيتي\n\n' + S.shop.filter(i=>!i.done).map(i=>'▫️ '+i.n).join('\n');
  if (NATIVE) { BaytiAndroid.shareText(text); return; }
  try { if (navigator.share) { await navigator.share({title:'قائمة التسوق', text}); return; } } catch(e){ if (e.name==='AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('تم نسخ القائمة — الصقها في واتساب 📋'); }
  catch(e){ window.open('https://wa.me/?text='+encodeURIComponent(text), '_blank'); }
};

/* ---------- BUDGET ---------- */
let cat = 'g', bKey = today();
const daySum = k => r2((S.exp[k]||[]).reduce((a,b)=>a+(+b.a||0),0));
function renderBudget(){
  const list = S.exp[bKey]||[]; const sum = daySum(bKey); const isT = bKey===today(); const d = fromKey(bKey);
  $('#bDay').textContent = relDay(bKey); $('#bDate').textContent = `${dayName(d)}، ${dateStr(d)}`;
  $('#bNext').disabled = isT; $('#bNext').style.opacity = isT ? .35 : 1;
  $('#bLbl').textContent = isT ? 'إجمالي مصروف اليوم' : `إجمالي مصروف ${relDay(bKey)}`;
  const ym = bKey.slice(0,7);
  const month = monthTotal(ym), mDaily = monthDaily(ym), mFixed = fixedSum(ym);
  $('#bTotal').innerHTML = `${ar(sum)}<small>${S.cur}</small>`;
  $('#bCount').textContent = list.length ? plural(list.length,'عملية واحدة','عمليتان','عمليات','عملية') : 'لا عمليات في هذا اليوم';
  $('#bMonth').textContent = money(month); $('#bMonthD').textContent = money(mDaily);
  $('#bWeek').textContent = money(r2(Array.from({length:7},(_,i)=>daySum(addDays(bKey,-i))).reduce((a,b)=>a+b,0)));
  $('#bPick').max = today(); $('#bPick').value = bKey;
  const recDays = Object.keys(S.exp).filter(k=>k.startsWith(ym) && daySum(k)>0).sort();
  const notes = [];
  if (mFixed) notes.push(`📌 إجمالي الشهر يشمل ${money(mFixed)} مصروفات ثابتة (فواتير/إيجار)`);
  if (recDays.length===1 && recDays[0]===bKey && !mFixed) notes.push('ℹ️ هذا أول يوم مسجّل هذا الشهر، لذلك يتساوى اليوم مع الشهر. سيختلفان عندما تسجّل مصاريف أيام أخرى.');
  else if (recDays.length && recDays[0]>ym+'-01' && recDays.length<4) notes.push(`ℹ️ بدأ التسجيل هذا الشهر يوم ${dateStr(fromKey(recDays[0]))}. لتسجيل مصروف قديم اضغط على التاريخ بالأعلى.`);
  $('#bNote').textContent = notes.join('\n'); $('#bNote').style.whiteSpace = 'pre-line';
  renderExpType(); renderFixed(ym);
  $('#expHint').textContent = list.length ? `${relDay(bKey)}: ${money(sum)} — اضغط على أي مصروف لتعديله` : '';
  const lb = $('#limitBox');
  if (S.limit>0){
    lb.hidden=false; const r = sum/S.limit;
    $('#limitBar').style.width = Math.min(100, r*100)+'%';
    $('#limitBar').style.background = r>1 ? 'var(--rose-d)' : r>.8 ? '#E0A35E' : 'var(--sage-d)';
    $('#limitTxt').textContent = r>1 ? `تجاوزت الحد اليومي بـ ${money(r2(sum-S.limit))}` : `المتبقي من الحد اليومي: ${money(r2(S.limit-sum))}`;
  } else lb.hidden=true;
  renderMonthInsight();
  renderBills(); renderGoals();
  $('#cats').innerHTML = CATS.map(c=>`<button type="button" class="cat ${c.k===cat?'on':''}" data-c="${c.k}">${c.e} ${c.n}</button>`).join('');
  const E = $('#expList');
  E.innerHTML = !list.length ? `<div class="empty"><span class="e">🪙</span>لا مصاريف مسجلة في هذا اليوم</div>` :
    list.slice().sort((a,b)=>b.t-a.t).map(x=>{
      const c = catOf(x.c);
      return `<div class="exp tap" data-ee="${x.id}" role="button" aria-label="تعديل"><span class="ce">${c.e}</span><div class="en"><b>${esc(x.n||c.n)}${x.bill?'<span class="tag">فاتورة</span>':''}</b><small>${subOf(x, bKey)}</small></div><span class="ea">${money(x.a)}</span><span class="ed" aria-hidden="true">✏️</span><button class="x" data-x="${x.id}" aria-label="حذف">${X_SVG}</button></div>`;
    }).join('');
  // 7-day chart (oldest on the right, RTL)
  const days = Array.from({length:7},(_,i)=>addDays(bKey, i-6));
  const vals = days.map(daySum); const max = Math.max(...vals, 1);
  $('#chart').innerHTML = days.map((k,i)=>`<div class="col"><div class="bar ${k===bKey?'today':''}" style="height:${Math.max(3, vals[i]/max*100)}%">${vals[i]?`<span>${ar(Math.round(vals[i]))}</span>`:''}</div><small>${k===today()?'اليوم':WD[fromKey(k).getDay()].replace('ال','').slice(0,4)}</small></div>`).join('');
  $('#weekSum').textContent = `المجموع: ${money(r2(vals.reduce((a,b)=>a+b,0)))}`;
  // category breakdown for month
  $('#monthName').textContent = d.toLocaleDateString('ar-EG',{month:'long'});
  const byCat = monthCats(ym);
  const rows = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  $('#catBreak').innerHTML = rows.length ? rows.map(([k,v])=>{ const c = catOf(k); return `<button type="button" class="catrow" data-lc="${k}"><span class="cn">${c.e} ${c.n}</span><span class="cb"><i style="width:${v/month*100}%"></i></span><span class="cv"><b>${money(Math.round(v))}</b><small>${ar(Math.round(v/month*100))}٪</small></span></button>`; }).join('') + '<small class="hint-line">اضغط على أي فئة لعرض مصاريفها</small>'
    : `<div class="empty"><span class="e">📊</span>سجّل مصاريفك لترى توزيعها هنا</div>`;
}
$('#bPrev').onclick = () => { bKey = addDays(bKey,-1); renderBudget(); };
$('#bNext').onclick = () => { if (bKey!==today()){ bKey = addDays(bKey,1); renderBudget(); } };
$('#cats').addEventListener('click', e=>{ const b=e.target.closest('[data-c]'); if(!b) return; cat=b.dataset.c; $$('.cat').forEach(x=>x.classList.toggle('on',x===b)); buzz(6); });
$('#expForm').onsubmit = e => {
  e.preventDefault();
  const a = parseAmount($('#expAmt').value);
  if (!(a>0) || a>=1e9){ toast('أدخل مبلغاً صحيحاً، مثال: ١٥٠ أو ١٬٥٠٠'); $('#expAmt').focus(); return; }
  if (a>=BIG_AMT && bigOk!==a){ bigOk = a; const p = $('#expPrev'); p.textContent = `⚠️ مبلغ كبير: ${money(a)} — تأكد منه ثم اضغط الزر مرة أخرى`; p.className = 'amt-prev warn'; buzz(20); return; }
  bigOk = 0;
  const item = {id:uid(), a, n:$('#expNote').value.trim().slice(0,40), c:cat, t:Date.now()};
  if (expType==='f'){ const m = ym(bKey); (S.fixed[m] = S.fixed[m]||[]).push(item); }
  else { S.exp[bKey] = S.exp[bKey]||[]; S.exp[bKey].push(item); }
  save(); $('#expAmt').value=''; $('#expNote').value=''; expPrevUpd(); document.activeElement && document.activeElement.blur();
  renderBudget(); const b=$('#bTotal'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); buzz(12);
  toast(expType==='f' ? `تمت إضافة ${money(a)} للمصروفات الثابتة لشهر ${monthName(ym(bKey))}` : bKey===today() ? `تمت إضافة ${money(a)}` : `تمت إضافة ${money(a)} إلى ${relDayFull(bKey)}`,
    {label:'تراجع', fn:()=>{ if (pullExp(item.id)){ save(); render(); toast('تم إلغاء الإضافة ↩️'); } }}); checkAch();
  if (expType==='f'){ expType='d'; renderExpType(); setCat(prevCat); }
};
let bigOk = 0;
const expPrevUpd = amtPreview($('#expAmt'), $('#expPrev'));
$('#expAmt').addEventListener('input', ()=>{ bigOk = 0; });
$('#expList').addEventListener('click', e=>{
  const x = e.target.closest('[data-x]'); if (x){ deleteExp(x.dataset.x); return; }
  const r = e.target.closest('[data-ee]'); if (r) openExpEdit(r.dataset.ee);
});
$('#catBreak').addEventListener('click', e=>{ const b = e.target.closest('[data-lc]'); if (b) openLedger(ym(bKey), b.dataset.lc); });
$('#ledBtn').onclick = () => openLedger(ym(bKey));

/* ---------- install ---------- */
let deferred = null;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
function setOS(os){ $$('[data-os]').forEach(b=>b.classList.toggle('on', b.dataset.os===os)); $('#stepsIos').hidden = os!=='ios'; $('#stepsAndroid').hidden = os!=='android'; }
$$('[data-os]').forEach(b=>b.onclick=()=>setOS(b.dataset.os));
setOS(isIOS?'ios':'android');
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferred=e; $('#installNow').hidden=false; });
$('#installNow').onclick = async () => { if(!deferred) return; deferred.prompt(); const r = await deferred.userChoice; deferred=null; $('#installNow').hidden=true; if(r.outcome==='accepted'){ close('#installOv'); S.seen=true; save(); toast('تم التثبيت 🎉'); } };
$('#installClose').onclick = () => { close('#installOv'); S.seen=true; save(); };
window.addEventListener('appinstalled', ()=>{ S.seen=true; save(); });

/* ---------- settings ---------- */
function renderSettings(){
  $('#nameInp').value = S.name||''; $('#mbInp').value = S.monthBudget>0 ? S.monthBudget : '';
  $('#ramTgl').checked = !!S.ramadan;
  $$('#themeSeg [data-th]').forEach(b=>b.classList.toggle('on', b.dataset.th===(S.theme||'auto')));
  $('#memList').innerHTML = S.members.map(m=>`<span class="mem-chip">${avatar(m,26)} ${esc(m.n)}<button type="button" data-mdel="${m.id}" aria-label="حذف">${X_SVG}</button></span>`).join('') || '<small style="color:var(--muted);margin:0 4px">أضف أفراد البيت لتوزيع المهام عليهم</small>';
  const links = C.links||{}; $('#apkBtn').hidden = NATIVE || !links.apk;
  $('#curChips').innerHTML = CURS.map(c=>`<button class="chip ${c===S.cur?'on':''}" data-cur="${c}">${c}</button>`).join('');
  $('#limitInp').value = S.limit>0 ? S.limit : '';
  $('#verTxt').textContent = `بيتي — الإصدار ${APP_VERSION}، المحتوى رقم ${C.rev}` + (NATIVE ? '، نسخة أندرويد 🔒 بدون إنترنت' : '');
  $('#checkUpd').hidden = NATIVE; $('#showInstall').hidden = NATIVE;
}
$('#curChips').addEventListener('click', e=>{ const b=e.target.closest('[data-cur]'); if(!b) return; S.cur=b.dataset.cur; save(); renderSettings(); render(); });
function saveSettings(){ const v=parseAmount($('#limitInp').value); S.limit = v>0 ? v : 0; const mb=parseAmount($('#mbInp').value); S.monthBudget = mb>0 ? mb : 0; S.name = $('#nameInp').value.trim().slice(0,24); save(); render(); }
function addMember(name){ name = (name||'').trim().slice(0,16); if (!name) return false; if (S.members.some(m=>m.n===name)) { toast('الاسم موجود بالفعل'); return false; } S.members.push({id:uid(), n:name, c:MCOLORS[S.members.length % MCOLORS.length]}); save(); checkAch(); return true; }
$('#memAdd').onclick = () => { if (addMember($('#memInp').value)) { $('#memInp').value=''; renderSettings(); } };
$('#memInp').addEventListener('keydown', e=>{ if (e.key==='Enter'){ e.preventDefault(); $('#memAdd').click(); } });
$('#memList').addEventListener('click', e=>{ const b = e.target.closest('[data-mdel]'); if(!b) return; const m = member(b.dataset.mdel); if (!confirm(`حذف «${m.n}»؟ ستصبح مهامه مشتركة.`)) return; S.members = S.members.filter(x=>x.id!==m.id); S.tasks.forEach(t=>{ if (t.who===m.id) t.who=''; }); save(); renderSettings(); });
$('#themeSeg').onclick = e => { const b = e.target.closest('[data-th]'); if(!b) return; S.theme = b.dataset.th; save(); applyTheme(); renderSettings(); };
$('#ramTgl').onchange = e => { S.ramadan = e.target.checked; MEALS = S.ramadan ? MEALS_RAMADAN : MEALS_NORMAL; save(); render(); toast(S.ramadan ? 'رمضان كريم 🌙 — الوجبات أصبحت: إفطار، بعد التراويح، سحور' : 'تم إيقاف وضع رمضان'); };
$('#openStats2').onclick = () => { saveSettings(); close('#setOv'); setTimeout(openStats, 250); };
$('#csvBtn').onclick = () => exportCSV();
$('#aboutBtn').onclick = () => { saveSettings(); close('#setOv'); setTimeout(openAbout, 250); };
$('#apkBtn').onclick = () => { const u = (C.links||{}).apk; if (u) window.open(u, '_blank', 'noopener'); };
$('#settingsBtn').onclick = () => { renderSettings(); open('#setOv'); };
$('#setClose').onclick = () => { saveSettings(); close('#setOv'); toast('تم الحفظ'); };
$('#showInstall').onclick = () => { close('#setOv'); setTimeout(()=>open('#installOv'),250); };
$('#showNews').onclick = () => { close('#setOv'); setTimeout(showNews,250); };
$('#resetAll').onclick = () => { if (!confirm('هل تريد مسح كل بياناتك؟ لا يمكن التراجع.\nننصح بحفظ نسخة احتياطية أولاً.')) return; localStorage.removeItem(KEY); location.reload(); };
$('#exportBtn').onclick = () => {
  S.lastBackup = today(); S.bkSnooze = ''; save();
  const json = JSON.stringify({app:'bayti', v:APP_VERSION, date:new Date().toISOString(), data:S}, null, 1);
  if (NATIVE) { BaytiAndroid.saveBackup(json, `bayti-backup-${today()}.json`); return; }
  const blob = new Blob([json], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `bayti-backup-${today()}.json`;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('تم حفظ النسخة الاحتياطية 💾');
};
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const j = JSON.parse(rd.result); const data = j.data || j;
      if (!data || !Array.isArray(data.tasks)) throw 0;
      if (!confirm('سيتم استبدال بياناتك الحالية بالنسخة المختارة. متابعة؟')) return;
      localStorage.setItem(KEY, JSON.stringify(Object.assign(fresh(), data, {seen:true})));
      location.reload();
    } catch(err){ toast('الملف غير صالح ❌'); }
  };
  rd.readAsText(f); e.target.value = '';
};

/* ---------- what's new ---------- */
function showNews(){
  sheet(`<div class="hero-ic"><span style="font-size:40px">🎉</span></div><h3>الجديد في بيتي ${APP_VERSION}</h3><p class="lead">حدّثنا التطبيق ليكون أكثر فائدة لك</p>
    <div class="news">${(C.changelog||[]).map(x=>`<div>${esc(x)}</div>`).join('')}</div><button class="btn primary block" data-close>رائع، لنبدأ</button>`);
}

/* ---------- updates: app (service worker) + content (content.json) ---------- */
let swReg = null, reloading = false;
function showUpdate(){ $('#updBar').classList.add('show'); }
$('#updBtn').onclick = () => {
  if (swReg && swReg.waiting){ swReg.waiting.postMessage('skipWaiting'); } else location.reload();
};
if (!NATIVE && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{ if (reloading) return; reloading = true; location.reload(); });
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').then(reg=>{
      swReg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate();
      reg.addEventListener('updatefound', ()=>{
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', ()=>{ if (nw.state==='installed' && navigator.serviceWorker.controller) showUpdate(); });
      });
      setInterval(()=>reg.update().catch(()=>{}), 30*60*1000);
    }).catch(()=>{});
  });
}
async function checkContent(manual){
  if (NATIVE) { if (manual) toast('التحديثات تصلك كنسخة APK جديدة ✓'); return; }
  if (!location.protocol.startsWith('http')) { if (manual) toast('افتح التطبيق من الرابط للبحث عن تحديثات'); return; }
  try {
    const r = await fetch('content.json?t='+Date.now(), {cache:'no-store'});
    if (!r.ok) throw 0;
    const j = await r.json();
    if (j && j.rev > C.rev){
      C = Object.assign({}, CONTENT_DEFAULT, j); indexContent();
      localStorage.setItem(CKEY, JSON.stringify(j)); render();
      toast('✨ تم تحديث المحتوى: رسائل ووصفات ونصائح جديدة');
    } else if (manual) {
      if (swReg) { await swReg.update().catch(()=>{}); if (swReg.waiting || swReg.installing) { showUpdate(); return; } }
      toast('لديك أحدث نسخة ✓');
    }
  } catch(e){ if (manual) toast('لا يوجد اتصال بالإنترنت'); }
}
$('#checkUpd').onclick = () => { close('#setOv'); checkContent(true); };

/* =====================================================================
   v3 features
   ===================================================================== */

/* ---------- generic form sheet ---------- */
function formSheet({title, lead='', fields, submit='حفظ', onSubmit}){
  sheet(`<h3>${title}</h3>${lead?`<p class="lead">${lead}</p>`:''}<form id="fs" autocomplete="off" novalidate>` + fields.map(f=>{
    const lab = `<label for="f-${f.id}">${f.label}</label>`;
    if (f.type==='select') return `<div class="field">${lab}<select class="inp" id="f-${f.id}" style="width:100%">${f.options.map(o=>`<option value="${esc(o[0])}" ${String(o[0])===String(f.value)?'selected':''}>${esc(o[1])}</option>`).join('')}</select></div>`;
    if (f.type==='textarea') return `<div class="field">${lab}<textarea class="inp ta" id="f-${f.id}" rows="4" placeholder="${esc(f.placeholder||'')}">${esc(f.value||'')}</textarea></div>`;
    if (f.type==='chips' || f.type==='pick') return `<div class="field"><label>${f.label}</label><div class="chips fs-chips" data-fid="${f.id}" data-multi="${f.type==='chips'}" style="margin-top:0">${f.options.map(o=>`<button type="button" class="chip ${(f.type==='chips' ? (f.value||[]).includes(o[0]) : String(o[0])===String(f.value)) ?'on':''}" data-v="${esc(o[0])}">${esc(o[1])}</button>`).join('')}</div></div>`;
    return `<div class="field">${lab}<input class="inp" id="f-${f.id}" style="width:100%" ${f.type==='number'?'inputmode="decimal"':''} placeholder="${esc(f.placeholder||'')}" value="${esc(f.value==null?'':f.value)}" maxlength="${f.max||60}"></div>`;
  }).join('') + `<div class="row2" style="margin-top:8px"><button type="button" class="btn ghost" data-close>إلغاء</button><button type="submit" class="btn primary">${submit}</button></div></form>`);
  const form = $('#fs');
  form.querySelectorAll('.fs-chips').forEach(g=>g.addEventListener('click', e=>{ const b=e.target.closest('[data-v]'); if(!b) return; e.stopPropagation(); if (g.dataset.multi==='true') b.classList.toggle('on'); else g.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on', c===b)); buzz(6); }));
  form.onsubmit = e => {
    e.preventDefault(); const v = {};
    fields.forEach(f=>{
      if (f.type==='chips') v[f.id] = [...form.querySelectorAll(`[data-fid="${f.id}"] .chip.on`)].map(c=>c.dataset.v);
      else if (f.type==='pick'){ const on = form.querySelector(`[data-fid="${f.id}"] .chip.on`); v[f.id] = on ? on.dataset.v : ''; }
      else if (f.type==='number') v[f.id] = parseAmount(form.querySelector('#f-'+f.id).value);
      else v[f.id] = form.querySelector('#f-'+f.id).value.trim();
    });
    const err = onSubmit(v); if (err){ toast(err); return; }
    close('#genOv'); render();
  };
}

/* ---------- daily history, streaks ---------- */
function updateHist(){
  const k = today(); const {done,total} = taskStats(k); S.hist = S.hist||{};
  const h = S.hist[k];
  if (!h || h.d!==done || h.t!==total){ S.hist[k] = {d:done, t:total}; const st = streak(); if (st > (S.best||0)) S.best = st; save(); }
}
function streak(){
  const h = S.hist||{}; let k = today(), n = 0;
  const full = x => x && x.t>0 && x.d>=x.t;
  if (!full(h[k])) k = addDays(k,-1);
  for (let i=0;i<730;i++){ if (full(h[k])){ n++; k = addDays(k,-1); } else break; }
  return n;
}

/* ---------- achievements ---------- */
const ACH = [
  ['first','🌱','أول خطوة','أنجز أول مهمة', ()=>cnt('tasks')>=1],
  ['s3','✨','٣ أيام متتالية','أنجز كل مهامك ٣ أيام', ()=>S.best>=3],
  ['s7','🔥','أسبوع مثالي','٧ أيام متتالية', ()=>S.best>=7],
  ['s30','👑','شهر من الإنجاز','٣٠ يوماً متتالياً', ()=>S.best>=30],
  ['t50','💪','٥٠ مهمة','أنجز ٥٠ مهمة', ()=>cnt('tasks')>=50],
  ['t250','🏆','٢٥٠ مهمة','أنجز ٢٥٠ مهمة', ()=>cnt('tasks')>=250],
  ['plan','🗓️','مخطط بارع','خطط وجبات أسبوع', ()=>cnt('weekPlans')>=1],
  ['chef','🧑‍🍳','طاهٍ ماهر','جرّب ١٠ وصفات', ()=>new Set(Object.values(S.meals).flatMap(m=>Object.values(m||{})).filter(n=>findRecipe(n))).size>=10],
  ['shop','🛒','متسوق ذكي','اشترِ ٢٠ صنفاً', ()=>cnt('bought')>=20],
  ['track','📒','محاسب البيت','سجّل ٣٠ مصروفاً', ()=>Object.values(S.exp).reduce((a,l)=>a+l.length,0)+Object.values(S.fixed||{}).reduce((a,l)=>a+l.length,0)>=30],
  ['cal','📅','منظّم المواعيد','أضف موعداً أو مناسبة في التقويم', ()=>cnt('events')>=1],
  ['timer','⏱️','سيد المطبخ','استخدم مؤقت المطبخ ٥ مرات', ()=>cnt('timers')>=5],
  ['list','📋','جاهز دائماً','أكمل قائمة جاهزة كاملة', ()=>cnt('lists')>=1],
  ['bill','💡','في الموعد','ادفع ٣ فواتير', ()=>cnt('bills')>=3],
  ['goal','🎯','حلم تحقق','أكمل هدف ادخار', ()=>S.goals.some(g=>g.doneAt)],
  ['family','👨‍👩‍👧','بيت متعاون','أضف فرداً من العائلة', ()=>S.members.length>=1],
  ['recipe','✍️','وصفة البيت','أضف وصفتك الخاصة', ()=>S.myRecipes.length>=1],
  ['fav','❤️','ذوق خاص','أضف ٥ وصفات للمفضلة', ()=>S.fav.length>=5],
  ['cookm','👩‍🍳','شيف وضع الطبخ','أكمل ٥ وصفات بوضع الطبخ', ()=>cnt('cooked')>=5],
  ['sos','📞','مستعد دائماً','احفظ ٣ أرقام مهمة', ()=>(S.contacts||[]).length>=3]
];
function checkAch(silent){
  const fresh = [];
  ACH.forEach(([id,e,n,d,fn])=>{ try { if (!S.ach[id] && fn()){ S.ach[id] = today(); fresh.push([e,n]); } } catch(err){} });
  if (!fresh.length) return;
  save();
  if (!silent){ const [e,n] = fresh[0]; setTimeout(()=>{ toast(`${e} إنجاز جديد: ${n}`, {label:'عرض', fn:openStats}); buzz([15,50,15]); }, 600); }
}

/* ---------- bills ---------- */
const ym = (k=today()) => k.slice(0,7);
function billStatus(b){
  const t = fromKey(today()); const last = new Date(t.getFullYear(), t.getMonth()+1, 0).getDate();
  const dueDay = Math.min(b.day, last); const paid = !!(b.paid||{})[ym()];
  return {paid, diff: dueDay - t.getDate(), dueDay};
}
function billPill(st){
  if (st.paid) return `<span class="pill ok">✓ مدفوعة هذا الشهر</span>`;
  if (st.diff<0) return `<span class="pill late">متأخرة ${ar(-st.diff)} يوم</span>`;
  if (st.diff===0) return `<span class="pill soon">مستحقة اليوم</span>`;
  if (st.diff===1) return `<span class="pill soon">مستحقة غداً</span>`;
  return `<span class="pill ${st.diff<=3?'soon':''}">يوم ${ar(st.dueDay)}، بعد ${daysAr(st.diff)}</span>`;
}
function renderBillBanner(){
  const due = S.bills.map(b=>({b, st:billStatus(b)})).filter(x=>!x.st.paid && x.st.diff<=3).sort((a,b)=>a.st.diff-b.st.diff).slice(0,2);
  $('#billBanner').innerHTML = due.map(({b,st})=>`<div class="banner ${st.diff<0?'late':''}"><span class="be">${(CATS.find(c=>c.k===b.c)||CATS[3]).e}</span><span class="bt">${esc(b.n)} — ${money(b.a)}<small>${st.diff<0?`متأخرة ${daysAr(-st.diff)}`:st.diff===0?'مستحقة اليوم':st.diff===1?'مستحقة غداً':`مستحقة بعد ${daysAr(st.diff)}`}</small></span><button data-paynow="${b.id}">دفعت ✓</button></div>`).join('');
}
$('#billBanner').addEventListener('click', e=>{ const b = e.target.closest('[data-paynow]'); if (b) payBill(b.dataset.paynow); });
function renderBills(){
  const L = $('#billList');
  if (!S.bills.length){ L.innerHTML = `<div class="empty" style="padding:14px 6px 6px"><span class="e">🧾</span>أضف فواتيرك الشهرية (كهرباء، إنترنت، إيجار…) لنذكّرك بموعدها</div>`; $('#billsSum').textContent=''; return; }
  const sorted = S.bills.slice().sort((a,b)=>billStatus(a).paid - billStatus(b).paid || billStatus(a).diff - billStatus(b).diff);
  L.innerHTML = sorted.map(b=>{ const st = billStatus(b); const c = CATS.find(c=>c.k===b.c)||CATS[3];
    return `<div class="bill tap" data-bedit="${b.id}" role="button"><span class="ce" style="width:44px;height:44px;border-radius:14px;display:grid;place-items:center;font-size:20px;background:var(--peach-l)">${c.e}</span>
      <div class="bn"><b>${esc(b.n)}</b>${billPill(st)}</div>
      <span class="ea" style="font-weight:800">${money(b.a)}</span>
      ${st.paid?'':`<button class="pay" data-billpay="${b.id}">دفعت</button>`}
      <span class="ed" aria-hidden="true" style="font-size:13px;opacity:.45">✏️</span></div>`; }).join('') + '<small class="hint-line" style="margin-bottom:4px">اضغط على الفاتورة لتعديلها أو حذفها</small>';
  const total = r2(S.bills.reduce((a,b)=>a+b.a,0)), unpaid = r2(S.bills.filter(b=>!billStatus(b).paid).reduce((a,b)=>a+b.a,0));
  $('#billsSum').textContent = unpaid ? `متبقي ${money(unpaid)}` : `✓ كلها مدفوعة (${money(total)})`;
}
$('#billList').addEventListener('click', e=>{
  const p = e.target.closest('[data-billpay]'); if (p){ payBill(p.dataset.billpay); return; }
  const d = e.target.closest('[data-billdel]'); if (d){ const b = S.bills.find(x=>x.id===d.dataset.billdel); undoable(`تم حذف «${b.n}»`, ()=>{ S.bills = S.bills.filter(x=>x.id!==b.id); }); return; }
  const ed = e.target.closest('[data-bedit]'); if (ed) openBillEdit(ed.dataset.bedit);
});
$('#addBill').onclick = () => formSheet({
  title:'فاتورة شهرية جديدة', lead:'سنذكّرك بها قبل موعدها بـ ٣ أيام في الشاشة الرئيسية',
  fields:[
    {id:'n', label:'اسم الفاتورة', placeholder:'مثال: الكهرباء، الإنترنت، الإيجار', max:30},
    {id:'a', label:'المبلغ التقريبي', type:'number', placeholder:'مثال: ٣٥٠'},
    {id:'day', label:'يوم الاستحقاق من كل شهر', type:'select', value:new Date().getDate(), options:Array.from({length:31},(_,i)=>[i+1, `يوم ${ar(i+1)}`])},
    {id:'c', label:'الفئة', type:'pick', value:'b', options:CATS.map(c=>[c.k, `${c.e} ${c.n}`])}
  ],
  submit:'إضافة الفاتورة',
  onSubmit:v=>{ if(!v.n) return 'اكتب اسم الفاتورة'; if(!(v.a>0)) return 'أدخل مبلغاً صحيحاً'; S.bills.push({id:uid(), n:v.n, a:r2(v.a), day:+v.day, c:v.c||'b', paid:{}}); save(); toast('تمت إضافة الفاتورة 🧾'); }
});

/* ---------- savings goals ---------- */
const GOAL_EMO = ['🎯','🏖️','🚗','🏠','🎓','💍','📱','🕋','🛋️','👶','💻','🎁'];
function renderGoals(){
  const L = $('#goalList');
  if (!S.goals.length){ L.innerHTML = `<div class="empty" style="padding:14px 6px 6px"><span class="e">🐷</span>ادّخر لهدف تحبه: مصيف، جهاز جديد، عمرة…</div>`; $('#goalsSum').textContent=''; return; }
  L.innerHTML = S.goals.map(g=>{ const p = Math.min(100, g.saved/g.target*100); return `<div class="goal tap ${g.doneAt?'done':''}" data-gedit="${g.id}" role="button">
      <span style="font-size:28px">${g.e}</span>
      <div class="bn"><b>${esc(g.n)}</b><small style="color:var(--muted);font-weight:600">${money(g.saved)} من ${money(g.target)}، ${ar(Math.round(p))}٪${g.doneAt?' 🎉':''}</small></div>
      <button class="pay" style="background:var(--sky-l);color:var(--sky-d)" data-gadd="${g.id}">± إيداع/سحب</button>
      <div class="gb"><i style="width:${p}%"></i></div></div>`; }).join('');
  const s = r2(S.goals.reduce((a,g)=>a+g.saved,0)); $('#goalsSum').textContent = `مدّخر: ${money(s)}`;
}
$('#goalList').addEventListener('click', e=>{
  const a = e.target.closest('[data-gadd]'); if (a){ openGoalMove(a.dataset.gadd); return; }
  const d = e.target.closest('[data-gdel]'); if (d){ const g = S.goals.find(x=>x.id===d.dataset.gdel); undoable(`تم حذف هدف «${g.n}»`, ()=>{ S.goals = S.goals.filter(x=>x.id!==g.id); }); return; }
  const ed = e.target.closest('[data-gedit]'); if (ed) openGoalEdit(ed.dataset.gedit);
});
$('#addGoal').onclick = () => formSheet({
  title:'هدف ادخار جديد', lead:'كل مبلغ صغير يقرّبك من حلمك 🌱',
  fields:[
    {id:'n', label:'اسم الهدف', placeholder:'مثال: مصيف الصيف', max:30},
    {id:'t', label:'المبلغ المطلوب', type:'number', placeholder:'مثال: ٥٠٠٠'},
    {id:'s', label:'المدّخر حالياً (اختياري)', type:'number', placeholder:'٠'},
    {id:'e', label:'أيقونة', type:'pick', value:'🎯', options:GOAL_EMO.map(x=>[x,x])}
  ], submit:'إنشاء الهدف',
  onSubmit:v=>{ if(!v.n) return 'اكتب اسم الهدف'; if(!(v.t>0)) return 'أدخل المبلغ المطلوب'; S.goals.push({id:uid(), n:v.n, target:r2(v.t), saved:v.s>0?r2(v.s):0, e:v.e||'🎯'}); save(); toast('تم إنشاء الهدف 🎯'); }
});

/* ---------- monthly budget insight ---------- */
function renderMonthInsight(){
  const el = $('#monthInsight'), m = ym(bKey), cur = m===ym(), spent = monthTotal(m);
  if (!(S.monthBudget>0)){ el.innerHTML = `<b>📅 حدّد ميزانية شهرية</b><small>لنحسب لك كم يمكنك أن تصرف يومياً حتى آخر الشهر — اضغط هنا</small>`; return; }
  const B = S.monthBudget, left = r2(B - spent), p = spent/B*100, lines = [];
  if (cur){
    const t = fromKey(today()), last = daysIn(m), dayN = t.getDate(), daysLeft = last - dayN + 1;
    const todaySpent = daySum(today()), before = r2(spent - todaySpent);
    const allow = Math.max(0, (B - before) / daysLeft), todayLeft = r2(allow - todaySpent);
    if (left < 0) lines.push(`⚠️ تجاوزت ميزانية الشهر بـ <b>${money(-left)}</b>`);
    else {
      lines.push(`💵 المتبقي <b>${money(left)}</b> لمدة ${daysAr(daysLeft)}`);
      lines.push(`📆 المسموح يومياً ≈ <b>${money(Math.floor(allow))}</b> — ${todayLeft >= 0 ? `متبقٍ لك اليوم <b>${money(Math.floor(todayLeft))}</b>` : `تجاوزت مسموح اليوم بـ <b>${money(Math.ceil(-todayLeft))}</b>`}`);
    }
    const md = monthDaily(m), first = Object.keys(S.exp).filter(k=>k.startsWith(m) && daySum(k)>0).sort()[0];
    const n = first ? dayN - fromKey(first).getDate() + 1 : 0;
    if (n >= 3 && md > 0){ const fc = Math.round(md + md/n*(last - dayN) + fixedSum(m)); lines.push(fc > B ? `📈 بهذا المعدل سيصل مصروف الشهر إلى ≈ <b>${money(fc)}</b> (أعلى من الميزانية)` : `✅ بهذا المعدل سيصل مصروف الشهر إلى ≈ <b>${money(fc)}</b>`); }
  } else lines.push(left >= 0 ? `✅ وفّرت <b>${money(left)}</b> في ${monthName(m)} 👏` : `⚠️ تجاوزت الميزانية بـ <b>${money(-left)}</b>`);
  el.innerHTML = `<div class="mi-top"><b>📅 ميزانية ${monthName(m)}</b><span>${money(spent)} / ${money(B)}</span></div>
    <div class="bar"><i style="width:${Math.min(100,p)}%;background:${p>100?'var(--rose-d)':p>85?'#E0A35E':'var(--sky-d)'}"></i></div>
    <small>${lines.join('<br>')}</small>`;
}
$('#monthInsight').onclick = () => { if (!(S.monthBudget>0)) { renderSettings(); open('#setOv'); setTimeout(()=>$('#mbInp').focus(), 400); } else openLedger(ym(bKey)); };

/* ---------- personal recipes ---------- */
function openAddRecipe(){
  formSheet({
    title:'✍️ أضف وصفتك', lead:'ستظهر في الاقتراحات وخطط الأسبوع مثل باقي الوصفات',
    fields:[
      {id:'n', label:'اسم الوصفة', placeholder:'مثال: مكرونة ماما بالفرن', max:40},
      {id:'k', label:'النوع', type:'pick', value:'l', options:RGROUPS.map(x=>[x.k, `${x.e} ${x.n}`])},
      {id:'m', label:'وقت التحضير (دقائق)', type:'number', placeholder:'٣٠'},
      {id:'i', label:'المكونات الأساسية (اختر من المخزون)', type:'chips', value:[], options:PANTRY_ALL.map(x=>[x,x])},
      {id:'s', label:'طريقة التحضير — كل خطوة في سطر', type:'textarea', placeholder:'اسلق المكرونة.\nحضّر الصلصة.\nاخبزها ٢٠ دقيقة.'}
    ], submit:'حفظ الوصفة',
    onSubmit:v=>{
      if (!v.n) return 'اكتب اسم الوصفة';
      if (findRecipe(v.n)) return 'يوجد وصفة بنفس الاسم';
      if (!v.i.length) return 'اختر مكوناً واحداً على الأقل';
      const steps = v.s.split(/\n+/).map(x=>x.trim()).filter(Boolean).slice(0,15);
      S.myRecipes.push({id:uid(), k:v.k||'l', n:v.n, i:v.i, m: v.m>0 ? Math.round(v.m) : 20, s: steps.length ? steps : ['حضّرها بطريقتك المعتادة ❤️']});
      save(); checkAch(); toast('تم حفظ وصفتك ✍️');
    }
  });
}

/* ---------- reports & achievements ---------- */
function monthDaily(key){ return r2(Object.keys(S.exp).filter(k=>k.startsWith(key)).reduce((a,k)=>a+daySum(k),0)); }
function fixedSum(key){ return r2(((S.fixed||{})[key]||[]).reduce((a,b)=>a+(+b.a||0),0)); }
function monthTotal(key){ return r2(monthDaily(key) + fixedSum(key)); }
function monthCats(key){ const c = {}; Object.keys(S.exp).filter(k=>k.startsWith(key)).forEach(k=>S.exp[k].forEach(x=>{ c[x.c]=r2((c[x.c]||0)+x.a); })); ((S.fixed||{})[key]||[]).forEach(x=>{ c[x.c]=r2((c[x.c]||0)+x.a); }); return c; }
function openStats(){
  updateHist();
  const st = streak(), best = Math.max(S.best||0, st);
  const days = Array.from({length:7},(_,i)=>addDays(today(), i-6));
  const vals = days.map(k=>(S.hist[k]||{}).d||0), max = Math.max(...vals,1);
  const cur = ym(), dd = fromKey(today()); const prevD = new Date(dd.getFullYear(), dd.getMonth()-1, 1); const prev = keyOf(prevD).slice(0,7);
  const mCur = monthTotal(cur), mPrev = monthTotal(prev);
  const change = mPrev ? Math.round((mCur-mPrev)/mPrev*100) : null;
  const byCat = monthCats(cur);
  const top = Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0];
  const notes = [];
  if (change!==null) notes.push(change>0 ? `📈 صرفت هذا الشهر ${ar(change)}٪ أكثر من الشهر الماضي حتى الآن` : `📉 صرفت هذا الشهر ${ar(-change)}٪ أقل من الشهر الماضي — أحسنت!`);
  if (top) notes.push(`${(CATS.find(c=>c.k===top[0])||CATS[CATS.length-1]).e} أكبر بند صرف هذا الشهر: ${(CATS.find(c=>c.k===top[0])||CATS[CATS.length-1]).n} (${money(top[1])})`);
  const md = monthDaily(cur), first = Object.keys(S.exp).filter(k=>k.startsWith(cur)).sort()[0];
  if (md && first){ const nd = Math.round((fromKey(today())-fromKey(first))/864e5)+1; notes.push(`📆 متوسط مصروفك اليومي (بدون الثابت): ${money(Math.round(md/nd))} على مدى ${daysAr(nd)}`); }
  if (fixedSum(cur)) notes.push(`📌 المصروفات الثابتة هذا الشهر: ${money(fixedSum(cur))}`);
  const unlocked = Object.keys(S.ach).length;
  sheet(`<h3>📈 تقاريري وإنجازاتي</h3><p class="lead">${S.name?`أداء رائع يا ${esc(S.name)} — `:''}استمر خطوة بخطوة</p>
    <div class="big-stats"><div><b>${st>=7?'🔥':'✨'} ${ar(st)}</b><small>السلسلة الحالية</small></div><div><b>${ar(best)}</b><small>أفضل سلسلة</small></div><div><b>${ar(cnt('tasks'))}</b><small>مهمة منجزة</small></div></div>
    <div class="pg"><h5>المهام المنجزة — آخر ٧ أيام</h5><div class="card" style="padding:12px 14px"><div class="chart" style="height:120px">${days.map((k,i)=>`<div class="col"><div class="bar ${k===today()?'today':''}" style="height:${Math.max(3, vals[i]/max*100)}%;background:${k===today()?'var(--sage-d)':'var(--sage)'}">${vals[i]?`<span>${ar(vals[i])}</span>`:''}</div><small>${k===today()?'اليوم':WD[fromKey(k).getDay()].replace('ال','').slice(0,4)}</small></div>`).join('')}</div></div></div>
    <div class="pg"><h5>المصروف</h5><div class="big-stats" style="grid-template-columns:1fr 1fr"><div><b style="font-size:19px">${money(mCur)}</b><small>هذا الشهر</small></div><div><b style="font-size:19px">${money(mPrev)}</b><small>الشهر الماضي</small></div></div>
    ${notes.map(n=>`<div class="note-line">${n}</div>`).join('')}</div>
    <div class="pg"><h5>🏅 الإنجازات (${ar(unlocked)} من ${ar(ACH.length)})</h5><div class="ach-grid">${ACH.map(([id,e,n,d])=>`<div class="ach ${S.ach[id]?'':'locked'}"><span class="ae">${e}</span><b>${n}</b><small>${S.ach[id]?'✓ '+dateStr(fromKey(S.ach[id])):d}</small></div>`).join('')}</div></div>
    <div class="row2"><button class="btn soft" data-csv>📊 تصدير Excel</button><button class="btn primary" data-close>إغلاق</button></div>`);
}
$('#openStats').onclick = openStats;

/* ---------- CSV export (opens in Excel / Google Sheets) ---------- */
function exportCSV(){
  const rows = [['التاريخ','الوقت','النوع','الفئة','البيان','المبلغ','العملة']]; const all = [];
  Object.keys(S.exp).forEach(k=>S.exp[k].forEach(x=>all.push([k, x, 'يومي'])));
  Object.keys(S.fixed||{}).forEach(m=>S.fixed[m].forEach(x=>all.push([m+'-01', x, 'ثابت شهري'])));
  all.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1].t-b[1].t).forEach(([k,x,type])=>{ const c = CATS.find(c=>c.k===x.c)||CATS[CATS.length-1]; const t = new Date(x.t);
    rows.push([type==='يومي'?k:k.slice(0,7), `${pad(t.getHours())}:${pad(t.getMinutes())}`, type, c.n, x.n||c.n, x.a, S.cur]); });
  if (rows.length===1){ toast('لا توجد مصاريف لتصديرها بعد'); return; }
  const csv = '\uFEFF' + rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const name = `bayti-expenses-${today()}.csv`;
  if (NATIVE){ if (BaytiAndroid.saveFile) BaytiAndroid.saveFile(csv, name, 'text/csv'); else toast('حدّث التطبيق لاستخدام التصدير'); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'})); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(`تم تصدير ${ar(rows.length-1)} مصروف 📊`);
}

/* ---------- about & privacy ---------- */
function openAbout(){
  const links = C.links||{};
  sheet(`<div class="hero-ic"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M12 17.2s-3-1.8-3-3.8a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 2-3 3.8-3 3.8z" fill="#fff" stroke-width="1.2"/></svg></div>
    <h3>بيتي ${APP_VERSION}</h3><p class="lead">رفيقك اليومي لبيت أهدأ وأكثر تنظيماً</p>
    <div class="note-line">🔒 <b>الخصوصية:</b> لا يوجد تسجيل دخول ولا خوادم ولا إعلانات ولا تتبع. كل بياناتك محفوظة على جهازك فقط ولا تُرسل إلى أي مكان.</div>
    <div class="note-line">💾 <b>بياناتك ملكك:</b> احفظ نسخة احتياطية في أي وقت من الإعدادات، وصدّر مصاريفك إلى Excel.</div>
    <div class="note-line">📚 <b>المحتوى:</b> ${ar(C.affirmations.length)} رسالة يومية، ${ar(C.tips.length)} نصيحة، ${ar(RKEYS.reduce((a,k)=>a+(C.recipes[k]||[]).length,0))} وصفة، ${ar((C.guide||[]).length)} حلاً في دليل البيت، و${ar((C.plans||[]).length)} خطط تنظيف جاهزة.</div>
    ${NATIVE?'<div class="note-line">🤖 نسخة أندرويد بدون أي أذونات وبدون إنترنت.</div>':''}
    ${links.repo && !NATIVE ? `<a class="btn soft block" style="text-decoration:none;margin-bottom:10px" href="${esc(links.repo)}" target="_blank" rel="noopener">💻 الكود المصدري على GitHub</a>` : ''}
    <button class="btn primary block" data-close>إغلاق</button>`);
}

/* ---------- theme ---------- */
function applyTheme(){
  const t = S.theme||'auto'; const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  const dark = t==='dark' || (t==='auto' && mq && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = document.querySelector('meta[name=theme-color]'); m && m.setAttribute('content', dark ? '#161B1A' : '#F6F3EE');
  try { if (NATIVE && BaytiAndroid.setDark) BaytiAndroid.setDark(dark); } catch(e){}
}
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ()=>{ if ((S.theme||'auto')==='auto') applyTheme(); }); } catch(e){}

/* ---------- onboarding (first run) ---------- */
let obStep = 0;
function startOnboarding(){ obStep = 0; renderOb(); open('#obOv'); }
function renderOb(){
  const dots = `<div class="ob-dots">${[0,1,2].map(i=>`<i class="${i===obStep?'on':''}"></i>`).join('')}</div>`;
  const hero = `<div class="hero-ic"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M12 17.2s-3-1.8-3-3.8a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 2-3 3.8-3 3.8z" fill="#fff" stroke-width="1.2"/></svg></div>`;
  let body = '';
  if (obStep===0) body = `${hero}<h3>أهلاً بك في بيتي 🌿</h3><p class="lead">لنجهّز التطبيق لك في أقل من دقيقة</p>
    <div class="field"><label for="obName">ما اسمك؟</label><input class="inp" id="obName" style="width:100%" placeholder="اسمك (اختياري)" maxlength="24" value="${esc(S.name||'')}"></div>
    <button class="btn primary block" data-ob="next">التالي ←</button>`;
  else if (obStep===1) body = `<div class="hero-ic" style="font-size:40px">👨‍👩‍👧</div><h3>من يعيش في البيت؟</h3><p class="lead">أضف أفراد البيت لتوزيع المهام عليهم — يمكنك التخطي</p>
    <div class="chips" id="obMembers" style="margin:0 0 12px">${S.members.map(m=>`<span class="mem-chip">${avatar(m,26)} ${esc(m.n)}<button type="button" data-obdel="${m.id}">${X_SVG}</button></span>`).join('')}</div>
    <div class="add-row" style="margin-bottom:16px"><input class="inp" id="obMem" placeholder="مثال: أحمد، سارة…" maxlength="16"><button class="btn soft" data-ob="addm">إضافة</button></div>
    <div class="row2"><button class="btn ghost" data-ob="back">→ رجوع</button><button class="btn primary" data-ob="next">${S.members.length?'التالي ←':'تخطي ←'}</button></div>`;
  else body = `<div class="hero-ic" style="font-size:40px">💰</div><h3>الميزانية</h3><p class="lead">اختر عملتك وحدد ميزانية شهرية إن أحببت</p>
    <div class="field"><label>العملة</label><div class="chips" id="obCur" style="margin-top:0">${CURS.map(c=>`<button type="button" class="chip ${c===S.cur?'on':''}" data-obcur="${c}">${c}</button>`).join('')}</div></div>
    <div class="field"><label for="obMb">ميزانية الشهر (اختياري)</label><input class="inp" id="obMb" style="width:100%" inputmode="decimal" placeholder="مثال: ١٠٠٠٠" value="${S.monthBudget>0?S.monthBudget:''}"></div>
    <div class="row2"><button class="btn ghost" data-ob="back">→ رجوع</button><button class="btn primary" data-ob="done">ابدأ 🎉</button></div>`;
  $('#obSheet').innerHTML = `<div class="grab"></div>${dots}<div class="ob-step">${body}</div>`;
}
function obCollect(){
  const n = $('#obName'); if (n) S.name = n.value.trim().slice(0,24);
  const mb = $('#obMb'); if (mb){ const v = parseAmount(mb.value); S.monthBudget = v>0 ? v : 0; }
}
$('#obSheet').addEventListener('click', e=>{
  const c = e.target.closest('[data-obcur]'); if (c){ S.cur = c.dataset.obcur; $$('#obCur .chip').forEach(x=>x.classList.toggle('on', x===c)); return; }
  const d = e.target.closest('[data-obdel]'); if (d){ S.members = S.members.filter(m=>m.id!==d.dataset.obdel); renderOb(); return; }
  const b = e.target.closest('[data-ob]'); if (!b) return;
  const a = b.dataset.ob; obCollect();
  if (a==='addm'){ if (addMember($('#obMem').value)) { renderOb(); setTimeout(()=>$('#obMem') && $('#obMem').focus(), 50); } return; }
  if (a==='next'){ obStep = Math.min(2, obStep+1); renderOb(); return; }
  if (a==='back'){ obStep = Math.max(0, obStep-1); renderOb(); return; }
  if (a==='done'){
    S.onboarded = true; save(); close('#obOv'); render(); confetti();
    toast(S.name ? `أهلاً ${S.name}! بيتك جاهز 🌿` : 'بيتك جاهز 🌿');
    if (!NATIVE && !S.seen && !standalone) setTimeout(()=>open('#installOv'), 1600);
  }
});
$('#obSheet').addEventListener('keydown', e=>{ if (e.key==='Enter' && e.target.id==='obMem'){ e.preventDefault(); const b = $('[data-ob="addm"]'); b && b.click(); } });

const daysAr = n => n===1?'يوم واحد':n===2?'يومين':(n>=3&&n<=10)?`${ar(n)} أيام`:`${ar(n)} يوماً`;
/* ================= v4 ================= */
/* ---------- budget: daily vs fixed, any date ---------- */
let expType = 'd', prevCat = 'g';
function renderExpType(){
  $$('#expType button').forEach(b=>b.classList.toggle('on', b.dataset.et===expType));
  const m = fromKey(bKey).toLocaleDateString('ar-EG',{month:'long'});
  $('#etHint').textContent = expType==='f' ? `يُحسب في إجمالي شهر ${m} فقط، ولا يدخل في مصروف اليوم (مثل الإيجار والمدارس والأقساط)` : (bKey!==today() ? `سيُسجَّل في ${relDayFull(bKey)}` : '');
  $('#expBtnTxt').textContent = expType==='f' ? `أضف مصروفاً ثابتاً لشهر ${m}` : bKey===today() ? 'أضف المصروف' : `أضف مصروف ${relDayFull(bKey)}`;
}
$('#expType').onclick = e => { const b = e.target.closest('[data-et]'); if(!b) return; const was = expType; expType = b.dataset.et; renderExpType(); buzz(6); if (expType==='f' && was!=='f'){ prevCat = cat; setCat('b'); } else if (expType==='d' && was==='f') setCat(prevCat); };
function setCat(c){ cat = c; $$('.cat').forEach(x=>x.classList.toggle('on', x.dataset.c===c)); }
$('#bPickBtn').onclick = () => { const i = $('#bPick'); try { if (i.showPicker) { i.showPicker(); return; } } catch(e){} i.style.pointerEvents='auto'; i.focus(); i.click(); setTimeout(()=>i.style.pointerEvents='none', 500); };
$('#bPick').onchange = e => { const v = e.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(v)){ bKey = v > today() ? today() : v; renderBudget(); buzz(8); } };
function renderFixed(m){
  const L = ((S.fixed||{})[m]||[]).slice().sort((a,b)=>b.t-a.t), el = $('#fixedList');
  const mn = fromKey(m+'-01').toLocaleDateString('ar-EG',{month:'long'});
  $('#fixedSum').textContent = L.length ? `${mn}: ${money(fixedSum(m))}` : mn;
  el.innerHTML = L.length ? L.map(x=>{ const c = CATS.find(c=>c.k===x.c)||CATS[CATS.length-1];
    return `<div class="exp tap" data-ee="${x.id}" role="button"><span class="ce" style="background:var(--lav-l)">${c.e}</span><div class="en"><b>${esc(x.n||c.n)}${x.bill?'<span class="tag">فاتورة</span>':''}</b><small>${c.n}، ${dateStr(new Date(x.t))}</small></div><span class="ea">${money(x.a)}</span><span class="ed" aria-hidden="true">✏️</span><button class="x" data-fx="${x.id}" aria-label="حذف">${X_SVG}</button></div>`; }).join('')
    : `<div class="empty" style="padding:14px 6px"><span class="e">📌</span>الإيجار، المدارس، الأقساط والفواتير المدفوعة تظهر هنا — تُحسب في الشهر فقط وليس في مصروف اليوم</div>`;
}
$('#fixedList').addEventListener('click', e=>{
  const x = e.target.closest('[data-fx]'); if (x){ deleteExp(x.dataset.fx); return; }
  const r = e.target.closest('[data-ee]'); if (r) openExpEdit(r.dataset.ee);
});

/* ================= v4.1 finance: edit / delete / ledger / bills / goals ================= */
const fmtClock = t => new Date(t).toLocaleTimeString('ar-EG',{hour:'numeric',minute:'2-digit'});
const subOf = (x, k) => { const c = catOf(x.c); return keyOf(new Date(x.t))===k ? `${c.n}، ${fmtClock(x.t)}` : c.n; };
const catOf = k => CATS.find(c=>c.k===k) || CATS[CATS.length-1];
const daysIn = m => { const [y,mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
const addMonths = (m, n) => { const [y,mo] = m.split('-').map(Number); const d = new Date(y, mo-1+n, 1); return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; };
const monthName = m => { const d = fromKey(m+'-01'); return d.toLocaleDateString('ar-EG', d.getFullYear()===new Date().getFullYear() ? {month:'long'} : {month:'long', year:'numeric'}); };

/* live "this is what will be saved" line under every amount box */
function amtPreview(inp, out){
  const upd = () => {
    const raw = inp.value.trim(); out.className = 'amt-prev';
    if (!raw){ out.textContent = ''; return; }
    const v = parseAmount(raw);
    if (!(v>0)){ out.textContent = '⚠️ اكتب رقماً صحيحاً، مثال: ١٥٠٠'; out.classList.add('bad'); return; }
    const isExpr = /[+\-*/×x÷]/.test(raw.replace(/^[-+]/,''));
    out.textContent = (isExpr ? '🧮 ' : '✓ ') + `سيُسجَّل ${money(v)}`;
    if (v >= BIG_AMT) out.classList.add('warn');
  };
  inp.addEventListener('input', upd); upd(); return upd;
}

/* locate / move / delete any expense (daily or fixed) by id */
const expBox = f => f ? (S.fixed = S.fixed||{}) : S.exp;
function findExp(id){
  for (const k of Object.keys(S.exp)) { const x = (S.exp[k]||[]).find(i=>i.id===id); if (x) return {f:false, k, x}; }
  for (const k of Object.keys(S.fixed||{})) { const x = (S.fixed[k]||[]).find(i=>i.id===id); if (x) return {f:true, k, x}; }
  return null;
}
function pullExp(id){
  const L = findExp(id); if (!L) return null; const box = expBox(L.f);
  box[L.k] = box[L.k].filter(i=>i.id!==id); if (!box[L.k].length) delete box[L.k]; return L;
}
function putExp(f, k, x){ const box = expBox(f); (box[k] = box[k]||[]).push(x); }
const billMonth = L => L.f ? L.k : L.k.slice(0,7);
function setBillPaid(billId, m, on){ const b = S.bills.find(b=>b.id===billId); if (!b) return false; b.paid = b.paid||{}; if (on) b.paid[m] = true; else delete b.paid[m]; return true; }
function deleteExp(id, after){
  const L = pullExp(id); if (!L) return;
  const bm = billMonth(L), billId = L.x.bill; if (billId) setBillPaid(billId, bm, false);
  save(); render(); buzz(10); after && after();
  toast(`تم حذف ${money(L.x.a)}${L.x.n?` «${L.x.n}»`:''}`, {label:'تراجع', fn:()=>{
    if (findExp(id)) return; putExp(L.f, L.k, L.x); if (billId) setBillPaid(billId, bm, true);
    save(); render(); after && after(); toast('تم استرجاع المصروف ↩️');
  }});
}
const catChips = (sel, attr) => CATS.map(c=>`<button type="button" class="cat ${c.k===sel?'on':''}" data-${attr}="${c.k}">${c.e} ${c.n}</button>`).join('');

/* ---------- edit sheet ---------- */
function openExpEdit(id, back){
  const L = findExp(id); if (!L){ toast('لم يعد هذا المصروف موجوداً'); return; }
  const x = L.x; let f = L.f, c = x.c;
  const dVal = L.f ? (L.k===ym() ? today() : L.k+'-01') : L.k;
  sheet(`<h3>✏️ تعديل المصروف</h3><p class="lead">${L.f ? `مصروف ثابت لشهر ${monthName(L.k)}` : `مسجّل في ${relDayFull(L.k)}`}</p>
    <form id="eeF" autocomplete="off" novalidate>
      <div class="field"><label for="eeA">المبلغ (${S.cur})</label><input class="inp amt-big" id="eeA" inputmode="decimal" value="${x.a}"><small class="amt-prev" id="eeP"></small></div>
      <div class="field"><label for="eeN">البيان</label><input class="inp" id="eeN" style="width:100%" maxlength="40" value="${esc(x.n||'')}" placeholder="على ماذا؟ (اختياري)"></div>
      <div class="field"><label>النوع</label><div class="seg etype" id="eeT" style="margin:0"><button type="button" data-et2="d" class="${f?'':'on'}">🛍️ مصروف يومي</button><button type="button" data-et2="f" class="${f?'on':''}">📌 ثابت للشهر</button></div></div>
      <div class="field"><label for="eeD" id="eeDL">${f?'الشهر (اختر أي يوم فيه)':'التاريخ'}</label><input class="inp" type="date" id="eeD" max="${today()}" value="${dVal}" style="width:100%"></div>
      <div class="field"><label>الفئة</label><div class="cats wrap" id="eeC">${catChips(c,'ec')}</div></div>
      ${x.bill ? '<div class="note-line">💡 هذا المصروف مرتبط بفاتورة شهرية. حذفه يلغي علامة «مدفوعة» لهذا الشهر.</div>' : ''}
      <div class="row2" style="margin-top:8px"><button type="button" class="btn ghost" id="eeX">إلغاء</button><button type="submit" class="btn primary">حفظ التعديل</button></div>
      <button type="button" class="btn block danger" id="eeDel" style="margin-top:10px">🗑️ حذف هذا المصروف</button>
    </form>`);
  amtPreview($('#eeA'), $('#eeP'));
  const done = () => { if (back) back(); else { close('#genOv'); render(); } };
  $('#eeX').onclick = done;
  $('#eeT').onclick = e => { const b = e.target.closest('[data-et2]'); if (!b) return; f = b.dataset.et2==='f'; $$('#eeT button').forEach(y=>y.classList.toggle('on', y===b)); $('#eeDL').textContent = f ? 'الشهر (اختر أي يوم فيه)' : 'التاريخ'; buzz(6); };
  $('#eeC').onclick = e => { const b = e.target.closest('[data-ec]'); if (!b) return; c = b.dataset.ec; $$('#eeC .cat').forEach(y=>y.classList.toggle('on', y===b)); buzz(6); };
  $('#eeDel').onclick = () => { if (back) deleteExp(id, ()=>{ if ($('#genOv').classList.contains('show')) back(); }); else { close('#genOv'); deleteExp(id); } };
  $('#eeF').onsubmit = e => {
    e.preventDefault();
    const a = parseAmount($('#eeA').value);
    if (!(a>0) || a>=1e9){ toast('أدخل مبلغاً صحيحاً'); $('#eeA').focus(); return; }
    let d = $('#eeD').value; if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) d = dVal; if (d > today()) d = today();
    const nk = f ? d.slice(0,7) : d;
    const old = pullExp(id); if (!old){ done(); return; }
    const it = old.x, obm = billMonth(old);
    it.a = a; it.n = $('#eeN').value.trim().slice(0,40); it.c = c;
    if (it.bill){
      setBillPaid(it.bill, obm, false);
      if (f) setBillPaid(it.bill, nk, true); else delete it.bill;
    }
    putExp(f, nk, it); save(); buzz(12);
    const moved = old.f!==f || old.k!==nk;
    toast(moved ? `تم الحفظ ✓ ونُقل إلى ${f ? `ثابت ${monthName(nk)}` : relDayFull(nk)}` : 'تم حفظ التعديل ✓');
    if (!back && !f && moved){ bKey = nk; }
    done(); checkAch();
  };
}

/* ---------- month ledger: every expense of a month, searchable ---------- */
let ledM = '', ledC = '', ledQ = '';
function openLedger(m, c){
  ledM = m || ym(bKey); ledC = c || ''; 
  sheet(`<div id="ledHead"></div>
    <div class="led-tools"><input class="inp" id="ledQ" placeholder="🔍 ابحث في مصاريف الشهر…" value="${esc(ledQ)}"></div>
    <div class="cats" id="ledCats" style="margin:4px 0 10px"></div>
    <div id="ledList"></div>
    <div class="row2" style="margin-top:14px"><button class="btn soft" data-csv>📊 تصدير Excel</button><button class="btn primary" data-close>إغلاق</button></div>`);
  $('#ledQ').oninput = e => { ledQ = e.target.value.trim(); renderLedgerList(); };
  $('#ledHead').onclick = e => { const b = e.target.closest('[data-lm]'); if (!b || b.disabled) return; ledM = addMonths(ledM, +b.dataset.lm); ledC = ''; renderLedger(); buzz(6); };
  $('#ledCats').onclick = e => { const b = e.target.closest('[data-lc]'); if (!b) return; ledC = b.dataset.lc; renderLedger(); buzz(6); };
  $('#ledList').onclick = e => {
    const del = e.target.closest('[data-ldel]'); if (del){ deleteExp(del.dataset.ldel, ()=>{ if ($('#ledList')) renderLedger(); }); return; }
    const r = e.target.closest('[data-led]'); if (r) openExpEdit(r.dataset.led, ()=>openLedger(ledM, ledC));
  };
  renderLedger();
}
function renderLedger(){
  if (!$('#ledHead')) return;
  const m = ledM, cur = m===ym(), md = monthDaily(m), mf = fixedSum(m), tot = r2(md+mf);
  const days = Object.keys(S.exp).filter(k=>k.startsWith(m) && (S.exp[k]||[]).length);
  const first = days.slice().sort()[0];
  const span = first ? (cur ? fromKey(today()).getDate() : daysIn(m)) - fromKey(first).getDate() + 1 : 0;
  const top = days.map(k=>[k, daySum(k)]).sort((a,b)=>b[1]-a[1])[0];
  const prevTot = monthTotal(addMonths(m,-1));
  $('#ledHead').innerHTML = `<div class="led-nav"><button data-lm="-1" aria-label="الشهر السابق">›</button><h3>📋 مصاريف ${monthName(m)}</h3><button data-lm="1" ${cur||m>ym()?'disabled':''} aria-label="الشهر التالي">‹</button></div>
    <div class="big-stats led-stats"><div><b>${money(md)}</b><small>🛍️ يومي</small></div><div><b>${money(mf)}</b><small>📌 ثابت</small></div><div class="tot"><b>${money(tot)}</b><small>الإجمالي</small></div></div>
    ${tot ? `<div class="led-facts">${span>0 && md ? `<span>📆 متوسط اليوم: <b>${money(Math.round(md/span))}</b></span>` : ''}${top ? `<span>🔝 أعلى يوم: <b>${dateStr(fromKey(top[0]))}</b> (${money(top[1])})</span>` : ''}${prevTot ? `<span>${tot>prevTot?'📈':'📉'} الشهر السابق: <b>${money(prevTot)}</b></span>` : ''}</div>` : ''}`;
  const cats = monthCats(m), ks = Object.keys(cats).sort((a,b)=>cats[b]-cats[a]);
  $('#ledCats').innerHTML = ks.length ? `<button type="button" class="cat ${!ledC?'on':''}" data-lc="">الكل</button>` + ks.map(k=>`<button type="button" class="cat ${k===ledC?'on':''}" data-lc="${k}">${catOf(k).e} ${catOf(k).n} <small>${ar(Math.round(cats[k]))}</small></button>`).join('') : '';
  renderLedgerList();
}
function renderLedgerList(){
  const el = $('#ledList'); if (!el) return; const m = ledM;
  const q = ledQ.toLowerCase();
  const ok = x => (!ledC || x.c===ledC) && (!q || (x.n||'').toLowerCase().includes(q) || catOf(x.c).n.includes(q) || String(x.a).includes(toEn(q)));
  const row = (x, sub) => { const c = catOf(x.c); return `<div class="exp tap" data-led="${x.id}" role="button"><span class="ce">${c.e}</span><div class="en"><b>${esc(x.n||c.n)}${x.bill?'<span class="tag">فاتورة</span>':''}</b><small>${sub}</small></div><span class="ea">${money(x.a)}</span><button class="x" data-ldel="${x.id}" aria-label="حذف">${X_SVG}</button></div>`; };
  let html = '', shown = 0, sum = 0;
  const fx = ((S.fixed||{})[m]||[]).filter(ok).sort((a,b)=>b.t-a.t);
  if (fx.length){ const s = r2(fx.reduce((a,b)=>a+b.a,0)); shown += fx.length; sum += s;
    html += `<div class="led-day"><b>📌 مصروفات ثابتة</b><span>${money(s)}</span></div><div class="card led-card">${fx.map(x=>row(x, catOf(x.c).n)).join('')}</div>`; }
  Object.keys(S.exp).filter(k=>k.startsWith(m)).sort().reverse().forEach(k=>{
    const L = (S.exp[k]||[]).filter(ok).sort((a,b)=>b.t-a.t); if (!L.length) return;
    const s = r2(L.reduce((a,b)=>a+b.a,0)); shown += L.length; sum += s;
    html += `<div class="led-day"><b>${relDayFull(k)}</b><span>${money(s)}</span></div><div class="card led-card">${L.map(x=>row(x, subOf(x, k))).join('')}</div>`;
  });
  const filt = ledC || q;
  el.innerHTML = (filt && shown ? `<div class="led-sum">${ar(shown)} عملية — المجموع <b>${money(r2(sum))}</b></div>` : '') +
    (html || `<div class="empty"><span class="e">${filt?'🔍':'🪙'}</span>${filt?'لا توجد نتائج':'لا مصاريف مسجلة في هذا الشهر'}</div>`) +
    (shown ? '<small class="hint-line">اضغط على أي مصروف لتعديله أو نقله ليوم آخر</small>' : '');
}


/* ---------- bills: pay with the real amount, edit, undo payment ---------- */
function payBill(id){
  const b = S.bills.find(x=>x.id===id); if (!b) return;
  const m = ym();
  if ((b.paid||{})[m]){ toast('مدفوعة بالفعل هذا الشهر ✓'); return; }
  sheet(`<h3>${catOf(b.c||'b').e} دفع «${esc(b.n)}»</h3><p class="lead">اكتب المبلغ الفعلي المدفوع — يُضاف إلى المصروفات الثابتة لشهر ${monthName(m)}</p>
    <form id="pbF" autocomplete="off" novalidate>
      <div class="field"><label for="pbA">المبلغ المدفوع (${S.cur})</label><input class="inp amt-big" id="pbA" inputmode="decimal" value="${b.a}"><small class="amt-prev" id="pbP"></small></div>
      <label class="opt-chk"><input type="checkbox" id="pbU"><span>اجعل هذا المبلغ هو المبلغ المعتاد للفاتورة</span></label>
      <div class="row2" style="margin-top:12px"><button type="button" class="btn ghost" data-close>إلغاء</button><button type="submit" class="btn primary">✓ تم الدفع</button></div>
    </form>`);
  amtPreview($('#pbA'), $('#pbP'));
  $('#pbF').onsubmit = e => {
    e.preventDefault(); const a = parseAmount($('#pbA').value);
    if (!(a>0) || a>=1e9){ toast('أدخل مبلغاً صحيحاً'); return; }
    const eid = uid();
    b.paid = b.paid||{}; b.paid[m] = true; if ($('#pbU').checked) b.a = a;
    putExp(true, m, {id:eid, a, n:b.n, c:b.c||'b', t:Date.now(), bill:b.id}); inc('bills');
    save(); close('#genOv'); render(); buzz(15); checkAch();
    toast(`تم تسجيل دفع «${b.n}» — ${money(a)}`, {label:'تراجع', fn:()=>{ pullExp(eid); setBillPaid(b.id, m, false); save(); render(); toast('تم إلغاء الدفع ↩️'); }});
  };
}
function unpayBill(id){
  const m = ym(); const box = (S.fixed||{})[m]||[]; const it = box.find(x=>x.bill===id);
  if (it) deleteExp(it.id); else { setBillPaid(id, m, false); save(); render(); toast('تم إلغاء علامة الدفع'); }
}
function openBillEdit(id){
  const b = S.bills.find(x=>x.id===id); if (!b) return; const paid = !!(b.paid||{})[ym()];
  formSheet({
    title:`✏️ تعديل «${esc(b.n)}»`, lead: paid ? '✓ مدفوعة هذا الشهر' : 'عدّل البيانات ثم اضغط حفظ',
    fields:[
      {id:'n', label:'اسم الفاتورة', value:b.n, max:30},
      {id:'a', label:'المبلغ المعتاد', type:'number', value:b.a},
      {id:'day', label:'يوم الاستحقاق من كل شهر', type:'select', value:b.day, options:Array.from({length:31},(_,i)=>[i+1, `يوم ${ar(i+1)}`])},
      {id:'c', label:'الفئة', type:'pick', value:b.c||'b', options:CATS.map(c=>[c.k, `${c.e} ${c.n}`])}
    ], submit:'حفظ',
    onSubmit:v=>{ if (!v.n) return 'اكتب اسم الفاتورة'; if (!(v.a>0)) return 'أدخل مبلغاً صحيحاً'; b.n = v.n; b.a = r2(v.a); b.day = +v.day; b.c = v.c||'b'; save(); toast('تم حفظ الفاتورة ✓'); }
  });
  const fs = $('#fs'); const extra = document.createElement('div'); extra.style.marginTop = '10px';
  extra.innerHTML = (paid ? `<button type="button" class="btn block soft" id="beUnpay" style="margin-bottom:10px">↩️ إلغاء علامة «مدفوعة» لهذا الشهر</button>` : `<button type="button" class="btn block soft" id="bePay" style="margin-bottom:10px">✓ سجّل الدفع الآن</button>`) +
    `<button type="button" class="btn block danger" id="beDel">🗑️ حذف الفاتورة</button>`;
  fs.appendChild(extra);
  const up = $('#beUnpay'); if (up) up.onclick = () => { close('#genOv'); unpayBill(b.id); };
  const pp = $('#bePay'); if (pp) pp.onclick = () => payBill(b.id);
  $('#beDel').onclick = () => { close('#genOv'); undoable(`تم حذف فاتورة «${b.n}»`, ()=>{ S.bills = S.bills.filter(x=>x.id!==b.id); }); };
}

/* ---------- savings goals: deposit / withdraw / edit ---------- */
function openGoalMove(id){
  const g = S.goals.find(x=>x.id===id); if (!g) return;
  formSheet({ title:`${g.e} «${esc(g.n)}»`, lead:`مدّخر ${money(g.saved)} من ${money(g.target)} — المتبقي ${money(Math.max(0, r2(g.target-g.saved)))}`,
    fields:[{id:'t', label:'العملية', type:'pick', value:'in', options:[['in','➕ إيداع'],['out','➖ سحب']]}, {id:'a', label:'المبلغ', type:'number', placeholder:'مثال: ٢٠٠'}], submit:'تأكيد',
    onSubmit:v=>{ if (!(v.a>0)) return 'أدخل مبلغاً صحيحاً';
      if (v.t==='out'){ if (v.a > g.saved) return `أقصى مبلغ للسحب ${money(g.saved)}`; g.saved = r2(g.saved - v.a); if (g.saved < g.target) delete g.doneAt; toast(`تم سحب ${money(v.a)}`); }
      else { g.saved = r2(g.saved + v.a);
        if (g.saved>=g.target && !g.doneAt){ g.doneAt = today(); setTimeout(()=>{ confetti(); toast(`🎉 مبروك! حققت هدف «${g.n}»`); buzz([20,60,20,60,20]); checkAch(); }, 400); } else toast(`تم إيداع ${money(v.a)} 🐷`); }
      save(); } });
}
function openGoalEdit(id){
  const g = S.goals.find(x=>x.id===id); if (!g) return;
  formSheet({ title:'✏️ تعديل الهدف', fields:[
      {id:'n', label:'اسم الهدف', value:g.n, max:30}, {id:'t', label:'المبلغ المطلوب', type:'number', value:g.target},
      {id:'s', label:'المدّخر حالياً', type:'number', value:g.saved}, {id:'e', label:'أيقونة', type:'pick', value:g.e, options:GOAL_EMO.map(x=>[x,x])}], submit:'حفظ',
    onSubmit:v=>{ if (!v.n) return 'اكتب اسم الهدف'; if (!(v.t>0)) return 'أدخل المبلغ المطلوب'; g.n = v.n; g.target = r2(v.t); g.saved = v.s>0 ? r2(v.s) : 0; g.e = v.e||g.e;
      if (g.saved>=g.target){ g.doneAt = g.doneAt||today(); } else delete g.doneAt; save(); toast('تم حفظ الهدف ✓'); } });
  const extra = document.createElement('button'); extra.type = 'button'; extra.className = 'btn block danger'; extra.style.marginTop = '10px'; extra.textContent = '🗑️ حذف الهدف';
  extra.onclick = () => { close('#genOv'); undoable(`تم حذف هدف «${g.n}»`, ()=>{ S.goals = S.goals.filter(x=>x.id!==g.id); }); };
  $('#fs').appendChild(extra);
}

/* ---------- calendar ---------- */
let calMonth = (()=>{ const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(), calSel = today();
const EVT_EMO = ['📌','🩺','🎂','🎉','👥','🏫','💊','🛒','🧹','✈️','🕌','💼','💇‍♀️','🚗','💍','👶'];
function dayMarks(k){
  const d = fromKey(k), last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  const ev = S.tasks.filter(t=>t.f && (t.f.t==='o'||t.f.t==='y') && isDue(t,k));
  const rep = S.tasks.filter(t=>t.f && (t.f.t==='w'||t.f.t==='m') && isDue(t,k));
  const bills = S.bills.filter(b=>Math.min(b.day,last)===d.getDate());
  return {ev, rep, bills};
}
function renderCal(){
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  $('#calTitle').textContent = calMonth.toLocaleDateString('ar-EG',{month:'long', year:'numeric'});
  $('#calWd').innerHTML = WD_ORDER.map(i=>`<span>${WD[i].replace('ال','').slice(0,3)}</span>`).join('');
  const first = new Date(y, m, 1), off = WD_ORDER.indexOf(first.getDay());
  const days = new Date(y, m+1, 0).getDate(), cells = Math.ceil((off+days)/7)*7, t = today();
  let html = '';
  for (let i=0;i<cells;i++){
    const d = new Date(y, m, 1 - off + i), k = keyOf(d), mk = dayMarks(k), h = (S.hist||{})[k];
    const full = k<=t && h && h.t>0 && h.d>=h.t;
    const dots = (mk.ev.length?'<i style="background:var(--lav-d)"></i>':'') + (mk.rep.length?'<i style="background:var(--sage-d)"></i>':'') + (mk.bills.length?'<i style="background:var(--peach-d)"></i>':'');
    html += `<button class="${d.getMonth()!==m?'out':''} ${k===t?'today':''} ${k===calSel?'sel':''} ${full?'full':''}" data-ck="${k}" aria-label="${dateStr(d)}">${ar(d.getDate())}<span class="dots">${dots}</span></button>`;
  }
  $('#calGrid').innerHTML = html;
  renderCalDay();
}
function renderCalDay(){
  const k = calSel, d = fromKey(k), t = today(), future = k>t;
  const ids = new Set(S.done[k]||[]); const due = S.tasks.filter(x=>isDue(x,k));
  const special = due.filter(x=>x.f && x.f.t!=='d').sort(byTime), daily = due.filter(x=>!x.f || x.f.t==='d');
  const mk = dayMarks(k); const meals = S.meals[k]||{}; const spent = daySum(k);
  const extra = [
    ...mk.bills.map(b=>`<span>💡 ${esc(b.n)} — ${money(b.a)}${(b.paid||{})[k.slice(0,7)]?' ✓':''}</span>`),
    ...MEALS.filter(x=>meals[x.k]).map(x=>`<span>${x.e} ${esc(meals[x.k])}</span>`),
    ...(spent ? [`<span>💰 مصروف: ${money(spent)}</span>`] : [])
  ];
  const rel = relDay(k);
  $('#calDay').innerHTML = `<div class="day-h"><b>${dayName(d)}، ${dateStr(d)}</b><small>${/^(اليوم|غداً|أمس|بعد غد)$/.test(rel)?rel:''}</small></div>
    ${extra.length?`<div class="day-extra">${extra.join('')}</div>`:''}
    ${special.length ? special.map(x=>taskRow(x, ids.has(x.id), {future, del: x.f.t==='o'||x.f.t==='y'})).join('') : `<div class="card empty" style="padding:16px"><span class="e">🗓️</span>لا مواعيد أو مهام خاصة في هذا اليوم</div>`}
    ${daily.length ? `<details class="gitem" style="margin-top:4px"><summary>🌿 المهام اليومية <span class="nb">${ar(daily.filter(x=>ids.has(x.id)).length)}/${ar(daily.length)}</span></summary><div style="padding:0 10px 4px">${daily.map(x=>taskRow(x, ids.has(x.id), {future})).join('')}</div></details>` : ''}
    <button class="btn primary block" id="calAdd" style="margin-top:12px">+ أضف موعداً أو مهمة في ${rel==='اليوم'?'هذا اليوم':relDayFull(k)}</button>`;
}
$('#calPrev').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()-1, 1); renderCal(); buzz(6); };
$('#calNext').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 1); renderCal(); buzz(6); };
$('#calGrid').addEventListener('click', e=>{ const b = e.target.closest('[data-ck]'); if(!b) return; calSel = b.dataset.ck; const d = fromKey(calSel);
  if (d.getMonth()!==calMonth.getMonth()) calMonth = new Date(d.getFullYear(), d.getMonth(), 1); renderCal(); buzz(6); });
$('#calDay').addEventListener('click', e=>{
  if (e.target.closest('#calAdd')){ openAddEvent(calSel); return; }
  const del = e.target.closest('[data-tdel]');
  if (del){ e.stopPropagation(); const t = S.tasks.find(x=>x.id===del.dataset.tdel); undoable(`تم حذف «${t?t.n:''}»`, ()=>{ S.tasks = S.tasks.filter(x=>x.id!==del.dataset.tdel); }); return; }
  const el = e.target.closest('.task'); if(!el) return;
  if (el.classList.contains('future')){ toast('هذا اليوم لم يأتِ بعد — ستتمكن من إنجازها في يومها'); return; }
  toggleTask(el.dataset.id, el, calSel);
  if (calSel===today()) setTimeout(()=>{ if (seg==='cal' && tab==='tasks') renderCal(); }, 700);
});
function openAddEvent(k){
  const d = fromKey(k);
  const times = [['','بدون وقت']]; for (let h=5; h<24; h++) for (const mm of [0,30]){ const v = `${pad(h)}:${pad(mm)}`; times.push([v, fmtTime(v)]); }
  const fields = [
    {id:'n', label:'العنوان', placeholder:'مثال: موعد الدكتور، عيد ميلاد سارة، زيارة ماما', max:50},
    {id:'e', label:'الرمز', type:'pick', value:'📌', options:EVT_EMO.map(x=>[x,x])},
    {id:'tm', label:'الوقت (اختياري)', type:'select', value:'', options:times},
    {id:'rep', label:'التكرار', type:'pick', value:'o', options:[['o','مرة واحدة'],['w',`كل ${dayName(d)}`],['m',`كل شهر يوم ${ar(d.getDate())}`],['y','كل سنة (مناسبة)']]}
  ];
  if (S.members.length) fields.push({id:'who', label:'لمن؟', type:'pick', value:'', options:[['','👥 للجميع'], ...S.members.map(m=>[m.id, m.n])]});
  formSheet({ title:'📅 موعد أو مهمة جديدة', lead:`${dayName(d)}، ${dateStr(d)}`, fields, submit:'إضافة للتقويم',
    onSubmit: v => {
      if (!v.n) return 'اكتب العنوان';
      const f = v.rep==='w' ? {t:'w', d:[d.getDay()]} : v.rep==='m' ? {t:'m', d:d.getDate()} : v.rep==='y' ? {t:'y', m:d.getMonth()+1, d:d.getDate()} : {t:'o', k};
      if (!addTask(v.n, v.e||'📌', f, v.who||'', v.tm||'')) return 'موجودة بالفعل';
      buzz(12); toast(`أضيفت — ${freqLabel(f)}${v.tm?' ⏰ '+fmtTime(v.tm):''}`);
    }});
}
$('#hNextTile').onclick = () => { seg='cal'; calSel=today(); go('tasks'); };

/* ---------- home tools ---------- */
$('#tools').addEventListener('click', e=>{ const b = e.target.closest('[data-tool]'); if (b){ buzz(8); openTool(b.dataset.tool); } });
function openTool(t){
  if (t==='cal'){ close('#genOv'); seg='cal'; calSel=today(); calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); go('tasks'); return; }
  if (t==='recipes'){ close('#genOv'); $('#browseBtn').click(); return; }
  ({timer:openTimers, lists:openLists, guide:()=>openGuide(), conv:openConv, expiry:openExpiry, notes:openNotes, contacts:openContacts, subs:()=>openGuide('subs'), search:()=>openSearch()})[t]();
}
function renderHomeV4(){
  const run = (S.timers||[]).length; $('#toolTimerS').textContent = run ? `${ar(run)} يعمل الآن ⏳` : 'عدة مؤقتات معاً';
  const soon = (S.expiry||[]).filter(x=>xDiff(x)<=3).length; $('#toolExpS').textContent = soon ? `⚠️ ${ar(soon)} قارب على الانتهاء` : (S.expiry||[]).length ? `${ar(S.expiry.length)} صنف تحت المتابعة` : 'تنبيه قبل الانتهاء';
  $('#toolNotesS').textContent = (S.notes||[]).length ? `${ar(S.notes.length)} ملاحظة` : 'ملاحظات للعائلة وتذكيرات';
  const due = (S.expiry||[]).filter(x=>xDiff(x)<=2).sort((a,b)=>a.k<b.k?-1:1).slice(0,2);
  $('#expBanner').innerHTML = due.map(x=>{ const n = xDiff(x); return `<div class="banner ${n<0?'late':'xb'}"><span class="be">🥫</span><span class="bt">${esc(x.n)}<small>${xLabel(x)}</small></span><button data-xdone="${x.id}" style="background:#B8963A">تم ✓</button></div>`; }).join('');
  const pins = (S.notes||[]).filter(n=>n.pin).slice(0,2);
  $('#homeNotes').innerHTML = pins.map(n=>`<div class="note" style="background:${n.c}" data-open-notes>${esc(n.t)}<div class="na"><button data-unpin="${n.id}" aria-label="إلغاء التثبيت">📌</button></div></div>`).join('');
}
$('#expBanner').addEventListener('click', e=>{ const b = e.target.closest('[data-xdone]'); if (b){ S.expiry = S.expiry.filter(x=>x.id!==b.dataset.xdone); save(); renderHome(); toast('تمت إزالته من المتابعة'); } });
$('#homeNotes').addEventListener('click', e=>{ const u = e.target.closest('[data-unpin]'); if (u){ const n = S.notes.find(n=>n.id===u.dataset.unpin); if (n){ n.pin=false; save(); renderHome(); toast('أزيل التثبيت'); } return; } if (e.target.closest('[data-open-notes]')) openNotes(); });

/* ---------- kitchen timers ---------- */
let audioCtx = null, tickT = null, alarmT = null, ringing = null;
function ensureAudio(){ try { if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); if (audioCtx.state==='suspended') audioCtx.resume(); } catch(e){} }
function beep(){ if (!audioCtx) return; try { [0, .22, .44].forEach(o=>{ const os = audioCtx.createOscillator(), g = audioCtx.createGain(); os.type='sine'; os.frequency.value = 880; g.gain.setValueAtTime(0.0001, audioCtx.currentTime+o); g.gain.exponentialRampToValueAtTime(0.35, audioCtx.currentTime+o+.02); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+o+.18); os.connect(g).connect(audioCtx.destination); os.start(audioCtx.currentTime+o); os.stop(audioCtx.currentTime+o+.2); }); } catch(e){} }
const mmss = ms => { const s = Math.max(0, Math.ceil(ms/1000)), h = Math.floor(s/3600), m = Math.floor(s%3600/60), x = s%60; return (h?`${h}:${pad(m)}`:`${m}`) + `:${pad(x)}`; };
function startTimer(n, min, e='⏱️'){
  ensureAudio(); min = Math.max(1, Math.min(600, Math.round(min)));
  S.timers.push({id:uid(), n, e, dur:min*60000, end:Date.now()+min*60000}); inc('timers'); save(); checkAch();
  toast(`⏱️ بدأ مؤقت «${n}» — ${ar(min)} دقيقة`); buzz(12); tickTimers();
}
function tickTimers(){
  const now = Date.now(), L = (S.timers||[]).slice().sort((a,b)=>a.end-b.end), pill = $('#timerPill');
  document.body.classList.toggle('pill-on', L.length>0);
  if (!L.length){ pill.hidden = true; clearInterval(tickT); tickT = null; return; }
  if (!tickT) tickT = setInterval(tickTimers, 1000);
  const done = L.find(t=>t.end<=now);
  if (done && !ringing) ring(done);
  const nx = done || L.find(t=>t.end>now) || L[0];
  pill.hidden = false; pill.classList.toggle('ring', !!done);
  pill.innerHTML = done ? `⏰ انتهى: ${esc(done.n)}` : `${nx.e} ${esc(nx.n)} <span dir="ltr">${mmss(nx.end-now)}</span>${L.length>1?` <small style="opacity:.7">+${ar(L.length-1)}</small>`:''}`;
  $$('[data-tleft]').forEach(el=>{ const t = S.timers.find(x=>x.id===el.dataset.tleft); if (!t) return; el.textContent = mmss(t.end-now); const bar = el.closest('.tmr').querySelector('.tb i'); if (bar) bar.style.width = Math.min(100, (1-(t.end-now)/t.dur)*100)+'%'; });
}
function ring(t){
  ringing = t.id; $('#alarmTitle').textContent = `${t.e} انتهى: ${t.n}`; $('#alarmLead').textContent = `مرّت ${ar(Math.round(t.dur/60000))} دقيقة`;
  open('#alarmOv'); ensureAudio(); beep(); buzz([300,150,300,150,300]);
  let n = 0; clearInterval(alarmT); alarmT = setInterval(()=>{ beep(); if (++n % 3 === 0) buzz([300,150,300]); if (n>60) clearInterval(alarmT); }, 1300);
}
function stopAlarm(snooze){
  clearInterval(alarmT); close('#alarmOv');
  const t = S.timers.find(x=>x.id===ringing); ringing = null;
  if (t){ if (snooze){ t.end = Date.now()+5*60000; t.dur = 5*60000; toast('⏰ سيرن مرة أخرى بعد ٥ دقائق'); } else S.timers = S.timers.filter(x=>x.id!==t.id); }
  save(); tickTimers(); if ($('#genOv').classList.contains('show') && $('#tmrList')) renderTimerList(); if (tab==='home') renderHomeV4();
}
$('#alarmOk').onclick = () => stopAlarm(false);
document.addEventListener('pointerdown', ()=>{ if (ringing){ ensureAudio(); } }, true);
$('#alarmSnooze').onclick = () => stopAlarm(true);
$('#timerPill').onclick = () => { if (ringing) open('#alarmOv'); else openTimers(); };
function openTimers(){
  sheet(`<h3>⏱️ مؤقت المطبخ</h3><p class="lead">شغّل أكثر من مؤقت معاً — يرن بصوت واهتزاز والتطبيق مفتوح</p>
    <div id="tmrList"></div>
    <div class="sec-mini">ابدأ بلمسة</div>
    <div class="presets">${(C.timers||[]).map(p=>`<button data-tadd="${esc(p.n)}|${p.m}|${p.e}"><span>${p.e}</span>${esc(p.n)}<small>${ar(p.m)} د</small></button>`).join('')}</div>
    <div class="sec-mini">مؤقت خاص</div>
    <div class="conv-row"><input class="inp" id="tmN" placeholder="الاسم (مثلاً: المحشي)" maxlength="24"><input class="inp" id="tmM" inputmode="numeric" placeholder="الدقائق"></div>
    <div class="row2"><button class="btn soft" data-tcustom>▶️ ابدأ</button><button class="btn primary" data-close>تم</button></div>`);
  renderTimerList();
}
function renderTimerList(){
  const L = (S.timers||[]).slice().sort((a,b)=>a.end-b.end), el = $('#tmrList'); if (!el) return;
  el.innerHTML = L.length ? L.map(t=>`<div class="tmr"><span style="font-size:26px">${t.e}</span><div class="tn"><b>${esc(t.n)}</b><div class="tb"><i style="width:${Math.min(100,(1-(t.end-Date.now())/t.dur)*100)}%"></i></div></div><span class="tt" data-tleft="${t.id}">${mmss(t.end-Date.now())}</span><button data-tplus="${t.id}" aria-label="دقيقة إضافية">+١</button><button data-tcancel="${t.id}" aria-label="إلغاء">${X_SVG}</button></div>`).join('') : `<div class="empty" style="padding:6px"><span class="e">⏳</span>لا توجد مؤقتات تعمل الآن</div>`;
}

/* ---------- ready checklists ---------- */
const allLists = () => (C.checklists||[]).concat(S.myCl||[]);
function openLists(){
  sheet(`<h3>📋 قوائم جاهزة</h3><p class="lead">اضغط على أي قائمة وعلّم ما أنجزته — تُحفظ تلقائياً</p>` +
    allLists().map(l=>{ const d = (S.cl[l.id]||[]).length, n = l.items.length; return `<button class="cl-card" data-cl="${l.id}"><span class="ce">${l.e}</span><span class="cn"><b>${esc(l.n)}</b><small>${d===n?'✓ مكتملة':`${ar(d)} من ${ar(n)}`}</small><div class="bar"><i style="width:${d/n*100}%"></i></div></span></button>`; }).join('') +
    `<div class="row2"><button class="btn soft" data-clnew>✍️ قائمة خاصة بك</button><button class="btn primary" data-close>إغلاق</button></div>`);
}
function openList(id){
  const l = allLists().find(x=>x.id===id); if (!l) return openLists();
  const done = new Set(S.cl[id]||[]);
  sheet(`<h3>${l.e} ${esc(l.n)}</h3><p class="lead" id="clProg">${ar(done.size)} من ${ar(l.items.length)}</p>` +
    l.items.map((it,i)=>`<div class="task ${done.has(i)?'done':''}" data-cli="${i}" data-clid="${id}" role="checkbox" aria-checked="${done.has(i)}" tabindex="0">${CHECK_SVG}<span class="meta"><span class="name"><s>${esc(it)}</s></span></span></div>`).join('') +
    `<div class="row2"><button class="btn soft" data-clreset="${id}">↺ ابدأ من جديد</button><button class="btn primary" data-tool="lists">رجوع</button></div>${l.mine?`<button class="btn block danger" style="margin-top:10px" data-cldel="${id}">حذف القائمة</button>`:''}`);
}
function newList(){
  formSheet({ title:'✍️ قائمة جديدة', lead:'مثلاً: تجهيز عيد ميلاد، مشتريات الشتاء…', submit:'حفظ القائمة',
    fields:[{id:'n', label:'اسم القائمة', max:40, placeholder:'تجهيز عيد ميلاد أحمد'}, {id:'e', label:'الرمز', type:'pick', value:'📝', options:['📝','🎂','🎁','🧳','🏠','🧺','🍽️','🎒'].map(x=>[x,x])}, {id:'items', label:'العناصر — كل عنصر في سطر', type:'textarea', placeholder:'التورتة\nالبالونات\nالهدايا'}],
    onSubmit: v => { const items = v.items.split(/\n+/).map(x=>x.trim()).filter(Boolean).slice(0,40); if (!v.n) return 'اكتب اسم القائمة'; if (!items.length) return 'أضف عنصراً واحداً على الأقل';
      S.myCl.push({id:'my'+uid(), n:v.n, e:v.e||'📝', items, mine:true}); save(); toast('تم حفظ قائمتك ✓'); setTimeout(openLists, 350); } });
}

/* ---------- home guide ---------- */
const GCATS = [['stain','🧴 البقع'],['clean','🧽 التنظيف'],['laundry','🧺 الغسيل'],['kitchen','🍳 أسرار المطبخ'],['subs','🔄 البدائل'],['spice','🌶️ التوابل'],['store','🧊 حفظ الطعام']];
let gCat = 'stain';
function openGuide(c){
  if (c) gCat = c;
  sheet(`<h3>📖 دليل البيت</h3><p class="lead">حلول مجرّبة لكل مشكلة في البيت</p>
    <input class="inp search" id="gSearch" placeholder="🔍 ابحث: قهوة، فرن، صوف، أرز…" style="width:100%;margin-bottom:10px">
    <div class="mf" id="gCats"></div><div id="gList"></div><button class="btn primary block" data-close style="margin-top:10px">إغلاق</button>`);
  $('#gSearch').addEventListener('input', renderGuide); renderGuide();
}
function renderGuide(){
  const q = ($('#gSearch')||{value:''}).value.trim();
  $('#gCats').innerHTML = GCATS.map(([k,n])=>`<button class="mini ${gCat===k&&!q?'on':''}" data-gc="${k}">${n}</button>`).join('');
  const storeRows = (C.storage||[]).filter(r=>!q || r.n.includes(q));
  const items = (C.guide||[]).filter(g=> q ? (g.n.includes(q) || g.s.some(s=>s.includes(q))) : g.c===gCat);
  const table = storeRows.length ? `<table class="stbl"><tr><th>الطعام</th><th>🧊 الثلاجة</th><th>❄️ الفريزر</th></tr>${storeRows.map(r=>`<tr><td>${r.e} ${esc(r.n)}</td><td>${esc(r.f)}</td><td>${esc(r.z)}</td></tr>`).join('')}</table>` : '';
  const list = items.map(g=>`<details class="gitem"><summary><span style="font-size:20px">${g.e}</span>${esc(g.n)}</summary><ol>${g.s.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></details>`).join('');
  $('#gList').innerHTML = q ? (list + (table?`<div class="sec-mini">🧊 حفظ الطعام</div>${table}`:'')) || `<div class="empty"><span class="e">🔍</span>لا نتائج</div>`
    : gCat==='store' ? `<p style="color:var(--muted);font-size:14px;font-weight:600;margin:4px 4px 10px">المدد تقريبية للطعام المحفوظ جيداً في علب مغلقة. الثلاجة ٤°م أو أقل، والفريزر −١٨°م.</p>${table}` : list;
}

/* ---------- kitchen converter ---------- */
const UNITS = [['1','كوب'],['0.5','½ كوب'],['0.3333','⅓ كوب'],['0.25','¼ كوب'],['0.0625','ملعقة كبيرة'],['0.0208','ملعقة صغيرة'],['g','جرام ← أكواب']];
function openConv(){
  const C2 = C.conv||[];
  sheet(`<h3>⚖️ محوّل المقادير</h3><p class="lead">حوّل الأكواب والملاعق إلى جرامات والعكس</p>
    <div class="field"><label>المكوّن</label><select class="inp" id="cvIng" style="width:100%">${C2.map((c,i)=>`<option value="${i}">${esc(c.n)}</option>`).join('')}</select></div>
    <div class="conv-row"><input class="inp" id="cvAmt" inputmode="decimal" value="1" aria-label="الكمية"><select class="inp" id="cvUnit">${UNITS.map(u=>`<option value="${u[0]}">${u[1]}</option>`).join('')}</select></div>
    <div class="conv-res" id="cvRes"></div>
    <div id="cvTbl"></div>
    <div class="sec-mini">🔥 درجات حرارة الفرن</div>
    <table class="stbl"><tr><th>°م</th><th>°ف</th><th>الاستخدام</th></tr>${(C.oven||[]).map(o=>`<tr><td><b>${ar(o.c)}</b></td><td>${ar(o.f)}</td><td>${esc(o.n)}</td></tr>`).join('')}</table>
    <p style="color:var(--muted);font-size:13px;font-weight:600;margin:10px 4px">الكوب = ٢٤٠ مل، الملعقة الكبيرة = ١٥ مل، الصغيرة = ٥ مل. القيم تقريبية.</p>
    <button class="btn primary block" data-close>تم</button>`);
  const upd = () => {
    const c = C2[+$('#cvIng').value]; if (!c) return; const a = parseFloat(toEn($('#cvAmt').value))||0; const u = $('#cvUnit').value;
    if (u==='g'){ const cups = a / c.g; $('#cvRes').innerHTML = `<b>${fracCups(cups)}</b><small>${ar(a)} جرام ${esc(c.n)} ≈ ${ar(Math.round(cups*16*10)/10)} ملعقة كبيرة</small>`; }
    else { const g = a * parseFloat(u) * c.g; $('#cvRes').innerHTML = `<b>${ar(Math.round(g))} جرام</b><small>${ar(a)} × ${UNITS.find(x=>x[0]===u)[1]} ${esc(c.n)}</small>`; }
    $('#cvTbl').innerHTML = `<table class="stbl"><tr><th>${esc(c.n)}</th><th>بالجرام</th></tr>${UNITS.slice(0,6).map(x=>`<tr><td>${x[1]}</td><td>${ar(Math.round(parseFloat(x[0])*c.g))} جم</td></tr>`).join('')}</table>`;
  };
  ['cvIng','cvAmt','cvUnit'].forEach(id=>$('#'+id).addEventListener('input', upd)); $('#cvIng').addEventListener('change', upd); $('#cvUnit').addEventListener('change', upd); upd();
}
function fracCups(x){ const w = Math.floor(x), r = x - w; const fr = r<.125?'':r<.29?'¼':r<.42?'⅓':r<.58?'½':r<.71?'⅔':r<.875?'¾':''; const W = r>=.875 ? w+1 : w; return `≈ ${W?ar(W):''}${fr?(W?' و':'')+fr:''}${!W&&!fr?'أقل من ¼':''} كوب`; }

/* ---------- expiry tracker ---------- */
const xDiff = x => Math.round((fromKey(x.k)-fromKey(today()))/864e5);
const xLabel = x => { const n = xDiff(x); return n<0 ? `انتهت صلاحيته منذ ${daysAr(-n)}` : n===0 ? 'ينتهي اليوم' : n===1 ? 'ينتهي غداً' : `ينتهي بعد ${daysAr(n)}`; };
function openExpiry(){
  sheet(`<h3>🥫 متابعة الصلاحية</h3><p class="lead">الأدوية، الألبان، المعلبات، الفريزر… ننبهك قبلها بيومين في الرئيسية</p>
    <div class="card" style="padding:14px;margin-bottom:12px">
      <input class="inp" id="xpN" placeholder="الصنف (مثلاً: زبادي، شراب الكحة)" maxlength="40" style="width:100%;margin-bottom:8px">
      <input type="date" class="inp" id="xpD" style="width:100%;margin-bottom:8px" value="${addDays(today(),7)}" min="${addDays(today(),-30)}">
      <div class="mini-chips" style="margin-bottom:10px">${[[3,'+٣ أيام'],[7,'+أسبوع'],[30,'+شهر'],[90,'+٣ أشهر'],[365,'+سنة']].map(([n,l])=>`<button type="button" class="mini" data-xq="${n}">${l}</button>`).join('')}</div>
      <button class="btn primary block" data-xadd>+ أضف للمتابعة</button>
    </div><div id="xpList"></div><button class="btn ghost block" data-close style="margin-top:6px">إغلاق</button>`);
  renderExpiry();
}
function renderExpiry(){
  const L = (S.expiry||[]).slice().sort((a,b)=>a.k<b.k?-1:1), el = $('#xpList'); if (!el) return;
  el.innerHTML = L.length ? L.map(x=>{ const n = xDiff(x); return `<div class="xp"><span style="font-size:22px">${n<0?'⛔':n<=2?'⚠️':'🟢'}</span><div class="xn"><b>${esc(x.n)}</b><span class="pill ${n<0?'late':n<=2?'soon':'ok'}">${xLabel(x)}</span></div><button data-xshop="${x.id}">🛒</button><button data-xdel="${x.id}">✓ استُخدم</button></div>`; }).join('')
    : `<div class="empty"><span class="e">🥫</span>لا توجد أصناف تحت المتابعة</div>`;
}

/* ---------- family notes board ---------- */
const NCOL = ['#FFF1B8','#E4F0E8','#EEEAF8','#FCEDE4','#E8F2F8','#FBEAEE'];
let nCol = NCOL[0];
function openNotes(){
  sheet(`<h3>📝 لوحة ملاحظات البيت</h3><p class="lead">تذكيرات للعائلة — ثبّت المهم ليظهر في الرئيسية</p>
    <div class="card" style="padding:14px;margin-bottom:12px"><textarea class="inp ta" id="ntT" maxlength="400" style="width:100%" placeholder="مثال: أحمد عنده تمرين الخميس ٥ مساءً…"></textarea>
    <div class="colors" id="ntC">${NCOL.map(c=>`<button type="button" style="background:${c}" class="${c===nCol?'on':''}" data-ncol="${c}" aria-label="لون"></button>`).join('')}</div>
    <div class="row2"><button class="btn soft" data-nadd="pin">📌 أضف ومثّبتها</button><button class="btn primary" data-nadd="1">+ أضف</button></div></div>
    <div id="ntList"></div><button class="btn ghost block" data-close style="margin-top:6px">إغلاق</button>`);
  renderNotes();
}
function renderNotes(){
  const el = $('#ntList'); if (!el) return; const L = (S.notes||[]).slice().sort((a,b)=>(b.pin-a.pin)||(b.ts-a.ts));
  el.innerHTML = L.length ? L.map(n=>`<div class="note" style="background:${n.c};padding-left:84px">${esc(n.t)}<small>${new Date(n.ts).toLocaleDateString('ar-EG',{day:'numeric',month:'long'})}${n.pin?' • مثبتة في الرئيسية':''}</small><div class="na"><button data-npin="${n.id}" style="opacity:${n.pin?1:.45}" aria-label="تثبيت">📌</button><button data-ndel="${n.id}" aria-label="حذف">✕</button></div></div>`).join('')
    : `<div class="empty"><span class="e">🗒️</span>لا توجد ملاحظات بعد</div>`;
}

/* ---------- one delegated handler for v4 sheets ---------- */
$('#genSheet').addEventListener('click', e=>{
  const g = s => e.target.closest(s);
  let b;
  if ((b = g('[data-tool]'))) { openTool(b.dataset.tool); return; }
  if ((b = g('[data-timer]'))) { const [n,m] = b.dataset.timer.split('|'); startTimer(n, +m, '🍳'); close('#genOv'); return; }
  if ((b = g('[data-tadd]'))) { const [n,m,em] = b.dataset.tadd.split('|'); startTimer(n, +m, em); renderTimerList(); return; }
  if ((b = g('[data-tcustom]'))) { const m = parseFloat(toEn($('#tmM').value)); if (!(m>0)){ toast('اكتب عدد الدقائق'); $('#tmM').focus(); return; } startTimer($('#tmN').value.trim()||'مؤقت', m); $('#tmN').value=''; $('#tmM').value=''; renderTimerList(); return; }
  if ((b = g('[data-tplus]'))) { const t = S.timers.find(x=>x.id===b.dataset.tplus); if (t){ t.end += 60000; t.dur += 60000; save(); tickTimers(); } return; }
  if ((b = g('[data-tcancel]'))) { S.timers = S.timers.filter(x=>x.id!==b.dataset.tcancel); save(); renderTimerList(); tickTimers(); return; }
  if ((b = g('[data-cl]'))) { openList(b.dataset.cl); return; }
  if ((b = g('[data-cli]'))) { const id = b.dataset.clid, i = +b.dataset.cli, l = allLists().find(x=>x.id===id); const s = new Set(S.cl[id]||[]); const was = s.size===l.items.length;
    s.has(i) ? s.delete(i) : s.add(i); S.cl[id] = [...s]; save(); const on = s.has(i); b.classList.toggle('done', on); b.setAttribute('aria-checked', on); if (on){ burst(b); buzz(12); }
    $('#clProg').textContent = `${ar(s.size)} من ${ar(l.items.length)}`; if (!was && s.size===l.items.length){ inc('lists'); save(); checkAch(); setTimeout(()=>{ confetti(); toast(`أحسنت! اكتملت «${l.n}» 🎉`); }, 250); } return; }
  if ((b = g('[data-clreset]'))) { S.cl[b.dataset.clreset] = []; save(); openList(b.dataset.clreset); toast('بدأت القائمة من جديد'); return; }
  if ((b = g('[data-clnew]'))) { newList(); return; }
  if ((b = g('[data-cldel]'))) { const id = b.dataset.cldel; if (!confirm('حذف هذه القائمة؟')) return; S.myCl = S.myCl.filter(x=>x.id!==id); delete S.cl[id]; save(); openLists(); return; }
  if ((b = g('[data-gc]'))) { gCat = b.dataset.gc; $('#gSearch').value=''; renderGuide(); return; }
  if ((b = g('[data-xq]'))) { $('#xpD').value = addDays(today(), +b.dataset.xq); return; }
  if ((b = g('[data-xadd]'))) { const n = $('#xpN').value.trim(), k = $('#xpD').value; if (!n){ toast('اكتب اسم الصنف'); $('#xpN').focus(); return; } if (!/^\d{4}-\d{2}-\d{2}$/.test(k)){ toast('اختر التاريخ'); return; }
    S.expiry.push({id:uid(), n, k}); save(); $('#xpN').value=''; renderExpiry(); buzz(10); toast(`سنذكّرك قبل ${dateStr(fromKey(k))}`); return; }
  if ((b = g('[data-xdel]'))) { S.expiry = S.expiry.filter(x=>x.id!==b.dataset.xdel); save(); renderExpiry(); return; }
  if ((b = g('[data-xshop]'))) { const x = S.expiry.find(x=>x.id===b.dataset.xshop); if (x){ const n = addToShop([x.n]); S.expiry = S.expiry.filter(i=>i.id!==x.id); save(); renderExpiry(); updateBadge(); toast(n ? `أضيف «${x.n}» لقائمة التسوق 🛒` : 'موجود في القائمة'); } return; }
  if ((b = g('[data-ncol]'))) { nCol = b.dataset.ncol; $$('#ntC button').forEach(x=>x.classList.toggle('on', x===b)); return; }
  if ((b = g('[data-nadd]'))) { const t = $('#ntT').value.trim(); if (!t){ toast('اكتب الملاحظة'); $('#ntT').focus(); return; } S.notes.push({id:uid(), t, c:nCol, ts:Date.now(), pin: b.dataset.nadd==='pin'}); save(); $('#ntT').value=''; renderNotes(); buzz(10); toast(b.dataset.nadd==='pin' ? 'أضيفت وثُبّتت في الرئيسية 📌' : 'أضيفت الملاحظة'); return; }
  if ((b = g('[data-npin]'))) { const n = S.notes.find(x=>x.id===b.dataset.npin); if (n){ n.pin = !n.pin; save(); renderNotes(); } return; }
  if ((b = g('[data-ndel]'))) { const id = b.dataset.ndel; const n = S.notes.find(x=>x.id===id); S.notes = S.notes.filter(x=>x.id!==id); save(); renderNotes(); toast('حُذفت الملاحظة', {label:'تراجع', fn:()=>{ S.notes.push(n); save(); renderNotes(); }}); return; }
});
$('#genSheet').addEventListener('keydown', e=>{ if ((e.key==='Enter'||e.key===' ') && e.target.dataset && e.target.dataset.cli!==undefined){ e.preventDefault(); e.target.click(); } });
tickTimers();
/* ---------- Android back button ---------- */
window.baytiBack = () => {
  const ov = document.querySelector('.overlay.show');
  if (ov && ov.id==='obOv') return true;
  if (ov && ov.id==='alarmOv'){ stopAlarm(); return true; }
  if (ov && ov.id==='cookOv'){ closeCook(); return true; }
  if (ov){ ov.classList.remove('show'); if (ov.id==='setOv') saveSettings(); if (ov.id==='installOv'){ S.seen=true; save(); } if (ov.id==='genOv') render(); return true; }
  if (tab !== 'home'){ go('home'); return true; }
  return false;
};

/* ---------- render ---------- */
/* ================= v4.2 features ================= */
/* ---------- helpers ---------- */
const MEAL_KEYS = ['b','l','d'];
const normAr = s => String(s||'').toLowerCase().replace(/[\u064B-\u0652\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/ئ/g,'ي').replace(/ؤ/g,'و').replace(/ء/g,'');
const FRAC = {'½':.5,'¼':.25,'¾':.75,'⅓':1/3,'⅔':2/3,'⅛':.125};
function fmtQty(x){
  if (x >= 20) return ar(Math.round(x/5)*5);
  if (x >= 10) return ar(Math.round(x));
  const w = Math.floor(x), r = x - w;
  const opts = [[0,''],[.25,'¼'],[1/3,'⅓'],[.5,'½'],[2/3,'⅔'],[.75,'¾'],[1,'']];
  let best = opts[0]; opts.forEach(o=>{ if (Math.abs(o[0]-r) < Math.abs(best[0]-r)) best = o; });
  const W = best[0]===1 ? w+1 : w;
  if (!W && !best[1]) return '¼';
  return (W ? ar(W) : '') + best[1];
}
/* scales the leading amount of an ingredient line: "٢ كوب دقيق", "١½ كوب", "½ كيلو", "500 جم" */
function scaleQty(str, f){
  if (Math.abs(f-1) < 1e-6) return str;
  const m = /^\s*([٠-٩\d]+(?:[.,٫][٠-٩\d]+)?)?\s*([½¼¾⅓⅔⅛])?/.exec(str);
  if (!m || (!m[1] && !m[2])) return str;
  let v = m[1] ? parseFloat(toEn(m[1])) : 0; if (m[2]) v += FRAC[m[2]];
  if (!isFinite(v) || v<=0) return str;
  const rest = str.slice(m[0].length);
  return fmtQty(v*f) + (rest && !/^\s/.test(rest) ? ' ' : '') + rest;
}
const svUnit = sv => sv>12 ? 'قطعة' : 'أشخاص';
const svStep = sv => sv>12 ? Math.max(1, Math.round(sv/2)) : 1;
function qtyHTML(r, n){
  if (!r.q) return '';
  const f = r.sv ? n / r.sv : 1;
  const ctl = r.sv ? `<div class="sv-ctl"><button type="button" data-svs="-1" aria-label="أقل">−</button><span>تكفي <b>${ar(n)}</b> ${svUnit(r.sv)}</span><button type="button" data-svs="1" aria-label="أكثر">+</button></div>` : '';
  return `<div class="pg"><h5>المقادير بالضبط</h5>${ctl}<div class="card" style="padding:12px 14px"><ul class="qty">${r.q.map(x=>`<li>${esc(scaleQty(x, f))}</li>`).join('')}</ul>${Math.abs(f-1)>1e-6?`<div class="sv-note">المقادير محسوبة تلقائياً لـ${ar(n)} ${svUnit(r.sv)} — الملح والتوابل حسب الذوق.</div>`:''}</div></div>`;
}
let recCur = null, recSv = 0;
function setRecipeCtx(r){ recCur = r; recSv = r.sv || 0; }

/* ---------- step timer detection ---------- */
const AR_NUM_WORDS = {'دقيقة':1,'دقيقتين':2,'دقيقتان':2,'ساعة':60,'ساعتين':120,'ساعتان':120,'ربع ساعة':15,'نصف ساعة':30,'نص ساعة':30};
function stepMinutes(s){
  const t = toEn(s).replace(/–|—/g,'-');
  let m = /(\d+(?:\.\d+)?)\s*(?:-|إلى|او|أو)?\s*(\d+(?:\.\d+)?)?\s*(دقيقة|دقائق|د\b|ساعة|ساعات|ثانية|ثوان)/.exec(t);
  if (m){ const v = parseFloat(m[2]||m[1]); if (/ساع/.test(m[3])) return v*60; if (/ثان|ثو/.test(m[3])) return Math.max(1, Math.round(v/60)); return v; }
  for (const w of ['ربع ساعة','نصف ساعة','نص ساعة','ساعتين','ساعتان','دقيقتين','دقيقتان']) if (t.includes(w)) return AR_NUM_WORDS[w];
  return 0;
}
const minLabel = m => m>=60 && m%60===0 ? (m===60?'ساعة':m===120?'ساعتين':`${ar(m/60)} ساعات`) : m===1?'دقيقة':m===2?'دقيقتين':m<=10?`${ar(m)} دقائق`:`${ar(m)} دقيقة`;

/* ---------- cooking mode ---------- */
const cookOv = document.createElement('div'); cookOv.className = 'overlay cook-ov'; cookOv.id = 'cookOv';
cookOv.innerHTML = '<div class="cook" id="cookBox" role="dialog" aria-label="وضع الطبخ"></div>'; document.body.appendChild(cookOv);
let cook = null, wakeLock = null;
async function keepAwake(on){
  try {
    if (NATIVE && window.BaytiAndroid && BaytiAndroid.keepAwake){ BaytiAndroid.keepAwake(!!on); return; }
    if (on && 'wakeLock' in navigator){ wakeLock = await navigator.wakeLock.request('screen'); }
    else if (!on && wakeLock){ await wakeLock.release(); wakeLock = null; }
  } catch(e){}
}
document.addEventListener('visibilitychange', ()=>{ if (cook && document.visibilityState==='visible') keepAwake(true); });
function openCook(name, n){
  const r = findRecipe(name); if (!r) return;
  cook = {r, i:0, f: r.sv && n ? n/r.sv : 1, n: n || r.sv, got:{}};
  close('#genOv'); cookOv.classList.add('show'); keepAwake(true); renderCook(); buzz(10);
}
function closeCook(){ cookOv.classList.remove('show'); keepAwake(false); cook = null; }
function renderCook(){
  if (!cook) return;
  const {r, i} = cook, N = r.s.length + 1, last = i===N;
  const lines = r.q ? r.q.map(x=>scaleQty(x, cook.f)) : r.i;
  const prog = `<div class="ck-prog">${Array.from({length:N+1},(_,j)=>`<i class="${j<i?'d':j===i?'c':''}"></i>`).join('')}</div>`;
  let body;
  if (i===0){
    const all = lines.every((_,j)=>cook.got[j]);
    body = `<div class="ck-lbl">🧺 جهّز المكونات${r.sv?` — ${ar(cook.n)} ${svUnit(r.sv)}`:''}</div>
      <div class="ck-ings">${lines.map((x,j)=>`<button class="ck-ing ${cook.got[j]?'on':''}" data-cg="${j}"><span class="b">${cook.got[j]?'✓':''}</span>${esc(x)}</button>`).join('')}</div>
      <p class="ck-hint">${all?'✓ كل شيء جاهز، لنبدأ!':'اضغط على كل مكوّن بعد تجهيزه'}</p>`;
  } else if (!last){
    const s = r.s[i-1], mins = stepMinutes(s);
    body = `<div class="ck-lbl">الخطوة ${ar(i)} من ${ar(r.s.length)}</div><div class="ck-step">${esc(s)}</div>
      ${mins?`<button class="btn soft block ck-timer" data-ctimer="${mins}">⏱️ ابدأ مؤقت ${minLabel(mins)}</button>`:''}
      ${i===r.s.length && r.t?`<div class="rtip">💡 سر النجاح: ${esc(r.t)}</div>`:''}`;
  } else {
    body = `<div class="ck-done"><div class="e">🎉</div><h3>بالهنا والشفا!</h3><p>انتهيت من «${esc(r.n)}»</p>
      <button class="btn soft block" data-cfav>${S.fav.includes(r.n)?'❤️ في المفضلة':'♥ أضفها للمفضلة'}</button></div>`;
  }
  $('#cookBox').innerHTML = `<div class="ck-top"><button class="ck-x" data-cclose aria-label="إغلاق">✕</button><div class="ck-title"><b>${esc(r.n)}</b><small>👩‍🍳 وضع الطبخ — الشاشة تبقى مضاءة</small></div></div>${prog}
    <div class="ck-body">${body}</div>
    <div class="ck-nav">${i>0?`<button class="btn ghost" data-cstep="-1">→ السابق</button>`:`<button class="btn ghost" data-cclose>إلغاء</button>`}${last?`<button class="btn primary" data-cfinish>تم ✓</button>`:`<button class="btn primary" data-cstep="1">${i===0?'ابدأ الطبخ':'التالي'} ←</button>`}</div>`;
}
cookOv.addEventListener('click', e=>{
  const g = s => e.target.closest(s); let b;
  if (g('[data-cclose]')){ closeCook(); return; }
  if ((b = g('[data-cg]'))){ const j = +b.dataset.cg; cook.got[j] = !cook.got[j]; buzz(6); renderCook(); return; }
  if ((b = g('[data-cstep]'))){ cook.i = Math.max(0, Math.min(cook.r.s.length+1, cook.i + (+b.dataset.cstep))); buzz(8); renderCook(); $('#cookBox').scrollTop = 0; return; }
  if ((b = g('[data-ctimer]'))){ ensureAudio(); startTimer(`${cook.r.n} — خطوة ${ar(cook.i)}`, +b.dataset.ctimer, '🍳'); b.textContent = '✓ المؤقت يعمل في أعلى الشاشة'; b.disabled = true; return; }
  if (g('[data-cfav]')){ const n = cook.r.n; if (!S.fav.includes(n)) S.fav.push(n); save(); renderCook(); toast('أضيفت إلى المفضلة ❤️'); return; }
  if (g('[data-cfinish]')){
    const n = cook.r.n; S.cooked = (S.cooked||[]).concat({n, k:today()}).slice(-60); inc('cooked'); save();
    closeCook(); toast('بالهنا والشفا 😋'); checkAch(); render();
  }
});
document.addEventListener('keydown', e=>{ if (!cook) return; if (e.key==='Escape') closeCook(); else if (e.key==='ArrowLeft'){ cook.i = Math.min(cook.r.s.length+1, cook.i+1); renderCook(); } else if (e.key==='ArrowRight'){ cook.i = Math.max(0, cook.i-1); renderCook(); } });

/* recipe sheet extras: servings scaler, cooking mode, recipe-group filter */
let browseGroup = '';
$('#genSheet').addEventListener('click', e=>{
  const g = s => e.target.closest(s); let b;
  if ((b = g('[data-svs]')) && recCur){ e.stopPropagation(); const st = svStep(recCur.sv); recSv = Math.max(st, Math.min(st*30, recSv + st*(+b.dataset.svs))); $('#qtyBox').innerHTML = qtyHTML(recCur, recSv); buzz(6); return; }
  if ((b = g('[data-cook]'))){ openCook(b.dataset.cook, recCur && recCur.n===b.dataset.cook ? recSv : 0); return; }
  if ((b = g('[data-rg]'))){ browseGroup = b.dataset.rg; renderBrowse(); return; }
}, true);

/* ---------- recently eaten (for smarter suggestions) ---------- */
function recentNames(k, days = 4){
  const s = new Set();
  for (let d=1; d<=days; d++){ const m = S.meals[addDays(k,-d)]||{}; Object.values(m).forEach(n=>n && s.add(n)); }
  (S.cooked||[]).forEach(c=>{ if (c.k >= addDays(k,-days) && c.k <= k) s.add(c.n); });
  return [...s];
}

/* ---------- global search ---------- */
function openSearch(q0 = ''){
  sheet(`<h3>🔍 ابحث في بيتي</h3><p class="lead">الوصفات، الدليل، المهام، الملاحظات، المصاريف، الأرقام…</p>
    <input class="inp search" id="gsInp" placeholder="اكتب كلمة: دجاج، بقعة، كهرباء…" style="width:100%" value="${esc(q0)}" autocomplete="off">
    <div id="gsRes"></div><button class="btn primary block" data-close style="margin-top:10px">إغلاق</button>`);
  const inp = $('#gsInp'); inp.addEventListener('input', renderSearch); renderSearch();
  setTimeout(()=>{ try { inp.focus({preventScroll:true}); } catch(e){} }, 300);
}
function renderSearch(){
  const raw = ($('#gsInp')||{value:''}).value.trim(), q = normAr(raw), box = $('#gsRes'); if (!box) return;
  if (q.length < 2){
    box.innerHTML = `<div class="gs-sugg">${['دجاج','كيك','عصير','لانش بوكس','بقع','فرن','كهرباء','بدائل'].map(w=>`<button class="mini" data-gsq="${w}">${w}</button>`).join('')}</div>`; return;
  }
  const has = s => normAr(s).includes(q);
  const sec = (title, rows) => rows.length ? `<div class="gs-sec">${title} <small>(${ar(rows.length)})</small></div>` + rows.slice(0,8).join('') + (rows.length>8?`<div class="gs-more">و${ar(rows.length-8)} نتائج أخرى…</div>`:'') : '';
  const row = (attr, e, t, s='') => `<button class="gs-row" ${attr}><span class="ge">${e}</span><span class="gt">${esc(t)}${s?`<small>${esc(s)}</small>`:''}</span><span class="ga">‹</span></button>`;
  const recs = []; RGROUPS.forEach(gp=>allRecipes(gp.k).forEach(r=>{ if (has(r.n) || r.i.some(has) || (r.q||[]).some(has)) recs.push(row(`data-gs="r" data-v="${esc(r.n)}"`, gp.e, r.n, `${gp.n} — ${ar(r.m)} دقيقة`)); }));
  const guide = (C.guide||[]).filter(x=>has(x.n) || x.s.some(has)).map(x=>row(`data-gs="g" data-v="${esc(x.n)}"`, x.e, x.n, (GCATS.find(c=>c[0]===x.c)||['',''])[1]));
  const store = (C.storage||[]).filter(x=>has(x.n)).map(x=>row(`data-gs="st" data-v="${esc(x.n)}"`, x.e, x.n, `الثلاجة: ${x.f} — الفريزر: ${x.z}`));
  const tasks = S.tasks.filter(t=>has(t.n)).map(t=>row(`data-gs="t"`, t.e||'✅', t.n, freqLabel(t.f)));
  const lists = (C.checklists||[]).concat(S.myCl||[]).filter(l=>has(l.n) || (l.items||[]).some(has)).map(l=>row(`data-gs="l" data-v="${esc(l.id)}"`, l.e||'📋', l.n, `${ar((l.items||[]).length)} بند`));
  const notes = (S.notes||[]).filter(n=>has(n.t)).map(n=>row(`data-gs="n"`, '📝', n.t.slice(0,60)));
  const cons = (S.contacts||[]).filter(c=>has(c.n) || toEn(c.p).includes(toEn(raw))).map(c=>row(`data-gs="c" data-v="${esc(c.p)}"`, c.e, c.n, c.p));
  const exps = [];
  [[S.exp,false],[S.fixed||{},true]].forEach(([box,f])=>Object.keys(box).sort().reverse().forEach(k=>(box[k]||[]).forEach(x=>{
    if (has(x.n||'') || has(catOf(x.c).n) || (/\d/.test(toEn(raw)) && String(x.a).includes(toEn(raw)))) exps.push(row(`data-gs="e" data-v="${x.id}"`, catOf(x.c).e, `${money(x.a)}${x.n?` — ${x.n}`:''}`, `${catOf(x.c).n} — ${f ? 'التزام شهري '+k : relDayFull(k)}`));
  })));
  const evs = S.tasks.filter(t=>t.f && (t.f.t==='o'||t.f.t==='y') && has(t.n)).length;
  const html = sec('🍲 الوصفات', recs) + sec('📖 دليل البيت', guide) + sec('🧊 حفظ الطعام', store) + sec('✅ المهام والمواعيد', tasks) + sec('📋 القوائم', lists) + sec('📝 الملاحظات', notes) + sec('📞 أرقام مهمة', cons) + sec('💰 المصاريف', exps);
  box.innerHTML = html || `<div class="empty"><span class="e">🔍</span>لا نتائج لـ«${esc(raw)}»</div>`;
  void evs;
}
$('#genSheet').addEventListener('click', e=>{
  const sq = e.target.closest('[data-gsq]'); if (sq){ $('#gsInp').value = sq.dataset.gsq; renderSearch(); return; }
  const b = e.target.closest('[data-gs]'); if (!b) return; e.stopPropagation();
  const t = b.dataset.gs, v = b.dataset.v, q = $('#gsInp') ? $('#gsInp').value : '';
  if (t==='r') openRecipe(v);
  else if (t==='g' || t==='st'){ openGuide(t==='st'?'store':null); $('#gSearch').value = v; renderGuide(); const d = $('#gList details'); if (d) d.open = true; }
  else if (t==='t'){ close('#genOv'); seg = 'today'; go('tasks'); }
  else if (t==='l') openList(v);
  else if (t==='n') openNotes();
  else if (t==='c') dialNum(v);
  else if (t==='e') openExpEdit(v, ()=>openSearch(q));
}, true);

/* ---------- important numbers ---------- */
const EG_SOS = [['إسعاف','123','🚑'],['شرطة النجدة','122','👮'],['المطافي','180','🚒'],['طوارئ الكهرباء','121','⚡'],['طوارئ الغاز','129','🔥'],['طوارئ المياه','125','💧']];
const CON_EMO = ['👤','🚑','👮','🚒','⚡','🔥','💧','🔧','🩺','💊','🏫','🛒','🚕','🏠','🧑‍🔧','📦'];
function dialNum(p){
  const n = toEn(p).replace(/[^\d+]/g,''); if (!n) return;
  if (NATIVE){ if (window.BaytiAndroid && BaytiAndroid.dial) BaytiAndroid.dial(n); else toast('حدّث التطبيق لتفعيل الاتصال'); return; }
  location.href = 'tel:' + n;
}
function openContacts(){
  const L = S.contacts = S.contacts||[];
  const missing = EG_SOS.filter(s=>!L.some(c=>toEn(c.p)===s[1]));
  sheet(`<h3>📞 أرقام مهمة</h3><p class="lead">اضغط على أي رقم للاتصال مباشرة</p>
    <div id="conList">${L.length ? L.map(c=>`<div class="con-row"><button class="con-call" data-dial="${esc(c.p)}"><span class="ce">${c.e}</span><span class="ct">${esc(c.n)}<small dir="ltr">${esc(c.p)}</small></span><span class="cc" aria-hidden="true">📞</span></button><button class="del" style="display:grid" data-cdel="${c.id}" aria-label="حذف">${X_SVG}</button></div>`).join('') : `<div class="empty"><span class="e">📇</span>لا توجد أرقام بعد — أضف أرقام السباك والكهربائي والطبيب والمدرسة</div>`}</div>
    ${missing.length ? `<button class="btn soft block" data-sos style="margin:8px 0">🇪🇬 أضف أرقام الطوارئ في مصر (${ar(missing.length)})</button>` : ''}
    <div class="row2" style="margin-top:6px"><button class="btn ghost" data-close>إغلاق</button><button class="btn primary" data-cadd>+ رقم جديد</button></div>`);
}
function openContactForm(){
  formSheet({title:'رقم جديد 📞', fields:[
    {id:'n', label:'الاسم', placeholder:'مثال: السباك، د. أحمد، مدرسة الأولاد', max:30},
    {id:'p', label:'الرقم', placeholder:'01xxxxxxxxx', max:20},
    {id:'e', label:'الأيقونة', type:'pick', value:'👤', options:CON_EMO.map(e=>[e,e])}
  ], submit:'حفظ', onSubmit:v=>{
    const p = toEn(v.p).replace(/[^\d+]/g,'');
    if (!v.n) return 'اكتب الاسم'; if (p.length < 3) return 'اكتب رقماً صحيحاً';
    S.contacts = (S.contacts||[]).concat({id:uid(), n:v.n.slice(0,30), p, e:v.e||'👤'}); save(); checkAch();
    setTimeout(()=>{ openContacts(); toast('تم حفظ الرقم ✓'); }, 320);
  }});
  const pi = $('#f-p'); if (pi){ pi.setAttribute('inputmode','tel'); pi.setAttribute('dir','ltr'); }
}
$('#genSheet').addEventListener('click', e=>{
  const g = s => e.target.closest(s); let b;
  if ((b = g('[data-dial]'))){ buzz(10); dialNum(b.dataset.dial); return; }
  if ((b = g('[data-cdel]'))){ const id = b.dataset.cdel, old = (S.contacts||[]).slice(); S.contacts = S.contacts.filter(c=>c.id!==id); save(); openContacts(); toast('تم حذف الرقم', {label:'تراجع', fn:()=>{ S.contacts = old; save(); openContacts(); }}); return; }
  if (g('[data-sos]')){ S.contacts = S.contacts||[]; EG_SOS.forEach(([n,p,e])=>{ if (!S.contacts.some(c=>c.p===p)) S.contacts.push({id:uid(), n, p, e}); }); save(); checkAch(); openContacts(); toast('أضيفت أرقام الطوارئ ✓'); return; }
  if (g('[data-cadd]')){ openContactForm(); return; }
}, true);

/* ---------- shopping list: sections + log as expense ---------- */
const SHOP_EXTRA = [['منظفات وأدوات 🧴', ['صابون','كلور','مسحوق','منظف','مناديل','ورق','شامبو','معجون','فرشاة','إسفنج','ليفة','أكياس','ملمع','معطر','بوتاس','سلك','جوانتي','فوط']], ['مخبوزات 🥖', ['عيش','توست','فينو','كرواسون','بقسماط','كيك']], ['مشروبات 🥤', ['مياه','مياة','عصير','بيبسي','كولا','نسكافيه','ينسون','نعناع ناشف']]];
function shopSection(n){
  const nn = normAr(n);
  for (const g of C.pantry) if (g.items.some(i=>normAr(i)===nn || nn.includes(normAr(i)))) return `${g.g} ${g.e}`;
  for (const [g, words] of SHOP_EXTRA) if (words.some(w=>nn.includes(normAr(w)))) return g;
  return 'أخرى 🛍️';
}
function shopGrouped(items, row){
  if (items.length < 4) return items.map(row).join('');
  const order = C.pantry.map(g=>`${g.g} ${g.e}`).concat(SHOP_EXTRA.map(x=>x[0]), ['أخرى 🛍️']);
  const map = {}; items.forEach(i=>{ const s = shopSection(i.n); (map[s] = map[s]||[]).push(i); });
  const keys = Object.keys(map).sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  if (keys.length < 2) return items.map(row).join('');
  return keys.map(k=>`<div class="shop-sec">${esc(k)} <small>${ar(map[k].length)}</small></div>` + map[k].map(row).join('')).join('');
}
function openShopExpense(){
  const got = S.shop.filter(i=>i.done); if (!got.length) return;
  const names = got.map(i=>i.n); let note = 'مشتريات: ' + names.join('، '); if (note.length > 40) note = note.slice(0,38) + '…';
  const veg = names.filter(n=>shopSection(n).startsWith('خضار')).length, meat = names.filter(n=>shopSection(n).startsWith('لحوم')).length, cln = names.filter(n=>shopSection(n).startsWith('منظفات')).length;
  const cat = veg > names.length/2 ? 'f' : meat > names.length/2 ? 'm' : cln > names.length/2 ? 'h' : 'g';
  formSheet({title:'💰 سجّل المشتريات كمصروف', lead:`${ar(names.length)} صنف: ${esc(names.slice(0,6).join('، '))}${names.length>6?'…':''}`, fields:[
    {id:'a', label:`المبلغ الإجمالي (${S.cur})`, type:'number', placeholder:'مثال: 350 أو 200+150'},
    {id:'n', label:'الملاحظة', value:note, max:40},
    {id:'c', label:'التصنيف', type:'pick', value:cat, options:CATS.filter(c=>c.k!=='b' && c.k!=='s' && c.k!=='i').map(c=>[c.k, `${c.e} ${c.n}`])},
    {id:'clr', label:'بعد الحفظ', type:'pick', value:'y', options:[['y','🧹 احذف المشترى من القائمة'],['n','اتركه في القائمة']]}
  ], submit:'سجّل المصروف', onSubmit:v=>{
    if (!(v.a > 0)) return 'اكتب المبلغ';
    if (v.a > 10000000) return 'المبلغ كبير جداً';
    const snap = JSON.stringify(S);
    const item = {id:uid(), a:Math.round(v.a*100)/100, n:(v.n||'مشتريات').slice(0,40), c:v.c||'g', t:Date.now()};
    putExp(false, today(), item); if (v.clr==='y') S.shop = S.shop.filter(i=>!i.done);
    inc('shopExp'); save(); checkAch();
    setTimeout(()=>toast(`سُجّل ${money(item.a)} في مصاريف اليوم ✓`, {label:'تراجع', fn:()=>{ S = JSON.parse(snap); save(); render(); toast('تم التراجع ↩️'); }}), 350);
  }});
}
$('#shopList').addEventListener('click', e=>{ if (e.target.closest('[data-shopexp]')){ e.stopPropagation(); openShopExpense(); } }, true);

/* ---------- home: recipe of the day + backup reminder ---------- */
function recipeOfDay(){
  const all = RGROUPS.filter(g=>g.k!=='j').flatMap(g=>(C.recipes[g.k]||[]).map(r=>Object.assign({k:g.k}, r)));
  if (!all.length) return null;
  const d = Math.floor(fromKey(today()).getTime()/864e5);
  return all[(d*7919) % all.length];
}
function renderHomeV42(){
  const r = recipeOfDay(), box = $('#rDay');
  if (box){ box.hidden = !r; if (r){ const gp = RGROUPS.find(g=>g.k===r.k)||RGROUPS[1], miss = missingOf(r);
    box.dataset.recipe = r.n;
    box.innerHTML = `<span class="rd-e" style="background:${gp.bg}">${gp.e}</span><span class="rd-t"><b>${esc(r.n)}</b><small>${gp.n} — ⏱️ ${ar(r.m)} دقيقة — ${miss.length?`ينقص ${ar(miss.length)}`:'✓ مكوناتها عندك'}</small></span><span class="rd-go">‹</span>`; } }
  const bk = $('#bkBanner'); if (!bk) return;
  const nExp = Object.values(S.exp||{}).reduce((a,l)=>a+l.length,0) + Object.values(S.fixed||{}).reduce((a,l)=>a+l.length,0);
  const hasData = nExp + (S.notes||[]).length + (S.myRecipes||[]).length + (S.contacts||[]).length + Object.keys(S.done||{}).length >= 5;
  const ref = S.lastBackup || S.firstUse || today();
  const days = Math.round((fromKey(today()) - fromKey(ref)) / 864e5);
  const show = hasData && days >= 14 && !(S.bkSnooze && S.bkSnooze > today());
  bk.innerHTML = show ? `<div class="banner bk"><span class="be">💾</span><span class="bt">${S.lastBackup?`آخر نسخة احتياطية منذ ${ar(days)} يوماً`:'لم تحفظ نسخة احتياطية بعد'}<small>بياناتك محفوظة على هذا الجهاز فقط</small></span><button data-bk="save">احفظ</button><button data-bk="later" class="bk-x" aria-label="لاحقاً">✕</button></div>` : '';
}
$('#rDay') && $('#rDay').addEventListener('click', e=>{ const b = e.currentTarget; if (b.dataset.recipe){ buzz(8); openRecipe(b.dataset.recipe); } });
$('#bkBanner') && $('#bkBanner').addEventListener('click', e=>{
  const b = e.target.closest('[data-bk]'); if (!b) return;
  if (b.dataset.bk==='save') $('#exportBtn').click();
  else { S.bkSnooze = addDays(today(), 7); save(); toast('سنذكّرك بعد أسبوع'); }
  renderHomeV42();
});
$('#searchBtn') && $('#searchBtn').addEventListener('click', ()=>{ buzz(8); openSearch(); });
if (!S.firstUse){ S.firstUse = HAD_DATA ? addDays(today(), -7) : today(); save(); }
if (/[?&]qa=1(&|$)/.test(location.search)) window.__bayti = expr => eval(expr);   // automated QA only

function render(){
  if (tab==='home') renderHome();
  else if (tab==='tasks') renderTasks();
  else if (tab==='meals') renderMeals();
  else if (tab==='shop') renderShop();
  else if (tab==='budget') renderBudget();
  updateBadge();
}
let lastDay = today();
document.addEventListener('visibilitychange', ()=>{
  if (document.hidden) return;
  if (today()!==lastDay){ lastDay=today(); mKey=today(); bKey=today(); calSel=today(); render(); }
  tickTimers();
  if (swReg) swReg.update().catch(()=>{});
  checkContent(false);
});

applyTheme();
checkAch(true);
render();
const qp = new URLSearchParams(location.search), qt = qp.get('tab');
if (qt==='cal'){ seg='cal'; go('tasks'); }
if (['tasks','meals','shop','budget'].includes(qt)) { go(qt); if (qt==='budget' && qp.get('add')) setTimeout(()=>$('#expAmt').focus(), 300); }
if (!S.onboarded) setTimeout(()=>startOnboarding(), 500);
else if (!NATIVE && !S.seen && !standalone) setTimeout(()=>open('#installOv'), 900);
else if (HAD_DATA && S.ver !== APP_VERSION) setTimeout(showNews, 700);
if (S.ver !== APP_VERSION){ S.ver = APP_VERSION; save(); }
setTimeout(()=>checkContent(false), 1500);
})();
