import {test,expect} from 'bun:test';
import {categories,TOTAL,baseline,total,valid,available,transfer,equivalent} from '../public/budget-model.js';

test('fictional municipal budget remains exactly balanced and respects category floors',()=>{
 const original=baseline();
 expect(categories).toHaveLength(7);expect(TOTAL).toBe(100);expect(total(original)).toBe(TOTAL);expect(valid(original)).toBe(true);
 expect(available(original,'admin','transport')).toBe(2);
 const draft=transfer(original,'admin','transport',2);
 expect(draft.admin).toBe(3);expect(draft.transport).toBe(24);
 expect(total(draft)).toBe(TOTAL);expect(original.admin).toBe(5);expect(available(draft,'admin','transport')).toBe(0);
 for(const donor of categories)for(const receiver of categories){
   const max=available(original,donor.id,receiver.id);
   if(donor.id===receiver.id){expect(max).toBe(0);continue}
   for(let n=1;n<=max;n++){
     const result=transfer(original,donor.id,receiver.id,n);
     expect(valid(result)).toBe(true);expect(total(result)).toBe(100);
     expect(result[donor.id]).toBe(original[donor.id]-n);
     expect(result[receiver.id]).toBe(original[receiver.id]+n);
   }
 }
 expect(()=>transfer(original,'admin','transport',3)).toThrow();
 expect(()=>transfer(original,'admin','admin',1)).toThrow();
 expect(()=>transfer(original,'missing','transport',1)).toThrow();
 expect(()=>transfer(original,'admin','transport',-1)).toThrow();
 expect(()=>transfer(original,'admin','transport',1.5)).toThrow();
 expect(()=>transfer({...original,admin:6},'admin','transport',1)).toThrow();
});
test('resource equivalents show explicit hypothetical unit-cost sensitivity',()=>{
 expect(equivalent(2,50000)).toEqual({central:40,low:32,high:53});
 expect(equivalent(2,100000)).toEqual({central:20,low:16,high:26});
 expect(equivalent(0,50000)).toEqual({central:0,low:0,high:0});
 expect(()=>equivalent(1,0)).toThrow();
});
