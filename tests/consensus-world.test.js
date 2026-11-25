import {test, expect} from 'bun:test';
import {cpuBatch, assertBatch, suggestEffects, evaluate, MAX_POPULATION, identity} from '../public/consensus-world-engine.js';
const request={start:4294967280,count:257,seed:20261125,day:0,effects:[-1,1,0,0,0,0,0,1],prior:Array(8).fill(0),compare:true};
test('paged totals match across the unsigned 32-bit identity boundary',()=>{
 const all=cpuBatch(request),a=cpuBatch({...request,count:16}),b=cpuBatch({...request,start:request.start+16,count:241});
 assertBatch(all,257,true);expect(Array.from(all)).toEqual(Array.from(a,(x,i)=>x+b[i]));
 expect(identity(0,request.seed)).not.toEqual(identity(4294967296,request.seed));
});
test('last agents fit in the eight billion population',()=>{
 const bins=cpuBatch({...request,start:MAX_POPULATION-100,count:100});assertBatch(bins,100,true);
 expect(()=>cpuBatch({...request,start:MAX_POPULATION-99,count:100})).toThrow();
});
test('unchanged assumptions preserve matched decisions',()=>{
 const bins=cpuBatch({...request,prior:request.effects});expect(bins[4]+bins[5]+bins[6]+bins[8]+bins[9]+bins[10]).toBe(0);
 expect(evaluate(7999999999,request.effects)).toEqual(evaluate(7999999999,request.effects));
});
test('duplicate clauses do not stack and negated clauses do not yield positive suggestions',()=>{
 expect(suggestEffects('Pilot program. Pilot program.').effects).toEqual(suggestEffects('Pilot program.').effects);
 expect(suggestEffects('No pilot program. We will not have a pilot program.').effects[7]).toBe(0);
});
test('unknown language remains unknown and comparable totals reconcile',()=>{
 expect(suggestEffects('Invent a completely novel object.').effects).toEqual(Array(8).fill(0));
 const bins=cpuBatch({...request,compare:false});assertBatch(bins,request.count,false);
});
