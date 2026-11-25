// Safety screening is not a verdict on political merits, truth or spam.
export const DEFAULT_MODERATION_MODEL='omni-moderation-2024-09-26';
const allowedModels=new Set([DEFAULT_MODERATION_MODEL,'omni-moderation-latest']);
const hold=reason=>({decision:'hold',reason});
export function createContentModerator({env=process.env,fetchImpl=fetch}={}){
 const apiKey=(env.OPENAI_API_KEY||'').trim();
 const model=(env.HELIOS_MODERATION_MODEL||DEFAULT_MODERATION_MODEL).trim();
 const enabled=env.HELIOS_AUTO_MODERATION==='1'&&!!apiKey&&allowedModels.has(model)&&env.CONTEXT!=='deploy-preview';
 let active=0;
 async function classify(text){
  if(!enabled)return hold('disabled');
  if(typeof text!=='string'||!text.trim()||text.length>500)return hold('invalid-input');
  // Common contact/credential patterns only; not a comprehensive privacy detector.
  if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\d{3}[- .]\d{2}[- .]\d{4}\b|\b(?:\+?1[- .]?)?\(?\d{3}\)?[- .]\d{3}[- .]\d{4}\b|\b(?:sk-|ghp_|AKIA)[A-Za-z0-9_-]{12,}/i.test(text))return hold('possible-private-information');
  if(active>=4)return hold('busy');
  active++;
  try{
   const response=await fetchImpl('https://api.openai.com/v1/moderations',{method:'POST',redirect:'error',headers:{authorization:'Bearer '+apiKey,'content-type':'application/json'},body:JSON.stringify({model,input:text}),signal:AbortSignal.timeout(5000)});
   if(!response.ok)return hold('provider-unavailable');
   const payload=await response.json(),result=payload?.results?.[0];
   if(typeof payload?.id!=='string'||typeof payload?.model!=='string'||!allowedModels.has(payload.model)||!Array.isArray(payload.results)||payload.results.length!==1||typeof result?.flagged!=='boolean'||!result.categories||typeof result.categories!=='object'||Array.isArray(result.categories)||!Object.keys(result.categories).length||Object.values(result.categories).some(x=>typeof x!=='boolean'))return hold('invalid-provider-response');
   const flagged=Object.keys(result.categories).filter(k=>result.categories[k]);
   return {decision:result.flagged||flagged.length?'hold':'approve',reason:result.flagged||flagged.length?'safety-flag':'unflagged',model:payload.model,requestId:payload.id};
  }catch{return hold('provider-unavailable')}
  finally{active--}
 }
 return Object.freeze({enabled,model,classify});
}
