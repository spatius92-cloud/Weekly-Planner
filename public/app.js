(() => {
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const STATUS_ORDER = ['pending', 'in-progress', 'completed'];
  const STATUS_LABEL = { pending: 'Pending', 'in-progress': 'In progress', completed: 'Completed' };
  const STATUS_BTN_LABEL = { pending: 'Pending', 'in-progress': 'Doing', completed: 'Done' };
  const WEEKS_AHEAD = 4;

  let state = { members: [], tasks: [] };
  let currentWeekStart = mondayOf(new Date());
  let activeFilters = new Set(); // member ids; empty = show all
  let editingTaskId = null;
  let movingTaskId = null;

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

  function formatWeekLabel(weekStart, weeks = 1) {
    const end = addDays(weekStart, weeks * 7 - 1);
    const opts = { month: 'short', day: 'numeric' };
    return `${weekStart.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
  }

  function isSameDay(a, b) {
    return isoDate(a) === isoDate(b);
  }

  function taskDate(task) {
    return addDays(new Date(`${task.weekStart}T00:00:00`), task.day);
  }

  function taskPosition(dateValue) {
    const date = new Date(`${dateValue}T00:00:00`);
    const weekStart = mondayOf(date);
    return { day: Math.round((date - weekStart) / 86400000), weekStart: isoDate(weekStart) };
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
    el('weekLabel').textContent = formatWeekLabel(currentWeekStart, WEEKS_AHEAD);
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

  function tasksForWeek(weekStartISO) {
    const tasks = state.tasks.filter((t) => t.weekStart === weekStartISO);
    if (!activeFilters.size) return tasks;
    return tasks.filter((t) => t.assigneeId && activeFilters.has(t.assigneeId));
  }

  function renderBoard() {
    const today = new Date();

    board.innerHTML = Array.from({ length: WEEKS_AHEAD }, (_, w) => {
      const weekStart = addDays(currentWeekStart, w * 7);
      const weekStartISO = isoDate(weekStart);
      const tasks = tasksForWeek(weekStartISO);

      const dayColumns = DAY_NAMES.map((name, dayIndex) => {
        const date = addDays(weekStart, dayIndex);
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
            <div class="day-tasks" data-day="${dayIndex}" data-week="${weekStartISO}">${cards}</div>
            <button type="button" class="add-task-inline" data-day="${dayIndex}" data-week="${weekStartISO}">+ Add activity</button>
          </div>`;
      }).join('');

      return `
        <section class="week-block">
          <h2 class="week-block-label">
            ${formatWeekLabel(weekStart)}
            ${w === 0 ? '<span class="week-block-tag">This week</span>' : ''}
          </h2>
          <div class="board">${dayColumns}</div>
        </section>`;
    }).join('');

    board.querySelectorAll('.add-task-inline').forEach((btn) => {
      btn.addEventListener('click', () =>
        openTaskModal({ day: Number(btn.dataset.day), weekStart: btn.dataset.week })
      );
    });
    board.querySelectorAll('.task-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.status-buttons')) return;
        openTaskModal(state.tasks.find((t) => t.id === card.dataset.id));
      });
    });
    board.querySelectorAll('.status-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setStatus(btn.dataset.id, btn.dataset.status);
      });
    });
    board.querySelectorAll('.move-task-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openMoveModal(state.tasks.find((t) => t.id === btn.dataset.id));
      });
    });
  }

  function renderTaskCard(task) {
    const member = state.members.find((m) => m.id === task.assigneeId);
    const statusButtons = STATUS_ORDER.map(
      (s) => `
        <button type="button" class="status-btn status-${s} ${task.status === s ? 'active' : ''}"
          data-id="${task.id}" data-status="${s}" title="Mark as ${STATUS_LABEL[s]}">${STATUS_BTN_LABEL[s]}</button>`
    ).join('');
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
        </div>
        ${task.status !== 'completed' ? `<button type="button" class="move-task-btn" data-id="${task.id}">Move to another day</button>` : ''}
        <div class="status-buttons">${statusButtons}</div>
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
          <input type="tel" class="member-phone-input" data-id="${m.id}" placeholder="+14155552671 (WhatsApp)" value="${escapeHtml(m.phone || '')}" />
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
    list.querySelectorAll('.member-phone-input').forEach((input) => {
      input.addEventListener('change', async () => {
        const memberId = input.dataset.id;
        const prev = state.members.find((m) => m.id === memberId)?.phone || '';
        try {
          const updated = await api(`/api/members/${memberId}`, {
            method: 'PATCH',
            body: JSON.stringify({ phone: input.value.trim() }),
          });
          const member = state.members.find((m) => m.id === memberId);
          if (member) member.phone = updated.phone;
          showToast(updated.phone ? `Saved WhatsApp number for ${updated.name}` : `Removed WhatsApp number for ${updated.name}`);
        } catch (err) {
          input.value = prev;
          showToast(err.message);
        }
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function reportTasks() {
    const start = isoDate(currentWeekStart);
    const end = isoDate(addDays(currentWeekStart, WEEKS_AHEAD * 7 - 1));
    return state.tasks
      .filter((task) => {
        const date = isoDate(taskDate(task));
        const matchesRange = date >= start && date <= end;
        const matchesFilter = !activeFilters.size || (task.assigneeId && activeFilters.has(task.assigneeId));
        return matchesRange && matchesFilter;
      })
      .sort((a, b) => taskDate(a) - taskDate(b) || (a.time || '99:99').localeCompare(b.time || '99:99'));
  }

  function formatReportDate(task) {
    return taskDate(task).toLocaleDateString(undefined, {
      weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  function exportPdf() {
    const tasks = reportTasks();
    const completed = tasks.filter((task) => task.status === 'completed');
    const memberName = (task) => state.members.find((member) => member.id === task.assigneeId)?.name || 'Unassigned';
    const taskRows = (items) => items.length
      ? items.map((task) => `
          <article class="task">
            <div class="task-date">${formatReportDate(task)}${task.time ? ` · ${escapeHtml(task.time)}` : ''}</div>
            <h3>${escapeHtml(task.title)}</h3>
            <div class="meta">${escapeHtml(memberName(task))} · ${STATUS_LABEL[task.status]}</div>
            ${task.notes ? `<p>${escapeHtml(task.notes)}</p>` : ''}
          </article>`).join('')
      : '<p class="empty">None</p>';
    const report = window.open('', '_blank');
    if (!report) {
      showToast('Allow pop-ups to export the PDF report.');
      return;
    }
    report.document.write(`<!doctype html><html><head><title>Planner report</title>
      <style>
        *{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#1c1e2b;max-width:820px;margin:40px auto;padding:0 24px}
        h1{margin:0 0 6px;font-size:28px}h2{margin:30px 0 10px;border-bottom:2px solid #1c1e2b;padding-bottom:6px}
        .range,.summary,.meta,.task-date{color:#62677d}.summary{margin:20px 0;padding:14px;background:#f0f1f8;border-radius:6px}
        .task{padding:12px 0;border-bottom:1px solid #dfe1e8;break-inside:avoid}.task h3{margin:4px 0;font-size:16px}
        .task p{margin:8px 0 0;white-space:pre-wrap}.empty{color:#62677d;font-style:italic}
        @media print{body{margin:0;padding:0}.summary{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
      </style></head><body>
      <h1>Frame &amp; Frqnc Planner Report</h1>
      <div class="range">${formatWeekLabel(currentWeekStart, WEEKS_AHEAD)}</div>
      <div class="summary"><strong>${completed.length} completed</strong> · ${tasks.length} total activities · ${tasks.length - completed.length} remaining</div>
      <h2>Completed activities</h2>${taskRows(completed)}
      <h2>All scheduled events</h2>${taskRows(tasks)}
      </body></html>`);
    report.document.close();
    report.focus();
    report.onafterprint = () => report.close();
    setTimeout(() => report.print(), 250);
  }

  // ---------- push notifications ----------
  // Subscribes *this device* to browser push, tied to whichever team member
  // is currently selected. No phone number or third-party account needed —
  // it talks directly to the browser's own push service.

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  function pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  }

  function localNotificationsSupported() {
    return 'Notification' in window;
  }

  async function getExistingSubscription() {
    if (!pushSupported()) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return null;
    return reg.pushManager.getSubscription();
  }

  async function enablePush() {
    if (!localNotificationsSupported()) {
      showToast('This browser does not support notifications.');
      return false;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('Notifications were blocked — enable them in your browser settings to use this.');
      return false;
    }
    if (!pushSupported()) {
      localStorage.setItem('ff-local-reminders', '1');
      return 'local';
    }
    const reg = await navigator.serviceWorker.register('/sw.js');
    const { publicKey } = await api('/api/push/vapid-public-key');
    if (!publicKey) {
      localStorage.setItem('ff-local-reminders', '1');
      return 'local';
    }
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await api('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: subscription.toJSON(), memberId: getCurrentUserId() || null }),
    });
    return true;
  }

  async function disablePush() {
    const subscription = await getExistingSubscription();
    if (subscription) {
      await api('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) });
      await subscription.unsubscribe();
    }
  }

  async function refreshNotifyToggle() {
    const btn = el('notifyToggleBtn');
    if (!localNotificationsSupported()) {
      btn.hidden = true;
      return;
    }
    const subscription = pushSupported() ? await getExistingSubscription() : null;
    const localEnabled = localStorage.getItem('ff-local-reminders') === '1';
    const subscribed = (Boolean(subscription) || localEnabled) && Notification.permission === 'granted';
    btn.textContent = subscribed ? '🔔 Notifications on' : '🔔 Enable notifications';
    btn.classList.toggle('active', subscribed);
    btn.dataset.subscribed = subscribed ? '1' : '';
  }

  el('notifyToggleBtn').addEventListener('click', async () => {
    try {
      if (el('notifyToggleBtn').dataset.subscribed) {
        await disablePush();
        localStorage.removeItem('ff-local-reminders');
        showToast('Notifications turned off for this device');
      } else {
        const ok = await enablePush();
        if (ok) showToast(ok === 'local' ? 'Local reminders enabled while this planner is open' : 'Notifications enabled on this device');
      }
    } catch (err) {
      showToast(err.message || 'Could not update notification settings.');
    }
    refreshNotifyToggle();
  });

  function checkLocalReminders() {
    if (!localNotificationsSupported() || localStorage.getItem('ff-local-reminders') !== '1' || Notification.permission !== 'granted') return;
    const now = new Date();
    const sent = JSON.parse(localStorage.getItem('ff-reminders-sent') || '{}');
    state.tasks.filter((task) => task.status !== 'completed' && task.time).forEach((task) => {
      const due = taskDate(task);
      const [hours, minutes] = task.time.split(':').map(Number);
      due.setHours(hours, minutes, 0, 0);
      const key = `${task.id}:${isoDate(due)}:${task.time}`;
      if (now >= due && now - due < 60 * 60 * 1000 && !sent[key]) {
        const notification = new Notification(`Planner: ${task.title}`, {
          body: `${STATUS_LABEL[task.status]} · ${task.time}`,
          tag: key,
        });
        notification.onclick = () => window.focus();
        sent[key] = Date.now();
      }
    });
    localStorage.setItem('ff-reminders-sent', JSON.stringify(sent));
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

    el('taskWeekStart').value = (task && task.weekStart) || isoDate(currentWeekStart);

    el('deleteTaskBtn').hidden = !editingTaskId;
    const assignee = task && state.members.find((m) => m.id === task.assigneeId);
    el('notifyTaskBtn').hidden = !editingTaskId || !assignee;
    el('taskModalBackdrop').classList.add('open');
    el('taskTitle').focus();
  }

  function closeTaskModal() {
    el('taskModalBackdrop').classList.remove('open');
    editingTaskId = null;
  }

  function openMoveModal(task) {
    if (!task || task.status === 'completed') return;
    movingTaskId = task.id;
    el('moveTaskLabel').textContent = `Choose a new date for “${task.title}”.`;
    el('moveDate').value = isoDate(taskDate(task));
    el('moveModalBackdrop').classList.add('open');
    el('moveDate').focus();
  }

  function closeMoveModal() {
    el('moveModalBackdrop').classList.remove('open');
    movingTaskId = null;
  }

  async function setStatus(taskId, status) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    const prev = task.status;
    task.status = status; // optimistic
    renderBoard();
    renderProgress();
    try {
      await api(`/api/tasks/${taskId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      showToast(`Marked "${task.title}" as ${STATUS_LABEL[status].toLowerCase()}`);
    } catch (err) {
      task.status = prev;
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
      weekStart: el('taskWeekStart').value || isoDate(currentWeekStart),
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

  el('notifyTaskBtn').addEventListener('click', async () => {
    if (!editingTaskId) return;
    try {
      await api(`/api/tasks/${editingTaskId}/notify`, { method: 'POST' });
      showToast('WhatsApp reminder sent');
    } catch (err) {
      showToast(err.message);
    }
  });

  el('cancelTaskBtn').addEventListener('click', closeTaskModal);
  el('taskModalBackdrop').addEventListener('click', (e) => {
    if (e.target === el('taskModalBackdrop')) closeTaskModal();
  });
  el('addTaskBtn').addEventListener('click', () => openTaskModal({ day: 0 }));
  el('exportPdfBtn').addEventListener('click', exportPdf);

  el('moveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const task = state.tasks.find((t) => t.id === movingTaskId);
    if (!task) return closeMoveModal();
    const position = taskPosition(el('moveDate').value);
    try {
      await api(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ day: position.day, weekStart: position.weekStart }),
      });
      closeMoveModal();
      showToast(`Moved “${task.title}” to ${el('moveDate').value}`);
      await loadState();
    } catch (err) {
      showToast(err.message);
    }
  });
  el('cancelMoveBtn').addEventListener('click', closeMoveModal);
  el('moveModalBackdrop').addEventListener('click', (e) => {
    if (e.target === el('moveModalBackdrop')) closeMoveModal();
  });

  // ---------- members modal ----------

  el('manageMembersBtn').addEventListener('click', () => el('membersModalBackdrop').classList.add('open'));
  el('closeMembersBtn').addEventListener('click', () => el('membersModalBackdrop').classList.remove('open'));
  el('membersModalBackdrop').addEventListener('click', (e) => {
    if (e.target === el('membersModalBackdrop')) el('membersModalBackdrop').classList.remove('open');
  });

  el('addMemberForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = el('newMemberName');
    const phoneInput = el('newMemberPhone');
    const name = input.value.trim();
    if (!name) return;
    try {
      const member = await api('/api/members', {
        method: 'POST',
        body: JSON.stringify({ name, phone: phoneInput.value.trim() }),
      });
      input.value = '';
      phoneInput.value = '';
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

  el('currentUser').addEventListener('change', async (e) => {
    localStorage.setItem('ff-current-user', e.target.value);
    // Re-tag this device's push subscription so it targets the newly selected member.
    const subscription = await getExistingSubscription();
    if (subscription) {
      await api('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ subscription: subscription.toJSON(), memberId: e.target.value || null }),
      }).catch(() => {});
    }
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

  if (pushSupported()) {
    navigator.serviceWorker.register('/sw.js').then(refreshNotifyToggle).catch(() => {});
  } else {
    refreshNotifyToggle();
  }

  loadState().catch((err) => showToast(err.message));
  setInterval(checkLocalReminders, 30000);
  checkLocalReminders();
})();
