// Shareable public record identifiers only; never serialize journals, comments, or drafts.
export const validClause=id=>typeof id==='string'&&/^(?:S-(?:00[1-9]|01[0-2])|C-[a-f0-9]{64})$/.test(id);
export const validLaw=id=>typeof id==='string'&&/^(?:HGA-(?:00[1-9]|0[1-9]\d|100)|HGP-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.test(id);
const anchors=new Set(['review-title','constitution-title','linked-laws','ll-detail','law-title','laws-workbench']);
export function readCivicRoute(href=location.href){
 const u=new URL(href),clause=u.searchParams.get('clause'),law=u.searchParams.get('law'),anchor=u.hash.slice(1);
 return {clause:validClause(clause)?clause:null,law:validLaw(law)?law:null,practice:u.searchParams.get('review')==='practice',anchor:anchors.has(anchor)?anchor:null};
}
export function civicUrl(href,patch={}){
 const u=new URL(href);
 for(const [key,validate] of [['clause',validClause],['law',validLaw]])if(Object.hasOwn(patch,key)){
  if(validate(patch[key]))u.searchParams.set(key,patch[key]);else u.searchParams.delete(key);
 }
 if(Object.hasOwn(patch,'practice')){if(patch.practice)u.searchParams.set('review','practice');else u.searchParams.delete('review')}
 if(Object.hasOwn(patch,'anchor'))u.hash=anchors.has(patch.anchor)?patch.anchor:'';
 return u;
}
export function updateCivicRoute(patch,{replace=false}={}){
 const u=civicUrl(location.href,patch);if(u.href!==location.href)history[replace?'replaceState':'pushState'](history.state,'',u);
 return readCivicRoute(u.href);
}
export function scrollToCivicRoute(...allowed){
 const anchor=readCivicRoute().anchor;if(!anchor||!allowed.includes(anchor))return;
 requestAnimationFrame(()=>{const target=document.getElementById(anchor);if(target&&!target.closest('[hidden]'))target.scrollIntoView({block:'start',behavior:'instant'})});
}
