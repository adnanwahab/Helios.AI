// A separate, unpublished policy scenario. No distribution, purchase, or official vote occurs here.
export const cannabisDraft=Object.freeze({"id":"DRAFT-CANNABIS","title":"Free Weed for Everyone","category":"Physical and mental health","sharedGoal":"Explore a publicly funded, voluntary, zero-cost cannabis access policy for eligible adults, subject to legal authority and health safeguards.","illustrativeLocalOption":"Consider a capped public program for adults aged 21 and over, only where authorized by applicable law. Independent review must establish funding, eligibility, public-health safeguards and whether a pilot is appropriate.","risksAndSafeguards":"No access for minors; voluntary participation; regulated quality standards; no impaired driving; independent evaluation of health, equity, unintended effects and fiscal cost. No actual cannabis is provided by this simulator.","suggestedMeasures":["Annual fiscal cost","Public-health outcomes","Equity and unintended effects"],"legalStatus":"editorial_draft_not_law"});
export const cannabisDefaults=Object.freeze({"adults":100000,"participation":25,"annualBudgetPerParticipant":120,"administration":10});
export const cannabisLimits=Object.freeze({"adults":[0,10000000],"participation":[0,100],"annualBudgetPerParticipant":[0,1000],"administration":[0,50]});
export function cannabisBudget(input={}){
 const assumptions={};
 for(const [key,[min,max]] of Object.entries(cannabisLimits)){
  const n=input[key]==null||input[key]===''?NaN:Number(input[key]);
  assumptions[key]=Number.isFinite(n)?Math.min(max,Math.max(min,Math.round(n))):cannabisDefaults[key];
 }
 const a=assumptions,participants=Math.round(a.adults*a.participation/100),directCost=participants*a.annualBudgetPerParticipant,administrationCost=directCost*a.administration/100;
 return {assumptions,participants,directCost,administrationCost,totalCost:directCost+administrationCost};
}
