// Read-only PR delivery check. Never merges, approves, dispatches code, or changes settings.
import {appendFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const isUIFile=path=>/\.html$/.test(path)||/^(?:public|frontend|app)\/.*\.(?:[cm]?[jt]sx?|css|json|svg|png|jpe?g|webp)$/.test(path);
const urls=body=>[...body.matchAll(/https:\/\/[^\s<>"\)]+/g)].map(match=>{
 try{return new URL(match[0]);}catch{return null;}
}).filter(Boolean);
const latestRun=(runs,path)=>runs.filter(run=>run.path===path).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];

export function verifyPREvidence({pr,changedFiles,status,runs}){
 const errors=[],pending=[];
 const body=String(pr.body||'').replace(/<!--[\s\S]*?-->/g,'');
 const links=urls(body);
 const ui=changedFiles.some(isUIFile);
 if(!/^\s*## Deploy links\b/i.test(body))errors.push('Put the Deploy links section at the top of the PR description.');
 if(!/^## Verification\s*\n(?=\s*\S)/im.test(body))errors.push('Describe the tests and their results in a Verification section.');
 const headRuns=runs.filter(run=>run.head_sha===pr.head.sha&&run.event==='pull_request');
 const checkRun=(path,label)=>{
  const run=latestRun(headRuns,path);
  if(!run||run.status!=='completed')pending.push(`${label} is still pending for this PR head.`);
  else if(run.conclusion!=='success')errors.push(`${label} did not pass for this PR head (${run.conclusion||'unknown'}).`);
  return run;
 };
 checkRun('.github/workflows/backend.yml','Backend and browser tests');
 if(ui){
  const hostname=`deploy-preview-${pr.number}--heliosailol.netlify.app`;
  const previews=links.filter(url=>url.hostname===hostname&&url.protocol==='https:');
  if(!previews.some(url=>url.pathname!=='/'||url.search||url.hash))errors.push('Include a direct preview link to the changed route, section, or feature.');
  if(!previews.some(url=>url.pathname==='/'&&!url.search&&!url.hash))errors.push('Include the preview homepage as well as the feature link.');
  const deploy=status.sha===pr.head.sha?status.statuses?.find(item=>item.context==='netlify/heliosailol/deploy-preview'):null;
  if(!deploy||deploy.state==='pending')pending.push('Netlify deployment is still pending for this PR head.');
  else if(deploy.state!=='success')errors.push(`Netlify deployment did not pass for this PR head (${deploy.state}).`);
  const capture=checkRun('.github/workflows/pr-visual-capture.yml','Desktop/mobile visual capture');
  const hasImage=links.some(url=>/\.(png|jpe?g|webp)(?:$|[?#])/i.test(url.href));
  const hasRun=capture&&links.some(url=>url.href===capture.html_url);
  if(!hasImage&&!hasRun)errors.push('Link desktop/mobile screenshots or the current visual-capture run in the PR description.');
 }
 return {ui,errors,pending,passed:errors.length===0&&pending.length===0};
}

async function main(){
 const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
 const repo=process.env.GITHUB_REPOSITORY;
 const number=event.pull_request?.number;
 const token=process.env.GITHUB_TOKEN;
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo||'')||!Number.isSafeInteger(number)||!token)throw Error('Missing read-only pull-request workflow context.');
 async function get(path){
  const response=await fetch(`https://api.github.com/repos/${repo}/${path}`,{headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`GitHub evidence lookup failed (HTTP ${response.status}).`);
  return response.json();
 }
 const changedFiles=[];
 for(let page=1;page<=30;page++){
  const files=await get(`pulls/${number}/files?per_page=100&page=${page}`);
  changedFiles.push(...files.flatMap(file=>[file.filename,...(file.previous_filename?[file.previous_filename]:[])]));
  if(files.length<100)break;
  if(page===30)throw Error('PR is too large for the bounded evidence check. Split it into reviewable changes.');
 }
 const deadline=Date.now()+12*60*1000;
 let result,pr;
 do{
  pr=await get(`pulls/${number}`);
  if(pr.head.sha!==event.pull_request.head.sha){console.log('A newer PR head superseded this evidence check.');return;}
  const [status,runResult]=await Promise.all([
   get(`commits/${pr.head.sha}/status`),
   get(`actions/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`),
  ]);
  result=verifyPREvidence({pr,changedFiles,status,runs:runResult.workflow_runs||[]});
  if(!result.pending.length||Date.now()>=deadline)break;
  console.log('Waiting for this head’s deployment and verification workflows; no approval or merge is performed.');
  await new Promise(resolve=>setTimeout(resolve,30000));
 }while(Date.now()<deadline);
 const lines=['## PR delivery evidence',`Head: \`${pr.head.sha}\``,...result.errors.map(error=>`- ${error}`),...result.pending.map(item=>`- ${item}`)];
 if(result.passed)lines.push('- Preview, verification, and applicable visual evidence are present for this head.','- A separate human approval is still required by the repository review policy.');
 else lines.push('Update the PR description after verification finishes; editing the description reruns this check.');
 const summary=lines.join('\n')+'\n';console.log(summary);
 if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
 if(!result.passed)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
