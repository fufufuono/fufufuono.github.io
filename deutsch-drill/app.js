const APP_VERSION = '1.11.3';
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
  guide: [],
  guideLevel: 'all',
  guideQuery: '',
  guideReturnView: 'home',
  guideDetailReturnView: 'guide',
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
  ['home','practice','stats','guide','guideDetail'].forEach(v => $(`#${v}View`)?.classList.toggle('hidden', v !== name));
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
  $('#skillTag').textContent = names.length === 1 ? `${names[0]} · 解释 ›` : `${names[0]} +${names.length-1} · 解释 ›`;
  $('#skillTag').classList.add('clickable-skill');
  $('#skillTag').onclick = ()=>openGuideDetail(S.current.skills[0],'practice');
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
    <div class="feedback-rule">${esc(S.current.explanation_zh)}</div>
    <button id="feedbackGuideBtn" class="feedback-guide-button" type="button">查看「${esc(skillName(S.current.skills[0]))}」详细解释 ›</button>`;

  $('#feedback').classList.remove('hidden');
  $('#feedbackGuideBtn').onclick=()=>openGuideDetail(S.current.skills[0],'practice');
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
    return `<button class="skill skill-link" data-guide-skill="${esc(s.id)}" type="button">
      <div class="skill-top">
        <span class="skill-name">${esc(s.name_zh)}</span>
        <span class="skill-score">${x.total ? pct+'% · '+x.total+'次' : '未练'} · 查看 ›</span>
      </div>
      <div class="bar"><i style="width:${x.total?pct:0}%"></i></div>
    </button>`;
  }).join('');
  [...document.querySelectorAll('#skillsGrid [data-guide-skill]')].forEach(btn=>{
    btn.onclick=()=>openGuideDetail(btn.dataset.guideSkill,'stats');
  });
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



const GUIDE_SUMMARIES = {
  article_nom:'Nominativ 主要标记主语，也用于 sein/werden/bleiben 后的表语。冠词必须同时匹配名词的性别和单复数。',
  article_acc:'Akkusativ 常表示直接宾语。最明显的冠词变化是阳性单数：der → den，ein → einen。',
  article_dat:'Dativ 常表示接收者，也由许多介词和动词固定支配：dem/der/dem/den。',
  pron_nom:'主格人称代词代替句子主语，并决定动词的人称变化：ich, du, er/sie/es, wir, ihr, sie/Sie。',
  pron_acc:'Akkusativ 人称代词用于直接宾语：mich, dich, ihn, sie, es, uns, euch, sie/Sie。',
  pron_dat:'Dativ 人称代词常表示接收者：mir, dir, ihm, ihr, ihm, uns, euch, ihnen/Ihnen。',
  possessive:'mein/dein/sein/ihr/unser/euer/Ihr 像 ein-类冠词一样变格；词尾取决于后面名词的格、性和数。',
  adj_def:'定冠词已经显示大量语法信息，因此后面的形容词使用弱变化，主要在 -e 和 -en 之间选择。',
  adj_ein:'ein-/kein-/物主冠词后使用混合变化；限定词没显示出的格/性信息由形容词词尾补出。',
  adj_strong:'无冠词时形容词自己承担格、性、数信息，因此使用强变化。',
  prep_acc:'durch, für, gegen, ohne, um 等介词固定支配 Akkusativ，不由“是否移动”决定。',
  prep_dat:'aus, bei, mit, nach, seit, von, zu 等介词固定支配 Dativ。',
  two_way:'an, auf, hinter, in, neben, über, unter, vor, zwischen 可接 Dativ 或 Akkusativ：Wo? → Dat.；Wohin? → Akk.',
  present_regular:'规则动词 Präsens 通常使用 -e/-st/-t/-en/-t/-en 的人称词尾。',
  present_irregular:'部分高频动词在 du 和 er/sie/es 中改变词干元音，如 fahren → fährst/fährt，lesen → liest。',
  present_sein_haben:'sein 和 haben 是最重要的高频不规则动词：bin/bist/ist… 与 habe/hast/hat…。',
  modal:'情态动词表达能力、必要、意愿、许可等；变位情态动词在前，实义动词 infinitive 通常位于句末。',
  separable:'可分动词在主句中把前缀分到句末；从句、Partizip II 和 zu-Infinitiv 中结构会重新组合。',
  perfect_haben:'大多数动词的 Perfekt 用 haben + Partizip II；haben 变位，Partizip II 通常位于句末。',
  perfect_sein:'部分位移/状态变化动词以及 bleiben 等在 Perfekt 中用 sein + Partizip II。',
  negation:'kein- 主要否定名词；nicht 否定动词、形容词、副词、介词短语或带定冠词的成分。',
  v2:'德语陈述主句的变位动词位于第二个句法位置；第一位置可以是主语、时间、地点等整个成分。',
  questions:'W-Frage 通常是 W-Wort + Verb + Subjekt；Ja/Nein-Frage 以变位动词开头。',
  plural_nouns:'德语复数没有单一规则，常见 -e/-er/-en/-s/零词尾，部分还发生 Umlaut；建议连同单数一起记。',
  weil:'weil 引导原因从句，变位动词位于从句末尾；若从句前置，后面的主句直接以变位动词开始。',
  dass:'dass 引导陈述性从句，常见于 sagen/denken/glauben/wissen/hoffen 后，有限动词位于末尾。',
  comparative:'比较级通常加 -er，最高级常用 am ...-sten/-esten；不同对象用 als，相同程度用 wie。',
  dative_plural:'Dativ Plural 常用 den，且复数名词通常再加 -n；若本来以 -n/-s 结尾通常不再添加。',
  n_declension:'部分阳性名词除 Nominativ Singular 外加 -n/-en，如 der Student → den/dem Studenten。',
  partizip_rules:'规则 Partizip II 常为 ge-...-t；可分前缀把 ge 放中间，不可分前缀和 -ieren 动词通常不用 ge-。',
  preterite_basic:'A2 阶段重点掌握 sein/haben/Modalverben 的 Präteritum：war, hatte, konnte, musste 等。',
  reflexive:'反身代词与主语同指：mich/dich/sich/uns/euch/sich；很多反身动词还固定搭配介词。',
  wenn:'wenn 表示条件或重复发生的时间关系；从句动词末位。过去一次性的时间背景通常用 als。',
  coord_conj:'aber/denn/sondern/oder 等并列连词不会把动词推到句末，后面仍保持主句 V2。',
  satzklammer:'句框把变位谓语放前部，另一部分谓语放句末：muss ... arbeiten / hat ... gearbeitet / ruft ... an。',
  double_object:'geben/zeigen/schicken/schenken 等常带 Dativ 接收者 + Akkusativ 事物。',
  indirect_questions:'间接问句使用 ob 或保留 W-Wort，并把变位动词放到从句末尾。',
  obwohl:'obwohl 引导让步从句“虽然……”，有限动词位于从句末尾。',
  deshalb:'deshalb 表示结果，trotzdem 表示“尽管如此”；它们占主句第一位时，变位动词紧随其后。',
  relative:'关系代词的性和数看先行词，格看它在关系从句中的功能；关系从句有限动词末位。',
  temporal_clauses:'als/wenn/bevor/nachdem/während/bis/seitdem/sobald 等表达一次、重复、先后、同时等时间关系。',
  relative_dat_prep:'复杂关系从句中关系代词可用 Dativ 或跟介词：mit dem, bei der, über das, an dem；动词仍末位。',
  konj2:'Konjunktiv II 表达假设、愿望和距离感；高频形式包括 wäre, hätte, könnte, müsste, dürfte, sollte。',
  konj2_functions:'Konjunktiv II 常用于礼貌请求、建议、愿望和非现实条件：Könnten Sie… / Du solltest… / Wenn ich… hätte…',
  passive:'Vorgangspassiv Präsens 用 werden + Partizip II，强调动作或过程而不是执行者。',
  passive_past:'过去被动态：Präteritum 用 wurde/wurden + Partizip II；Perfekt 用 ist/sind + Partizip II + worden。',
  inf_zu:'zu-Infinitiv 常跟 versuchen/hoffen/planen/vergessen 等；可分动词把 zu 放在前缀和词干之间。',
  inf_purpose:'um ... zu 表目的，ohne ... zu 表示未做某事，anstatt ... zu 表替代；通常两个动作共享主语。',
  verb_prep:'很多动词固定搭配介词和格，如 warten auf + Akk., teilnehmen an + Dat.，需要整体记忆。',
  pronominal_adverbs:'介词宾语指事物时常用 da(r)- 代副词，提问用 wo(r)-：darauf/worauf, daran/woran 等。',
  pronoun_order:'宾语顺序受名词/代词影响：两个完整名词常 Dat. → Akk.；两个代词常 Akk.-Pron. → Dat.-Pron.',
  genitive_basic:'Genitiv 表所属关系，也用于 wegen/trotz/während 等；阳/中单数常用 des 并给名词加 -s/-es。',
  adj_consolidated:'形容词变化综合要按“格 → 性/数 → 冠词类型”判断，再选择弱变化、混合变化或强变化。',
  complex_sentences:'复杂句应先按逗号和连词拆成子句，再分别检查 V2、从句动词末位、句框、关系从句和被动等规则。'
};

const GUIDE_TIPS = {
  article_acc:['重点检查阳性单数：den / einen / keinen / meinen。','不要因为宾语是“人”就自动用 Dativ；格由动词或介词决定。'],
  article_dat:['Dativ Plural 常同时出现 den + 名词 -n。','dem 是阳/中单数；den 是复数 Dativ。'],
  two_way:['关键是“位置还是方向”，不是“有没有动作”。','in dem → im；in das → ins 是常见缩合。'],
  adj_def:['先判断格，再看定冠词后该用 -e 还是 -en。','Dativ 和很多复数位置通常使用 -en。'],
  adj_ein:['ein-/mein- 没有显示出的语法信息常由形容词补出。','Akkusativ 阳性：einen alten Mann。'],
  adj_strong:['无冠词并不代表“不变格”，反而由形容词承担更多信息。','做题顺序仍应先判断格。'],
  prep_acc:['für/ohne/durch/gegen/um 后固定 Akkusativ。','不要写 *für dem Mann*。'],
  prep_dat:['mit/bei/von/zu/aus/seit/nach 后固定 Dativ。','zu dem/zur、bei dem/beim 等缩合要能识别。'],
  v2:['“第二位”指第二个句法成分，不是第二个单词。','从句不是 V2：weil/dass 等把有限动词推到末尾。'],
  weil:['不要写 *weil ich bin müde*。','前置 weil 从句后主句应是“..., gehe ich ...”。'],
  dass:['注意 dass 连词与 das 冠词/代词的拼写。','dass 从句有限动词末位。'],
  passive_past:['被动 Perfekt 用 worden，不用 geworden。','wurde geliefert 是过程；war geliefert 更偏状态。'],
  pronominal_adverbs:['da(r)-/wo(r)- 通常指事物；指人仍用介词 + 人称代词/wer。','形式取决于原动词固定介词。'],
  pronoun_order:['“Dativ 永远在 Akkusativ 前”不是绝对规则。','两个都是人称代词时常为 Akk. 代词在前：es ihm。'],
  genitive_basic:['阳/中单数名词常别忘 -s/-es。','本课程按标准书面德语训练；口语地区差异另论。'],
  complex_sentences:['先分子句再排词序，比一次凭语感处理整句更可靠。','每个子句都要单独判断有限动词位置。']
};

function guideLevels(level){
  if(level==='A1-A2') return ['A1','A2'];
  if(level==='A2-B1') return ['A2','B1'];
  return [level];
}
function hydratedPrompt(q){
  return q.prompt.replace(/\[\[(\d+)\]\]/g,(_,n)=>q.blanks?.[Number(n)]?.answer || '___');
}
function buildGuide(){
  S.guide=S.skills.map(s=>{
    const qs=S.questions.filter(q=>q.skills?.includes(s.id));
    const rules=[];
    for(const q of qs){
      const t=(q.explanation_zh||'').trim();
      if(t && !rules.includes(t)) rules.push(t);
      if(rules.length>=4) break;
    }
    const examples=[];
    const seen=new Set();
    for(const q of qs){
      const de=hydratedPrompt(q).replace(/\s*\([^)]*\)\s*$/,'').trim();
      if(de && !seen.has(de)){
        seen.add(de);
        examples.push({de,zh:q.explanation_zh||''});
      }
      if(examples.length>=2) break;
    }
    return {
      id:s.id,
      name_zh:s.name_zh,
      name_de:s.name_de,
      group:s.group||'Grammar',
      level_display:s.level,
      filter_levels:guideLevels(s.level),
      summary:GUIDE_SUMMARIES[s.id] || s.name_zh,
      rules:rules.length?rules:[GUIDE_SUMMARIES[s.id]||s.name_zh],
      examples,
      pitfalls:GUIDE_TIPS[s.id] || ['先判断这个语法点在句子中的功能，再选择形式。','如果另一个答案在当前语境中也成立，请把题目视为需要复核，而不是机械接受唯一答案。']
    };
  });
}

function guideEntry(id){
  return S.guide.find(x=>x.id===id);
}
function createGuideUI(){
  if($('#guideView')) return;

  const guideButton=document.createElement('button');
  guideButton.id='grammarGuideBtn';
  guideButton.className='guide-entry-button';
  guideButton.type='button';
  guideButton.innerHTML=`
    <span class="guide-book">Aa</span>
    <span><strong>Grammar guide</strong><small>${S.guide.length} 个语法 · A1–B1 详细解释</small></span>
    <span class="arrow dark">›</span>`;
  $('#homeView .home-actions').appendChild(guideButton);

  const list=document.createElement('section');
  list.id='guideView';
  list.className='view guide-view hidden';
  list.innerHTML=`
    <header class="guide-header">
      <button id="closeGuideBtn" class="plain-icon" type="button" aria-label="返回">‹</button>
      <div><p class="overline">REFERENCE</p><h2>Grammar guide</h2></div>
      <div class="guide-count">${S.guide.length}</div>
    </header>
    <div class="guide-tools">
      <label class="guide-search"><span>⌕</span><input id="guideSearch" type="search" inputmode="search" placeholder="搜索语法，例如 Dativ / 关系从句"></label>
      <div class="guide-levels">
        <button class="guide-level active" data-guide-level="all">All</button>
        <button class="guide-level" data-guide-level="A1">A1</button>
        <button class="guide-level" data-guide-level="A2">A2</button>
        <button class="guide-level" data-guide-level="B1">B1</button>
      </div>
    </div>
    <div id="guideList" class="guide-list"></div>`;

  const detail=document.createElement('section');
  detail.id='guideDetailView';
  detail.className='view guide-detail-view hidden';
  detail.innerHTML=`
    <header class="guide-header detail-head">
      <button id="closeGuideDetailBtn" class="plain-icon" type="button" aria-label="返回">‹</button>
      <div><p class="overline">GRAMMAR</p><h2 id="guideDetailTopTitle">Details</h2></div>
      <span id="guideDetailLevel" class="level-tag">A1</span>
    </header>
    <article id="guideDetailContent" class="guide-detail-content"></article>`;

  $('#app').appendChild(list);
  $('#app').appendChild(detail);
  guideButton.onclick=()=>openGuide('home');
  $('#closeGuideBtn').onclick=()=>showView(S.guideReturnView);
  $('#closeGuideDetailBtn').onclick=()=>showView(S.guideDetailReturnView);
  $('#guideSearch').oninput=e=>{S.guideQuery=e.target.value||'';renderGuideList();};
  [...document.querySelectorAll('.guide-level')].forEach(btn=>btn.onclick=()=>{
    S.guideLevel=btn.dataset.guideLevel;
    [...document.querySelectorAll('.guide-level')].forEach(x=>x.classList.toggle('active',x===btn));
    renderGuideList();
  });
}
function guideMatches(g){
  const levelOK=S.guideLevel==='all'||g.filter_levels.includes(S.guideLevel);
  if(!levelOK) return false;
  const q=norm(S.guideQuery);
  if(!q) return true;
  return norm([g.name_zh,g.name_de,g.summary,g.group,...g.rules,...g.examples.flatMap(x=>[x.de,x.zh])].join(' ')).includes(q);
}
function renderGuideList(){
  const rows=S.guide.filter(guideMatches);
  const rank=g=>g.filter_levels.includes('A1')?1:(g.filter_levels.includes('A2')?2:3);
  rows.sort((a,b)=>rank(a)-rank(b)||a.group.localeCompare(b.group)||a.name_de.localeCompare(b.name_de));
  if(!rows.length){$('#guideList').innerHTML='<div class="guide-empty">没有找到匹配的语法。</div>';return;}
  const grouped=new Map();
  rows.forEach(g=>{const l=g.filter_levels[0]||'B1';if(!grouped.has(l))grouped.set(l,[]);grouped.get(l).push(g);});
  $('#guideList').innerHTML=['A1','A2','B1'].filter(l=>grouped.has(l)).map(level=>`
    <section class="guide-level-section">
      <div class="guide-section-title"><span class="level-tag small">${level}</span><strong>${level} grammar</strong><small>${grouped.get(level).length}</small></div>
      <div class="guide-cards">${grouped.get(level).map(g=>`
        <button class="guide-card" type="button" data-guide-id="${esc(g.id)}">
          <span class="guide-card-main"><strong>${esc(g.name_de)}</strong><small>${esc(g.name_zh)}</small><em>${esc(g.summary)}</em></span>
          <span class="guide-card-side"><span>${esc(g.level_display)}</span><b>›</b></span>
        </button>`).join('')}</div>
    </section>`).join('');
  [...document.querySelectorAll('#guideList [data-guide-id]')].forEach(btn=>btn.onclick=()=>openGuideDetail(btn.dataset.guideId,'guide'));
}
function openGuide(from='home'){
  S.guideReturnView=from;createGuideUI();renderGuideList();showView('guide');
}
function openGuideDetail(skillId,from='guide'){
  const g=guideEntry(skillId); if(!g) return;
  createGuideUI();
  S.guideDetailReturnView=from;
  $('#guideDetailTopTitle').textContent=g.name_zh;
  $('#guideDetailLevel').textContent=g.level_display;
  $('#guideDetailContent').innerHTML=`
    <div class="guide-detail-title"><span class="guide-group">${esc(g.group)}</span><h1>${esc(g.name_de)}</h1><p>${esc(g.name_zh)}</p></div>
    <div class="guide-summary">${esc(g.summary)}</div>
    <section class="guide-detail-section"><h3>核心规则</h3><ul>${g.rules.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>
    <section class="guide-detail-section"><h3>例句</h3><div class="example-list">${g.examples.map(x=>`<div class="example-row"><strong>${esc(x.de)}</strong><span>${esc(x.zh)}</span></div>`).join('')}</div></section>
    <section class="guide-detail-section warning"><h3>常见错误 / 提示</h3><ul>${g.pitfalls.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`;
  showView('guideDetail');
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
  buildGuide();
  createGuideUI();

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
