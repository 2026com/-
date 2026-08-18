/* ================================================================
 * 个人成长体系 · 日常任务 - 纯原生 JS 实现
 * 功能：习惯打卡、临时事项、番茄钟、数据备份
 * ================================================================ */

// ===== 常量定义 =====
const STORAGE_KEYS = {
  HABITS: 'growth_app_v1_habits',
  TEMP_TASKS: 'growth_app_v1_temp_tasks',
  CHECKINS: 'growth_app_v1_checkins',
  TIMER_RECORDS: 'growth_app_v1_timer_records',
  SETTINGS: 'growth_app_v1_settings',
  DATA_VERSION: 'growth_app_v1_data_version',
};

const DATA_VERSION = '2.0-native-20260816';

const HABIT_DIFFICULTY = [
  { k: 'easy', label: '简单', badge: '🟢 简单' },
  { k: 'normal', label: '普通', badge: '🔵 普通' },
  { k: 'hard', label: '困难', badge: '🔴 困难' },
];

const EMOJI_POOL = ['📌','💡','🎯','📚','🏃','🧘','📝','💪','🎨','🎵','🛒','🧹','💻','🌱','☀️','💧','🍎','📧','📞','🪥','📖','✍️','🧠','🔥','🌟','⚡','🎵','🛌','🧴','🚰'];

const GRID_SIZE_DAILY = 9;
const GRID_SIZE_TEMP = 5;

// ===== 状态管理 =====
const state = {
  activeTab: 'daily',
  view: 'daily',
  habits: [],
  tempTasks: [],
  checkins: {},
  timerRecords: [],
  settings: { pomodoroMinutes: 25 },
  modal: null,
  filter: 'all',
};

let _timerData = null;
let _timerHandle = null;

// ===== 存储工具 =====
const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  },
  remove(key) { try { localStorage.removeItem(key); } catch (e) {} },
  clearAll() { Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k)); },
};

function loadAllData() {
  const savedVersion = storage.get(STORAGE_KEYS.DATA_VERSION, '');
  if (savedVersion !== DATA_VERSION) {
    storage.clearAll();
    storage.set(STORAGE_KEYS.DATA_VERSION, DATA_VERSION);
  }
  state.habits = storage.get(STORAGE_KEYS.HABITS, []);
  state.tempTasks = storage.get(STORAGE_KEYS.TEMP_TASKS, []);
  state.checkins = storage.get(STORAGE_KEYS.CHECKINS, {});
  state.timerRecords = storage.get(STORAGE_KEYS.TIMER_RECORDS, []);
  state.settings = Object.assign({ pomodoroMinutes: 25 }, storage.get(STORAGE_KEYS.SETTINGS, {}));
}

function saveAllData() {
  storage.set(STORAGE_KEYS.HABITS, state.habits);
  storage.set(STORAGE_KEYS.TEMP_TASKS, state.tempTasks);
  storage.set(STORAGE_KEYS.CHECKINS, state.checkins);
  storage.set(STORAGE_KEYS.TIMER_RECORDS, state.timerRecords);
  storage.set(STORAGE_KEYS.SETTINGS, state.settings);
}

// ===== 工具函数 =====
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function txt(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function html(tag, cls, htmlContent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (htmlContent !== undefined) e.innerHTML = htmlContent;
  return e;
}

function showToast(msg) {
  let t = document.getElementById('__toast');
  if (!t) {
    t = txt('div', 'toast');
    t.id = '__toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.remove('hide');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hide'), 2000);
}

function getHabitTodayKey(habitId) { return todayStr() + '_' + habitId; }
function isHabitDoneToday(habitId) { return !!state.checkins[getHabitTodayKey(habitId)]; }

// ===== 音效系统 =====
let _audioCtx = null;
function getAudioContext() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  return _audioCtx;
}

function beep(freq, dur) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.25;
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch (e) {}
}

function playPomodoroDone() {
  beep(660, 0.15);
  setTimeout(() => beep(880, 0.15), 180);
  setTimeout(() => beep(1100, 0.4), 360);
}

// ===== 备份/恢复 =====
function doExport() {
  const snap = {};
  [STORAGE_KEYS.HABITS, STORAGE_KEYS.TEMP_TASKS, STORAGE_KEYS.CHECKINS, STORAGE_KEYS.TIMER_RECORDS, STORAGE_KEYS.SETTINGS].forEach(k => {
    const v = localStorage.getItem(k);
    if (v) snap[k] = JSON.parse(v);
  });
  const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'growth_backup_' + todayStr() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ 已导出备份');
}

function doImport(file) {
  const r = new FileReader();
  r.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.habits !== undefined) state.habits = data.habits;
      if (data.tempTasks !== undefined) state.tempTasks = data.tempTasks;
      if (data.checkins !== undefined) state.checkins = data.checkins;
      if (data.timerRecords !== undefined) state.timerRecords = data.timerRecords;
      if (data.settings !== undefined) state.settings = data.settings;
      saveAllData();
      showToast('✅ 导入成功');
      setTimeout(() => render(), 500);
    } catch (e) { showToast('❌ 文件格式错误'); }
  };
  r.readAsText(file);
}

function doClearAll() {
  if (!confirm('确定要清空所有数据吗？此操作不可恢复！')) return;
  storage.clearAll();
  state.habits = [];
  state.tempTasks = [];
  state.checkins = {};
  state.timerRecords = [];
  state.settings = { pomodoroMinutes: 25 };
  storage.set(STORAGE_KEYS.DATA_VERSION, DATA_VERSION);
  showToast('✅ 已清空');
  setTimeout(() => render(), 500);
}

