import {RESEARCH_ROLES, createDraftWorkspace, makeTaskPlan, previousFrame, draftFutureParagraph, interpolateFrames, frameContent} from './research-model.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const requestedRoom = params.get('room');
const storageKey = `helios-research-v1:${requestedRoom || 'draft'}`;
const dirty = new Set();
const bases = {brief: 0, frame: 0, task: 0};
const frameDrafts = new Map();
const retryKeys = new Map();
const taskDetails = new Map();
const pendingDetails = new Set();
const failedDetails = new Set();
let snapshot = createDraftWorkspace();
let selectedFrame = params.get('frame') || snapshot.frames[1].id;
let selectedTask = null;
let catalog = [];
let csrf = null;
let shared = Boolean(requestedRoom);
let sharedReady = false;
let capabilities = {available: false, writable: false, workerEnabled: false};
let busy = false;
let pollTimer;
let savedDraft;
let activeStorageKey = storageKey;
let browserStorageAvailable = true;
let historyCursor = null;
let historyFrame = null;
const safeParse = value => { try { return JSON.parse(value); } catch { return null; } };
const roleFor = id => RESEARCH_ROLES.find(r => r.id === id) || RESEARCH_ROLES[0];
const displayState = value => ({planned: 'Planned', queued: 'Queued', running: 'Working', needs_review: 'Needs review', review: 'Needs review', approved: 'Reviewed', rejected: 'Changes requested', failed: 'Failed', paused: 'Paused'}[value] || String(value || 'Planned').replaceAll('_', ' '));
const roomPath = () => `/api/research/rooms/${encodeURIComponent(snapshot.room.id || requestedRoom)}`;
const currentFrame = () => snapshot.frames.find(f => f.id === selectedFrame) || snapshot.frames[0];
const currentTasks = () => snapshot.tasks.length ? snapshot.tasks : makeTaskPlan(snapshot.room);
const currentTask = () => {
  const task = currentTasks().find(t => t.id === selectedTask) || currentTasks()[0];
  const detail = taskDetails.get(task?.id);
  return detail && detail.revision === task?.revision ? {...task, ...detail} : task;
};
const isSupervisor = () => !shared || snapshot.room.canSupervise === true;
const sortedFrames = () => [...snapshot.frames].sort((a, b) => Number(a.year) - Number(b.year));
const textNode = (tag, text, className) => { const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element; };

function status(message, kind = '') {
  if (!shared && !browserStorageAvailable && kind === 'success' && message.includes('browser')) {
    message = 'Changes are kept in this tab. Browser storage is unavailable; export a copy before closing it.';
    kind = 'error';
  }
  $('save-status').textContent = message;
  $('save-status').parentElement.className = `status-bar ${kind}`.trim();
}

function briefInput() {
  return {title: $('room-title').value.trim(), brief: $('research-brief').value.trim(), inputData: $('research-inputs').value.trim(), constraints: $('research-constraints').value.trim(), agentCount: Number($('agent-capacity').value), maxConcurrent: Number($('agent-concurrency').value), collaboratorGoal: Number($('collaborator-target').value)};
}

function frameInput() {
  const frame = currentFrame();
  return {title: $('frame-title').value.trim(), year: Number($('frame-year').value), summary: $('frame-summary').value.trim(), assumptions: $('frame-assumptions').value.trim(), laws: structuredClone(frame?.laws || [])};
}

function rememberFrame() {
  if (!currentFrame() || !dirty.has('frame')) return;
  frameDrafts.set(currentFrame().id, {...frameInput(), revision: bases.frame});
  if (!shared) Object.assign(currentFrame(), frameInput());
}

function persistDraft() {
  rememberFrame();
  const draft = {snapshot, selectedFrame, selectedTask, dirty: [...dirty], bases: {...bases}, frameDrafts: [...frameDrafts],
    brief: dirty.has('brief') ? briefInput() : null,
    task: dirty.has('task') ? {id: selectedTask, notes: $('task-notes').value, status: $('task-review').value, revision: bases.task} : null,
    contribution: $('contribution-text').value};
  try { localStorage.setItem(activeStorageKey, JSON.stringify(draft)); browserStorageAvailable = true; return true; }
  catch { browserStorageAvailable = false; status('Browser storage is unavailable. Keep this tab open or export your research plan.', 'error'); return false; }
}

function markDirty(section) {
  dirty.add(section);
  if (!persistDraft()) return;
  status(shared ? 'Unsaved changes are preserved in this browser. Save to share them with the room.' : 'Draft preserved in this browser. Create a shared room when you are ready to collaborate.');
}

function updateRoute({push = false} = {}) {
  const url = new URL(location.href);
  if (shared && snapshot.room.id) url.searchParams.set('room', snapshot.room.id);
  else if (!shared) url.searchParams.delete('room');
  if (selectedFrame) url.searchParams.set('frame', selectedFrame);
  history[push ? 'pushState' : 'replaceState']({}, '', url);
}

