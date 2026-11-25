import {test, expect} from 'bun:test';
import catalog from '../data/catalog.json' with {type:'json'};
import {sampleBoard} from '../public/constitution-model.js';
await import('../public/civic-match.js');
const M=globalThis.HeliosMatch;
const clauses=sampleBoard().clauses;
const clauseText=r=>r.text+' '+r.topic;
const bestClause=text=>M.rank(clauses,text,{fields:clauseText,limit:1})[0]?.record.id||null;
const goalText=p=>[p.title,p.sharedGoal,p.illustrativeLocalOption].join(' ');
const govFields=p=>[p.title,p.category,p.sharedGoal].join(' ');
const govConcepts=p=>[p.title,p.sharedGoal].join(' ');

test('stemming treats plurals and tenses as the same word without mangling them',()=>{
  const s=w=>M.stem(w);
  expect(['flood','floods','flooded','flooding'].map(s)).toEqual(['flood','flood','flood','flood']);
  expect(['library','libraries'].map(s)).toEqual(['library','library']);
  expect(['shade','shaded','shading'].map(s)).toEqual(['shade','shade','shade']);
  expect(s('buses')).toBe('bus');expect(s('stops')).toBe('stop');expect(s('waiting')).toBe('wait');
  expect(s('visiting')).toBe('visit');expect(s('training')).toBe('training');
});

test('natural journal sentences find the clause they obviously belong to',()=>{
  expect(bestClause('My rent went up 30% this year and I might have to leave the neighborhood I grew up in.')).toBe('S-002');
  expect(bestClause('Our street floods every time it rains hard. Water got into the garage twice.')).toBe('S-009');
  expect(bestClause("I can't get a doctor's appointment for three months.")).toBe('S-007');
  expect(bestClause('Libraries closing at 6pm means I can never go after work.')).toBe('S-003');
  expect(bestClause("There's nowhere for teenagers to hang out after school except the gas station.")).toBe('S-003');
  expect(['S-001','S-011']).toContain(bestClause('The bus is always late'));
  expect(bestClause('La parada de autobús no tiene sombra y hace mucho calor.')).toBe('S-001');
  expect(bestClause('🚌☀️🥵')).toBe('S-001');
  for(const text of ['I love my dog.','asdf','lol','We need stricter gun laws.','Internet is so expensive here and it keeps cutting out when I work from home.'])expect(bestClause(text)).toBeNull();
});

test('search uses whole words and synonyms, never raw substrings',()=>{
  const ids=q=>M.search(catalog.goals,q,{fields:govFields,conceptFields:govConcepts}).map(p=>p.id);
  const titles=q=>M.search(catalog.goals,q,{fields:govFields,conceptFields:govConcepts}).map(p=>p.title);
  expect(titles('bus')).not.toContain('Safety and Independence for Survivors');
  expect(ids('bus')).toContain('HGA-095');
  expect(ids('transit')).toContain('HGA-095');
  expect(ids('shade')[0]).toBe('HGA-093');
  expect(titles('rent')).not.toContain('Fair and Transparent Borrowing');
  expect(titles('rent')).toContain('Homes People Can Afford');
  expect(ids('HGA-093')).toEqual(['HGA-093']);
  expect(ids('hga093')).toEqual(['HGA-093']);
  expect(ids('zzz')).toEqual([]);
  expect(ids('').length).toBe(100);
  const records=[{id:'A',title:'Shaded Transit Stops Initiative',category:'Housing and livable cities',sharedGoal:'Add shade to bus stops.'},{id:'B',title:'Library access',category:'Housing and livable cities',sharedGoal:'Libraries for all'}];
  expect(M.search(records,'shaded',{fields:govFields}).map(r=>r.id)).toEqual(['A']);
});

test('related proposals rank heat and transit goals for a hot bus stop, with reasons',()=>{
  const ranked=M.rank(catalog.goals,'The bus stop on Fry Road has no shade or bench.',{fields:goalText,title:p=>p.title,limit:5});
  const top=ranked.slice(0,3).map(r=>r.record.id);
  expect(top).toContain('HGA-095');expect(top).toContain('HGA-093');
  expect(ranked.map(r=>r.record.title)).not.toContain('A Good Start for Every Child');
  for(const r of ranked)expect(r.why.length).toBeGreaterThan(0);
});

test('policy area is scored across the whole entry instead of the first keyword',()=>{
  const c=t=>M.suggestCategory(t,catalog.categories).category;
  expect(c('Bus stops need shade. PRIVATE-DRAFT-ONLY should never be transmitted.')).toBe('Housing and livable cities');
  expect(c("Okay so here's the thing. I've lived on Clay Road for 12 years. Every time it rains hard the street floods and water came into two garages. The drain at the corner has been clogged since spring.")).toBe('Nature, safety, and future generations');
  expect(c('I cannot get a doctor appointment at the clinic.')).toBe('Physical and mental health');
  expect(c('nothing in particular')).toBe('Democracy, wisdom, and government');
  expect(M.suggestCategory('Every time it rains the street floods.',catalog.categories).because).toContain('flood');
});