// ===== 主渲染 =====
function render() {
  const root = document.getElementById('root');
  root.innerHTML = '';

  const app = el('div', 'app');

  // Header
  const header = el('div', 'header');
  const hInfo = el('div');
  hInfo.appendChild(txt('div', 'header-title', '个人成长体系'));
  hInfo.appendChild(txt('div', 'header-date', todayStr() + ' · 每日一省'));
  header.appendChild(hInfo);
  const settingsBtn = el('button', 'header-btn', '⚙️');
  settingsBtn.onclick = () => { state.modal = { type: 'settings' }; renderModal(); };
  header.appendChild(settingsBtn);
  app.appendChild(header);

  // Content
  const content = el('div', 'content no-scrollbar');
  if (state.activeTab === 'daily') content.appendChild(renderDailyTab());
  else if (state.activeTab === 'goals') content.appendChild(renderTempTab());
  else content.appendChild(renderReviewTab());
  app.appendChild(content);

  // FAB for pomodoro
  const fab = el('button', 'fab', '🍅');
  fab.onclick = () => { state.modal = { type: 'pomodoro' }; renderModal(); };
  app.appendChild(fab);

  // Bottom Nav
  const nav = el('div', 'bottom-nav');
  const tabs = [
    { id: 'daily', name: '日常习惯', icon: '📅' },
    { id: 'goals', name: '临时事项', icon: '📝' },
    { id: 'review', name: '历史复盘', icon: '📊' },
  ];
  tabs.forEach(t => {
    const btn = el('button', 'nav-item' + (state.activeTab === t.id ? ' active' : ''));
    btn.appendChild(txt('div', 'icon', t.icon));
    btn.appendChild(txt('div', 'label', t.name));
    btn.onclick = () => { state.activeTab = t.id; render(); };
    nav.appendChild(btn);
  });
  app.appendChild(nav);

  root.appendChild(app);
  renderModal();
}

// ===== 日常习惯 Tab =====
function renderDailyTab() {
  const box = el('div', 'flex flex-col gap-3');
  const today = todayStr();
  const todayKey = today + '_';
  const doneCount = state.habits.filter(h => state.checkins[todayKey + h.id]).length;
  const totalCount = state.habits.length;
  const pct = totalCount === 0 ? 0 : Math.round(doneCount / totalCount * 100);

  // Progress card
  const prog = el('div', 'card progress-card');
  const progHeader = el('div', 'progress-header');
  progHeader.appendChild(el('div'));
  const progLbl = el('div');
  progLbl.appendChild(txt('div', 'progress-label', '今日进度'));
  progHeader.appendChild(progLbl);
  progHeader.appendChild(txt('div', 'progress-value', doneCount + ' / ' + totalCount));
  progHeader.appendChild(el('div'));
  const progLbl2 = el('div');
  progLbl2.appendChild(txt('div', 'progress-label', '完成率'));
  progHeader.appendChild(progLbl2);
  progHeader.appendChild(txt('div', 'progress-value indigo', pct + '%'));
  prog.appendChild(progHeader);
  const bar = el('div', 'progress-bar');
  const fill = el('div', 'progress-fill');
  fill.style.width = pct + '%';
  bar.appendChild(fill);
  prog.appendChild(bar);
  box.appendChild(prog);

  // View toggle
  const viewRow = el('div', 'flex items-center justify-between');
  const viewToggle = el('div', 'filter-row');
  ['daily', 'temp'].forEach(v => {
    const map = { daily: '日常打卡', temp: '临时打卡' };
    const b = el('button', 'filter-btn' + (state.view === v ? ' active' : ''), map[v]);
    b.onclick = () => { state.view = v; render(); };
    viewToggle.appendChild(b);
  });
  viewRow.appendChild(viewToggle);
  box.appendChild(viewRow);

  if (state.view === 'daily') {
    // Action row
    const actRow = el('div', 'flex items-center gap-2 mb-3');
    const pomoBtn = el('button', 'btn btn-sm btn-ghost', '🍅 番茄计时');
    pomoBtn.onclick = () => {
      if (state.habits.length === 0) { showToast('请先新增一个习惯'); return; }
      state.modal = { type: 'pomodoro' }; renderModal();
    };
    actRow.appendChild(pomoBtn);
    const batchBtn = el('button', 'btn btn-sm btn-ghost', '✅ 批量打卡');
    batchBtn.onclick = () => {
      if (state.habits.length === 0) { showToast('暂无习惯'); return; }
      state.modal = { type: 'batchCheckin' }; renderModal();
    };
    actRow.appendChild(batchBtn);
    const spacer = el('div', 'flex-1');
    actRow.appendChild(spacer);
    actRow.appendChild(txt('div', 'text-xs text-slate-400', state.habits.length + '/' + GRID_SIZE_DAILY + ' · 日常习惯'));
    box.appendChild(actRow);

    // Grid
    const grid = el('div', 'habit-grid');
    for (let i = 0; i < GRID_SIZE_DAILY; i++) {
      const habit = state.habits[i];
      grid.appendChild(renderHabitCell(habit, i));
    }
    box.appendChild(grid);
  } else {
    // Temp view
    const infoRow = el('div', 'flex items-center justify-between mb-3');
    infoRow.appendChild(txt('div', 'text-xs text-slate-500', '今日临时事项 · 一排 5 格'));
    infoRow.appendChild(txt('div', 'text-xs text-slate-400', state.tempTasks.length + '/' + GRID_SIZE_TEMP));
    box.appendChild(infoRow);

    const grid = el('div', 'temp-grid');
    for (let i = 0; i < GRID_SIZE_TEMP; i++) {
      const task = state.tempTasks[i];
      grid.appendChild(renderTempCell(task, i));
    }
    box.appendChild(grid);

    box.appendChild(txt('div', 'text-center text-xs text-slate-400 mt-16', '· 保持空白，聚焦当下 ·'));
  }

  return box;
}

