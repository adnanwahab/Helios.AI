// Coarse, angular land-mask demo; all wellbeing conditions are synthetic.
export const factors=[
 ['Happiness','Life satisfaction and positive emotions'],
 ['Love & belonging','Friendships, family and close relationships'],
 ['Health','Physical and mental wellbeing'],
 ['Freedom','Autonomy and personal choice'],
 ['Financial security','Ability to afford a comfortable life'],
 ['Safety','Freedom from harm and instability'],
 ['Meaning & purpose','Meaningful work, learning and contribution'],
 ['Community','Trust, cooperation and social connection'],
 ['Free time','Leisure, rest and play']
];
export const presets={
 balanced:[85,90,90,80,70,85,80,75,75],
 love:[85,100,90,65,65,95,60,100,90],
 freedom:[80,60,75,100,65,65,85,45,95],
 purpose:[75,75,80,90,60,70,100,90,65],
 comfort:[90,80,90,60,100,100,45,60,100],
 community:[85,95,85,75,70,85,90,100,80]
};
const encoded=`_00g00
Q00803100A0Jy00
M00103300503200E0J90030IM0020GM00
H0010310020320010310010360010J200C0JN0020G90050G70010GB00
H0030310010310010310010310020310010360090JN0010G600C0G10010GF00
50050490040310020310060340090JD0020IB00R0G600
10010G300704H0330020330060JE0010I21L21o30G20070G100U0G
600504I0320020340040J50021k70010I31L21oh0G100
500704E0340020370020JD0030I11L10031ob0G20020G200
700104500104B03500403H0011j20010I10011L20021SX0G50010G500
500104900D03200603G0011j20021i20021R11MV0G50020G500
F00E03100603E0011b21j10031T21O31M80G505D0G11g50G40010G600
G00H03100103100103F0030Y21T11q11p11O51N20GB0510G61A10G11A41g40GA00
G00C04403104103I0020Y11Y21h21P21Q10011N10030G10090521g81A51g10GC00
H00C04103204I0021a30Y10011h10012012111U40020G10010530650541g41A61g10G20011sA00
G00F04J0031a40011h11X20041W11K11l10031H306F1g11830011sB00
H00E04J0011Z21a60011V10051W11I20011I21H10611F11GD1g20011920011sB00
H00D04L0011w30z10y70011J21141I31F11E11BC1g20011910011sD00
K0010410L704L0021w40z21y10011y11x20010-11v21141I21F21E11BD1gG00
K0030L104400104K0011w50z51y31x31v11041I31E21B11D31g11B71gH00
K0050L400104J0020e50z41y31x10041v20011I31E71B11661gH00
M0020LO0010220e10d40z10g10F21y31x10041v10_11230051B11C11B11611g21721gJ00
700104E0030LN0030e30d10z30g20F40E10041v11240041B200216115117L00
N0030L10UL0030e30d30g20F40E11r10031u60021B400116214115L00
R0010T10SJ0010x30d10o10g10h20g20F50E11z10011u80011B600114113117K00
V0020VF0020m10d10o10j10f20h10i20F40E21z10011-80011B700117L00
T0010R20Q30V10WD0010n10m10l10k10f30h10F20p32241z10C80011fC0011mF00
U0030Q20V10W10XD0010l30010h20i20p20B22221z20CD0010810011n30011nI00
U0030Q10V40NI0010r10q40B11_20D10CG0010820011n108I00
T0020Z10Q70NG0020r40B10120D10CH00108100408300108D00
T0040P90NE0010q50B20110DI00108400108300208107200107700
T0020PB0NE0010v40B301J00208800108107A00
U0020PA0NF0020v20B20s201V00107800
U0020P20O70NF0030v30s10t10uQ0021eD00
V0020P20O70NE0030v20s10a30u10010wM0041e10011eA00
W0040O50NF0030c10b20a10u20020wL0071eA00
X0020O11t50NG0020c20b10a10u30010wJ00B1e40011c300
W0010A20921t20NI0010c20b10K30010wK00B1e800
W0010A40920NJ0010c30KO00C1e700
W0040920NK0030KP00B1e800
W0010A30910ML0030KQ0021e30051e800
V0010A409v0031e70011d100
W00309_0060011d
V00309z0011e60011d200
V0010A109_0060011d200
U0010A209_00900
V0010A10920010H_00600
V0010A109_00900
_00g00
_00g00`;
const alphabet='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const W=720,H=300,R=3.96,DX=Math.sqrt(3)*R,DY=R*1.5;
const clamp=x=>Math.max(0,Math.min(100,x));
const random=(i,j,k)=>{const v=Math.sin(i*127.1+j*311.7+k*74.13)*43758.5453;return v-Math.floor(v)};
export function generateCells(){
 const cells=[];
 encoded.split('\n').forEach((row,i)=>{
  let j=0;
  for(let p=0;p+2<row.length;p+=3){
   const count=alphabet.indexOf(row[p]),land=64*alphabet.indexOf(row[p+1])+alphabet.indexOf(row[p+2]);
   for(let m=0;m<count;m++,j++){
    if(!land)continue;
    const x=(j+(i%2)*.5)*DX,y=i*DY;
    if(x>=W||y>=H)continue;
    const vals=factors.map((_,k)=>clamp(63+23*Math.sin(j*.095+k*2.7)*Math.cos(i*.15+k*1.3)+17*Math.sin(i*.11+j*.045+k*3.1)+10*(random(i,j,k)-.5)));
    cells.push({x,y,lat:85-y/2,lon:x/2-180,vals,score:null});
   }
  }
 });
 return cells;
}
export function weightedScore(values,weights){
 const total=weights.reduce((a,b)=>a+b,0);
 return total>0?values.reduce((a,v,i)=>a+v*weights[i],0)/total:null;
}
export function summarize(cells,weights){
 let best=null,sum=0,high=0;
 const active=weights.some(w=>w>0);
 for(const c of cells){
  c.score=weightedScore(c.vals,weights);
  if(!active)continue;
  sum+=c.score;
  if(c.score>=75)high++;
  if(!best||c.score>best.score)best=c;
 }
 return {best,mean:active&&cells.length?sum/cells.length:null,high:active?high:null};
}
const colors=[[59,66,105],[50,125,152],[106,197,163],[255,226,155]];
function color(v){if(v===null)return '#42534e';const t=clamp(v)/100*3,k=Math.min(2,Math.floor(t)),f=t-k;return 'rgb('+colors[k].map((n,i)=>Math.round(n+(colors[k+1][i]-n)*f)).join(',')+')'}
function coords(c){return Math.abs(c.lat).toFixed(1)+'° '+(c.lat>=0?'N':'S')+' · '+Math.abs(c.lon).toFixed(1)+'° '+(c.lon>=0?'E':'W')}
export function describe(c,weights){
 if(c.score===null)return 'Choose at least one value to calculate a meaningful fit.';
 const ranked=factors.map((f,k)=>({name:f[0],v:c.vals[k],w:weights[k]})).filter(v=>v.w>0);
 const good=[...ranked].sort((a,b)=>b.v*b.w-a.v*a.w)[0],bad=[...ranked].sort((a,b)=>(100-b.v)*b.w-(100-a.v)*a.w)[0];
 const priority=[...ranked].sort((a,b)=>b.w-a.w).slice(0,3).map(v=>v.name.toLowerCase());
 const gap=(100-bad.v)*bad.w;
 return 'Your current priorities are '+priority.join(', ')+'. This hypothetical community scores '+c.score.toFixed(1)+' out of 100. '+good.name+' makes the strongest positive weighted contribution. '+(gap>1e-9?bad.name+' has the largest weighted shortfall. A possible next step is to explore policy experiments addressing that shortfall while preserving existing strengths. ':'There is no shortfall in the active dimensions in this scenario. ')+'These are synthetic scenario values, not real local conditions or forecasts.';
}
function mount(){
 const $=id=>document.getElementById(id),cells=generateCells(),weights=[...presets.balanced],canvas=$('map'),ctx=canvas.getContext('2d');
 let selected=null,hover=null,best=null;
 function hex(c,stroke){
  ctx.beginPath();
  for(let n=0;n<6;n++){const a=(60*n-30)*Math.PI/180,x=c.x+(R-.25)*Math.cos(a),y=c.y+(R-.25)*Math.sin(a);n?ctx.lineTo(x,y):ctx.moveTo(x,y)}
  ctx.closePath();ctx.fillStyle=color(c.score);ctx.fill();
  if(stroke){ctx.lineWidth=1;ctx.strokeStyle=stroke;ctx.stroke()}
 }
 function draw(){
  if(!ctx)return;
  ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.fillStyle='#0c191c';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#203232';ctx.lineWidth=.45;
  for(let x=60;x<W;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
  for(let y=50;y<H;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
  cells.forEach(c=>hex(c));
  if(hover&&hover!==selected)hex(hover,'#baf2be');
  if(selected){hex(selected,'#fff');ctx.beginPath();ctx.arc(selected.x,selected.y,R+3,0,Math.PI*2);ctx.strokeStyle='#fff';ctx.lineWidth=.8;ctx.stroke()}
 }
 function details(){
  if(!selected)return;
  $('place').textContent='Scenario '+(cells.indexOf(selected)+1).toLocaleString();
  $('coords').textContent=coords(selected);
  $('score').textContent=selected.score===null?'—':selected.score.toFixed(1);
  $('bars').replaceChildren(...selected.vals.map((v,k)=>{
   const row=document.createElement('div');row.className='barrow';
   const name=document.createElement('span');name.textContent=factors[k][0];
   const track=document.createElement('div');track.className='bartrack';
   const fill=document.createElement('div');fill.className='barfill';fill.style.width=v+'%';fill.style.background=color(v);track.append(fill);
   const value=document.createElement('span');value.textContent=Math.round(v);row.append(name,track,value);return row;
  }));
  $('explanation').textContent=describe(selected,weights);
 }
 function refresh(){
  const summary=summarize(cells,weights);best=summary.best;
  if(!selected)selected=best||cells[0];
  $('cells').textContent=cells.length.toLocaleString();
  $('mean').textContent=summary.mean===null?'—':summary.mean.toFixed(1);
  $('high').textContent=summary.high===null?'—':summary.high.toLocaleString();
  $('best').disabled=!best;draw();details();
 }
 function setWeights(arr){arr.forEach((v,k)=>{weights[k]=v;$('weight'+k).value=v;$('value'+k).textContent=v+'%'});refresh()}
 factors.forEach((f,k)=>{
  const el=document.createElement('div');el.className='control';
  const label=document.createElement('label');label.htmlFor='weight'+k;label.append(document.createTextNode(f[0]));
  const out=document.createElement('output');out.id='value'+k;out.htmlFor='weight'+k;out.textContent=weights[k]+'%';label.append(out);
  const input=document.createElement('input');input.id='weight'+k;input.type='range';input.min='0';input.max='100';input.step='5';input.value=weights[k];input.setAttribute('aria-describedby','description'+k);
  const desc=document.createElement('small');desc.id='description'+k;desc.textContent=f[1];
  el.append(label,input,desc);$('controls').append(el);
  input.addEventListener('input',()=>{weights[k]=Number(input.value);out.textContent=weights[k]+'%';$('preset').value='custom';refresh()});
 });
 $('preset').addEventListener('change',()=>{const p=presets[$('preset').value];if(p)setWeights(p)});
 $('reset').addEventListener('click',()=>{$('preset').value='balanced';setWeights(presets.balanced)});
 $('best').addEventListener('click',()=>{if(best){selected=best;draw();details()}});
 function nearest(e){
  const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*W,y=(e.clientY-r.top)/r.height*H;
  let hit=null,d=R*R*1.2;for(const c of cells){const a=(c.x-x)**2+(c.y-y)**2;if(a<d){d=a;hit=c}}return hit;
 }
 canvas.addEventListener('pointermove',e=>{const c=nearest(e);if(c===hover)return;hover=c;$('hover').textContent=c?coords(c)+(c.score===null?'':' · '+c.score.toFixed(1)):'Select a land hexagon';draw()});
 canvas.addEventListener('pointerleave',()=>{hover=null;draw();$('hover').textContent='Select a land hexagon'});
 canvas.addEventListener('click',e=>{const c=nearest(e);if(c){selected=c;draw();details()}});
 canvas.addEventListener('keydown',e=>{
  const dirs={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(!dirs[e.key]||!selected)return;e.preventDefault();const [a,b]=dirs[e.key];let next=null,min=Infinity;
  for(const c of cells){const dx=c.x-selected.x,dy=c.y-selected.y;if(dx*a+dy*b>1){const d=Math.hypot(dx,dy)+Math.abs(dx*b-dy*a)*2;if(d<min){min=d;next=c}}}
  if(next){selected=next;draw();details()}
 });
 refresh();
}
if(typeof document!=='undefined'&&document.getElementById('map'))mount();
