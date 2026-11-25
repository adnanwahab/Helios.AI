import {test,expect} from 'bun:test';
import {cannabisBudget,cannabisDraft} from '../public/cannabis-budget.js';
test('cannabis scenario is an unpublished draft with reproducible direct and overhead costs',()=>{
 expect(cannabisDraft.legalStatus).toBe('editorial_draft_not_law');
 const m=cannabisBudget();expect(m.participants).toBe(25000);expect(m.directCost).toBe(3000000);expect(m.administrationCost).toBe(300000);expect(m.totalCost).toBe(3300000);
});
test('budget bounds and zero cases',()=>{
 for(const key of ['adults','participation','annualBudgetPerParticipant'])expect(cannabisBudget({[key]:0}).totalCost).toBe(0);
 expect(cannabisBudget({administration:0}).totalCost).toBe(3000000);
 expect(cannabisBudget({adults:-1,participation:500,annualBudgetPerParticipant:Infinity,administration:999}).assumptions).toEqual({adults:0,participation:100,annualBudgetPerParticipant:120,administration:50});
});
