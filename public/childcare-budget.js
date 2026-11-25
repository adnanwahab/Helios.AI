// Illustrative arithmetic for HGA-031, not a forecast or adopted benefit.
export const childcareDefaults=Object.freeze({"families":100000,"hours":16,"rate":20,"subsidy":75,"utilization":100});
export const childcareLimits=Object.freeze({"families":[0,10000000],"hours":[0,160],"rate":[10,100],"subsidy":[0,100],"utilization":[0,100]});
export function childcareBudget(input={}){
 const assumptions={};
 for(const [key,[min,max]] of Object.entries(childcareLimits)){
  const n=input[key]==null||input[key]===''?NaN:Number(input[key]);
  assumptions[key]=Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):childcareDefaults[key];
 }
 const {families,hours,rate,subsidy,utilization}=assumptions;
 const coveredHoursPerFamily=hours*utilization/100;
 const governmentPerHour=rate*subsidy/100,parentPerHour=rate-governmentPerHour;
 const savingsPerFamily=12*coveredHoursPerFamily*governmentPerHour;
 const annualPublicCost=families*savingsPerFamily;
 const annualCaregiverPayments=families*12*coveredHoursPerFamily*rate;
 const annualParentCost=annualCaregiverPayments-annualPublicCost;
 return {assumptions,coveredHoursPerFamily,parentPerHour,governmentPerHour,caregiverPerHour:rate,savingsPerFamily,annualPublicCost,annualParentCost,annualCaregiverPayments};
}
export function featureFirst(records){return [...records].sort((a,b)=>Number(b.law.id==='HGA-031')-Number(a.law.id==='HGA-031'))}
