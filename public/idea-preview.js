/* In-page scenario explorer. All values are illustrative, never forecasts. */
(function(root){
'use strict';
const H=root.HeliosIdeas;
const settings={
 library:{title:'Evening library access',label:'Later evenings per week',min:0,max:5,step:1,baseline:0,initial:2,metrics:['Additional open hours / week','Additional staff-hours / week'],unit:'',tradeoff:'Later access needs staffing. Keep weekend hours and free admission; ask staff about schedules.'},
 transit:{title:'Bus frequency',label:'Minutes between buses',min:5,max:30,step:5,baseline:20,initial:10,metrics:['Expected wait (minutes)','Vehicle-hours / day'],unit:' min',tradeoff:'More frequent buses need more vehicles and operating hours. Check capacity, fares and accessibility.'},
 shade:{title:'Shade at bus stops',label:'Stops with shade',min:0,max:10,step:1,baseline:0,initial:4,metrics:['Illustrative stops covered (%)','Shelters required'],unit:'',tradeoff:'More shade requires installation and upkeep. Check accessibility and local heat exposure.'}
};
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
let active=null,model=null,version='',practicePosition='',currentValue=null,baselineValue=null;
function renderScene(container,kind,value){
 container.replaceChildren();
 const scene=make('div',undefined,'idea-scene');
 scene.setAttribute('role','img');
 if(kind==='library'){
  scene.setAttribute('aria-label',value+' of five weekdays with later library hours');
  for(let i=0;i<5;i++){const block=make('div',undefined,'idea-building'+(i<value?' lit':''));block.append(make('span',i<value?'9 PM':'6 PM'),make('small',['Mon','Tue','Wed','Thu','Fri'][i]));scene.append(block)}
 }else if(kind==='transit'){
  const n=Math.ceil(60/value);scene.setAttribute('aria-label',n+' assumed buses on one route');
  for(let i=0;i<n;i++){const block=make('div','▰','idea-bus');block.setAttribute('aria-hidden','true');scene.append(block)}
 }else{
  scene.setAttribute('aria-label',value+' of ten stops have a shelter');
  for(let i=0;i<10;i++){const block=make('div',i<value?'▰':'│','idea-stop'+(i<value?' lit':''));block.setAttribute('aria-hidden','true');scene.append(block)}
 }
 container.append(scene);
}
function mount(host,idea,kind,example=false){
 const cfg=settings[kind];host.replaceChildren();
 host.append(make('p',example?'Separate example · not a model of your draft':'Illustrative preview · not a forecast','eyebrow'),make('h2',cfg.title),make('p',cfg.tradeoff,'hint'));
 const input=make('input');input.type='range';input.min=cfg.min;input.max=cfg.max;input.step=cfg.step;input.id='idea-scenario-slider';input.value=String(currentValue??cfg.initial);
 const label=make('label',cfg.label);label.htmlFor=input.id;
 const out=make('output');out.htmlFor=input.id;
 const layout=make('div',undefined,'idea-comparison'),left=make('div'),right=make('div'),before=make('div'),after=make('div'),metrics=make('p',undefined,'hint'),assumptions=make('p',undefined,'hint');
 metrics.setAttribute('role','status');
 left.append(make('strong','Baseline'),before);right.append(make('strong','Your version'),after);layout.append(left,right);
 const reset=make('button','Reset assumptions','secondary');reset.type='button';
 function draw(){
  currentValue=Number(input.value);const b=H.simulate(kind,baselineValue??cfg.baseline),p=H.simulate(kind,currentValue);
  out.textContent=String(p.value)+cfg.unit;renderScene(before,kind,b.value);renderScene(after,kind,p.value);
  metrics.textContent=cfg.metrics[0]+': '+b.access+' → '+p.access+' · '+cfg.metrics[1]+': '+b.resource+' → '+p.resource;
  assumptions.textContent='Assumptions: '+p.description+' Real costs, demand and equity are not estimated.';
 }
 input.addEventListener('input',draw);reset.addEventListener('click',()=>{input.value=String(cfg.initial);draw()});
 host.append(label,input,out,layout,metrics,assumptions,reset);
 if(!example){const use=make('button','Use these assumptions in my draft','secondary');use.type='button';use.addEventListener('click',()=>{const target=document.getElementById('option');if(!target||target.closest('[hidden]'))return;const note='Illustrative scenario assumption: '+cfg.label+' = '+currentValue+cfg.unit+'. Evaluate locally before implementation.';const next=target.value.replace(/\n\nIllustrative scenario assumption:[^\n]*$/,'')+'\n\n'+note;if(next.length>target.maxLength){metrics.textContent='Implementation field is full. Edit it before adding the assumption.';return}target.value=next;target.dispatchEvent(new Event('input',{bubbles:true}));metrics.textContent='Assumption copied into the editable implementation. No data sent.'});if(!document.getElementById('proposal-form').hidden)host.append(use)}
 draw();
}
function sync(idea){
 const host=document.getElementById('idea-experiment'),board=document.getElementById('active-board-idea'),review=document.getElementById('active-draft-review');
 if(!host||!board||!review)return;
 if(!idea){host.hidden=true;board.hidden=true;review.hidden=true;active=null;version='';practicePosition='';currentValue=null;return}
 active=idea;board.hidden=false;board.replaceChildren(make('p','Active idea · private workspace','eyebrow'),make('strong',idea.title||idea.issue),make('p','Related clauses below are examples, not votes on your draft.','hint'));
 review.hidden=!idea.review;
 const key=JSON.stringify(idea);
 if(key!==version){version=key;practicePosition=''}
 if(idea.review){
  review.replaceChildren(make('p','Practice feedback · exact active wording','eyebrow'),make('strong',idea.title),make('p',idea.goal||idea.issue),make('p',idea.option||'','hint'));
  const actions=make('div',undefined,'actions'),status=make('p','No public vote or tally.','hint');status.setAttribute('role','status');
  for(const text of ['Support','I have a concern','Revise']){const b=make('button',text,'secondary');b.type='button';b.setAttribute('aria-pressed',String(practicePosition===text));b.addEventListener('click',()=>{practicePosition=text;for(const button of actions.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button===b));status.textContent='Practice choice: '+text+'. Nothing sent or counted. If you edit the draft, choose again.';if(text==='Revise')document.getElementById(idea.related?'heading-3':'goal').focus()});actions.append(b)}
  review.append(actions,status);
 }
 const kind=H.scenario([idea.title,idea.issue,idea.goal,idea.option].filter(Boolean).join(' '));
 if(kind!==model){model=kind;currentValue=null;baselineValue=null}
 host.hidden=!idea.review;
 if(!idea.review)return;
 // Preserve slider focus and values when a draft field changes without changing the scenario type.
 if(kind&&host.dataset.model===kind&&host.childElementCount)return;
 host.dataset.model=kind||'unsupported';host.replaceChildren();
 if(kind){mount(host,idea,kind);return}
 host.append(make('h2','Explore a possible version'),make('p','No model is available for this wording yet. Your draft is preserved. Try a separate library-hours or transit example.','hint'));
 for(const k of ['library','transit','shade']){const b=make('button',settings[k].title,'secondary');b.type='button';b.addEventListener('click',()=>{currentValue=null;mount(host,idea,k,true)});host.append(b)}
}
document.addEventListener('helios:active-idea',e=>sync(e.detail));
})(globalThis);
