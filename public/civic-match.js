// Local, deterministic text helpers for the civic workshop.
// Everything here runs in the browser; nothing is sent anywhere. The functions are
// pure so the same file is loaded by the homepage (classic script) and by unit tests.
(()=>{
'use strict';

const STOP=new Set(('a an the and or but if so to of in on at by for from with into onto over under about as is are was '+
 'public were be been being am do does did done have has had having i me my mine we us our ours you your yours he him his she '+
 'her hers it its they them their theirs this that these those there here what which who whom whose when where why how '+
 'all any each every some such nor only own same than very can could should would will shall may might must just also '+
 'really like get got gets getting go going goes went make made makes let lets thing things stuff one ones lot lots much '+
 'many more most less least im ive id youre theyre thats theres whats its dont doesnt didnt cant cannot couldnt isnt arent '+
 'wasnt werent wont wouldnt shouldnt even still yet ever back out up down off again then now well way want wants wanted '+
 'need needs needed think thought know feel felt said says say tell told keep keeps kept time times day days year years '+
 'people person someone something anything everything nothing everyone anyone nobody la el los las de del y en un una es '+
 'que por para con no se al lo'
).split(/\s+/));

// Irregular forms and words the light stemmer would damage.
const IRREGULAR={buses:'bus',busses:'bus',children:'child',kids:'kid',people:'person',women:'woman',men:'man',lives:'life',
 leaves:'leaf',shelves:'shelf',feet:'foot',teeth:'tooth',housing:'housing',building:'building',buildings:'building',
 morning:'morning',evening:'evening',spring:'spring',during:'during',ceiling:'ceiling',nothing:'nothing',
 something:'something',everything:'everything',parking:'parking',crossing:'crossing',crossings:'crossing',
 meeting:'meeting',meetings:'meeting',flooding:'flood',sidewalks:'sidewalk',stories:'story',policies:'policy',
 commuting:'commute',commuted:'commute',bayous:'bayou',training:'training',trainings:'training',trained:'training'};
const VOWEL=/[aeiou]/;
// Porter's "measure": how many vowel-consonant runs a stem has. Only short stems
// such as "shad" or "clos" get their silent e back ("shade", "close").
function measure(w){return (w.replace(/[^aeiouy]+/g,'C').replace(/[aeiouy]+/g,'V').replace(/^C/,'').match(/VC/g)||[]).length}
// A small, predictable stemmer: plurals, -ies, -ing, -ed. Enough for "floods" = "flood"
// and "libraries" = "library" without pretending to understand language.
function stem(input){
 let w=String(input||'').toLowerCase();
 if(IRREGULAR[w])return IRREGULAR[w];
 if(w.length<=3)return w;
 if(/ies$/.test(w)&&w.length>4)return w.slice(0,-3)+'y';
 if(/(?:ss|us|is)$/.test(w))return w;
 if(/(?:ches|shes|xes|zes|sses)$/.test(w))return w.slice(0,-2);
 if(/s$/.test(w)&&!/ss$/.test(w)){w=w.slice(0,-1);if(w.length<=3)return w}
 for(const suffix of ['ing','ed']){
   if(w.endsWith(suffix)&&w.length-suffix.length>=3){
     let base=w.slice(0,-suffix.length);
     if(!VOWEL.test(base))return w;
     if(/([b-df-hj-np-tv-z])\1$/.test(base)&&!/(?:ll|ss|zz|ff)$/.test(base))base=base.slice(0,-1);
     else if(/[^aeiou][aeiou][^aeiouwxy]$/.test(base)&&measure(base)===1)base+='e';
     return base;
   }
 }
 return w;
}

const EMOJI={'🚌':' bus ','🚏':' bus stop ','🚇':' subway ','🚆':' train ','☀️':' sun ','☀':' sun ','🥵':' hot ','🔥':' hot ',
 '🌧️':' rain ','🌧':' rain ','🌊':' flood ','💧':' water ','🏠':' home ','🏡':' home ','🏥':' hospital ','📚':' library ',
 '🏫':' school ','🚗':' car ','🚸':' crossing ','💸':' money ','💰':' money ','🌳':' tree ','🌲':' tree ','🚲':' bike ',
 '📶':' internet ','💡':' lights ','🧒':' child ','👵':' older ','♿':' accessible '};
// A few phrases mean something different from their words.
const PHRASES=[[/\bget(?:ting)? around\b/g,' transit '],[/\bpublic transportation\b/g,' transit '],[/\bgas stations?\b/g,' gasstation '],
 [/\bwork(?:ing)? from home\b/g,' remote work '],[/\b(?:from|at) home\b/g,' '],[/\bcooling centers?\b/g,' cooling ']];
function plain(text){
 let s=String(text||'');
 for(const [k,v] of Object.entries(EMOJI))if(s.includes(k))s=s.split(k).join(v);
 s=s.normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/['’`]/g,'');
 for(const [re,v] of PHRASES)s=s.replace(re,v);
 return s;
}
function words(text){return plain(text).match(/[a-z0-9]+/g)||[]}
function stems(text){return words(text).map(stem)}
function terms(text){return new Set(stems(text).filter(w=>w.length>=3&&!STOP.has(w)&&!/^\d+$/.test(w)))}

// Concepts are hand-written synonym groups. The category index points into the ten
// policy areas used by the public library (see data/catalog.json). Broad concepts
// ("weak") help ranking but never make a match on their own.
const CONCEPT_ROWS=[
 ['transit','transit',1,'transit bus stop train rail metro subway tram commute commuter rider ride fare shelter bench seating seat transport transportation autobus parada camion transporte'],
 ['streets','streets and traffic',1,'street road lane sidewalk crosswalk cross crossing intersection traffic car driver speed speeding pothole bike bicycle pedestrian highway freeway crash calle'],
 ['housing','housing',1,'housing house home apartment rent renter landlord tenant eviction evict mortgage zoning homeless displacement displaced gentrification vivienda renta alquiler casa'],
 ['heat','heat and shade',9,'heat hot hotter hottest sun sunny shade shady temperature cool cooling degree summer sweltering exposure calor sombra sol'],
 ['flood','flooding and drainage',9,'flood rain rainfall storm drain drainage gutter sewer water puddle hurricane bayou inundacion lluvia agua'],
 ['environment','environment and energy',9,'climate pollution air smog emission environment nature tree green energy power grid outage electricity freeze wildfire recycle trash litter noise'],
 ['health','health care',2,'health healthcare doctor clinic hospital medical medicine nurse appointment mental therapy therapist dentist prescription illness sick salud clinica medico'],
 ['education','schools and learning',3,'school student teacher teach class classroom college university tuition learn learning education skill training tutor homework welding trade apprenticeship coding escuela'],
 ['community','community spaces',5,'community neighbor neighborhood park library lonely loneliness friend gathering center youth teen teenager hang hangout event rec recreation playground biblioteca'],
 ['work','work and jobs',4,'work job employment employer employee worker wage shift boss overtime hire hiring union paycheck career'],
 ['justice','policing and justice',6,'police policing crime criminal violence theft justice court jail prison rights gun firearm'],
 ['government','government and accountability',7,'government council mayor vote voting election democracy transparency transparent budget procurement consultant consulting contract corruption corrupt politician accountability accountable official 311 ticket permit reason decision respond response answer publish'],
 ['digital','internet and technology',8,'internet broadband wifi digital online technology software app phone computer'],
 ['privacy','privacy and data',8,'privacy private surveillance data tracking anonymous'],
 ['economy','cost of living',0,'money income poverty price bill cost expensive afford affordable debt food grocery tax inflation',true],
 ['safety','safety',6,'safe safety unsafe danger dangerous lights lighting dark',true],
 ['access','accessibility',-1,'accessible accessibility disability disabled wheelchair ramp elderly older senior ada stroller',true]
];
const CONCEPTS=CONCEPT_ROWS.map(([id,label,category,list,weak=false])=>({id,label,category,weak,words:new Set(list.split(/\s+/).map(stem))}));
const CONCEPT_BY_ID=new Map(CONCEPTS.map(c=>[c.id,c]));

// Map of concept id -> keywords found, for one text.
function conceptsOf(text){
 const found=new Map(),list=stems(text);
 for(const c of CONCEPTS)for(const w of list)if(c.words.has(w)){if(!found.has(c.id))found.set(c.id,new Set());found.get(c.id).add(w)}
 return found;
}
function profile(text){return {terms:terms(text),concepts:conceptsOf(text)}}
function asProfile(x){return x&&x.terms&&x.concepts?x:profile(x)}

// Shared concepts weigh more than shared words; both are explained to the person.
// A record that is mostly about something the person never mentioned ranks lower.
function similarity(a,b){
 const pa=asProfile(a),pb=asProfile(b),concepts=[],shared=[];let score=0;
 for(const [id,set] of pa.concepts){
   const other=pb.concepts.get(id);if(!other)continue;
   const c=CONCEPT_BY_ID.get(id);concepts.push(id);
   score+=(c.weak?0:2)+Math.min(set.size,2)+Math.min(other.size,2);
 }
 for(const w of pa.terms)if(pb.terms.has(w))shared.push(w);
 score+=shared.length*2;
 if(score>0)for(const [id,set] of pb.concepts)if(set.size>=3&&!pa.concepts.has(id)&&!CONCEPT_BY_ID.get(id).weak)score-=1;
 return {score:Math.max(0,score),concepts,words:shared,labels:concepts.map(id=>CONCEPT_BY_ID.get(id).label)};
}
function explain(match,limit=4){
 const seen=new Set(),out=[];
 for(const w of match.words||[])if(!seen.has(w)){seen.add(w);out.push(w)}
 for(const label of match.labels||[])if(!seen.has(label)){seen.add(label);out.push(label)}
 return out.slice(0,limit);
}

// Rank records against a free-text concern. fields(record) returns searchable text.
// title(record), when given, adds a point if the record's title shares a concept.
function rank(records,query,{fields=r=>String(r),title=null,category=null,limit=Infinity,min=3}={}){
 const q=profile(query),out=[];
 for(const record of records||[]){
   const m=similarity(q,fields(record));
   const categoryMatch=!!category&&record&&record.category===category;
   if(m.score<min)continue;
   const titled=title?[...conceptsOf(title(record)).keys()].some(id=>q.concepts.has(id)):false;
   out.push({record,score:m.score+(categoryMatch?1:0)+(titled?1:0),match:m,categoryMatch,why:explain(m)});
 }
 return out.sort((a,b)=>b.score-a.score||String(a.record.id||'').localeCompare(String(b.record.id||''))).slice(0,limit);
}

// Search box filter: whole words (after stemming) or shared concepts. Never raw
// substrings, so "bus" does not find "abuse" and "rent" does not find "parent".
// conceptFields lets a caller keep broad labels (such as a category name) out of
// synonym matching while still matching them word for word.
function search(records,query,{fields=r=>String(r),conceptFields=fields,id=r=>r&&r.id}={}){
 const raw=String(query||'').trim();
 if(!raw)return [...(records||[])];
 const compact=raw.toLowerCase().replace(/[^a-z0-9]/g,'');
 // "HGA-093", "hga093" or "093": an identifier lookup, not a word search.
 if(/^(?:[a-z]{1,4}\d+|\d{2,})$/.test(compact))return (records||[]).filter(r=>String(id(r)||'').toLowerCase().replace(/[^a-z0-9]/g,'').includes(compact));
 const qTokens=stems(raw).filter(w=>w.length>=2&&!STOP.has(w));
 if(!qTokens.length)return [...(records||[])];
 const strong=[],weak=[];
 for(const record of records||[]){
   const text=fields(record),docStems=new Set(stems(text)),docConcepts=conceptsOf(conceptFields(record));
   let score=0,hit=0,weakHit=0;
   for(const t of qTokens){
     if(docStems.has(t)){score+=4;hit++;continue}
     const concept=CONCEPTS.find(c=>!c.weak&&c.words.has(t)&&docConcepts.has(c.id));
     if(concept){score+=1+Math.min(docConcepts.get(concept.id).size,3);hit++;continue}
     if(t.length>=3&&[...docStems].some(d=>d.startsWith(t))){weakHit++;score+=1}
   }
   const need=qTokens.length<=1?1:qTokens.length-1;
   if(hit>=need)strong.push({record,score});
   else if(hit+weakHit>=need)weak.push({record,score});
 }
 const pick=strong.length?strong:weak;
 return pick.sort((a,b)=>b.score-a.score).map(x=>x.record);
}

function suggestCategory(text,categories){
 const found=conceptsOf(text),totals=new Map(),labels=[];
 for(const [id,set] of found){const c=CONCEPT_BY_ID.get(id);if(c.category<0)continue;totals.set(c.category,(totals.get(c.category)||0)+set.size);labels.push(c.label)}
 let best=7,bestScore=0;
 for(const [index,score] of totals)if(score>bestScore||(score===bestScore&&index<best)){best=index;bestScore=score}
 const winners=[...found.entries()].filter(([id])=>CONCEPT_BY_ID.get(id).category===best).flatMap(([,set])=>[...set]);
 return {index:best,category:categories?categories[best]:best,matched:bestScore>0,because:winners.slice(0,4),concepts:labels};
}

const PROBLEM=/\b(no|not|never|nobody|nothing|none|nowhere|cant|cannot|couldnt|dont|doesnt|isnt|arent|wont|wasnt|too|broken|unsafe|dangerous|danger|late|expensive|costly|hot|cold|floods?|flooded|flooding|clogged|closed|closes|closing|missing|lacks?|lacking|without|needs?|wish|should|hard|difficult|problem|issue|waiting|waits?|hurt|crowded|dirty|dark|scary|afraid|worried|worse|unfair|impossible|keeps?|always|every time|backs up|speed|speeding|went up|goes up|go up|rising|rose|raised|increased?|higher|doubled|tripled|priced out|cant afford)\b/g;
// Opening words that carry no content. Some only count as filler when a comma follows.
const FILLER=/^(?:(?:ok(?:ay)?|so|um+|uh+|ugh+|hm+|honestly|basically|anyway|yeah|hi|hello|hey)(?=[\s,!.])[\s,!.]*|(?:well|yes|look|listen|like|and|but)\s*,\s*)+/i;
const THROAT=/here['’]?s the thing|i(?:['’]ve| have) been thinking|long story|i don['’]?t know|you know what/i;
function splitSentences(text){
 return String(text||'').replace(/\r/g,'').split(/(?<=[.!?…])\s+|\n+/).map(s=>s.trim()).filter(Boolean);
}
function sentenceScore(s,index,theme=null){
 const p=plain(s),n=(p.match(/[a-z0-9]+/g)||[]).length;
 const problem=(p.match(PROBLEM)||[]).length;
 const found=conceptsOf(s);
 let concept=0;for(const set of found.values())concept+=set.size;
 let score=problem*1.5+concept*2+(n>=6&&n<=40?1:0)+(index===0?.3:0)+(theme&&found.has(theme)?2:0);
 if(THROAT.test(s)||(FILLER.test(s)&&n<8))score-=4;
 if(n<4)score-=3;
 return score;
}
function tidy(s){
 let out=String(s||'').trim().replace(FILLER,'').replace(/^[,;:\-\s]+/,'').trim();
 if(!out)return '';
 out=out.charAt(0).toUpperCase()+out.slice(1);
 if(!/[.!?…]$/.test(out))out+='.';
 return out;
}
function clip(s,max){
 if(s.length<=max)return s;
 const cut=s.slice(0,max-1),space=cut.lastIndexOf(' ');
 return (space>max*.6?cut.slice(0,space):cut).replace(/[,;:\s]+$/,'')+'…';
}
// Pick the sentence that states the problem, not the one that clears the throat.
function pickProblem(text,{max=220}={}){
 const sentences=splitSentences(text);
 if(!sentences.length)return {text:'',index:-1,sentences};
 const theme=topConcept(text);
 let best=0,bestScore=-Infinity;
 sentences.forEach((s,i)=>{const sc=sentenceScore(s,i,theme);if(sc>bestScore){best=i;bestScore=sc}});
 let chosen=sentences[best];
 if(chosen.length>max){
   // Voice-style run-on: keep the strongest clause, plus the next one if it names the problem.
   const clauses=chosen.split(/,\s+|\s+(?:and|but|so|because|plus|cause)\s+/i).map(c=>c.trim()).filter(Boolean);
   let ci=0,cs=-Infinity;
   clauses.forEach((c,i)=>{const sc=sentenceScore(c,i);if(sc>cs){ci=i;cs=sc}});
   let piece=clauses[ci].replace(FILLER,'').trim();
   const next=clauses[ci+1];
   if(next&&(plain(next).match(PROBLEM)||[]).length&&(piece+' and '+next).length<=160)piece+=' and '+next;
   chosen=piece;
 }
 return {text:clip(tidy(chosen),max),index:best,sentences};
}

const RELATION_RULES=[
 [/\bmy (?:kid|son|daughter|child|baby|toddler)\b/gi,'a child'],
 [/\bmy (?:kids|sons|daughters|children|babies)\b/gi,'children'],
 [/\bmy (?:mom|mother|dad|father|grandma|grandmother|grandpa|grandfather|parents?)\b/gi,'a family member'],
 [/\bmy (?:wife|husband|partner|boyfriend|girlfriend|brother|sister|aunt|uncle|cousin)\b/gi,'a family member'],
 [/\b[Mm]y (?:neighbou?r)(?:\s+[A-Z][a-z]+)?\b/g,'a neighbor'],[/\bmy (?:neighbou?rs)\b/gi,'neighbors'],
 [/\b[Mm]y (?:boss|coworker|co-worker|friend|roommate)(?:\s+[A-Z][a-z]+)?\b/g,'someone'],
 [/\bmy landlord\b/gi,'a landlord']
];
const PII_RULES=[
 [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,'[email removed]'],
 [/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g,'[phone removed]'],
 [/\b\d{1,6}\s+(?:[A-Z][a-z]+\s){1,3}(?:St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Pkwy|Parkway|Hwy|Highway)\b/g,'a local street'],
 [/\b(?:apt|apartment|unit|suite)\s*#?\s*\d+[a-z]?\b/gi,'a home']
];
// Personal details someone may not want in a public draft. Suggestions only.
function personal(text){
 const found=[];const s=String(text||'');
 for(const [re,replacement] of [...PII_RULES,...RELATION_RULES]){re.lastIndex=0;for(const m of s.matchAll(re))found.push({found:m[0],replacement})}
 return found;
}
function generalize(text){
 let s=String(text||'');
 for(const [re,replacement] of [...PII_RULES,...RELATION_RULES])s=s.replace(re,(m,...rest)=>{
   const offset=rest[rest.length-2],atStart=offset===0||/[.!?]\s*$/.test(s.slice(0,offset));
   return atStart?replacement.charAt(0).toUpperCase()+replacement.slice(1):replacement;
 });
 return s;
}

const SMALL=new Set('a an and as at but by for in of on or the to vs via with from into per'.split(' '));
function titleCase(s){
 return s.split(/\s+/).map((w,i)=>{if(!w)return w;const lw=w.toLowerCase();if(i>0&&SMALL.has(lw))return lw;if(/[A-Z].*[A-Z]/.test(w)||/\d/.test(w))return w;return lw.charAt(0).toUpperCase()+lw.slice(1)}).join(' ');
}
const LEAD=/^(?:(?:i think|i wish|i hope|we should|we need to|we could|the city should|the county should|they should|someone should|maybe|please|let'?s|it would be (?:great|nice) (?:if|to)|people should be able to|everyone should be able to|we want to|to)\s+)+/i;
function firstClause(s){return String(s||'').split(/[.;!?\n]|,\s*(?:then|and then|so)\s|\s+then\s+/i)[0].trim()}
// A short, action-shaped title. Cut at a word boundary, never mid-word.
function makeTitle({issue='',outcome='',approach=''}={},{max=72}={}){
 const candidates=[firstClause(approach),firstClause(outcome),firstClause(issue)].map(c=>generalize(c.replace(FILLER,'').replace(LEAD,'').replace(/^[,\s]+/,'').trim()));
 let pick=candidates.find(c=>c.split(/\s+/).length>=3)||candidates.find(Boolean)||'Untitled proposal';
 pick=pick.replace(/[.!?…]+$/,'');
 if(pick.length>max){
   const cut=pick.slice(0,max+1),comma=cut.lastIndexOf(','),space=cut.lastIndexOf(' ');
   const joins=[...cut.matchAll(/\s(?:and|but|so|because|while|which|where)\s/gi)].map(m=>m.index).filter(i=>i>25);
   const join=joins.length?joins[joins.length-1]:-1;
   pick=comma>25?cut.slice(0,comma):join>0?cut.slice(0,join):cut.slice(0,space>20?space:max);
   for(let i=0;i<3;i++)pick=pick.replace(/[,;:\s]+$/,'').replace(/\s+(?:and|or|the|a|an|of|to|for|with|at|in|on|by|from)$/i,'');
 }
 return titleCase(pick.trim());
}

// Starting points per concept. People can accept, edit or ignore every suggestion.
const TEMPLATES={
 transit:{outcome:'Riders can wait for and reach transit safely and comfortably, in every season.',approach:'Pilot improvements at a small set of the busiest stops, then compare ridership and rider feedback.',measures:['Rider comfort and safety at pilot stops','Ridership at pilot stops','Installation and maintenance cost'],safeguards:'Prioritize accessibility, fund maintenance from the start, and place pilots fairly across neighborhoods.'},
 heat:{outcome:'People are protected from dangerous heat while they wait, walk and play outdoors.',approach:'Add shade, seating and water at the most heat-exposed public spots, starting with a summer pilot.',measures:['Heat-related illness and complaints','Shade coverage at priority sites','Surface temperatures at pilot sites'],safeguards:'Plan long-term maintenance and prioritize the residents most exposed to heat.'},
 flood:{outcome:'Streets and homes stay dry during heavy rain.',approach:'Clear and upgrade drains on the most-flooded streets and publish a response time for flooding reports.',measures:['Flooded streets per storm','Time to clear reported blockages','Repeat flooding reports'],safeguards:'Check downstream effects, keep a maintenance budget, and prioritize repeatedly flooded areas fairly.'},
 environment:{outcome:'Neighborhoods have clean air, reliable power and healthy green space.',approach:'Start with one measurable pilot (trees, cleaner power or outage backups) in the most affected area.',measures:['Air quality or outage hours','Residents reached','Cost per household'],safeguards:'Avoid shifting harms to other neighborhoods and review costs before scaling.'},
 housing:{outcome:'People can afford to stay in the neighborhoods they call home.',approach:'Test one targeted measure (more homes near transit or tenant protections) in one area and track displacement.',measures:['Share of income spent on rent','Displacement and evictions','New homes near transit'],safeguards:'Protect current tenants, include a right to return, and review effects on prices.'},
 streets:{outcome:'People can walk, bike and cross streets safely, especially near schools.',approach:'Pilot a safer crossing (crosswalk, guard or lower speed) at the most dangerous spot and measure speeds and near-misses.',measures:['Vehicle speeds near the pilot','Crashes and near-misses','People walking and biking'],safeguards:'Check traffic diversion, emergency access and accessibility before making it permanent.'},
 health:{outcome:'People can see a doctor when they need one, close to home.',approach:'Pilot extended hours or a mobile clinic where waits are longest, then compare wait times.',measures:['Days to next appointment','Emergency visits for minor issues','Patient satisfaction'],safeguards:'Protect patient privacy and fund staffing so other services are not cut.'},
 education:{outcome:'Every learner can build practical skills that lead somewhere.',approach:'Pilot an after-school or apprenticeship program with a local partner and track completion.',measures:['Participation and completion','Skills credentials earned','Cost per participant'],safeguards:'Keep it voluntary, accessible and free for families who cannot pay.'},
 community:{outcome:'Everyone has a welcoming public place to gather, study or unwind nearby.',approach:'Extend hours or open a space for a trial season, then count visits and ask users what to keep.',measures:['Visits during new hours','Who uses the space','Staffing and running cost'],safeguards:'Keep spaces free, accessible and safe, and fund staff before extending hours.'},
 work:{outcome:'Work pays enough and leaves time for life.',approach:'Pilot one change with willing employers (predictable schedules or training) and compare outcomes.',measures:['Hours and earnings','Job retention','Participation by employers'],safeguards:'Keep it voluntary at first and watch for unintended job losses.'},
 economy:{outcome:'Everyday essentials stay within reach for every household.',approach:'Test a targeted support (discounts, benefits enrollment help) with the households most affected.',measures:['Households reached','Monthly costs saved','Uptake among eligible people'],safeguards:'Make enrollment simple and private, and review the cost before expanding.'},
 safety:{outcome:'People feel and are safe in public spaces, day and night.',approach:'Pilot better lighting, design or outreach at one hotspot and compare incidents and use.',measures:['Reported incidents','People using the space after dark','Resident sense of safety'],safeguards:'Respect civil rights, avoid displacement of problems, and review results publicly.'},
 government:{outcome:'Residents can see how decisions and public money are made and get answers.',approach:'Publish contracts, budgets and reasons in plain language, with a deadline to answer public questions.',measures:['Records published on time','Questions answered by deadline','Resident trust'],safeguards:'Protect personal data and keep publication simple enough to sustain.'},
 digital:{outcome:'Every home has fast, affordable and reliable internet.',approach:'Pilot low-cost broadband or public wifi in the least-served area and measure speeds and sign-ups.',measures:['Homes connected','Speed and reliability','Monthly cost per home'],safeguards:'Protect privacy, avoid lock-in to one provider, and include help for new users.'},
 access:{outcome:'Public places work for people of every age and ability.',approach:'Audit and fix the most-used places first, with disabled residents guiding priorities.',measures:['Barriers removed','Use by older and disabled residents','Cost per fix'],safeguards:'Follow accessibility standards and fund upkeep.'}
};
const GENERIC={outcome:'People in the community see a clear, measurable improvement.',approach:'Start with a small voluntary pilot, measure what changes, and decide openly whether to expand.',measures:['Progress toward the intended outcome','Participation and equitable access','Implementation cost and unintended effects'],safeguards:'Protect privacy and equal access; invite affected communities to review the proposal; identify legal authority, costs and unintended consequences before adoption.'};
function topConcept(text){
 let best=null,score=0;
 for(const [id,set] of conceptsOf(text))if(set.size>score){best=id;score=set.size}
 return best;
}
function template(text){const id=topConcept(text);return {concept:id,label:id?CONCEPT_BY_ID.get(id).label:null,...(TEMPLATES[id]||GENERIC)}}
function sceneKind(text){
 const c=conceptsOf(text),has=id=>c.has(id)?c.get(id).size:0;
 const ranked=[['stop',has('transit')+has('heat')],['flood',has('flood')+has('environment')],['homes',has('housing')+has('economy')],['crossing',has('streets')+has('safety')],['commons',has('community')+has('education')+has('health')+has('digital')+has('work')+has('government')]].sort((a,b)=>b[1]-a[1]);
 return ranked[0][1]>0?ranked[0][0]:'commons';
}

// "Win over the opposers": illustrative concerns of simulated residents per topic.
const CONCERN_LIB={
 cost:{label:'cost',words:'budget cost costs fund funded funding within existing cap capped affordable price cheap pilot'},
 maintenance:{label:'upkeep',words:'maintain maintained maintenance upkeep repair repairs clean cleaning'},
 local:{label:'local say',words:'local neighborhood community residents consult consulted opt voluntary council'},
 evidence:{label:'evidence',words:'evaluate evaluation measure measured data study review evidence report results'},
 trial:{label:'start small',words:'pilot trial test sunset expire expires temporary small phase phased'},
 fairness:{label:'fairness',words:'equitable equity fair fairly prioritize underserved everyone accessible'},
 privacy:{label:'privacy',words:'privacy private anonymous anonymized consent voluntary'},
 displacement:{label:'displacement',words:'tenant tenants displacement return protect protection protections'},
 safety:{label:'safety',words:'safe safety training supervised secure'},
 clarity:{label:'red tape',words:'simple simpler plain clear understandable quick deadline'}
};
const TOPIC_CONCERNS={'Public transit':['cost','maintenance','fairness'],'Housing':['displacement','local','cost'],'Public spaces':['cost','maintenance','safety'],'Education':['cost','evidence','fairness'],'Transparency':['clarity','privacy','cost'],'Privacy':['privacy','evidence','local'],'Public health':['cost','evidence','fairness'],'Science':['safety','cost','fairness'],'Environment':['cost','maintenance','evidence'],'Accountability':['clarity','evidence','cost']};
const SHARES=[.45,.35,.2];
function concerns(topic){
 const ids=TOPIC_CONCERNS[topic]||['cost','trial','local'];
 return ids.map((id,i)=>({id,label:CONCERN_LIB[id].label,words:new Set(CONCERN_LIB[id].words.split(/\s+/).map(stem)),share:SHARES[i]}));
}
// Deterministic and transparent: each newly addressed concern wins over a fixed share
// of the simulated opposers. It is a teaching toy, not a model of real people.
function persuade({topic,text,counts},revised){
 const before={support:counts.support||0,oppose:counts.oppose||0,unsure:counts.unsure||0};
 const original=new Set(stems(text)),next=new Set(stems(revised));
 const sameIdea=similarity(text,revised).score>=3;
 const list=concerns(topic).map(c=>({...c,addressed:sameIdea&&[...c.words].some(w=>next.has(w)&&!original.has(w))}));
 let toSupport=0,toUnsure=0;
 for(const c of list)if(c.addressed){const share=Math.round(before.oppose*c.share);const won=Math.round(share*.7);toSupport+=won;toUnsure+=share-won}
 // Some opposers never move: at most 85% of them change position.
 const cap=Math.floor(before.oppose*.85),moved=toSupport+toUnsure;
 if(moved>cap){toSupport=Math.round(toSupport*cap/moved);toUnsure=cap-toSupport}
 return {sameIdea,concerns:list,won:toSupport,softened:toUnsure,after:{support:before.support+toSupport,oppose:before.oppose-toSupport-toUnsure,unsure:before.unsure+toUnsure},before};
}

const EXAMPLES=[
 'My neighborhood bus stops have no shade. Waiting in the summer heat is difficult, especially for older people and children. I wish our city would make public transit more comfortable.',
 'Every time it storms, the drain at the end of our street backs up and water reaches the front steps. Reporting it online never seems to get a response.',
 'Rent on my building went up again this year. A lot of families I know are talking about moving farther out, away from their jobs and schools.',
 'The library closes at 6pm on weekdays, so anyone who works a normal shift can never use it. It is the only quiet place nearby to study.',
 'Kids walking to the middle school have to cross a four-lane road with no crosswalk. Drivers speed through there every morning.',
 'It takes three months to get a primary care appointment at the clinic near us, so people end up in the emergency room for small things.',
 'There is nowhere for teenagers to hang out after school except the gas station parking lot. The rec center closed two years ago.',
 'Home internet here is expensive and keeps dropping out. Students do homework in the fast food parking lot to get wifi.',
 'The city approved a big consulting contract, but I cannot find what it was for or how they chose the company.',
 'The park by the bayou has no lights, so after dark nobody uses it. A few lights and a working water fountain would bring people back.'
];
function plural(n,one,many){return Number(n).toLocaleString()+' '+(Number(n)===1?one:(many||one+'s'))}

const api={version:'civic-match-1',stem,words,stems,terms,conceptsOf,profile,similarity,explain,rank,search,suggestCategory,splitSentences,pickProblem,personal,generalize,makeTitle,titleCase,template,topConcept,sceneKind,concerns,persuade,examples:EXAMPLES,plural,conceptLabel:id=>CONCEPT_BY_ID.get(id)?.label||id};
(typeof window!=='undefined'?window:globalThis).HeliosMatch=Object.freeze(api);
})();
