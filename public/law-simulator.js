// Each original law has an explicit model assumption and policy lever.
// Values are dimensionless scenario indices, NOT observed outcomes or forecasts.
import {validateScenario} from './law-scenario-spec.js';
export const families=[
 {name:'Service uptake',explain:'Gradual voluntary uptake with diminishing returns.',curve:(t,lag)=>1-Math.exp(-t/lag)},
 {name:'Build capacity',explain:'Construction/permitting ramps up gradually; benefits arrive after capacity is built.',curve:(t,lag)=>1-Math.exp(-Math.pow(t/lag,1.6))},
 {name:'Access to care',explain:'Access improves with operational capacity and time to reach residents.',curve:(t,lag)=>1-Math.exp(-t/lag)},
 {name:'Learning and skills',explain:'Learning outcomes accumulate with sustained exposure over time.',curve:(t,lag)=>1-Math.exp(-Math.pow(t/lag,1.35))},
 {name:'Workplace adoption',explain:'Employers and workers phase in changes; implementation saturates.',curve:(t,lag)=>1-Math.exp(-t/lag)},
 {name:'Community participation',explain:'Participation grows through repeated opportunities and social adoption.',curve:(t,lag)=>1-Math.exp(-Math.pow(t/lag,1.25))},
 {name:'Institutional access',explain:'Administrative improvements take effect as services and procedures are adopted.',curve:(t,lag)=>1-Math.exp(-t/lag)},
 {name:'Government process',explain:'Process improvements accumulate after institutions adopt the new procedure.',curve:(t,lag)=>1-Math.exp(-Math.pow(t/lag,1.2))},
 {name:'Technology adoption',explain:'Technical uptake follows a staged implementation and saturation curve.',curve:(t,lag)=>1-Math.exp(-Math.pow(t/lag,1.5))},
 {name:'Infrastructure and resilience',explain:'Infrastructure and preventive capacity build over multiple stages.',curve:(t,lag)=>1-Math.exp(-Math.pow(t/lag,1.7))}
];
// [intervention lever, direction of first catalog measure (+1 higher, -1 lower),
// illustrative implementation lag in years]. These are design assumptions,
// not fitted parameters. The user can change every numerical assumption.
const inputs=[
 ['Eligible households reached by enrollment',1,2],
 ['Families reached by child benefits',-1,2],
 ['Eligible low-wage workers reached',1,2],
 ['Tax filings covered by simplification',-1,1],
 ['Households reached by emergency support',1,2],
 ['Borrowers covered by lending protections',-1,2],
 ['Fine cases covered by ability-to-pay review',-1,2],
 ['Patients reached by debt protections',-1,2],
 ['Workers covered by portable benefits',1,3],
 ['Registrations covered by simplified rules',-1,1],
 ['Permitting capacity for additional housing',1,4],
 ['Eligible lots enabled for accessory units',1,3],
 ['Permit reviews covered by streamlined rules',-1,2],
 ['Suitable public land made available',1,5],
 ['Eligible people offered stable housing',-1,3],
 ['Rental listings using all-in price disclosure',1,1],
 ['At-risk tenants reached by prevention',1,2],
 ['Hazardous homes reached by repairs',1,3],
 ['Neighborhoods connected by safe walking routes',1,5],
 ['At-risk homes reached by retrofit programs',1,5],
 ['Patients reached by affordability measures',-1,3],
 ['Communities covered by primary-care expansion',-1,3],
 ['Mental-health claims covered by parity review',-1,2],
 ['Crisis calls covered by alternative response',1,2],
 ['Families reached by perinatal services',-1,3],
 ['People offered accessible recovery treatment',1,3],
 ['Eligible residents reached by prevention',1,3],
 ['Rural communities reached by care expansion',-1,4],
 ['Prescriptions covered by affordability measures',-1,2],
 ['Food-insecure households reached',-1,3],
 ['Families reached by childcare assistance',-1,3],
 ['Eligible workers covered by parental leave',1,2],
 ['Children offered accessible early learning',1,3],
 ['Children reached by developmental screening',-1,2],
 ['Students reached by effective reading instruction',1,4],
 ['Students reached by school meal programs',-1,2],
 ['Schools reached by counselor staffing',-1,3],
 ['Students reached by critical-thinking instruction',1,4],
 ['Eligible learners offered apprenticeships',1,3],
 ['Adult learners reached by training support',1,3],
 ['Workers covered by predictable scheduling',-1,2],
 ['Workers covered by paid sick leave',1,2],
 ['Caregivers covered by leave support',1,2],
 ['Wage claims covered by enforcement capacity',1,2],
 ['Occupations reached by licensing reform',-1,3],
 ['Workers covered by mobility protections',1,2],
 ['Hazard-exposed workers covered by safeguards',-1,2],
 ['Eligible businesses reached by ownership programs',1,4],
 ['Workplaces testing alternative schedules',1,3],
 ['Workers covered by after-hours boundaries',-1,2],
 ['Neighborhoods reached by gathering spaces',1,4],
 ['Libraries supported to extend hours',1,2],
 ['Residents reached by park access improvements',1,4],
 ['Neighborhoods reached by shared meal programs',1,2],
 ['Communities reached by interest-group support',1,2],
 ['Young people matched with trained mentors',1,3],
 ['Residents reached by intergenerational programs',1,3],
 ['Isolated residents reached by referral services',1,2],
 ['Neighborhoods reached by arts access programs',1,3],
 ['Residents reached by volunteer opportunities',1,2],
 ['Eligible cases covered by legal assistance',-1,3],
 ['Eligible people reached by record-sealing help',1,3],
 ['Defense offices reached by staffing investment',-1,3],
 ['Eligible cases offered voluntary restorative options',1,3],
 ['Jury processes reached by hardship review',1,2],
 ['Survivors offered safe housing support',1,3],
 ['Public facilities reached by accessibility upgrades',1,4],
 ['Older residents offered home-care options',-1,3],
 ['Young people in care offered transition support',1,4],
 ['Eligible disputes offered mediation',1,2],
 ['Eligible participants reached by accessible civic processes',1,2],
 ['Eligible petitions covered by hearing procedures',1,2],
 ['Communities offered representative deliberation',1,3],
 ['Public decisions covered by disclosure procedures',1,2],
 ['Laws covered by reviewed plain-language summaries',1,2],
 ['Budgets covered by validated indicators',1,3],
 ['Contracts covered by open procurement records',1,2],
 ['Service requests covered by response standards',-1,2],
 ['Programs covered by outcome evaluation',1,3],
 ['Eligible investments covered by participatory design',1,4],
 ['Services covered by meaningful privacy controls',-1,3],
 ['AI decisions covered by human appeal pathways',-1,2],
 ['High-impact systems covered by independent audit',1,3],
 ['Users offered meaningful feed controls',1,2],
 ['Youth services reached by privacy safeguards',-1,3],
 ['Underserved homes reached by broadband investment',1,4],
 ['Devices covered by repair access measures',-1,3],
 ['Forms covered by secure reusable data',1,2],
 ['Impersonation cases reached by remedy procedures',-1,2],
 ['Major decisions covered by reproducible models',1,3],
 ['Lead service lines reached by replacement work',1,6],
 ['Schools reached by air-quality improvements',1,3],
 ['Heat-exposed neighborhoods reached by cooling measures',-1,4],
 ['High-risk crossings reached by safety improvements',-1,4],
 ['Transit routes reached by reliability investment',-1,4],
 ['Residents reached by emergency-warning upgrades',1,3],
 ['Grid assets reached by reliability investment',1,6],
 ['Priority habitat reached by restoration',1,6],
 ['Food supply chains reached by recovery systems',1,3],
 ['Major investments covered by long-term assessment',1,3]
];
export const MODEL_VERSION='helios-scenario-v1';
export const defaults=Object.freeze({years:10,reach:60,capacity:70,effect:20,baseline:100,lag:null});
const clamp=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):fallback;
export function modelFor(law){
 const index=Number(String(law?.id).match(/^HGA-(\d{3})$/)?.[1])-1;
 if(!Number.isInteger(index)||index<0||index>=inputs.length){
   if(law?.scenario){const s=validateScenario(law.scenario);return {id:law.id,metric:s.metric,lever:s.lever,direction:s.direction,lag:s.lag,family:families[s.family],version:MODEL_VERSION,custom:s}}
   return {id:law?.id,metric:law?.suggestedMeasures?.[0]||'Illustrative outcome',lever:'Eligible people reached',direction:1,lag:3,family:families[0],version:MODEL_VERSION,generic:true};
 }
 const [lever,direction,lag]=inputs[index],family=families[Math.floor(index/10)];
 return {id:law.id,metric:law.suggestedMeasures?.[0]||'Selected outcome',lever,direction,lag,family,version:MODEL_VERSION};
}
export function scenarioDefaults(law){const spec=modelFor(law),s=spec.custom;return s?{...defaults,years:s.years,reach:s.reach,capacity:s.capacity,effect:s.effect,lag:s.lag}:{...defaults,lag:spec.lag}}
export function simulate(law,assumptions={}){
 const spec=modelFor(law),a={...scenarioDefaults(law),...assumptions};
 const years=Math.round(clamp(a.years,1,30,10)),reach=clamp(a.reach,0,100,60)/100,capacity=clamp(a.capacity,0,100,70)/100;
 const effect=clamp(a.effect,-50,50,20)/100,baseline=clamp(a.baseline,1,200,100),lag=a.lag==null?spec.lag:clamp(a.lag,.5,15,spec.lag);
 const points=Array.from({length:years+1},(_,year)=>{
   const adoption=reach*capacity*spec.family.curve(year,lag),change=spec.direction*effect*adoption;
   const center=baseline*(1+change),lo=baseline*(1+spec.direction*(effect-.10)*adoption),hi=baseline*(1+spec.direction*(effect+.10)*adoption);
   return {year,baseline,scenario:center,low:Math.min(lo,hi),high:Math.max(lo,hi),adoption:adoption*100};
 });
 return {spec,assumptions:{years,reach:reach*100,capacity:capacity*100,effect:effect*100,baseline,lag},points,final:points.at(-1)};
}
