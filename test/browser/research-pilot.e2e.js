import { test, expect } from '@playwright/test';

test('operator pilot loads exact revision, requires consent and displays stored review', async ({page})=>{
 const fakeToken='mock-pilot-token-not-real-1234567890';
 const proposal={id:'HGA-051',version:3,versionId:'revision-test-3',title:'Community spaces',goal:'Accessible gathering places',implementation:'Example plan',safeguards:'Example safeguards'};
 let queued=null,posts=0,requests=0;
 await page.route('https://pilot-test.fly.dev/pilot',async route=>{
  const req=route.request(),headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'authorization, content-type'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  requests++;expect(req.headers().authorization).toBe('Bearer '+fakeToken);
  if(req.method()==='POST'){
   posts++;expect(req.postDataJSON()).toMatchObject({versionId:proposal.versionId,consent:true});
   queued={id:'pilot-hga-051',state:'queued',attempt:0,mission:{law:proposal,question:req.postDataJSON().question}};
   return route.fulfill({status:202,headers,json:{job:queued}});
  }
  return route.fulfill({headers,json:{proposal,job:queued?{...queued,state:'needs_review',attempt:1,result:{brief:'Example stored review — not a live model response',model:'fixture'}}:null}});
 });
 await page.goto('/?labView=research#communal-science-lab');
 const panel=page.locator('#research-pilot'),button=panel.getByRole('button',{name:'Queue pilot research mission'});
 await expect(panel).toBeVisible();await expect(button).toBeDisabled();expect(requests).toBe(0);
 await panel.getByLabel('Your verified Fly.io application origin').fill('https://pilot-test.fly.dev');
 await panel.getByLabel('Operator token (kept in this page only)').fill(fakeToken);
 await panel.getByRole('button',{name:'Connect / refresh mission'}).click();
 await expect(panel).toContainText('revision-test-3');await expect(button).toBeDisabled();
 await panel.locator('#pilot-consent').check();await expect(button).toBeEnabled();
 await button.click();await expect(panel).toContainText('queued');await expect(button).toBeDisabled();expect(posts).toBe(1);
 await panel.getByRole('button',{name:'Connect / refresh mission'}).click();
 await expect(panel).toContainText('Example stored review');await expect(panel).toContainText('External sources verified: no');expect(posts).toBe(1);
 expect(await page.evaluate(t=>JSON.stringify({local:{...localStorage},session:{...sessionStorage},url:location.href}).includes(t),fakeToken)).toBe(false);
 await panel.locator('#pilot-token').fill('');await expect(button).toBeDisabled();
 await panel.screenshot({path:test.info().outputPath('research-pilot-desktop.png')});
 await page.setViewportSize({width:390,height:844});await panel.screenshot({path:test.info().outputPath('research-pilot-mobile.png')});
});
