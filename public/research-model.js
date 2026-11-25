// Pure, deterministic planning helpers. These describe scenarios, not measured forecasts.
export const RESEARCH_ROLES = [
  {id: 'discover', name: 'Discovery', short: 'D', color: '#a69bff', task: 'Map existing proposals and the people affected. Identify useful questions and missing sources.'},
  {id: 'evidence', name: 'Evidence', short: 'E', color: '#66d9dc', task: 'Check claims against primary sources. Record citations, uncertainty, and conflicting evidence.'},
  {id: 'model', name: 'Simulation', short: 'M', color: '#bce88b', task: 'Compare a baseline with a proposed change. State assumptions, sensitivity, and measurable outcomes.'},
  {id: 'critique', name: 'Critique', short: 'C', color: '#edb07d', task: 'Find failure modes, distributional effects, legal questions, and the strongest counterargument.'},
  {id: 'synthesis', name: 'Synthesis', short: 'S', color: '#e596c6', task: 'Combine reviewed findings into a proposed law and future keyframe. Preserve disagreement and provenance.'},
];

export function makeTaskPlan(room) {
  const count = Math.min(1000, Math.max(100, Math.trunc(Number(room.agentCount) || 100)));
  return Array.from({length: count}, (_, i) => {
    const role = RESEARCH_ROLES[Math.min(4, Math.floor(i * 5 / count))];
    return {id: `draft-agent-${i + 1}`, slot: i + 1, role: role.id, status: 'planned', revision: 0,
      prompt: `${room.brief}\n\n${role.task}\n\nResearch inputs:\n${room.inputData}\n\nConstraints:\n${room.constraints}`,
      notes: '', result: null};
  });
}

export function createDraftWorkspace() {
  const room = {
    id: null, title: 'A city we can design together',
    brief: 'How could housing, shared public places, and better everyday journeys make a city more welcoming by 2036?',
    inputData: 'The Helios 100 proposed laws\nLocal housing and transport data\nOpted-in stories and community priorities\nPrimary research, with source links',
    constraints: 'Keep participation voluntary. Show who benefits and who may be left out. Cite evidence, preserve disagreement, and send every recommendation to human review.',
    agentCount: 100, maxConcurrent: 20, collaboratorGoal: 1000,
    paused: true, revision: 0, canSupervise: true,
  };
  return {room, frames: [
    {id: 'present', title: 'The world we begin with', year: 2026, revision: 0,
      summary: 'People share the same city, but their everyday opportunities are uneven. Homes, public places, and dependable journeys form the starting point for our shared research.',
      assumptions: 'Collect a local baseline before comparing outcomes. This scene is an illustration.',
      laws: [{id: 'HGA-001', title: 'Easy Access to Public Help', change: 'Begin by making existing help easier to discover.'}]},
    {id: 'first-pilots', title: 'Small experiments, shared learning', year: 2028, revision: 0,
      summary: 'A few neighborhoods could test more flexible homes and welcoming places to meet. Residents compare what changed, document friction, and revise the next set of proposals together.',
      assumptions: 'Local permission, accessible participation, stable pilot funding, and independent evaluation.',
      laws: [{id: 'HGA-012', title: 'Flexible Homes for Changing Families', change: 'Test code-compliant backyard homes with local safeguards.'}, {id: 'HGA-051', title: 'Welcoming Community Places', change: 'Open accessible gathering spaces with a funded operating plan.'}]},
    {id: 'connected-city', title: 'Connect what works', year: 2032, revision: 0,
      summary: 'Successful local pilots could begin to connect: more kinds of homes, useful public places, and shorter everyday journeys. Communities retain the ability to adapt or stop changes that do not help.',
      assumptions: 'Independent evaluations find benefits, maintenance is funded, and residents support expansion.',
      laws: [{id: 'HGA-051', title: 'Welcoming Community Places', change: 'Expand spaces that demonstrate broad, repeat participation.'}]},
    {id: 'shared-future', title: 'A future worth revising', year: 2036, revision: 0,
      summary: 'People could help shape their surroundings as an ordinary part of civic life. Shared evidence and open revisions make it easier to improve what works and rethink what does not.',
      assumptions: 'Participation remains voluntary and accessible. Outcomes remain open to independent challenge.',
      laws: [{id: 'HGA-012', title: 'Flexible Homes for Changing Families', change: 'Revise housing rules against measured affordability and safety outcomes.'}]},
  ], tasks: [], activity: [], contributors: 0, connectedWorkers: 0};
}

export function previousFrame(frames, frame) {
  return [...frames].filter(f => f.id !== frame.id && Number(f.year) < Number(frame.year))
    .sort((a, b) => Number(b.year) - Number(a.year))[0] || null;
}

export function draftFutureParagraph(previous, current) {
  const start = previous ? `Since the ${previous.year} keyframe, “${previous.title},”` : `At the ${current.year} starting keyframe,`;
  const years = previous ? Math.max(0, Number(current.year) - Number(previous.year)) : 0;
  const horizon = years ? ` the next ${years} ${years === 1 ? 'year could' : 'years could'} bring a shift toward “${current.title}.”` : ` the shared scenario begins with “${current.title}.”`;
  const laws = (current.laws || []).filter(l => l.title?.trim());
  const proposals = laws.length
    ? ` Proposed laws in this frame include ${laws.map(l => l.title.trim()).join('; ')}. ${laws.map(l => l.change?.trim()).filter(Boolean).join(' ')}`
    : ' Collaborators can add proposed laws to explain which changes might make this future possible.';
  const assumptions = current.assumptions?.trim() ? ` This depends on ${current.assumptions.trim().replace(/[.!?]$/, '')}.` : ' The research team still needs to state the assumptions, resources, and practical limits.';
  const continuity = previous?.summary?.trim() ? ` The previous frame described: ${previous.summary.trim()}` : '';
  return `${start}${horizon}${continuity}${proposals}${assumptions} Residents and reviewers would compare the results with the earlier baseline and revise the proposals if the expected benefits do not appear.`;
}

export function interpolateFrames(frames, year) {
  const sorted = [...frames].sort((a, b) => Number(a.year) - Number(b.year));
  if (!sorted.length) return {from: null, to: null, progress: 0, year: Number(year)};
  const clamped = Math.min(Number(sorted.at(-1).year), Math.max(Number(sorted[0].year), Number(year)));
  let from = sorted[0], to = sorted.at(-1);
  for (const frame of sorted) { if (Number(frame.year) <= clamped) from = frame; if (Number(frame.year) >= clamped) { to = frame; break; } }
  const range = Number(to.year) - Number(from.year);
  return {from, to, progress: range ? (clamped - Number(from.year)) / range : 0, year: clamped};
}

export function frameContent(frame) {
  return {title: frame.title, year: Number(frame.year), summary: frame.summary || '', assumptions: frame.assumptions || '', laws: (frame.laws || []).map(l => ({id: l.id, title: l.title, change: l.change || ''}))};
}