function renderHabitCell(habit, index) {
  if (!habit) {
    const cell = el('div', 'habit-card empty');
    cell.appendChild(txt('div', 'plus', '＋'));
    cell.appendChild(txt('div', 'hint', '空白卡片<br/>点击直接新建'));
    cell.onclick = () => { state.modal = { type: 'habitForm', mode: 'add' }; renderModal(); };
    return cell;
  }

  const checked = isHabitDoneToday(habit.id);
  const cell = el('div', 'habit-card filled' + (checked ? ' done' : ''));

  // Checkbox
  const cb = el('div', 'checkbox' + (checked ? ' checked' : ''));
  cb.textContent = checked ? '✓' : '';
  cb.onclick = (e) => {
    e.stopPropagation();
    toggleCheckin(habit.id);
  };
  cell.appendChild(cb);

  // Actions
  const acts = el('div', 'card-actions');
  const editBtn = el('button', 'action-btn', '✏️');
  editBtn.title = '编辑';
  editBtn.onclick = (e) => {
    e.stopPropagation();
    state.modal = { type: 'habitForm', mode: 'edit', habit };
    renderModal();
  };
  const delBtn = el('button', 'action-btn delete', '🗑️');
  delBtn.title = '删除';
  delBtn.onclick = (e) => {
    e.stopPropagation();
    confirmModal('🗑️ 删除习惯', '确认删除「' + habit.title + '」吗？\n该习惯所有历史打卡记录将一并清除。', () => deleteHabit(habit.id));
  };
  acts.appendChild(editBtn);
  acts.appendChild(delBtn);
  cell.appendChild(acts);

  // Title
  cell.appendChild(txt('div', 'habit-title' + (checked ? ' done' : ''), habit.title));

  // Meta
  const meta = el('div', 'habit-meta');
  const d = HABIT_DIFFICULTY.find(x => x.k === (habit.difficulty || 'normal')) || HABIT_DIFFICULTY[1];
  let metaText = '';
  if (habit.estMinutes) metaText += habit.estMinutes + ' 分钟';
  if (habit.reminder) metaText += (metaText ? ' · ' : '') + '🔔 ' + habit.reminder;
  meta.appendChild(txt('div', 'habit-time', metaText || ''));
  meta.appendChild(txt('div', 'habit-diff', d.badge));
  cell.appendChild(meta);

  cell.onclick = () => {
    state.modal = { type: 'habitForm', mode: 'edit', habit };
    renderModal();
  };

  return cell;
}

function renderTempCell(task, index) {
  if (!task) {
    const cell = el('div', 'temp-card empty');
    cell.appendChild(txt('div', 'plus', '＋'));
    cell.appendChild(txt('div', 'hint', '空位 · 点击新建'));
    cell.onclick = () => { state.modal = { type: 'tempForm', mode: 'add' }; renderModal(); };
    return cell;
  }

  const done = !!task.done;
  const cell = el('div', 'temp-card filled' + (done ? ' done' : ''));

  const cb = el('div', 'temp-checkbox' + (done ? ' checked' : ''));
  cb.textContent = done ? '✓' : '';
  cb.onclick = (e) => {
    e.stopPropagation();
    toggleTempDone(task.id);
  };
  cell.appendChild(cb);

  const acts = el('div', 'card-actions');
  const editBtn = el('button', 'action-btn', '✏️');
  editBtn.title = '编辑';
  editBtn.onclick = (e) => {
    e.stopPropagation();
    state.modal = { type: 'tempForm', mode: 'edit', task };
    renderModal();
  };
  const delBtn = el('button', 'action-btn delete', '🗑️');
  delBtn.title = '删除';
  delBtn.onclick = (e) => {
    e.stopPropagation();
    confirmModal('🗑️ 删除临时任务', '确认删除「' + task.title + '」吗？', () => deleteTemp(task.id));
  };
  acts.appendChild(editBtn);
  acts.appendChild(delBtn);
  cell.appendChild(acts);

  cell.appendChild(txt('div', 'temp-title', task.title));

  const meta = el('div', 'temp-meta');
  meta.appendChild(txt('div', 'temp-time', task.reminderTime || '全天'));
  if (task.reminder !== false) meta.appendChild(txt('div', 'temp-bell', '🔔'));
  cell.appendChild(meta);

  cell.onclick = () => {
    state.modal = { type: 'tempForm', mode: 'edit', task };
    renderModal();
  };

  return cell;
}

// ===== 临时事项 Tab =====
function renderTempTab() {
  return renderDailyTab();
}

