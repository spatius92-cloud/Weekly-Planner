import { useEffect, useMemo, useState } from 'react'
import './App.css'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const STATUS_ORDER = ['pending', 'in-progress', 'completed']
const STATUS_LABEL = { pending: 'Pending', 'in-progress': 'In progress', completed: 'Completed' }
const STATUS_BTN_LABEL = { pending: 'Pending', 'in-progress': 'Doing', completed: 'Done' }
const WEEKS_AHEAD = 4
const STORAGE_KEY = 'weekly-planner-react-state-v1'
const THEME_KEY = 'weekly-planner-theme'

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) {
    let message = 'Something went wrong.'
    try {
      message = (await response.json()).error || message
    } catch {
      // Keep the generic message when the server does not return JSON.
    }
    throw new Error(message)
  }
  if (response.status === 204) return null
  return response.json()
}

const defaultMembers = [
  { id: 'm-1', name: 'Mpho', phone: '+26771123456', color: '#6C5CE7' },
  { id: 'm-2', name: 'Lerato', phone: '+26772234567', color: '#00B894' },
  { id: 'm-3', name: 'Neo', phone: '+26773345678', color: '#0984E3' },
]

const defaultTasks = [
  { id: 't-1', title: 'Client shoot', notes: 'Downtown studio', time: '09:00', day: 0, weekStart: isoDate(mondayOf(new Date())), assigneeId: 'm-1', status: 'pending' },
  { id: 't-2', title: 'Social media review', notes: 'Check campaign copy', time: '11:30', day: 2, weekStart: isoDate(mondayOf(new Date())), assigneeId: 'm-2', status: 'in-progress' },
  { id: 't-3', title: 'Delivery check', notes: 'Confirm pickup window', time: '15:00', day: 4, weekStart: isoDate(mondayOf(new Date())), assigneeId: 'm-3', status: 'completed' },
]

function mondayOf(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function isoDate(date) {
  return new Date(date).toISOString().slice(0, 10)
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function formatWeekLabel(weekStart, weeks = 1) {
  const end = addDays(weekStart, weeks * 7 - 1)
  return `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

function taskDate(task) {
  return addDays(new Date(`${task.weekStart}T00:00:00`), task.day)
}

function taskPosition(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`)
  const weekStart = mondayOf(date)
  return { day: Math.round((date - weekStart) / 86400000), weekStart: isoDate(weekStart) }
}

function normalizePhone(value) {
  const cleaned = String(value || '').trim().replace(/[\s()-]/g, '')
  if (!cleaned) return ''
  return /^\d{8}$/.test(cleaned) ? `+267${cleaned}` : cleaned
}

function readStoredState() {
  if (typeof window === 'undefined') return { members: defaultMembers, tasks: defaultTasks }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { members: defaultMembers, tasks: defaultTasks }
    const parsed = JSON.parse(raw)
    return {
      members: Array.isArray(parsed.members) && parsed.members.length ? parsed.members : defaultMembers,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : defaultTasks,
    }
  } catch {
    return { members: defaultMembers, tasks: defaultTasks }
  }
}

function createTaskFormData(weekStart, assigneeId = '') {
  return {
    title: '',
    notes: '',
    time: '',
    day: 0,
    weekStart,
    assigneeId,
    status: 'pending',
  }
}