async function ensureSession() {
  if (csrf) return;
  const response = await fetch('/api/research/session', {credentials: 'same-origin', cache: 'no-store'});
  const result = await response.json();
  if (!response.ok || !result.csrfToken) throw new Error(result.error || 'A shared research session could not be established.');
  csrf = result.csrfToken;
}

async function api(path, body) {
  const write = body !== undefined;
  if (write) await ensureSession();
  const payload = write ? JSON.stringify(body) : null;
  const fingerprint = path + ':' + (payload || '');
  if (write && !retryKeys.has(fingerprint)) retryKeys.set(fingerprint, crypto.randomUUID());
  const response = await fetch(path, {method: write ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
    ...(write ? {headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'Idempotency-Key': retryKeys.get(fingerprint)}, body: payload} : {})});
  const data = await response.json().catch(() => ({error: 'The research service returned an unexpected response.'}));
  if (!response.ok) {
    const error = new Error(data.error || 'The request could not be saved.');
    error.status = response.status;
    if (write && response.status >= 400 && response.status < 500) retryKeys.delete(fingerprint);
    throw error;
  }
  retryKeys.delete(fingerprint);
  return data;
}

async function action(fn) {
  if (busy) return;
  busy = true;
  document.body.setAttribute('aria-busy', 'true');
  try { await fn(); }
  catch (error) {
    if (error.status === 409) {
      status(`${error.message} Your draft is preserved. Export it before reloading the saved version.`, 'error');
      $('reload-room').hidden = false;
    } else status(`${error.message || 'The connection failed.'} Your draft has been kept in this browser.`, 'error');
    persistDraft();
  } finally { busy = false; document.body.removeAttribute('aria-busy'); renderControls(); }
}

function applySnapshot(next, cleared = []) {
  if (!cleared.includes('frame')) rememberFrame();
  for (const section of cleared) dirty.delete(section);
  if (cleared.includes('frame')) frameDrafts.delete(selectedFrame);
  snapshot = next;
  snapshot.tasks ||= []; snapshot.activity ||= []; snapshot.frames ||= [];
  if (!snapshot.frames.some(f => f.id === selectedFrame)) selectedFrame = snapshot.frames[0]?.id;
  if (dirty.has('frame') && frameDrafts.has(selectedFrame)) currentFrame().laws = structuredClone(frameDrafts.get(selectedFrame).laws);
  if (!currentTasks().some(t => t.id === selectedTask)) selectedTask = currentTasks()[0]?.id;
  sharedReady = shared;
  renderAll();
  updateRoute();
  persistDraft();
}

function renderControls() {
  const supervisor = isSupervisor();
  $('room-mode').textContent = shared ? 'Shared research room' : 'Browser draft';
  $('room-caption').textContent = shared ? `${snapshot.room.title} · Anyone with the link can contribute.` : 'Your draft stays in this browser until you share it.';
  $('create-room').hidden = shared;
  $('create-room').disabled = busy || !capabilities.writable;
  $('create-room').title = capabilities.writable ? '' : 'Shared persistence is unavailable. Local drafting and export still work.';
  $('copy-room').hidden = !shared;
  $('copy-room').disabled = !sharedReady;
  $('brief-form').classList.toggle('read-only', !supervisor);
  for (const input of $('brief-form').querySelectorAll('input, textarea')) input.disabled = !supervisor;
  $('agent-capacity').disabled = !supervisor || (shared && snapshot.tasks.length > 0);
  $('save-brief').disabled = busy || !supervisor || (shared && !sharedReady);
  $('queue-plan').disabled = busy || !supervisor || snapshot.tasks.length > 0 || (shared && !sharedReady);
  $('queue-plan').textContent = snapshot.tasks.length ? `${snapshot.tasks.length} tasks queued` : `Queue ${snapshot.room.agentCount} tasks`;
  $('toggle-dispatch').disabled = busy || !shared || !sharedReady || !supervisor || snapshot.tasks.length === 0;
  $('toggle-dispatch').textContent = snapshot.room.paused ? 'Resume dispatch' : 'Pause dispatch';
  $('dispatch-state').textContent = !shared ? 'Draft plan' : snapshot.room.paused ? 'Dispatch paused' : 'Dispatch open';
  $('brief-permission').textContent = supervisor ? (shared ? 'You supervise this room. Keyframes are open to collaborators.' : 'You supervise this draft. Create a shared room to invite collaborators.') : 'The room creator supervises research dispatch. You can edit keyframes and add contributions.';
  const detailReady = !shared || !snapshot.tasks.length || typeof currentTask()?.prompt === 'string';
  $('save-task').disabled = busy || !supervisor || snapshot.tasks.length === 0 || (shared && !sharedReady) || !detailReady;
  $('task-notes').disabled = !supervisor || !detailReady || snapshot.tasks.length === 0;
  $('task-review').disabled = !supervisor || !shared || !detailReady || !['needs_review','rejected'].includes(currentTask()?.status);
  $('task-review').querySelector('[value="approved"]').disabled = currentTask()?.status !== 'needs_review' || !currentTask()?.result;
  $('save-frame').disabled = busy || (shared && !sharedReady);
  $('post-contribution').disabled = busy || (shared && !sharedReady);
  $('add-frame').disabled = busy || snapshot.frames.length >= 24 || (shared && !sharedReady);
  $('contribution-help').textContent = shared ? 'Contributions are visible to people with this room link.' : 'This contribution stays in your browser until you create a shared room.';
}

