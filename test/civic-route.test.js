import {test,expect} from 'bun:test';
import {civicUrl,readCivicRoute,validClause,validLaw} from '../public/civic-route.js';
test('public clause and law URL preserves selected IDs and unrelated navigation state',()=>{
 const base='https://helios-ai-laws.fly.dev/?source=home&review=practice#linked-laws';
 const url=civicUrl(base,{clause:'S-002',law:'HGA-011',anchor:'ll-detail',practice:false});
 expect(url.href).toBe('https://helios-ai-laws.fly.dev/?source=home&clause=S-002&law=HGA-011#ll-detail');
 expect(readCivicRoute(url.href)).toEqual({clause:'S-002',law:'HGA-011',practice:false,anchor:'ll-detail'});
 const community='C-'+'a'.repeat(64),proposal='HGP-12345678-1234-1234-1234-123456789abc';
 expect(validClause(community)).toBe(true);expect(validLaw(proposal)).toBe(true);
 expect(readCivicRoute(civicUrl(base,{clause:community,law:proposal}).href).law).toBe(proposal);
 expect(validLaw('HGA-000')).toBe(false);expect(validLaw('HGA-101')).toBe(false);expect(validClause('S-013')).toBe(false);
 const invalid=civicUrl(url.href,{clause:'PRIVATE JOURNAL',law:'P-LOCAL',anchor:'<script>'});
 expect(invalid.href).toBe('https://helios-ai-laws.fly.dev/?source=home');
 expect(readCivicRoute('https://example.com/?clause=PRIVATE&law=INVALID#bad')).toEqual({clause:null,law:null,practice:false,anchor:null});
});
