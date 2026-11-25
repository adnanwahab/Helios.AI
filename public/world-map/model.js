// The model's geographic proxies and synthetic layers are deliberately explicit.
export const FACTORS = Object.freeze([
  {key:'climate',label:'Mild climate',short:'Climate',kind:'Latitude proxy',weight:70,phrase:'mild climate'},
  {key:'cost',label:'Lower living costs',short:'Costs',kind:'Synthetic example',weight:65,phrase:'lower living costs'},
  {key:'city',label:'Near cities',short:'Cities',kind:'Geographic distance',weight:50,phrase:'city proximity'},
  {key:'nature',label:'Nature access',short:'Nature',kind:'Synthetic example',weight:55,phrase:'nature access'},
  {key:'coast',label:'Near the coast',short:'Coast',kind:'Geographic distance',weight:40,phrase:'coastal proximity'},
]);

export const defaultWeights = () => Object.fromEntries(FACTORS.map(f => [f.key, f.weight]));
export const clampScore = value => Math.max(0, Math.min(100, value));
export const totalWeight = weights => FACTORS.reduce((sum,f) => sum + weights[f.key], 0);

export function factorScores(cell) {
  const x=cell.lon*Math.PI/180, y=cell.lat*Math.PI/180;
  // Spherical coordinates keep the illustrative patterns continuous at ±180°.
  const u=Math.cos(y)*Math.cos(x), v=Math.cos(y)*Math.sin(x), z=Math.sin(y);
  return {
    climate:clampScore(100*Math.exp(-Math.pow((Math.abs(cell.lat)-32)/24,2))),
    cost:clampScore(52+22*Math.sin(2.3*u+0.6*z)+18*Math.cos(3.7*z-0.8*v)+8*Math.sin(5*v-2*u)),
    city:clampScore(100*Math.exp(-cell.cityKm/240)),
    nature:clampScore(52+23*Math.sin(1.6*v-3.4*z+1.1)+19*Math.cos(3.1*u+2.7*z-0.6)),
    coast:clampScore(100*Math.exp(-cell.coastKm/280)),
  };
}

export function suitability(values,weights) {
  const sum=totalWeight(weights);
  return sum ? FACTORS.reduce((score,f) => score+values[f.key]*weights[f.key],0)/sum : null;
}

export function rankCells(cells,weights) {
  const active=totalWeight(weights)>0;
  return cells.map(c => ({...c,score:suitability(c.values,weights)})).sort((a,b) =>
    active ? b.score-a.score || a.id.localeCompare(b.id) : a.country.localeCompare(b.country) || a.id.localeCompare(b.id));
}

export function coordinates(cell) {
  return Math.abs(cell.lat).toFixed(1)+'°'+(cell.lat<0?'S':'N')+' · '+Math.abs(cell.lon).toFixed(1)+'°'+(cell.lon<0?'W':'E');
}

export function readUrlState(search,validIds=new Set()) {
  const params=new URLSearchParams(search), weights=defaultWeights();
  for(const f of FACTORS) {
    const raw=params.get(f.key);
    if(raw!==null && /^\d{1,3}$/.test(raw) && Number(raw)<=100) weights[f.key]=Number(raw);
  }
  const id=params.get('cell');
  return {weights,selectedId:validIds.has(id)?id:null,embed:params.get('embed')==='1'};
}

export function stateSearch(weights,selectedId,embed=false) {
  const params=new URLSearchParams();
  if(embed) params.set('embed','1');
  for(const f of FACTORS) {
    const weight=weights[f.key];
    if(Number.isInteger(weight)&&weight>=0&&weight<=100&&weight!==f.weight) params.set(f.key,String(weight));
  }
  if(typeof selectedId==='string' && /^[0-9a-f]{15}$/.test(selectedId)) params.set('cell',selectedId);
  const value=params.toString();
  return value?'?'+value:'';
}

export function describeCell(cell,weights) {
  const sum=totalWeight(weights);
  if(!sum) return 'You have turned every preference off, so this hexagon has no combined suitability score and the map is unranked. Its geographic and illustrative criterion scores remain visible below. Raise any slider to compare regions and explore the tradeoffs.';
  const active=FACTORS.filter(f=>weights[f.key]>0);
  const priorities=[...active].sort((a,b)=>weights[b.key]-weights[a.key]);
  const strengths=[...active].sort((a,b)=>weights[b.key]*cell.values[b.key]-weights[a.key]*cell.values[a.key]);
  const shortfalls=[...active].sort((a,b)=>weights[b.key]*(100-cell.values[b.key])-weights[a.key]*(100-cell.values[a.key]));
  const priorityText=priorities.slice(0,2).map(f=>f.phrase+' ('+Math.round(weights[f.key]/sum*100)+'% influence)').join(' and ');
  const strength=strengths[0], tradeoff=shortfalls[0];
  let contribution;
  if(active.length===1) contribution='Only '+strength.phrase+' is active, so that criterion determines the combined score. ';
  else if(strength.key===tradeoff.key) contribution=strength.label+' contributes the most to the result; at '+Math.round(cell.values[strength.key])+'/100, it also leaves the largest weighted gap to an ideal match. ';
  else contribution='Its largest positive contribution comes from '+strength.phrase+' ('+Math.round(cell.values[strength.key])+'/100). Its main tradeoff is '+tradeoff.phrase+' ('+Math.round(cell.values[tradeoff.key])+'/100), the largest weighted shortfall. ';
  const distance=km=>(km<10?Math.round(km):Math.round(km/10)*10).toLocaleString('en-US');
  return 'With '+priorityText+' weighted most strongly, this hexagon centered in '+cell.country+' scores '+Math.round(suitability(cell.values,weights))+'/100 in the illustrative model. '+contribution+'Its center is approximately '+distance(cell.coastKm)+' km from the mapped coast and '+distance(cell.cityKm)+' km from '+cell.city+', the nearest mapped city. Costs and nature are synthetic; climate is a latitude proxy.';
}
