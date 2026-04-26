/* ═══════════════════════════════════════════════════════════════
   FlashApp — Application Logic
   ═══════════════════════════════════════════════════════════════ */

/* ── State ────────────────────────────────────────────────────── */
const STATE_KEY = 'flashapp_state';
let appState = loadAppState();

let manifest = null;
let currentFile = null;        // { theme, filename, data }
let currentTab = 'flashcards'; // 'flashcards' | 'quiz' | 'results'
let shuffleOn = false;

// Per-session derived arrays (after optional shuffle)
let fcCards = [];
let fcIndex = 0;

let quizQs = [];
let quizIndex = 0;
let quizAnswers = {};  // index → { given, correct }

/* ── Persistence ─────────────────────────────────────────────── */
function loadAppState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : { files: {}, theme: 'dark', shuffle: false };
  } catch { return { files: {}, theme: 'dark', shuffle: false }; }
}
function saveAppState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(appState));
}
function fileKey(theme, filename) { return `${theme}::${filename}`; }
function markSeen(origIdx) {
  if (!currentFile) return;
  const fs = getFileState(currentFile.theme, currentFile.filename);
  if (!fs.seen) fs.seen = [];
  if (!fs.seen.includes(origIdx)) {
    fs.seen.push(origIdx);
    saveAppState();
    refreshSidebarItem(currentFile.theme, currentFile.filename);
  }
}
function getFileState(theme, filename) {
  const k = fileKey(theme, filename);
  if (!appState.files[k]) appState.files[k] = {};
  return appState.files[k];
}

/* ── Utility ──────────────────────────────────────────────────── */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loading(on) {
  document.getElementById('loading-overlay').classList.toggle('visible', on);
}

/* ── Theme ────────────────────────────────────────────────────── */
function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  document.body.classList.toggle('light', theme === 'light');
  document.getElementById('btn-theme').textContent = theme === 'dark' ? '☀️' : '🌙';
  appState.theme = theme;
  saveAppState();
}

document.getElementById('btn-theme').addEventListener('click', () => {
  applyTheme(appState.theme === 'dark' ? 'light' : 'dark');
});

/* ── Sidebar toggle ───────────────────────────────────────────── */
let sidebarOpen = true;
document.getElementById('btn-sidebar-toggle').addEventListener('click', () => {
  sidebarOpen = !sidebarOpen;
  document.getElementById('sidebar').classList.toggle('hidden', !sidebarOpen);
  document.getElementById('main').classList.toggle('full', !sidebarOpen);
  document.getElementById('btn-sidebar-toggle').textContent = sidebarOpen ? '☰' : '▶';
});

