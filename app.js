/* ================================================================
   高校教师资格证刷题站  app.js
   八模块：首页倒计时 / 练习 / 模拟考试 / 错题集 / 错题强化 / 统计分析 / 概率预测 / 题库管理
   数据全部存 localStorage（站点无后端）
   ================================================================ */
'use strict';

const LS = {
  state: 'qz_state_v1',
  custom: 'qz_custom_v1',
  meta:  'qz_meta_v1'
};
const PASS_LINE = 60;            // 及格线（分）
const BOOST_NEED = 3;            // 错题强化：连续答对 N 次移出

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------------- 状态 ---------------- */
function blankState() {
  return {
    answers: {},   // qid -> {p: 选中, ok: bool, t: 时间戳, mode: 'practice'|'exam'|'boost'}
    wrong:   {},   // qid -> {first, last, n, streak, solved}
    exams:   [],   // {id, subject, at, score, total, pass, right, wrong, list:[{qid,pick,ok}]}
    streak:  { day: '', n: 0 }
  };
}
function loadState() {
  try { return Object.assign(blankState(), JSON.parse(localStorage.getItem(LS.state) || '{}')); }
  catch (e) { return blankState(); }
}
function saveState() {
  localStorage.setItem(LS.state, JSON.stringify(S));
  tickToday();
}
function loadCustom() {
  try { return JSON.parse(localStorage.getItem(LS.custom) || '[]'); } catch (e) { return []; }
}
function saveCustom(c) { localStorage.setItem(LS.custom, JSON.stringify(c)); }

let S = loadState();
let META = null, SUBJ = [], BANK = {};   // BANK[key] = [questions]

/* ---------------- 数据加载 ---------------- */
async function loadJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(url + ' -> ' + r.status);
  return r.json();
}
async function init() {
  try {
    META = await loadJSON('data/subjects.json');
    $('#examDate').textContent = META.site.exam_date.replace(/-/g, '/');
    for (const s of META.subjects) {
      try {
        const d = await loadJSON(s.file);
        BANK[s.key] = d.questions || [];
      } catch (e) { BANK[s.key] = []; }
    }
    // 合并本地自建题
    const cust = loadCustom();
    for (const c of cust) {
      if (!BANK[c.subject]) BANK[c.subject] = [];
      BANK[c.subject] = BANK[c.subject].concat(c.questions || []);
    }
    SUBJ = META.subjects;
  } catch (e) {
    document.getElementById('main').innerHTML =
      '<div class="card"><div class="empty"><span class="ico">⚠️</span>' +
      '题库数据加载失败：' + esc(e.message) + '<br><span class="muted">请检查 data/ 目录是否完整</span></div></div>';
    return;
  }
  bindTabs();
  go('home');
  setInterval(tickToday, 1000);
}

/* ---------------- 倒计时 ---------------- */
function daysBetween(a, b) {
  const d1 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const d2 = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((d1 - d2) / 86400000);
}
function tickToday() {
  const now = new Date();
  const [Y, M, D] = ((META && META.site.exam_date) || '2026-10-25').split('-').map(Number);
  const exam = new Date(Y, M - 1, D);
  setText('#todayDate', now.getFullYear() + '/' + pad(now.getMonth() + 1) + '/' + pad(now.getDate()));
  setText('#examDate', Y + '/' + pad(M) + '/' + pad(D));
  const d = daysBetween(exam, now);
  setText('#cdLeft', d > 0 ? d : (d === 0 ? '今天' : '已过'));
  const t = $('#cdTag'); if (t) t.textContent = d > 0 ? '天后考试' : (d === 0 ? '今天考试' : '考试已结束');
}
function setText(sel, txt) { const e = $(sel); if (e) e.textContent = txt; }
const pad = n => String(n).padStart(2, '0');

