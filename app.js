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

let endlessMode = null;

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

function endlessKey(theme, field) {
  return `study:endless:${theme}:${field}`;
}

function getEndlessStreak(theme) {
  return Number(localStorage.getItem(endlessKey(theme, 'streak')) || '0');
}

function getEndlessBest(theme) {
  return Number(localStorage.getItem(endlessKey(theme, 'best')) || '0');
}

function setEndlessStreak(theme, value) {
  localStorage.setItem(endlessKey(theme, 'streak'), String(value));
}

function setEndlessBest(theme, value) {
  localStorage.setItem(endlessKey(theme, 'best'), String(value));
}

function updateEndlessScore(theme, correct) {
  let streak = getEndlessStreak(theme);

  if (correct) {
    streak += 1;
    setEndlessStreak(theme, streak);

    const best = getEndlessBest(theme);
    if (streak > best) {
      setEndlessBest(theme, streak);
    }
  } else {
    streak = 0;
    setEndlessStreak(theme, 0);
  }

  refreshEndlessItem(theme);
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

function domEl(tag, options = {}, children = []) {
  const node = document.createElement(tag);

  if (options.className !== undefined) node.className = options.className;
  if (options.id !== undefined) node.id = options.id;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.title !== undefined) node.title = options.title;
  if (options.type !== undefined) node.type = options.type;
  if (options.rows !== undefined) node.rows = options.rows;
  if (options.placeholder !== undefined) node.placeholder = options.placeholder;
  if (options.role !== undefined) node.setAttribute('role', options.role);
  if (options.ariaModal !== undefined) node.setAttribute('aria-modal', options.ariaModal);
  if (options.ariaLabelledby !== undefined) node.setAttribute('aria-labelledby', options.ariaLabelledby);

  for (const child of children) {
    if (child) node.appendChild(child);
  }

  return node;
}

function clearNode(node) {
  node.replaceChildren();
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
      showSidebarMessage('No study sets found in material/', 'var(--color-muted)');
      return;
    }

    manifest = { themes };
    buildSidebar();
  } catch (e) {
    showSidebarMessage(`⚠ ${e.message}`, 'var(--color-wrong)');
  } finally {
    loading(false);
  }
}

function showSidebarMessage(text, color) {
  const tree = document.getElementById('sidebar-tree');
  clearNode(tree);

  const msg = domEl('div', { text });
  msg.style.padding = '16px 14px';
  msg.style.fontSize = '13px';
  msg.style.color = color;
  tree.appendChild(msg);
}

function buildSidebar() {
  const tree = document.getElementById('sidebar-tree');
  clearNode(tree);
  for (const theme of manifest.themes) {
    const group = document.createElement('div');
    group.className = 'theme-group';

    const header = document.createElement('div');
    header.className = 'theme-header';
    header.append(
      domEl('span', { className: 'theme-icon open', text: '▶' }),
      domEl('span', { className: 'theme-label', text: theme.label })
    );
    const filesDiv = document.createElement('div');
    filesDiv.className = 'theme-files';

    filesDiv.appendChild(buildEndlessItem(theme));

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

    group.appendChild(header);
    group.appendChild(filesDiv);
    tree.appendChild(group);

    // Start open
    filesDiv.style.maxHeight = filesDiv.scrollHeight + 'px';
  }
}

function buildEndlessItem(theme) {
  const item = document.createElement('div');
  item.className = 'file-item endless-item';
  item.dataset.theme = theme.folder;
  item.dataset.endless = 'true';

  const top = document.createElement('div');
  top.className = 'file-item-top';

  const nameEl = document.createElement('span');
  nameEl.className = 'file-name endless-name';
  nameEl.textContent = 'Endless Mode';

  const scoreEl = document.createElement('span');
  scoreEl.className = 'file-score endless-score';
  scoreEl.textContent = endlessScoreText(theme.folder);

  top.appendChild(nameEl);
  top.appendChild(scoreEl);

  const sub = document.createElement('div');
  sub.className = 'endless-sub';
  sub.textContent = 'Random questions from this folder';

  item.appendChild(top);
  item.appendChild(sub);

  item.addEventListener('click', () => openEndlessMode(theme, item));

  return item;
}

