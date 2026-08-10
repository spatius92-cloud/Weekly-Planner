(() => {
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const STATUS_ORDER = ['pending', 'in-progress', 'completed'];
  const STATUS_LABEL = { pending: 'Pending', 'in-progress': 'In progress', completed: 'Completed' };

  let state = { members: [], tasks: [] };
  let currentWeekStart = mondayOf(new Date());
  let activeFilters = new Set(); // member ids; empty = show all
  let editingTaskId = null;

  const el = (id) => document.getElementById(id);
  const board = el('board');
  const toastEl = el('toast');

  // ---------- date helpers ----------

  function mondayOf(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0 = Sun
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function formatWeekLabel(weekStart) {
    const end = addDays(weekStart, 6);
    const opts = { month: 'short', day: 'numeric' };
    return `${weekStart.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
  }

  function isSameDay(a, b) {
    return isoDate(a) === isoDate(b);
  }

  // ---------- API ----------

  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      let message = 'Something went wrong.';
      try {
        message = (await res.json()).error || message;
      } catch (_) {}
      throw new Error(message);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function loadState() {
    state = await api('/api/state');
    ensureCurrentUser();
    renderAll();
  }

  // ---------- current user ----------

  function ensureCurrentUser() {
    const saved = localStorage.getItem('ff-current-user');
    if (saved && state.members.some((m) => m.id === saved)) return;
    if (state.members.length) localStorage.setItem('ff-current-user', state.members[0].id);
  }

  function getCurrentUserId() {
    return localStorage.getItem('ff-current-user') || '';
  }

  // ---------- rendering ----------

  function renderAll() {
    renderWeekLabel();
    renderUserSelect();
    renderMemberFilters();
    renderBoard();
    renderMembersModalList();
    renderProgress();
  }

  function renderWeekLabel() {
    el('weekLabel').textContent = formatWeekLabel(currentWeekStart);
  }

  function renderUserSelect() {
    const select = el('currentUser');
    const current = getCurrentUserId();
    select.innerHTML = state.members
      .map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`)
      .join('');
    if (current) select.value = current;
  }

  function renderMemberFilters() {
    const wrap = el('memberFilters');
    if (!state.members.length) {
      wrap.innerHTML = '<span class="filter-chip">No team members yet</span>';
      return;
    }
    wrap.innerHTML = state.members
      .map((m) => {
        const active = activeFilters.has(m.id) ? 'active' : '';
        return `<button type="button" class="filter-chip ${active}" data-member="${m.id}">
          <span class="chip-dot" style="background:${m.color}"></span>${escapeHtml(m.name)}
        </button>`;
      })
      .join('');
    wrap.querySelectorAll('.filter-chip[data-member]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.member;
        if (activeFilters.has(id)) activeFilters.delete(id);
        else activeFilters.add(id);
        renderMemberFilters();
        renderBoard();
        renderProgress();
      });
    });
  }

  function weekTasks() {
    const ws = isoDate(currentWeekStart);
    return state.tasks.filter((t) => t.weekStart === ws);
  }

  function visibleWeekTasks() {
    const tasks = weekTasks();
    if (!activeFilters.size) return tasks;
    return tasks.filter((t) => t.assigneeId && activeFilters.has(t.assigneeId));
  }

  function renderBoard() {
    const tasks = visibleWeekTasks();
    const today = new Date();

    board.innerHTML = DAY_NAMES.map((name, dayIndex) => {
      const date = addDays(currentWeekStart, dayIndex);
      const dayTasks = tasks
        .filter((t) => t.day === dayIndex)
        .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

      const cards = dayTasks.map(renderTaskCard).join('') ||
        '<div class="empty-state">No activities</div>';

      return `
        <div class="day-column ${isSameDay(date, today) ? 'is-today' : ''}">
          <div class="day-header">
            <div class="day-name">${name}</div>
            <div class="day-date">${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
          </div>
          <div class="day-tasks" data-day="${dayIndex}">${cards}</div>
          <button type="button" class="add-task-inline" data-day="${dayIndex}">+ Add activity</button>
        </div>`;
    }).join('');

    board.querySelectorAll('.add-task-inline').forEach((btn) => {
      btn.addEventListener('click', () => openTaskModal({ day: Number(btn.dataset.day) }));
    });
    board.querySelectorAll('.task-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.status-pill')) return;
        openTaskModal(state.tasks.find((t) => t.id === card.dataset.id));
      });
    });
    board.querySelectorAll('.status-pill').forEach((pill) => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        cycleStatus(pill.dataset.id);
      });
    });
  }

  function renderTaskCard(task) {
    const member = state.members.find((m) => m.id === task.assigneeId);
    return `
      <div class="task-card status-${task.status}" data-id="${task.id}">
        <div class="task-top">
          <div>
            <div class="task-title">${escapeHtml(task.title)}</div>
            ${task.time ? `<div class="task-time">${escapeHtml(task.time)}</div>` : ''}
          </div>
        </div>
        <div class="task-meta">
          ${member
            ? `<span class="assignee-chip"><span class="assignee-dot" style="background:${member.color}"></span>${escapeHtml(member.name)}</span>`
            : '<span class="assignee-chip">Unassigned</span>'}
          <button type="button" class="status-pill status-${task.status}" data-id="${task.id}" title="Click to change status">
            ${STATUS_LABEL[task.status]}
          </button>
        </div>
      </div>`;
  }

  function renderProgress() {
    const tasks = visibleWeekTasks();
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'completed').length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    el('progressFill').style.width = `${pct}%`;
    el('progressLabel').textContent = `${done} / ${total} completed this week`;
  }

  function renderMembersModalList() {
    const list = el('memberList');
    if (!state.members.length) {
      list.innerHTML = '<li class="empty-state">No members yet — add your team below.</li>';
      return;
    }
    list.innerHTML = state.members
      .map(
        (m) => `
        <li>
          <span class="member-name"><span class="chip-dot" style="background:${m.color}"></span>${escapeHtml(m.name)}</span>
          <button type="button" class="remove-member" data-id="${m.id}" title="Remove member">&times;</button>
        </li>`
      )
      .join('');
    list.querySelectorAll('.remove-member').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this member? Their assigned activities will become unassigned.')) return;
        await api(`/api/members/${btn.dataset.id}`, { method: 'DELETE' });
        await loadState();
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ---------- task modal ----------

  function openTaskModal(task) {
    editingTaskId = task && task.id ? task.id : null;
    el('taskModalTitle').textContent = editingTaskId ? 'Edit activity' : 'Add activity';
    el('taskId').value = editingTaskId || '';
    el('taskTitle').value = task && task.title ? task.title : '';
    el('taskNotes').value = task && task.notes ? task.notes : '';
    el('taskTime').value = task && task.time ? task.time : '';
    el('taskStatus').value = (task && task.status) || 'pending';

    const daySelect = el('taskDay');
    daySelect.innerHTML = DAY_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
    daySelect.value = task && typeof task.day === 'number' ? task.day : 0;

    const assigneeSelect = el('taskAssignee');
    assigneeSelect.innerHTML =
      '<option value="">Unassigned</option>' +
      state.members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    assigneeSelect.value = (task && task.assigneeId) || getCurrentUserId() || '';

    el('deleteTaskBtn').hidden = !editingTaskId;
    el('taskModalBackdrop').classList.add('open');
    el('taskTitle').focus();
  }

  function closeTaskModal() {
    el('taskModalBackdrop').classList.remove('open');
    editingTaskId = null;
  }

  async function cycleStatus(taskId) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length];
    task.status = next; // optimistic
    renderBoard();
    renderProgress();
    try {
      await api(`/api/tasks/${taskId}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      showToast(`Marked "${task.title}" as ${STATUS_LABEL[next].toLowerCase()}`);
    } catch (err) {
      showToast(err.message);
      await loadState();
    }
  }

  el('taskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      title: el('taskTitle').value,
      notes: el('taskNotes').value,
      time: el('taskTime').value,
      day: Number(el('taskDay').value),
      weekStart: isoDate(currentWeekStart),
      assigneeId: el('taskAssignee').value || null,
      status: el('taskStatus').value,
    };
    try {
      if (editingTaskId) {
        await api(`/api/tasks/${editingTaskId}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Activity updated');
      } else {
        await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Activity added');
      }
      closeTaskModal();
      await loadState();
    } catch (err) {
      showToast(err.message);
    }
  });

  el('deleteTaskBtn').addEventListener('click', async () => {
    if (!editingTaskId) return;
    if (!confirm('Delete this activity?')) return;
    try {
      await api(`/api/tasks/${editingTaskId}`, { method: 'DELETE' });
      showToast('Activity deleted');
      closeTaskModal();
      await loadState();
    } catch (err) {
      showToast(err.message);
    }
  });

  el('cancelTaskBtn').addEventListener('click', closeTaskModal);
  el('taskModalBackdrop').addEventListener('click', (e) => {
    if (e.target === el('taskModalBackdrop')) closeTaskModal();
  });
  el('addTaskBtn').addEventListener('click', () => openTaskModal({ day: 0 }));

  // ---------- members modal ----------

  el('manageMembersBtn').addEventListener('click', () => el('membersModalBackdrop').classList.add('open'));
  el('closeMembersBtn').addEventListener('click', () => el('membersModalBackdrop').classList.remove('open'));
  el('membersModalBackdrop').addEventListener('click', (e) => {
    if (e.target === el('membersModalBackdrop')) el('membersModalBackdrop').classList.remove('open');
  });

  el('addMemberForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = el('newMemberName');
    const name = input.value.trim();
    if (!name) return;
    try {
      const member = await api('/api/members', { method: 'POST', body: JSON.stringify({ name }) });
      input.value = '';
      await loadState();
      if (!localStorage.getItem('ff-current-user')) {
        localStorage.setItem('ff-current-user', member.id);
        renderUserSelect();
      }
      showToast(`${member.name} added to the team`);
    } catch (err) {
      showToast(err.message);
    }
  });

  el('currentUser').addEventListener('change', (e) => {
    localStorage.setItem('ff-current-user', e.target.value);
  });

  // ---------- week nav ----------

  el('prevWeek').addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, -7);
    renderWeekLabel();
    renderBoard();
    renderProgress();
  });
  el('nextWeek').addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, 7);
    renderWeekLabel();
    renderBoard();
    renderProgress();
  });
  el('todayBtn').addEventListener('click', () => {
    currentWeekStart = mondayOf(new Date());
    renderWeekLabel();
    renderBoard();
    renderProgress();
  });

  // ---------- toast ----------

  let toastTimer = null;
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  // ---------- init ----------

  loadState().catch((err) => showToast(err.message));
})();
