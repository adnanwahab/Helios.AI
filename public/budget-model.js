// Fictional annual municipal operating envelope, in whole millions of dollars.
// Floors and marginal unit costs are assumptions, not legal minimums or price data.
export const categories=Object.freeze([
 {id:'transport',name:'Streets & transit',base:22,floor:12,color:'#8bd2b1',unit:'accessible shaded stop-years',cost:50000,why:'Additional capacity could fund accessible shade, seating and ongoing maintenance.',risk:'Less funding could delay repairs, accessibility upgrades or transit reliability.'},
 {id:'housing',name:'Housing & assistance',base:15,floor:8,color:'#d8c28c',unit:'household support-years',cost:10000,why:'Additional funding could expand targeted housing stability assistance.',risk:'Less funding could leave eligible households without support.'},
 {id:'health',name:'Health & social services',base:18,floor:12,color:'#a2bfe7',unit:'service visit slots',cost:200,why:'Additional capacity could expand access to community health and social services.',risk:'Less funding could reduce service availability or increase waiting times.'},
 {id:'education',name:'Education & libraries',base:14,floor:9,color:'#c6b2ea',unit:'public learning places for a year',cost:2500,why:'Additional funding could support learning programs, library hours or staffing.',risk:'Less funding could reduce access to programs, staff or library hours.'},
 {id:'safety',name:'Public safety & emergency response',base:18,floor:12,color:'#e6a99e',unit:'response team-years',cost:200000,why:'Additional capacity could support trained teams, preparedness or emergency response.',risk:'Less funding could reduce readiness, coverage or response capacity.'},
 {id:'environment',name:'Parks & environment',base:8,floor:4,color:'#9ad18c',unit:'maintained public-space acre-years',cost:20000,why:'Additional capacity could support parks, heat mitigation and environmental maintenance.',risk:'Less funding could delay maintenance, cooling projects or habitat work.'},
 {id:'admin',name:'Administration & oversight',base:5,floor:3,color:'#b4bbc6',unit:'staff-equivalent years',cost:100000,why:'Additional funding could improve service administration, audits and transparent reporting.',risk:'Less funding could weaken procurement, oversight, payroll or other essential administration.'}
]);
const byId=new Map(categories.map(c=>[c.id,c]));
export const TOTAL=100;
export const baseline=()=>Object.fromEntries(categories.map(c=>[c.id,c.base]));
export const total=plan=>categories.reduce((n,c)=>n+plan[c.id],0);
export function valid(plan){return !!plan&&Object.keys(plan).length===categories.length&&categories.every(c=>Number.isInteger(plan[c.id])&&plan[c.id]>=c.floor)&&total(plan)===TOTAL}
export function available(plan,from,to){if(!valid(plan)||from===to||!byId.has(from)||!byId.has(to))return 0;return plan[from]-byId.get(from).floor}
export function transfer(plan,from,to,amount){
 if(!valid(plan)||!Number.isInteger(amount)||amount<1||amount>available(plan,from,to))throw Error('Choose a valid, funded transfer within the illustrative floors.');
 const next={...plan,[from]:plan[from]-amount,[to]:plan[to]+amount};
 if(!valid(next))throw Error('Budget must remain balanced.');return next;
}
export function equivalent(amount,cost){
 if(!Number.isFinite(amount)||!Number.isFinite(cost)||cost<=0)throw Error('Invalid assumption');
 // A resource equivalent at a stated annual marginal unit cost. Round down
 // to whole units; the sensitivity interval uses 75% and 125% of that cost.
 const funds=Math.abs(amount)*1e6;
 return {central:Math.floor(funds/cost),low:Math.floor(funds/(cost*1.25)),high:Math.floor(funds/(cost*.75))};
}
