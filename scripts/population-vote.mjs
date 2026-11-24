// Run a disjoint shard locally; emit a JSON receipt for later reduction.
import {readFile} from 'node:fs/promises';
import {exactRange,combineRanges,POPULATION} from '../public/population-model.js';
const [command,...args]=process.argv.slice(2);
if(command==='reduce'){
 if(!args.length)throw new Error('Pass one or more range receipt JSON files');
 const result=combineRanges(await Promise.all(args.map(async path=>JSON.parse(await readFile(path,'utf8')))));
 console.log(JSON.stringify({...result,fullPopulation:result.start===0&&result.end===POPULATION},null,2));
}else if(command==='run'){
 if(args.length<2)throw new Error('run START END [PROPOSAL COST RELIABILITY SEED]');
 const [start,end,proposal=0,cost=.65,reliability=.72,seed=2036]=args.map(Number);
 console.log(JSON.stringify(exactRange(start,end,{proposal,cost,reliability,seed}),null,2));
}else {console.error('Usage: node scripts/population-vote.mjs run START END [PROPOSAL COST RELIABILITY SEED] | reduce FILES...');process.exitCode=1}
