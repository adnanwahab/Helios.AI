import {describe,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {FACTORS,defaultWeights,factorScores,totalWeight,suitability,rankCells,readUrlState,stateSearch,describeCell} from '../public/world-map/model.js';

const data=JSON.parse(readFileSync(new URL('../public/world-map/world-data.json',import.meta.url),'utf8'));
const cells=data.cells.map(c=>({...c,values:factorScores(c)}));
const ids=new Set(cells.map(c=>c.id));

describe('world suitability map',()=>{
  test('bundled geographic cells remain unique, finite, and correctly bounded',()=>{
    expect(cells.length).toBe(1526);
    expect(ids.size).toBe(cells.length);
    expect(data.countries.features.length).toBe(177);
    for(const c of cells){
      expect(Math.abs(c.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(c.lon)).toBeLessThanOrEqual(180);
      expect(c.iso3).not.toBe('ATA');
      expect(c.boundary[0]).toEqual(c.boundary.at(-1));
      expect(c.cityKm).toBeGreaterThanOrEqual(0);
      expect(c.coastKm).toBeGreaterThanOrEqual(0);
      for(const score of Object.values(c.values)) expect(Number.isFinite(score)&&score>=0&&score<=100).toBe(true);
    }
  });

  test('one active preference exactly reproduces its criterion across the world',()=>{
    for(const active of FACTORS){
      const weights=Object.fromEntries(FACTORS.map(f=>[f.key,f.key===active.key?100:0]));
      for(const c of cells) expect(suitability(c.values,weights)).toBeCloseTo(c.values[active.key],10);
    }
  });

  test('all-zero weights produce no ranking and a truthful description',()=>{
    const weights=Object.fromEntries(FACTORS.map(f=>[f.key,0]));
    const ranked=rankCells(cells,weights);
    expect(totalWeight(weights)).toBe(0);
    expect(ranked.every(c=>c.score===null)).toBe(true);
    expect(ranked[0].country.localeCompare(ranked.at(-1).country)).toBeLessThanOrEqual(0);
    expect(describeCell(cells[0],weights)).toContain('map is unranked');
    expect(describeCell(cells[0],weights)).not.toMatch(/NaN|undefined/);
  });

  test('URL state is whitelisted and round-trips zeroes and selected hexagons',()=>{
    const weights={climate:0,cost:100,city:17,nature:55,coast:0};
    const selectedId=cells[400].id;
    expect(readUrlState(stateSearch(weights,selectedId,true),ids)).toEqual({weights,selectedId,embed:true,kaleidoscope:false});
    expect(readUrlState(stateSearch(weights,selectedId,true,true),ids)).toEqual({weights,selectedId,embed:true,kaleidoscope:true});
    const invalid=readUrlState('?climate=Infinity&cost=-2&city=101&nature=1.5&coast=&cell=not-a-cell&embed=yes&latitude=80&kaleidoscope=true',ids);
    expect(invalid).toEqual({weights:defaultWeights(),selectedId:null,embed:false,kaleidoscope:false});
    expect(stateSearch({...defaultWeights(),constructor:5},'<script>')).toBe('');
  });

  test('geographic scores favor proximity and synthetic fields join at the date line',()=>{
    const example={...cells[0],lat:40,lon:10,cityKm:0,coastKm:0};
    const near=factorScores(example),far=factorScores({...example,cityKm:1000,coastKm:1000});
    expect(near.city).toBe(100);
    expect(near.coast).toBe(100);
    expect(far.city).toBeLessThan(near.city);
    expect(far.coast).toBeLessThan(near.coast);
    for(const lat of [-80,-40,0,40,80]){
      const west=factorScores({...example,lat,lon:-180});
      const east=factorScores({...example,lat,lon:180});
      expect(west.cost).toBeCloseTo(east.cost,10);
      expect(west.nature).toBeCloseTo(east.nature,10);
    }
  });

  test('rank and narrative respond to preferences while preserving input data',()=>{
    const initial=defaultWeights();
    const coastal={climate:0,cost:0,city:0,nature:0,coast:100};
    const before=rankCells(cells,initial),after=rankCells(cells,coastal);
    expect(before[0].id).not.toBe(after[0].id);
    expect(cells.every(c=>c.score===undefined)).toBe(true);
    const paragraph=describeCell(cells[400],coastal);
    expect(paragraph).toContain('Only coastal proximity is active');
    expect(paragraph).toContain('centered in '+cells[400].country);
    expect(paragraph).not.toBe(describeCell(cells[400],initial));
    expect(before.every(c=>c.score>=0&&c.score<=100)).toBe(true);
  });
});
