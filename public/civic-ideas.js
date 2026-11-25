/* Local, explainable demo heuristics. No network requests, storage or inferred votes. */
(function(root){
'use strict';
const stop=new Set('the and that with from this have should would what their need people more make public for are was about into our could please pls want wish there were every someone something improve better keep start get able help can not before after then they them your you its does will one two three very only all some near'.split(' '));
const concepts={
 transit:/\b(bus(?:es)?|transit|transport(?:ation)?|commut\w*|train|rail|mobility|ways to get around|rider\w*|headway)\b/i,
 shade:/\b(shade|shelter\w*|heat|cooling|hot|canop\w*)\b/i,
 housing:/\b(housing|homes?|rents?|renters?|displacement|zoning|affordable housing)\b/i,
 library:/\b(librar\w*|reading room\w*)\b/i,
 community:/\b(lonel\w*|belong\w*|friends?|community|neighbou?rhood|gather\w*|third places?|meet people|social spaces?)\b/i,
 bike:/\b(bik\w*|cycl\w*|pedestrian\w*|crossings?|walkab\w*|sidewalk\w*|road safety)\b/i,
 trees:/\b(trees?|greenery|green spaces?|parks?|nature|environment|climate)\b/i,
 education:/\b(schools?|students?|education|teachers?|learn\w*|literacy|read\w*)\b/i,
 health:/\b(health|hospital\w*|medicine|medical|preventive care|mental health)\b/i,
 work:/\b(jobs?|workers?|employment|workplace|staff\w*|overtime)\b/i,
 economy:/\b(wages?|income|poverty|prices?|food|money|bills?|economic security)\b/i,
 justice:/\b(justice|prison|jail|courts?|rights|police|accus\w*|legal counsel)\b/i,
 government:/\b(vot\w*|government|council|democracy|elections?|accountability|budgets?|transparency)\b/i,
 technology:/\b(ai|internet|digital|privacy|technology|software|science|fabrication)\b/i,
 flood:/\b(flood\w*|drainage|stormwater|water|pollution)\b/i
};
const titles={transit:'Reliable transport',shade:'Shade and cooling',housing:'Housing affordability',library:'Library access',community:'Community and belonging',bike:'Safe walking and cycling',trees:'Trees and green spaces',education:'Education',health:'Health access',work:'Fair work',economy:'Economic security',justice:'Justice',government:'Public accountability',technology:'Technology and privacy',flood:'Flood resilience'};
const categoryIndex={transit:1,shade:1,housing:1,library:5,community:5,bike:1,trees:9,education:3,health:2,work:4,economy:0,justice:6,government:7,technology:8,flood:9};
function tags(text){return Object.keys(concepts).filter(k=>concepts[k].test(String(text)))}
function words(text){return new Set((String(text).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]).filter(w=>!stop.has(w)))}
function relevance(query,target){
 const q=tags(query),t=tags(target),qw=words(query),tw=words(target);
 const shared=q.filter(x=>t.includes(x));let overlap=0;for(const w of qw)if(tw.has(w))overlap++;
 // Don't let generic overlap or a category alone create a match.
 if(q.length&&!shared.length)return {score:0,overlap:0,shared:[]};
 if(!shared.length&&overlap<2&&!(qw.size===1&&overlap===1))return {score:0,overlap,shared};
 const score=shared.length*12+Math.min(overlap,8)*2+(shared.includes(q[0])?5:0)-Math.max(0,t.length-shared.length);
 return {score,overlap,shared};
}
function rank(records,query,category){return records.map(p=>{const hit=relevance(query,[p.title,p.sharedGoal,p.illustrativeLocalOption,p.topic,p.text].filter(Boolean).join(' '));const core=relevance(query,[p.title,p.sharedGoal,p.topic,p.text].filter(Boolean).join(' '));return {p,...hit,score:hit.score>0?hit.score+Math.max(0,core.score):0,categoryMatch:p.category===category}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||Number(b.categoryMatch)-Number(a.categoryMatch)||String(a.p.id).localeCompare(String(b.p.id)))}
function matches(query,target){if(!String(query).trim())return true;return String(target).toLowerCase().includes(String(query).trim().toLowerCase())||relevance(query,target).score>0}
function split(text){return [...new Set(String(text).trim().split(/(?<=[.!?])\s+|\n+|;\s*/u).map(s=>s.trim()).filter(Boolean))]}
const conditionPattern=/\b(?:do not|don't|must not|never|without|no fare|no fee|no admission|no increase|non.negotiable|keep|retain|protect|preserve|affordable|cheap|low.cost|free entry|free admission|accessib\w*|review after|review in|after \d+ days|before expanding|budget|staffing|overtime)\b/i;
function analyze(text){
 const parts=split(text);const concerns=[],conditions=[];
 for(const sentence of parts){
  if(conditionPattern.test(sentence))conditions.push(sentence);
  const found=tags(sentence);
  // Related details within a sentence remain verbatim; a sentence may inform more than one concern.
  for(const topic of found){let c=concerns.find(x=>x.topic===topic);if(!c){c={topic,label:titles[topic],sentences:[]};concerns.push(c)}c.sentences.push(sentence)}
  if(!found.length&&!conditionPattern.test(sentence))concerns.push({topic:'other',label:'Other concern',sentences:[sentence]});
 }
 if(!concerns.length&&parts.length)concerns.push({topic:'other',label:'Your concern',sentences:parts});
 return {concerns,conditions,parts};
}
const templates={
 transit:['People can reach daily destinations with reliable, accessible service.','Compare a small route pilot with current service; measure wait time, operating cost and accessibility before expansion.'],
 library:['Residents can use the library at times that fit their lives.','Test revised opening hours at one branch; consult staff and measure usage, staffing and access before expanding.'],
 shade:['People can wait outdoors more comfortably and safely.','Pilot shade at a small number of exposed stops; compare coverage, maintenance and accessibility.'],
 community:['Residents have welcoming, accessible ways to meet and participate.','Try a small voluntary gathering-space pilot and ask residents what would make it useful.'],
 bike:['People can walk and cycle safely to everyday destinations.','Test one crossing or corridor with affected residents and measure safety and accessibility.'],
 trees:['Residents have more accessible, well-maintained green spaces.','Pilot planting at suitable public sites and review maintenance and access.'],
 housing:['Residents have access to stable, affordable housing.','Compare a small local housing pilot with existing rules and displacement safeguards.']
};
function draft(analysis,index,categories){
 const c=analysis.concerns[index];if(!c)return null;
 const fallback=['Describe an improved outcome for '+c.label.toLowerCase()+'.','Explore a small, reversible pilot with affected people and measure results before expansion.'];
 const [outcome,approach]=templates[c.topic]||fallback;
 const issue=c.sentences.join('\n');
 const constraint=analysis.conditions.length?' Conditions to review and preserve:\n'+analysis.conditions.join('\n'):'';
 return {issue,category:categories[categoryIndex[c.topic]??7],outcome,approach:approach+constraint,conditions:analysis.conditions,topic:c.topic,label:c.label};
}
function scenario(text){const s=String(text);if(concepts.library.test(s)&&/\b(hours?|open\w*|clos\w*|evening|late|after work)\b/i.test(s))return 'library';if((concepts.transit.test(s)||/\bstops?\b/i.test(s))&&/\b(shade|shelter|heat|hot)\b/i.test(s))return 'shade';if(concepts.transit.test(s)&&/\b(wait\w*|frequen\w*|reliab\w*|late|minutes?|service|headway|bus(?:es)?)\b/i.test(s))return 'transit';return null}
function simulate(kind,value){
 if(kind==='library'){const days=Math.max(0,Math.min(5,Math.round(value)));return {value:days,access:days*3,resource:days*3*2,description:days+' later evening(s) × 3 hours; 2 staff assumed.'}}
 if(kind==='transit'){const headway=Math.max(5,Math.min(30,Math.round(value/5)*5));return {value:headway,access:headway/2,resource:Math.ceil(60/headway)*12,description:'Uniform arrivals; 60-minute round trip, 12 operating hours; no congestion modeled.'}}
 if(kind==='shade'){const stops=Math.max(0,Math.min(10,Math.round(value)));return {value:stops,access:stops*10,resource:stops,description:'10 illustrative stops, equal weight; 1 shelter per covered stop.'}}
 return null;
}
function mergeReview(a,b){
 const allA=split(a),allB=split(b),limited=allA.length>200||allB.length>200;const A=allA.slice(0,200),B=allB.slice(0,200),normalize=s=>s.toLowerCase().replace(/[.!?]+$/,'').replace(/\s+/g,' ').trim();
 const shared=[],similar=[],conditions=[],conflicts=[],seen=new Set();
 const add=(list,s)=>{if(!list.includes(s))list.push(s)};
 for(const x of [...A,...B])if(conditionPattern.test(x))add(conditions,x);
 for(const x of A)for(const y of B){
  const k=normalize(x)+'|'+normalize(y);if(seen.has(k))continue;seen.add(k);
  if(normalize(x)===normalize(y)){add(shared,x);continue}
  const lx=x.match(/\b(open|close)\w*\s+(?:the\s+)?(?:library\s+)?(?:at|until|by)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i)||x.match(/\b(open|close)\w*.*?\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  const ly=y.match(/\b(open|close)\w*\s+(?:the\s+)?(?:library\s+)?(?:at|until|by)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i)||y.match(/\b(open|close)\w*.*?\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  if(lx&&ly&&normalize(lx[2])!==normalize(ly[2])){conflicts.push({a:x,b:y});continue}
  const key=s=>normalize(s).replace(/\b(entry|admission|access)\b/g,'entry');
  if(key(x)===key(y)){similar.push({a:x,b:y});continue}
  const nx=normalize(x),ny=normalize(y),neg=/\b(do not|don't|never|must not|no)\b/;
  if(neg.test(nx)!==neg.test(ny)&&nx.replace(neg,'').replace(/\s+/g,' ').trim()===ny.replace(neg,'').replace(/\s+/g,' ').trim()){conflicts.push({a:x,b:y});continue}
  const hit=relevance(x,y);if(hit.shared.length&&hit.overlap>=2)similar.push({a:x,b:y});
 }
 return {shared,similar,conditions,conflicts,limited};
}
root.HeliosIdeas=Object.freeze({tags,words,relevance,rank,matches,analyze,draft,scenario,simulate,mergeReview,split});
})(globalThis);