/* ── Auto-discovery via nginx autoindex JSON ─────────────────── */
function folderToLabel(name) {
  return name.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function fileToLabel(filename) {
  return filename.replace(/\.json$/i, '').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function discoverMaterial() {
  loading(true);
  try {
    const rootRes = await fetch('material/');
    if (!rootRes.ok) throw new Error('Could not read material/ directory — is nginx autoindex enabled?');
    const rootEntries = await rootRes.json();

    const themes = [];
    for (const entry of rootEntries) {
      if (entry.type !== 'directory') continue;
      const folder = entry.name.replace(/\/$/, '');
      const dirRes = await fetch(`material/${folder}/`);
      if (!dirRes.ok) continue;
      const dirEntries = await dirRes.json();
      const files = dirEntries
        .filter(e => e.type === 'file' && e.name.endsWith('.json') && !e.name.startsWith('_'))
        .map(e => e.name);
      if (files.length > 0) {
        themes.push({ folder, label: folderToLabel(folder), files });
      }
    }

    if (themes.length === 0) {
      document.getElementById('sidebar-tree').innerHTML =
        `<div style="padding:16px 14px;font-size:13px;color:var(--color-muted);">No study sets found in material/</div>`;
      return;
    }

    manifest = { themes };
    buildSidebar();
  } catch (e) {
    document.getElementById('sidebar-tree').innerHTML =
      `<div style="padding:16px 14px;font-size:13px;color:var(--color-wrong);">⚠ ${e.message}</div>`;
  } finally {
    loading(false);
  }
}

function buildSidebar() {
  const tree = document.getElementById('sidebar-tree');
  tree.innerHTML = '';
  for (const theme of manifest.themes) {
    const group = document.createElement('div');
    group.className = 'theme-group';

    const header = document.createElement('div');
    header.className = 'theme-header';
    header.innerHTML = `<span class="theme-icon open">▶</span><span class="theme-label">${theme.label}</span>`;
    const filesDiv = document.createElement('div');
    filesDiv.className = 'theme-files';

    const numberAtStartSortKey = (filename) =>
      filename.replace(/^(.*?)(\d+)(.*)$/, "$2$1$3");

    const sortedFiles = theme.files
      .map((filename) => ({
        filename,
        sortName: numberAtStartSortKey(filename),
      }))
      .sort((a, b) =>
        a.sortName.localeCompare(b.sortName, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );

    for (const file of sortedFiles) {
      filesDiv.appendChild(buildFileItem(theme, file.filename));
    }

    header.addEventListener('click', () => {
      const icon = header.querySelector('.theme-icon');
      const isOpen = icon.classList.toggle('open');
      filesDiv.style.maxHeight = isOpen ? filesDiv.scrollHeight + 'px' : '0';
    });

    // Start open
    filesDiv.style.maxHeight = '500px';

    group.appendChild(header);
    group.appendChild(filesDiv);
    tree.appendChild(group);
  }
}

function buildFileItem(theme, filename) {
  const item = document.createElement('div');
  item.className = 'file-item';
  item.dataset.theme = theme.folder;
  item.dataset.filename = filename;

  const fs = getFileState(theme.folder, filename);

  // Top row: name + score + restart
  const top = document.createElement('div');
  top.className = 'file-item-top';

  const nameEl = document.createElement('span');
  nameEl.className = 'file-name';
  nameEl.textContent = fileToLabel(filename);

  const scoreEl = document.createElement('span');
  scoreEl.className = 'file-score';
  scoreEl.textContent = fs.lastScore !== undefined ? `${fs.lastScore}/${fs.lastTotal}` : '';

  const restartBtn = document.createElement('button');
  restartBtn.className = 'file-restart';
  restartBtn.title = 'Reset progress';
  restartBtn.textContent = '↺';
  restartBtn.addEventListener('click', e => {
    e.stopPropagation();
    resetFileState(theme.folder, filename, item);
  });

  top.appendChild(nameEl);
  top.appendChild(scoreEl);
  top.appendChild(restartBtn);

  // Progress bar
  const progressWrap = document.createElement('div');
  progressWrap.className = 'file-progress-wrap';
  const progressBar = document.createElement('div');
  progressBar.className = 'file-progress-bar';
  const seen = (fs.seen || []).length;
  const total = fs.total || 0;
  progressBar.style.width = total > 0 ? Math.round((seen / total) * 100) + '%' : '0%';
  progressBar.title = total > 0 ? `${seen} / ${total}` : '';
  progressWrap.appendChild(progressBar);

  item.appendChild(top);
  item.appendChild(progressWrap);

  item.addEventListener('click', () => openFile(theme, filename, item));
  return item;
}

function refreshSidebarItem(theme, filename) {
  const item = document.querySelector(`.file-item[data-theme="${theme}"][data-filename="${filename}"]`);
  if (!item) return;
  const fs = getFileState(theme, filename);
  const seen = (fs.seen || []).length;
  const total = fs.total || 0;

  const scoreEl = item.querySelector('.file-score');
  if (scoreEl) scoreEl.textContent = fs.lastScore !== undefined ? `${fs.lastScore}/${fs.lastTotal}` : '';

  const bar = item.querySelector('.file-progress-bar');
  if (bar) {
    bar.style.width = total > 0 ? Math.round((seen / total) * 100) + '%' : '0%';
    bar.title = total > 0 ? `${seen} / ${total}` : '';
  }
}

/* ── Reset file state ───────────────────────────────────────── */
function resetFileState(theme, filename, itemEl) {
  const k = theme + '::' + filename;
  const total = appState.files[k] ? appState.files[k].total : undefined;
  appState.files[k] = { total, seen: [] };
  saveAppState();
  refreshSidebarItem(theme, filename);
  if (currentFile && currentFile.theme === theme && currentFile.filename === filename) {
    quizAnswers = {};
    if (currentTab === 'quiz') renderQuestion();
  }
}

/* ── Open a file ─────────────────────────────────────────────── */
async function openFile(theme, filename, itemEl) {
  // Highlight active
  document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
  itemEl.classList.add('active');

  loading(true);
  try {
    const r = await fetch(`material/${theme.folder}/${filename}`);
    if (!r.ok) throw new Error(`Could not load ${filename}`);
    const data = await r.json();

    // Update file name in sidebar

    currentFile = { theme: theme.folder, filename, data };
    initContent(data, theme.folder, filename);
  } catch (e) {
    alert(`Error loading file: ${e.message}`);
  } finally {
    loading(false);
  }
}

/* ── Init content for a loaded file ─────────────────────────── */
function initContent(data, theme, filename) {
  const hasFc = data.entries.some(e => e.type === 'flashcard');
  const hasQz = data.entries.some(e => e.type === 'quiz');
  const fs = getFileState(theme, filename);
  fs.total = data.entries.length;
  if (!fs.seen) fs.seen = [];
  saveAppState();
  refreshSidebarItem(theme, filename);

  // Show/hide tabs
  document.getElementById('tab-btn-flashcards').style.display = hasFc ? '' : 'none';
  document.getElementById('tab-btn-quiz').style.display = hasQz ? '' : 'none';

  // Determine default tab
  const defaultTab = hasFc ? 'flashcards' : 'quiz';

  // Show panel
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('content-panel').classList.add('visible');

  switchTab(defaultTab);
}

/* ── Tab switching ───────────────────────────────────────────── */
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.getElementById('tab-flashcards').classList.toggle('active', tab === 'flashcards');
  document.getElementById('tab-quiz').classList.toggle('active', tab === 'quiz');
  document.getElementById('tab-results').classList.toggle('active', tab === 'results');

  if (tab === 'flashcards') initFlashcards();
  else if (tab === 'quiz') initQuiz();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

/* ── Shuffle toggle ──────────────────────────────────────────── */
shuffleOn = appState.shuffle || false;
const btnShuffle = document.getElementById('btn-shuffle');
btnShuffle.classList.toggle('on', shuffleOn);

btnShuffle.addEventListener('click', () => {
  shuffleOn = !shuffleOn;
  btnShuffle.classList.toggle('on', shuffleOn);
  appState.shuffle = shuffleOn;
  saveAppState();
  // Re-init current tab
  if (currentTab === 'flashcards') initFlashcards();
  else if (currentTab === 'quiz') initQuiz();
});

/* ══════════════════════════════════════════════════════════════
   FLASHCARDS
   ══════════════════════════════════════════════════════════════ */
function initFlashcards() {
  if (!currentFile) return;
  const cards = currentFile.data.entries
    .map((e, i) => ({ ...e, _origIdx: i }))
    .filter(e => e.type === 'flashcard');
  fcCards = shuffleOn ? shuffle(cards) : [...cards];
  fcIndex = 0;

  renderCard();
}

function renderCard() {
  const card3d = document.getElementById('card-3d');
  card3d.classList.remove('flipped');

  document.getElementById('fc-front').textContent = fcCards[fcIndex].front;
  document.getElementById('fc-back').textContent = fcCards[fcIndex].back;
  document.getElementById('fc-progress').textContent = `Card ${fcIndex + 1} of ${fcCards.length}`;

  document.getElementById('fc-prev').disabled = fcIndex === 0;
  document.getElementById('fc-next').disabled = fcIndex === fcCards.length - 1;
}

// Flip
const cardWrap = document.getElementById('card-wrap');
cardWrap.addEventListener('click', () => {
  const card3d = document.getElementById('card-3d');
  if (!card3d.classList.contains('flipped')) {
    markSeen(fcCards[fcIndex]._origIdx);
  }
  card3d.classList.toggle('flipped');
});
cardWrap.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    document.getElementById('card-3d').classList.toggle('flipped');
  }
});

