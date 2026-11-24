// Fictional synthetic agents only. No actual personal data, electorate inference or voting endpoints.
export const POPULATION=8000000000;
export const NEEDS=["Housing","Food","Health","Safety","Financial security","Belonging","Freedom","Purpose"];
export const PROPOSALS=[
  {
    "name": "Accessible station footbridge",
    "benefit": [
      0.15,
      0,
      0.25,
      0.55,
      0.35,
      0.5,
      0.45,
      0.15
    ],
    "burden": [
      0.1,
      0,
      0,
      0.03,
      0.8,
      0,
      0.08,
      0
    ],
    "memory": 3
  },
  {
    "name": "Neighborhood flood defenses",
    "benefit": [
      0.8,
      0.3,
      0.35,
      0.85,
      0.4,
      0.1,
      0.1,
      0.05
    ],
    "burden": [
      0.1,
      0,
      0,
      0.05,
      0.85,
      0,
      0.15,
      0
    ],
    "memory": 0
  },
  {
    "name": "Free community learning spaces",
    "benefit": [
      0.05,
      0.05,
      0.2,
      0.1,
      0.3,
      0.8,
      0.35,
      0.9
    ],
    "burden": [
      0.05,
      0,
      0,
      0,
      0.7,
      0.05,
      0.05,
      0
    ],
    "memory": 7
  }
];
const EVENTS=[
  [
    "Lost a home during a flood",
    "Received help rebuilding a home"
  ],
  [
    "Experienced a period of food insecurity",
    "Found a reliable community food program"
  ],
  [
    "Could not get timely medical care",
    "Received timely care when it mattered"
  ],
  [
    "Was stranded by inaccessible infrastructure",
    "A safe public connection restored independence"
  ],
  [
    "Lost income during a public project",
    "Found stable work through a public project"
  ],
  [
    "Felt isolated after moving",
    "Found friends in a neighborhood gathering space"
  ],
  [
    "A rule removed an important choice",
    "An accessible service expanded personal choice"
  ],
  [
    "Could not afford a training course",
    "A community learning space opened new opportunities"
  ]
];
function hash32(n){n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);return (n^(n>>>16))>>>0}

function unit(id,seed,slot){const lo=id>>>0,hi=Math.floor(id/4294967296);return hash32(hash32(lo^Math.imul(slot+1,0x9e3779b1))^hash32(hi^seed^Math.imul(slot+3,0x85ebca6b)))/4294967296}

function validateId(id){if(!Number.isSafeInteger(id)||id<0||id>=POPULATION)throw new RangeError("Citizen ID must be an integer in [0, 8000000000)");}

function settings(options={}){const {seed=2036,proposal=0,cost=.65,reliability=.72}=options;if(!Number.isInteger(seed)||seed<0||seed>4294967295||!Number.isInteger(proposal)||!PROPOSALS[proposal]||!Number.isFinite(cost)||cost<0||cost>1||!Number.isFinite(reliability)||reliability<0||reliability>1)throw new RangeError("Invalid model settings");return {seed,proposal,cost,reliability}}

export function citizen(id,seed=2036){validateId(id);if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw new RangeError("Invalid seed");const needs=NEEDS.map((_,i)=>unit(id,seed,i)),values=NEEDS.map((_,i)=>.2+.8*unit(id,seed,8+i));const memories=Array.from({length:3},(_,i)=>{const kind=Math.floor(unit(id,seed,16+i*3)*NEEDS.length),positive=unit(id,seed,17+i*3)>=.5,strength=.25+.75*unit(id,seed,18+i*3);return {kind,positive,strength,text:EVENTS[kind][positive?1:0]}});return {id,needs,values,memories,trust:unit(id,seed,25),uncertainty:unit(id,seed,26)}}

function evaluate(id,opts){const p=PROPOSALS[opts.proposal],seed=opts.seed;let benefit=0,burden=0,weight=0,experience=0;for(let i=0;i<NEEDS.length;i++){const w=(.2+.8*unit(id,seed,8+i))*(.2+.8*unit(id,seed,i));weight+=w;benefit+=w*p.benefit[i];burden+=w*p.burden[i]}for(let i=0;i<3;i++){const kind=Math.floor(unit(id,seed,16+i*3)*NEEDS.length),positive=unit(id,seed,17+i*3)>=.5,strength=.25+.75*unit(id,seed,18+i*3);if(kind===p.memory)experience+=(positive?1:-1)*strength*.20}const trust=unit(id,seed,25), uncertainty=unit(id,seed,26);const expectedBenefit=benefit/weight*opts.reliability*(.4+.6*trust),expectedBurden=burden/weight*opts.cost,score=expectedBenefit-expectedBurden+experience+(.5-uncertainty)*.26-.04,threshold=.035+(1-opts.reliability)*.10+uncertainty*.045;return {vote:score>threshold?"yes":score< -threshold?"no":"unsure",score,threshold,expectedBenefit,expectedBurden,experience}}

export function inspectCitizen(id,options={}){const opts=settings(options);return {...citizen(id,opts.seed),...evaluate(id,opts)}}

export function samplePopulation(options={},count=16384){const opts=settings(options);if(!Number.isInteger(count)||count<1||count>1000000)throw new RangeError("Sample size must be 1..1000000");const tallies={yes:0,no:0,unsure:0};for(let i=0;i<count;i++){const start=Math.floor(i*POPULATION/count),end=Math.floor((i+1)*POPULATION/count),w=end-start,id=start+Math.floor(unit(i,opts.seed,99)*w);tallies[evaluate(id,opts).vote]+=w}return {mode:"weighted-sample",evaluated:count,population:POPULATION,tallies,settings:opts}}

export function exactRange(start,end,options={}){const opts=settings(options);if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>POPULATION)throw new RangeError("Invalid half-open population range");const tallies={yes:0,no:0,unsure:0};for(let id=start;id<end;id++)tallies[evaluate(id,opts).vote]++;return {mode:"exact-range",start,end,evaluated:end-start,population:POPULATION,tallies,settings:opts}}

export function combineRanges(parts){if(!Array.isArray(parts)||parts.length===0)throw new Error("No ranges");const sorted=[...parts].sort((a,b)=>a.start-b.start);const opts=settings(sorted[0].settings),tallies={yes:0,no:0,unsure:0};let cursor=sorted[0].start;for(const p of sorted){if(p.mode!=="exact-range"||p.start!==cursor||!Number.isSafeInteger(p.start)||!Number.isSafeInteger(p.end)||p.start<0||p.end>POPULATION||p.end<=p.start||p.population!==POPULATION||p.evaluated!==p.end-p.start||JSON.stringify(settings(p.settings))!==JSON.stringify(opts))throw new Error("Ranges must be contiguous with identical settings");for(const k of Object.keys(tallies)){if(!Number.isSafeInteger(p.tallies[k])||p.tallies[k]<0)throw new Error("Invalid tally");tallies[k]+=p.tallies[k]}if(Object.values(p.tallies).reduce((a,b)=>a+b,0)!==p.evaluated)throw new Error("Invalid tally total");cursor=p.end}return {mode:"exact-range",start:sorted[0].start,end:cursor,evaluated:cursor-sorted[0].start,population:POPULATION,tallies,settings:opts}}
