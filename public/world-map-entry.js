const disclosure=document.getElementById('world-map-disclosure');
const slot=document.getElementById('world-map-slot');
const status=document.getElementById('world-map-load-status');
const fullLink=document.getElementById('world-map-full-link');
let frame;

function mountMap(){
  if(!disclosure?.open||frame)return;
  frame=document.createElement('iframe');
  frame.id='world-map-frame';
  frame.title='World map with preference sliders and suitability explanation';
  frame.referrerPolicy='no-referrer';
  const url=new URL(fullLink.href,document.baseURI);
  url.searchParams.set('embed','1');
  frame.src=url.href;
  status.textContent='Loading the interactive world map…';
  frame.addEventListener('load',()=>{status.hidden=true;},{once:true});
  slot.append(frame);
}

disclosure?.addEventListener('toggle',mountMap);
window.addEventListener('message',event=>{
  if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin)return;
  if(event.data?.type!=='helios:world-map:size')return;
  const height=event.data.height;
  if(typeof height!=='number'||!Number.isFinite(height))return;
  frame.style.height=Math.max(400,Math.min(4000,Math.ceil(height)))+'px';
});
function openFromHash(){
  if(location.hash==='#world-map-feature'&&disclosure){disclosure.open=true;mountMap();}
}
window.addEventListener('hashchange',openFromHash);
openFromHash();