// ===== 历史复盘 Tab =====
function renderReviewTab() {
  const box = el('div', 'flex flex-col gap-3');
  const today = todayStr();

  // Summary stats
  const doneHabits = state.habits.filter(h => isHabitDoneToday(h.id));
  const totalToday = state.habits.length + state.tempTasks.length;
  const doneToday = doneHabits.length + state.tempTasks.filter(t => t.done).length;
  const totalFocusMin = state.timerRecords.reduce((s, r) => s + (r.minutes || 0), 0);

  const sumRow = el('div', 'review-summary');
  sumRow.appendChild(el('div', 'review-card')).appendChild(txt('div', 'review-value indigo', String(doneToday)));
  sumRow.lastChild.appendChild(txt('div', 'review-label', '今日完成'));
  sumRow.appendChild(el('div', 'review-card')).appendChild(txt('div', 'review-value emerald', String(state.habits.length)));
  sumRow.lastChild.appendChild(txt('div', 'review-label', '总习惯数'));
  sumRow.appendChild(el('div', 'review-card')).appendChild(txt('div', 'review-value rose', String(totalFocusMin)));
  sumRow.lastChild.appendChild(txt('div', 'review-label', '专注分钟'));
  box.appendChild(sumRow);

  // Timer records
  box.appendChild(txt('div', 'card'));
  const card = box.lastChild;
  card.appendChild(txt('div', 'data-section-title', '⏱ 番茄钟记录'));
  if (state.timerRecords.length === 0) {
    card.appendChild(txt('div', 'text-center text-sm text-slate-400 py-4', '暂无计时记录'));
  } else {
    const list = el('div', 'review-list');
    state.timerRecords.slice(-10).reverse().forEach(r => {
      const item = el('div', 'review-item');
      item.appendChild(txt('div', 'review-item-icon', '🍅'));
      const info = el('div', 'review-item-info');
      info.appendChild(txt('div', 'review-item-title', r.title || '自由专注'));
      const d = new Date(r.createdAt || Date.now());
      info.appendChild(txt('div', 'review-item-meta',
        d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5) + ' · ' + (r.minutes || 25) + ' 分钟'));
      item.appendChild(info);
      item.appendChild(txt('div', 'review-item-status done', '✓'));
      list.appendChild(item);
    });
    card.appendChild(list);
  }
  box.appendChild(card);

  // Habit list
  box.appendChild(txt('div', 'card'));
  const card2 = box.lastChild;
  card2.appendChild(txt('div', 'data-section-title', '📋 习惯列表'));
  if (state.habits.length === 0) {
    card2.appendChild(txt('div', 'text-center text-sm text-slate-400 py-4', '暂无习惯'));
  } else {
    const list2 = el('div', 'review-list');
    state.habits.forEach(h => {
      const done = isHabitDoneToday(h.id);
      const item = el('div', 'review-item');
      item.appendChild(txt('div', 'review-item-icon', done ? '✅' : '⭕'));
      const info = el('div', 'review-item-info');
      info.appendChild(txt('div', 'review-item-title', h.title));
      const d = HABIT_DIFFICULTY.find(x => x.k === (h.difficulty || 'normal')) || HABIT_DIFFICULTY[1];
      info.appendChild(txt('div', 'review-item-meta',
        d.badge + (h.estMinutes ? ' · ' + h.estMinutes + '分钟' : '') + (h.reminder ? ' · 🔔' + h.reminder : '')));
      item.appendChild(info);
      item.appendChild(txt('div', 'review-item-status ' + (done ? 'done' : 'progress'), done ? '已完成' : '待完成'));
      list2.appendChild(item);
    });
    card2.appendChild(list2);
  }
  box.appendChild(card2);

  return box;
}

// ===== 业务操作 =====
function toggleCheckin(habitId) {
  const key = getHabitTodayKey(habitId);
  if (state.checkins[key]) delete state.checkins[key];
  else state.checkins[key] = { date: todayStr(), habitId, time: Date.now() };
  saveAllData();
  render();
}

function deleteHabit(habitId) {
  state.habits = state.habits.filter(h => h.id !== habitId);
  const suffix = '_' + habitId;
  Object.keys(state.checkins).forEach(k => { if (k.endsWith(suffix)) delete state.checkins[k]; });
  saveAllData();
  render();
  showToast('✅ 已删除');
}

function toggleTempDone(taskId) {
  state.tempTasks = state.tempTasks.map(t => t.id === taskId ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : undefined } : t);
  saveAllData();
  render();
}

function deleteTemp(taskId) {
  state.tempTasks = state.tempTasks.filter(t => t.id !== taskId);
  saveAllData();
  render();
  showToast('✅ 已删除');
}

function addHabit(data) {
  if (state.habits.length >= GRID_SIZE_DAILY) {
    showToast('日常习惯最多 ' + GRID_SIZE_DAILY + ' 个');
    return;
  }
  state.habits.push({ id: uid('hab'), ...data, createdAt: Date.now() });
  saveAllData();
  render();
  showToast('✅ 已新增：' + data.title);
}

function updateHabit(id, data) {
  state.habits = state.habits.map(h => h.id === id ? { ...h, ...data } : h);
  saveAllData();
  render();
  showToast('✅ 已保存');
}

function addTemp(data) {
  if (state.tempTasks.length >= GRID_SIZE_TEMP) {
    showToast('临时任务最多 ' + GRID_SIZE_TEMP + ' 条');
    return;
  }
  state.tempTasks.push({ id: uid('tmp'), reminder: true, done: false, ...data, createdAt: Date.now() });
  saveAllData();
  render();
  showToast('✅ 已新增：' + data.title);
}

function updateTemp(id, data) {
  state.tempTasks = state.tempTasks.map(t => t.id === id ? { ...t, ...data } : t);
  saveAllData();
  render();
  showToast('✅ 已保存');
}

function batchCheckin(habitIds) {
  const today = todayStr();
  habitIds.forEach(id => {
    const key = today + '_' + id;
    state.checkins[key] = { date: today, habitId: id, time: Date.now() };
  });
  saveAllData();
  render();
  showToast('✅ 已批量打卡 ' + habitIds.length + ' 个');
}

