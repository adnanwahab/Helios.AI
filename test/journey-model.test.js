import {test,expect} from 'bun:test';
import catalog from '../data/catalog.json' with {type:'json'};
import {mergeFragments,draftCatalog,cityPlanFor,cityTotals,stageFrom} from '../public/journey-model.js';
import {simulate} from '../public/law-simulator.js';
test('merge is deterministic, deduplicates only normalized lines, and preserves differences',()=>{
 const merged=mergeFragments('Accessible housing\n  Protect waterways ','accessible   housing\nOppose the current housing plan');
 expect(merged).toEqual({text:'Accessible housing\nProtect waterways\nOppose the current housing plan',unique:3,duplicates:1});
});
test('constitution maps exactly the 100 original goals to reviewable implementation records',()=>{
 const rows=draftCatalog(catalog.goals,'Affordable housing\nAccessible transit\nFlooding safeguards');
 expect(rows).toHaveLength(100);expect(new Set(rows.map(r=>r.g.id)).size).toBe(100);
 expect(rows.some(r=>r.score>0)).toBe(true);
 for(const r of rows){expect(r.implementation.action).toBe(r.g.illustrativeLocalOption);expect(r.implementation.metrics).toEqual(r.g.suggestedMeasures);expect(r.implementation.owner).toContain('Unassigned');expect(r.matches.length).toBeLessThanOrEqual(3);expect(Number.isFinite(simulate(r.g).final.scenario)).toBe(true)}
 expect(rows.filter(r=>r.city)).toHaveLength(6);
 expect(cityPlanFor('HGA-011').rates.housing).toBe(120);
 expect(cityPlanFor('HGA-001')).toBeNull();
 expect(()=>draftCatalog(catalog.goals,'' )).toThrow();
});
test('city comparison and route aliases remain bounded and deterministic',()=>{
 expect(cityTotals({year:5,housing:120,transit:4,water:6})).toEqual({year:5,housing:600,transit:20,water:30});
 expect(cityTotals({year:0,housing:120,transit:4,water:6})).toEqual({year:0,housing:0,transit:0,water:0});
 expect(cityTotals({year:99,housing:900,transit:-1,water:99})).toEqual({year:10,housing:2000,transit:0,water:100});
 for(const stage of ['story','demo','visualize','chat','grid']){expect(stageFrom('/'+stage)).toBe(stage);expect(stageFrom('/Helios.AI/grid.html','?stage='+stage)).toBe(stage)}
 expect(stageFrom('/city')).toBe('visualize');expect(stageFrom('/grid','?story=population')).toBe('grid');
});
