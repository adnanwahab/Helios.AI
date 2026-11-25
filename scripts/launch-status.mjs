import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const source = new URL('../public/launch-checklist.json',import.meta.url);
const output = new URL('../docs/launch/STATUS.md',import.meta.url);
const data = JSON.parse(await readFile(source,'utf8'));
const labels = {done:'Done',in_progress:'In progress',ready:'Ready to run',blocked:'Blocked',pending:'Not started'};
const done = data.tasks.filter(task=>task.status==='done').length;
const lines = ['# Helios launch status','',`**${done} / ${data.tasks.length} tasks complete.** Target: December 1, 2026, subject to readiness.`,`Snapshot: ${data.updatedAt}. User-facing dates use ${data.timezone}.`,'','[Dashboard preview](https://deploy-preview-75--heliosailol.netlify.app/launch) · [Launch PR](https://github.com/adnanwahab/HeliosHTML/pull/75)','','This file is generated from `public/launch-checklist.json`. A prepared plan does not count as an executed task. Work in this PR is available in its preview; it reaches production after review and merge.',''];
for (const phase of data.phases) {
  lines.push(`## ${phase.title} — ${phase.dates}`,'');
  for (const task of data.tasks.filter(task=>task.phase===phase.id)) {
    lines.push(`- [${task.status==='done'?'x':' '}] **${task.id}: ${task.title}** — ${labels[task.status]}`,`  ${task.summary}`);
    if (task.nextAction) lines.push(`  Next: ${task.nextAction}`);
    lines.push(`  Evidence: ${task.evidence.map(item=>`[${item.label}](${item.url})`).join(' · ')||'Not yet recorded'}.`,'');
  }
}
lines.push('## Update the dashboard','','1. Change the task record in `public/launch-checklist.json`, including evidence and the next action.','2. Use `done` only after the stated outcome happened; provide `completedAt` and an inspectable evidence URL.','3. Update `updatedAt` and run `bun run launch:sync`.','4. Run `bun --no-env-file test test/launch-dashboard.test.js` and include the updated status in the PR.','','Role labels name the responsible function; they are not claims that volunteers have accepted assignments. Do not include private contact lists, credentials, or private journal content.','');
const text = lines.join('\n');
if (process.argv.includes('--write')) { await writeFile(output,text); console.log(`Updated ${fileURLToPath(output)}`); }
else if (process.argv.includes('--check')) { if (await readFile(output,'utf8')!==text) { console.error('Launch status is stale. Run bun run launch:sync.'); process.exitCode=1; } else console.log('Launch status matches its evidence source.'); }
else console.log(text);