function endlessScoreText(theme) {
  return `🔥 ${getEndlessStreak(theme)}  🏆 ${getEndlessBest(theme)}`;
}

function refreshEndlessItem(theme) {
  const item = document.querySelector(`.endless-item[data-theme="${theme}"]`);
  if (!item) return;

  const scoreEl = item.querySelector('.endless-score');
  if (scoreEl) scoreEl.textContent = endlessScoreText(theme);
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
  endlessMode = null;

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

/* ── Open Endless Mode ──────────────────────────────────────── */
async function openEndlessMode(theme, itemEl) {
  document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
  itemEl.classList.add('active');

  currentFile = null;
  quizAnswers = {};
  loading(true);

  try {
    const questions = [];

    for (const filename of theme.files) {
      const r = await fetch(`material/${theme.folder}/${filename}`);
      if (!r.ok) continue;

      const data = await r.json();
      const entries = Array.isArray(data.entries) ? data.entries : [];

      entries.forEach((entry, idx) => {
        if (entry.type !== 'quiz') return;

        questions.push({
          ...entry,
          _sourceFilename: filename,
          _sourceLabel: fileToLabel(filename),
          _origIdx: idx
        });
      });
    }

    if (questions.length === 0) {
      alert(`No quiz questions found for ${theme.label}.`);
      return;
    }

    endlessMode = {
      theme: theme.folder,
      label: theme.label,
      questions,
      deck: shuffle(questions),
      current: null,
      currentSource: null,
      answered: false
    };

    showEndlessPanel();
    nextEndlessQuestion();
  } catch (e) {
    alert(`Error loading Endless Mode: ${e.message}`);
  } finally {
    loading(false);
  }
}

function showEndlessPanel() {
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('content-panel').classList.add('visible');

  document.getElementById('tab-btn-flashcards').style.display = 'none';
  document.getElementById('tab-btn-quiz').style.display = '';
  document.getElementById('quiz-finish').style.display = 'none';

  currentTab = 'quiz';

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-btn-quiz').classList.add('active');

  document.getElementById('tab-flashcards').classList.remove('active');
  document.getElementById('tab-results').classList.remove('active');
  document.getElementById('tab-quiz').classList.add('active');

  document.getElementById('quiz-prev').style.visibility = '';
  document.getElementById('quiz-next').style.visibility = '';
}

function exitEndlessPanelDefaults() {
  document.getElementById('quiz-prev').style.visibility = '';
  document.getElementById('quiz-next').style.visibility = '';
}

/* ── Init content for a loaded file ─────────────────────────── */
function initContent(data, theme, filename) {
  exitEndlessPanelDefaults();

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
  else if (tab === 'quiz') {
    if (endlessMode) renderEndlessQuestion();
    else initQuiz();
  }
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
  else if (currentTab === 'quiz') {
    if (endlessMode) {
      endlessMode.deck = shuffle(endlessMode.questions);
      nextEndlessQuestion();
    } else {
      initQuiz();
    }
  }
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
   ENDLESS MODE
   ══════════════════════════════════════════════════════════════ */
function nextEndlessQuestion() {
  if (!endlessMode) return;

  if (endlessMode.deck.length === 0) {
    endlessMode.deck = shuffle(endlessMode.questions);
  }

  endlessMode.current = endlessMode.deck.pop();
  endlessMode.currentSource = endlessMode.current._sourceLabel;
  endlessMode.answered = false;

  renderEndlessQuestion();
}

function renderEndlessQuestion() {
  const q = endlessMode.current;
  if (!q) return;

  const streak = getEndlessStreak(endlessMode.theme);
  const best = getEndlessBest(endlessMode.theme);

  document.getElementById('quiz-progress-inline').textContent =
    `${endlessMode.label} Endless Mode    🔥 ${streak}    🏆 ${best}`;

  document.getElementById('quiz-question').replaceChildren(
    domEl('div', { className: 'endless-source', text: `Question from ${endlessMode.currentSource}` }),
    domEl('div', { text: q.question })
  );

  const fb = document.getElementById('quiz-feedback');
  fb.style.display = 'none';
  fb.className = 'feedback-row';
  clearNode(fb);

  const area = document.getElementById('quiz-answer-area');
  clearNode(area);

  if (q.subtype === 'multiple_choice') renderEndlessMC(q, area);
  else if (q.subtype === 'true_false') renderEndlessTF(q, area);
  else if (q.subtype === 'text_answer') renderEndlessTA(q, area);

  document.getElementById('quiz-prev').disabled = true;
  document.getElementById('quiz-next').disabled = false;
  document.getElementById('quiz-finish').style.display = 'none';
}

function renderEndlessMC(q, area) {
  const list = document.createElement('div');
  list.className = 'options-list';

  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = opt;
    btn.addEventListener('click', () => submitEndlessMC(q, i));
    list.appendChild(btn);
  });

  area.appendChild(list);
}

