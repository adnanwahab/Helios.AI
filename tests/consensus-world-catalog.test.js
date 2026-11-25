import {test,expect} from 'bun:test';
import seed from '../data/catalog.json';
import {canonicalCatalog,sharedCatalog,featuredDraft,formatBill,originFor,validOrigin,sameLaw,matchesLaw} from '../public/consensus-world-catalog.js';
const originals=canonicalCatalog(seed.goals);
test('all 100 original Helios IDs and draft fields load',()=>{
 expect(originals).toHaveLength(100);
 expect(new Set(originals.map(l=>l.id)).size).toBe(100);
 for(const [i,law] of originals.entries()){
  const source=seed.goals.find(g=>g.id===law.id),text=formatBill(law);
  expect(text).toContain(source.sharedGoal);expect(text).toContain(source.illustrativeLocalOption);expect(text).toContain(source.risksAndSafeguards);
  expect(validOrigin(originFor(law))).toBe(true);
 }
 expect(matchesLaw(originals[30],'HGA-031')).toBe(true);
 expect(featuredDraft().id).toBe('DRAFT-CANNABIS');
});
test('shared revisions preserve IDs, versions and text without importing actual votes',()=>{
 const remote=sharedCatalog({storage:'supabase-postgres',records:seed.goals.map(law=>({law:{...law,version:2,versionId:'rev-'+law.id,sharedGoal:'Updated: '+law.sharedGoal},votes:{support:123456},myVote:'support'}))});
 expect(remote[0].versionId).toBe('rev-HGA-001');expect(remote[0].source).toBe('shared');
 expect(formatBill(remote[0])).toContain('Updated: '+seed.goals[0].sharedGoal);
 expect(JSON.stringify(remote)).not.toContain('123456');
 expect(sameLaw(originFor(originals[0]),originFor(remote[0]))).toBe(true);
 expect(sameLaw(originFor(originals[0]),originFor(remote[1]))).toBe(false);
 expect(sameLaw(null,originFor(remote[0]))).toBe(false);
});
test('reject incomplete shared catalog, duplicate IDs, missing version ID and non-shared database',()=>{
 expect(()=>canonicalCatalog(seed.goals.slice(1))).toThrow();
 expect(()=>canonicalCatalog([seed.goals[0],...seed.goals.slice(0,99)])).toThrow();
 expect(()=>sharedCatalog({storage:'supabase-postgres',records:seed.goals.map(law=>({law}))})).toThrow();
 expect(()=>sharedCatalog({storage:'pglite',records:[]})).toThrow();
});