document.getElementById('fc-prev').addEventListener('click', () => {
  if (fcIndex > 0) { fcIndex--; renderCard(); }
});
document.getElementById('fc-next').addEventListener('click', () => {
  if (fcIndex < fcCards.length - 1) { fcIndex++; renderCard(); }
});

/* ══════════════════════════════════════════════════════════════
   QUIZ
   ══════════════════════════════════════════════════════════════ */
function initQuiz() {
  if (!currentFile) return;
  const qs = currentFile.data.entries
    .map((e, i) => ({ ...e, _origIdx: i }))
    .filter(e => e.type === 'quiz');
  quizQs = shuffleOn ? shuffle(qs) : [...qs];
  quizIndex = 0;
  quizAnswers = {};
  renderQuestion();
}

function renderQuestion() {
  const q = quizQs[quizIndex];
  document.getElementById('quiz-question').textContent = q.question;
  document.getElementById('quiz-progress-inline').textContent = `Question ${quizIndex + 1} of ${quizQs.length}`;

  // Clear feedback
  const fb = document.getElementById('quiz-feedback');
  fb.style.display = 'none';
  fb.className = 'feedback-row';
  fb.innerHTML = '';

  // Render answer area
  const area = document.getElementById('quiz-answer-area');
  area.innerHTML = '';

  if (q.subtype === 'multiple_choice') renderMC(q, area);
  else if (q.subtype === 'true_false') renderTF(q, area);
  else if (q.subtype === 'text_answer') renderTA(q, area);

  // If already answered, restore state
  if (quizAnswers[quizIndex] !== undefined) {
    restoreAnswerUI(q, quizIndex);
  }

  // Nav buttons
  document.getElementById('quiz-prev').disabled = quizIndex === 0;
  document.getElementById('quiz-next').disabled = quizIndex === quizQs.length - 1;

  // Finish button: show when all answered
  const allAnswered = quizQs.every((_, i) => quizAnswers[i] !== undefined);
  const finishBtn = document.getElementById('quiz-finish');
  finishBtn.style.display = allAnswered ? '' : 'none';
}