function renderMetrics() {
  $('agent-count').textContent = Number(snapshot.room.agentCount || 100).toLocaleString();
  $('worker-count').textContent = Number(snapshot.connectedWorkers || 0).toLocaleString();
  $('review-count').textContent = snapshot.tasks.filter(t => ['needs_review', 'review'].includes(t.status)).length;
  $('worker-caption').textContent = snapshot.connectedWorkers ? 'Reporting through active job leases' : 'Awaiting a worker connection';
  const contributors = $('contributor-count');
  contributors.replaceChildren(document.createTextNode(`${Number(snapshot.contributors || 0).toLocaleString()} `), textNode('small', `/ ${Number(snapshot.room.collaboratorGoal || 1000).toLocaleString()}`));
  $('contribution-target').textContent = `${Number(snapshot.room.collaboratorGoal || 1000).toLocaleString()}-person design goal`;
}

function renderBrief() {
  if (dirty.has('brief')) return;
  const room = snapshot.room;
  for (const [id, key] of [['room-title', 'title'], ['research-brief', 'brief'], ['research-inputs', 'inputData'], ['research-constraints', 'constraints'], ['agent-capacity', 'agentCount'], ['agent-concurrency', 'maxConcurrent'], ['collaborator-target', 'collaboratorGoal']]) $(id).value = room[key] ?? '';
  bases.brief = room.revision;
}

function renderAgents() {
  const tasks = currentTasks();
  selectedTask ||= tasks[0]?.id;
  const grid = $('agent-grid'); grid.replaceChildren();
  for (const role of RESEARCH_ROLES) {
    const assigned = tasks.filter(t => t.role === role.id);
    const column = textNode('div', '', 'agent-role'); column.style.setProperty('--role-color', role.color);
    const header = textNode('div', '', 'agent-role-header');
    header.append(textNode('span', role.name), textNode('span', String(assigned.length).padStart(2, '0')));
    const cells = textNode('div', '', 'agent-role-cells');
    for (const task of assigned) {
      const button = textNode('button', String(task.slot).padStart(2, '0'), 'agent-cell');
      button.type = 'button'; button.dataset.task = task.id; button.dataset.state = task.status;
      button.setAttribute('aria-pressed', String(task.id === selectedTask));
      button.setAttribute('aria-label', `${role.name} agent ${task.slot}, ${displayState(task.status)}`);
      button.title = `${role.name} · Agent ${task.slot} · ${displayState(task.status)}`;
      cells.append(button);
    }
    column.append(header, cells); grid.append(column);
  }
  $('floor-note').textContent = !snapshot.tasks.length ? `${snapshot.room.agentCount} planned slots across five research roles. Queue the plan when the shared brief is ready.` : shared ? `${snapshot.tasks.length} saved assignments. ${snapshot.connectedWorkers || 0} connected workers. ${snapshot.room.paused ? 'Dispatch is paused.' : 'Workers can claim queued assignments.'}` : `${snapshot.tasks.length} draft assignments saved in this browser. Create a shared room to supervise connected workers.`;
  renderTask();
}

function renderTask() {
  const task = currentTask(); if (!task) return;
  $('task-title').textContent = `Agent ${String(task.slot).padStart(3, '0')}`;
  $('task-role').textContent = roleFor(task.role).name;
  $('task-state').textContent = displayState(task.status);
  $('task-prompt').textContent = task.prompt || (failedDetails.has(task.id) ? 'This assignment could not be loaded. Select it again to retry.' : 'Loading the saved assignment…');
  $('task-result-details').hidden = !task.result;
  $('task-result').textContent = typeof task.result === 'string' ? task.result : task.result ? JSON.stringify(task.result, null, 2) : '';
  if (!dirty.has('task')) { $('task-notes').value = task.notes || ''; $('task-review').value = ''; bases.task = task.revision; }
  $('task-help').textContent = !snapshot.tasks.length ? 'Queue the plan to save directions with a task.' : shared ? 'Directions are saved with this assignment. Results require human review.' : 'Directions are part of this browser draft.';
  renderControls();
  if (shared && snapshot.tasks.length && typeof task.prompt !== 'string' && !pendingDetails.has(task.id) && !failedDetails.has(task.id)) loadTaskDetail(task.id);
}

