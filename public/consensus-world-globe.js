// Presentation only. The 1,280 identities do not contribute additional votes.
export const SAMPLE_COUNT=1280;
const TAU=Math.PI*2, GOLDEN=Math.PI*(3-Math.sqrt(5));
export function sampleIds(population,count=SAMPLE_COUNT){
 if(!Number.isSafeInteger(population)||population<1||!Number.isSafeInteger(count)||count<1)throw Error('Invalid sample');
 const n=Math.min(population,count);
 return Array.from({length:n},(_,i)=>Math.floor((i+.5)*population/n));
}
export function voteLabel(n,total,places=2){
 if(!Number.isFinite(n)||!Number.isFinite(total)||total<=0||n<0||n>total)return '—';
 if(n===0)return '0%';if(n===total)return '100%';
 const v=(100*n/total).toFixed(places);
 if(Number(v)===100)return '<100%';
 if(Number(v)===0)return '<'+(10**-places).toFixed(places)+'%';
 return v+'%';
}
export function initGlobe({canvas,motion,onPick,assess}){
 const ctx=canvas.getContext('2d'), media=matchMedia('(prefers-reduced-motion: reduce)');
 let paused=media.matches,visible=true,frame=0,last=0,angle=0.25,points=[],projected=[],selected=null;
 const colors=['#b5edc3','#e8bd76','#c9a6eb','#698578'];
 const geometry=Array.from({length:SAMPLE_COUNT},(_,i)=>{
   const y=1-2*(i+.5)/SAMPLE_COUNT,r=Math.sqrt(Math.max(0,1-y*y)),theta=i*GOLDEN;
   return {x:r*Math.cos(theta),y,z:r*Math.sin(theta)};
 });
 function motionUI(){motion.textContent=paused?'▶':'Ⅱ';motion.setAttribute('aria-pressed',String(paused));motion.setAttribute('aria-label',paused?'Resume globe rotation':'Pause globe rotation');}
 function draw(){
   if(!ctx)return;
   const w=canvas.width,h=canvas.height,cx=w/2,cy=h/2,r=Math.min(w,h)*.425;
   ctx.clearRect(0,0,w,h);
   const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,r*1.3);glow.addColorStop(0,'#29493640');glow.addColorStop(.76,'#213c2c28');glow.addColorStop(1,'#14201900');
   ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
   ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.strokeStyle='#9aceab20';ctx.lineWidth=1;ctx.stroke();
   const c=Math.cos(angle),s=Math.sin(angle),ct=Math.cos(.18),st=Math.sin(.18);
   projected=points.map((p,i)=>{
     const g=geometry[i],x=g.x*c+g.z*s,z0=-g.x*s+g.z*c,y=g.y*ct-z0*st,z=g.y*st+z0*ct;
     return {id:p.id,vote:p.vote,x:cx+r*x,y:cy+r*y,z};
   }).sort((a,b)=>a.z-b.z);
   for(const p of projected){
     const depth=(p.z+1)/2, size=1.05+depth*1.65;
     ctx.globalAlpha=.18+depth*.76;ctx.fillStyle=colors[p.vote]||colors[3];ctx.beginPath();ctx.arc(p.x,p.y,size,0,TAU);ctx.fill();
     if(p.id===selected){ctx.globalAlpha=1;ctx.strokeStyle='#e6ffed';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(p.x,p.y,size+5,0,TAU);ctx.stroke();}
   }
   ctx.globalAlpha=1;
 }
 function eligible(){return !paused&&visible&&!document.hidden;}
 function schedule(){if(!frame&&eligible())frame=requestAnimationFrame(tick);}
 function tick(now){frame=0;if(!eligible())return;if(!last||now-last>=32){angle=(angle+(last?Math.min(now-last,100)*.00022:0))%TAU;last=now;draw();}schedule();}
 function sync(){if(!eligible()&&frame){cancelAnimationFrame(frame);frame=0;}last=0;motionUI();draw();schedule();}
 function select(id){selected=id;draw();onPick(id);}
 motion.addEventListener('click',()=>{paused=!paused;sync();});
 media.addEventListener?.('change',e=>{paused=e.matches;sync();});
 document.addEventListener('visibilitychange',sync);
 if('IntersectionObserver' in globalThis){const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;sync();});observer.observe(canvas);}
 canvas.addEventListener('click',e=>{
   const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)*canvas.width/rect.width,y=(e.clientY-rect.top)*canvas.height/rect.height;
   let hit=null,distance=13**2;
   for(const p of projected){const d=(p.x-x)**2+(p.y-y)**2;if(d<distance){distance=d;hit=p;}}
   if(hit)select(hit.id);
 });
 motionUI();
 return {update(round,population){
   const ids=sampleIds(round?.population||population||100000);
   points=ids.map(id=>({id,vote:round&&id<round.done?assess(id,round):3}));
   if(!points.some(p=>p.id===selected))selected=null;draw();schedule();
 },meet(){
   const pick=points.find(p=>p.vote===2)||points.find(p=>p.vote===1)||points.find(p=>p.vote!==3)||points[0];if(pick)select(pick.id);
 }};
}
