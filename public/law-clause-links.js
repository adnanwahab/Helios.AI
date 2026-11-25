// Curated related-proposal links, not equivalence or agreement claims.
export const CLAUSE_LAWS=Object.freeze({
 'S-001':['HGA-095','HGA-093','HGA-067'],'S-002':['HGA-011','HGA-012','HGA-019'],
 'S-003':['HGA-051','HGA-052','HGA-053'],'S-004':['HGA-040','HGA-039'],
 'S-005':['HGA-076','HGA-077','HGA-079'],'S-006':['HGA-081','HGA-071'],
 'S-007':['HGA-027','HGA-022'],'S-008':['HGA-039','HGA-051','HGA-087'],
 'S-009':['HGA-020','HGA-096'],'S-010':['HGA-078','HGA-074'],
 'S-011':['HGA-095','HGA-067'],'S-012':['HGA-013','HGA-011']
});
export function linkedLawIds(clause,laws){
 if(!clause)return [];
 const ids=new Set(CLAUSE_LAWS[clause.id]||[]);
 for(const law of laws){
   if(law.relatedClauseId===clause.id)ids.add(law.id);
   if(String(clause.text||'').toUpperCase().includes(law.id.toUpperCase()))ids.add(law.id);
 }
 return [...ids].filter(id=>laws.some(l=>l.id===id));
}