function submitEndlessMC(q, chosen) {
  if (endlessMode.answered) return;

  endlessMode.answered = true;
  const correct = chosen === q.answer;
  updateEndlessScore(endlessMode.theme, correct);

  const btns = document.querySelectorAll('.option-btn');
  btns.forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.answer) btn.classList.add('correct');
    else if (i === chosen && !correct) btn.classList.add('wrong');
  });

  showEndlessFeedback(correct, q);
}

function renderEndlessTF(q, area) {
  const row = document.createElement('div');
  row.className = 'tf-row';

  ['True', 'False'].forEach(label => {
    const btn = document.createElement('button');
    btn.className = 'tf-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => submitEndlessTF(q, label === 'True'));
    row.appendChild(btn);
  });

  area.appendChild(row);
}

function submitEndlessTF(q, chosen) {
  if (endlessMode.answered) return;

  endlessMode.answered = true;
  const correct = chosen === q.answer;
  updateEndlessScore(endlessMode.theme, correct);

  const btns = document.querySelectorAll('.tf-btn');
  btns.forEach(btn => {
    btn.disabled = true;
    const val = btn.textContent === 'True';
    if (val === q.answer) btn.classList.add('correct');
    else if (val === chosen && !correct) btn.classList.add('wrong');
  });

  showEndlessFeedback(correct, q);
}

function renderEndlessTA(q, area) {
  const wrap = document.createElement('div');
  wrap.className = 'text-answer-wrap';

  const ta = document.createElement('textarea');
  ta.className = 'text-input text-area';
  ta.placeholder = 'Type your answer…';
  ta.rows = 4;
  ta.id = 'endless-ta-input';

  const btn = document.createElement('button');
  btn.className = 'submit-btn';
  btn.textContent = 'Reveal answer';
  btn.addEventListener('click', () => revealEndlessTA(q));

  wrap.appendChild(ta);
  wrap.appendChild(btn);
  area.appendChild(wrap);
}

function revealEndlessTA(q) {
  if (endlessMode.answered) return;

  endlessMode.answered = true;

  const ta = document.getElementById('endless-ta-input');
  if (ta) ta.disabled = true;

  const btn = document.querySelector('.submit-btn');
  if (btn) btn.disabled = true;

  const fb = document.getElementById('quiz-feedback');
  fb.style.display = 'flex';
  fb.className = 'feedback-row neutral';
  const modelAnswer = domEl('span', {
    className: 'feedback-ref-answer',
    text: `Model answer: ${String(q.answer)}`
  });
  const correctBtn = domEl('button', {
    id: 'endless-self-correct',
    className: 'self-grade-btn correct-grade',
    text: 'I got it right'
  });
  const wrongBtn = domEl('button', {
    id: 'endless-self-wrong',
    className: 'self-grade-btn wrong-grade',
    text: 'I missed it'
  });
  const row = domEl('div', { className: 'self-grade-row' }, [correctBtn, wrongBtn]);

  fb.replaceChildren(modelAnswer, row);

  correctBtn.addEventListener('click', () => {
    updateEndlessScore(endlessMode.theme, true);
    disableSelfGradeButtons();
  });

  wrongBtn.addEventListener('click', () => {
    updateEndlessScore(endlessMode.theme, false);
    disableSelfGradeButtons();
  });
}

