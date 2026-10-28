/* Learn City Results — staff portal
   Same structure and error-handling pattern as Spark Points app.js. */
'use strict';

function fatal(message) {
  var bar = document.getElementById('lcFatal');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'lcFatal';
    bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;background:#9b1c1c;color:#fff;' +
      'padding:12px 16px;font:14px/1.5 Arial,Helvetica,sans-serif;white-space:pre-wrap';
    (document.body || document.documentElement).appendChild(bar);
  }
  bar.textContent = 'Results portal problem — report this line to Head of IT:\n' + message;
}
window.addEventListener('error', function (e) {
  fatal((e.message || 'Unknown error') + '  [' + (e.filename || '?').split('/').pop() + ' line ' + (e.lineno || '?') + ']');
});

/* SETUP: the SAME /exec URL as Spark Points — Results and Appraisal are
   add-on files in the Spark Points Apps Script project. */
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbxahzgarriiZeHw-RCWr8PivATnm1ajQa3cUcadNyyj0eNYdUFT4zbt8_yqxQSxSBqW/exec';
const ACTION_PREFIX = 'results.';
const STORE_EMAIL = 'LC_RESULTS_EMAIL';
const STORE_CODE = 'LC_RESULTS_CODE';

const $ = function (id) { return document.getElementById(id); };

let state = { email: '', code: '', me: null, term: '', classes: [], cls: null, sub: '', studentIdx: 0, setup: null, dirty: false };

function call(action, extra) {
  const payload = Object.assign({ action: ACTION_PREFIX + action, email: state.email, code: state.code, term: state.term }, extra || {});
  return fetch(ENDPOINT, {
    method: 'POST', mode: 'cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ data: JSON.stringify(payload) })
  }).then(function (r) { return r.json(); });
}

/* ---------- helpers ---------- */