async function loadTaskDetail(taskId) {
  pendingDetails.add(taskId);
  try {
    const detail = await api(roomPath()+'/tasks/'+encodeURIComponent(taskId));
    taskDetails.set(taskId, detail);
    const summary = snapshot.tasks.find(t=>t.id===taskId);
    if (summary && !dirty.has('task')) summary.revision = detail.revision;
    if (selectedTask === taskId) renderTask();
  } catch (error) {
    failedDetails.add(taskId);
    if (selectedTask === taskId) { $('task-prompt').textContent = 'This assignment could not be loaded. Select it again to retry.'; status(error.message, 'error'); }
  } finally { pendingDetails.delete(taskId); renderControls(); }
}

function renderTimeline() {
  const timeline = $('frame-timeline'); timeline.replaceChildren();
  for (const frame of sortedFrames()) {
    const button = textNode('button', '', 'frame-node'); button.type = 'button'; button.dataset.frame = frame.id;
    button.setAttribute('aria-pressed', String(frame.id === selectedFrame));
    button.setAttribute('aria-label', `${frame.year}: ${frame.title}`);
    button.append(textNode('strong', String(frame.year)), textNode('span', frame.title), textNode('small', `${frame.laws?.length || 0} proposed ${(frame.laws?.length || 0) === 1 ? 'law' : 'laws'}`));
    timeline.append(button);
  }
  const frames = sortedFrames();
  if (frames.length) {
    $('future-year').min = frames[0].year; $('future-year').max = frames.at(-1).year;
    $('first-year').textContent = frames[0].year; $('last-year').textContent = frames.at(-1).year;
  }
}

function renderFrame() {
  const frame = currentFrame(); if (!frame) return;
  if (!dirty.has('frame')) {
    const local = frameDrafts.get(frame.id);
    const content = local || frame;
    $('frame-title').value = content.title; $('frame-year').value = content.year;
    $('frame-summary').value = content.summary || ''; $('frame-assumptions').value = content.assumptions || '';
    if (local) { frame.laws = structuredClone(local.laws); dirty.add('frame'); }
    bases.frame = content.revision;
  }
  $('frame-revision').textContent = shared ? `REVISION ${frame.revision}` : 'BROWSER DRAFT';
  $('frame-save-help').textContent = shared ? 'Save a revision for everyone in this room.' : 'Save locally, then create a shared room.';
  renderLaws();
  $('future-year').value = frame.year;
  renderProjection(Number(frame.year));
  if ($('frame-history').open) loadFrameHistory();
}

async function loadFrameHistory(older = false) {
  const frame = currentFrame();
  const list = $('frame-history-list');
  if (!shared) { list.replaceChildren(textNode('p', 'Shared rooms keep earlier keyframe revisions. This browser draft keeps its current version.', 'field-help')); $('older-frame-history').hidden = true; return; }
  if (!older) { historyCursor=null; historyFrame=frame.id; list.replaceChildren(textNode('p','Loading saved revisions…','field-help')); }
  try {
    const result=await api(roomPath()+'/frames/'+encodeURIComponent(frame.id)+'/history'+(older&&historyCursor?'?beforeRevision='+historyCursor:''));
    if (currentFrame().id!==frame.id) return;
    if (!older) list.replaceChildren();
    for (const version of result.versions) {
      const card=textNode('article','','revision-card');
      card.append(textNode('h4',`Revision ${version.revision} · ${version.content.year} · ${version.content.title}`),textNode('p',version.content.summary||'No paragraph in this revision.'));
      if (version.content.laws?.length) card.append(textNode('small',version.content.laws.map(l=>l.title).join(' · ')));
      list.append(card);
    }
    historyCursor=result.nextBeforeRevision;$('older-frame-history').hidden=!historyCursor;
  }catch(error){list.replaceChildren(textNode('p',error.message,'field-help'));}
}

function renderLaws() {
  const laws = currentFrame()?.laws || [];
  $('frame-law-count').textContent = `${laws.length} ${laws.length === 1 ? 'law' : 'laws'}`;
  const container = $('frame-laws'); container.replaceChildren();
  if (!laws.length) container.append(textNode('p', 'Connect a proposed law to explain what could change.', 'empty-law'));
  laws.forEach((law, index) => {
    const card = textNode('article', '', 'frame-law');
    const header = textNode('div', '', 'frame-law-header');
    const title = textNode('div', ''); title.append(textNode('small', law.id || 'NEW PROPOSAL'), textNode('h5', law.title));
    const remove = textNode('button', '×', 'remove-law'); remove.type = 'button'; remove.dataset.removeLaw = String(index); remove.setAttribute('aria-label', `Remove ${law.title} from this keyframe`);
    header.append(title, remove); card.append(header);
    if (law.change) card.append(textNode('p', law.change));
    container.append(card);
  });
}

const NS = 'http://www.w3.org/2000/svg';
function svgNode(tag, attributes, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  parent.append(node); return node;
}