function disableSelfGradeButtons() {
  document.querySelectorAll('.self-grade-btn').forEach(btn => {
    btn.disabled = true;
  });

  const streak = getEndlessStreak(endlessMode.theme);
  const best = getEndlessBest(endlessMode.theme);
  document.getElementById('quiz-progress-inline').textContent =
    `${endlessMode.label} Endless Mode    🔥 ${streak}    🏆 ${best}`;
}

function showEndlessFeedback(correct, q) {
  const fb = document.getElementById('quiz-feedback');
  fb.style.display = 'flex';

  const streak = getEndlessStreak(endlessMode.theme);
  const best = getEndlessBest(endlessMode.theme);
  document.getElementById('quiz-progress-inline').textContent =
    `${endlessMode.label} Endless Mode    🔥 ${streak}    🏆 ${best}`;

  if (correct) {
    fb.className = 'feedback-row correct';
    fb.textContent = '✓ Correct!';
    return;
  }

  let correctText = '';
  if (q.subtype === 'multiple_choice') correctText = q.options[q.answer];
  else if (q.subtype === 'true_false') correctText = q.answer ? 'True' : 'False';

  fb.className = 'feedback-row wrong';
  fb.replaceChildren(
    document.createTextNode('✗ Wrong '),
    domEl('span', {
      className: 'feedback-correct-reveal',
      text: `Correct answer: ${correctText}`
    })
  );
}

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
  clearNode(fb);

  // Render answer area
  const area = document.getElementById('quiz-answer-area');
  clearNode(area);

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
    fb.replaceChildren(
      document.createTextNode('✎ Submitted'),
      domEl('span', {
        className: 'feedback-ref-answer',
        text: `Model answer: ${q.answer}`
      })
    );
  } else if (ans.correct) {
    fb.className = 'feedback-row correct';
    fb.textContent = '✓ Correct!';
  } else {
    fb.className = 'feedback-row wrong';
    let correctText = '';
    if (q.subtype === 'multiple_choice') correctText = q.options[q.answer];
    else if (q.subtype === 'true_false') correctText = q.answer ? 'True' : 'False';
    fb.replaceChildren(
      document.createTextNode('✗ Wrong '),
      domEl('span', {
        className: 'feedback-correct-reveal',
        text: `Correct answer: ${correctText}`
      })
    );
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
  if (endlessMode) {
    nextEndlessQuestion();
    return;
  }

  if (quizIndex < quizQs.length - 1) { quizIndex++; renderQuestion(); }
});
document.getElementById('quiz-finish').addEventListener('click', showResults);

/* ══════════════════════════════════════════════════════════════
   RESULTS
   ══════════════════════════════════════════════════════════════ */
function appendLabelValue(parent, label, value) {
  parent.append(
    document.createTextNode(label),
    domEl('span', { text: value })
  );
}

