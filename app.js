const SUPABASE_URL = 'https://wlqkkfwenstoogktfddb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndscWtrZndlbnN0b29na3RmZGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1MDg1NTIsImV4cCI6MjExMTA4NDU1Mn0.7H2AHDbl7yphpgV-ODoZ8MCpc2LobycpobMk1voV4aA';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

function getDateKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const todayStr = getDateKey(0);
const todayLabel = document.getElementById('todayLabel');
if (todayLabel) {
  todayLabel.textContent = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

let state = { tasks: [], habits: [], notes: '' };
let lastSavedJson = '';

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

async function fetchState(isInitial = false) {
  const dot = document.getElementById('syncDot');
  const status = document.getElementById('syncStatus');

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/planner_state?id=eq.main&select=data`, {
      method: 'GET',
      headers: headers
    });

    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }

    const rows = await res.json();
    if (dot) {
      dot.classList.remove('error');
      dot.classList.add('online');
    }
    if (status) {
      status.textContent = 'Облако подключено';
    }

    if (rows && rows.length > 0 && rows[0].data) {
      const incoming = { tasks: [], habits: [], notes: '', ...rows[0].data };
      const incomingJson = JSON.stringify(incoming);
      if (isInitial || incomingJson !== lastSavedJson) {
        state = incoming;
        lastSavedJson = incomingJson;
        renderAll();
      }
    }
  } catch (err) {
    if (dot) {
      dot.classList.remove('online');
      dot.classList.add('error');
    }
    if (status) {
      status.textContent = 'Ошибка подключения';
    }
    console.error('Supabase sync error:', err);
  }
}

async function saveState() {
  lastSavedJson = JSON.stringify(state);
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/planner_state?id=eq.main`, {
      method: 'PATCH',
      headers: headers,
      body: JSON.stringify({ data: state })
    });
  } catch (err) {
    console.error('Save error:', err);
  }
}

function renderAll() {
  renderTasks();
  renderHabits();
  const notesEl = document.getElementById('notesArea');
  if (notesEl && document.activeElement !== notesEl) {
    notesEl.value = state.notes || '';
  }
}

function switchTab(tab) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const target = document.getElementById('view-' + tab);
  if (target) target.classList.add('active');
}

function renderTasks() {
  const list = document.getElementById('tasksList');
  if (!list) return;
  list.innerHTML = '';

  const done = state.tasks.filter(t => t.done).length;
  const total = state.tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const fill = document.getElementById('progressFill');
  const text = document.getElementById('progressText');
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = `${done}/${total} (${pct}%)`;

  if (!total) {
    list.innerHTML = '<div style="text-align:center; color:var(--muted); padding:30px;">Задач пока нет. Добавь первую сверху!</div>';
    return;
  }

  const prioMap = {
    high: ['Высокий', 'prio-high'],
    mid: ['Обычный', 'prio-mid'],
    low: ['Низкий', 'prio-low']
  };

  state.tasks.forEach((t, i) => {
    const [lbl, cls] = prioMap[t.prio] || prioMap.mid;
    const div = document.createElement('div');
    div.className = 'card' + (t.done ? ' done' : '');
    div.innerHTML = `
      <div class="task-left" onclick="toggleTask(${i})">
        <div class="checkbox"></div>
        <div class="task-text">${escapeHtml(t.text)}</div>
      </div>
      <span class="badge ${cls}">${lbl}</span>
      <button class="del-btn" onclick="deleteTask(${i})">✕</button>
    `;
    list.appendChild(div);
  });
}

function addTask() {
  const inp = document.getElementById('taskInput');
  if (!inp || !inp.value.trim()) return;
  const prioEl = document.getElementById('taskPrio');
  state.tasks.unshift({
    text: inp.value.trim(),
    done: false,
    prio: prioEl ? prioEl.value : 'mid'
  });
  inp.value = '';
  renderTasks();
  saveState();
}

function toggleTask(i) {
  state.tasks[i].done = !state.tasks[i].done;
  renderTasks();
  saveState();
}

function deleteTask(i) {
  state.tasks.splice(i, 1);
  renderTasks();
  saveState();
}

