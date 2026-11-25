
import {test,expect} from 'bun:test';
import {childcareBudget,featureFirst} from '../public/childcare-budget.js';
test('default childcare budget reconciles all flows',()=>{
 const m=childcareBudget();
 expect(m.parentPerHour).toBe(5);expect(m.governmentPerHour).toBe(15);expect(m.caregiverPerHour).toBe(20);
 expect(m.savingsPerFamily).toBe(2880);expect(m.annualPublicCost).toBe(288000000);
 expect(m.annualParentCost).toBe(96000000);expect(m.annualCaregiverPayments).toBe(384000000);
});
test('zero/full subsidy, participation, use, hours, invalid inputs and cap',()=>{
 expect(childcareBudget({subsidy:0}).annualPublicCost).toBe(0);
 expect(childcareBudget({subsidy:100}).parentPerHour).toBe(0);
 for(const key of ['families','hours','utilization'])expect(childcareBudget({[key]:0}).annualPublicCost).toBe(0);
 expect(childcareBudget({utilization:50}).annualPublicCost).toBe(144000000);
 const m=childcareBudget({families:-1,hours:999,rate:Infinity,subsidy:999,utilization:''});
 expect(m.assumptions).toEqual({families:0,hours:160,rate:20,subsidy:100,utilization:100});
 expect(m.annualParentCost+m.annualPublicCost).toBeCloseTo(m.annualCaregiverPayments);
});
test('first law presentation does not renumber or mutate existing records',()=>{
 const list=[{law:{id:'HGA-001'}},{law:{id:'HGA-031'}},{law:{id:'HGA-032'}},{law:{id:'DRAFT-CANNABIS'}}];
 expect(featureFirst(list).map(r=>r.law.id)).toEqual(['DRAFT-CANNABIS','HGA-031','HGA-001','HGA-032']);
 expect(list[0].law.id).toBe('HGA-001');
});