function drawWorld(fraction) {
  const art = $('city-art'); art.replaceChildren();
  const iso = (x, y, z = 0) => [326 + (x - y) * 31, 112 + (x + y) * 15 - z];
  const polygon = (points, attrs) => svgNode('polygon', {points: points.map(p => p.join(',')).join(' '), ...attrs}, art);
  polygon([iso(-3, -3), iso(5, -3), iso(5, 5), iso(-3, 5)], {fill: 'url(#city-ground)', stroke: '#394953', 'stroke-width': 1});
  for (let n = -2; n <= 4; n++) {
    svgNode('line', {x1: iso(n, -3)[0], y1: iso(n, -3)[1], x2: iso(n, 5)[0], y2: iso(n, 5)[1], stroke: '#47515b', 'stroke-width': n === 1 ? 13 : 1, opacity: n === 1 ? .65 : .4}, art);
    svgNode('line', {x1: iso(-3, n)[0], y1: iso(-3, n)[1], x2: iso(5, n)[0], y2: iso(5, n)[1], stroke: '#47515b', 'stroke-width': n === 1 ? 13 : 1, opacity: n === 1 ? .65 : .4}, art);
  }
  const buildings = [[-2,-2,37],[-.7,-2,52],[2,-2,61],[3.3,-2,44],[-2,-.6,44],[2,-.6,38],[3.3,-.6,52],[-2,2,38],[-.6,2,58],[2,2,49],[3.3,2,38],[-2,3.4,31],[-.6,3.4,38],[2,3.4,32],[3.3,3.4,40]];
  for (const [i, [x, y, base]] of buildings.entries()) {
    const growth = i % 3 === 0 ? .45 + fraction * .55 : .8 + fraction * .2;
    const height = base * growth, width = .78;
    const p = [iso(x, y), iso(x+width, y), iso(x+width, y+width), iso(x, y+width)];
    const top = [iso(x,y,height),iso(x+width,y,height),iso(x+width,y+width,height),iso(x,y+width,height)];
    const green = i % 5 === 0;
    polygon([p[1],p[2],top[2],top[1]], {fill: green ? '#3b6658' : '#3a405b', stroke: '#809492', 'stroke-width': .5});
    polygon([p[2],p[3],top[3],top[2]], {fill: green ? '#28483e' : '#2a3048', stroke: '#728482', 'stroke-width': .5});
    polygon(top, {fill: green ? '#8fb5a1' : '#a699d0', stroke: green ? '#b7d9bc' : '#c8b7ef', 'stroke-width': .8});
    for (let z = 10; z < height - 5; z += 10) {
      const window = iso(x+width, y+.25, z);
      svgNode('line', {x1: window[0], y1: window[1], x2: window[0]-7, y2: window[1]+3.5, stroke: '#d8ebbd', 'stroke-width': 2, opacity: .55+.3*fraction}, art);
    }
  }
  for (let i=0;i<10;i++) {
    const p=iso(-2.9+i*.74, 4.65), z=7+fraction*7;
    svgNode('line',{x1:p[0],y1:p[1],x2:p[0],y2:p[1]-z,stroke:'#799887','stroke-width':1.5},art);
    svgNode('ellipse',{cx:p[0],cy:p[1]-z,rx:5+fraction*2,ry:8+fraction*3,fill:'#7a9f80',opacity:.75},art);
  }
  for (let i=0;i<10+Math.round(fraction*12);i++) {
    const axis=i%2===0, v=-2.8+(i%10)*.77, p=iso(axis?1:v,axis?v:1);
    svgNode('circle',{cx:p[0]+(i%3-1)*3,cy:p[1]-3,r:1.8,fill:i%3===0?'#d4f49d':'#b8a8f0'},art);
  }
}

function renderProjection(year) {
  const result = interpolateFrames(snapshot.frames, year); if (!result.from) return;
  const frames = sortedFrames();
  const total = Number(frames.at(-1).year) - Number(frames[0].year);
  const fraction = total ? (result.year - Number(frames[0].year)) / total : 0;
  const label = Number.isInteger(result.year) ? String(result.year) : result.year.toFixed(1);
  $('year-output').textContent = label; $('projection-year').textContent = label;
  $('projection-phase').textContent = result.from.id === result.to.id ? result.to.title : `${Math.round(result.progress * 100)}% between shared keyframes`;
  const frame = result.to;
  const previous = previousFrame(snapshot.frames, frame);
  $('projection-range').textContent = previous ? `${previous.year} TO ${frame.year} · ${frame.laws?.length || 0} PROPOSED LAWS` : `${frame.year} · STARTING KEYFRAME`;
  $('projection-narrative').textContent = result.from.id === result.to.id ? (frame.summary || draftFutureParagraph(previous, frame)) : `Between “${result.from.title}” (${result.from.year}) and “${result.to.title}” (${result.to.year}), this sketch is ${Math.round(result.progress * 100)}% along the timeline. ${result.to.summary || draftFutureParagraph(result.from, result.to)}`;
  drawWorld(fraction);
}