/* ── Multiple choice ─────────────────────────────────────────── */
function renderMC(q, area) {
  const list = document.createElement('div');
  list.className = 'options-list';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = opt;
    btn.addEventListener('click', () => submitMC(q, i));
    list.appendChild(btn);
  });
  area.appendChild(list);
}

function submitMC(q, chosen) {
  if (quizAnswers[quizIndex] !== undefined) return;
  const correct = chosen === q.answer;
  quizAnswers[quizIndex] = { given: chosen, correct };
  markSeen(q._origIdx);
  restoreAnswerUI(q, quizIndex);
  checkFinishVisible();
}

/* ── True / False ────────────────────────────────────────────── */
function renderTF(q, area) {
  const row = document.createElement('div');
  row.className = 'tf-row';
  ['True', 'False'].forEach(label => {
    const btn = document.createElement('button');
    btn.className = 'tf-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => submitTF(q, label === 'True'));
    row.appendChild(btn);
  });
  area.appendChild(row);
}

function submitTF(q, chosen) {
  if (quizAnswers[quizIndex] !== undefined) return;
  const correct = chosen === q.answer;
  quizAnswers[quizIndex] = { given: chosen, correct };
  markSeen(q._origIdx);
  restoreAnswerUI(q, quizIndex);
  checkFinishVisible();
}

