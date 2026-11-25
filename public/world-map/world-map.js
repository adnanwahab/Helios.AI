import {FACTORS, factorScores, rankCells, coordinates, totalWeight, describeCell, readUrlState, stateSearch} from './model.js';

const root=document.getElementById('world-hex-suitability');
const content=document.getElementById('map-content');
const loadStatus=document.getElementById('load-status');
const loadMessage=document.getElementById('load-message');
const retry=document.getElementById('retry');
let mounted=false,loading=false,heightFrame=0;

function publishSize(){
  if(window.parent===window || heightFrame) return;
  heightFrame=requestAnimationFrame(()=>{
    heightFrame=0;
    // The root contains all page content and has no vertical outer margins.
    // Measuring it lets an iframe shrink after explanatory details are closed.
    window.parent.postMessage({type:'helios:world-map:size',height:Math.ceil(root.getBoundingClientRect().height)},location.origin);
  });
}

function validateData(data){
  if(!data || data.countries?.type!=='FeatureCollection' || !Array.isArray(data.countries.features) || !data.countries.features.length || !Array.isArray(data.cells) || !data.cells.length) throw Error('Map data is incomplete');
  const ids=new Set();
  for(const c of data.cells){
    if(typeof c.id!=='string'||!/^[0-9a-f]{15}$/.test(c.id)||ids.has(c.id)||typeof c.country!=='string'||typeof c.city!=='string'||!Number.isFinite(c.lat)||Math.abs(c.lat)>90||!Number.isFinite(c.lon)||Math.abs(c.lon)>180||!Number.isFinite(c.areaKm2)||c.areaKm2<=0||!Number.isFinite(c.cityKm)||c.cityKm<0||!Number.isFinite(c.coastKm)||c.coastKm<0||!Array.isArray(c.boundary)||c.boundary.length<6||c.boundary.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))) throw Error('Map data is invalid');
    ids.add(c.id);
  }
  return data;
}

