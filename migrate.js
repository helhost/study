/* ═══════════════════════════════════════════════════════════════
   FlashApp — Local Storage Migration / Cleanup
   ═══════════════════════════════════════════════════════════════ */

const FLASHAPP_STATE_KEY = 'flashapp_state';

async function discoverMaterialForMigration() {
  const rootRes = await fetch('material/');
  if (!rootRes.ok) {
    throw new Error('Could not read material/ directory');
  }

  const rootEntries = await rootRes.json();
  const files = [];

  for (const entry of rootEntries) {
    if (entry.type !== 'directory') continue;

    const folder = entry.name.replace(/\/$/, '');
    const dirRes = await fetch(`material/${folder}/`);
    if (!dirRes.ok) continue;

    const dirEntries = await dirRes.json();

    for (const fileEntry of dirEntries) {
      if (
        fileEntry.type === 'file' &&
        fileEntry.name.endsWith('.json') &&
        !fileEntry.name.startsWith('_')
      ) {
        files.push({
          theme: folder,
          filename: fileEntry.name,
          path: `material/${folder}/${fileEntry.name}`
        });
      }
    }
  }

  return files;
}

function countCountableQuizEntries(entries) {
  if (!Array.isArray(entries)) return 0;

  return entries.filter(e =>
    e.type === 'quiz' &&
    (e.subtype === 'multiple_choice' || e.subtype === 'true_false')
  ).length;
}

function normalizeFileStateForEntries(fileState, entries) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const actualTotal = safeEntries.length;
  const countableQuizTotal = countCountableQuizEntries(safeEntries);

  fileState.total = actualTotal;

  if (!Array.isArray(fileState.seen)) {
    fileState.seen = [];
  }

  fileState.seen = fileState.seen
    .filter(idx => Number.isInteger(idx))
    .filter(idx => idx >= 0 && idx < actualTotal);

  fileState.seen = [...new Set(fileState.seen)];

  if (fileState.lastTotal !== undefined) {
    fileState.lastTotal = Math.min(fileState.lastTotal, countableQuizTotal);
  }

  if (fileState.lastScore !== undefined) {
    fileState.lastScore = Math.min(fileState.lastScore, countableQuizTotal);

    if (fileState.lastTotal !== undefined) {
      fileState.lastScore = Math.min(fileState.lastScore, fileState.lastTotal);
    }
  }

  if (countableQuizTotal === 0 || fileState.lastTotal === 0) {
    delete fileState.lastScore;
    delete fileState.lastTotal;
    delete fileState.lastQuizDate;
  }
}

function migrateDevMessageState() {
  const legacyKey = 'dev_msg_idx';
  const lastSeenKey = 'dev_msg_last_seen_id';

  if (localStorage.getItem(lastSeenKey) !== null) {
    return;
  }

  const raw = localStorage.getItem(legacyKey);
  const legacyIdx = Number(raw);

  if (!Number.isFinite(legacyIdx) || legacyIdx <= 0) {
    localStorage.setItem(lastSeenKey, '0');
    return;
  }

  /*
    Legacy behavior used dev_msg_idx = 2 after the original report-button
    notice was acknowledged. The new system uses stable message IDs, so
    that legacy value should mean message ID 1 has been seen.

    This deliberately allows message ID 2, Endless Mode, to appear even
    for users who already had dev_msg_idx = 2 from the old implementation.
  */
  localStorage.setItem(lastSeenKey, '1');
}

async function migrateFlashAppState() {
  migrateDevMessageState();

  let state;

  try {
    const raw = localStorage.getItem(FLASHAPP_STATE_KEY);
    if (!raw) return;

    state = JSON.parse(raw);
  } catch {
    return;
  }

  if (!state || typeof state !== 'object' || !state.files) {
    return;
  }

  let materialFiles;

  try {
    materialFiles = await discoverMaterialForMigration();
  } catch {
    return;
  }

  let changed = false;

  for (const materialFile of materialFiles) {
    const key = `${materialFile.theme}::${materialFile.filename}`;
    const fileState = state.files[key];

    if (!fileState || typeof fileState !== 'object') {
      continue;
    }

    let data;

    try {
      const res = await fetch(materialFile.path);
      if (!res.ok) continue;
      data = await res.json();
    } catch {
      continue;
    }

    const before = JSON.stringify(fileState);

    normalizeFileStateForEntries(fileState, data.entries);

    const after = JSON.stringify(fileState);

    if (before !== after) {
      changed = true;
    }
  }

  if (changed) {
    localStorage.setItem(FLASHAPP_STATE_KEY, JSON.stringify(state));
  }
}

window.flashAppMigrationReady = migrateFlashAppState();