function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function options(list, selected, blank) {
  return (blank !== undefined ? '<option value="">' + esc(blank) + '</option>' : '') + list.map(function (o) {
    const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
    return '<option value="' + esc(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + esc(l) + '</option>';
  }).join('');
}
function chip(s) { return '<span class="chip ' + esc(s) + '">' + esc(s) + '</span>'; }
function fmt(n) { return n === null || n === undefined || n === '' ? '' : String(Math.round(Number(n) * 100) / 100); }
function msg(el, text, ok) { if (!el) return; el.className = ok ? 'success formMsg' : 'error formMsg'; el.textContent = text || ''; }
function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

/* Every save goes through here: disables the button, shows the server's
   own error message, and reloads the class so totals and positions are
   always the server's numbers, never a stale local copy. */
function save(action, extra, btn, okText, after) {
  const m = btn ? btn.parentNode.querySelector('.formMsg') : null;
  if (btn) btn.disabled = true;
  msg(m, 'Saving...', true);
  return call(action, Object.assign({ className: state.cls.className }, extra)).then(function (r) {
    if (btn) btn.disabled = false;
    if (!r || !r.success) { msg(m, (r && r.error) || 'Could not save.'); return null; }
    state.dirty = false;
    const text = typeof okText === 'function' ? okText(r) : (okText || 'Saved.');
    msg(m, text, true);
    if (after !== false) reloadClass(true).then(function () { msg(document.querySelector('#subPanel .formMsg'), text, true); });
    return r;
  }).catch(function () {
    if (btn) btn.disabled = false;
    msg(m, 'Could not reach the server. Nothing was saved — try again.');
    return null;
  });
}

/* ---------- sign in ---------- */

function trySignIn(email, code) {
  state.email = email.trim().toLowerCase();
  state.code = code.trim();
  $('signInBtn').disabled = true;
  $('signInError').textContent = 'Checking...';
  call('verifyStaff').then(function (r) {
    if (!r || !r.success) { $('signInBtn').disabled = false; $('signInError').textContent = (r && r.error) || 'Sign in failed.'; return; }
    state.me = r;
    state.term = r.term;
    try {
      const keep = $('rememberMeToggle').checked ? localStorage : sessionStorage;
      const drop = keep === localStorage ? sessionStorage : localStorage;
      keep.setItem(STORE_EMAIL, state.email); keep.setItem(STORE_CODE, state.code);
      drop.removeItem(STORE_EMAIL); drop.removeItem(STORE_CODE);
    } catch (e) {}
    enterPortal();
  }).catch(function () { $('signInBtn').disabled = false; $('signInError').textContent = 'Could not reach the server. Check your connection and try again.'; });
}

function signOut() {
  try { [localStorage, sessionStorage].forEach(function (s) { s.removeItem(STORE_EMAIL); s.removeItem(STORE_CODE); }); } catch (e) {}
  location.reload();
}

function enterPortal() {
  const me = state.me;
  $('signInScreen').classList.add('hidden');
  $('mainScreen').classList.remove('hidden');
  $('staffNameDisplay').textContent = me.fullName;
  $('staffRoleDisplay').textContent = ' ' + me.role;
  $('sessionDisplay').textContent = me.session;
  $('termSelect').innerHTML = options(me.terms, me.term);
  $('classesTabBtn').classList.toggle('hidden', !me.hasClasses);
  $('setupTabBtn').classList.toggle('hidden', !me.canSetup);
  if (me.hasClasses) switchTab('classesTab');
  else if (me.canSetup) switchTab('setupTab');
  else $('noAccessNote').classList.remove('hidden');
}

function switchTab(id) {
  document.querySelectorAll('.tabPanel').forEach(function (p) { p.classList.add('hidden'); });
  document.querySelectorAll('#mainScreen > .tabBar .tabBtn').forEach(function (b) { b.classList.toggle('activeTab', b.getAttribute('data-tab') === id); });
  $(id).classList.remove('hidden');
  if (id === 'classesTab' && !state.cls) loadClassList();
  if (id === 'setupTab') loadSetup();
}

/* ---------- class list ---------- */

function loadClassList() {
  $('classView').classList.add('hidden');
  $('classList').classList.remove('hidden');
  $('classList').innerHTML = '<p class="subtitle">Loading...</p>';
  call('getClassList').then(function (r) {
    if (!r || !r.success) { $('classList').innerHTML = '<p class="error">' + esc((r && r.error) || 'Could not load classes.') + '</p>'; return; }
    state.classes = r.rows;
    const order = { Submitted: 0, Returned: 1, Draft: 2, Approved: 3, Published: 4 };
    const rows = r.rows.slice().sort(function (a, b) {
      return (a.isApprover && !a.isTeacher ? order[a.status] : 5) - (b.isApprover && !b.isTeacher ? order[b.status] : 5) || a.className.localeCompare(b.className, undefined, { numeric: true });
    });
    $('classList').innerHTML = '<p class="subtitle">' + esc(r.term) + ', ' + esc(r.session) + '. Classes you teach, subjects you score, and classes you approve.</p>' +
      '<div class="tableWrap"><table class="dataTable"><thead><tr><th>Class</th><th>Report</th><th>Class teacher</th><th>Status</th><th>Your role</th></tr></thead><tbody>' +
      rows.map(function (c) {
        return '<tr class="clickable" data-act="openClass" data-class="' + esc(c.className) + '"><td><strong>' + esc(c.displayName) + '</strong>' +
          (c.displayName !== c.className ? '<br><span class="muted">' + esc(c.className) + '</span>' : '') + '</td><td>' + esc(c.template) + '</td><td>' + esc(c.teacher) + '</td><td>' + chip(c.status) +
          '</td><td>' + [c.isTeacher ? 'Class teacher' : '', c.isApprover ? 'Approver' : '',
            c.mySubjects && c.mySubjects.length ? 'Subject teacher: ' + esc(c.mySubjects.join(', ')) : ''].filter(Boolean).join('<br>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }).catch(function () { $('classList').innerHTML = '<p class="error">Could not reach the server.</p>'; });
}

/* ---------- class view ---------- */

function openClass(cls) {
  state.cls = { className: cls };
  state.sub = '';
  state.studentIdx = 0;
  $('classList').classList.add('hidden');
  $('classView').classList.remove('hidden');
  $('classHeader').innerHTML = '<p class="subtitle">Loading...</p>';
  $('subTabBar').innerHTML = '';
  $('subPanel').innerHTML = '';
  reloadClass(false);
}

function reloadClass(keepSub) {
  return call('getClassData', { className: state.cls.className }).then(function (r) {
    if (!r || !r.success) { $('classHeader').innerHTML = '<p class="error">' + esc((r && r.error) || 'Could not load this class.') + '</p>'; return; }
    const prevSubject = state.cls.subject;
    state.cls = r;
    state.cls.subject = prevSubject && r.template.subjects.indexOf(prevSubject) !== -1 ? prevSubject : r.template.subjects[0];
    renderClassHeader();
    renderSubTabs(keepSub ? state.sub : '');
  }).catch(function () { $('classHeader').innerHTML = '<p class="error">Could not reach the server.</p>'; });
}

function renderClassHeader() {
  const c = state.cls, si = c.statusInfo || {};
  const cl = state.classes.find(function (x) { return x.className === c.className; }) || {};
  let notes = '';
  if (c.status === 'Returned' && si['Return Note']) notes = '<p class="warn"><strong>Returned for correction:</strong> ' + esc(si['Return Note']) + '</p>';
  if (c.status === 'Draft' && String(si['Return Note'] || '').indexOf('Reopened') === 0) notes = '<p class="warn">' + esc(si['Return Note']) + '</p>';
  $('classHeader').innerHTML = '<div class="card"><div class="cardHead"><h2>' + esc(cl.displayName || c.className) + '</h2>' + chip(c.status) + '</div>' +
    '<p class="subtitle">' + esc(c.template.label) + ' · ' + c.students.length + ' students · ' + esc(c.term) + ', ' + esc(c.session) + '</p>' + notes +
    (c.permissions.subjectOnly && c.permissions.canEditScores ? '<p class="muted">You enter scores for ' + esc(c.permissions.mySubjects.join(', ')) + '. The class teacher does the rest and submits the class.</p>' : '') +
    (c.permissions.canEdit || c.permissions.canEditScores ? '' : '<p class="muted">' + (c.status === 'Submitted' ? 'Submitted for approval — entries are locked.' : c.status === 'Approved' || c.status === 'Published' ? 'Approved — results are locked.' : 'View only.') + '</p>') + '</div>';
}

function subTabsFor() {
  const t = state.cls.template;
  const tabs = [];
  if (state.cls.permissions.subjectOnly) return [['scores', 'Scores']];
  if (t.scored) tabs.push(['scores', 'Scores']);
  if (t.ratings) tabs.push(['ratings', 'Skills & ratings']);
  if (t.progress && t.progress.length) tabs.push(['progress', 'Progress']);
  tabs.push(['details', 'Pupil details']);
  tabs.push(['comments', 'Comments']);
  tabs.push(['review', 'Preview & submit']);
  return tabs;
}

function renderSubTabs(active) {
  const tabs = subTabsFor();
  if (!active || !tabs.some(function (t) { return t[0] === active; })) active = (state.cls.permissions.canEdit || state.cls.permissions.canEditScores ? tabs[0][0] : 'review');
  state.sub = active;
  $('subTabBar').innerHTML = tabs.map(function (t) { return '<button type="button" class="tabBtn' + (t[0] === active ? ' activeTab' : '') + '" data-act="sub" data-sub="' + t[0] + '">' + t[1] + '</button>'; }).join('');
  ({ scores: renderScores, ratings: renderRatings, progress: renderProgress, details: renderDetails, comments: renderComments, review: renderReview })[active]();
}

function leaveGuard() {
  if (!state.dirty) return true;
  return window.confirm('You have unsaved changes on this screen. Leave without saving?');
}

/* ---------- scores ---------- */

function canEditSubject(subj) {
  const p = state.cls.permissions;
  return !!(p.canEdit || (p.canEditScores && (p.mySubjects || []).indexOf(subj) !== -1));
}

function renderScores() {
  const c = state.cls, t = c.template, edit = canEditSubject(c.subject);
  const subj = c.subject;
  const comps = t.components;
  const who = c.subjectTeachers || {};
  const subjOpts = t.subjects.map(function (x) { return [x, x + (who[x] && !c.permissions.subjectOnly ? ' — ' + who[x] : '')]; });
  let html = '<div class="card"><div class="studentNav"><label style="margin:0">Subject</label><select id="subjectSelect">' + options(subjOpts, subj) + '</select></div>';
  if (who[subj] && !c.permissions.subjectOnly) html += '<p class="muted">Subject teacher: ' + esc(who[subj]) + '. They enter these scores; you can correct them before you submit.</p>';
  html += '<p class="muted">Marks out of: ' + comps.map(function (x) { return esc(x[0]) + ' ' + x[1]; }).join(' · ') + ' = 100.' +
    (t.electives ? ' Leave a row blank if the student does not take this subject.' : ' Leave a row blank only if the student did not sit this subject.') +
    ' Press Enter to move down a column.</p>';
  html += '<div class="tableWrap"><table class="dataTable scoreGrid"><thead><tr><th>Student</th>' + comps.map(function (x) { return '<th>' + esc(x[0]) + '<br>(' + x[1] + ')</th>'; }).join('') +
    '<th>Total</th></tr></thead><tbody>';
  c.students.forEach(function (s, i) {
    const m = s.marks[subj] || {};
    html += '<tr data-id="' + esc(s.id) + '"><td>' + esc(s.name) + '</td>' + comps.map(function (x, j) {
      return '<td><input type="number" inputmode="decimal" step="0.5" min="0" max="' + x[1] + '" data-comp="' + esc(x[0]) + '" data-row="' + i + '" data-col="' + j + '" value="' + esc(m[x[0]] === undefined ? '' : m[x[0]]) + '"' + (edit ? '' : ' disabled') + '></td>';
    }).join('') + '<td class="total">' + fmt(s.totals[subj]) + '</td></tr>';
  });
  html += '</tbody></table></div>';
  const st = c.subjectStats[subj];
  if (st) html += '<p class="muted">Class: highest ' + fmt(st.highest) + ', lowest ' + fmt(st.lowest) + ', average ' + fmt(st.average) + ' (' + st.count + ' students).</p>';
  if (edit) html += '<button type="button" data-act="saveScores">Save ' + esc(subj) + '</button><p class="formMsg"></p>';
  html += '</div>';
  $('subPanel').innerHTML = html;
}

function recalcScoreRow(tr) {
  let total = 0, any = false, over = false;
  tr.querySelectorAll('input[data-comp]').forEach(function (inp) {
    if (inp.value === '') return;
    const v = Number(inp.value);
    any = true; total += v;
    if (v < 0 || v > Number(inp.max)) over = true;
  });
  tr.querySelector('.total').textContent = any ? fmt(total) : '';
  tr.classList.toggle('over', over);
}

function saveScoresNow(btn) {
  const rows = [];
  let bad = '';
  document.querySelectorAll('.scoreGrid tbody tr').forEach(function (tr) {
    const marks = {};
    tr.querySelectorAll('input[data-comp]').forEach(function (inp) {
      if (inp.value !== '' && (Number(inp.value) < 0 || Number(inp.value) > Number(inp.max))) bad = bad || tr.cells[0].textContent + ': ' + inp.getAttribute('data-comp') + ' is over ' + inp.max;
      marks[inp.getAttribute('data-comp')] = inp.value;
    });
    rows.push({ studentId: tr.getAttribute('data-id'), marks: marks });
  });
  if (bad) { msg(btn.parentNode.querySelector('.formMsg'), bad + '.'); return; }
  save('saveScores', { subject: state.cls.subject, rows: rows }, btn, function (r) { return 'Saved — ' + r.saved + ' change' + (r.saved === 1 ? '' : 's') + '.'; });
}

/* ---------- per-student screens (ratings, progress) ---------- */

function studentPicker(label) {
  const c = state.cls;
  if (state.studentIdx >= c.students.length) state.studentIdx = 0;
  return '<div class="studentNav"><button type="button" class="smallBtn" data-act="prevStudent">&larr; Previous</button>' +
    '<select id="studentPick">' + options(c.students.map(function (s, i) { return [i, s.name]; }), state.studentIdx) + '</select>' +
    '<button type="button" class="smallBtn" data-act="nextStudent">Next &rarr;</button><span class="muted">' + (state.studentIdx + 1) + ' of ' + c.students.length + (label ? ' · ' + esc(label) : '') + '</span></div>';
}

function renderRatings() {
  const c = state.cls, edit = c.permissions.canEdit;
  if (!c.students.length) { $('subPanel').innerHTML = '<p class="subtitle">No students in this class.</p>'; return; }
  const s = c.students[state.studentIdx] || c.students[0];
  const r = (s.info && s.info.ratings) || {};
  const done = Object.keys(r).length;
  let html = '<div class="card">' + studentPicker(done + ' of 30 rated') + '<p class="muted">' + state.me.ratingKey.map(function (k) { return k[0] + ' = ' + k[1]; }).join(' · ') + '</p><div class="ratingGrid">';
  state.me.ratingGroups.forEach(function (g) {
    html += '<div><h3>' + esc(g.title) + '</h3>' + g.items.map(function (it) {
      return '<div class="ratingRow"><span>' + esc(it) + '</span><span class="scorePick">' + [1, 2, 3, 4, 5].map(function (n) {
        return '<label><input type="radio" name="rt:' + esc(it) + '" value="' + n + '"' + (r[it] === n ? ' checked' : '') + (edit ? '' : ' disabled') + '><span>' + n + '</span></label>';
      }).join('') + '</span></div>';
    }).join('') + '</div>';
  });
  html += '</div>' + (edit ? '<button type="button" data-act="saveRatings">Save and next student</button><p class="formMsg"></p>' : '') + '</div>';
  $('subPanel').innerHTML = html;
}

function saveRatingsNow(btn) {
  const s = state.cls.students[state.studentIdx];
  const ratings = {};
  state.me.ratingGroups.forEach(function (g) { g.items.forEach(function (it) {
    const el = document.querySelector('input[name="rt:' + CSS.escape(it) + '"]:checked'); if (el) ratings[it] = Number(el.value);
  }); });
  save('saveStudentTerm', { rows: [{ studentId: s.id, ratings: ratings }] }, btn, 'Saved ' + s.name + '.', false).then(function (r) {
    if (!r) return;
    s.info = s.info || {}; s.info.ratings = ratings;
    if (state.studentIdx < state.cls.students.length - 1) state.studentIdx++;
    renderRatings();
    msg(document.querySelector('#subPanel .formMsg'), 'Saved ' + s.name + '.', true);
  });
}

function renderProgress() {
  const c = state.cls, edit = c.permissions.canEdit;
  if (!c.students.length) { $('subPanel').innerHTML = '<p class="subtitle">No students in this class.</p>'; return; }
  const s = c.students[state.studentIdx] || c.students[0];
  const p = (s.info && s.info.progress) || {};
  const letters = state.me.letterKey.map(function (k) { return [k[0], k[0] + ' — ' + k[1]]; });
  const dis = edit ? '' : ' disabled';
  let html = '<div class="card">' + studentPicker() + '<p class="muted">Key: ' + state.me.letterKey.map(function (k) { return k[0] + ' – ' + k[1]; }).join(' · ') + '</p>';
  c.template.progress.forEach(function (sec) {
    const ps = p[sec.key] || { items: {} };
    html += '<div class="subForm" data-sec="' + esc(sec.key) + '"><div class="cardHead"><h3 style="margin:0">' + esc(sec.title) + '</h3>' +
      (sec.sectionGrade ? '<label class="check" style="margin:0">Section grade <select class="secGrade" style="width:auto"' + dis + '>' + options(letters, ps.grade || '', '–') + '</select></label>' : '') + '</div>';
    sec.items.forEach(function (it) {
      const v = (ps.items || {})[it[0]] || {};
      html += '<div class="progItem" data-item="' + esc(it[0]) + '"><span>' + esc(it[0]) + '</span>' +
        (it[1] !== 'grade' ? '<input class="pText" value="' + esc(v.text || '') + '" placeholder="What the child can do"' + dis + '>' : '<span></span>') +
        (it[1] !== 'text' ? '<select class="pGrade"' + dis + '>' + options(letters, v.grade || '', '–') + '</select>' : '<span></span>') + '</div>';
    });
    html += '</div>';
  });
  if (c.template.health) html += '<label>Wellness during the term</label><input id="wellnessInput" value="' + esc((s.info && s.info.wellness) || '') + '" placeholder="e.g. Healthy throughout the term"' + dis + '>';
  html += (edit ? '<button type="button" data-act="saveProgress">Save and next pupil</button><p class="formMsg"></p>' : '') + '</div>';
  $('subPanel').innerHTML = html;
}

function saveProgressNow(btn) {
  const s = state.cls.students[state.studentIdx];
  const progress = {};
  document.querySelectorAll('#subPanel [data-sec]').forEach(function (secEl) {
    const o = { items: {} };
    const sg = secEl.querySelector('.secGrade');
    if (sg && sg.value) o.grade = sg.value;
    secEl.querySelectorAll('.progItem').forEach(function (row) {
      const it = {}, t = row.querySelector('.pText'), gr = row.querySelector('.pGrade');
      if (t && t.value.trim()) it.text = t.value.trim();
      if (gr && gr.value) it.grade = gr.value;
      if (Object.keys(it).length) o.items[row.getAttribute('data-item')] = it;
    });
    progress[secEl.getAttribute('data-sec')] = o;
  });
  const row = { studentId: s.id, progress: progress };
  if ($('wellnessInput')) row.wellness = $('wellnessInput').value;
  save('saveStudentTerm', { rows: [row] }, btn, 'Saved.', false).then(function (r) {
    if (!r) return;
    s.info = s.info || {}; s.info.progress = progress; if (row.wellness !== undefined) s.info.wellness = row.wellness;
    if (state.studentIdx < state.cls.students.length - 1) state.studentIdx++;
    renderProgress();
    msg(document.querySelector('#subPanel .formMsg'), 'Saved ' + s.name + '.', true);
  });
}

/* ---------- pupil details ---------- */

function renderDetails() {
  const c = state.cls, edit = c.permissions.canEdit, dis = edit ? '' : ' disabled';
  const unit = c.template.key === 'NUR' || c.template.key === 'PN1' || c.template.key === 'PN2' ? 'cm' : 'm';
  let html = '<div class="card"><p class="muted">Date of birth is kept once and used every term for age. Height in ' + unit + ', weight in kg.</p>' +
    '<div class="tableWrap"><table class="dataTable wideTable"><thead><tr><th>Student</th><th>Date of birth</th><th>Height (' + unit + ')</th><th>Weight (kg)</th></tr></thead><tbody>';
  c.students.forEach(function (s) {
    html += '<tr data-id="' + esc(s.id) + '"><td>' + esc(s.name) + '<br><span class="muted">' + esc(s.id) + '</span></td>' +
      '<td><input type="date" class="dDob" max="' + today() + '" value="' + esc(s.dob) + '"' + dis + '></td>' +
      '<td><input type="number" class="dH" step="0.01" min="0" value="' + esc(s.info.height === undefined ? '' : s.info.height) + '"' + dis + '></td>' +
      '<td><input type="number" class="dW" step="0.1" min="0" value="' + esc(s.info.weight === undefined ? '' : s.info.weight) + '"' + dis + '></td></tr>';
  });
  html += '</tbody></table></div>' + (edit ? '<button type="button" data-act="saveDetails">Save details</button><p class="formMsg"></p>' : '') + '</div>';
  $('subPanel').innerHTML = html;
}

function saveDetailsNow(btn) {
  const dobs = [], rows = [];
  document.querySelectorAll('#subPanel tr[data-id]').forEach(function (tr) {
    const id = tr.getAttribute('data-id');
    dobs.push({ studentId: id, dob: tr.querySelector('.dDob').value });
    rows.push({ studentId: id, height: tr.querySelector('.dH').value, weight: tr.querySelector('.dW').value });
  });
  save('saveDob', { rows: dobs }, btn, 'Saving...', false).then(function (r) {
    if (r) save('saveStudentTerm', { rows: rows }, btn, 'Details saved.');
  });
}

/* ---------- comments ---------- */

function renderComments() {
  const c = state.cls, p = c.permissions;
  const thirdPromo = c.template.promotion && c.term === 'Third Term';
  let html = '<div class="card"><p class="muted">The class teacher writes a comment for every pupil. The ' + (c.template.key === 'JSS' || c.template.key === 'SS' ? 'Principal' : 'Head Teacher') +
    '\'s comment is added by the approver after you submit.</p><div class="tableWrap"><table class="dataTable wideTable"><thead><tr><th>Student</th>' +
    (c.template.scored ? '<th>Average</th>' : '') + '<th>Class teacher\'s comment</th>' + (thirdPromo ? '<th>Promotion</th>' : '') + '<th>Head\'s comment</th></tr></thead><tbody>';
  c.students.forEach(function (s) {
    html += '<tr data-id="' + esc(s.id) + '"><td>' + esc(s.name) + '</td>' + (c.template.scored ? '<td>' + (s.average === null ? '–' : fmt(s.average) + '% ' + esc(s.grade)) + '</td>' : '') +
      '<td><textarea class="cT" rows="3" maxlength="600"' + (p.canEdit ? '' : ' disabled') + '>' + esc(s.info.teacherComment || '') + '</textarea></td>' +
      (thirdPromo ? '<td><select class="cP"' + (p.canEdit || p.canHeadComment ? '' : ' disabled') + '>' + options(state.me.promotionOptions, s.info.promotion || '', '–') + '</select></td>' : '') +
      '<td><textarea class="cH" rows="3" maxlength="600"' + (p.canHeadComment ? '' : ' disabled') + '>' + esc(s.info.headComment || '') + '</textarea></td></tr>';
  });
  html += '</tbody></table></div>';
  if (p.canEdit) html += '<button type="button" data-act="saveTeacherComments">Save class teacher comments</button><p class="formMsg"></p>';
  if (p.canHeadComment) html += '<button type="button" data-act="saveHeadComments">Save head\'s comments' + (thirdPromo ? ' and promotion' : '') + '</button><p class="formMsg"></p>';
  $('subPanel').innerHTML = html + '</div>';
}

function saveCommentsNow(btn, head) {
  const rows = [];
  document.querySelectorAll('#subPanel tr[data-id]').forEach(function (tr) {
    const row = { studentId: tr.getAttribute('data-id') };
    if (head) row.headComment = tr.querySelector('.cH').value; else row.teacherComment = tr.querySelector('.cT').value;
    const pr = tr.querySelector('.cP');
    if (pr) row.promotion = pr.value;
    rows.push(row);
  });
  save(head ? 'saveHeadComments' : 'saveStudentTerm', { rows: rows }, btn, 'Comments saved.');
}

/* ---------- preview, submit, approve, publish ---------- */

function renderReview() {
  const c = state.cls, p = c.permissions, si = c.statusInfo || {};
  let html = '<div class="card"><h3>Checks</h3>' + (c.warnings.length ? '<ul class="warnList">' + c.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '<p class="ok">Nothing missing.</p>');
  const trail = [['Submitted', si['Submitted By'], si['Submitted At']], ['Approved', si['Approved By'], si['Approved At']], ['Published', si['Published By'], si['Published At']]]
    .filter(function (x) { return x[2]; }).map(function (x) { return esc(x[0]) + ' by ' + esc(x[1]) + ' on ' + esc(x[2]); });
  if (trail.length) html += '<p class="muted">' + trail.join(' · ') + (si['Folder URL'] ? ' · <a href="' + esc(si['Folder URL']) + '" target="_blank" rel="noopener">PDFs in Drive</a>' : '') + '</p>';

  if (p.canSubmit) html += actionForm('submitClass', 'Submit for approval', 'Submit these results for approval? You will not be able to change them unless they are returned.', '');
  if (p.canReturn) html += actionForm('returnClass', 'Return to class teacher', 'Return these results to the class teacher?', '<label>What needs correcting</label><textarea name="note" rows="2"></textarea>');
  if (p.canApprove) html += actionForm('approveClass', 'Approve and lock', 'Approve and lock these results? Nobody can change them afterwards unless the Head of School reopens them.', '');
  if (p.canPublish) html += actionForm('publishClass', 'Publish report cards', 'Create the PDF report cards and send them now? This cannot be undone.',
    '<label class="check"><input type="checkbox" name="sendEmail" checked> Email each report to the parent on file</label><p class="muted">PDFs are always saved to the school\'s Results folder in Google Drive.</p>');
  if (p.canReopen) html += '<button type="button" class="smallBtn" data-act="toggle" data-target="reopenBox">Reopen (Head of School)</button><div id="reopenBox" class="hidden">' +
    actionForm('reopenClass', 'Reopen', 'Reopen these results for editing? The reason is logged.', '<label>Reason</label><input name="reason">') + '</div>';

  html += '</div><div class="card"><h3>Preview</h3>' + studentPicker() + '<div class="itemActions">' +
    '<button type="button" class="smallBtn" data-act="printClass">Print the whole class</button>' +
    (p.canResend ? '<button type="button" class="smallBtn" data-act="resend">Resend this report to the parent</button>' : '') + '</div><p class="formMsg" id="previewMsg"></p>' +
    '<iframe id="previewFrame" class="previewFrame" title="Report card preview"></iframe></div>';
  $('subPanel').innerHTML = html;
  loadPreview();
}

function actionForm(action, label, confirmText, fields) {
  return '<form class="subForm" data-action="' + action + '" data-confirm="' + esc(confirmText) + '">' + fields + '<button type="submit">' + esc(label) + '</button><p class="formMsg"></p></form>';
}

function loadPreview() {
  const s = state.cls.students[state.studentIdx];
  if (!s) return;
  call('renderReports', { className: state.cls.className, studentIds: [s.id] }).then(function (r) {
    if (!r || !r.success) { msg($('previewMsg'), (r && r.error) || 'Could not build the preview.'); return; }
    $('previewFrame').srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + r.css + 'body{margin:10px;background:#fff}</style></head><body>' + r.pages[0].html + '</body></html>';
  }).catch(function () { msg($('previewMsg'), 'Could not reach the server.'); });
}

function printClass() {
  // Open the window inside the click so popup blockers allow it, then fill it.
  const w = window.open('', '_blank');
  if (!w) { msg($('previewMsg'), 'Your browser blocked the print window. Allow pop-ups for this site and try again.'); return; }
  w.document.write('<p style="font-family:Arial">Preparing report cards...</p>');
  call('renderReports', { className: state.cls.className }).then(function (r) {
    if (!r || !r.success) { w.document.body.innerHTML = '<p>' + esc((r && r.error) || 'Could not build the reports.') + '</p>'; return; }
    w.document.open();
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(state.cls.className) + ' reports</title><style>' + r.css +
      '@media screen{body{background:#ddd}.pg{background:#fff;margin:10px auto;width:210mm;padding:8mm 0}}.pg{page-break-after:always}</style></head><body>' +
      r.pages.map(function (p) { return '<div class="pg">' + p.html + '</div>'; }).join('') + '<script>setTimeout(function(){window.print()},400)<\/script></body></html>');
    w.document.close();
  }).catch(function () { w.document.body.innerHTML = '<p>Could not reach the server.</p>'; });
}

function runAction(form) {
  const action = form.getAttribute('data-action');
  const extra = {};
  if (form.elements.note) extra.note = form.elements.note.value;
  if (form.elements.reason) extra.reason = form.elements.reason.value;
  if (form.elements.sendEmail) extra.sendEmail = form.elements.sendEmail.checked;
  const btn = form.querySelector('button[type="submit"]');
  const ok = {
    submitClass: function (r) { return 'Submitted.' + (r.warnings && r.warnings.length ? ' Approver will see: ' + r.warnings.join(' ') : ''); },
    returnClass: 'Returned to the class teacher.', approveClass: 'Approved and locked.', reopenClass: 'Reopened.',
    publishClass: function (r) { return 'Published: ' + r.saved + ' PDFs saved, ' + r.sent + ' emailed, ' + r.noEmail + ' without a parent email, ' + r.failed + ' failed.' +
      (r.failures && r.failures.length ? ' ' + r.failures.join('; ') : ''); }
  }[action];
  if (action === 'publishClass') msg(form.querySelector('.formMsg'), 'Publishing — this can take a minute for a full class...', true);
  save(action, extra, btn, ok, false).then(function (r) {
    if (!r) return;
    const text = form.querySelector('.formMsg').textContent;
    reloadClass(true).then(function () { const m = document.querySelector('#subPanel .formMsg'); if (m) msg(m, text, true); });
  });
}

/* Same on-page confirmation as Spark Points: native confirm() popups get
   dismissed by reflex on actions like these. */
function showConfirm(form) {
  if (form.querySelector('.confirmBox')) return;
  const box = document.createElement('div');
  box.className = 'confirmBox';
  box.innerHTML = '<p style="margin:0">' + esc(form.getAttribute('data-confirm')) + '</p><button type="button" data-act="confirmYes">Confirm</button> <button type="button" class="linkBtn" data-act="confirmNo">Cancel</button>';
  form.appendChild(box);
  form.querySelector('button[type="submit"]').classList.add('hidden');
}
function closeConfirm(form) {
  const b = form.querySelector('.confirmBox'); if (b) b.remove();
  form.querySelector('button[type="submit"]').classList.remove('hidden');
}

/* ---------- setup ---------- */

function loadSetup() {
  $('setupContent').innerHTML = '<p class="subtitle">Loading...</p>';
  call('getSetup').then(function (r) {
    if (!r || !r.success) { $('setupContent').innerHTML = '<p class="error">' + esc((r && r.error) || 'Could not load setup.') + '</p>'; return; }
    state.setup = r;
    renderSetup();
  }).catch(function () { $('setupContent').innerHTML = '<p class="error">Could not reach the server.</p>'; });
}

function renderSetup() {
  const s = state.setup;
  const staffOpts = s.staff.map(function (u) { return [u.email, u.name + ' — ' + u.role]; });
  const preClasses = s.classes.filter(function (c) { return /^Pre-?Nursery/i.test(c.className); }).map(function (c) { return [c.className, c.displayName || c.className]; });
  let html = '<div class="card"><h2>Term dates (' + esc(s.session) + ')</h2><div class="tableWrap"><table class="dataTable"><thead><tr><th>Term</th><th>Term ends</th><th>Next term begins</th><th></th></tr></thead><tbody>' +
    s.termDates.map(function (t) {
      return '<tr data-term="' + esc(t.term) + '"><td>' + esc(t.term) + '</td><td><input type="date" class="tdEnd" value="' + esc(t.termEnd) + '"></td><td><input type="date" class="tdNext" value="' + esc(t.nextTermBegins) + '"></td>' +
        '<td><button type="button" class="smallBtn" data-act="saveTermDates">Save</button><p class="formMsg"></p></td></tr>';
    }).join('') + '</tbody></table></div></div>';

  const st = s.settings;
  html += '<div class="card"><h2>Report card settings</h2><div class="row2">' +
    ['LCMS Head Title', 'LCMS Head Name', 'LCA Head Title', 'LCA Head Name'].map(function (k) { return '<div><label>' + esc(k.replace('LCMS', 'Model Schools').replace('LCA', 'Academy')) + '</label><input class="setVal" data-key="' + k + '" value="' + esc(st[k] || '') + '"></div>'; }).join('') +
    '</div><label>Address on report cards</label><input class="setVal" data-key="Address" value="' + esc(st.Address || '') + '">' +
    '<label>Footer</label><input class="setVal" data-key="Footer" value="' + esc(st.Footer || '') + '">' +
    '<label>Show positions on report cards</label><select class="setVal" data-key="Show Positions">' + options([['TRUE', 'Yes'], ['FALSE', 'No']], String(st['Show Positions']).toUpperCase() === 'FALSE' ? 'FALSE' : 'TRUE') + '</select>' +
    '<button type="button" data-act="saveSettings">Save settings</button><p class="formMsg"></p></div>';

  html += '<div class="card"><h2>Classes</h2><p class="muted">Display name is what prints on the report (e.g. Greats 3A). The class teacher enters everything for the class.</p>' +
    '<div class="tableWrap"><table class="dataTable"><thead><tr><th>Class</th><th>Display name</th><th>Class teacher</th><th>Name as printed</th><th></th></tr></thead><tbody>' +
    s.classes.map(function (c) {
      return '<tr data-class="' + esc(c.className) + '"><td><strong>' + esc(c.className) + '</strong><br><span class="muted">' + esc(c.template) + '</span></td>' +
        '<td><input class="cDisp" value="' + esc(c.displayName) + '"></td><td><select class="cTeach">' + options(staffOpts, c.teacherEmail, 'Not assigned') + '</select></td>' +
        '<td><input class="cName" value="' + esc(c.teacherName) + '" placeholder="e.g. PEACE OMEGA [MRS]"></td>' +
        '<td><button type="button" class="smallBtn" data-act="saveClassSetup">Save</button><p class="formMsg"></p></td></tr>';
    }).join('') + '</tbody></table></div></div>';

  const scoredClasses = s.classes.filter(function (c) { return !/^Pre-?Nursery/i.test(c.className); }).map(function (c) { return [c.className, c.displayName && c.displayName !== c.className ? c.displayName + ' (' + c.className + ')' : c.className]; });
  html += '<div class="card"><h2>Subject teachers</h2><p class="muted">Who enters each subject\'s scores in a class. Leave a subject on \u201cClass teacher\u201d if the class teacher enters it. ' +
    'Subject teachers see only their own subjects; the class teacher can still correct any subject and submits the class. A subject teacher needs a Spark Points account.</p>' +
    '<label>Class</label><select id="stClass">' + options(scoredClasses, state.stClass || '', 'Choose a class...') + '</select><div id="stTable"></div></div>';

  html += '<div class="card"><h2>Pre-Nursery pupils</h2><p class="muted">Pre-Nursery is not in Spark Points, so its pupils are listed here. Every other class comes from Spark Points STUDENTS.</p>' +
    '<div class="tableWrap"><table class="dataTable"><thead><tr><th>Admission no.</th><th>Name</th><th>Class</th><th>Parent email</th><th>Active</th></tr></thead><tbody>' +
    (s.preNursery.length ? s.preNursery.map(function (p) {
      return '<tr><td>' + esc(p.id) + '</td><td>' + esc(p.name) + '</td><td>' + esc(p.className) + '</td><td>' + esc(p.parentEmail) + '</td><td>' + (p.active ? 'Yes' : 'No') + '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="muted">None yet.</td></tr>') + '</tbody></table></div>' +
    '<div class="subForm" id="pnForm"><h3>Add or update a pupil</h3><div class="row2"><div><label>Admission no.</label><input name="studentId" placeholder="LCMS/26/0123"></div>' +
    '<div><label>Full name</label><input name="name"></div><div><label>Gender</label><select name="gender">' + options(['Male', 'Female'], '', 'Choose...') + '</select></div>' +
    '<div><label>Class</label><select name="className">' + options(preClasses, '', 'Choose...') + '</select></div>' +
    '<div><label>Parent/guardian email</label><input name="parentEmail" type="email"></div><div><label>Active</label><select name="active">' + options([['yes', 'Yes'], ['no', 'No (left)']], 'yes') + '</select></div></div>' +
    '<button type="button" data-act="savePreNursery">Save pupil</button><p class="formMsg"></p></div></div>';
  $('setupContent').innerHTML = html;
  if (state.stClass) loadSubjectTeachers(state.stClass);
}

function loadSubjectTeachers(cls) {
  state.stClass = cls;
  const box = $('stTable');
  if (!box) return;
  if (!cls) { box.innerHTML = ''; return; }
  box.innerHTML = '<p class="subtitle">Loading...</p>';
  call('getSubjectTeachers', { className: cls }).then(function (r) {
    if (!r || !r.success) { box.innerHTML = '<p class="error">' + esc((r && r.error) || 'Could not load.') + '</p>'; return; }
    if (!r.subjects.length) { box.innerHTML = '<p class="muted">' + esc(r.note || 'No scored subjects.') + '</p>'; return; }
    const staffOpts = state.setup.staff.map(function (u) { return [u.email, u.name + ' — ' + u.role]; });
    box.innerHTML = '<p class="muted">Class teacher: ' + esc(r.classTeacher || 'not assigned') + '</p><div class="tableWrap"><table class="dataTable"><thead><tr><th>Subject</th><th>Entered by</th></tr></thead><tbody>' +
      r.subjects.map(function (x) {
        return '<tr data-subject="' + esc(x.subject) + '"><td>' + esc(x.subject) + '</td><td><select class="stTeach">' + options(staffOpts, x.teacherEmail, 'Class teacher') + '</select></td></tr>';
      }).join('') + '</tbody></table></div><button type="button" data-act="saveSubjectTeachers">Save subject teachers for this class</button><p class="formMsg"></p>';
  }).catch(function () { box.innerHTML = '<p class="error">Could not reach the server.</p>'; });
}

function setupCall(action, extra, btn, ok) {
  const m = btn.parentNode.querySelector('.formMsg');
  btn.disabled = true; msg(m, 'Saving...', true);
  call(action, extra).then(function (r) {
    btn.disabled = false;
    if (!r || !r.success) { msg(m, (r && r.error) || 'Could not save.'); return; }
    msg(m, ok || 'Saved.', true);
    if (action === 'savePreNurseryStudent' || action === 'saveClassSetup') setTimeout(loadSetup, 600);
  }).catch(function () { btn.disabled = false; msg(m, 'Could not reach the server.'); });
}

/* ---------- wiring ---------- */

function handleAct(act, el, e) {
  if (act === 'toggle') { const t = $(el.getAttribute('data-target')); if (t) t.classList.toggle('hidden'); return; }
  if (act === 'openClass') { openClass(el.getAttribute('data-class')); return; }
  if (act === 'backToClasses') { if (!leaveGuard()) return; state.cls = null; state.dirty = false; loadClassList(); return; }
  if (act === 'sub') { if (!leaveGuard()) return; state.dirty = false; renderSubTabs(el.getAttribute('data-sub')); return; }
  if (act === 'saveScores') { saveScoresNow(el); return; }
  if (act === 'saveRatings') { saveRatingsNow(el); return; }
  if (act === 'saveProgress') { saveProgressNow(el); return; }
  if (act === 'saveDetails') { saveDetailsNow(el); return; }
  if (act === 'saveTeacherComments') { saveCommentsNow(el, false); return; }
  if (act === 'saveHeadComments') { saveCommentsNow(el, true); return; }
  if (act === 'prevStudent' || act === 'nextStudent') {
    if (!leaveGuard()) return;
    state.dirty = false;
    const n = state.cls.students.length;
    state.studentIdx = (state.studentIdx + (act === 'nextStudent' ? 1 : -1) + n) % n;
    renderSubTabs(state.sub);
    return;
  }
  if (act === 'printClass') { printClass(); return; }
  if (act === 'resend') {
    const s = state.cls.students[state.studentIdx];
    save('resendReport', { studentId: s.id }, el, function (r) { return 'Sent to ' + r.to + '.'; }, false);
    return;
  }
  if (act === 'confirmYes') { const f = el.closest('form'); closeConfirm(f); runAction(f); return; }
  if (act === 'confirmNo') { closeConfirm(el.closest('form')); return; }
  if (act === 'saveTermDates') {
    const tr = el.closest('tr');
    setupCall('saveTermDates', { term: tr.getAttribute('data-term'), termEnd: tr.querySelector('.tdEnd').value, nextTermBegins: tr.querySelector('.tdNext').value }, el);
    return;
  }
  if (act === 'saveSettings') {
    const values = {};
    document.querySelectorAll('.setVal').forEach(function (i) { values[i.getAttribute('data-key')] = i.value; });
    setupCall('saveSettings', { values: values }, el);
    return;
  }
  if (act === 'saveClassSetup') {
    const tr = el.closest('tr');
    setupCall('saveClassSetup', { className: tr.getAttribute('data-class'), displayName: tr.querySelector('.cDisp').value, teacherEmail: tr.querySelector('.cTeach').value,
      teacherName: tr.querySelector('.cName').value }, el);
    return;
  }
  if (act === 'saveSubjectTeachers') {
    const assignments = [];
    document.querySelectorAll('#stTable tr[data-subject]').forEach(function (tr) {
      assignments.push({ subject: tr.getAttribute('data-subject'), teacherEmail: tr.querySelector('.stTeach').value });
    });
    setupCall('saveSubjectTeachers', { className: state.stClass, assignments: assignments }, el, 'Saved.');
    return;
  }
  if (act === 'savePreNursery') {
    const f = $('pnForm');
    const v = function (n) { return f.querySelector('[name="' + n + '"]').value.trim(); };
    setupCall('savePreNurseryStudent', { studentId: v('studentId').toUpperCase(), name: v('name'), gender: v('gender'), className: v('className'),
      parentEmail: v('parentEmail'), active: v('active') !== 'no' }, el, 'Pupil saved.');
  }
}

function wire() {
  if (window.__resultsWired) return;
  window.__resultsWired = true;
  const needed = ['signInScreen', 'mainScreen', 'signInForm', 'staffEmail', 'staffCode', 'rememberMeToggle', 'signInBtn', 'signInError', 'staffNameDisplay',
    'staffRoleDisplay', 'sessionDisplay', 'termSelect', 'signOutBtn', 'classesTab', 'classesTabBtn', 'setupTab', 'setupTabBtn', 'noAccessNote', 'classList',
    'classView', 'classHeader', 'subTabBar', 'subPanel', 'setupContent'];
  const missing = needed.filter(function (id) { return !document.getElementById(id); });
  if (missing.length) { fatal('index.html is missing these elements: ' + missing.join(', ')); return; }

  $('signInForm').addEventListener('submit', function (e) { e.preventDefault(); trySignIn($('staffEmail').value, $('staffCode').value); });
  $('signOutBtn').addEventListener('click', signOut);
  document.querySelectorAll('#mainScreen > .tabBar .tabBtn').forEach(function (b) { b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); }); });
  $('termSelect').addEventListener('change', function () {
    if (!leaveGuard()) { this.value = state.term; return; }
    state.term = this.value; state.dirty = false;
    if (state.cls) reloadClass(true); else loadClassList();
  });

  document.addEventListener('click', function (e) { const el = e.target.closest('[data-act]'); if (el) handleAct(el.getAttribute('data-act'), el, e); });
  document.addEventListener('submit', function (e) {
    const f = e.target.closest('form[data-action]');
    if (!f) return;
    e.preventDefault();
    showConfirm(f);
  });
  document.addEventListener('input', function (e) {
    if (e.target.closest('#subPanel') && e.target.matches('input, textarea, select')) state.dirty = true;
    if (e.target.matches('.scoreGrid input')) recalcScoreRow(e.target.closest('tr'));
  });
  document.addEventListener('change', function (e) {
    if (e.target.closest('#subPanel') && e.target.matches('input[type=radio], select:not(#subjectSelect):not(#studentPick)')) state.dirty = true;
    if (e.target.id === 'subjectSelect') {
      if (!leaveGuard()) { e.target.value = state.cls.subject; return; }
      state.dirty = false; state.cls.subject = e.target.value; renderScores();
    }
    if (e.target.id === 'stClass') { loadSubjectTeachers(e.target.value); return; }
    if (e.target.id === 'studentPick') {
      if (!leaveGuard()) { e.target.value = state.studentIdx; return; }
      state.dirty = false; state.studentIdx = Number(e.target.value); renderSubTabs(state.sub);
    }
  });
  // Enter moves down the column in the score grid, like a spreadsheet.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !e.target.matches('.scoreGrid input')) return;
    e.preventDefault();
    const next = document.querySelector('.scoreGrid input[data-row="' + (Number(e.target.getAttribute('data-row')) + 1) + '"][data-col="' + e.target.getAttribute('data-col') + '"]');
    if (next) { next.focus(); next.select(); }
  });
  window.addEventListener('beforeunload', function (e) { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* A link from the access email looks like ?email=...&code=... — prefill
     and sign in automatically, then strip them from the address bar so the
     code is not left visible or bookmarked. Same as Spark Points. */
  const params = new URLSearchParams(location.search);
  if (params.get('email') && params.get('code')) {
    $('staffEmail').value = params.get('email');
    $('staffCode').value = params.get('code');
    history.replaceState({}, document.title, location.pathname);
    trySignIn(params.get('email'), params.get('code'));
    return;
  }

  let se, sc;
  try { se = localStorage.getItem(STORE_EMAIL) || sessionStorage.getItem(STORE_EMAIL); sc = localStorage.getItem(STORE_CODE) || sessionStorage.getItem(STORE_CODE); } catch (e) {}
  if (se && sc) {
    $('staffEmail').value = se; $('staffCode').value = sc;
    try { if (localStorage.getItem(STORE_EMAIL)) $('rememberMeToggle').checked = true; } catch (e) {}
    trySignIn(se, sc);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
else wire();
