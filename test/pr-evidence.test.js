import {test,expect} from 'bun:test';
import {verifyPREvidence} from '../scripts/verify-launch-pr.mjs';

const sha='a'.repeat(40),repo='adnanwahab/HeliosHTML';
function fixture(){return {
 pr:{number:75,head:{sha},body:`## Deploy links\n\nhttps://deploy-preview-75--heliosailol.netlify.app/launch\nhttps://deploy-preview-75--heliosailol.netlify.app/\n\n## Screenshots / visual review\nhttps://github.com/${repo}/actions/runs/2\n\n## Verification\nBackend and browser tests passed.`},
 changedFiles:['launch-dashboard.html'],status:{sha,statuses:[{context:'netlify/heliosailol/deploy-preview',state:'success'}]},
 runs:[{id:1,path:'.github/workflows/backend.yml',head_sha:sha,event:'pull_request',status:'completed',conclusion:'success',created_at:'2026-11-25T20:00:00Z'},{id:2,path:'.github/workflows/pr-visual-capture.yml',head_sha:sha,event:'pull_request',status:'completed',conclusion:'success',created_at:'2026-11-25T20:00:00Z',html_url:`https://github.com/${repo}/actions/runs/2`}],
};}

test('UI evidence accepts successful current-head preview, verification, and visual capture',()=>{
 expect(verifyPREvidence(fixture())).toEqual({ui:true,errors:[],pending:[],passed:true});
});
test('stale success and pending checks cannot pass the delivery gate',()=>{
 const input=fixture();input.status.sha='b'.repeat(40);input.runs=input.runs.map(run=>({...run,head_sha:'b'.repeat(40)}));
 const result=verifyPREvidence(input);expect(result.passed).toBe(false);expect(result.pending).toHaveLength(3);
});
test('workflow reruns use the latest result instead of an earlier success',()=>{
 const input=fixture();input.runs.push({...input.runs[0],id:3,created_at:'2026-11-25T20:05:00Z',conclusion:'failure'});
 expect(verifyPREvidence(input).errors).toContain('Backend and browser tests did not pass for this PR head (failure).');
});
test('unrelated preview URLs, missing visual evidence, and comment-only template text are rejected',()=>{
 const input=fixture();input.pr.body='<!-- ## Deploy links https://deploy-preview-75--heliosailol.netlify.app/launch -->\nhttps://deploy-preview-74--heliosailol.netlify.app/\n## Verification\nTests passed.';
 const result=verifyPREvidence(input);expect(result.passed).toBe(false);expect(result.errors).toHaveLength(4);
});
test('documentation-only changes need verification but no UI deployment or screenshot',()=>{
 const input=fixture();input.changedFiles=['CONTRIBUTING.md'];input.pr.body='## Deploy links\nNo UI changes.\n\n## Verification\nDocumentation links reviewed.';input.runs=input.runs.slice(0,1);input.status={sha,statuses:[]};
 expect(verifyPREvidence(input).passed).toBe(true);
});
test('renaming a UI file is still evaluated as user-facing work',()=>{
 const input=fixture();input.changedFiles=['archive/home.txt','index.html'];expect(verifyPREvidence(input).ui).toBe(true);
});
test('an unrelated image cannot stand in for current-head visual evidence',()=>{
 const input=fixture();input.pr.body=input.pr.body.replace(`https://github.com/${repo}/actions/runs/2`,'https://unrelated.example/old-image.png');
 expect(verifyPREvidence(input).passed).toBe(false);
});
test('a homepage-only UI change can use the homepage as its direct feature preview',()=>{
 const input=fixture();input.changedFiles=['index.html','public/home.css'];input.pr.body=input.pr.body.replace('https://deploy-preview-75--heliosailol.netlify.app/launch\n','');
 expect(verifyPREvidence(input).passed).toBe(true);
});
test('a change to another page still needs a direct feature preview',()=>{
 const input=fixture();input.changedFiles=['index.html','launch-dashboard.html'];input.pr.body=input.pr.body.replace('https://deploy-preview-75--heliosailol.netlify.app/launch\n','');
 expect(verifyPREvidence(input).errors).toContain('Include a direct preview link to the changed route, section, or feature.');
});
test('public tutorial video and caption changes still require UI delivery evidence',()=>{
 for(const path of ['public/launch/tutorial.mp4','public/launch/tutorial.webm','public/launch/tutorial.vtt']){
  const input=fixture();input.changedFiles=[path];input.status={sha,statuses:[]};
  const result=verifyPREvidence(input);expect(result.ui).toBe(true);expect(result.passed).toBe(false);
 }
});