/* ── Text answer ─────────────────────────────────────────────── */
function renderTA(q, area) {
  const wrap = document.createElement('div');
  wrap.className = 'text-answer-wrap';
  const ta = document.createElement('textarea');
  ta.className = 'text-input text-area';
  ta.placeholder = 'Type your answer…';
  ta.id = 'ta-input';
  ta.rows = 4;
  const btn = document.createElement('button');
  btn.className = 'submit-btn';
  btn.textContent = 'Submit';
  btn.id = 'ta-submit';
  btn.addEventListener('click', () => submitTA(q));
  wrap.appendChild(ta);
  wrap.appendChild(btn);
  area.appendChild(wrap);
}

function submitTA(q) {
  if (quizAnswers[quizIndex] !== undefined) return;
  const ta = document.getElementById('ta-input');
  const given = ta.value.trim();
  if (!given) return;
  quizAnswers[quizIndex] = { given, correct: null };
  markSeen(q._origIdx);
  restoreAnswerUI(q, quizIndex);
  checkFinishVisible();
}

/* ── Restore answer UI (after navigation back) ───────────────── */
function restoreAnswerUI(q, idx) {
  const ans = quizAnswers[idx];
  if (!ans) return;
  const area = document.getElementById('quiz-answer-area');

  if (q.subtype === 'multiple_choice') {
    const btns = area.querySelectorAll('.option-btn');
    btns.forEach((btn, i) => {
      btn.disabled = true;
      if (i === q.answer) btn.classList.add('correct');
      else if (i === ans.given && !ans.correct) btn.classList.add('wrong');
    });
  } else if (q.subtype === 'true_false') {
    const btns = area.querySelectorAll('.tf-btn');
    btns.forEach(btn => {
      btn.disabled = true;
      const val = btn.textContent === 'True';
      if (val === q.answer) btn.classList.add('correct');
      else if (val === ans.given && !ans.correct) btn.classList.add('wrong');
    });
  } else if (q.subtype === 'text_answer') {
    const ta = area.querySelector('.text-input');
    const submitBtn = area.querySelector('.submit-btn');
    if (ta) { ta.value = ans.given; ta.disabled = true; }
    if (submitBtn) submitBtn.disabled = true;
  }

  // Show feedback
  const fb = document.getElementById('quiz-feedback');
  fb.style.display = 'flex';
  if (q.subtype === 'text_answer') {
    fb.className = 'feedback-row neutral';
    fb.innerHTML = `✎ Submitted<br><span class="feedback-ref-answer">Model answer: ${q.answer}</span>`;
  } else if (ans.correct) {
    fb.className = 'feedback-row correct';
    fb.textContent = '✓ Correct!';
  } else {
    fb.className = 'feedback-row wrong';
    let correctText = '';
    if (q.subtype === 'multiple_choice') correctText = q.options[q.answer];
    else if (q.subtype === 'true_false') correctText = q.answer ? 'True' : 'False';
    fb.innerHTML = `✗ Wrong — <span class="feedback-correct-reveal">Correct answer: ${correctText}</span>`;
  }
}

function checkFinishVisible() {
  const allAnswered = quizQs.every((_, i) => quizAnswers[i] !== undefined);
  document.getElementById('quiz-finish').style.display = allAnswered ? '' : 'none';
}

/* ── Quiz navigation ─────────────────────────────────────────── */
document.getElementById('quiz-prev').addEventListener('click', () => {
  if (quizIndex > 0) { quizIndex--; renderQuestion(); }
});
document.getElementById('quiz-next').addEventListener('click', () => {
  if (quizIndex < quizQs.length - 1) { quizIndex++; renderQuestion(); }
});
document.getElementById('quiz-finish').addEventListener('click', showResults);

/* ══════════════════════════════════════════════════════════════
   RESULTS
   ══════════════════════════════════════════════════════════════ */