function renderActivity() {
  const list = $('activity-list'); list.replaceChildren();
  if (!snapshot.activity.length) { list.append(textNode('li', 'The next idea could be yours. Saved changes and contributions will appear here.', 'activity-empty')); return; }
  for (const event of snapshot.activity.slice(0,50)) {
    const row = document.createElement('li');
    const label = event.label || event.kind || event.action || 'Room updated';
    row.append(textNode('strong', String(label).replaceAll('_',' ')));
    const detail = event.text || event.message || event.detail;
    if (detail) row.append(textNode('p', typeof detail === 'string' ? detail : JSON.stringify(detail)));
    const when = event.createdAt || event.created_at || event.at;
    if (when) { const date = new Date(when); if (!Number.isNaN(date.getTime())) row.append(textNode('small', date.toLocaleString(undefined, {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))); }
    list.append(row);
  }
}

function renderAll() { renderMetrics(); renderBrief(); renderAgents(); renderTimeline(); renderFrame(); renderActivity(); renderControls(); }

function localEvent(kind, text) {
  snapshot.activity.unshift({kind, text, createdAt: new Date().toISOString()});
  snapshot.activity = snapshot.activity.slice(0,50);
}

async function createRoom() {
  if (!$('brief-form').reportValidity()) return false;
  rememberFrame();
  const before = currentFrame();
  const fields = briefInput();
  const data = await api('/api/research/rooms', {...fields, frames: snapshot.frames.map(f => frameContent({...f,...frameDrafts.get(f.id)}))});
  shared = true;
  activeStorageKey = `helios-research-v1:${data.room.id}`;
  selectedFrame = data.frames.find(f => f.year === before.year && f.title === before.title)?.id || data.frames[0]?.id;
  frameDrafts.clear(); dirty.clear();
  applySnapshot(data, ['brief','frame','task']);
  status('Shared room created. Copy its link to invite people to design these keyframes with you.', 'success');
  return true;
}

$('create-room').addEventListener('click', () => action(createRoom));
$('brief-form').addEventListener('input', () => markDirty('brief'));
$('brief-form').addEventListener('submit', event => {
  event.preventDefault();
  action(async () => {
    const content = briefInput();
    if (shared) applySnapshot(await api(roomPath()+'/brief', {...content, revision: bases.brief}), ['brief']);
    else { Object.assign(snapshot.room, content); dirty.delete('brief'); snapshot.room.revision++; renderAll(); persistDraft(); }
    status(shared ? 'Research inputs saved for this room.' : 'Research inputs saved in this browser.', 'success');
  });
});

$('queue-plan').addEventListener('click', () => action(async () => {
  if (dirty.has('brief')) { status('Save your research inputs before creating the task plan.', 'error'); $('save-brief').focus(); return; }
  if (shared) applySnapshot(await api(roomPath()+'/plan', {revision: snapshot.room.revision}));
  else { snapshot.tasks = makeTaskPlan(snapshot.room); localEvent('Draft plan created', `${snapshot.tasks.length} planned assignments. No workers have been launched.`); renderAll(); persistDraft(); }
  status(shared ? `${snapshot.tasks.length} research assignments saved. Dispatch is paused until you resume it.` : `${snapshot.tasks.length} assignments prepared in this browser. Create a shared room for connected workers.`, 'success');
}));
$('toggle-dispatch').addEventListener('click', () => action(async () => {
  applySnapshot(await api(roomPath()+'/control', {revision: snapshot.room.revision, paused: !snapshot.room.paused}));
  status(snapshot.room.paused ? 'Dispatch paused. Active workers retain their current leases.' : `Dispatch is open for connected workers, with a concurrency limit of ${snapshot.room.maxConcurrent}.`, 'success');
}));

$('agent-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-task]'); if (!button) return;
  if (dirty.has('task')) { status('Save the current supervisor direction before selecting another task.', 'error'); $('task-notes').focus(); return; }
  selectedTask = button.dataset.task; failedDetails.delete(selectedTask); renderAgents(); persistDraft();
});
$('task-form').addEventListener('input', () => markDirty('task'));
$('task-form').addEventListener('submit', event => {
  event.preventDefault();
  action(async () => {
    const task = currentTask(), content = {revision: bases.task, notes: $('task-notes').value.trim()};
    if ($('task-review').value) content.status = $('task-review').value;
    if (shared) applySnapshot(await api(roomPath()+'/tasks/'+encodeURIComponent(task.id), content), ['task']);
    else { Object.assign(task, {notes: content.notes, revision: (task.revision || 0)+1}); dirty.delete('task'); localEvent('Supervisor direction saved', `Agent ${task.slot}: ${task.notes}`); renderAll(); persistDraft(); }
    status(shared ? 'Supervisor direction saved with this task.' : 'Supervisor direction saved in this browser.', 'success');
  });
});