function mount(data){
  const d3=window.d3;
  const cells=data.cells.map(c=>({...c,values:factorScores(c),score:null,geo:{type:'Polygon',coordinates:[c.boundary]}}));
  const byId=new Map(cells.map(c=>[c.id,c]));
  const initial=readUrlState(location.search,new Set(byId.keys()));
  let weights=initial.weights,selectedId=initial.selectedId,weightSum=0,ordered=[],framePending=false,mapWidth=0;
  document.body.classList.toggle('embedded',initial.embed);

  const controls=root.querySelector('.weight-controls');
  const breakdown=root.querySelector('.breakdown');
  const select=document.getElementById('world-hex-choice');
  const stage=root.querySelector('.map-stage');
  const svg=d3.select(document.getElementById('world-map'));
  const chart=svg.append('g');
  const sphere=chart.append('path').attr('class','ocean');
  const graticule=chart.append('path').attr('class','graticule');
  const land=chart.append('g');
  const hexes=chart.append('g');
  const borders=chart.append('g');
  const halo=chart.append('path').attr('class','selection-halo');
  const outline=chart.append('path').attr('class','selection-outline');
  const dot=chart.append('circle').attr('class','selection-dot');
  const projection=d3.geoEqualEarth();
  const path=d3.geoPath(projection).digits(2);

  for(const f of FACTORS){
    const label=document.createElement('label');
    label.className='preference-field';
    label.htmlFor='pref-'+f.key;
    // These labels come from the local model configuration, never from URL/data input.
    label.innerHTML='<span class="weight-label"><span>'+f.label+'</span><output class="weight-number" for="pref-'+f.key+'">'+weights[f.key]+'</output></span><input id="pref-'+f.key+'" type="range" min="0" max="100" step="1" value="'+weights[f.key]+'" aria-label="'+f.label+' importance" aria-describedby="note-'+f.key+'"><span class="weight-note" id="note-'+f.key+'"><span>'+f.kind+'</span><span class="influence"></span></span>';
    controls.appendChild(label);
    const input=label.querySelector('input');
    input.addEventListener('input',()=>{
      weights[f.key]=Number(input.value);
      label.querySelector('output').textContent=input.value;
      if(!framePending){framePending=true;requestAnimationFrame(updateScores);}
    });
    input.addEventListener('change',saveUrl);
    const box=document.createElement('div');
    box.dataset.factor=f.key;
    box.innerHTML='<span class="breakdown-label">'+f.short+'</span><div class="factor-values"><span class="factor-value"></span><span class="factor-share muted"></span></div><div class="factor-track" aria-hidden="true"><div class="factor-fill"></div></div>';
    breakdown.appendChild(box);
  }

  const landPaths=land.selectAll('path').data(data.countries.features).join('path').attr('class','land');
  const borderPaths=borders.selectAll('path').data(data.countries.features).join('path').attr('class','country-lines');
  const hexPaths=hexes.selectAll('path').data(cells,c=>c.id).join('path').attr('class','hex').attr('data-cell-id',c=>c.id).on('click',(_,c)=>selectCell(c.id));
  hexPaths.append('title');
  select.addEventListener('change',()=>selectCell(select.value));

  function scoreColor(score){
    if(!weightSum) return 'var(--land)';
    const intensity=(10+90*Math.pow(Math.max(0,Math.min(100,score))/100,1.25)).toFixed(2);
    return 'color-mix(in oklab, var(--accent) '+intensity+'%, var(--land))';
  }

  function saveUrl(){
    const search=stateSearch(weights,selectedId,document.body.classList.contains('embedded'));
    if(location.search!==search) history.replaceState(null,'',location.pathname+search+location.hash);
    updateFullPageLink();
  }

  function updateFullPageLink(){
    root.querySelector('.full-page-link').href=location.pathname+stateSearch(weights,selectedId);
  }

  function drawSelection(){
    if(!mapWidth) return;
    const c=byId.get(selectedId);
    if(!c) return;
    halo.attr('d',path(c.geo));
    outline.attr('d',path(c.geo));
    const [x,y]=projection([c.lon,c.lat]);
    dot.attr('cx',x).attr('cy',y).attr('r',mapWidth<500?2:3);
  }

  function drawMap(){
    const width=Math.max(240,stage.getBoundingClientRect().width);
    const height=Math.round(width*.52);
    mapWidth=width;
    svg.attr('viewBox','0 0 '+width+' '+height).attr('height',height);
    projection.fitExtent([[4,4],[width-4,height-4]],{type:'Sphere'});
    sphere.attr('d',path({type:'Sphere'}));
    graticule.attr('d',path(d3.geoGraticule().step([30,30])()));
    landPaths.attr('d',path);
    borderPaths.attr('d',path);
    hexPaths.attr('d',c=>path(c.geo));
    drawSelection();
    publishSize();
  }

  function renderSelection(){
    const c=byId.get(selectedId);
    if(!c) return;
    select.value=c.id;
    root.querySelector('#selected-heading').textContent=c.country;
    root.querySelector('.selected-coordinate').textContent=coordinates(c)+' · '+Math.round(c.areaKm2).toLocaleString('en-US')+' km² cell';
    root.querySelector('.score-number').textContent=weightSum?Math.round(c.score):'Unranked';
    root.querySelector('.score-unit').hidden=!weightSum;
    root.querySelector('.paragraph').textContent=describeCell(c,weights);
    for(const f of FACTORS){
      const box=breakdown.querySelector('[data-factor="'+f.key+'"]');
      const value=Math.round(c.values[f.key]),share=weightSum?Math.round(weights[f.key]/weightSum*100):0;
      box.querySelector('.factor-value').textContent=value+'/100';
      box.querySelector('.factor-share').textContent=weights[f.key]&&weightSum?share+'% weight':'Off';
      box.querySelector('.factor-fill').style.width=value+'%';
      box.querySelector('.factor-fill').style.opacity=weights[f.key]&&weightSum?'1':'.25';
      box.setAttribute('aria-label',f.label+': score '+value+' out of 100; '+share+' percent influence; '+f.kind.toLowerCase());
    }
    root.dataset.selectedCell=c.id;
    drawSelection();
    updateFullPageLink();
    publishSize();
  }

  function selectCell(id){
    if(!byId.has(id)) return;
    selectedId=id;
    renderSelection();
    saveUrl();
  }

  function updateScores(){
    framePending=false;
    weightSum=totalWeight(weights);
    ordered=rankCells(cells,weights);
    ordered.forEach(c=>{byId.get(c.id).score=c.score;});
    if(!selectedId) selectedId=ordered[0].id;
    const options=document.createDocumentFragment();
    ordered.forEach((c,index)=>{
      const option=document.createElement('option');
      option.value=c.id;
      option.textContent=(weightSum?(index+1)+'. ':'')+c.country+' · '+coordinates(c)+(weightSum?' — '+Math.round(c.score)+'/100':' — unranked');
      options.appendChild(option);
    });
    select.replaceChildren(options);
    for(const f of FACTORS){
      const input=document.getElementById('pref-'+f.key),label=input.closest('label');
      const share=weightSum?Math.round(weights[f.key]/weightSum*100):0;
      input.value=weights[f.key];
      label.querySelector('output').textContent=weights[f.key];
      label.querySelector('.influence').textContent=weights[f.key]&&weightSum?share+'% influence':'Ignored';
      input.setAttribute('aria-valuetext',weights[f.key]+' out of 100 importance; '+share+' percent influence');
    }
    hexPaths.attr('fill',c=>scoreColor(c.score)).attr('data-score',c=>c.score===null?'':c.score.toFixed(2));
    hexPaths.select('title').text(c=>c.country+' · '+coordinates(c)+' · '+(weightSum?Math.round(c.score)+'/100 modeled fit':'Unranked'));
    root.querySelector('.empty-state').hidden=Boolean(weightSum);
    root.querySelector('.selection-sort').textContent=weightSum?'· ordered by modeled fit':'· alphabetical while preferences are off';
    root.querySelector('.legend-low').textContent=weightSum?'Lower fit':'Unranked';
    root.querySelector('.legend-high').textContent=weightSum?'Higher fit':'';
    root.querySelector('.legend-units').textContent=weightSum?'0–100':'No preferences selected';
    root.querySelector('.legend').setAttribute('aria-label',weightSum?'Modeled fit from zero to one hundred':'Unranked: no preferences selected');
    const legend=root.querySelector('.legend-scale');
    legend.hidden=!weightSum;
    legend.replaceChildren();
    for(const value of [0,20,40,60,80,100]){
      const swatch=document.createElement('span');
      swatch.className='legend-swatch';
      swatch.style.background=scoreColor(value);
      legend.appendChild(swatch);
    }
    root.dataset.weightSum=String(weightSum);
    renderSelection();
  }

  root.querySelector('.cell-count').textContent=cells.length.toLocaleString('en-US')+' land cells · tap to inspect';
  updateScores();
  content.hidden=false;
  drawMap();
  if(typeof ResizeObserver==='function') new ResizeObserver(()=>{
    if(Math.abs(stage.getBoundingClientRect().width-mapWidth)>.5) drawMap();
    publishSize();
  }).observe(root);
  else window.addEventListener('resize',drawMap);
  root.querySelector('.model-note').addEventListener('toggle',publishSize);
  window.addEventListener('popstate',()=>{
    const state=readUrlState(location.search,new Set(byId.keys()));
    weights=state.weights;
    selectedId=state.selectedId;
    document.body.classList.toggle('embedded',state.embed);
    updateScores();
    drawMap();
  });
  root.dataset.ready='true';
  root.dataset.cellCount=String(cells.length);
}

async function load(){
  if(loading||mounted) return;
  loading=true;
  loadStatus.hidden=false;
  loadStatus.classList.remove('error');
  retry.hidden=true;
  loadMessage.textContent='Preparing the world map…';
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    if(!window.d3?.geoEqualEarth) throw Error('Map renderer unavailable');
    const response=await fetch(new URL('./world-data.json',import.meta.url),{signal:controller.signal,credentials:'omit'});
    if(!response.ok) throw Error('Map data unavailable');
    const data=validateData(await response.json());
    mount(data);
    mounted=true;
    loadStatus.hidden=true;
  }catch(error){
    root.dataset.ready='false';
    loadStatus.classList.add('error');
    loadMessage.textContent='The map could not load. Check your connection and try again.';
    retry.hidden=false;
  }finally{
    clearTimeout(timeout);
    loading=false;
    publishSize();
  }
}

retry.addEventListener('click',()=>{if(!window.d3?.geoEqualEarth) location.reload(); else load();});
load();
