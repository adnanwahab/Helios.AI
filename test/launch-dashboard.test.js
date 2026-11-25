import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {summarizeTasks} from '../public/launch-dashboard.js';

const checklist=JSON.parse(readFileSync(new URL('../public/launch-checklist.json',import.meta.url),'utf8'));
const statuses=new Set(['done','in_progress','blocked','ready','pending']);

test('launch checklist preserves all 22 tasks and their five phases',()=>{
 expect(checklist.schemaVersion).toBe(1);
 expect(checklist.launchTarget).toBe('2026-12-01');
 expect(checklist.timezone).toBe('America/Chicago');
 expect(Number.isFinite(Date.parse(checklist.updatedAt))).toBe(true);
 expect(checklist.tasks.map(task=>task.id).sort()).toEqual(Array.from({length:22},(_,i)=>'L'+String(i+1).padStart(2,'0')));
 const phases=new Set(checklist.phases.map(phase=>phase.id));
 expect(phases).toEqual(new Set(['foundation','contributing','community','recruitment','launch']));
 expect(Object.fromEntries([...phases].map(phase=>[phase,checklist.tasks.filter(task=>task.phase===phase).length]))).toEqual({foundation:4,contributing:6,community:4,recruitment:4,launch:4});
 for(const task of checklist.tasks){
  expect(phases.has(task.phase)).toBe(true);
  expect(statuses.has(task.status)).toBe(true);
  expect(task.title.trim().length).toBeGreaterThan(10);
  expect(task.owner.trim().length).toBeGreaterThan(0);
  expect(task.summary.trim().length).toBeGreaterThan(0);
 }
 // Progress is calculated from the task records, never a separately edited counter.
 expect(checklist.completedCount).toBeUndefined();
 expect(checklist.progress).toBeUndefined();
});

test('progress counts completed work without credit for prepared or blocked work',()=>{
 expect(summarizeTasks([{status:'done'},{status:'ready'},{status:'blocked'},{status:'in_progress'},{status:'pending'},{status:'done'}])).toEqual({done:2,ready:1,blocked:1,in_progress:1,pending:1,total:6});
 for(const status of ['unknown','constructor','toString'])expect(()=>summarizeTasks([{status}])).toThrow();
});

test('completed launch work has dated evidence; unfinished work has a next action',()=>{
 for(const task of checklist.tasks){
  expect(Array.isArray(task.evidence)).toBe(true);
  if(task.status==='done'){
   expect(task.evidence.length).toBeGreaterThan(0);
   expect(Number.isFinite(Date.parse(task.completedAt))).toBe(true);
   expect(Date.parse(task.completedAt)).toBeLessThanOrEqual(Date.parse(checklist.updatedAt));
  }else{
   expect(task.completedAt).toBeNull();
   expect(typeof task.nextAction).toBe('string');
   expect(task.nextAction.trim().length).toBeGreaterThan(0);
  }
  for(const evidence of task.evidence){
   expect(evidence.label.trim().length).toBeGreaterThan(0);
   const url=new URL(evidence.url,'https://helios.example/');
   expect(['https:','http:'].includes(url.protocol)).toBe(true);
   expect(url.username).toBe('');expect(url.password).toBe('');
  }
 }
});