$('frame-timeline').addEventListener('click', event => {
  const button = event.target.closest('[data-frame]'); if (!button) return;
  rememberFrame(); dirty.delete('frame'); selectedFrame = button.dataset.frame;
  renderTimeline(); renderFrame(); updateRoute({push:true}); persistDraft();
});
$('frame-form').addEventListener('input', event => { if (!['law-select','new-law-title','new-law-change'].includes(event.target.id)) markDirty('frame'); });
$('future-year').addEventListener('input', () => renderProjection(Number($('future-year').value)));
$('draft-paragraph').addEventListener('click', () => {
  const frame = {...currentFrame(),...frameInput()};
  $('frame-summary').value = draftFutureParagraph(previousFrame(snapshot.frames, frame), frame).slice(0,6000);
  markDirty('frame');
  $('projection-narrative').textContent = $('frame-summary').value;
  status('Future paragraph drafted from the previous keyframe, proposed laws, and assumptions. Edit it, then save the keyframe.');
});
$('frame-form').addEventListener('submit', event => {
  event.preventDefault();
  action(async () => {
    const frame = currentFrame(), content = frameInput();
    if (shared) applySnapshot(await api(roomPath()+'/frames/'+encodeURIComponent(frame.id), {...content, revision: bases.frame}), ['frame']);
    else { Object.assign(frame, content, {revision: (frame.revision || 0)+1}); frameDrafts.delete(frame.id); dirty.delete('frame'); localEvent('Keyframe revised', `${frame.year}: ${frame.title}`); renderAll(); persistDraft(); }
    status(shared ? 'Keyframe revision saved for everyone in this room.' : 'Keyframe saved in this browser.', 'success');
  });
});
$('add-frame').addEventListener('click', () => action(async () => {
  rememberFrame();
  const base = currentFrame();
  const years = new Set(snapshot.frames.map(f => Number(f.year)));
  let year = Math.min(2200, Number(base.year)+2); while (years.has(year) && year<2200) year++;
  if (years.has(year)) { status('Choose a year below 2200 for another keyframe.', 'error'); return; }
  const content = {title:'A new possible future',year,summary:'',assumptions:base.assumptions||'',laws:[]};
  content.summary = draftFutureParagraph(previousFrame(snapshot.frames,{...content,id:'new'}),content);
  if (shared) { const data = await api(roomPath()+'/frames',content); selectedFrame = data.frames.find(f => f.year===year && f.title===content.title)?.id || selectedFrame; dirty.delete('frame'); applySnapshot(data); }
  else { const frame={...content,id:'draft-'+crypto.randomUUID(),revision:0}; snapshot.frames.push(frame); selectedFrame=frame.id; dirty.delete('frame'); renderAll(); updateRoute({push:true}); persistDraft(); }
  status(shared ? 'New keyframe created. Add proposed laws and shape its world.' : 'New draft keyframe created. Add proposed laws and shape its world.', 'success');
}));