// ===== 弹窗系统 =====
function confirmModal(title, msg, onOk) {
  state.modal = { type: 'confirm', title, msg, onOk };
}

function renderModal() {
  const old = document.getElementById('__modal');
  if (old) old.remove();
  const m = state.modal;
  if (!m) return;

  const overlay = el('div', 'modal-overlay');
  overlay.id = '__modal';
  overlay.onclick = () => {
    if (m.type === 'confirm' || m.type === 'habitForm' || m.type === 'tempForm' || m.type === 'batchCheckin' || m.type === 'settings' || m.type === 'pomodoro') {
      state.modal = null;
      renderModal();
    }
  };

  if (m.type === 'confirm') {
    overlay.appendChild(buildConfirmModal(m));
  } else if (m.type === 'habitForm') {
    overlay.appendChild(buildHabitFormModal(m));
  } else if (m.type === 'tempForm') {
    overlay.appendChild(buildTempFormModal(m));
  } else if (m.type === 'batchCheckin') {
    overlay.appendChild(buildBatchModal());
  } else if (m.type === 'pomodoro') {
    overlay.appendChild(buildPomodoroModal(m));
    if (_timerData && _timerData.running) startTimerLoop();
  } else if (m.type === 'settings') {
    overlay.appendChild(buildSettingsModal());
  }

  document.body.appendChild(overlay);
}

function closeModal() {
  state.modal = null;
  renderModal();
}

