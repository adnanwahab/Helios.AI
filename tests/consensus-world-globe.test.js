import {test,expect} from 'bun:test';
import {sampleIds,voteLabel} from '../public/consensus-world-globe.js';
test('sphere samples 1280 distinct valid stable identities spanning all 8 billion agents',()=>{
 const ids=sampleIds(8_000_000_000);
 expect(ids).toHaveLength(1280);
 expect(new Set(ids).size).toBe(1280);
 expect(ids[0]).toBeGreaterThanOrEqual(0);
 expect(ids.at(-1)).toBeLessThan(8_000_000_000);
 expect(ids.some(id=>id>4294967295)).toBe(true);
 expect(sampleIds(8_000_000_000)).toEqual(ids);
 expect(sampleIds(3)).toEqual([0,1,2]);
});
test('near-unanimity and tiny dissent do not round to exact unanimity or zero',()=>{
 expect(voteLabel(7_999_999_999,8_000_000_000)).toBe('<100%');
 expect(voteLabel(1,8_000_000_000)).toBe('<0.01%');
 expect(voteLabel(8_000_000_000,8_000_000_000)).toBe('100%');
 expect(voteLabel(0,8_000_000_000)).toBe('0%');
 expect(voteLabel(0,0)).toBe('—');
});