function calcStreak(dates) {
  const set = new Set(dates || []);
  let streak = 0;
  let offset = set.has(getDateKey(0)) ? 0 : -1;
  while (set.has(getDateKey(offset))) {
    streak++;
    offset--;
  }
  return streak;
}

function renderHabits() {
  const list = document.getElementById('habitsList');
  if (!list) return;
  list.innerHTML = '';

  if (!state.habits.length) {
    list.innerHTML = '<div style="text-align:center; color:var(--muted); padding:30px;">Добавь свою первую привычку сверху!</div>';
    return;
  }

  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const last7Days = [];
  for (let offset = -6; offset <= 0; offset++) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    last7Days.push({
      key: getDateKey(offset),
      label: dayNames[d.getDay()],
      isToday: offset === 0
    });
  }

  state.habits.forEach((h, i) => {
    const dates = h.dates || [];
    const doneToday = dates.includes(todayStr);
    const streak = calcStreak(dates);
    const pillsHtml = last7Days.map(day => {
      const isDone = dates.includes(day.key);
      return `<div class="day-pill ${isDone ? 'done' : ''} ${day.isToday ? 'today' : ''}">${day.label}</div>`;
    }).join('');

    const div = document.createElement('div');
    div.className = 'habit-card';
    div.innerHTML = `
      <div class="habit-top">
        <div>
          <div style="font-weight:700; font-size:16px;">${escapeHtml(h.name)}</div>
          <div style="font-size:12px; color:${streak > 0 ? 'var(--orange)' : 'var(--muted)'}; margin-top:3px;">
            🔥 Серия: ${streak} дн. • Всего: ${dates.length}
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button class="habit-btn ${doneToday ? 'checked' : ''}" onclick="toggleHabit(${i})">
            ${doneToday ? '✓ Выполнено' : 'Отметить'}
          </button>
          <button class="del-btn" onclick="deleteHabit(${i})">✕</button>
        </div>
      </div>
      <div class="habit-days">${pillsHtml}</div>
    `;
    list.appendChild(div);
  });
}

function addHabit() {
  const inp = document.getElementById('habitInput');
  if (!inp || !inp.value.trim()) return;
  state.habits.push({ name: inp.value.trim(), dates: [] });
  inp.value = '';
  renderHabits();
  saveState();
}

function toggleHabit(i) {
  if (!state.habits[i].dates) state.habits[i].dates = [];
  const dates = state.habits[i].dates;
  const idx = dates.indexOf(todayStr);
  if (idx > -1) dates.splice(idx, 1);
  else dates.push(todayStr);
  renderHabits();
  saveState();
}

function deleteHabit(i) {
  state.habits.splice(i, 1);
  renderHabits();
  saveState();
}

let noteTimer = null;
function debouncedSaveNotes() {
  const notesEl = document.getElementById('notesArea');
  if (!notesEl) return;
  state.notes = notesEl.value;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(saveState, 400);
}

let timerSec = 25 * 60;
let timerInt = null;

function toggleTimer() {
  const btn = document.getElementById('startBtn');
  if (timerInt) {
    clearInterval(timerInt);
    timerInt = null;
    if (btn) btn.textContent = 'Старт';
  } else {
    if (btn) btn.textContent = 'Пауза';
    timerInt = setInterval(() => {
      if (timerSec > 0) {
        timerSec--;
        const disp = document.getElementById('timerDisplay');
        if (disp) {
          disp.textContent = `${String(Math.floor(timerSec / 60)).padStart(2, '0')}:${String(timerSec % 60).padStart(2, '0')}`;
        }
      } else {
        clearInterval(timerInt);
        timerInt = null;
        if (btn) btn.textContent = 'Старт';
        alert('Фокус-сессия завершена!');
      }
    }, 1000);
  }
}

function resetTimer() {
  clearInterval(timerInt);
  timerInt = null;
  timerSec = 25 * 60;
  const btn = document.getElementById('startBtn');
  const disp = document.getElementById('timerDisplay');
  if (btn) btn.textContent = 'Старт';
  if (disp) disp.textContent = '25:00';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

fetchState(true);
setInterval(() => fetchState(false), 3000);