function buildModalShell(title, body, footer) {
  const box = el('div', 'modal-box');
  const header = el('div', 'modal-header');
  header.appendChild(txt('div', 'modal-title', title));
  const closeBtn = el('button', 'modal-close', '×');
  closeBtn.onclick = closeModal;
  header.appendChild(closeBtn);
  box.appendChild(header);
  const bodyEl = el('div', 'modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else bodyEl.appendChild(body);
  box.appendChild(bodyEl);
  if (footer) {
    const footerEl = el('div', 'modal-footer');
    if (typeof footer === 'string') footerEl.innerHTML = footer;
    else footerEl.appendChild(footer);
    box.appendChild(footerEl);
  }
  return box;
}

function buildConfirmModal(m) {
  const body = el('div');
  body.style.whiteSpace = 'pre-wrap';
  body.style.lineHeight = '1.625';
  body.style.fontSize = '14px';
  body.style.color = '#334155';
  body.textContent = m.msg;

  const footer = el('div', 'flex gap-2 justify-end');
  const cancelBtn = el('button', 'btn btn-secondary', '取消');
  cancelBtn.onclick = closeModal;
  const okBtn = el('button', 'btn btn-danger', '确定');
  okBtn.onclick = () => { m.onOk && m.onOk(); closeModal(); };
  footer.appendChild(cancelBtn);
  footer.appendChild(okBtn);

  return buildModalShell(m.title, body, footer);
}

function buildHabitFormModal(m) {
  const isEdit = m.mode === 'edit';
  const habit = m.habit || {};
  const data = {
    title: habit.title || '',
    reminder: habit.reminder || '',
    estMinutes: habit.estMinutes || 30,
    difficulty: habit.difficulty || 'normal',
  };

  const body = el('div', 'flex flex-col gap-4');

  // Title
  const f1 = el('div');
  f1.appendChild(txt('div', 'form-label', '任务名称 *'));
  const in1 = el('input', 'form-input');
  in1.placeholder = '例如：练琴 / 阅读 / 跑步…';
  in1.maxLength = 20;
  in1.value = data.title;
  in1.oninput = e => data.title = e.target.value;
  f1.appendChild(in1);
  body.appendChild(f1);

  // Row: reminder + minutes
  const row = el('div', 'form-row');
  const f2 = el('div');
  f2.appendChild(txt('div', 'form-label', '提醒时间'));
  const in2 = el('input', 'form-input');
  in2.type = 'time';
  in2.value = data.reminder;
  in2.oninput = e => data.reminder = e.target.value;
  f2.appendChild(in2);
  row.appendChild(f2);
  const f3 = el('div');
  f3.appendChild(txt('div', 'form-label', '预估耗时（分钟）'));
  const in3 = el('input', 'form-input');
  in3.type = 'number';
  in3.min = '1';
  in3.max = '480';
  in3.value = data.estMinutes;
  in3.oninput = e => data.estMinutes = e.target.value;
  f3.appendChild(in3);
  row.appendChild(f3);
  body.appendChild(row);

  // Difficulty
  const f4 = el('div');
  f4.appendChild(txt('div', 'form-label', '难度'));
  const diffRow = el('div', 'diff-row');
  HABIT_DIFFICULTY.forEach(d => {
    const b = el('button', 'diff-btn' + (d.k === data.difficulty ? ' active' : ''), d.badge);
    b.onclick = () => { data.difficulty = d.k; renderModal(); };
    diffRow.appendChild(b);
  });
  f4.appendChild(diffRow);
  body.appendChild(f4);

  // Footer
  const footer = el('div', 'flex gap-2 justify-end');
  const cancelBtn = el('button', 'btn btn-secondary', '取消');
  cancelBtn.onclick = closeModal;
  const okBtn = el('button', 'btn btn-primary', isEdit ? '保存修改' : '确认提交');
  okBtn.onclick = () => {
    if (!data.title.trim()) { showToast('请输入任务名称'); return; }
    const mins = Number(data.estMinutes);
    if (isNaN(mins) || mins <= 0 || mins > 480) { showToast('预估耗时需为 1-480 分钟'); return; }
    const payload = {
      title: data.title.trim(),
      reminder: data.reminder || '',
      estMinutes: mins,
      difficulty: data.difficulty,
    };
    if (isEdit) updateHabit(m.habit.id, payload);
    else addHabit(payload);
    closeModal();
  };
  footer.appendChild(cancelBtn);
  footer.appendChild(okBtn);

  return buildModalShell(isEdit ? '✏️ 编辑习惯' : '➕ 新增习惯', body, footer);
}

function buildTempFormModal(m) {
  const isEdit = m.mode === 'edit';
  const task = m.task || {};
  const data = {
    title: task.title || '',
    reminderTime: task.reminderTime || (new Date().getHours()) + ':00',
    reminder: task.reminder !== false,
  };

  const body = el('div', 'flex flex-col gap-4');

  const f1 = el('div');
  f1.appendChild(txt('div', 'form-label', '任务名称 *'));
  const in1 = el('input', 'form-input');
  in1.placeholder = '例如：取快递 / 买资料 / 联系老师…';
  in1.maxLength = 20;
  in1.value = data.title;
  in1.oninput = e => data.title = e.target.value;
  f1.appendChild(in1);
  body.appendChild(f1);

  const f2 = el('div');
  f2.appendChild(txt('div', 'form-label', '提醒时间 *'));
  const in2 = el('input', 'form-input');
  in2.type = 'time';
  in2.value = data.reminderTime;
  in2.oninput = e => data.reminderTime = e.target.value;
  f2.appendChild(in2);
  body.appendChild(f2);

  const f3 = el('div');
  const cb = el('input', 'form-input');
  cb.type = 'checkbox';
  cb.style.width = '16px';
  cb.style.height = '16px';
  cb.style.accentColor = '#4f46e5';
  cb.style.marginRight = '8px';
  cb.checked = data.reminder;
  cb.onchange = e => data.reminder = e.target.checked;
  const label = el('label', 'flex items-center gap-2 text-sm text-slate-700 cursor-pointer');
  label.appendChild(cb);
  label.appendChild(txt('span', '', '显示右下角🔔提醒图标'));
  f3.appendChild(label);
  body.appendChild(f3);

  const footer = el('div', 'flex gap-2 justify-end');
  const cancelBtn = el('button', 'btn btn-secondary', '取消');
  cancelBtn.onclick = closeModal;
  const okBtn = el('button', 'btn btn-primary', isEdit ? '保存修改' : '确认提交');
  okBtn.onclick = () => {
    if (!data.title.trim()) { showToast('请输入任务名称'); return; }
    if (!data.reminderTime) { showToast('请选择提醒时间'); return; }
    const payload = {
      title: data.title.trim(),
      reminderTime: data.reminderTime,
      reminder: !!data.reminder,
    };
    if (isEdit) updateTemp(m.task.id, payload);
    else addTemp(payload);
    closeModal();
  };
  footer.appendChild(cancelBtn);
  footer.appendChild(okBtn);

  return buildModalShell(isEdit ? '✏️ 编辑临时任务' : '➕ 新增临时任务', body, footer);
}

function buildBatchModal() {
  const today = todayStr();
  const selected = new Set(state.habits.filter(h => !state.checkins[today + '_' + h.id]).map(h => h.id));

  const body = el('div', 'batch-list');
  state.habits.forEach(h => {
    const done = !!state.checkins[today + '_' + h.id];
    const isSel = selected.has(h.id) || done;
    const item = el('label', 'batch-item' + (done ? ' done' : ''));
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = isSel;
    cb.disabled = done;
    cb.onchange = () => {
      if (done) return;
      if (cb.checked) selected.add(h.id); else selected.delete(h.id);
    };
    item.appendChild(cb);
    const info = el('div', 'batch-item-info');
    info.appendChild(txt('div', 'batch-item-title', h.title));
    const d = HABIT_DIFFICULTY.find(x => x.k === (h.difficulty || 'normal')) || HABIT_DIFFICULTY[1];
    let meta = '';
    if (h.estMinutes) meta += h.estMinutes + ' 分钟';
    if (h.reminder) meta += (meta ? ' · ' : '') + '🔔 ' + h.reminder;
    if (done) meta += (meta ? ' · ' : '') + '今日已完成';
    info.appendChild(txt('div', 'batch-item-meta', meta));
    item.appendChild(info);
    body.appendChild(item);
  });

  if (state.habits.length === 0) {
    body.appendChild(txt('div', 'text-center text-sm text-slate-400 py-6', '暂无习惯'));
  }

  const footer = el('div', 'flex gap-2 justify-end');
  const cancelBtn = el('button', 'btn btn-secondary', '取消');
  cancelBtn.onclick = closeModal;
  const allBtn = el('button', 'btn btn-sm', '一键全部打卡');
  allBtn.style.background = '#d1fae5';
  allBtn.style.color = '#047857';
  allBtn.onclick = () => {
    const allIds = state.habits.map(h => h.id);
    batchCheckin(allIds);
    closeModal();
  };
  const okBtn = el('button', 'btn btn-primary', '确认勾选打卡');
  okBtn.onclick = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) { showToast('请至少勾选一个'); return; }
    batchCheckin(ids);
    closeModal();
  };
  footer.appendChild(cancelBtn);
  footer.appendChild(allBtn);
  footer.appendChild(okBtn);

  return buildModalShell('✅ 批量打卡 · ' + state.habits.length + ' 个习惯', body, footer);
}