function App() {
  const initialState = useMemo(() => readStoredState(), [])
  const [members, setMembers] = useState(initialState.members)
  const [tasks, setTasks] = useState(initialState.tasks)
  const [currentWeekStart, setCurrentWeekStart] = useState(mondayOf(new Date()))
  const [activeFilters, setActiveFilters] = useState([])
  const [selectedUserId, setSelectedUserId] = useState(() => {
    const fallbackMemberId = initialState.members[0]?.id || ''
    if (typeof window === 'undefined') return fallbackMemberId
    const storedMemberId = window.localStorage.getItem('ff-current-user')
    return initialState.members.some((member) => member.id === storedMemberId) ? storedMemberId : fallbackMemberId
  })
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [taskForm, setTaskForm] = useState(createTaskFormData(isoDate(mondayOf(new Date())), defaultMembers[0]?.id || ''))
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [moveModalOpen, setMoveModalOpen] = useState(false)
  const [moveTargetId, setMoveTargetId] = useState(null)
  const [duplicateMode, setDuplicateMode] = useState(false)
  const [moveDate, setMoveDate] = useState(isoDate(new Date()))
  const [membersModalOpen, setMembersModalOpen] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberPhone, setNewMemberPhone] = useState('')
  const [toast, setToast] = useState('')
  const [serverReady, setServerReady] = useState(false)
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light'
    const storedTheme = window.localStorage.getItem(THEME_KEY)
    if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ members, tasks }))
  }, [members, tasks])

  useEffect(() => {
    api('/api/state')
      .then((serverState) => {
        setMembers(Array.isArray(serverState.members) ? serverState.members : [])
        setTasks(Array.isArray(serverState.tasks) ? serverState.tasks : [])
        setServerReady(true)
      })
      .catch(() => {
        notify('Working from local data - server connection unavailable')
      })
  }, [])

  useEffect(() => {
    if (selectedUserId) {
      window.localStorage.setItem('ff-current-user', selectedUserId)
    } else {
      window.localStorage.removeItem('ff-current-user')
    }
  }, [selectedUserId])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(''), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const visibleWeekTasks = useMemo(() => {
    const tasksThisWeek = tasks.filter((task) => task.weekStart === isoDate(currentWeekStart))
    if (!activeFilters.length) return tasksThisWeek
    return tasksThisWeek.filter((task) => task.assigneeId && activeFilters.includes(task.assigneeId))
  }, [activeFilters, currentWeekStart, tasks])

  const weekOptions = Array.from({ length: WEEKS_AHEAD }, (_, index) => addDays(currentWeekStart, index * 7))

  const tasksForWeek = (weekStartISO) => {
    const week = tasks.filter((task) => task.weekStart === weekStartISO)
    if (!activeFilters.length) return week
    return week.filter((task) => task.assigneeId && activeFilters.includes(task.assigneeId))
  }

  const progressStats = useMemo(() => {
    const total = visibleWeekTasks.length
    const done = visibleWeekTasks.filter((task) => task.status === 'completed').length
    const pct = total ? Math.round((done / total) * 100) : 0
    return { total, done, pct }
  }, [visibleWeekTasks])

  const earliestPastTask = useMemo(() => tasks
    .filter((task) => taskDate(task) < currentWeekStart)
    .sort((a, b) => taskDate(a) - taskDate(b))[0], [currentWeekStart, tasks])

  function notify(message) {
    setToast(message)
  }

  function openTaskModal(task = null) {
    const selected = task || {
      id: null,
      title: '',
      notes: '',
      time: '',
      day: 0,
      weekStart: isoDate(currentWeekStart),
      assigneeId: selectedUserId || '',
      status: 'pending',
    }

    setTaskForm({
      title: selected.title || '',
      notes: selected.notes || '',
      time: selected.time || '',
      day: typeof selected.day === 'number' ? selected.day : 0,
      weekStart: selected.weekStart || isoDate(currentWeekStart),
      assigneeId: selected.assigneeId || '',
      status: selected.status || 'pending',
    })
    setEditingTaskId(task?.id || null)
    setTaskModalOpen(true)
  }

  function closeTaskModal() {
    setTaskModalOpen(false)
    setEditingTaskId(null)
  }

  function openMoveModal(task, duplicate = false) {
    if (!task || task.status === 'completed') return
    setMoveTargetId(task.id)
    setDuplicateMode(duplicate)
    setMoveDate(isoDate(taskDate(task)))
    setMoveModalOpen(true)
  }

  function closeMoveModal() {
    setMoveModalOpen(false)
    setMoveTargetId(null)
    setDuplicateMode(false)
  }

  function handleTaskChange(event) {
    const { name, value } = event.target
    setTaskForm((current) => ({ ...current, [name]: value }))
  }

  async function handleTaskSubmit(event) {
    event.preventDefault()
    const payload = {
      title: taskForm.title.trim(),
      notes: taskForm.notes.trim(),
      time: taskForm.time,
      day: Number(taskForm.day),
      weekStart: taskForm.weekStart || isoDate(currentWeekStart),
      assigneeId: taskForm.assigneeId || null,
      status: STATUS_ORDER.includes(taskForm.status) ? taskForm.status : 'pending',
    }

    if (!payload.title) {
      notify('Task title is required.')
      return
    }

    try {
      if (serverReady) {
        if (editingTaskId) {
          const updatedTask = await api(`/api/tasks/${editingTaskId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
          setTasks((current) => current.map((task) => task.id === editingTaskId ? updatedTask : task))
          notify('Activity updated')
        } else {
          const newTask = await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) })
          setTasks((current) => [newTask, ...current])
          notify('Activity added')
        }
      } else if (editingTaskId) {
        setTasks((current) => current.map((task) => task.id === editingTaskId ? { ...task, ...payload, updatedAt: new Date().toISOString() } : task))
        notify('Activity updated locally')
      } else {
        const newTask = { id: `t-${Date.now()}`, ...payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        setTasks((current) => [newTask, ...current])
        notify('Activity added locally')
      }
    } catch (error) {
      notify(error.message)
      return
    }

    closeTaskModal()
  }

  async function handleDeleteTask() {
    if (!editingTaskId) return
    try {
      if (serverReady) await api(`/api/tasks/${editingTaskId}`, { method: 'DELETE' })
      setTasks((current) => current.filter((task) => task.id !== editingTaskId))
      notify('Activity deleted')
      closeTaskModal()
    } catch (error) {
      notify(error.message)
    }
  }

  async function handleStatusChange(taskId, nextStatus) {
    try {
      const updatedTask = serverReady
        ? await api(`/api/tasks/${taskId}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) })
        : { ...tasks.find((task) => task.id === taskId), status: nextStatus, updatedAt: new Date().toISOString() }
      setTasks((current) => current.map((task) => task.id === taskId ? updatedTask : task))
      notify(`Marked as ${STATUS_LABEL[nextStatus].toLowerCase()}`)
    } catch (error) {
      notify(error.message)
    }
  }

  async function handleMoveSubmit(event) {
    event.preventDefault()
    if (!moveTargetId) return

    const sourceTask = tasks.find((task) => task.id === moveTargetId)
    if (!sourceTask) return

    const position = taskPosition(moveDate)

    try {
      if (duplicateMode) {
        const duplicatedTask = serverReady
          ? await api('/api/tasks', { method: 'POST', body: JSON.stringify({ ...sourceTask, day: position.day, weekStart: position.weekStart }) })
          : { ...sourceTask, id: `t-${Date.now()}`, day: position.day, weekStart: position.weekStart, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        setTasks((current) => [duplicatedTask, ...current])
        notify('Activity duplicated')
      } else {
        const movedTask = serverReady
          ? await api(`/api/tasks/${moveTargetId}`, { method: 'PUT', body: JSON.stringify({ day: position.day, weekStart: position.weekStart }) })
          : { ...sourceTask, day: position.day, weekStart: position.weekStart, updatedAt: new Date().toISOString() }
        setTasks((current) => current.map((task) => task.id === moveTargetId ? movedTask : task))
        notify('Activity moved')
      }
    } catch (error) {
      notify(error.message)
      return
    }

    closeMoveModal()
  }

  function toggleMemberFilter(memberId) {
    setActiveFilters((current) => current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId])
  }

  async function handleAddMember(event) {
    event.preventDefault()
    const trimmedName = newMemberName.trim()
    if (!trimmedName) {
      notify('Member name is required.')
      return
    }

    try {
      const nextMember = serverReady
        ? await api('/api/members', { method: 'POST', body: JSON.stringify({ name: trimmedName, phone: newMemberPhone }) })
        : { id: `m-${Date.now()}`, name: trimmedName, phone: normalizePhone(newMemberPhone), color: ['#6C5CE7', '#00B894', '#0984E3', '#E17055', '#FDCB6E', '#E84393', '#00CEC9', '#D63031'][members.length % 8] }
      setMembers((current) => [...current, nextMember])
      if (!selectedUserId) setSelectedUserId(nextMember.id)
    } catch (error) {
      notify(error.message)
      return
    }
    setNewMemberName('')
    setNewMemberPhone('')
    notify(`${trimmedName} added to the team`)
  }

  async function updateMemberPhone(memberId, phoneValue) {
    const phone = normalizePhone(phoneValue)
    try {
      const updatedMember = serverReady
        ? await api(`/api/members/${memberId}`, { method: 'PATCH', body: JSON.stringify({ phone }) })
        : { ...members.find((member) => member.id === memberId), phone }
      setMembers((current) => current.map((member) => member.id === memberId ? updatedMember : member))
    } catch (error) {
      notify(error.message)
    }
  }

  async function removeMember(memberId) {
    const member = members.find((item) => item.id === memberId)
    if (!member) return

    const confirmed = window.confirm(`Remove ${member.name}? Their tasks will become unassigned.`)
    if (!confirmed) return

    try {
      if (serverReady) await api(`/api/members/${memberId}`, { method: 'DELETE' })
      setMembers((current) => current.filter((item) => item.id !== memberId))
      setTasks((current) => current.map((task) => task.assigneeId === memberId ? { ...task, assigneeId: null } : task))
    } catch (error) {
      notify(error.message)
      return
    }
    if (selectedUserId === memberId) {
      const remainingMembers = members.filter((item) => item.id !== memberId)
      setSelectedUserId(remainingMembers[0]?.id || '')
    }
    notify(`${member.name} removed`)
  }

  function handleExportPdf() {
    const report = window.open('', '_blank')
    if (!report) {
      notify('Allow pop-ups to export the PDF report.')
      return
    }

    const allTasks = tasks
      .filter((task) => {
        const start = isoDate(currentWeekStart)
        const end = isoDate(addDays(currentWeekStart, WEEKS_AHEAD * 7 - 1))
        const date = isoDate(taskDate(task))
        return date >= start && date <= end && (!activeFilters.length || (task.assigneeId && activeFilters.includes(task.assigneeId)))
      })
      .sort((a, b) => taskDate(a) - taskDate(b))

    const memberName = (task) => members.find((member) => member.id === task.assigneeId)?.name || 'Unassigned'
    const list = allTasks.length
      ? allTasks.map((task) => `
        <article class="report-task">
          <div class="report-meta">${taskDate(task).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}${task.time ? ` - ${task.time}` : ''}</div>
          <h3>${task.title}</h3>
          <div class="report-meta">${memberName(task)} - ${STATUS_LABEL[task.status]}</div>
          ${task.notes ? `<p>${task.notes}</p>` : ''}
        </article>`).join('')
      : '<p class="empty-state">No activities</p>'

    report.document.write(`<!doctype html><html><body>
      <style>
        body { font-family: Arial, sans-serif; color: #1c1e2b; max-width: 760px; margin: 32px auto; padding: 0 24px; }
        h1 { margin-bottom: 8px; }
        .report-meta { color: #6b6f8a; font-size: 12px; }
        .report-task { border-bottom: 1px solid #e2e4f0; padding: 14px 0; }
        h3 { margin: 6px 0; }
        p { margin: 8px 0 0; }
      </style>
      <h1>Frame & Frqnc Planner Report</h1>
      <div class="report-meta">${formatWeekLabel(currentWeekStart, WEEKS_AHEAD)}</div>
      ${list}
    </body></html>`)
    report.document.close()
    report.focus()
    report.print()
  }

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">
            <img src="/logo.svg" alt="Frame & Frqnc logo" />
          </div>
          <div>
            <h1>Frame &amp; Frqnc</h1>
            <p className="subtitle">Weekly Planner</p>
          </div>
        </div>

        <div className="week-nav">
          <button type="button" className="icon-btn" onClick={() => setCurrentWeekStart((current) => addDays(current, -7))} aria-label="Previous week">&lt;</button>
          <div className="week-label">{formatWeekLabel(currentWeekStart, WEEKS_AHEAD)}</div>
          <button type="button" className="icon-btn" onClick={() => setCurrentWeekStart((current) => addDays(current, 7))} aria-label="Next week">&gt;</button>
          <button type="button" className="ghost-btn" onClick={() => setCurrentWeekStart(mondayOf(new Date()))}>This week</button>
        </div>

        <div className="user-controls">
          <label className="sr-only" htmlFor="currentUser">You are</label>
          <select id="currentUser" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
          <button type="button" className="ghost-btn" onClick={() => setMembersModalOpen(true)}>Team</button>
          <button type="button" className="ghost-btn" onClick={handleExportPdf}>Export PDF</button>
          {earliestPastTask ? (
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setCurrentWeekStart(mondayOf(taskDate(earliestPastTask)))}
              title="Jump to your oldest saved activity"
            >
              Past entries
            </button>
          ) : null}
          <button
            type="button"
            className="ghost-btn theme-toggle"
            onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button type="button" className="primary-btn" onClick={() => openTaskModal()}>+ Add activity</button>
        </div>
      </header>

      <section className="summary-bar">
        <div className="filters">
          {members.length === 0 ? <span className="filter-chip">No team members yet</span> : members.map((member) => (
            <button
              key={member.id}
              type="button"
              className={`filter-chip ${activeFilters.includes(member.id) ? 'active' : ''}`}
              onClick={() => toggleMemberFilter(member.id)}
            >
              <span className="chip-dot" style={{ background: member.color }} />
              {member.name}
            </button>
          ))}
        </div>
        <div className="progress-wrap">
          <div className="progress-track"><div className="progress-fill" style={{ width: `${progressStats.pct}%` }} /></div>
          <span id="progressLabel">{progressStats.done} / {progressStats.total} completed this week</span>
        </div>
      </section>

      <main className="weeks-view">
        {weekOptions.map((weekStartDate, weekIndex) => {
          const weekStartIso = isoDate(weekStartDate)
          const weekTasks = tasksForWeek(weekStartIso)

          return (
            <section key={weekStartIso} className="week-block">
              <h2 className="week-block-label">
                {formatWeekLabel(weekStartDate)}
                {weekIndex === 0 ? <span className="week-block-tag">This week</span> : null}
              </h2>
              <div className="board">
                {DAY_NAMES.map((name, dayIndex) => {
                  const date = addDays(weekStartDate, dayIndex)
                  const dayTasks = weekTasks.filter((task) => task.day === dayIndex)

                  return (
                    <div key={`${weekStartIso}-${dayIndex}`} className={`day-column ${isoDate(date) === isoDate(new Date()) ? 'is-today' : ''}`}>
                      <div className="day-header">
                        <div className="day-name">{name}</div>
                        <div className="day-date">{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                      </div>

                      <div className="day-tasks">
                        {dayTasks.length ? dayTasks.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99')).map((task) => {
                          const member = members.find((item) => item.id === task.assigneeId)
                          return (
                            <div key={task.id} className={`task-card status-${task.status}`} onClick={() => openTaskModal(task)}>
                              <div className="task-top">
                                <div>
                                  <div className="task-title">{task.title}</div>
                                  {task.time ? <div className="task-time">{task.time}</div> : null}
                                </div>
                              </div>
                              <div className="task-meta">
                                {member ? (
                                  <span className="assignee-chip"><span className="assignee-dot" style={{ background: member.color }} />{member.name}</span>
                                ) : <span className="assignee-chip">Unassigned</span>}
                              </div>
                              {task.status !== 'completed' ? (
                                <button type="button" className="move-task-btn" onClick={(event) => { event.stopPropagation(); openMoveModal(task, false) }}>
                                  Move to another day
                                </button>
                              ) : null}
                              <div className="status-buttons" onClick={(event) => event.stopPropagation()}>
                                {STATUS_ORDER.map((status) => (
                                  <button
                                    key={`${task.id}-${status}`}
                                    type="button"
                                    className={`status-btn status-${status} ${task.status === status ? 'active' : ''}`}
                                    onClick={() => handleStatusChange(task.id, status)}
                                  >
                                    {STATUS_BTN_LABEL[status]}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )
                        }) : <div className="empty-state">No activities</div>}
                      </div>

                      <button type="button" className="add-task-inline" onClick={() => openTaskModal({ day: dayIndex, weekStart: weekStartIso, assigneeId: selectedUserId || '' })}>+ Add activity</button>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </main>

      {taskModalOpen ? (
        <div className="modal-backdrop open" onClick={(event) => event.target === event.currentTarget && closeTaskModal()}>
          <div className="modal">
            <h2>{editingTaskId ? 'Edit activity' : 'Add activity'}</h2>
            <form onSubmit={handleTaskSubmit}>
              <label>
                Title
                <input type="text" name="title" value={taskForm.title} onChange={handleTaskChange} required maxLength={120} />
              </label>

              <div className="grid-2">
                <label>
                  Day
                  <select name="day" value={taskForm.day} onChange={handleTaskChange}>
                    {DAY_NAMES.map((dayName, index) => (
                      <option key={dayName} value={index}>{dayName}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Time
                  <input type="time" name="time" value={taskForm.time} onChange={handleTaskChange} />
                </label>
              </div>

              <div className="grid-2">
                <label>
                  Assigned to
                  <select name="assigneeId" value={taskForm.assigneeId || ''} onChange={handleTaskChange}>
                    <option value="">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>{member.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select name="status" value={taskForm.status} onChange={handleTaskChange}>
                    {STATUS_ORDER.map((status) => (
                      <option key={status} value={status}>{STATUS_LABEL[status]}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                Notes
                <textarea name="notes" rows="3" value={taskForm.notes} onChange={handleTaskChange} placeholder="Details, links, or locations..." maxLength={500} />
              </label>

              <div className="modal-actions">
                <div className="modal-actions-left">
                  {editingTaskId ? (
                    <button type="button" className="danger-btn" onClick={handleDeleteTask}>Delete</button>
                  ) : null}
                  {editingTaskId ? (
                    <button type="button" className="ghost-btn" onClick={() => { closeTaskModal(); openMoveModal(tasks.find((item) => item.id === editingTaskId), true) }}>
                      Duplicate
                    </button>
                  ) : null}
                </div>

                <div className="modal-actions-right">
                  <button type="button" className="ghost-btn" onClick={closeTaskModal}>Cancel</button>
                  <button type="submit" className="primary-btn">Save activity</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {moveModalOpen ? (
        <div className="modal-backdrop open" onClick={(event) => event.target === event.currentTarget && closeMoveModal()}>
          <div className="modal">
            <h2>{duplicateMode ? 'Duplicate activity' : 'Move activity'}</h2>
            <p className="hint">{duplicateMode ? 'Choose a date for the duplicated copy.' : 'Choose a new date for this activity.'}</p>
            <form onSubmit={handleMoveSubmit}>
              <label>
                New date
                <input type="date" value={moveDate} onChange={(event) => setMoveDate(event.target.value)} required />
              </label>

              <div className="modal-actions">
                <div />
                <div className="modal-actions-right">
                  <button type="button" className="ghost-btn" onClick={closeMoveModal}>Cancel</button>
                  <button type="submit" className="primary-btn">{duplicateMode ? 'Duplicate activity' : 'Move activity'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {membersModalOpen ? (
        <div className="modal-backdrop open" onClick={(event) => event.target === event.currentTarget && setMembersModalOpen(false)}>
          <div className="modal">
            <h2>Team members</h2>
            <p className="hint">Add a WhatsApp number for each contact, or leave it blank if you want unnotified members.</p>
            <form onSubmit={handleAddMember} className="inline-form">
              <input type="text" value={newMemberName} onChange={(event) => setNewMemberName(event.target.value)} placeholder="Name" maxLength={60} required />
              <input type="tel" value={newMemberPhone} onChange={(event) => setNewMemberPhone(event.target.value)} placeholder="71234567 or +26771234567" />
              <button type="submit" className="primary-btn">Add</button>
            </form>

            <ul className="member-list">
              {members.map((member) => (
                <li key={member.id}>
                  <span className="member-name"><span className="chip-dot" style={{ background: member.color }} />{member.name}</span>
                  <input
                    type="tel"
                    className="member-phone-input"
                    value={member.phone}
                    onChange={(event) => setMembers((current) => current.map((item) => item.id === member.id ? { ...item, phone: event.target.value } : item))}
                    onBlur={(event) => updateMemberPhone(member.id, event.target.value)}
                    placeholder="71234567 or +26771234567"
                  />
                  <button type="button" className="remove-member" onClick={() => removeMember(member.id)} title="Remove member">x</button>
                </li>
              ))}
            </ul>

            <div className="modal-actions">
              <div />
              <div className="modal-actions-right">
                <button type="button" className="ghost-btn" onClick={() => setMembersModalOpen(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </>
  )
}

export default App