/* ---------------- 导航 ---------------- */
function bindTabs() {
  $$('#tabs button').forEach(b => b.onclick = () => {
    $$('#tabs button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    go(b.dataset.view);
  });
}
function go(view) {
  $$('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.view === view));
  const V = { home: vHome, practice: vPractice, exam: vExam, wrong: vWrong,
              boost: vBoost, stats: vStats, manage: vManage };
  (V[view] || vHome)();
  window.scrollTo(0, 0);
}

/* ---------------- 首页 ---------------- */
function vHome() {
  const cust = loadCustom().reduce((a, c) => a + (c.questions ? c.questions.length : 0), 0);
  const totalQ = SUBJ.reduce((a, s) => a + (BANK[s.key] || []).length, 0);
  const days = $('#daysLeft').textContent;
  let h = '';

  h += '<div class="card"><div class="row spread">' +
       '<div><h2 style="margin-bottom:4px">距考试还有 ' +
         '<span style="color:var(--amber);font-size:30px">' + esc(days) + '</span> 天</h2>' +
         '<div class="muted">' + esc(META.site.exam_venue) + ' · ' + esc(META.site.exam_note) +
         ' · 今日 ' + esc($('#todayDate').textContent) + '</div></div>' +
       '<div class="row">' +
         '<span class="chip">题库 <b>' + totalQ + '</b></span>' +
         '<span class="chip">自建 <b>' + cust + '</b></span>' +
         '<span class="chip">已作答 <b>' + Object.keys(S.answers).length + '</b></span>' +
       '</div></div></div>';

  // 科目卡
  h += '<h3>四门科目 · 10月25日（考试日程）</h3><div class="grid g4">';
  for (const s of SUBJ) {
    const n = (BANK[s.key] || []).length;
    const st = subjStat(s.key);
    const pct = n ? Math.round(st.done / n * 100) : 0;
    const acc = st.done ? Math.round(st.right / st.done * 100) : 0;
    h += '<div class="card subj" onclick="pickSubject(\'' + s.key + '\')">' +
      '<div class="nm">' + esc(s.name) + '</div>' +
      '<div class="mt">' +
        '<span class="badge ' + (s.mode === '闭卷' ? 'close' : 'open') + '">' + esc(s.mode) + '</span> ' +
        esc(s.session) + '<br>官方题 ' + officialQs(s.key).length +
        (aiCount(s.key) ? ' ＋ AI待核 ' + aiCount(s.key) : '') +
        ' · 已刷 ' + st.done + ' · 正确率 ' + acc + '%' +
      '</div>' +
      '<div class="bar"><i class="' + (acc >= 60 ? 'g' : '') + '" style="width:' + (st.done ? Math.min(100, acc) : 0) + '%"></i></div>' +
      '</div>';
  }
  h += '</div>';

  // 概率
  h += '<h3>通过概率预测</h3>' + probCards();

  h += '<div class="note" style="margin-top:16px"><b>考试安排（2026-10-25 湖南师范大学）</b><br>' +
       '上午：高等教育学 8:00-9:50（闭卷）→ 高等教育心理学 10:10-12:00（闭卷）<br>' +
       '下午：高校教师职业道德修养 14:00-15:40（开卷）→ 高等教育法规概论 16:00-17:40（开卷）<br>' +
       '第五门《教育教学技能》为线上交材料，截止 ' + esc(META.site.skill_deadline) + '。' +
       '</div>';

  $('#main').innerHTML = h;
}

/* ---------------- 统计核心 ---------------- */
function subjStat(key) {
  let done = 0, right = 0, wrongN = 0;
  for (const q of officialQs(key)) {
    const a = S.answers[q.id];
    if (a) { done++; if (a.ok) right++; else wrongN++; }
  }
  const wq = officialQs(key).filter(q => S.wrong[q.id] && !S.wrong[q.id].solved).length;
  return { done, right, wrong: wrongN, openWrong: wq };
}
/* 官方答案题：排除 AI 待核题（概率预测只用它） */
function officialQs(key) { return (BANK[key] || []).filter(q => !q.ai_answered); }
function aiCount(key) { return (BANK[key] || []).filter(q => q.ai_answered).length; }

/* 概率算法：Wilson 下界 + 正态近似 P(真实正确率 ≥ 及格线)
   说明：无历史真考成绩，用本人作答的正确率估计水平，取单侧置信下界保守估算。 */
function zScore(p) { // 标准正态 CDF 近似
  const t = 1 / (1 + 0.2316419 * Math.abs(p));
  const d = 0.3989423 * Math.exp(-p * p / 2);
  let pr = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return p > 0 ? 1 - pr : pr;
}
function probOf(key) {
  const qs = officialQs(key);
  const n = qs.length;
  if (!n) return { ready: false, p: 0, done: 0, acc: 0, cover: 0 };
  let right = 0, done = 0;
  for (const q of qs) { const a = S.answers[q.id]; if (a) { done++; if (a.ok) right++; } }
  const cover = done / n;
  if (done < 5) return { ready: false, p: 0.5, done, acc: 0, cover };  // 样本不足给先验
  // Laplace 平滑
  const phat = (right + 1) / (done + 2);
  const se = Math.sqrt(Math.max(phat * (1 - phat), 1e-6) / (done + 2));
  const target = PASS_LINE / 100;
  const z = (phat - target) / se;
  const p = zScore(z);
  // 覆盖率折扣：刷得越少，越可能没见过的题更难
  const pAdj = p * (0.55 + 0.45 * Math.min(1, cover / 0.5));
  return { ready: true, p: Math.max(0, Math.min(1, pAdj)), done, acc: done ? right / done : 0, cover, phat };
}
function totalProb() {
  if (!SUBJ.length) return 0;
  let m = 1;
  for (const s of SUBJ) m *= probOf(s.key).p;
  return m;
}
function probCards() {
  let h = '<div class="grid g4">';
  for (const s of SUBJ) {
    const r = probOf(s.key);
    const pct = Math.round(r.p * 100);
    h += '<div class="stat ' + (pct >= 75 ? 'g' : pct < 50 ? 'b' : '') + '">' +
      '<div class="v">' + pct + '%</div>' +
      '<div class="k">' + esc(s.name) + (r.ready ? '' : '（样本不足，按 50% 估计）') + '</div></div>';
  }
  const t = Math.round(totalProb() * 100);
  h += '<div class="stat i"><div class="v">' + t + '%</div>' +
       '<div class="k">四科全过 · 拿证总概率</div></div>';
  h += '</div>';
  h += '<p class="muted" style="margin-top:9px">算法：Laplace 平滑正确率 → 单侧 95% 置信下界 → 与及格线 60 分比较的正态近似，' +
       '再按刷题覆盖率打折。四科全过概率取四门连乘（视为独立）。<b>模型估算，非官方预测</b>；作答越多越准，不足 5 题按 50% 计。</p>';
  return h;
}

/* ---------------- 练习 ---------------- */
let P = { subj: null, list: [], i: 0, pick: [], revealed: false };
function pickSubject(key) { P = { subj: key, list: shuffle((BANK[key] || []).slice()), i: 0, pick: [], revealed: false }; go('practice'); }

function vPractice() {
  if (!P.subj) {
    let h = '<h2>练习模式</h2><div class="muted" style="margin-bottom:14px">选一个科目开始，单题作答、即时判对错</div><div class="grid g4">';
    for (const s of SUBJ) {
      const st = subjStat(s.key);
      h += '<div class="card subj" onclick="pickSubject(\'' + s.key + '\')">' +
        '<div class="nm">' + esc(s.name) + '</div>' +
        '<div class="mt">题量 ' + (BANK[s.key] || []).length + ' · 已刷 ' + st.done + '</div></div>';
    }
    $('#main').innerHTML = h + '</div>';
    return;
  }
  const list = P.list;
  if (!list.length) { $('#main').innerHTML = '<div class="card"><div class="empty"><span class="ico">📭</span>该科目暂无题目</div></div>'; return; }
  if (P.i >= list.length) P.i = 0;
  const q = list[P.i];
  $('#main').innerHTML =
    '<div class="row spread" style="margin-bottom:14px">' +
      '<div class="row"><button class="btn sm" onclick="P.subj=null;go(\'practice\')">← 换科目</button>' +
      '<span class="badge">' + esc(subjName(P.subj)) + '</span>' +
      '<span class="muted">第 ' + (P.i + 1) + ' / ' + list.length + ' 题</span></div>' +
      '<div class="row"><button class="btn sm" onclick="pracMove(-1)">上一题</button>' +
      '<button class="btn sm" onclick="pracMove(1)">下一题</button>' +
      '<button class="btn sm" onclick="pracShuffle()">随机</button></div>' +
    '</div>' + renderQ(q, 'practice') +
    '<div class="row" style="margin-top:12px">' +
      '<button class="btn primary" onclick="pracSubmit()">提交答案</button>' +
      (P.revealed ? '<button class="btn" onclick="pracMove(1)">下一题 →</button>' : '') +
      '<button class="btn sm" onclick="pracShuffle()">换一批</button>' +
    '</div>';
  bindQ(q, 'practice');
}

function renderQ(q, mode) {
  const a = S.answers[q.id];
  const revealed = (mode === 'practice' && P.revealed) || (mode === 'boost' && B.revealed);
  const picks = mode === 'practice' ? P.pick : (mode === 'boost' ? B.pick : []);
  let h = '<div class="card">';
  h += '<div class="qhead"><span class="qno">题号 ' + esc(q.id) + '</span>' +
       '<span class="tag">' + esc(typeName(q.type)) + (q.source ? ' · ' + esc(q.source) : '') +
       (q.ai_answered ? ' <span class="tag" style="background:#2a2018;border-color:#6b4a1a;color:#f0b429">AI 待核对</span>' : '') +
       '</span></div>';
  h += '<div class="qstem">' + esc(q.stem) + '</div>';
  if (q.options && q.options.length) {
    q.options.forEach((o, idx) => {
      const key = String.fromCharCode(65 + idx);
      const correct = answerLetters(q).includes(key);
      let cls = 'opt';
      if (revealed) { cls += ' dis' + (correct ? ' right' : (picks.includes(key) ? ' wrong' : '')); }
      else if (picks.includes(key)) cls += ' sel';
      h += '<div class="' + cls + '" data-k="' + key + '"><span class="k">' + key + '</span><span>' + esc(o.replace(/^[A-D][.、]\s*/, '')) + '</span></div>';
    });
  } else {
    h += '<textarea id="txtAns" placeholder="作答…">' + esc(picks[0] || '') + '</textarea>';
  }
  if (revealed) {
    const ok = checkQ(q, picks);
    h += '<div class="verdict ' + (ok ? 'ok' : 'no') + '"><b>' + (ok ? '✓ 回答正确' : '✗ 回答错误') +
         '</b>正确答案：<b>' + esc(answerText(q)) + '</b></div>';
    if (q.explanation) h += '<div class="exp">解析：' + esc(q.explanation) + '</div>';
  }
  h += '</div>';
  return h;
}
const subjName = k => (SUBJ.find(s => s.key === k) || {}).name || k;
const typeName = t => ({ single: '单选', multi: '多选', judge: '判断', short: '简答', essay: '论述' }[t] || '题目');
function answerLetters(q) {
  const a = q.answer;
  if (Array.isArray(a)) return a.map(x => String(x).trim().toUpperCase());
  return String(a || '').toUpperCase().split(/[^A-D]+/).filter(Boolean);
}
function answerText(q) {
  return Array.isArray(q.answer) ? q.answer.join('') : String(q.answer || '');
}
function checkQ(q, picks) {
  const t = q.type;
  if (t === 'short' || t === 'essay') {
    const txt = (picks[0] || '').trim();
    if (!txt) return false;
    const std = String(q.answer || '');
    if (!std) return true;
    // 关键词命中率
    const keys = std.split(/[；;。.\s/]+/).filter(x => x.length >= 2);
    if (!keys.length) return true;
    const hit = keys.filter(k => txt.includes(k)).length;
    return hit / keys.length >= 0.4;
  }
  const mine = picks.map(x => x.toUpperCase()).sort().join('');
  const right = answerLetters(q).sort().join('');
  return mine === right && mine !== '';
}
function bindQ(q, mode) {
  const picks = mode === 'practice' ? P.pick : B.pick;
  $$('.opt').forEach(el => {
    if (el.classList.contains('dis')) return;
    el.onclick = () => {
      const k = el.dataset.k;
      const multi = q.type === 'multi';
      if (multi) {
        const i = picks.indexOf(k);
        if (i >= 0) picks.splice(i, 1); else picks.push(k);
      } else { picks.length = 0; picks.push(k); }
      if (mode === 'practice') renderPracticeQ(); else renderBoostQ();
    };
  });
}
function renderPracticeQ() { vPractice(); }
function renderBoostQ() { vBoost(); }

/* 练习提交 */
function pracSubmit() {
  const q = P.list[P.i];
  const inp = $('#txtAns');
  if (inp) P.pick = [inp.value];
  if (!P.pick.length) { alert('请先作答'); return; }
  const ok = checkQ(q, P.pick);
  recordAnswer(q, P.pick, ok, 'practice');
  P.revealed = true;
  vPractice();
}
function pracMove(d) {
  if (P.revealed || d < 0) {
    P.revealed = false; P.pick = [];
    P.i = (P.i + d + P.list.length) % P.list.length;
    vPractice();
  } else if (confirm('当前题未提交，直接跳过？')) {
    P.pick = []; P.i = (P.i + d + P.list.length) % P.list.length; vPractice();
  }
}
function pracShuffle() { P.list = shuffle(P.list); P.i = 0; P.pick = []; P.revealed = false; vPractice(); }

/* ---------------- 作答记录（练习/强化共用，错题与连对都从这里走） ---------------- */
function recordAnswer(q, pick, ok, mode) {
  S.answers[q.id] = { p: pick, ok: ok, t: Date.now(), mode: mode };
  const w = S.wrong[q.id];
  if (!ok) {
    if (!w) S.wrong[q.id] = { first: Date.now(), last: Date.now(), n: 1, streak: 0, solved: false };
    else { w.last = Date.now(); w.n++; w.streak = 0; w.solved = false; }
  } else if (mode === 'boost' && w) {
    w.streak = (w.streak || 0) + 1;
    if (w.streak >= BOOST_NEED) w.solved = true;   // 连对 3 次 -> 移出错题强化
  }
  saveState();
}

/* ---------------- 模拟考试 ---------------- */
let E = { subj: null, n: 0, list: [], i: 0, picked: {}, running: false, left: 0, timer: null };
function vExam() {
  if (E.running) { renderExamRun(); return; }
  if (E.subj === null) {
    let h = '<h2>模拟考试</h2><p class="muted" style="margin-bottom:14px">整卷限时作答，交卷自动打分，成绩与每次记录都会存档</p><div class="card">';
    h += '<div class="row" style="margin-bottom:12px"><label>科目</label><select id="exSubj">' +
         SUBJ.map(s => '<option value="' + s.key + '">' + esc(s.name) + '（官方 ' +
           officialQs(s.key).length + ' / 含AI ' + (BANK[s.key] || []).length + '）</option>').join('') +
         '</select><label>题数</label><select id="exN">' +
         [10, 15, 20, 30, 50].map(n => '<option value="' + n + '">' + n + '</option>').join('') +
         '<option value="0">全部</option></select>' +
         '<label>时长(分钟)</label><input type="number" id="exMin" value="40" min="1" max="300" style="width:90px"></div>';
    h += '<label style="display:flex;gap:8px;align-items:center;margin-bottom:12px;color:var(--fg2)">' +
      '<input type="checkbox" id="exAi" style="width:16px;height:16px"> ' +
      '把「AI 待核对」题也纳入考试（<b>默认不纳入</b>——AI 答案可能有错，正式测分请用官方答案题）</label>';
    h += '<button class="btn primary" onclick="examStart()">开始考试</button>';
    h += '</div>';
    h += '<h3>历史考试记录</h3>';
    if (!S.exams.length) h += '<div class="card"><div class="empty"><span class="ico">🗒️</span>还没有考试记录</div></div>';
    else {
      h += '<div class="card"><table><thead><tr><th>时间</th><th>科目</th><th>得分</th><th>用时</th><th>结果</th><th></th></tr></thead><tbody>';
      S.exams.slice().reverse().forEach((e, idx) => {
        const dt = new Date(e.at);
        h += '<tr><td>' + dt.getFullYear() + '/' + pad(dt.getMonth() + 1) + '/' + pad(dt.getDate()) + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + '</td>' +
          '<td>' + esc(subjName(e.subject)) + '</td>' +
          '<td class="num"><b style="color:' + (e.pass ? 'var(--good)' : 'var(--bad)') + '">' + e.score + '</b> / ' + e.total + '</td>' +
          '<td class="num">' + Math.floor(e.sec / 60) + ' 分 ' + (e.sec % 60) + ' 秒</td>' +
          '<td>' + (e.pass ? '及格' : '未及格') + '</td>' +
          '<td class="row" style="justify-content:flex-end"><button class="btn sm" onclick="examDetail(' + (S.exams.length - 1 - idx) + ')">详情</button></td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '<p class="muted">及格线 ' + PASS_LINE + ' 分。多选题错选不得分，少选按比例给分。</p>';
    $('#main').innerHTML = h;
    return;
  }
  renderExamRun();
}
function examStart() {
  const key = $('#exSubj').value;
  const n = parseInt($('#exN').value, 10) || 0;
  const min = parseInt($('#exMin').value, 10) || 40;
  const withAi = $('#exAi') && $('#exAi').checked;
  const src = withAi ? (BANK[key] || []) : officialQs(key);
  let pool = shuffle(src.slice());
  if (n > 0 && n < pool.length) pool = pool.slice(0, n);
  if (!pool.length) { alert('该科目暂无题目'); return; }
  E = { subj: key, n: pool.length, list: pool, i: 0, picked: {}, running: true,
        left: min * 60, sec: 0, timer: null };
  E.timer = setInterval(() => {
    E.left--; E.sec++;
    if (E.left <= 0) { clearInterval(E.timer); examSubmit(true); return; }
    const el = $('#exLeft'); if (el) el.textContent = fmt(E.left);
  }, 1000);
  renderExamRun();
}
function fmt(s) { return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
function renderExamRun() {
  const q = E.list[E.i];
  let h = '<div class="exambanner"><span>' + esc(subjName(E.subj)) + '</span>' +
    '<span class="t" id="exLeft">' + fmt(E.left) + '</span><span class="muted">剩余</span>' +
    '<span class="chip">已答 <b>' + Object.keys(E.picked).length + '</b>/' + E.n + '</span>' +
    '<span style="flex:1"></span>' +
    '<button class="btn sm danger" onclick="if(confirm(\'确认提前交卷？\'))examSubmit(false)">交卷</button></div>';
  h += '<div class="card"><div class="qhead"><span class="qno">' + (E.i + 1) + ' / ' + E.n + '</span>' +
       '<span class="tag">' + esc(typeName(q.type)) + '</span></div>' +
       '<div class="qstem">' + esc(q.stem) + '</div>';
  const cur = E.picked[q.id] || [];
  if (q.options && q.options.length) {
    q.options.forEach((o, idx) => {
      const k = String.fromCharCode(65 + idx);
      h += '<div class="opt' + (cur.includes(k) ? ' sel' : '') + '" data-k="' + k + '">' +
           '<span class="k">' + k + '</span><span>' + esc(o.replace(/^[A-D][.、]\s*/, '')) + '</span></div>';
    });
  } else h += '<textarea id="exTxt">' + esc(cur[0] || '') + '</textarea>';
  h += '</div>';
  h += '<div class="row spread" style="margin-top:12px">' +
       '<button class="btn sm" onclick="examMove(-1)">← 上一题</button>' +
       '<span class="muted">交卷后不可修改</span>' +
       '<button class="btn sm" onclick="examMove(1)">下一题 →</button></div>';
  h += '<div class="pager">' + E.list.map((x, i) => {
    const done = E.picked[x.id] && E.picked[x.id].length;
    return '<button class="' + (i === E.i ? 'on' : '') + (done ? ' done' : '') + '" onclick="examJump(' + i + ')">' + (i + 1) + '</button>';
  }).join('') + '</div>';
  $('#main').innerHTML = h;
  $$('.opt').forEach(el => el.onclick = () => {
    const k = el.dataset.k, q2 = E.list[E.i];
    const cur = E.picked[q2.id] || [];
    if (q2.type === 'multi') { const i = cur.indexOf(k); if (i >= 0) cur.splice(i, 1); else cur.push(k); }
    else { E.picked[q2.id] = [k]; }
    E.picked[q2.id] = q2.type === 'multi' ? cur : E.picked[q2.id];
    renderExamRun();
  });
}
function examMove(d) {
  const t = $('#exTxt'); if (t) E.picked[E.list[E.i].id] = [t.value];
  E.i = Math.max(0, Math.min(E.n - 1, E.i + d)); renderExamRun();
}
function examJump(i) { const t = $('#exTxt'); if (t) E.picked[E.list[E.i].id] = [t.value]; E.i = i; renderExamRun(); }
function examSubmit(auto) {
  const t = $('#exTxt'); if (t) E.picked[E.list[E.i].id] = [t.value];
  clearInterval(E.timer);
  let right = 0, wrong = 0, unanswered = 0, list = [];
  for (const q of E.list) {
    const pick = (E.picked[q.id] || []).filter(x => x);
    if (!pick.length) { unanswered++; list.push({ qid: q.id, pick: '', ok: false }); continue; }
    const ok = checkQ(q, pick);
    if (ok) right++; else wrong++;
    recordAnswer(q, pick, ok, 'exam');
    list.push({ qid: q.id, pick: Array.isArray(pick) ? pick.join('') : pick, ok: ok });
  }
  const score = Math.round(right / E.list.length * 100);
  const rec = { id: 'E' + Date.now(), subject: E.subj, at: Date.now(), sec: E.sec,
                score: score, total: 100, pass: score >= PASS_LINE,
                right: right, wrong: wrong, unanswered: unanswered, list: list };
  S.exams.push(rec); saveState();
  const E2 = E; E.running = false; E = { subj: null, n: 0, list: [], i: 0, picked: {}, running: false, left: 0, timer: null };
  showExamResult(rec, auto);
}
function showExamResult(r, auto) {
  let h = '<h2>考试结果' + (auto ? '（时间到，自动交卷）' : '') + '</h2><div class="card">' +
    '<div class="row" style="gap:24px">' +
    '<div class="stat ' + (r.pass ? 'g' : 'b') + '"><div class="v">' + r.score + '</div><div class="k">得分 / 100</div></div>' +
    '<div class="stat g"><div class="v">' + r.right + '</div><div class="k">答对</div></div>' +
    '<div class="stat b"><div class="v">' + r.wrong + '</div><div class="k">答错</div></div>' +
    '<div class="stat i"><div class="v">' + r.unanswered + '</div><div class="k">未作答</div></div>' +
    '<div class="stat"><div class="v">' + Math.floor(r.sec / 60) + '′</div><div class="k">用时</div></div>' +
    '</div><p class="muted" style="margin-top:12px">' + esc(subjName(r.subject)) +
    (r.pass ? ' 已达及格线 ' : ' 未达及格线 ') + PASS_LINE + ' 分。本次已加入统计与错题。</p>' +
    '<div class="row" style="margin-top:12px"><button class="btn primary" onclick="go(\'exam\')">返回考试列表</button>' +
    '<button class="btn" onclick="examDetail(' + (S.exams.length - 1) + ')">查看逐题明细</button></div></div>';
  $('#main').innerHTML = h;
}
function examDetail(idx) {
  const r = S.exams[idx];
  if (!r) return;
  let h = '<div class="row spread"><h2>' + esc(subjName(r.subject)) + ' · 考试明细</h2>' +
          '<button class="btn sm" onclick="go(\'exam\')">← 返回</button></div>' +
          '<div class="card"><div class="muted">' + new Date(r.at).toLocaleString('zh-CN') +
          ' · 得分 ' + r.score + ' · 对 ' + r.right + ' 错 ' + r.wrong + ' 未答 ' + r.unanswered + '</div></div>';
  const map = {};
  for (const s of SUBJ) for (const q of (BANK[s.key] || [])) map[q.id] = q;
  r.list.forEach((it, i) => {
    const q = map[it.qid];
    if (!q) return;
    h += '<div class="card"><div class="qhead"><span class="qno">第 ' + (i + 1) + ' 题</span>' +
      '<span class="tag">' + (it.ok ? '<span style="color:var(--good)">答对</span>' : '<span style="color:var(--bad)">答错</span>') + '</span></div>' +
      '<div class="qstem">' + esc(q.stem) + '</div>' +
      '<div class="muted">你的作答：<b>' + esc(it.pick || '未作答') + '</b>　正确答案：<b style="color:var(--good)">' + esc(answerText(q)) + '</b></div>';
    if (q.explanation && !it.ok) h += '<div class="exp">解析：' + esc(q.explanation) + '</div>';
    h += '</div>';
  });
  $('#main').innerHTML = h;
}

/* ---------------- 错题集 ---------------- */
let W = { subj: 'all' };
function vWrong() {
  const ids = Object.keys(S.wrong).filter(id => !S.wrong[id].solved);
  let h = '<div class="row spread"><h2>错题集</h2><div class="row">' +
    '<select id="wSubj"><option value="all">全部科目</option>' +
    SUBJ.map(s => '<option value="' + s.key + '"' + (W.subj === s.key ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') +
    '</select></div></div>';
  const map = allQuestions();
  const items = ids.map(id => map[id]).filter(Boolean)
    .filter(q => W.subj === 'all' || q.subject === W.subj);
  h += '<p class="muted" style="margin-bottom:12px">共 <b>' + items.length + '</b> 道未解决错题（答错自动收录）。' +
       '需要更狠的专练请用「错题强化」。</p>';
  if (!items.length) {
    h += '<div class="card"><div class="empty"><span class="ico">🎉</span>暂无错题<br><span class="muted">继续刷题，错题会自动进来</span></div></div>';
    $('#main').innerHTML = h;
    $('#wSubj').onchange = e => { W.subj = e.target.value; vWrong(); };
    return;
  }
  h += '<div class="grid g2">';
  items.forEach(q => {
    const w = S.wrong[q.id];
    h += '<div class="card"><div class="qhead"><span class="qno">' + esc(subjName(q.subject)) + '</span>' +
      '<span class="tag">错 ' + w.n + ' 次</span></div>' +
      '<div class="qstem" style="font-size:15px">' + esc(q.stem.slice(0, 90)) + (q.stem.length > 90 ? '…' : '') + '</div>' +
      '<div class="muted">正确答案：<b>' + esc(answerText(q)) + '</b>　上次作答：' +
      esc((S.answers[q.id] || {}).p ? (S.answers[q.id].p.join ? S.answers[q.id].p.join('') : S.answers[q.id].p) : '-') + '</div>' +
      (q.explanation ? '<div class="exp">' + esc(q.explanation.slice(0, 140)) + (q.explanation.length > 140 ? '…' : '') + '</div>' : '') +
      '<div class="row" style="margin-top:10px">' +
      '<button class="btn sm" onclick="boostStartOne(\'' + q.id + '\')">去强化</button>' +
      '<button class="btn sm" onclick="dropWrong(\'' + q.id + '\')">标记已掌握</button></div></div>';
  });
  h += '</div>';
  $('#main').innerHTML = h;
  $('#wSubj').onchange = e => { W.subj = e.target.value; vWrong(); };
}
function dropWrong(id) {
  if (!S.wrong[id]) return;
  S.wrong[id].solved = true; saveState(); vWrong();
}

/* ---------------- 错题强化 ---------------- */
let B = { list: [], i: 0, pick: [], revealed: false, mode: 'all' };
function vBoost() {
  if (!B.list.length) buildBoost();
  const ids = Object.keys(S.wrong).filter(id => !S.wrong[id].solved);
  let h = '<div class="row spread"><h2>错题强化</h2><div class="row">' +
    '<button class="btn sm" onclick="boostShuffle()">重新洗牌</button>' +
    '<button class="btn sm" onclick="B.list=[];vBoost()">重置队列</button></div></div>';
  h += '<div class="card"><div class="muted">规则：专练答错的题。<b>连续答对 ' + BOOST_NEED +
       ' 次</b>的题目会自动移出强化区（标记为已掌握）；中途再错则计数归零。' +
       '当前待强化 <b style="color:var(--amber)">' + ids.length + '</b> 道。</div></div>';
  if (!ids.length) {
    h += '<div class="card"><div class="empty"><span class="ico">🚀</span>强化区已清空<br><span class="muted">所有错题都已连续答对 ' + BOOST_NEED + ' 次</span></div></div>';
    $('#main').innerHTML = h; return;
  }
  if (!B.list.length) buildBoost();
  if (B.i >= B.list.length) B.i = 0;
  const q = B.list[B.i];
  if (!q) { $('#main').innerHTML = h; return; }
  const w = S.wrong[q.id] || { streak: 0 };
  h += '<div class="row spread" style="margin-bottom:12px"><span class="chip">进度 <b>' +
       (B.i + 1) + '/' + B.list.length + '</b></span>' +
       '<span class="chip">本题连对 <b>' + (w.streak || 0) + '/' + BOOST_NEED + '</b></span></div>';
  h += renderQ(q, 'boost');
  h += '<div class="row" style="margin-top:12px">' +
       '<button class="btn primary" onclick="boostSubmit()">提交</button>' +
       '<button class="btn" onclick="boostMove(1)">跳过</button>' +
       '<button class="btn" onclick="boostPrev()">上一题</button></div>';
  $('#main').innerHTML = h;
  bindQ(q, 'boost');
  // 提交后给出移出提示
  if (B.revealed) {
    const w2 = S.wrong[q.id];
    const box = $('#main .verdict');
    if (box && w2 && w2.solved) box.innerHTML += '<div class="exp" style="border-left-color:var(--good);color:#9ff0cd">🎉 已连续答对 ' + BOOST_NEED + ' 次，本题移出错题强化</div>';
  }
}
function buildBoost() {
  const map = allQuestions();
  const ids = Object.keys(S.wrong).filter(id => !S.wrong[id].solved);
  const subjSet = new Set(SUBJ.map(s => s.key));
  B.list = shuffle(ids.map(id => map[id]).filter(Boolean)
    .filter(q => subjSet.has(q.subject)));
  B.i = 0; B.pick = []; B.revealed = false;
}
function boostStartOne(id) {
  const map = allQuestions();
  if (map[id]) { B = { list: [map[id]], i: 0, pick: [], revealed: false, mode: 'all' }; go('boost'); }
}
function boostSubmit() {
  const q = B.list[B.i];
  const inp = $('#txtAns');
  if (inp) B.pick = [inp.value];
  if (!B.pick.length) { alert('请先作答'); return; }
  const ok = checkQ(q, B.pick);
  const before = (S.wrong[q.id] || {}).solved;
  recordAnswer(q, B.pick, ok, 'boost');
  B.revealed = true;
  vBoost();
  if (!before && S.wrong[q.id] && S.wrong[q.id].solved) {
    setTimeout(() => { B.list = B.list.filter(x => x.id !== q.id); B.revealed = false; B.pick = []; vBoost(); }, 1400);
  }
}
function boostMove(d) {
  if (!B.revealed && !confirm('未提交，直接跳过？')) return;
  B.revealed = false; B.pick = [];
  B.i = (B.i + d + B.list.length) % B.list.length; vBoost();
}
function boostPrev() { boostMove(-1); }
function boostShuffle() { B.list = shuffle(B.list); B.i = 0; B.pick = []; B.revealed = false; vBoost(); }

/* ---------------- 统计分析 ---------------- */
function vStats() {
  const all = allQuestions();
  const ans = S.answers;
  const ids = Object.keys(ans);
  const right = ids.filter(i => ans[i].ok).length;
  const wrongN = ids.length - right;
  const openWrong = Object.keys(S.wrong).filter(i => !S.wrong[i].solved).length;
  const mastered = Object.keys(S.wrong).filter(i => S.wrong[i].solved).length;

  let h = '<h2>统计分析</h2><div class="grid g4">' +
    '<div class="stat i"><div class="v">' + ids.length + '</div><div class="k">累计作答</div></div>' +
    '<div class="stat g"><div class="v">' + (ids.length ? Math.round(right / ids.length * 100) : 0) + '%</div><div class="k">总正确率</div></div>' +
    '<div class="stat"><div class="v">' + openWrong + '</div><div class="k">待强化错题</div></div>' +
    '<div class="stat g"><div class="v">' + mastered + '</div><div class="k">已掌握（连对' + BOOST_NEED + '次）</div></div>' +
    '</div>';

  // 分科表
  h += '<h3>分科明细</h3><div class="card"><table><thead><tr>' +
    '<th>科目</th><th>模式</th><th class="num">题量</th><th class="num">已刷</th><th class="num">正确率</th>' +
    '<th class="num">待强化</th><th class="num">通过概率</th></tr></thead><tbody>';
  for (const s of SUBJ) {
    const st = subjStat(s.key);
    const pr = probOf(s.key);
    h += '<tr><td>' + esc(s.name) + '</td>' +
      '<td><span class="badge ' + (s.mode === '闭卷' ? 'close' : 'open') + '">' + esc(s.mode) + '</span></td>' +
      '<td class="num">' + (BANK[s.key] || []).length + '</td>' +
      '<td class="num">' + st.done + '</td>' +
      '<td class="num">' + (st.done ? Math.round(st.right / st.done * 100) : 0) + '%</td>' +
      '<td class="num">' + st.openWrong + '</td>' +
      '<td class="num" style="color:' + (pr.p >= .75 ? 'var(--good)' : pr.p < .5 ? 'var(--bad)' : 'var(--amber)') + '">' +
      Math.round(pr.p * 100) + '%</td></tr>';
  }
  h += '</tbody></table></div>';

  // 近 14 天趋势
  h += '<h3>近 14 天作答趋势</h3><div class="card">' + trendChart() + '</div>';

  // 考试记录
  h += '<h3>模拟考试</h3>';
  if (!S.exams.length) h += '<div class="card"><div class="empty">暂无考试记录</div></div>';
  else {
    const avg = Math.round(S.exams.reduce((a, e) => a + e.score, 0) / S.exams.length);
    h += '<div class="grid g3"><div class="stat"><div class="v">' + S.exams.length + '</div><div class="k">考试次数</div></div>' +
      '<div class="stat"><div class="v">' + avg + '</div><div class="k">平均分</div></div>' +
      '<div class="stat ' + (avg >= PASS_LINE ? 'g' : 'b') + '"><div class="v">' +
      S.exams.filter(e => e.pass).length + '/' + S.exams.length + '</div><div class="k">及格次数</div></div></div>';
    h += '<div class="card"><table><thead><tr><th>时间</th><th>科目</th><th class="num">得分</th><th class="num">用时</th></tr></thead><tbody>';
    S.exams.slice().reverse().forEach(e => {
      const d = new Date(e.at);
      h += '<tr><td>' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '</td>' +
        '<td>' + esc(subjName(e.subject)) + '</td><td class="num">' + e.score + '</td>' +
        '<td class="num">' + Math.floor(e.sec / 60) + '′</td></tr>';
    });
    h += '</tbody></table></div>';
  }

  h += '<h3>通过概率预测</h3>' + probCards();
  $('#main').innerHTML = h;
}
function trendChart() {
  const days = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ k: d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()), n: 0, r: 0 });
    d.getTime();
  }
  const idx = {}; days.forEach((d, i) => idx[d.k] = i);
  for (const id in S.answers) {
    const a = S.answers[id];
    const d = new Date(a.t);
    const k = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    if (idx[k] !== undefined) { days[idx[k]].n++; if (a.ok) days[idx[k]].r++; }
  }
  const max = Math.max(1, ...days.map(d => d.n));
  let h = '<div style="display:flex;gap:6px;align-items:flex-end;height:130px">';
  days.forEach(d => {
    const hh = Math.round(d.n / max * 100);
    const ac = d.n ? Math.round(d.r / d.n * 100) : 0;
    h += '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%">' +
      '<div style="font-size:11px;color:var(--fg2);margin-bottom:3px">' + (d.n || '') + '</div>' +
      '<div title="正确率' + ac + '%" style="width:100%;min-height:3px;background:' + (d.n ? (ac >= 60 ? 'var(--good)' : 'var(--amber)') : 'var(--ink3)') + ';height:' + Math.max(3, hh) + 'px;border-radius:4px 4px 0 0"></div>' +
      '<div style="font-size:10.5px;color:var(--fg3);margin-top:4px">' + d.k.slice(4, 8) + '</div></div>';
  });
  h += '</div><p class="muted" style="margin-top:8px">柱高＝当日作答数，绿色＝当日正确率 ≥60%</p>';
  return h;
}

/* ---------------- 题库管理（加题/导出导入） ---------------- */
function vManage() {
  let h = '<h2>题库管理</h2>';
  h += '<div class="card"><h3 style="margin-top:0">题库概况</h3><table><thead><tr><th>科目</th><th class="num">题量</th><th class="num">本地自建</th></tr></thead><tbody>';
  const cust = loadCustom();
  for (const s of SUBJ) {
    const c = cust.filter(x => x.subject === s.key).reduce((a, x) => a + x.questions.length, 0);
    h += '<tr><td>' + esc(s.name) + '</td><td class="num">' + (BANK[s.key] || []).length + '</td><td class="num">' + c + '</td></tr>';
  }
  h += '</tbody></table></div>';

  h += '<div class="card"><h3 style="margin-top:0">＋ 随时补充题目</h3>' +
    '<div class="row" style="margin-bottom:10px"><label>科目</label><select id="mSubj">' +
    SUBJ.map(s => '<option value="' + s.key + '">' + esc(s.name) + '</option>').join('') + '</select>' +
    '<label>题型</label><select id="mType"><option value="single">单选</option>' +
    '<option value="multi">多选</option><option value="judge">判断</option>' +
    '<option value="short">简答</option><option value="essay">论述</option></select></div>' +
    '<textarea id="mStem" placeholder="题干"></textarea>' +
    '<div id="mOpts" style="margin-top:9px">' + optRow(0) + optRow(1) + optRow(2) + optRow(3) + '</div>' +
    '<div class="row" style="margin-top:9px"><label>答案</label>' +
    '<input type="text" id="mAns" placeholder="如 A / ABC / 对 / 参考答案要点" style="flex:1;min-width:200px">' +
    '<label>出处(可空)</label><input type="text" id="mSrc" placeholder="2015年湖南真题" style="width:170px"></div>' +
    '<div style="margin-top:9px"><label class="muted">解析(可空)</label><textarea id="mExp" style="min-height:56px" placeholder="为什么选这个"></textarea></div>' +
    '<div class="row" style="margin-top:11px"><button class="btn primary" onclick="addQuestion()">保存题目</button>' +
    '<button class="btn sm" onclick="addOpts()">＋多加一个选项</button>' +
    '<span class="muted">保存后立即生效，可直接开刷</span></div></div>';

  h += '<div class="card"><h3 style="margin-top:0">备份 / 迁移</h3><div class="row">' +
    '<button class="btn" onclick="exportData()">导出全部数据</button>' +
    '<button class="btn" onclick="document.getElementById(\"impFile\").click()">导入数据</button>' +
    '<button class="btn danger" onclick="clearAll()">清空本机记录</button>' +
    '<input type="file" id="impFile" accept=".json" style="display:none" onchange="importData(this)">' +
    '</div><p class="muted" style="margin-top:9px">答题记录、错题、考试成绩都存在<b>本浏览器</b>里。' +
    '换设备前先导出、换过去再导入。题目本身若要所有人共用，需由站长更新 data/ 下的 JSON 文件并重新部署。</p></div>';
  $('#main').innerHTML = h;
}
function optRow(i) {
  return '<div class="row" style="margin-bottom:7px"><span class="k" style="color:var(--amber2);font-weight:700;width:16px">' +
    'ABCD'[i] + '</span><input type="text" class="mOpt" placeholder="选项 ' + 'ABCD'[i] + ' 内容" style="flex:1"></div>';
}
function addOpts() {
  const c = $('#mOpts').children.length;
  if (c < 4) $('#mOpts').insertAdjacentHTML('beforeend', optRow(c));
}
function addQuestion() {
  const subj = $('#mSubj').value, type = $('#mType').value;
  const stem = $('#mStem').value.trim();
  const ans = $('#mAns').value.trim();
  if (!stem) { alert('题干不能为空'); return; }
  if (!ans) { alert('答案不能为空'); return; }
  const opts = $$('.mOpt').map(x => x.value.trim()).filter(Boolean);
  if ((type === 'single' || type === 'multi') && opts.length < 2) { alert('选择题至少 2 个选项'); return; }
  const q = {
    id: 'u' + Date.now().toString(36),
    type: type, stem: stem,
    options: opts.length ? opts : [],
    answer: type === 'multi' ? ans.toUpperCase().split(/[^A-D]+/).filter(Boolean) : ans,
    explanation: $('#mExp').value.trim(),
    source: $('#mSrc').value.trim() || '手动补充',
    subject: subj, custom: true
  };
  const cust = loadCustom();
  let bucket = cust.find(x => x.subject === subj);
  if (!bucket) { bucket = { subject: subj, questions: [] }; cust.push(bucket); }
  bucket.questions.push(q);
  saveCustom(cust);
  if (!BANK[subj]) BANK[subj] = [];
  BANK[subj].push(q);
  $('#mStem').value = ''; $('#mAns').value = ''; $('#mExp').value = ''; $('#mSrc').value = '';
  $$('.mOpt').forEach(x => x.value = '');
  alert('已保存！当前该科题量 ' + BANK[subj].length + '。');
  vManage();
}
function exportData() {
  const blob = new Blob([JSON.stringify({
    exported_at: new Date().toISOString(),
    state: S, custom: loadCustom(), meta: META ? META.site : {}
  }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '刷题站备份_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
}
function importData(inp) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      if (j.state) { S = Object.assign(blankState(), j.state); saveState(); }
      if (j.custom) { saveCustom(j.custom); }
      alert('导入成功，正在刷新…'); location.reload();
    } catch (e) { alert('文件解析失败：' + e.message); }
  };
  r.readAsText(f);
}
function clearAll() {
  if (!confirm('清空本机所有答题记录、错题与考试成绩？题目不受影响。')) return;
  S = blankState(); saveState(); vManage();
}

/* ---------------- 工具 ---------------- */
function allQuestions() {
  const m = {};
  for (const s of SUBJ) for (const q of (BANK[s.key] || [])) { q.subject = q.subject || s.key; m[q.id] = q; }
  return m;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }

init();