function renderReviewItem(item, q, givenDisplay, correctDisplay, isOpen, isCorrect) {
  const indicatorState = isOpen ? 'open' : isCorrect ? 'ok' : 'bad';
  const indicatorText = isOpen ? '✎' : isCorrect ? '✓' : '✗';

  const qRow = domEl('div', { className: 'review-q' }, [
    domEl('span', { className: `review-indicator ${indicatorState}`, text: indicatorText }),
    domEl('span', { text: q.question })
  ]);

  const answers = domEl('div', { className: 'review-answers' });

  const userRow = domEl('div', {
    className: `review-ans-row ${isOpen ? 'user-open' : isCorrect ? 'user-correct' : 'user-wrong'}`
  });
  appendLabelValue(userRow, 'Your answer: ', givenDisplay);
  answers.appendChild(userRow);

  if (isOpen) {
    const refRow = domEl('div', { className: 'review-ans-row ref-ans' });
    appendLabelValue(refRow, 'Reference: ', correctDisplay);
    answers.appendChild(refRow);
  }

  if (!isOpen && !isCorrect) {
    const correctRow = domEl('div', { className: 'review-ans-row correct-ans' });
    appendLabelValue(correctRow, 'Correct answer: ', correctDisplay);
    answers.appendChild(correctRow);
  }

  item.replaceChildren(qRow, answers);
}

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
  clearNode(reviewList);
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
    renderReviewItem(item, q, givenDisplay, correctDisplay, isOpen, isCorrect);
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
async function initApp() {
  if (window.flashAppMigrationReady) {
    await window.flashAppMigrationReady;
    appState = loadAppState();
  }

  applyTheme(appState.theme || 'dark');
  shuffleOn = appState.shuffle || false;
  document.getElementById('btn-shuffle').classList.toggle('on', shuffleOn);
  discoverMaterial();
}

initApp();

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

/* ── Reports ───────────────────────────────────────────────── */

function getReportContext() {
  let entry = null;
  let entryIndex = null;

  if (endlessMode && endlessMode.current) {
    const cleanEntry = { ...endlessMode.current };
    delete cleanEntry._origIdx;
    delete cleanEntry._sourceFilename;
    delete cleanEntry._sourceLabel;

    return {
      theme: endlessMode.theme,
      filename: endlessMode.current._sourceFilename,
      entryIndex: endlessMode.current._origIdx,
      entry: cleanEntry
    };
  }

  if (currentFile && currentTab === 'flashcards' && fcCards.length > 0) {
    entry = fcCards[fcIndex];
    entryIndex = entry._origIdx;
  }

  if (currentFile && currentTab === 'quiz' && quizQs.length > 0) {
    entry = quizQs[quizIndex];
    entryIndex = entry._origIdx;
  }

  if (!entry) {
    return {
      theme: currentFile ? currentFile.theme : null,
      filename: currentFile ? currentFile.filename : null,
      entryIndex: null,
      entry: null
    };
  }

  const cleanEntry = { ...entry };
  delete cleanEntry._origIdx;

  return {
    theme: currentFile.theme,
    filename: currentFile.filename,
    entryIndex,
    entry: cleanEntry
  };
}

const reportModal = document.getElementById('report-modal');
const reportText = document.getElementById('report-text');
const reportStatus = document.getElementById('report-status');

function openReportModal() {
  reportModal.classList.add('visible');
  reportModal.setAttribute('aria-hidden', 'false');
  reportText.focus();
}

function closeReportModal() {
  reportModal.classList.remove('visible');
  reportModal.setAttribute('aria-hidden', 'true');
  reportText.value = '';
  reportStatus.textContent = '';
  reportStatus.className = '';
}

document.getElementById('btn-report-fab').addEventListener('click', openReportModal);
document.getElementById('btn-report-quiz').addEventListener('click', openReportModal);
document.getElementById('btn-report-close').addEventListener('click', closeReportModal);
document.getElementById('btn-report-cancel').addEventListener('click', closeReportModal);

reportModal.addEventListener('click', e => {
  if (e.target === reportModal) closeReportModal();
});

document.getElementById('report-form').addEventListener('submit', async e => {
  e.preventDefault();

  const report = reportText.value.trim();
  if (!report) return;

  const submitBtn = document.getElementById('btn-report-submit');
  submitBtn.disabled = true;
  reportStatus.textContent = 'Submitting...';
  reportStatus.className = '';

  try {
    const res = await fetch('/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        report,
        struct: getReportContext()
      })
    });

    if (!res.ok) throw new Error('Could not submit report');

    reportStatus.textContent = 'Report submitted.';
    reportStatus.className = 'ok';

    setTimeout(closeReportModal, 600);
  } catch (err) {
    reportStatus.textContent = err.message;
    reportStatus.className = 'error';
  } finally {
    submitBtn.disabled = false;
  }
});

