// Optional 3D and D3 enhancements; the local SVG garden stays playable offline.
// Only static pinned library modules are requested. No story text or user data is sent.
const api=window.rainbowGarden,viewport=document.getElementById('garden-viewport');
const status=document.getElementById('garden-view-status');
const graphStatus=document.getElementById('graph-status');
async function mount3D(){
  const THREE=await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js');
  const scene=new THREE.Scene();scene.background=new THREE.Color('#252746');scene.fog=new THREE.Fog('#252746',55,115);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
  const camera=new THREE.PerspectiveCamera(42,1,.1,180);
  let azimuth=.35,distance=46;
  function view(){camera.position.set(Math.sin(azimuth)*distance,29,Math.cos(azimuth)*distance);camera.lookAt(0,0,0)}
  view();scene.add(new THREE.HemisphereLight('#fff0df','#64897f',2.0));
  const sun=new THREE.DirectionalLight('#fff0d5',2.6);sun.position.set(-12,22,9);scene.add(sun);
  const mat=(color,roughness=.8)=>new THREE.MeshStandardMaterial({color,roughness});
  const white=mat('#f9eadd'),trim=mat('#fff7e5'),roof=mat('#b4bccd'),glass=mat('#617c98'),gold=mat('#f5d598'),green=mat('#538376'),pathMat=mat('#c4c1ac');
  const sph=new THREE.SphereGeometry(1,16,12);
  function shape(parent,geometry,material,x,y,z){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m}
  function box(parent,w,h,d,x,y,z,material){return shape(parent,new THREE.BoxGeometry(w,h,d),material,x,y,z)}
  function ball(parent,x,y,z,sx,sy,sz,material){const m=shape(parent,sph,material,x,y,z);m.scale.set(sx,sy,sz);return m}
  function cylinder(parent,r1,r2,h,x,y,z,material){return shape(parent,new THREE.CylinderGeometry(r1,r2,h,18),material,x,y,z)}
  const ground=box(scene,50,.35,34,0,-.2,0,green);
  box(scene,47,.03,2,0,.01,6,pathMat);box(scene,2,.03,20,-6,.02,2,pathMat);
  box(scene,2,.03,20,12,.02,2,pathMat);
  // Stylized public-facing architectural diorama, not a site or security model.
  const house=new THREE.Group();scene.add(house);house.position.set(-8,0,-12.2);
  box(house,17,4.7,5.2,0,2.35,0,white);box(house,17.5,.35,5.6,0,4.9,0,trim);
  box(house,16.3,.3,4.8,0,5.22,0,roof);
  for(const side of [-1,1]){box(house,5.8,2.5,4.4,side*11.3,1.25,0,white);box(house,6.1,.25,4.7,side*11.3,2.6,0,trim);for(let j=0;j<4;j++)box(house,.55,1.02,.12,side*11.3+(j-1.5)*1.25,1.25,2.24,glass)}
  for(let i=-4;i<=4;i++)for(const y of [1.35,3.5]){box(house,.9,1.4,.16,i*1.75,y,2.63,trim);box(house,.65,1.14,.18,i*1.75,y,2.74,glass);box(house,.06,1.14,.2,i*1.75,y,2.84,white)}
  box(house,8,.3,2.8,0,.18,3.7,trim);for(let j=0;j<3;j++)box(house,8.1,.12,1.1+j*.65,0,.06+j*.12,5-j*.25,white);
  for(let i=0;i<6;i++){const x=(i-2.5)*1.38;cylinder(house,.22,.28,3.9,x,2.28,4.4,trim);box(house,.65,.17,.65,x,.38,4.4,trim);box(house,.65,.2,.65,x,4.29,4.4,trim)}
  box(house,8.4,.25,3.1,0,4.45,3.65,white);
  const ped=new THREE.Shape();ped.moveTo(-4.3,0);ped.lineTo(4.3,0);ped.lineTo(0,1.6);ped.closePath();
  shape(house,new THREE.ExtrudeGeometry(ped,{depth:2.9,bevelEnabled:false}),trim,0,4.57,2.15);
  for(let i=-16;i<=16;i++)box(house,.12,.34,.17,i*.49,5.16,2.55,trim);
  cylinder(house,.035,.035,1.6,0,6.2,0,trim);
  const flag=new THREE.Group();flag.position.set(.65,6.72,0);house.add(flag);
  for(let i=0;i<7;i++)box(flag,1.28,.09,.04,0,i*.09-.27,0,mat(i%2?'#fff0db':'#b95e77'));
  box(flag,.5,.35,.05,-.39,.13,.025,mat('#526d97'));
  const bark=mat('#8c756b'),leaf=mat('#75aa8b'),leaf2=mat('#9cc6a2');
  for(let i=0;i<14;i++){const x=-22+(i%7)*7.3,z=i<7?-14:13.5;cylinder(scene,.16,.24,1.55,x,.8,z,bark);ball(scene,x,2.2,z,.9,1.25,.95,leaf);ball(scene,x-.38,2.8,z,.65,.8,.65,leaf2)}
  const fountain=new THREE.Group();fountain.position.set(0,0,3);scene.add(fountain);
  cylinder(fountain,2.1,2.2,.32,0,.17,0,trim);cylinder(fountain,1.88,1.88,.08,0,.35,0,mat('#83cce5',.25));cylinder(fountain,.3,.65,.8,0,.75,0,white);ball(fountain,0,1.22,0,.45,.35,.45,gold);
  const water=mat('#b6e7f3',.3);for(let i=0;i<12;i++){const a=i*Math.PI/6;ball(fountain,Math.cos(a)*.74,1.1,Math.sin(a)*.74,.09,.19,.09,water)}
  const flowerMats=['#f5a8bd','#f5dc9a','#bcaef3','#a9d7b3'].map(c=>mat(c));
  for(let i=0;i<48;i++){const x=13+(i%8)*.85,z=-4+Math.floor(i/8)*.75;box(scene,.07,.36,.07,x,.18,z,leaf2);ball(scene,x,.44,z,.16,.13,.16,flowerMats[i%4])}
  const lab=new THREE.Group();lab.position.set(7.2,0,6.5);scene.add(lab);
  for(const x of [-2,2])for(const z of [-1.4,1.4])box(lab,.18,2.4,.18,x,1.2,z,trim);
  box(lab,4.7,.25,3.4,0,2.5,0,mat('#e5a7c5'));box(lab,4.4,.2,3.0,0,.1,0,white);box(lab,2.6,.16,1,0,1.1,0,gold);
  box(scene,5,.09,3.6,7.2,.04,6.5,pathMat);
  const futureGarden=new THREE.Group();futureGarden.position.set(14.3,0,-2);scene.add(futureGarden);
  for(let i=0;i<3;i++){box(futureGarden,1.35,.42,2.3,(i-1)*1.65,.25,0,bark);box(futureGarden,1.16,.12,2.1,(i-1)*1.65,.49,0,mat('#645843'));for(let j=0;j<5;j++)ball(futureGarden,(i-1)*1.65,.68,-.82+j*.41,.25,.24,.25,flowerMats[(i+j)%4])}
  const shuttle=new THREE.Group();scene.add(shuttle);
  box(shuttle,2.8,1.25,1.35,0,.94,0,mat('#e9c2ed'));box(shuttle,2.55,.6,1.37,0,1.2,0,glass);box(shuttle,.8,.12,1.38,-.95,1.58,0,trim);
  for(const x of [-.95,.95])for(const z of [-.69,.69]){const wheel=cylinder(shuttle,.28,.28,.17,x,.31,z,facePlaceholder());wheel.rotation.x=Math.PI/2}
  function facePlaceholder(){return mat('#3e3950')}
  const portal=new THREE.Group();portal.position.set(21,0,-3);scene.add(portal);
  const portalRing=shape(portal,new THREE.TorusGeometry(1.4,.16,12,40),new THREE.MeshStandardMaterial({color:'#dfb6ff',emissive:'#ae69ee',emissiveIntensity:.8}),0,1.6,0);
  const brain=new THREE.Group();scene.add(brain);const lobes=new THREE.Group();brain.add(lobes);
  const palette=['#ffa5ca','#ffd0a7','#ffe493','#b5efbd','#a1d5f8','#c6acf8','#eab3ef'];
  palette.forEach((c,i)=>{const a=i*Math.PI*2/7;const material=new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.22,roughness:.6});
    ball(lobes,Math.cos(a)*1.1,Math.sin(a)*.62,Math.sin(a*2)*.4,1.25,.85,1.05,material);
    for(let j=0;j<3;j++){const ring=shape(lobes,new THREE.TorusGeometry(.36+j*.12,.045,6,18),mat('#8a668f'),Math.cos(a)*1.1,Math.sin(a)*.62,.92);ring.rotation.z=a;ring.scale.y=.63}
  });
  const face=mat('#382a47');ball(brain,-.48,.03,1.7,.09,.13,.1,face);ball(brain,.48,.03,1.7,.09,.13,.1,face);
  const smile=shape(brain,new THREE.TorusGeometry(.26,.035,8,22,Math.PI),face,0,-.12,1.73);smile.rotation.z=Math.PI;
  for(let j=0;j<3;j++){const ring=shape(brain,new THREE.TorusGeometry(2.75+j*.18,.026,6,72),new THREE.MeshBasicMaterial({color:palette[j*2],transparent:true,opacity:.75}),0,0,0);ring.rotation.x=Math.PI/2+(j-1)*.45;ring.rotation.y=j*.48}
  const pickables=[],bearModels=[],trailModels=[];
  const initial=api.snapshot();
  initial.bears.forEach(b=>{
    const group=new THREE.Group();scene.add(group);group.userData.bearId=b.id;
    const fur=mat(b.color),muzzle=mat('#f7e8d7');ball(group,0,.59,0,.46,.55,.37,fur);ball(group,0,1.19,0,.53,.48,.44,fur);
    ball(group,-.38,1.53,-.02,.21,.21,.18,fur);ball(group,.38,1.53,-.02,.21,.21,.18,fur);
    ball(group,0,1.07,.35,.27,.19,.15,muzzle);ball(group,-.18,1.25,.37,.055,.065,.055,face);ball(group,.18,1.25,.37,.055,.065,.055,face);ball(group,0,1.1,.49,.083,.055,.052,face);
    const arms=[ball(group,-.48,.66,.03,.16,.34,.18,fur),ball(group,.48,.66,.03,.16,.34,.18,fur)];
    ball(group,-.24,.18,.07,.23,.19,.25,fur);ball(group,.24,.18,.07,.23,.19,.25,fur);
    const ring=shape(group,new THREE.TorusGeometry(.68,.035,6,32),new THREE.MeshBasicMaterial({color:'#ffe3a5'}),0,.055,0);ring.rotation.x=-Math.PI/2;
    const star=shape(group,new THREE.OctahedronGeometry(.19),new THREE.MeshBasicMaterial({color:'#fff0b8'}),0,1.92,0);
    bearModels.push({group,arms,ring,star});group.traverse(o=>{if(o.isMesh&&o!==ring&&o!==star)pickables.push(o)});
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(24*3),3));
    const points=new THREE.Points(geometry,new THREE.PointsMaterial({color:b.color,size:.13,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending}));points.frustumCulled=false;scene.add(points);trailModels.push(points);
  });
  const excerpt=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(24*3),3)),new THREE.PointsMaterial({color:'#f7d4ff',size:.14,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));excerpt.frustumCulled=false;scene.add(excerpt);
  const wx=x=>(x-410)/18,wz=y=>(y-355)/10+2;
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  renderer.domElement.setAttribute('aria-label','3D garden: select a bear or click the lawn to move the rainbow brain');
  renderer.domElement.addEventListener('click',e=>{
    const b=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);ray.setFromCamera(pointer,camera);
    const hit=ray.intersectObjects(pickables,false)[0];if(hit){let p=hit.object;while(p&&p.userData.bearId===undefined)p=p.parent;if(p){api.selectBear(p.userData.bearId);return}}
    const point=ray.intersectObject(ground)[0];if(point)api.moveBrain(point.point.x*18+410,(point.point.z-2)*10+355);
  });
  viewport.append(renderer.domElement);viewport.hidden=false;document.getElementById('garden-map').classList.add('mini');
  const orbit=document.getElementById('garden-orbit'),zoom=document.getElementById('garden-zoom');
  orbit.disabled=zoom.disabled=false;orbit.onclick=()=>{azimuth+=Math.PI/4;view()};zoom.onclick=()=>{distance=distance===46?32:46;view()};
  function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}}
  const observer=new ResizeObserver(resize);observer.observe(viewport);resize();status.textContent='3D garden active · Three.js / WebGL · interactive map below';
  function updateTrail(points,x,y,z,endX,endY,endZ,t,offset){
    const a=points.geometry.attributes.position.array;for(let j=0;j<24;j++){const u=(j/24+t*.28+offset)%1;a[j*3]=x+(endX-x)*u;a[j*3+1]=y+(endY-y)*u+Math.sin(u*Math.PI)*1.25;a[j*3+2]=z+(endZ-z)*u+Math.sin(u*Math.PI*3+offset)*.12}points.geometry.attributes.position.needsUpdate=true
  }
  let frameId=0;
  function frame(){const s=api.snapshot(),t=s.clock;brain.position.set(wx(s.brain.x),6.6+Math.sin(t*1.8)*.18,wz(s.brain.y));brain.rotation.y=.14*Math.sin(t*.7);lobes.scale.setScalar(1+Math.sin(t*1.5)*.025);
    s.bears.forEach((b,i)=>{const m=bearModels[i],phase=t*5+i,active=b.behavior!=='wandering';let hop=0;
      if(b.behavior==='dancing')hop=Math.abs(Math.sin(phase*1.7))*.42;
      else if(b.behavior==='exploring'||b.behavior==='costume')hop=Math.abs(Math.sin(phase))*.21;
      m.group.position.set(wx(b.x),hop,wz(b.y));m.group.rotation.y=b.behavior==='dancing'?t*2+i:Math.sin(t*.6+i)*.5;
      m.group.scale.set(1,b.behavior==='resting'?.65:1,1);m.arms.forEach((arm,j)=>{arm.rotation.z=(j?1:-1)*(b.behavior==='dancing'?.75+Math.sin(phase)*.48:b.behavior==='building'?.45+Math.sin(phase)*.25:.18*Math.sin(phase))});m.ring.visible=i===s.selected;m.star.visible=active;m.star.rotation.y=t*2;m.star.position.y=1.95+Math.sin(phase)*.1;
      const trail=trailModels[i];trail.visible=b.shared;if(b.shared)updateTrail(trail,brain.position.x,brain.position.y-.7,brain.position.z,m.group.position.x,1.62+hop,m.group.position.z,t,i*.11)
    });
    excerpt.visible=s.hasExcerpt;if(s.hasExcerpt)updateTrail(excerpt,brain.position.x,brain.position.y-.7,brain.position.z,-18,1,5,t,.4);
    portalRing.material.emissiveIntensity=s.portal?.08:.8;lab.visible=s.month>0&&s.future==='lab';lab.scale.setScalar(Math.max(.1,s.month/12));
    futureGarden.visible=s.month>0&&s.future==='garden';futureGarden.scale.setScalar(Math.max(.1,s.month/12));
    shuttle.visible=s.month>0&&s.future==='shuttle';shuttle.position.set(Math.sin(t*.45)*7,.01,4.6);shuttle.rotation.y=Math.cos(t*.45)>0?0:Math.PI;shuttle.scale.setScalar(Math.max(.1,s.month/12));
    renderer.render(scene,camera);frameId=requestAnimationFrame(frame)
  }frame();
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frameId);observer.disconnect();viewport.hidden=true;document.getElementById('garden-map').classList.remove('mini');orbit.disabled=zoom.disabled=true;status.textContent='3D context unavailable; the garden map remains fully playable.'},{once:true});
}
async function mountGraph(){
  const d3=await import('https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm');
  const root=d3.select('#garden-graph');
  const centers={lab:60,garden:180,shuttle:300};
  window.rainbowD3=(input,selected)=>{
    const nodes=input.map((n,i)=>({...n,x:centers[n.theme]+Math.cos(i*2.4)*22,y:105+Math.sin(i*2.4)*22}));
    const simulation=d3.forceSimulation(nodes).force('x',d3.forceX(n=>centers[n.theme]).strength(.12)).force('y',d3.forceY(105).strength(.11)).force('charge',d3.forceManyBody().strength(-9)).force('collision',d3.forceCollide(n=>n.active?10:8)).stop();simulation.tick(100);
    nodes.forEach(n=>{n.x=Math.max(12,Math.min(348,n.x));n.y=Math.max(40,Math.min(190,n.y))});
    root.selectAll('*').remove();
    const hubs=[{theme:'lab',label:'Discovery Lab'},{theme:'garden',label:'Garden'},{theme:'shuttle',label:'Shuttle'}];
    root.selectAll('text').data(hubs).join('text').attr('x',d=>centers[d.theme]).attr('y',20).attr('fill','#e8e3f4').attr('text-anchor','middle').attr('font-size',10).text(d=>d.label);
    root.selectAll('line').data(nodes.filter(n=>n.shared)).join('line').attr('x1',n=>centers[n.theme]).attr('y1',105).attr('x2',n=>n.x).attr('y2',n=>n.y).attr('stroke',n=>n.color).attr('stroke-opacity',.6);
    root.selectAll('.hub').data(hubs).join('circle').attr('class','hub').attr('cx',n=>centers[n.theme]).attr('cy',105).attr('r',13).attr('fill','#404966').attr('stroke','#b7cbd1');
    const group=root.selectAll('g.node').data(nodes,n=>n.id).join('g').attr('class','node').attr('transform',n=>'translate('+n.x+','+n.y+')').attr('tabindex',0).attr('role','button').attr('aria-label',n=>'Explore '+n.name).on('click',(_,n)=>api.selectBear(n.id)).on('keydown',(e,n)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();api.selectBear(n.id)}});
    group.append('circle').attr('r',n=>n.active?8:6).attr('fill',n=>n.color).attr('stroke',n=>n.id===selected?'#fff3b6':'#252941').attr('stroke-width',n=>n.id===selected?2.5:1);
    group.append('title').text(n=>n.name+' · '+n.theme+(n.shared?' · shared memory':' · private'));
  };
  api.refreshGraph();graphStatus.textContent='D3 common-ground graph · lines appear only for explicitly shared fictional memories. Select any node.';
}
if(api){mount3D().catch(()=>{status.textContent='Interactive garden map active; 3D library or WebGL unavailable.'});mountGraph().catch(()=>{graphStatus.textContent='Common-ground map active; D3 library unavailable.'})}