function showResults() {
  const gradable = quizQs.filter(q => q.subtype !== 'text_answer');
  const score = gradable.filter((q, i) => {
    const idx = quizQs.indexOf(q);
    return quizAnswers[idx] && quizAnswers[idx].correct;
  }).length;
  const total = gradable.length;
  const pct = total > 0 ? Math.round((score / total) * 100) : 100;

  // Persist score
  const fs = getFileState(currentFile.theme, currentFile.filename);
  fs.lastScore = score;
  fs.lastTotal = total;
  fs.lastQuizDate = new Date().toISOString();
  saveAppState();
  refreshSidebarItem(currentFile.theme, currentFile.filename);

  // Score card
  const scoreCard = document.getElementById('score-card');
  scoreCard.className = 'score-card ' + (pct >= 80 ? 'great' : pct >= 50 ? 'ok' : 'low');
  document.getElementById('result-score').textContent = `${score} / ${total}`;
  document.getElementById('result-pct').textContent = `${pct}%`;

  // Review list
  const reviewList = document.getElementById('review-list');
  reviewList.innerHTML = '';
  quizQs.forEach((q, i) => {
    const ans = quizAnswers[i];
    const item = document.createElement('div');


    let correctDisplay = '';
    let givenDisplay = '';
    if (q.subtype === 'multiple_choice') {
      correctDisplay = q.options[q.answer];
      givenDisplay = ans ? q.options[ans.given] : '(not answered)';
    } else if (q.subtype === 'true_false') {
      correctDisplay = q.answer ? 'True' : 'False';
      givenDisplay = ans ? (ans.given ? 'True' : 'False') : '(not answered)';
    } else if (q.subtype === 'text_answer') {
      correctDisplay = String(q.answer);
      givenDisplay = ans ? ans.given : '(not answered)';
    }

    const isOpen = q.subtype === 'text_answer';
    const isCorrect = !isOpen && ans && ans.correct;
    item.className = 'review-item ' + (isOpen ? 'open-item' : isCorrect ? 'correct-item' : 'wrong-item');
    item.innerHTML = `
      <div class="review-q">
        <span class="review-indicator ${isOpen ? 'open' : isCorrect ? 'ok' : 'bad'}">${isOpen ? '✎' : isCorrect ? '✓' : '✗'}</span>
        <span>${q.question}</span>
      </div>
      <div class="review-answers">
        <div class="review-ans-row ${isOpen ? 'user-open' : isCorrect ? 'user-correct' : 'user-wrong'}">Your answer: <span>${givenDisplay}</span></div>
        ${isOpen ? `<div class="review-ans-row ref-ans">Reference: <span>${correctDisplay}</span></div>` : ''}
        ${!isOpen && !isCorrect ? `<div class="review-ans-row correct-ans">Correct answer: <span>${correctDisplay}</span></div>` : ''}
      </div>`;
    reviewList.appendChild(item);
  });

  // Switch to results tab visually
  currentTab = 'results';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-flashcards').classList.remove('active');
  document.getElementById('tab-quiz').classList.remove('active');
  document.getElementById('tab-results').classList.add('active');
}

document.getElementById('btn-retake').addEventListener('click', () => {
  switchTab('quiz');
});
document.getElementById('btn-back-study').addEventListener('click', () => {
  switchTab('flashcards');
});

/* ── Init ────────────────────────────────────────────────────── */
applyTheme(appState.theme || 'dark');
shuffleOn = appState.shuffle || false;
document.getElementById('btn-shuffle').classList.toggle('on', shuffleOn);
discoverMaterial();

/* ── Keyboard navigation ─────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (currentTab === 'flashcards') {
    if (e.key === 'ArrowLeft') document.getElementById('fc-prev').click();
    if (e.key === 'ArrowRight') document.getElementById('fc-next').click();
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cardWrap.click(); }
  } else if (currentTab === 'quiz') {
    if (e.key === 'ArrowLeft') document.getElementById('quiz-prev').click();
    if (e.key === 'ArrowRight') document.getElementById('quiz-next').click();
  }
});