/* ── Dev messages ───────────────────────────────────────────── */

const DEV_MESSAGES_URL = 'dev_messages.json';
const DEV_MESSAGE_LAST_SEEN_KEY = 'dev_msg_last_seen_id';
const DEV_MESSAGE_BACKLOG_LIMIT = 3;
let devMessages = [];

function getDevMessageLastSeenId() {
  const newestId = devMessages.length > 0
    ? Math.max(...devMessages.map(msg => msg.id))
    : 0;

  const oldestAllowedId = Math.max(0, newestId - DEV_MESSAGE_BACKLOG_LIMIT);

  const raw = localStorage.getItem(DEV_MESSAGE_LAST_SEEN_KEY);
  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    return oldestAllowedId;
  }

  return Math.max(parsed, oldestAllowedId);
}

function setDevMessageLastSeenId(value) {
  localStorage.setItem(DEV_MESSAGE_LAST_SEEN_KEY, String(value));
}

async function loadDevMessages() {
  try {
    const res = await fetch(`${DEV_MESSAGES_URL}?v=1`);
    if (!res.ok) throw new Error('Could not load dev messages');

    const data = await res.json();
    const messages = Array.isArray(data.messages) ? data.messages : [];

    devMessages = messages
      .filter(msg =>
        Number.isInteger(msg.id) &&
        msg.id > 0 &&
        typeof msg.title === 'string' &&
        typeof msg.body === 'string'
      )
      .sort((a, b) => a.id - b.id);
  } catch {
    devMessages = [];
  }
}

function getNextDevMessage() {
  const lastSeenId = getDevMessageLastSeenId();
  return devMessages.find(msg => msg.id > lastSeenId) || null;
}

function ensureDevMessageModal() {
  let modal = document.getElementById('dev-message-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'dev-message-modal';
  modal.className = 'modal-backdrop';
  modal.setAttribute('aria-hidden', 'true');

  const closeBtn = domEl('button', { id: 'btn-dev-message-close', title: 'Close', text: '×' });
  const okBtn = domEl('button', { id: 'btn-dev-message-ok', type: 'button', text: 'Got it' });

  const card = domEl('div', {
    className: 'modal-card dev-message-card',
    role: 'dialog',
    ariaModal: 'true',
    ariaLabelledby: 'dev-message-title'
  }, [
    domEl('div', { className: 'modal-head' }, [
      domEl('h2', { id: 'dev-message-title', text: 'Dev Message' }),
      closeBtn
    ]),
    domEl('p', { className: 'dev-message-content', id: 'dev-message-content' }),
    domEl('div', { className: 'modal-actions' }, [okBtn])
  ]);

  modal.appendChild(card);
  document.body.appendChild(modal);

  closeBtn.addEventListener('click', closeDevMessageModal);
  okBtn.addEventListener('click', closeDevMessageModal);

  modal.addEventListener('click', e => {
    if (e.target === modal) closeDevMessageModal();
  });

  return modal;
}

function openDevMessageModal() {
  const msg = getNextDevMessage();
  if (!msg) return;

  const modal = ensureDevMessageModal();

  modal.dataset.messageId = String(msg.id);
  document.getElementById('dev-message-title').textContent = msg.title;
  document.getElementById('dev-message-content').textContent = msg.body;

  modal.classList.add('visible');
  modal.setAttribute('aria-hidden', 'false');
}

function closeDevMessageModal() {
  const modal = document.getElementById('dev-message-modal');
  if (!modal) return;

  const messageId = Number(modal.dataset.messageId || '0');
  if (Number.isFinite(messageId) && messageId > 0) {
    setDevMessageLastSeenId(messageId);
  }

  modal.classList.remove('visible');
  modal.setAttribute('aria-hidden', 'true');

  if (getNextDevMessage()) {
    window.setTimeout(openDevMessageModal, 250);
  }
}

async function maybeShowDevMessage() {
  await loadDevMessages();

  if (!getNextDevMessage()) return;

  window.setTimeout(openDevMessageModal, 350);
}

maybeShowDevMessage();
