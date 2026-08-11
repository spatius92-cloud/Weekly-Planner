// --- WhatsApp message templates --------------------------------------------

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const STATUS_LABEL = { pending: 'Pending', 'in-progress': 'In progress', completed: 'Completed' };

function taskDateLabel(task) {
  const date = new Date(`${task.weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + task.day);
  const dayName = DAY_NAMES[task.day] || '';
  const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${dayName}, ${dateLabel}`;
}

function assignedMessage(member, task) {
  const lines = [
    `Hi ${member.name}, you've been assigned a new activity on the Weekly Planner:`,
    '',
    `"${task.title}"`,
    `${taskDateLabel(task)}${task.time ? ' at ' + task.time : ''}`,
  ];
  if (task.notes) lines.push('', task.notes);
  lines.push('', '— Frame & Frqnc');
  return lines.join('\n');
}

function statusChangedMessage(member, task) {
  return `Hi ${member.name}, your activity "${task.title}" (${taskDateLabel(task)}) is now marked *${STATUS_LABEL[task.status]}*.`;
}

function reminderMessage(member, task) {
  return `Reminder from Frame & Frqnc: "${task.title}" is scheduled for ${taskDateLabel(task)}${task.time ? ' at ' + task.time : ''}. Status: ${STATUS_LABEL[task.status]}.`;
}

function digestMessage(member, tasks, { weekly = false } = {}) {
  if (!tasks.length) {
    return weekly
      ? `Hi ${member.name}, you have no activities scheduled this week. — Frame & Frqnc`
      : `Good morning ${member.name}! No activities scheduled for you today. — Frame & Frqnc`;
  }
  const sorted = [...tasks].sort(
    (a, b) => a.day - b.day || (a.time || '99:99').localeCompare(b.time || '99:99')
  );
  const lines = sorted.map(
    (t) => `• ${weekly ? taskDateLabel(t) + ' — ' : ''}${t.time ? t.time + ' ' : ''}${t.title} [${STATUS_LABEL[t.status]}]`
  );
  const header = weekly
    ? `Hi ${member.name}, here's your week on the Weekly Planner:`
    : `Good morning ${member.name}! Here's your schedule for today:`;
  return [header, '', ...lines, '', '— Frame & Frqnc'].join('\n');
}

// --- browser push (title + short body, vs. the longer WhatsApp text above) --

function pushAssigned(task) {
  return {
    title: 'New activity assigned',
    body: `${task.title} — ${taskDateLabel(task)}${task.time ? ' at ' + task.time : ''}`,
    tag: `task-${task.id}`,
  };
}

function pushStatusChanged(task) {
  return {
    title: `Marked ${STATUS_LABEL[task.status]}`,
    body: `${task.title} — ${taskDateLabel(task)}`,
    tag: `task-${task.id}`,
  };
}

function pushReminder(task) {
  return {
    title: 'Reminder',
    body: `${task.title} — ${taskDateLabel(task)}${task.time ? ' at ' + task.time : ''}`,
    tag: `task-${task.id}`,
  };
}

function pushDigest(tasks, { weekly = false } = {}) {
  if (!tasks.length) {
    return {
      title: weekly ? 'Your week ahead' : "Today's activities",
      body: weekly ? 'Nothing scheduled this week.' : 'Nothing scheduled today.',
      tag: weekly ? 'digest-weekly' : 'digest-daily',
    };
  }
  const sorted = [...tasks].sort(
    (a, b) => a.day - b.day || (a.time || '99:99').localeCompare(b.time || '99:99')
  );
  const body = sorted
    .map((t) => `${weekly ? taskDateLabel(t) + ' ' : ''}${t.time ? t.time + ' ' : ''}${t.title}`)
    .join('\n');
  return {
    title: weekly ? 'Your week ahead' : "Today's activities",
    body,
    tag: weekly ? 'digest-weekly' : 'digest-daily',
  };
}

module.exports = {
  taskDateLabel,
  assignedMessage,
  statusChangedMessage,
  reminderMessage,
  digestMessage,
  pushAssigned,
  pushStatusChanged,
  pushReminder,
  pushDigest,
};