function buildPomodoroModal(m) {
  // If timer already running, show the timer display
  if (_timerData) {
    return buildTimerDisplay();
  }

  const body = el('div', 'timer-setup');

  body.appendChild(html('div', '', '<label>选择要专注的习惯</label>'));
  const sel = el('select');
  sel.style.width = '100%';
  sel.style.padding = '10px 12px';
  sel.style.borderRadius = '10px';
  sel.style.border = '1px solid #e2e8f0';
  sel.style.background = '#f8fafc';
  sel.style.fontSize = '14px';
  sel.style.fontFamily = 'inherit';
  state.habits.forEach(h => {
    const o = el('option', h.title);
    o.value = h.id;
    sel.appendChild(o);
  });
  if (state.habits.length === 0) {
    const o = el('option', '自由专注');
    o.value = '';
    sel.appendChild(o);
  }
  body.appendChild(sel);

  body.appendChild(html('div', '', '<label>专注时长（分钟）</label>'));
  const timeOpts = el('div', 'time-options');
  const minutes = [15, 25, 45, 60];
  let currentMin = state.settings.pomodoroMinutes || 25;
  minutes.forEach(m => {
    const b = el('button', 'time-option' + (m === currentMin ? ' active' : ''), m + '分钟');
    b.onclick = () => { currentMin = m; Array.from(timeOpts.children).forEach(c => { c.classList.remove('active'); if (c === b) c.classList.add('active'); }); };
    timeOpts.appendChild(b);
  });
  body.appendChild(timeOpts);

  const footer = el('div', 'flex gap-2 justify-end');
  const cancelBtn = el('button', 'btn btn-secondary', '取消');
  cancelBtn.onclick = closeModal;
  const startBtn = el('button', 'btn btn-danger', '🚀 开始专注');
  startBtn.onclick = () => {
    const habitId = sel.value;
    const habit = state.habits.find(h => h.id === habitId);
    const mins = currentMin;
    startPomodoro(habit, mins);
  };
  footer.appendChild(cancelBtn);
  footer.appendChild(startBtn);

  return buildModalShell('🍅 番茄计时 · 启动', body, footer);
}

function buildTimerDisplay() {
  const td = _timerData;
  const body = el('div', 'timer-container');
  body.appendChild(txt('div', 'timer-title', td.isBreak ? '休息中' : '专注中'));
  body.appendChild(txt('div', 'timer-habit', td.title || '自由专注'));

  const ring = el('div', 'timer-ring');
  const circumference = 2 * Math.PI * 90;
  const pct = td.totalSec > 0 ? ((td.totalSec - td.remainingSec) / td.totalSec) : 0;
  const offset = circumference * (1 - pct);

  ring.innerHTML = `
    <svg viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="90" class="timer-bg"></circle>
      <circle cx="100" cy="100" r="90" class="timer-fg ${td.isBreak ? 'break' : ''}"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${offset}"></circle>
    </svg>
    <div class="timer-display">
      <div class="timer-time">${String(Math.floor(td.remainingSec / 60)).padStart(2, '0')}:${String(td.remainingSec % 60).padStart(2, '0')}</div>
      <div class="timer-cycle">第 ${td.cycle + 1} 轮 · ${td.isBreak ? '休息' : '专注'}</div>
    </div>
  `;
  body.appendChild(ring);

  const btnRow = el('div', 'timer-btns');
  const startBtn = el('button', 'btn btn-primary flex-1', td.running ? '⏸ 暂停' : '▶ 继续');
  startBtn.onclick = () => {
    if (td.running) {
      td.running = false;
      stopTimerLoop();
      showToast('已暂停');
    } else {
      td.running = true;
      td.startTs = Date.now() - (td.totalSec - td.remainingSec) * 1000;
      getAudioContext();
      startTimerLoop();
      showToast('继续专注');
    }
    renderModal();
  };
  const resetBtn = el('button', 'btn btn-secondary flex-1', '🔄 重置');
  resetBtn.onclick = () => {
    stopTimerLoop();
    td.running = false;
    td.isBreak = false;
    td.cycle = 0;
    td.totalSec = td.mins * 60;
    td.remainingSec = td.totalSec;
    renderModal();
  };
  btnRow.appendChild(startBtn);
  btnRow.appendChild(resetBtn);
  body.appendChild(btnRow);
  body.appendChild(txt('div', 'timer-hint', '💡 切换到后台/锁屏时将自动暂停计时'));

  return buildModalShell('🍅 番茄钟', body, null);
}

