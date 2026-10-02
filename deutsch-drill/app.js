const APP_VERSION = '1.10.0';
const DATA_SCHEMA_VERSION = 2;

function readJSONStorage(key, fallback){
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function migrateStorage(){
  let version = Number(localStorage.getItem('dd_schema_version') || '1');

  if(version < 2){
    const oldStats = readJSONStorage('dd_stats', {});
    const cleanStats = {};
    if(oldStats && typeof oldStats === 'object' && !Array.isArray(oldStats)){
      Object.entries(oldStats).forEach(([id,x])=>{
        if(!x || typeof x !== 'object') return;
        const total = Math.max(0, Number(x.total) || 0);
        const correct = Math.min(total, Math.max(0, Number(x.correct) || 0));
        const streak = Math.max(0, Number(x.streak) || 0);
        cleanStats[id] = {correct,total,streak};
      });
    }

    const oldMistakes = readJSONStorage('dd_mistakes', []);
    const cleanMistakes = Array.isArray(oldMistakes)
      ? [...new Set(oldMistakes.filter(x=>typeof x === 'string'))]
      : [];

    localStorage.setItem('dd_stats', JSON.stringify(cleanStats));
    localStorage.setItem('dd_mistakes', JSON.stringify(cleanMistakes));

    const mode = localStorage.getItem('dd_home_mode');
    if(!['atomic','composite','mixed'].includes(mode)){
      localStorage.setItem('dd_home_mode','atomic');
    }

    const level = localStorage.getItem('dd_level_filter');
    if(!['all','A1','A2','B1'].includes(level)){
      localStorage.setItem('dd_level_filter','all');
    }

    version = 2;
    localStorage.setItem('dd_schema_version', String(version));
  }

  if(version <= DATA_SCHEMA_VERSION){
    localStorage.setItem('dd_schema_version', String(DATA_SCHEMA_VERSION));
  }
}

migrateStorage();

const S = {
  questions: [],
  skills: [],
  homeMode: localStorage.getItem('dd_home_mode') || 'atomic',
  levelFilter: localStorage.getItem('dd_level_filter') || 'all',
  current: null,
  answered: false,
  sessionIndex: 0,
  sessionLength: 10,
  sessionQuestionIds: [],
  sessionQueue: [],
  usedQuestionIds: new Set(),
  returnView: 'home',
  stats: readJSONStorage('dd_stats', {}),
  mistakes: readJSONStorage('dd_mistakes', []),
  reviewMistakes: false
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const norm = s => (s || '').trim().toLocaleLowerCase('de-DE').replace(/\s+/g,' ');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

function showView(name){
  ['home','practice','stats'].forEach(v => $(`#${v}View`).classList.toggle('hidden', v !== name));
  window.scrollTo({top:0,behavior:'instant'});
}
function st(id){
  if(!S.stats[id]) S.stats[id] = {correct:0,total:0,streak:0};
  return S.stats[id];
}
function mastery(id){
  const x = st(id);
  return x.total ? (x.correct + 1.5) / (x.total + 3) : .5;
}
function skillName(id){
  return S.skills.find(x => x.id === id)?.name_zh || id;
}

function levelMatches(q){
  return S.levelFilter === 'all' || q.level === S.levelFilter;
}
function normalPracticePool(){
  return S.questions.filter(q => q.tier === S.homeMode && levelMatches(q));
}
function mistakePool(){
  const bad = new Set(S.mistakes);
  return S.questions.filter(q => bad.has(q.id) && levelMatches(q));
}
function basePool(){
  return S.reviewMistakes ? mistakePool() : normalPracticePool();
}

function levelBand(q){
  return q.level;
}
function levelRank(q){
  return q.level === 'B1' ? 3 : (q.level === 'A2' ? 2 : 1);
}
function weightedPick(candidates, selectedSkillCounts){
  if(!candidates.length) return null;
  const weighted=candidates.map(q=>{
    const weakness=q.skills.reduce((n,s)=>n+(1-mastery(s)),0)/q.skills.length;
    const exposure=q.skills.reduce((n,s)=>n+(selectedSkillCounts[s]||0),0)/q.skills.length;
    return {q,w:(.35+weakness)/(1+exposure*.8)};
  });
  let r=Math.random()*weighted.reduce((n,x)=>n+x.w,0);
  for(const x of weighted){ r-=x.w; if(r<=0) return x.q; }
  return weighted.at(-1).q;
}
function buildBalancedQueue(pool, limit){
  const quotas = limit >= 10
    ? {A1:3,A2:4,B1:3}
    : {
        A1:Math.max(0,Math.round(limit*.30)),
        A2:Math.max(0,Math.round(limit*.40)),
        B1:0
      };
  quotas.B1=Math.max(0,limit-quotas.A1-quotas.A2);

  const chosen=[];
  const chosenIds=new Set();
  const skillCounts={};

  function takeFrom(band,n){
    for(let i=0;i<n;i++){
      const candidates=pool.filter(q=>!chosenIds.has(q.id) && levelBand(q)===band);
      const q=weightedPick(candidates,skillCounts);
      if(!q) break;
      chosen.push(q); chosenIds.add(q.id);
      q.skills.forEach(s=>skillCounts[s]=(skillCounts[s]||0)+1);
    }
  }
  takeFrom('A1',quotas.A1);
  takeFrom('A2',quotas.A2);
  takeFrom('B1',quotas.B1);

  while(chosen.length<limit){
    const candidates=pool.filter(q=>!chosenIds.has(q.id));
    const q=weightedPick(candidates,skillCounts);
    if(!q) break;
    chosen.push(q); chosenIds.add(q.id);
    q.skills.forEach(s=>skillCounts[s]=(skillCounts[s]||0)+1);
  }

  // Progress from lower to higher difficulty; random order inside each level band.
  return chosen
    .map(q=>({q,r:Math.random()}))
    .sort((x,y)=>levelRank(x.q)-levelRank(y.q)||x.r-y.r)
    .map(x=>x.q);
}
function prepareSession(review=false){
  S.reviewMistakes = review && S.mistakes.length > 0;
  S.sessionIndex = 0;
  S.usedQuestionIds = new Set();
  S.sessionQuestionIds = [];

  const pool = basePool();
  S.sessionLength = Math.min(10, pool.length);

  if(S.reviewMistakes){
    // Mistake review is driven only by current mistakes.
    S.sessionQueue = pool
      .map(q=>({q,r:Math.random()}))
      .sort((a,b)=>a.r-b.r)
      .slice(0, S.sessionLength)
      .map(x=>x.q);
  } else {
    S.sessionQueue = buildBalancedQueue(pool, S.sessionLength);
  }
}
function startPractice(review=false){
  if(review && mistakePool().length === 0) return;
  prepareSession(review);
  if(S.sessionLength === 0) return;
  showView('practice');
  renderQuestion();
}

function renderQuestion(){
  const next = S.sessionQueue[S.sessionIndex];
  if(!next){
    finishSession();
    return;
  }

  S.current = next;
  S.usedQuestionIds.add(next.id);
  S.sessionQuestionIds.push(next.id);
  S.answered = false;

  const p = S.sessionIndex + 1;
  $('#progressText').textContent = `${p} / ${S.sessionLength}`;
  $('#sessionProgress').style.width = `${Math.min(100, p / S.sessionLength * 100)}%`;

  const names = S.current.skills.map(skillName);
  $('#levelTag').textContent = S.current.level;
  $('#skillTag').textContent = names.length === 1 ? names[0] : `${names[0]} +${names.length-1}`;
  $('#hintText').textContent = 'Show the grammar focus';
  $('#hintBtn').dataset.open = '0';

  $('#feedback').classList.add('hidden');
  $('#nextBtn').classList.add('hidden');
  $('#checkBtn').classList.remove('hidden');

  const parts = S.current.prompt.split(/(\[\[\d+\]\])/g);
  const frag = document.createDocumentFragment();

  parts.forEach(part => {
    const m = part.match(/^\[\[(\d+)\]\]$/);
    if(m){
      const i = Number(m[1]);
      const b = S.current.blanks[i];
      const input = document.createElement('input');
      input.className = 'blank';
      input.dataset.i = i;
      input.autocomplete = 'off';      input.autocapitalize = 'none';
      input.spellcheck = false;
      const width = Math.min(220, Math.max(96, (b.answer.length + 3) * 14));
      input.style.setProperty('--blank-w', `${width}px`);
      input.setAttribute('aria-label', `空格 ${i+1}`);
      frag.appendChild(input);
    } else {
      frag.appendChild(document.createTextNode(part));
    }
  });

  $('#question').replaceChildren(frag);
  setTimeout(()=>$('.blank')?.focus(), 60);
}

function nounNotesHtml(){
  const notes = S.current.noun_notes || [];
  if(!notes.length) return '';
  const content = notes.map(n =>
    `<strong>${esc(n.article)} ${esc(n.lemma)}</strong>（${esc(n.gender_zh)}）`
  ).join(' · ');
  return `<div class="noun-note">名词性别：${content}</div>`;
}

function checkAnswer(){
  if(S.answered) return;
  S.answered = true;

  const inputs = $$('.blank').sort((a,b)=>Number(a.dataset.i)-Number(b.dataset.i));
  let all = true;
  const rows = [];

  S.current.blanks.forEach((b,i)=>{
    const ok = b.accepted.some(a => norm(a) === norm(inputs[i].value));
    inputs[i].classList.add(ok ? 'correct' : 'wrong');
    inputs[i].disabled = true;
    all = all && ok;

    const x = st(b.skill);
    x.total++;
    if(ok){ x.correct++; x.streak++; }
    else { x.streak = 0; }

    rows.push(
      `<div class="row">${ok?'✓':'✗'} 空 ${i+1} · ${esc(skillName(b.skill))} · 正确答案：<strong>${esc(b.answer)}</strong></div>`
    );
  });

  if(!all){
    if(!S.mistakes.includes(S.current.id)) S.mistakes.push(S.current.id);
  } else {
    S.mistakes = S.mistakes.filter(id => id !== S.current.id);
  }

  localStorage.setItem('dd_stats', JSON.stringify(S.stats));
  localStorage.setItem('dd_mistakes', JSON.stringify(S.mistakes));

  $('#feedback').innerHTML = `
    <div class="feedback-title">${all?'✓ Correct':'Review this one'}</div>
    ${rows.join('')}
    ${nounNotesHtml()}
    <div class="feedback-rule">${esc(S.current.explanation_zh)}</div>`;

  $('#feedback').classList.remove('hidden');
  $('#checkBtn').classList.add('hidden');
  $('#nextBtn').classList.remove('hidden');

  updateHome();
  renderStats();
}

function finishSession(){
  S.reviewMistakes = false;
  showView('home');
  updateHome();
}

function nextQuestion(){
  S.sessionIndex++;
  if(S.sessionIndex >= S.sessionLength){
    finishSession();
    return;
  }

  renderQuestion();
}

function skipQuestion(){
  // A skipped question stays in mistakes if it was already there.
  nextQuestion();
}

function updateHome(){
  const filteredMistakes = mistakePool().length;
  const practiceCount = normalPracticePool().length;
  const levelText = S.levelFilter === 'all' ? 'All levels' : S.levelFilter;

  $('#startLabel').textContent = S.levelFilter === 'all'
    ? 'Start practicing'
    : `Start ${S.levelFilter} practice`;

  $('#reviewLabel').textContent = S.levelFilter === 'all'
    ? 'Review mistakes'
    : `Review ${S.levelFilter} mistakes`;

  if(filteredMistakes){
    $('#mistakeCount').textContent = S.levelFilter === 'all'
      ? `${filteredMistakes} question${filteredMistakes>1?'s':''} to review`
      : `${filteredMistakes} ${S.levelFilter} question${filteredMistakes>1?'s':''} to review`;
  } else {
    $('#mistakeCount').textContent = S.levelFilter === 'all'
      ? 'No mistakes yet'
      : `No ${S.levelFilter} mistakes`;
  }

  $('#mistakesBtn').disabled = filteredMistakes === 0;
  $('#startBtn').disabled = practiceCount === 0;

  $$('.mode-pill').forEach(b =>
    b.classList.toggle('active', b.dataset.homeMode === S.homeMode)
  );
  $$('.level-option').forEach(b =>
    b.classList.toggle('active', b.dataset.level === S.levelFilter)
  );
}

function renderStats(){
  const total = S.skills.reduce((n,s)=>n+st(s.id).total,0);
  const correct = S.skills.reduce((n,s)=>n+st(s.id).correct,0);

  $('#totalAttempts').textContent = total;
  $('#overallAccuracy').textContent = total ? `${Math.round(correct/total*100)}%` : '—';

  const ordered = [...S.skills].sort((a,b)=>{
    const at = st(a.id).total, bt = st(b.id).total;
    if(at===0 && bt>0) return 1;
    if(bt===0 && at>0) return -1;
    return mastery(a.id)-mastery(b.id);
  });

  $('#skillsGrid').innerHTML = ordered.map(s=>{
    const x = st(s.id);
    const pct = Math.round(mastery(s.id)*100);
    return `<article class="skill">
      <div class="skill-top">
        <span class="skill-name">${esc(s.name_zh)}</span>
        <span class="skill-score">${x.total ? pct+'% · '+x.total+'次' : '未练'}</span>
      </div>
      <div class="bar"><i style="width:${x.total?pct:0}%"></i></div>
    </article>`;
  }).join('');
}

function openStats(from){
  S.returnView = from;
  renderStats();
  showView('stats');
}

function closeStats(){
  showView(S.returnView);
}

function toggleHint(){
  const open = $('#hintBtn').dataset.open === '1';
  $('#hintBtn').dataset.open = open ? '0' : '1';
  $('#hintText').textContent = open
    ? 'Show the grammar focus'
    : `This question practices: ${S.current.skills.map(skillName).join(' · ')}`;
}


function setDataStatus(message){
  const el = $('#dataStatus');
  if(el) el.textContent = message || '';
}

function exportPayload(){
  return {
    app: 'Deutsch Drill',
    appVersion: APP_VERSION,
    schemaVersion: DATA_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      stats: S.stats,
      mistakes: S.mistakes,
      settings: {
        homeMode: S.homeMode,
        levelFilter: S.levelFilter
      }
    }
  };
}

async function exportBackup(){
  const payload = JSON.stringify(exportPayload(), null, 2);
  const date = new Date().toISOString().slice(0,10);
  const filename = `deutsch-drill-backup-${date}.json`;
  const file = new File([payload], filename, {type:'application/json'});

  try{
    if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({
        title:'Deutsch Drill backup',
        text:'Deutsch Drill learning-data backup',
        files:[file]
      });
      setDataStatus('Backup ready to save or share.');
      return;
    }
  }catch(err){
    if(err?.name === 'AbortError') return;
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  setDataStatus('Backup exported.');
}

function sanitizeImportedStats(stats){
  const validSkills = new Set(S.skills.map(s=>s.id));
  const clean = {};
  if(!stats || typeof stats !== 'object' || Array.isArray(stats)) return clean;

  Object.entries(stats).forEach(([id,x])=>{
    if(!validSkills.has(id) || !x || typeof x !== 'object') return;
    const total = Math.max(0, Math.floor(Number(x.total)||0));
    const correct = Math.min(total, Math.max(0, Math.floor(Number(x.correct)||0)));
    const streak = Math.max(0, Math.floor(Number(x.streak)||0));
    clean[id] = {correct,total,streak};
  });
  return clean;
}

function sanitizeImportedMistakes(items){
  const validIds = new Set(S.questions.map(q=>q.id));
  if(!Array.isArray(items)) return [];
  return [...new Set(items.filter(id=>typeof id === 'string' && validIds.has(id)))];
}

async function importBackupFile(file){
  try{
    const text = await file.text();
    const payload = JSON.parse(text);
    if(!payload || typeof payload !== 'object' || !payload.data){
      throw new Error('This is not a Deutsch Drill backup.');
    }

    const importedStats = sanitizeImportedStats(payload.data.stats);
    const importedMistakes = sanitizeImportedMistakes(payload.data.mistakes);
    const settings = payload.data.settings || {};
    const homeMode = ['atomic','composite','mixed'].includes(settings.homeMode)
      ? settings.homeMode : S.homeMode;
    const levelFilter = ['all','A1','A2','B1'].includes(settings.levelFilter)
      ? settings.levelFilter : S.levelFilter;

    if(!confirm(`恢复这个备份吗？\n\n错题：${importedMistakes.length}\n有记录的 skill：${Object.keys(importedStats).length}\n\n这会替换这台设备当前的学习记录。`)){
      return;
    }

    S.stats = importedStats;
    S.mistakes = importedMistakes;
    S.homeMode = homeMode;
    S.levelFilter = levelFilter;

    localStorage.setItem('dd_stats', JSON.stringify(S.stats));
    localStorage.setItem('dd_mistakes', JSON.stringify(S.mistakes));
    localStorage.setItem('dd_home_mode', S.homeMode);
    localStorage.setItem('dd_level_filter', S.levelFilter);
    localStorage.setItem('dd_schema_version', String(DATA_SCHEMA_VERSION));

    updateHome();
    renderStats();
    setDataStatus('Backup restored successfully.');
  }catch(err){
    setDataStatus(err?.message || 'Backup could not be imported.');
  }
}

function openInstallSheet(){
  $('#installSheet').classList.remove('hidden');
}
function closeInstallSheet(){
  $('#installSheet').classList.add('hidden');
}

function showUpdateBanner(version){
  $('#updateVersionText').textContent = `Version ${version} is ready.`;
  $('#updateBanner').classList.remove('hidden');
}

async function checkForUpdate(){
  if(window.__Q || location.protocol === 'file:') return;
  try{
    const response = await fetch(`version.json?t=${Date.now()}`, {cache:'no-store'});
    if(!response.ok) return;
    const latest = await response.json();
    if(latest.version && latest.version !== APP_VERSION){
      showUpdateBanner(latest.version);
    }
  }catch{}
}

async function applyUpdate(){
  const btn = $('#updateNowBtn');
  btn.disabled = true;
  btn.textContent = 'Updating…';

  if(!('serviceWorker' in navigator)){
    location.reload();
    return;
  }

  try{
    const reg = await navigator.serviceWorker.getRegistration();
    if(reg){
      await reg.update();
      if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
    }
    setTimeout(()=>location.reload(),900);
  }catch{
    location.reload();
  }
}

async function boot(){
  if(window.__Q){
    S.questions = window.__Q;
    S.skills = window.__SK;
  } else {
    const [a,b] = await Promise.all([
      fetch('data/questions.json'),
      fetch('data/skills.json')
    ]);
    S.questions = await a.json();
    S.skills = await b.json();
  }

  const validIds = new Set(S.questions.map(q=>q.id));
  S.mistakes = S.mistakes.filter(id=>validIds.has(id));
  localStorage.setItem('dd_mistakes', JSON.stringify(S.mistakes));

  $('#appVersionText').textContent = `v${APP_VERSION} · data v${DATA_SCHEMA_VERSION}`;

  $('#exportBtn').onclick = exportBackup;
  $('#importBtn').onclick = ()=>$('#importFileInput').click();
  $('#importFileInput').onchange = async e=>{
    const file = e.target.files?.[0];
    if(file) await importBackupFile(file);
    e.target.value = '';
  };
  $('#installHelpBtn').onclick = openInstallSheet;
  $('#closeInstallSheetBtn').onclick = closeInstallSheet;
  $('#installDoneBtn').onclick = closeInstallSheet;
  $('#installSheet').onclick = e=>{
    if(e.target === $('#installSheet')) closeInstallSheet();
  };
  $('#updateNowBtn').onclick = applyUpdate;

  $('#startBtn').onclick = ()=>startPractice(false);
  $('#mistakesBtn').onclick = ()=>startPractice(true);
  $('#statsBtn').onclick = ()=>openStats('home');
  $('#practiceStatsBtn').onclick = ()=>openStats('practice');
  $('#closeStatsBtn').onclick = closeStats;
  $('#closePracticeBtn').onclick = ()=>{
    S.reviewMistakes=false;
    showView('home');
    updateHome();
  };
  $('#checkBtn').onclick = checkAnswer;
  $('#nextBtn').onclick = nextQuestion;
  $('#skipBtn').onclick = skipQuestion;
  $('#hintBtn').onclick = toggleHint;

  $('#question').addEventListener('keydown', e=>{
    if(e.key === 'Enter' && !S.answered) checkAnswer();
  });

  $$('.mode-pill').forEach(btn=>{
    btn.onclick = ()=>{
      S.homeMode = btn.dataset.homeMode;
      localStorage.setItem('dd_home_mode', S.homeMode);
      updateHome();
    };
  });

  $$('.level-option').forEach(btn=>{
    btn.onclick = ()=>{
      S.levelFilter = btn.dataset.level;
      localStorage.setItem('dd_level_filter', S.levelFilter);
      updateHome();
    };
  });

  $('#resetBtn').onclick = ()=>{
    if(confirm('清除这台设备上的全部学习记录和错题吗？')){
      S.stats = {};
      S.mistakes = [];
      localStorage.removeItem('dd_stats');
      localStorage.removeItem('dd_mistakes');
      renderStats();
      updateHome();
    }
  };

  updateHome();
  renderStats();
  showView('home');

  if('serviceWorker' in navigator && !window.__Q){
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', ()=>{
      if(reloading) return;
      reloading = true;
      location.reload();
    });

    try{
      const reg = await navigator.serviceWorker.register('service-worker.js');
      reg.update().catch(()=>{});
    }catch{}
    checkForUpdate();
  }
}

boot().catch(err=>{
  document.body.innerHTML =
    `<main style="padding:24px;font-family:sans-serif"><h1>加载失败</h1><pre>${esc(err.message)}</pre></main>`;
});
