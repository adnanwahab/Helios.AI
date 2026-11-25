// A deliberately finite simulator language. No generated HTML, JS, URLs or formulas.
export const SCENARIO_FAMILIES=10;
export function validateScenario(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('A scenario specification is required.');
  const keys=['metric','lever','family','direction','lag','effect','reach','capacity','years','assumptions'];
  if(Object.keys(value).length!==keys.length||keys.some(k=>!(k in value)))throw Error('Unknown or missing scenario field.');
  const str=(k,max)=>{const v=value[k];if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Invalid scenario '+k);return v.trim()};
  const number=(k,min,max,integer=false)=>{const v=value[k];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isInteger(v)))throw Error('Invalid scenario '+k);return v};
  const direction=number('direction',-1,1,true);if(![-1,1].includes(direction))throw Error('Invalid scenario direction');
  return {metric:str('metric',240),lever:str('lever',180),family:number('family',0,SCENARIO_FAMILIES-1,true),direction,lag:number('lag',.5,15),effect:number('effect',-50,50),reach:number('reach',0,100),capacity:number('capacity',0,100),years:number('years',1,30,true),assumptions:str('assumptions',800)};
}