function buildSettingsModal() {
  const body = el('div');

  // Data stats
  body.appendChild(txt('div', 'data-section-title', '📊 数据统计'));
  const statsRow = el('div', 'data-row');
  statsRow.appendChild(txt('div', 'data-stat')).appendChild(txt('div', 'data-stat-value', String(state.habits.length)));
  statsRow.lastChild.appendChild(txt('div', 'data-stat-label', '习惯数量'));
  statsRow.appendChild(txt('div', 'data-stat')).appendChild(txt('div', 'data-stat-value', String(state.tempTasks.length)));
  statsRow.lastChild.appendChild(txt('div', 'data-stat-label', '临时任务'));
  statsRow.appendChild(txt('div', 'data-stat')).appendChild(txt('div', 'data-stat-value', String(Object.keys(state.checkins).length)));
  statsRow.lastChild.appendChild(txt('div', 'data-stat-label', '总打卡数'));
  statsRow.appendChild(txt('div', 'data-stat')).appendChild(txt('div', 'data-stat-value', String(state.timerRecords.length)));
  statsRow.lastChild.appendChild(txt('div', 'data-stat-label', '计时次数'));
  body.appendChild(statsRow);

  // Pomodoro settings
  body.appendChild(txt('div', 'data-section-title mt-4', '⏱ 番茄钟设置'));
  const pomoRow = el('div', 'flex items-center gap-3');
  pomoRow.appendChild(html('label', 'text-sm text-slate-600', '默认专注时长：'));
  const minInput = el('input', 'form-input');
  minInput.type = 'number';
  minInput.style.width = '80px';
  minInput.value = state.settings.pomodoroMinutes || 25;
  minInput.onchange = e => {
    state.settings.pomodoroMinutes = Number(e.target.value) || 25;
    saveAllData();
  };
  pomoRow.appendChild(minInput);
  pomoRow.appendChild(txt('span', 'text-sm text-slate-600', '分钟'));
  body.appendChild(pomoRow);

  // Backup actions
  body.appendChild(txt('div', 'data-section-title mt-4', '💾 数据备份'));
  const actBox = el('div', 'data-actions');
  const exportBtn = el('button', 'btn btn-primary', '📤 导出备份（JSON）');
  exportBtn.onclick = doExport;
  const importBtn = el('button', 'btn btn-secondary', '📥 导入备份');
  importBtn.onclick = () => {
    const inp = el('input');
    inp.type = 'file';
    inp.accept = '.json';
    inp.onchange = e => {
      const f = e.target.files[0];
      if (f) doImport(f);
    };
    inp.click();
  };
  const clearBtn = el('button', 'btn btn-danger', '🗑 清空所有数据');
  clearBtn.onclick = doClearAll;
  actBox.appendChild(exportBtn);
  actBox.appendChild(importBtn);
  actBox.appendChild(clearBtn);
  body.appendChild(actBox);

  // Footer
  const footer = el('div', 'flex gap-2 justify-end');
  const closeBtn = el('button', 'btn btn-primary', '完成');
  closeBtn.onclick = closeModal;
  footer.appendChild(closeBtn);

  return buildModalShell('⚙️ 设置与数据', body, footer);
}

// ===== 番茄钟逻辑 =====
function startPomodoro(habit, minutes) {
  _timerData = {
    totalSec: minutes * 60,
    remainingSec: minutes * 60,
    mins: minutes,
    running: true,
    cycle: 0,
    isBreak: false,
    habitId: habit ? habit.id : null,
    title: habit ? habit.title : '自由专注',
    startTs: Date.now(),
  };

  state.modal = { type: 'pomodoro' };
  getAudioContext();
  renderModal();
  startTimerLoop();
}

function startTimerLoop() {
  stopTimerLoop();
  _timerHandle = setInterval(() => {
    if (!_timerData || !_timerData.running) { stopTimerLoop(); return; }

    const elapsed = Math.floor((Date.now() - _timerData.startTs) / 1000);
    const newRem = _timerData.totalSec - elapsed;

    if (newRem <= 0) {
      _timerData.remainingSec = 0;
      _timerData.running = false;
      stopTimerLoop();

      if (!_timerData.isBreak) {
        playPomodoroDone();
        showToast('🍅 本轮专注完成！');
        state.timerRecords.push({
          id: uid('t'),
          habitId: _timerData.habitId,
          title: _timerData.title,
          minutes: _timerData.mins,
          mode: 'focus',
          createdAt: Date.now(),
          done: true,
        });
        saveAllData();
        _timerData.cycle++;
        _timerData.isBreak = true;
        _timerData.totalSec = 5 * 60;
        _timerData.remainingSec = 5 * 60;
      } else {
        beep(660, 0.25);
        showToast('休息结束，继续加油！');
        _timerData.isBreak = false;
        _timerData.totalSec = _timerData.mins * 60;
        _timerData.remainingSec = _timerData.totalSec;
      }
      renderModal();
    } else {
      _timerData.remainingSec = Math.max(0, newRem);
      // Update only the SVG timer display if visible
      const timeEl = document.querySelector('.timer-time');
      const cycleEl = document.querySelector('.timer-cycle');
      const circle = document.querySelector('.timer-fg');
      if (timeEl) {
        timeEl.textContent = String(Math.floor(_timerData.remainingSec / 60)).padStart(2, '0') + ':' + String(_timerData.remainingSec % 60).padStart(2, '0');
      }
      if (cycleEl) {
        cycleEl.textContent = '第 ' + (_timerData.cycle + 1) + ' 轮 · ' + (_timerData.isBreak ? '休息' : '专注');
      }
      if (circle) {
        const circumference = 2 * Math.PI * 90;
        const pct = _timerData.totalSec > 0 ? ((_timerData.totalSec - _timerData.remainingSec) / _timerData.totalSec) : 0;
        circle.setAttribute('stroke-dashoffset', circumference * (1 - pct));
      }
    }
  }, 200);
}

function stopTimerLoop() {
  if (_timerHandle) { clearInterval(_timerHandle); _timerHandle = null; }
}

// Pause when page hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden && _timerData && _timerData.running) {
    _timerData.running = false;
    stopTimerLoop();
    showToast('⏸ 已暂停（切后台）');
    // Update the button text if modal is open
    const startBtn = document.querySelector('.modal-footer .btn-primary');
    if (startBtn) startBtn.textContent = '▶ 继续';
  }
});

// ===== 启动 =====
loadAllData();
render();
