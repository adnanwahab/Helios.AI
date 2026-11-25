import {test,expect} from 'bun:test';
import catalog from '../../data/catalog.json';
import '../../public/civic-ideas.js';
const H=globalThis.HeliosIdeas;
test('ordinary wording ranks the relevant editorial goal first',()=>{
 expect(H.rank(catalog.goals,'Make the bus come every 10 minutes.')[0].p.id).toBe('HGA-095');
 expect(H.rank(catalog.goals,'I feel lonely and wish there were more places to meet people.')[0].p.id).toBe('HGA-051');
 expect(H.matches('bus','Public transit')).toBe(true);
 expect(H.rank(catalog.goals,'quartz zirconium zeppelin')).toEqual([]);
});
test('separate concerns and retain cross-cutting constraints',()=>{
 const note='My bus is late. There is no shade at the stop. The library closes before I finish work. I want a cheap pilot and a review after 90 days.';
 const a=H.analyze(note);expect(a.concerns.map(x=>x.topic)).toEqual(['transit','shade','library']);
 expect(a.conditions).toEqual(['I want a cheap pilot and a review after 90 days.']);
 expect(H.draft(a,2,Array(10).fill('category')).approach).toContain('review after 90 days');
 expect(a.parts.join(' ')).toBe(note);
});
test('models expose deterministic assumptions, not real predictions',()=>{
 expect(H.scenario('Library closes before work ends')).toBe('library');
 expect(H.simulate('library',2)).toMatchObject({access:6,resource:12});
 expect(H.simulate('transit',10)).toMatchObject({access:5,resource:72});
 expect(H.simulate('shade',4)).toMatchObject({access:40,resource:4});
 expect(H.scenario('Replace the tax code')).toBeNull();
});
test('merge retains explicit dissent and identifies possible paraphrases',()=>{
 const a='Keep library admission free.\nOpen the library until 9 pm.\nDo not cut weekend hours.';
 const b='Keep library admission free.\nKeep library entry free.\nClose the library at 6 pm.\nProtect staff from unpaid overtime.';
 const result=H.mergeReview(a,b);
 expect(result.shared).toEqual(['Keep library admission free.']);
 expect(result.similar.some(x=>x.b==='Keep library entry free.')).toBe(true);
 expect(result.conditions).toContain('Protect staff from unpaid overtime.');
 expect(result.conflicts).toEqual([{a:'Open the library until 9 pm.',b:'Close the library at 6 pm.'}]);
});
