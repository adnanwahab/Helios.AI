import {test,expect} from 'bun:test';
import {factors,presets,generateCells,weightedScore,summarize,describe} from '../public/human-flourishing-atlas.js';
test('atlas has nine dimensions and deterministic bounded land cells',()=>{
 const a=generateCells(),b=generateCells();
 expect(factors).toHaveLength(9);
 expect(a).toHaveLength(1528);
 expect(a).toEqual(b);
 expect(a.every(c=>c.x>=0&&c.x<720&&c.y>=0&&c.y<300&&c.vals.length===9&&c.vals.every(v=>v>=0&&v<=100))).toBe(true);
});
test('scores use relative weights and exclude zero-weight factors',()=>{
 expect(weightedScore([90,20],[100,0])).toBe(90);
 expect(weightedScore([90,20],[1,1])).toBe(55);
 expect(weightedScore([90,20],[50,50])).toBe(55);
 expect(weightedScore([90,20],[0,0])).toBeNull();
});
test('presets alter scores and summary matches weighted cell values',()=>{
 const cells=generateCells();
 const balanced=summarize(cells,presets.balanced);
 const first=cells.map(c=>c.score);
 const freedom=summarize(cells,presets.freedom);
 expect(freedom.mean).not.toBe(balanced.mean);
 expect(cells.some((c,i)=>c.score!==first[i])).toBe(true);
 expect(freedom.best.score).toBe(Math.max(...cells.map(c=>c.score)));
 expect(freedom.high).toBe(cells.filter(c=>c.score>=75).length);
 expect(freedom.mean).toBeCloseTo(cells.reduce((a,c)=>a+c.score,0)/cells.length,10);
 expect(summarize(cells,Array(9).fill(0))).toEqual({best:null,mean:null,high:null});
 expect(cells.every(c=>c.score===null)).toBe(true);
});
test('explanation handles no preferences and no shortfall',()=>{
 const cell={vals:[100,0,0,0,0,0,0,0,0],score:100};
 expect(describe(cell,[100,0,0,0,0,0,0,0,0])).toContain('no shortfall');
 expect(describe({...cell,score:null},Array(9).fill(0))).toContain('Choose at least one');
});