$('attach-law').addEventListener('click', () => {
  const proposal = catalog.find(l => l.id===$('law-select').value); if(!proposal) return;
  const frame=currentFrame();
  if(frame.laws.some(l=>l.id===proposal.id)){status('That law is already connected to this keyframe.');return;}
  if(frame.laws.length>=10){status('Each keyframe can connect up to 10 proposed laws.', 'error');return;}
  frame.laws.push({id:proposal.id,title:proposal.title,change:proposal.illustrativeLocalOption||proposal.sharedGoal||''});
  renderLaws(); markDirty('frame'); $('law-select').value='';
});
$('add-new-law').addEventListener('click', () => {
  const title=$('new-law-title').value.trim(),change=$('new-law-change').value.trim();
  if(!title){$('new-law-title').focus();status('Give the proposed law a title.', 'error');return;}
  if(currentFrame().laws.length>=10){status('Each keyframe can connect up to 10 proposed laws.', 'error');return;}
  currentFrame().laws.push({id:'PROPOSED-'+crypto.randomUUID(),title,change});
  $('new-law-title').value='';$('new-law-change').value='';renderLaws();markDirty('frame');
});
$('frame-laws').addEventListener('click',event=>{
  const button=event.target.closest('[data-remove-law]');if(!button)return;
  currentFrame().laws.splice(Number(button.dataset.removeLaw),1);renderLaws();markDirty('frame');
});
$('frame-history').addEventListener('toggle',()=>{if($('frame-history').open)loadFrameHistory();});
$('older-frame-history').addEventListener('click',()=>loadFrameHistory(true));
$('contribution-text').addEventListener('input',()=>markDirty('contribution'));
$('contribution-form').addEventListener('submit',event=>{
  event.preventDefault();action(async()=>{
    const text=$('contribution-text').value.trim();if(!text)return;
    if(shared)applySnapshot(await api(roomPath()+'/contributions',{frameId:currentFrame().id,text}),['contribution']);
    else{localEvent('Draft contribution',text);dirty.delete('contribution');renderActivity();}
    $('contribution-text').value='';persistDraft();status(shared?'Your contribution was saved in the shared room.':'Your contribution was saved in this browser.', 'success');
  });
});
$('copy-room').addEventListener('click',()=>action(async()=>{
  await navigator.clipboard.writeText(location.href);status('Collaboration link copied. Everyone with this link can contribute to the keyframes.', 'success');
}));
$('export-room').addEventListener('click',()=>{
  rememberFrame();
  const output={format:'helios-research-plan/v1',exportedAt:new Date().toISOString(),...snapshot,
    room:{...snapshot.room,...(dirty.has('brief')?briefInput():{})},frames:snapshot.frames.map(f=>({...f,...frameDrafts.get(f.id)})),
    loadedTaskDetails: shared ? [...taskDetails.values()] : [],
    provenance:{mode:shared?'shared-room':'browser-draft',hasUnsavedChanges:dirty.size>0||frameDrafts.size>0,scenarioOnly:true,connectedWorkers:snapshot.connectedWorkers||0,taskDetailCoverage:shared?'Task list is a summary. Loaded task details are included separately; additional details are available through the room API.':'All browser draft task details included.'}};
  const blob=new Blob([JSON.stringify(output,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='helios-research-keyframes.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  status('Research inputs, task plan, laws, keyframes, and draft revisions exported.', 'success');
});
$('reload-room').addEventListener('click',()=>action(async()=>{
  if(!shared)return;
  const next=await api(roomPath());
  frameDrafts.clear();dirty.clear();$('reload-room').hidden=true;applySnapshot(next);status('Loaded the latest saved room. Exported drafts remain available in your download.', 'success');
}));
addEventListener('popstate',()=>{
  const route=new URLSearchParams(location.search),room=route.get('room');
  if(room!==(shared?snapshot.room.id:null)){location.reload();return;}
  rememberFrame();dirty.delete('frame');selectedFrame=route.get('frame')||snapshot.frames[0]?.id;renderTimeline();renderFrame();persistDraft();
});
addEventListener('beforeunload',()=>persistDraft());

async function poll() {
  clearTimeout(pollTimer);
  if(shared&&sharedReady&&!busy&&document.visibilityState==='visible'&&dirty.size===0&&frameDrafts.size===0){
    try{applySnapshot(await api(roomPath()));}catch{status('Shared updates could not be refreshed. Your current view and drafts are preserved.', 'error');}
  }
  pollTimer=setTimeout(poll,25000+Math.random()*10000);
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')poll();});

async function init(){
  try{savedDraft=safeParse(localStorage.getItem(storageKey));}catch{}
  if(savedDraft?.snapshot?.room&&Array.isArray(savedDraft.snapshot.frames)&&savedDraft.snapshot.frames.length){
    snapshot=savedDraft.snapshot;snapshot.tasks||=[];snapshot.activity||=[];
    selectedFrame=params.get('frame')||savedDraft.selectedFrame||snapshot.frames[0]?.id;selectedTask=savedDraft.selectedTask;
    for(const [id,value] of savedDraft.frameDrafts||[])frameDrafts.set(id,value);
  }
  renderAll();
  if(savedDraft){
    if(savedDraft.brief){for(const [id,key] of [['room-title','title'],['research-brief','brief'],['research-inputs','inputData'],['research-constraints','constraints'],['agent-capacity','agentCount'],['agent-concurrency','maxConcurrent'],['collaborator-target','collaboratorGoal']])$(id).value=savedDraft.brief[key];dirty.add('brief');bases.brief=savedDraft.bases?.brief??snapshot.room.revision;}
    if(savedDraft.task&&currentTask()?.id===savedDraft.task.id){$('task-notes').value=savedDraft.task.notes;$('task-review').value=savedDraft.task.status;dirty.add('task');bases.task=savedDraft.task.revision;}
    if(savedDraft.contribution){$('contribution-text').value=savedDraft.contribution;dirty.add('contribution');}
  }
  const [capabilityResult,catalogResult]=await Promise.allSettled([
    api('/api/research/status'),fetch('./public/law-catalog.json').then(r=>r.ok?r.json():Promise.reject(new Error('Catalog unavailable'))),
  ]);
  if(capabilityResult.status==='fulfilled')capabilities=capabilityResult.value;
  if(catalogResult.status==='fulfilled')catalog=catalogResult.value.goals||[];
  else catalog=snapshot.frames.flatMap(f=>f.laws).filter((law,i,all)=>all.findIndex(x=>x.id===law.id)===i);
  for(const law of catalog){const option=textNode('option',`${law.id} · ${law.title}`);option.value=law.id;$('law-select').append(option);}
  if(shared){
    try{
      await ensureSession();
      const next=await api(`/api/research/rooms/${encodeURIComponent(requestedRoom)}`);
      applySnapshot(next);
      status(dirty.size?'Shared room loaded. Your unsaved browser draft is preserved; save when ready.':'Connected to the shared room. Saved edits refresh automatically while you are not typing.', 'success');
    }catch(error){status(`${error.message} This shared room has not loaded. No changes will be sent until the connection is restored.`, 'error');$('reload-room').hidden=false;}
  }else status(capabilities.writable?'Browser draft ready. Create a shared room to save together and invite collaborators.':'Shared persistence is currently unavailable. You can design, save, and export a browser draft here.');
  renderControls();poll();
  if(location.hash==='#keyframes')$('keyframes').scrollIntoView();
}

init().catch(error=>status(`The workspace could not finish loading: ${error.message}`, 'error'));
