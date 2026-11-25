export const STATUS_LABELS = Object.freeze({done:'Done',in_progress:'In progress',ready:'Ready to run',blocked:'Blocked',pending:'Not started'});

export function summarizeTasks(tasks) {
  const counts = Object.fromEntries(Object.keys(STATUS_LABELS).map(key => [key, 0]));
  for (const task of tasks) {
    if (!Object.hasOwn(counts, task.status)) throw new Error('Unknown launch status');
    counts[task.status] += 1;
  }
  return {...counts,total:tasks.length};
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function safeLink(label, href, className) {
  const link = node('a', className, label);
  const url = new URL(href, location.href);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid evidence URL');
  link.href = url.href;
  if (url.origin !== location.origin) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  return link;
}
function pill(status) { return node('span', `status-pill status-${status}`, STATUS_LABELS[status]); }

async function initialize() {
  const response = await fetch(new URL('./launch-checklist.json', import.meta.url), {cache:'no-cache'});
  if (!response.ok) throw new Error('Launch ledger unavailable');
  const data = await response.json();
  if (data.schemaVersion !== 1 || !Array.isArray(data.tasks) || data.tasks.length !== 22 || !Array.isArray(data.phases)) throw new Error('Invalid launch ledger');
  const counts = summarizeTasks(data.tasks);
  const query = new URL(location.href).searchParams;
  let selectedStatus = Object.hasOwn(STATUS_LABELS, query.get('status')) ? query.get('status') : 'all';
  const phaseInput = document.querySelector('#launch-phase');
  const searchInput = document.querySelector('#launch-search');
  searchInput.value = query.get('q') || '';
  const formatter = new Intl.DateTimeFormat('en-US', {dateStyle:'medium',timeStyle:'short',timeZone:data.timezone});
  document.querySelector('[data-launch-progress]').textContent = `${counts.done} / ${counts.total}`;
  document.querySelector('#launch-meter').value = counts.done;
  document.querySelector('#launch-meter').textContent = `${counts.done} of ${counts.total}`;
  document.querySelector('#launch-updated').textContent = `Updated ${formatter.format(new Date(data.updatedAt))} · Chicago time`;
  const counter = document.querySelector('#launch-counts');
  for (const status of ['done','in_progress','ready','blocked','pending']) {
    if (!counts[status]) continue;
    const label = node('span'); label.append(node('strong', '', counts[status]), document.createTextNode(STATUS_LABELS[status].toLowerCase())); counter.append(label);
  }
  for (const phase of data.phases) {
    const option = node('option', '', phase.title); option.value = phase.id; phaseInput.append(option);
    const tasks = data.tasks.filter(task => task.phase === phase.id);
    const done = tasks.filter(task => task.status === 'done').length;
    const button = node('button', 'phase-button'); button.type = 'button'; button.dataset.phase = phase.id; button.setAttribute('aria-pressed', 'false');
    const bar = node('span', 'phase-bar'); const fill = node('span'); fill.style.width = `${done / tasks.length * 100}%`; bar.append(fill);
    button.append(node('strong', '', phase.title), node('span','dates',phase.dates), bar, node('span','phase-fraction',`${done} of ${tasks.length} complete`));
    button.addEventListener('click', () => { phaseInput.value = phaseInput.value === phase.id ? 'all' : phase.id; render(); document.querySelector('#checklist-title').scrollIntoView({block:'start'}); });
    document.querySelector('#launch-phases').append(button);
  }
  if (data.phases.some(phase => phase.id === query.get('phase'))) phaseInput.value = query.get('phase');
  function taskView(task) {
    const details = node('details', 'task'); details.id = `launch-${task.id}`; details.dataset.launchTask = task.id; details.dataset.status = task.status;
    const summary = node('summary');
    const marker = node('span','task-marker',task.status === 'done' ? '✓' : task.status === 'blocked' ? '!' : ''); marker.setAttribute('aria-hidden','true');
    const title = node('span','task-title',task.title); title.append(node('span','task-id',`${task.id} · ${task.owner}`));
    summary.append(marker,title,pill(task.status)); details.append(summary);
    const body = node('div','task-body'); body.append(node('p','',task.summary));
    if (task.nextAction) { const next = node('p','next-action'); next.append(node('strong','','Next action'),document.createTextNode(task.nextAction)); body.append(next); }
    if (task.evidence.length) { const evidence = node('ul','evidence-list'); for (const item of task.evidence) { const li = node('li'); li.append(safeLink(item.label,item.url)); evidence.append(li); } body.append(evidence); }
    if (task.completedAt) body.append(node('p','task-meta',`Completed ${formatter.format(new Date(task.completedAt))} · Chicago time`));
    const permalink = node('a','task-permalink','Link to this task'); permalink.href = `#launch-${task.id}`; body.append(permalink);
    details.append(body); return details;
  }
  function render({updateURL = true} = {}) {
    const search = searchInput.value.trim().toLowerCase();
    const tasks = data.tasks.filter(task => (selectedStatus === 'all' || task.status === selectedStatus) && (phaseInput.value === 'all' || task.phase === phaseInput.value) && (!search || [task.id,task.title,task.owner,task.summary,task.nextAction,...task.evidence.map(item=>item.label)].join(' ').toLowerCase().includes(search)));
    const container = document.querySelector('#launch-tasks'); container.replaceChildren();
    for (const phase of data.phases) {
      const matches = tasks.filter(task => task.phase === phase.id); if (!matches.length) continue;
      const group = node('section','task-group'); const title = node('h3','task-group-title',phase.title); title.append(node('span','',phase.dates)); group.append(title,...matches.map(taskView)); container.append(group);
    }
    container.setAttribute('aria-busy','false');
    document.querySelector('#launch-results').textContent = `${tasks.length} of ${data.tasks.length} tasks shown. Open a task for evidence and next actions.`;
    document.querySelector('#launch-empty').hidden = tasks.length !== 0;
    for (const button of document.querySelectorAll('[data-status-filter]')) button.setAttribute('aria-pressed', String(button.dataset.statusFilter === selectedStatus));
    for (const button of document.querySelectorAll('[data-phase]')) button.setAttribute('aria-pressed', String(button.dataset.phase === phaseInput.value));
    if (updateURL) { const url = new URL(location.href); for (const [key,value] of [['status',selectedStatus],['phase',phaseInput.value],['q',searchInput.value.trim()]]) { if (value && value !== 'all') url.searchParams.set(key,value); else url.searchParams.delete(key); } history.replaceState(null,'',url); }
  }
  const nextTasks = [...data.tasks.filter(task => task.status === 'blocked'), ...data.tasks.filter(task => task.status === 'in_progress'), ...data.tasks.filter(task => task.status === 'ready')].slice(0,3);
  for (const task of nextTasks) {
    const item = node('article','next-item'); item.append(pill(task.status),node('h3','',task.title),node('p','',task.nextAction || task.summary));
    const link = node('a','','Open task'); link.href = `#launch-${task.id}`; item.append(link); document.querySelector('#launch-next').append(item);
  }
  const exportButton = document.querySelector('#launch-export'); exportButton.disabled = false;
  exportButton.addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'})); const anchor = node('a'); anchor.href = url; anchor.download = 'helios-launch-evidence.json'; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); });
  for (const button of document.querySelectorAll('[data-status-filter]')) button.addEventListener('click', () => {selectedStatus=button.dataset.statusFilter; render();});
  searchInput.addEventListener('input',()=>render()); phaseInput.addEventListener('change',()=>render());
  function openHash() { if (!/^#launch-L\d{2}$/.test(location.hash)) return; const task = data.tasks.find(task=>`#launch-${task.id}` === location.hash); if (!task) return; let target=document.getElementById(`launch-${task.id}`); if (!target) { selectedStatus='all'; phaseInput.value='all'; searchInput.value=''; render(); target=document.getElementById(`launch-${task.id}`); } target.open=true; target.scrollIntoView({block:'start'}); }
  window.addEventListener('hashchange',openHash); render({updateURL:false}); openHash();
}

if (typeof document !== 'undefined') initialize().catch(() => { document.querySelector('#launch-error').hidden=false; document.querySelector('#launch-tasks').setAttribute('aria-busy','false'); document.querySelector('#launch-updated').textContent='Evidence unavailable · no completion total claimed.'; });
