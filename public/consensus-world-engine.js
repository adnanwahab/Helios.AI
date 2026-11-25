// Consensus World: integer arithmetic shared by CPU and WGSL.
export const AXES = ['Funding / cost','Access / equity','Freedom of choice','Privacy','Safety','Environment','Livelihoods','Implementation'];
export const MAX_POPULATION = 8_000_000_000;
export const GPU_BATCH = 262144;
export const CPU_BATCH = 16384;
export const BINS = 20; // yes/unsure/no, 9 old→new transitions, 8 objection dimensions
export const VERSION = 'consensus-world-v1';
export function hash(x) {
  x >>>= 0; x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}
export function identity(id, seed) {
  const lo=id>>>0, hi=Math.floor(id/4294967296)>>>0;
  return hash(lo ^ hash((hi ^ seed)>>>0));
}
export function evaluate(id, effects, seed=20261125, day=0) {
  const key=identity(id,seed), weights=[];
  let score=(hash(key ^ 0xb5297a4d)%121)-60;
  score+=(hash(key ^ hash(day>>>0))%13)-6;
  let worst=2147483647, objection=0;
  for(let i=0;i<8;i++){
    const weight=1+hash(key ^ Math.imul(i+1,0x9e3779b9))%8;
    weights.push(weight);
    const contribution=weight*effects[i]*3;
    score+=contribution;
    // Lowest contribution; weight breaks ties, then stable axis order.
    const rank=contribution*16-weight;
    if(rank<worst){worst=rank;objection=i;}
  }
  return {vote:score>=12?0:score<=-12?2:1,objection,score,weights};
}
export function validEffects(e){return Array.isArray(e)&&e.length===8&&e.every(x=>Number.isInteger(x)&&x>=-2&&x<=2)}
export function validateRequest(r){
  if(!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.count)||r.start<0||r.count<1||r.start+r.count>MAX_POPULATION||r.count>GPU_BATCH||!validEffects(r.effects)||!validEffects(r.prior)||!Number.isInteger(r.seed)||r.seed<0||r.seed>0xffffffff||!Number.isInteger(r.day)||r.day<0||r.day>0xffffffff||typeof r.compare!=='boolean')throw new Error('Invalid batch');
}
export function cpuBatch(r){
  validateRequest(r);const bins=new Uint32Array(BINS);
  for(let id=r.start;id<r.start+r.count;id++){
    const now=evaluate(id,r.effects,r.seed,r.day); bins[now.vote]++;
    if(now.vote!==0)bins[12+now.objection]++;
    if(r.compare){const old=evaluate(id,r.prior,r.seed,r.day);bins[3+old.vote*3+now.vote]++;}
  }return bins;
}
export function assertBatch(bins,count,compare){
  if(bins.length!==BINS||!Array.from(bins).every(x=>Number.isSafeInteger(x)&&x>=0)||
      bins[0]+bins[1]+bins[2]!==count||
      bins.slice(12).reduce((a,b)=>a+b,0)!==bins[1]+bins[2]||
      bins.slice(3,12).reduce((a,b)=>a+b,0)!==(compare?count:0))throw new Error('Batch totals do not reconcile');
}
export const shader = `
struct Params { lo:u32, hi:u32, count:u32, seed:u32, day:u32, compare:u32, effects:array<i32,8>, prior:array<i32,8> };
@group(0) @binding(0) var<storage,read> p:Params;
@group(0) @binding(1) var<storage,read_write> results:array<u32>;
var<workgroup> bins:array<atomic<u32>,20>;
fn hash(v:u32)->u32 {
 var x=v; x=(x^(x>>16u))*0x7feb352du; x=(x^(x>>15u))*0x846ca68bu;return x^(x>>16u);
}
fn assess(key:u32, old:bool)->vec2<u32>{
 var score=i32(hash(key^0xb5297a4du)%121u)-60;
 score+=i32(hash(key^hash(p.day))%13u)-6;
 var objection=0u; var worst=2147483647;
 for(var i=0u;i<8u;i++){
   let w=i32(1u+hash(key^((i+1u)*0x9e3779b9u))%8u);
   let effect=select(p.effects[i],p.prior[i],old);
   let c=w*effect*3; score+=c;let rank=c*16-w;
   if(rank<worst){worst=rank;objection=i;}
 }
 var vote=1u; if(score>=12){vote=0u;}else if(score<=-12){vote=2u;}
 return vec2<u32>(vote,objection);
}
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid:vec3<u32>,@builtin(local_invocation_index) local:u32,@builtin(workgroup_id) group:vec3<u32>){
 if(local<20u){atomicStore(&bins[local],0u);}workgroupBarrier();
 if(gid.x<p.count){
  let lo=p.lo+gid.x;let hi=p.hi+select(0u,1u,lo<p.lo);let key=hash(lo^hash(hi^p.seed));
  let v=assess(key,false);atomicAdd(&bins[v.x],1u);
  if(v.x!=0u){atomicAdd(&bins[12u+v.y],1u);}
  if(p.compare!=0u){let old=assess(key,true);atomicAdd(&bins[3u+old.x*3u+v.x],1u);}
 }
 workgroupBarrier();if(local<20u){results[group.x*20u+local]=atomicLoad(&bins[local]);}
}`;
export async function createGPU(){
  if(!globalThis.navigator?.gpu)throw new Error('WebGPU unavailable');
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw new Error('No WebGPU adapter');
  const device=await adapter.requestDevice();
  let params,output,readback;
  try {
    const module=device.createShaderModule({code:shader});
    const info=await module.getCompilationInfo();
    if(info.messages.some(m=>m.type==='error'))throw new Error(info.messages.map(m=>m.message).join('; '));
    const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});
    const bytes=Math.ceil(GPU_BATCH/128)*BINS*4;
    params=device.createBuffer({size:88,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    output=device.createBuffer({size:bytes,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
    readback=device.createBuffer({size:bytes,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:params}},{binding:1,resource:{buffer:output}}]});
    return {
      async batch(r){
        validateRequest(r);
        const words=new Uint32Array(22);words.set([r.start>>>0,Math.floor(r.start/4294967296),r.count,r.seed,r.day,Number(r.compare)]);
        words.set(r.effects,6);words.set(r.prior,14);
        device.queue.writeBuffer(params,0,words);
        const groups=Math.ceil(r.count/128),size=groups*BINS*4,encoder=device.createCommandEncoder();
        const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(groups);pass.end();
        encoder.copyBufferToBuffer(output,0,readback,0,size);device.queue.submit([encoder.finish()]);
        await readback.mapAsync(GPUMapMode.READ,0,size);
        try {
          const data=new Uint32Array(readback.getMappedRange(0,size)),bins=new Uint32Array(BINS);
          for(let i=0;i<data.length;i++)bins[i%BINS]+=data[i];assertBatch(bins,r.count,r.compare);return bins;
        } finally {readback.unmap();}
      },
      close(){params.destroy();output.destroy();readback.destroy();device.destroy();}
    };
  } catch(e){params?.destroy();output?.destroy();readback?.destroy();device.destroy();throw e;}
}
// Deliberately narrow, editable hypotheses, not an LLM or semantic classifier.
// Negated/conditional sentences are left unknown; duplicate clauses never stack.
export function suggestEffects(text){
  const effects=Array(8).fill(0), reasons=Array(8).fill('Unknown / not assessed');
  const rules=[
    [/\b(?:new tax|raise taxes|higher fees|increase fees)\b/i,-1,/\b(?:existing budget|independent cost estimate|capped spending|funding source)\b/i],
    [/\b(?:exclude|excludes|restricted access)\b/i,-1,/\b(?:accessible|affordable|equal access|income-based subsidy)\b/i],
    [/\b(?:mandatory|compulsory|must participate)\b/i,-1,/\b(?:voluntary|opt-in|opt out|right to decline)\b/i],
    [/\b(?:mandatory tracking|public personal data)\b/i,-1,/\b(?:data minimization|anonymous|privacy audit|no personal data)\b/i],
    [/\b(?:remove safety checks|remove inspections)\b/i,-1,/\b(?:safety audit|independent safety review|safety standards)\b/i],
    [/\b(?:increase emissions|remove environmental review)\b/i,-1,/\b(?:environmental review|emissions reduction|habitat protection)\b/i],
    [/\b(?:unpaid work|reduce wages)\b/i,-1,/\b(?:fair wages|worker protections|paid training)\b/i],
    [/\b(?:immediate nationwide rollout)\b/i,-1,/\b(?:pilot program|sunset clause|independent evaluation|phased rollout)\b/i]
  ];
  const clauses=text.split(/[.!?;\n]+/).filter(c=>!(/\b(?:not|never|without|if|unless|might|could|prohibit|prohibits)\b/i.test(c)));
  rules.forEach(([negative,impact,positive],i)=>{
    const n=clauses.find(c=>negative.test(c)),p=clauses.find(c=>positive.test(c));
    if(n&&p){reasons[i]='Conflicting signals — assess manually';return;}
    if(n||p){effects[i]=n?impact:1;reasons[i]=(n||p).trim().slice(0,160);}
  });
  return {effects,reasons};
}
