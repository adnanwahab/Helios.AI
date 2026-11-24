import {test,expect} from 'bun:test';
import {POPULATION,citizen,inspectCitizen,samplePopulation,exactRange,combineRanges} from '../public/population-model.js';
test('synthetic identities cover both halves of the 8B range',()=>{
 expect(citizen(0)).toEqual(citizen(0));expect(citizen(0).needs).not.toEqual(citizen(4294967296).needs);expect(citizen(POPULATION-1).memories).toHaveLength(3);expect(()=>citizen(POPULATION)).toThrow();
});
test('assumptions change judgment, never identity',()=>{const a=inspectCitizen(8675309),b=inspectCitizen(8675309,{cost:1,reliability:0});expect(a.memories).toEqual(b.memories);expect(a.needs).toEqual(b.needs);expect(a.score).not.toEqual(b.score)});
test('weighted sample preserves population and is deterministic',()=>{const a=samplePopulation({},1001);expect(a).toEqual(samplePopulation({},1001));expect(Object.values(a.tallies).reduce((a,b)=>a+b,0)).toBe(POPULATION);expect(a.evaluated).toBe(1001);expect(a.mode).toBe('weighted-sample')});
test('range aggregation is exact and rejects gaps and overlaps',()=>{const a=exactRange(0,30),b=exactRange(30,100);expect(combineRanges([b,a])).toEqual(exactRange(0,100));expect(()=>combineRanges([a,exactRange(31,100)])).toThrow();expect(()=>combineRanges([a,a])).toThrow();expect(exactRange(POPULATION-10,POPULATION).evaluated).toBe(10)});
test('lower burden and greater reliability increase support in this toy rule',()=>{const a=samplePopulation({cost:1,reliability:.1},2000),b=samplePopulation({cost:.05,reliability:1},2000);expect(b.tallies.yes).toBeGreaterThan(a.tallies.yes)});
