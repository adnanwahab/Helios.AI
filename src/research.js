import {randomUUID} from 'node:crypto';

// Research rooms use the same private, transactional database as the civic
// store. They are a control plane: creating a plan never invokes an AI provider.
export const RESEARCH_TABLES = ['research_rooms', 'research_frames', 'research_frame_versions', 'research_tasks', 'research_task_outputs', 'research_activity', 'research_contributors'];
export const RESEARCH_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS research_rooms(
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL,
    brief TEXT NOT NULL, input_data TEXT NOT NULL, constraints_text TEXT NOT NULL,
    agent_count INTEGER NOT NULL CHECK(agent_count BETWEEN 100 AND 1000),
    max_concurrent INTEGER NOT NULL CHECK(max_concurrent BETWEEN 1 AND 100),
    collaborator_goal INTEGER NOT NULL CHECK(collaborator_goal BETWEEN 1 AND 10000),
    paused BOOLEAN NOT NULL DEFAULT true, revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS research_frames(
    id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES research_rooms(id),
    title TEXT NOT NULL, year INTEGER NOT NULL, summary TEXT NOT NULL,
    assumptions TEXT NOT NULL, laws TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS research_frames_room ON research_frames(room_id, year, id)',
  `CREATE TABLE IF NOT EXISTS research_frame_versions(
    frame_id TEXT NOT NULL REFERENCES research_frames(id), revision INTEGER NOT NULL,
    content TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY(frame_id, revision))`,
  `CREATE TABLE IF NOT EXISTS research_tasks(
    id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES research_rooms(id),
    slot INTEGER NOT NULL, role TEXT NOT NULL, prompt TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('queued','running','needs_review','approved','rejected')),
    notes TEXT NOT NULL DEFAULT '', result TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL DEFAULT 1, attempt INTEGER NOT NULL DEFAULT 0,
    worker_id TEXT, lease_token TEXT, lease_until BIGINT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(room_id,slot),
    CHECK((status='running')=(worker_id IS NOT NULL AND lease_token IS NOT NULL AND lease_until IS NOT NULL)))`,
  'CREATE INDEX IF NOT EXISTS research_tasks_queue ON research_tasks(room_id,status,slot)',
  `CREATE TABLE IF NOT EXISTS research_task_outputs(
    task_id TEXT NOT NULL REFERENCES research_tasks(id), attempt INTEGER NOT NULL,
    result TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(task_id,attempt))`,
  `CREATE TABLE IF NOT EXISTS research_activity(
    id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES research_rooms(id),
    actor TEXT NOT NULL, kind TEXT NOT NULL, frame_id TEXT, task_id TEXT,
    text TEXT NOT NULL, created_at TEXT NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS research_activity_room ON research_activity(room_id,created_at DESC,id DESC)',
  `CREATE TABLE IF NOT EXISTS research_contributors(
    room_id TEXT NOT NULL REFERENCES research_rooms(id), actor TEXT NOT NULL,
    joined_at TEXT NOT NULL, PRIMARY KEY(room_id,actor))`,
];

export const RESEARCH_ROLES = ['discover', 'evidence', 'model', 'critique', 'synthesis'];
const rolePrompts = {
  discover: 'Identify research questions, affected groups, and alternative proposals. Preserve disagreements and cite sources.',
  evidence: 'Check primary evidence for the proposed laws. Record source URLs, dates, uncertainty, and contradictory findings.',
  model: 'Describe an explicit scenario model between keyframes. State assumptions, measures, and failure conditions; do not present projections as predictions.',
  critique: 'Review the evidence and proposed laws for omissions, unintended effects, feasibility, and safeguards. Request changes where evidence is missing.',
  synthesis: 'Synthesize reviewed findings into a proposed keyframe paragraph and draft law changes. Preserve minority concerns; submit for human review.',
};
const id = prefix => prefix + '-' + randomUUID();
const now = () => new Date().toISOString();
const publicFrame = row => ({id: row.id, title: row.title, year: row.year, summary: row.summary, assumptions: row.assumptions, laws: JSON.parse(row.laws), revision: row.revision});
const publicTask = row => ({id: row.id, slot: row.slot, role: row.role, prompt: row.prompt, status: row.status, notes: row.notes, result: row.result, revision: row.revision, attempt: row.attempt, leaseExpiresAt: row.lease_until ? new Date(Number(row.lease_until)).toISOString() : null});
const taskSummary = row => ({id: row.id, slot: row.slot, role: row.role, status: row.status, revision: row.revision, attempt: row.attempt, hasResult: Boolean(row.has_result), leaseExpiresAt: row.lease_until ? new Date(Number(row.lease_until)).toISOString() : null});

export function researchStore(db, Problem) {
  const fail = (status, message) => { throw new Problem(status, message); };
  const shape = (input, allowed) => {
    if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(key => !allowed.includes(key))) fail(400, 'Invalid research fields.');
  };
  const text = (value, label, max, required = false) => {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, `${label} must be ${required ? '1–' : '0–'}${max} characters.`);
    return value.normalize('NFC').trim();
  };
  const integer = (value, label, min, max) => {
    if (!Number.isInteger(value) || value < min || value > max) fail(400, `${label} must be an integer from ${min} to ${max}.`);
    return value;
  };
  const revision = (input, current) => {
    if (!Number.isInteger(input.revision) || input.revision !== current.revision) fail(409, 'This item changed while you were editing. Reload the shared version; your draft has not been saved.');
  };
  const roomInput = (input, defaults = false) => ({
    title: text(input.title ?? (defaults ? 'A future we can design together' : undefined), 'Title', 160, true),
    brief: text(input.brief ?? (defaults ? '' : undefined), 'Research brief', 6000),
    inputData: text(input.inputData ?? (defaults ? '' : undefined), 'Research inputs', 12000),
    constraints: text(input.constraints ?? (defaults ? '' : undefined), 'Constraints', 4000),
    agentCount: integer(input.agentCount ?? (defaults ? 100 : undefined), 'Agent capacity', 100, 1000),
    maxConcurrent: integer(input.maxConcurrent ?? (defaults ? 20 : undefined), 'Concurrent worker limit', 1, 100),
    collaboratorGoal: integer(input.collaboratorGoal ?? (defaults ? 1000 : undefined), 'Collaborator target', 1, 10000),
  });
  const frameInput = input => {
    shape(input, ['revision', 'title', 'year', 'summary', 'assumptions', 'laws']);
    const laws = input.laws ?? [];
    if (!Array.isArray(laws) || laws.length > 10) fail(400, 'A keyframe can contain at most 10 proposed laws.');
    const seen = new Set();
    return {
      title: text(input.title, 'Keyframe title', 160, true),
      year: integer(input.year, 'Keyframe year', 2020, 2200),
      summary: text(input.summary ?? '', 'Future projection', 6000),
      assumptions: text(input.assumptions ?? '', 'Assumptions', 4000),
      laws: laws.map(law => {
        shape(law, ['id', 'title', 'change']);
        const lawId = text(law.id, 'Law ID', 100, true);
        if (seen.has(lawId)) fail(400, 'Use each proposed law only once in a keyframe.');
        seen.add(lawId);
        return {id: lawId, title: text(law.title, 'Law title', 240, true), change: text(law.change ?? '', 'Proposed change', 2000)};
      }),
    };
  };
  async function room(q, roomId, actor, supervise = false, lock = false) {
    const row = (await q.query('SELECT * FROM research_rooms WHERE id=$1' + (lock === 'share' ? ' FOR SHARE' : lock ? ' FOR UPDATE' : ''), [roomId])).rows[0];
    if (!row) fail(404, 'Research room not found.');
    if (supervise && row.owner !== actor) fail(403, 'Only the room creator can supervise this pipeline. You can contribute to its keyframes.');
    return row;
  }
  async function activity(q, roomId, actor, kind, message, {frameId = null, taskId = null, contributor = true} = {}) {
    const timestamp = now();
    await q.query('INSERT INTO research_activity(id,room_id,actor,kind,frame_id,task_id,text,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id('event'), roomId, actor, kind, frameId, taskId, message, timestamp]);
    if (contributor) await q.query('INSERT INTO research_contributors(room_id,actor,joined_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [roomId, actor, timestamp]);
  }
  async function snapshot(roomId, actor) {
    // One transaction provides a bounded, coherent read of the shared room.
    return db.transaction(async q => {
      const r = await room(q, roomId, actor, false, 'share');
      const frames = (await q.query('SELECT * FROM research_frames WHERE room_id=$1 ORDER BY year,id', [roomId])).rows;
      const tasks = (await q.query("SELECT id,slot,role,status,revision,attempt,worker_id,lease_until,(result<>'') AS has_result FROM research_tasks WHERE room_id=$1 ORDER BY slot LIMIT 1000", [roomId])).rows;
      const events = (await q.query('SELECT id,kind,frame_id,task_id,text,created_at FROM research_activity WHERE room_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50', [roomId])).rows;
      const contributors = Number((await q.query('SELECT COUNT(*) AS n FROM research_contributors WHERE room_id=$1', [roomId])).rows[0].n);
      const connectedWorkers = new Set(tasks.filter(t => t.status === 'running' && Number(t.lease_until) > Date.now()).map(t => t.worker_id)).size;
      return {
        room: {id: r.id, title: r.title, brief: r.brief, inputData: r.input_data, constraints: r.constraints_text, agentCount: r.agent_count, maxConcurrent: r.max_concurrent, collaboratorGoal: r.collaborator_goal, paused: r.paused, revision: r.revision, canSupervise: r.owner === actor},
        frames: frames.map(publicFrame), tasks: tasks.map(taskSummary),
        activity: events.map(e => ({id: e.id, kind: e.kind, frameId: e.frame_id, taskId: e.task_id, text: e.text, createdAt: e.created_at})),
        contributors, connectedWorkers,
      };
    });
  }
  async function taskDetail(roomId, taskId) {
    const row = (await db.query('SELECT * FROM research_tasks WHERE room_id=$1 AND id=$2', [roomId, taskId])).rows[0];
    if (!row) fail(404, 'Research task not found.');
    return publicTask(row);
  }
  async function listRooms(actor) {
    if (!actor) return {rooms:[],limit:30};
    const rows = (await db.query(`SELECT r.id,r.title,r.paused,r.updated_at,(r.owner=$1) AS can_supervise
      FROM research_rooms r WHERE r.owner=$1 OR EXISTS
      (SELECT 1 FROM research_contributors c WHERE c.room_id=r.id AND c.actor=$1)
      ORDER BY r.updated_at DESC,r.id LIMIT 30`,[actor])).rows;
    return {rooms:rows.map(row=>({id:row.id,title:row.title,paused:row.paused,updatedAt:row.updated_at,canSupervise:row.can_supervise})),limit:30};
  }
  async function workerStatus() {
    const row = (await db.query("SELECT COUNT(*) AS leases,COUNT(DISTINCT worker_id) AS workers,MAX(updated_at) AS last_seen FROM research_tasks WHERE status='running' AND lease_until>$1", [Date.now()])).rows[0];
    return {activeWorkerLeases: Number(row.leases), connectedWorkers: Number(row.workers), lastWorkerActivityAt: row.last_seen ?? null};
  }
  async function frameHistory(roomId, frameId, beforeRevision) {
    const before = beforeRevision == null ? 2147483647 : integer(Number(beforeRevision), 'History cursor', 1, 2147483647);
    if (!(await db.query('SELECT id FROM research_frames WHERE room_id=$1 AND id=$2', [roomId, frameId])).rows.length) fail(404, 'Keyframe not found.');
    const rows = (await db.query('SELECT revision,content,created_at FROM research_frame_versions WHERE frame_id=$1 AND revision<$2 ORDER BY revision DESC LIMIT 21', [frameId, before])).rows;
    const visible = rows.slice(0, 20);
    return {versions: visible.map(r => ({revision: r.revision, content: JSON.parse(r.content), createdAt: r.created_at})), nextBeforeRevision: rows.length > 20 ? visible.at(-1).revision : null};
  }
  async function insertFrame(q, roomId, input, actor) {
    const f = frameInput(input), frameId = id('frame'), timestamp = now();
    await q.query('INSERT INTO research_frames(id,room_id,title,year,summary,assumptions,laws,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8)', [frameId, roomId, f.title, f.year, f.summary, f.assumptions, JSON.stringify(f.laws), timestamp]);
    await q.query('INSERT INTO research_frame_versions(frame_id,revision,content,actor,created_at) VALUES($1,1,$2,$3,$4)', [frameId, JSON.stringify(f), actor, timestamp]);
    return frameId;
  }
  const defaultFrames = () => [
    {title: 'Our starting point', year: 2026, summary: 'We begin with questions about homes, shared places, and public learning. The team records its starting assumptions before proposing changes.', assumptions: 'Baseline conditions must be checked against local evidence.', laws: []},
    {title: 'First local experiments', year: 2028, summary: 'Since the starting keyframe, small housing and public-space pilots could begin. Residents would compare the results with the baseline and revise proposed laws after review.', assumptions: 'Pilots receive local approval, funding, and measurable evaluation.', laws: [{id: 'HGA-012', title: 'Flexible Homes for Changing Families', change: 'Explore a limited housing pilot with infrastructure and affordability safeguards.'}]},
    {title: 'A connected neighborhood', year: 2032, summary: 'If the earlier pilots meet their stated goals, more neighborhoods could gain shared gathering places. The team would keep unsuccessful approaches visible and revise them before expansion.', assumptions: 'Expansion depends on measured outcomes and continued public participation.', laws: [{id: 'HGA-051', title: 'Welcoming Community Places', change: 'Propose accessible neighborhood spaces and test ongoing operating costs.'}]},
    {title: 'A world that keeps learning', year: 2036, summary: 'Since the previous keyframe, communities could compare results across places and update the laws that shaped them. This is a shared scenario to investigate, with uncertainty preserved.', assumptions: 'Knowledge remains accessible; communities choose their own adaptations.', laws: [{id: 'DRAFT-LAB', title: 'Communal Science Lab', change: 'Draft a public computing and research-lab pilot with open evidence and consent.'}]},
  ];
  async function createIn(q, input, actor) {
    shape(input, ['title', 'brief', 'inputData', 'constraints', 'agentCount', 'maxConcurrent', 'collaboratorGoal', 'frames']);
    const r = roomInput(input, true), roomId = id('room'), timestamp = now();
    const frames = input.frames ?? defaultFrames();
    if (!Array.isArray(frames) || frames.length < 1 || frames.length > 24) fail(400, 'Provide 1–24 starting keyframes.');
    await q.query('INSERT INTO research_rooms(id,owner,title,brief,input_data,constraints_text,agent_count,max_concurrent,collaborator_goal,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)', [roomId, actor, r.title, r.brief, r.inputData, r.constraints, r.agentCount, r.maxConcurrent, r.collaboratorGoal, timestamp]);
    for (const f of frames) await insertFrame(q, roomId, f, actor);
    await activity(q, roomId, actor, 'room_created', 'Created a shared research room. Worker dispatch starts paused.');
    return {roomId};
  }
  async function writeIn(q, roomId, action, targetId, input, actor) {
    const ownerActions = ['brief', 'plan', 'control', 'tasks'];
    const r = await room(q, roomId, actor, ownerActions.includes(action), true);
    if (action === 'brief') {
      shape(input, ['revision', 'title', 'brief', 'inputData', 'constraints', 'agentCount', 'maxConcurrent', 'collaboratorGoal']);
      revision(input, r); const next = roomInput(input);
      const count = Number((await q.query('SELECT COUNT(*) AS n FROM research_tasks WHERE room_id=$1', [roomId])).rows[0].n);
      if (count && next.agentCount !== r.agent_count) fail(409, 'This room already has a task plan. Create a new room to change its agent capacity; existing results are preserved.');
      await q.query('UPDATE research_rooms SET title=$2,brief=$3,input_data=$4,constraints_text=$5,agent_count=$6,max_concurrent=$7,collaborator_goal=$8,revision=revision+1,updated_at=$9 WHERE id=$1', [roomId, next.title, next.brief, next.inputData, next.constraints, next.agentCount, next.maxConcurrent, next.collaboratorGoal, now()]);
      await activity(q, roomId, actor, 'brief_updated', 'Updated the research brief and supervision inputs. Existing task instructions remain in their original revision.');
    } else if (action === 'plan') {
      shape(input, ['revision']); revision(input, r);
      if ((await q.query('SELECT id FROM research_tasks WHERE room_id=$1 LIMIT 1', [roomId])).rows.length) fail(409, 'A task plan already exists. Review or retry its tasks; a new plan will not overwrite their history.');
      const params = [], values = [], timestamp = now();
      for (let slot = 1; slot <= r.agent_count; slot++) {
        const role = RESEARCH_ROLES[(slot - 1) % RESEARCH_ROLES.length];
        const prompt = `${rolePrompts[role]}\nResearch brief: ${r.brief.slice(0, 1200)}\nAssignment ${slot} of ${r.agent_count}. Read the current shared room inputs, assumptions, keyframes, and prior reviewed outputs before starting.`;
        values.push('(' + [id('task'), roomId, slot, role, prompt, 'queued', timestamp, timestamp].map(value => { params.push(value); return '$' + params.length; }).join(',') + ')');
      }
      await q.query('INSERT INTO research_tasks(id,room_id,slot,role,prompt,status,created_at,updated_at) VALUES' + values.join(','), params);
      await q.query('UPDATE research_rooms SET paused=true,revision=revision+1,updated_at=$2 WHERE id=$1', [roomId, timestamp]);
      await activity(q, roomId, actor, 'plan_created', `Queued ${r.agent_count} research assignments across five roles. Dispatch is paused until the supervisor enables it.`);
    } else if (action === 'control') {
      shape(input, ['revision', 'paused']); revision(input, r);
      if (typeof input.paused !== 'boolean') fail(400, 'Choose whether dispatch is paused.');
      await q.query('UPDATE research_rooms SET paused=$2,revision=revision+1,updated_at=$3 WHERE id=$1', [roomId, input.paused, now()]);
      await activity(q, roomId, actor, 'dispatch_changed', input.paused ? 'Paused new task claims. Existing worker leases may finish.' : 'Enabled task claims for connected, authorized workers.');
    } else if (action === 'tasks') {
      shape(input, ['revision', 'notes', 'status']);
      const task = (await q.query('SELECT * FROM research_tasks WHERE room_id=$1 AND id=$2 FOR UPDATE', [roomId, targetId])).rows[0];
      if (!task) fail(404, 'Research task not found.');
      revision(input, task); const notes = text(input.notes ?? task.notes, 'Supervisor notes', 4000);
      // Accept the revision the supervisor actually saw, then quarantine an
      // expired lease inside this same transaction before applying a retry.
      if (task.status === 'running' && Number(task.lease_until) <= Date.now()) {
        await expireLeases(q, roomId); task.status = 'needs_review';
      }
      const status = input.status ?? task.status;
      if (input.status !== undefined && !['queued', 'needs_review', 'approved', 'rejected'].includes(status)) fail(400, 'Only connected workers can mark a task running.');
      if (task.status === 'running' && status !== 'running') fail(409, 'This task has a live worker lease. Pause dispatch and wait for completion or lease expiry before changing its status.');
      if (status === 'approved' && task.status !== 'approved' && (task.status !== 'needs_review' || !task.result.trim())) fail(409, 'Only a completed result awaiting human review can be approved.');
      if (task.status === 'approved' && status !== 'approved') fail(409, 'An approved result is preserved. Create a new room for a new research cycle.');
      await q.query('UPDATE research_tasks SET notes=$3,status=$4,revision=revision+1,updated_at=$5 WHERE room_id=$1 AND id=$2', [roomId, targetId, notes, status, now()]);
      await activity(q, roomId, actor, 'task_reviewed', `Updated assignment ${task.slot}: ${status.replaceAll('_', ' ')}.`, {taskId: targetId});
    } else if (action === 'frames' && !targetId) {
      if (Number((await q.query('SELECT COUNT(*) AS n FROM research_frames WHERE room_id=$1', [roomId])).rows[0].n) >= 24) fail(409, 'This room has reached its 24-keyframe limit. Create another room to explore a new branch.');
      const frameId = await insertFrame(q, roomId, input, actor);
      await activity(q, roomId, actor, 'frame_created', 'Added a future keyframe and its proposed laws.', {frameId});
    } else if (action === 'frames') {
      const f = (await q.query('SELECT * FROM research_frames WHERE room_id=$1 AND id=$2 FOR UPDATE', [roomId, targetId])).rows[0];
      if (!f) fail(404, 'Keyframe not found.');
      const next = frameInput(input), timestamp = now(); revision(input, f);
      await q.query('UPDATE research_frames SET title=$3,year=$4,summary=$5,assumptions=$6,laws=$7,revision=revision+1,updated_at=$8 WHERE room_id=$1 AND id=$2', [roomId, targetId, next.title, next.year, next.summary, next.assumptions, JSON.stringify(next.laws), timestamp]);
      await q.query('INSERT INTO research_frame_versions(frame_id,revision,content,actor,created_at) VALUES($1,$2,$3,$4,$5)', [targetId, f.revision + 1, JSON.stringify(next), actor, timestamp]);
      await activity(q, roomId, actor, 'frame_updated', `Revised “${next.title}” to version ${f.revision + 1}.`, {frameId: targetId});
    } else if (action === 'contributions') {
      shape(input, ['frameId', 'text']);
      const message = text(input.text, 'Contribution', 4000, true);
      if (typeof input.frameId !== 'string' || !(await q.query('SELECT id FROM research_frames WHERE room_id=$1 AND id=$2', [roomId, input.frameId])).rows.length) fail(404, 'Keyframe not found.');
      await activity(q, roomId, actor, 'contribution', message, {frameId: input.frameId});
    } else fail(404, 'Research operation not found.');
    return {roomId};
  }
  async function expireLeases(q, roomId) {
    const expired = await q.query("UPDATE research_tasks SET status='needs_review',worker_id=NULL,lease_token=NULL,lease_until=NULL,revision=revision+1,updated_at=$3 WHERE room_id=$1 AND status='running' AND lease_until<=$2 RETURNING id", [roomId, Date.now(), now()]);
    if (expired.rows.length) await activity(q, roomId, 'worker-system', 'leases_expired', `${expired.rows.length} expired worker assignments require supervisor review.`, {contributor: false});
  }
  async function worker(action, input) {
    shape(input, action === 'claim' ? ['roomId', 'workerId'] : action === 'heartbeat' ? ['roomId', 'taskId', 'leaseToken'] : action === 'fail' ? ['roomId', 'taskId', 'leaseToken', 'errorCode'] : ['roomId', 'taskId', 'leaseToken', 'result']);
    const roomId = text(input.roomId, 'Room ID', 100, true);
    return db.transaction(async q => {
      const r = await room(q, roomId, null, false, true);
      await expireLeases(q, roomId);
      if (action === 'claim') {
        const workerId = text(input.workerId, 'Worker ID', 100, true);
        if (r.paused) return {task: null, paused: true};
        const running = (await q.query("SELECT worker_id FROM research_tasks WHERE room_id=$1 AND status='running'", [roomId])).rows;
        if (running.length >= r.max_concurrent || running.some(t => t.worker_id === workerId)) return {task: null, capacityReached: true};
        const task = (await q.query("SELECT * FROM research_tasks WHERE room_id=$1 AND status='queued' ORDER BY slot FOR UPDATE SKIP LOCKED LIMIT 1", [roomId])).rows[0];
        if (!task) return {task: null};
        const token = randomUUID(), until = Date.now() + 90000;
        const updated = (await q.query("UPDATE research_tasks SET status='running',worker_id=$3,lease_token=$4,lease_until=$5,attempt=attempt+1,revision=revision+1,updated_at=$6 WHERE room_id=$1 AND id=$2 RETURNING *", [roomId, task.id, workerId, token, until, now()])).rows[0];
        await activity(q, roomId, 'worker:' + workerId, 'worker_claimed', `A connected worker claimed assignment ${task.slot}.`, {taskId: task.id, contributor: false});
        // Give the runner a bounded snapshot of reviewed context. A worker does
        // not need browser credentials or arbitrary URL access to read it.
        const frames = (await q.query('SELECT * FROM research_frames WHERE room_id=$1 ORDER BY year,id LIMIT 8', [roomId])).rows.map(publicFrame).map(f => ({...f, summary:f.summary.slice(0,1200), assumptions:f.assumptions.slice(0,1000), laws:f.laws.map(l=>({...l,change:l.change.slice(0,500)}))}));
        const reviewed = (await q.query("SELECT id,role,result FROM research_tasks WHERE room_id=$1 AND status='approved' ORDER BY updated_at DESC,id LIMIT 5", [roomId])).rows.map(t=>({id:t.id,role:t.role,result:t.result.slice(0,2000)}));
        return {task: {...publicTask(updated), leaseToken: token}, room: {id: roomId, brief: r.brief, inputData: r.input_data, constraints: r.constraints_text, frames, reviewedOutputs: reviewed, contextNote: 'Bounded context: up to eight keyframes and five approved task excerpts.'}};
      }
      const taskId = text(input.taskId, 'Task ID', 100, true), token = text(input.leaseToken, 'Lease token', 100, true);
      const task = (await q.query("SELECT * FROM research_tasks WHERE room_id=$1 AND id=$2 AND status='running' AND lease_token=$3 AND lease_until>$4 FOR UPDATE", [roomId, taskId, token, Date.now()])).rows[0];
      if (!task) fail(409, 'This worker lease is stale. Stop work; its result was not accepted.');
      if (action === 'heartbeat') {
        const until = Date.now() + 90000;
        await q.query('UPDATE research_tasks SET lease_until=$3,updated_at=$4 WHERE room_id=$1 AND id=$2', [roomId, taskId, until, now()]);
        return {ok: true, leaseExpiresAt: new Date(until).toISOString(), paused: r.paused};
      }
      if (action === 'fail') {
        const failures = {provider_unavailable:'The model provider could not complete this assignment.', timeout:'The research request timed out.', no_output:'The provider returned no usable research output.', interrupted:'The worker stopped before completing this assignment.', heartbeat_unavailable:'The worker could not confirm its lease.'};
        if (!Object.hasOwn(failures, input.errorCode)) fail(400, 'Use a supported worker failure code.');
        const timestamp = now(), message = failures[input.errorCode];
        await q.query('INSERT INTO research_task_outputs(task_id,attempt,result,created_at) VALUES($1,$2,$3,$4)', [taskId, task.attempt, 'Worker failure (' + input.errorCode + '): ' + message, timestamp]);
        // A failure has no approvable result. Retry remains an explicit owner
        // action, so provider outages cannot silently spend on the whole queue.
        await q.query("UPDATE research_tasks SET status='needs_review',result='',notes=$3,worker_id=NULL,lease_token=NULL,lease_until=NULL,revision=revision+1,updated_at=$4 WHERE room_id=$1 AND id=$2", [roomId, taskId, (task.notes + '\nWorker failure: ' + message + ' Review and queue again to retry.').trim().slice(-4000), timestamp]);
        await q.query('UPDATE research_rooms SET paused=true,revision=revision+1,updated_at=$2 WHERE id=$1', [roomId, timestamp]);
        await activity(q, roomId, 'worker:' + task.worker_id, 'worker_failed', `Assignment ${task.slot} failed. Dispatch was paused for supervisor review. ${message}`, {taskId, contributor: false});
        return {ok:true,status:'needs_review',failed:true,paused:true};
      }
      const result = text(input.result, 'Worker result', 16000, true), timestamp = now();
      await q.query('INSERT INTO research_task_outputs(task_id,attempt,result,created_at) VALUES($1,$2,$3,$4)', [taskId, task.attempt, result, timestamp]);
      await q.query("UPDATE research_tasks SET status='needs_review',result=$3,worker_id=NULL,lease_token=NULL,lease_until=NULL,revision=revision+1,updated_at=$4 WHERE room_id=$1 AND id=$2", [roomId, taskId, result, timestamp]);
      await activity(q, roomId, 'worker:' + task.worker_id, 'result_submitted', `Assignment ${task.slot} submitted a result for human review.`, {taskId, contributor: false});
      return {ok: true, status: 'needs_review'};
    });
  }
  return {snapshot, taskDetail, listRooms, frameHistory, workerStatus, createIn, writeIn, worker};
}