test('the public problem is the sentence that names the problem, not the throat-clearing',()=>{
  expect(M.pickProblem("Okay so here's the thing. I've lived on Clay Road for 12 years. Every time it rains hard the street floods and last month water came into two garages.").text)
    .toBe('Every time it rains hard the street floods and last month water came into two garages.');
  expect(M.pickProblem('Rent on my building went up again this year. A lot of families I know are talking about moving farther out.').text).toBe('Rent on my building went up again this year.');
  const runOn=M.pickProblem('so basically my kid has to cross six lanes on mason road to get to school and theres no crossing guard and cars go like 55 and i keep thinking someone is going to get hurt and the school says its a city problem and the city says its a county problem and honestly i dont even know who to call anymore');
  expect(runOn.text).toBe('My kid has to cross six lanes on mason road to get to school and theres no crossing guard.');
  expect(runOn.text.length).toBeLessThanOrEqual(220);
  expect(M.pickProblem('').text).toBe('');
});

test('titles are short, action-shaped and never cut mid-word',()=>{
  expect(M.makeTitle({approach:'Pilot 10 shade structures and benches at the hottest stops this summer, then measure ridership and heat complaints.'})).toBe('Pilot 10 Shade Structures and Benches at the Hottest Stops This Summer');
  expect(M.makeTitle({approach:'Test shaded stops on a voluntary city pilot.'})).toBe('Test Shaded Stops on a Voluntary City Pilot');
  expect(M.makeTitle({outcome:'People should be able to wait for the bus without risking heat illness, with shade and a place to sit at every stop that gets full afternoon sun.'})).toBe('Wait for the Bus Without Risking Heat Illness');
  const t=M.makeTitle({issue:'so basically my kid has to cross six lanes on mason road to get to school and theres no crossing guard and cars go like 55'});
  expect(t).toBe('A Child Has to Cross Six Lanes on Mason Road to Get to School');
  expect(t).not.toContain('Initiative');
  for(const title of [t,M.makeTitle({issue:'x'.repeat(30)+' '+'word '.repeat(40)})])expect(title.length).toBeLessThanOrEqual(73);
});

test('personal details are flagged and can be generalized before anything is public',()=>{
  const found=M.personal('Call me at 713-555-0142 or jane@example.com. I live at 1234 Fry Road. My kid and my neighbor John walk there.').map(x=>x.found);
  expect(found).toEqual(expect.arrayContaining(['713-555-0142','jane@example.com','1234 Fry Road','My kid','my neighbor John']));
  expect(M.generalize('My kid has to cross the road. My neighbor John agrees.')).toBe('A child has to cross the road. A neighbor agrees.');
  expect(M.personal('The bus stop on Fry Road has no shade.')).toEqual([]);
});

test('win-over-the-opposers is deterministic, explained and never unanimous by force',()=>{
  const s=clauses.find(c=>c.id==='S-001');
  const base={topic:s.topic,text:s.text,counts:s.synthetic};
  const same=M.persuade(base,s.text);
  expect(same.won).toBe(0);expect(same.after).toEqual(same.before);
  const better=M.persuade(base,s.text.replace(/\.$/,'')+', within the existing budget, with a maintenance plan and fair placement across neighborhoods.');
  expect(better.concerns.filter(c=>c.addressed).map(c=>c.id)).toEqual(['cost','maintenance','fairness']);
  expect(better.after.support).toBeGreaterThan(better.before.support);
  expect(better.after.oppose).toBeGreaterThan(0);
  expect(better.after.support+better.after.oppose+better.after.unsure).toBe(better.before.support+better.before.oppose+better.before.unsure);
  const unrelated=M.persuade(base,'Within budget, maintained, fair: buy everyone a pony.');
  expect(unrelated.sameIdea).toBe(false);expect(unrelated.won).toBe(0);
});

test('templates, scenes and examples cover varied concerns',()=>{
  expect(M.examples.length).toBe(10);
  expect(new Set(M.examples).size).toBe(10);
  expect(M.examples[0]).toContain('bus stops have no shade');
  expect(M.template(M.examples[1]).concept).toBe('flood');
  expect(M.template('nothing to see').measures.length).toBe(3);
  expect(M.sceneKind(M.examples[0])).toBe('stop');
  expect(M.sceneKind(M.examples[1])).toBe('flood');
  expect(M.sceneKind(M.examples[4])).toBe('crossing');
  expect(M.plural(1,'word')).toBe('1 word');expect(M.plural(2,'word')).toBe('2 words');
});
