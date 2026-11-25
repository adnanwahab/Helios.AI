import {test,expect} from 'bun:test';
import {createMessagePRHandler,validateProposal} from '../src/message-pr.js';
const origin='https://helios.test',key='x'.repeat(40),env={HELIOS_PR_ENABLED:'1',HELIOS_PR_ACCESS_KEY:key,HELIOS_PR_GITHUB_TOKEN:'server-only'};
const proposal={id:'a'.repeat(32),kind:'feature',title:'Improve UI',message:'Show clearer labels.'};
const request=(body={proposal,consent:true},token=key,source=origin)=>new Request(origin+'/api/message-pr',{method:'POST',headers:{Origin:source,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('direct writes are opt-in, authenticated, same-origin and consented',async()=>{
 const noCall=()=>{throw Error('Unexpected GitHub request')};
 const disabled=createMessagePRHandler({env:{},fetchImpl:noCall});
 expect((await (await disabled(new Request(origin+'/api/message-pr'))).json()).enabled).toBe(false);
 expect((await disabled(request())).status).toBe(503);
 const handler=createMessagePRHandler({env,fetchImpl:noCall});
 expect((await handler(request(undefined,'bad'))).status).toBe(403);
 expect((await handler(request(undefined,key,'https://other.test'))).status).toBe(403);
 expect((await handler(request({proposal,consent:false}))).status).toBe(400);
 expect(()=>validateProposal({proposal:{...proposal,id:'../bad'},consent:true})).toThrow();
});
test('writes only the fixed inbox file and creates one draft PR; retry returns existing receipt',async()=>{
 let created=false,branch,content;const calls=[];
 const pr={number:42,html_url:'https://github.com/adnanwahab/HeliosHTML/pull/42',draft:true,state:'open'};
 const handler=createMessagePRHandler({env,fetchImpl:async(url,opts)=>{
  const path=url.replace('https://api.github.com/repos/adnanwahab/HeliosHTML',''),method=opts.method;
  const body=opts.body?JSON.parse(opts.body):null;calls.push({path,method,body});
  expect(opts.headers.Authorization).toBe('Bearer server-only');
  if(path.startsWith('/pulls?'))return Response.json(created?[pr]:[]);
  if(path.startsWith('/git/ref/heads/message-pr/'))return Response.json({}, {status:404});
  if(path==='/git/ref/heads/main')return Response.json({object:{sha:'f'.repeat(40)}});
  if(path==='/git/refs'){branch=body.ref;return Response.json({}, {status:201});}
  if(path.startsWith('/contents/')&&method==='GET')return Response.json({}, {status:404});
  if(path.startsWith('/contents/')&&method==='PUT'){expect(path).toBe('/contents/docs/proposals/inbox/'+proposal.id+'.json');expect('refs/heads/'+body.branch).toBe(branch);content=JSON.parse(Buffer.from(body.content,'base64').toString());return Response.json({}, {status:201});}
  if(path==='/pulls'&&method==='POST'){expect(body.draft).toBe(true);expect(body.base).toBe('main');expect('refs/heads/'+body.head).toBe(branch);created=true;return Response.json(pr,{status:201});}
  throw Error('Unexpected path '+path);
 }});
 const result=await handler(request());expect(result.status).toBe(200);expect((await result.json()).number).toBe(42);expect(content).toEqual(proposal);
 expect((await handler(request())).status).toBe(200);
 expect(calls.filter(x=>x.method==='PUT')).toHaveLength(1);expect(calls.filter(x=>x.path==='/pulls')).toHaveLength(1);
});
