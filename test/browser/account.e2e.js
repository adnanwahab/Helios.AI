import {readFile} from 'node:fs/promises';
import {test, expect} from '@playwright/test';
import {sampleBoard} from '../../public/constitution-model.js';

const authOrigin = 'https://ssopopwnuqygetznsmtg.supabase.co';
const user = {id:'4e152d2a-7f81-4b5d-92b0-c0c35fd675a0',email:'account-test@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{},is_anonymous:false};
const token = ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',Buffer.from(JSON.stringify({sub:user.id,exp:4102444800,iat:1704067200,iss:authOrigin+'/auth/v1',aud:'authenticated'})).toString('base64url'),'mock-signature'].join('.');
const session = {access_token:token,refresh_token:'mock-refresh-for-intercepted-tests-only',expires_in:3600,expires_at:4102444800,token_type:'bearer',user};
const json = (route, body, status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});

async function mockAccount(page, {invalid=false, accountUser=user, accountToken=token}={}) {
  const seen = {provider:[],writes:[]};
  await page.route(authOrigin+'/auth/v1/**', async route => {
    const request=route.request(),url=new URL(request.url());seen.provider.push(url.pathname);
    if(url.pathname.endsWith('/token'))return json(route,{...session,access_token:accountToken,user:accountUser});
    if(url.pathname.endsWith('/user'))return json(route,invalid?{message:'Invalid token'}:accountUser,invalid?401:200);
    if(url.pathname.endsWith('/logout'))return route.fulfill({status:204});
    throw Error('Unexpected provider route in mocked account test: '+url.pathname);
  });
  await page.route('**/api/account/config', route => json(route,{available:true,loginOptional:true,accountPersistence:{votes:true,research:false},storage:'pglite',emailSignInEnabled:false,passwordSignInEnabled:true}));
  await page.route('**/api/account/me', route => json(route,{signedIn:true,account:{id:accountUser.id,email:accountUser.email},persistence:{votes:true,research:false},storage:'pglite'}));
  await page.route('**/api/session', route => json(route,{csrfToken:'mock-browser-csrf-token'}));
  let vote=null;
  await page.route('**/api/constitution', route => {
    const board=sampleBoard();
    const signed=route.request().headers()['x-helios-access-token']===accountToken;
    board.clauses[0].myVote=signed?vote:null;
    if(vote)board.clauses[0].live[vote]=1;
    return json(route,board);
  });
  await page.route('**/api/constitution/vote', route => {
    seen.writes.push({headers:route.request().headers(),body:route.request().postDataJSON()});
    vote=route.request().postDataJSON().position;
    return json(route,{position:vote},201);
  });
  // This checks browser proof/CSRF wiring only. The separate backend integration
  // suite verifies real session cookies and server-side token validation.
  return seen;
}

async function signIn(page, email=user.email) {
  await page.locator('#account-open').click();
  await expect(page.locator('#helios-account-status')).not.toContainText('Checking');
  await page.locator('#helios-account-email').fill(email);
  await page.locator('#helios-account-password').fill('mock-password-never-sent-to-a-provider');
  await page.locator('#helios-account-submit').click();
  await expect(page.locator('#helios-account-identity')).toContainText(email);
}

test('guests start without auth or session calls and closing login preserves their private draft', async ({page}) => {
  const requests=[];
  page.on('request',request=>{if(request.url().includes('/api/')||request.url().startsWith(authOrigin))requests.push({url:request.url(),method:request.method()});});
  const sessionOrWrite=r=>r.method!=='GET'||/\/api\/(?:research\/)?session\b/.test(r.url);
  await page.goto('/');
  await expect(page.locator('#constitution-list .clause-card').first()).toBeVisible();
  await expect(page.locator('#account-open')).toBeVisible();
  await expect(page.locator('#helios-account-dialog')).not.toBeVisible();
  // The homepage reads the public shared board and law catalog on load (#63).
  expect(requests.filter(r=>r.url.startsWith(authOrigin)||/\/api\/(?:research\/)?account\//.test(r.url)||sessionOrWrite(r))).toEqual([]);
  await page.locator('#journal').fill('Private test draft: shaded stops that welcome every neighbor.');
  await page.locator('#account-open').click();
  await expect(page.locator('#helios-account-dialog')).toBeVisible();
  await expect(page.locator('#helios-account-new-users')).toContainText('not available yet');
  await page.locator('#helios-account-guest').click();
  await expect(page.locator('#helios-account-dialog')).not.toBeVisible();
  await expect(page.locator('#journal')).toHaveValue('Private test draft: shaded stops that welcome every neighbor.');
  await expect(page.locator('#account-open')).toBeFocused();
  expect(requests.filter(r=>r.url.startsWith(authOrigin))).toEqual([]);
  expect(requests.filter(sessionOrWrite)).toEqual([]);
});

test('open_login deep link preserves selected keyframe and mobile guest editing', async ({page},testInfo) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/research?frame=first-pilots&open_login=1#keyframes');
  await expect(page.locator('#helios-account-dialog')).toBeVisible();
  await expect(page).toHaveURL(/research\?frame=first-pilots#keyframes$/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('optional-login-mobile.png'),animations:'disabled'});
  await page.locator('#helios-account-guest').click();
  await page.locator('#frame-summary').fill('A guest can keep designing this future without creating an account.');
  await page.evaluate(()=>window.open_login({returnTo:'https://untrusted.example/'}));
  await expect(page.locator('#helios-account-dialog')).toBeVisible();
  await page.locator('#helios-account-close').press('Escape');
  await expect(page.locator('#helios-account-dialog')).not.toBeVisible();
  await expect(page.locator('#frame-summary')).toHaveValue('A guest can keep designing this future without creating an account.');
  await expect(page).toHaveURL(/research\?frame=first-pilots#keyframes$/);
});

test('mocked verified account adds proof only to connected votes and signout preserves drafts', async ({page}) => {
  const seen=await mockAccount(page);
  await page.goto('/');
  await page.locator('#journal').fill('This private thought must stay in the browser.');
  await page.locator('#clause-comment').fill('Unsent public-comment draft.');
  await page.locator('#account-open').click();
  await page.locator('#helios-account-email').fill(user.email);
  await page.locator('#helios-account-password').fill('mock-password-never-sent-to-a-provider');
  await page.locator('#helios-account-submit').click();
  await expect(page.locator('#helios-account-identity')).toContainText(user.email);
  expect(seen.writes).toEqual([]);
  await page.locator('#helios-account-guest').click();
  await expect(page.locator('#review-mode')).toHaveText('Shared');
  await expect(page.locator('#board-refresh')).toBeEnabled();
  await page.locator('[data-clause-vote="support"]').click();
  await expect.poll(()=>seen.writes.length).toBe(1);
  expect(seen.writes[0].headers['x-helios-access-token']).toBe(token);
  expect(seen.writes[0].headers['x-csrf-token']).toBeTruthy();
  expect(seen.writes[0].body).toEqual({clauseId:'S-001',position:'support'});
  await page.locator('#account-open').click();
  await page.locator('#helios-account-signout').click();
  await expect(page.locator('#helios-account-status')).toContainText('Signed out');
  await page.locator('#helios-account-guest').click();
  await expect(page.locator('#journal')).toHaveValue('This private thought must stay in the browser.');
  await expect(page.locator('#clause-comment')).toHaveValue('Unsent public-comment draft.');
  expect(await page.evaluate(async()=>window.HeliosAccount.fetchHeaders('votes'))).toEqual({});
});

test('rejected stored session can explicitly return to guest mode', async ({page}) => {
  await mockAccount(page,{invalid:true});
  await page.addInitScript(value=>{
    localStorage.setItem('helios-account-session-v1',JSON.stringify(value));
    localStorage.setItem('helios-account-present-v1','1');
  },session);
  await page.goto('/');
  await page.locator('#account-open').click();
  await expect(page.locator('#helios-account-status')).toContainText(/verified|Sign in again/i);
  await page.locator('#helios-account-guest').click();
  expect(await page.evaluate(async()=>window.HeliosAccount.fetchHeaders('votes'))).toEqual({});
  expect(await page.evaluate(()=>window.HeliosAccount.getState().authenticated)).toBe(false);
});

test('a returning signed-in visitor joins shared review once the account is verified', async ({page}) => {
  // The board connects on page load (#63) while a stored account may still be verifying.
  const seen=await mockAccount(page);
  const boardTokens=[];
  page.on('request',request=>{if(new URL(request.url()).pathname==='/api/constitution')boardTokens.push(request.headers()['x-helios-access-token']||null);});
  await page.addInitScript(value=>{
    localStorage.setItem('helios-account-session-v1',JSON.stringify(value));
    localStorage.setItem('helios-account-present-v1','1');
  },session);
  await page.goto('/');
  await expect(page.locator('#review-mode')).toHaveText('Shared');
  await expect.poll(()=>boardTokens.includes(token)).toBe(true);
  expect(seen.writes).toEqual([]);
});

test('static preview never connects the account SDK even with a stored hint', async ({page}) => {
  const calls=[];
  page.on('request',request=>{if(request.url().startsWith(authOrigin)||/\/api\/(?:research\/)?account\//.test(request.url()))calls.push(request.url());});
  const html=(await readFile(new URL('../../index.html',import.meta.url),'utf8')).replace('name="helios-mode" content="live"','name="helios-mode" content="static"');
  await page.route('**/static-account-test',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.addInitScript(()=>localStorage.setItem('helios-account-present-v1','1'));
  await page.goto('/static-account-test');
  await page.locator('#account-open').click();
  await expect(page.locator('#helios-account-status')).toContainText('static preview');
  await expect(page.locator('#helios-account-submit')).toBeDisabled();
  expect(calls).toEqual([]);
});

test('a response body completed after signout cannot restore the previous account vote', async ({page}) => {
  await mockAccount(page);
  await page.goto('/');
  await signIn(page);
  await page.locator('#helios-account-guest').click();
  await expect(page.locator('#review-mode')).toHaveText('Shared');
  await expect(page.locator('#board-refresh')).toBeEnabled();
  await page.locator('[data-clause-vote="support"]').click();
  await expect(page.locator('[data-clause-vote="support"]')).toHaveAttribute('aria-pressed','true');
  // Hold parsed response bodies while allowing headers through, reproducing a
  // slow body arriving after the identity that requested it has signed out.
  await page.evaluate(()=>{
    const original=window.fetch;
    window.heldAccountBodies=[];
    window.fetch=async(...args)=>{
      const response=await original(...args);
      if(new URL(String(args[0]),location.origin).pathname==='/api/constitution'){
        const parse=response.json.bind(response);
        response.json=async()=>{const body=await parse();await new Promise(resolve=>window.heldAccountBodies.push(resolve));return body;};
      }
      return response;
    };
  });
  await page.locator('#board-refresh').click();
  await expect.poll(()=>page.evaluate(()=>window.heldAccountBodies.length)).toBe(1);
  await page.locator('#account-open').click();
  await page.locator('#helios-account-signout').click();
  await expect(page.locator('#helios-account-status')).toContainText('Signed out');
  await page.evaluate(()=>window.heldAccountBodies[0]());
  await expect.poll(()=>page.evaluate(()=>window.heldAccountBodies.length)).toBe(2);
  await expect(page.locator('[data-clause-vote="support"]')).toHaveAttribute('aria-pressed','false');
  await page.evaluate(()=>window.heldAccountBodies[1]());
});

test('cross-tab account changes fence votes until the new identity has been verified', async ({page,context}) => {
  await mockAccount(page);
  await page.goto('/');
  await signIn(page);
  await page.locator('#helios-account-guest').click();
  await expect(page.locator('#review-mode')).toHaveText('Shared');
  await expect(page.locator('#board-refresh')).toBeEnabled();
  await page.locator('[data-clause-vote="support"]').click();
  await expect(page.locator('[data-clause-vote="support"]')).toHaveAttribute('aria-pressed','true');
  const otherUser={...user,id:'81c23237-81fa-4532-a44d-0336eff712cd',email:'second-account@example.invalid'};
  const otherToken=token.split('.')[0]+'.'+Buffer.from(JSON.stringify({sub:otherUser.id,exp:4102444800,iat:1704067200,iss:authOrigin+'/auth/v1',aud:'authenticated'})).toString('base64url')+'.other-mock-signature';
  let held=false,release;
  const gate=new Promise(resolve=>{release=resolve;});
  await page.route(authOrigin+'/auth/v1/user',async route=>{
    if(route.request().headers().authorization==='Bearer '+otherToken){held=true;await gate;return json(route,otherUser);}
    return json(route,user);
  });
  await page.route('**/api/account/me',route=>json(route,{signedIn:true,account:route.request().headers()['x-helios-access-token']===otherToken?otherUser:user,persistence:{votes:true,research:false}}));
  const other=await context.newPage();
  try{
    await mockAccount(other,{accountUser:otherUser,accountToken:otherToken});
    // Start this tab as an explicit guest so it can enter a different account.
    await other.addInitScript(()=>localStorage.setItem('helios-account-guest-v1','1'));
    await other.goto('/');
    await signIn(other,otherUser.email);
    await expect.poll(()=>held).toBe(true);
    const attempt=await page.evaluate(async()=>{try{return {headers:await window.HeliosAccount.fetchHeaders('votes')};}catch(error){return {error:error.message};}});
    expect(attempt.headers).toBeUndefined();
    expect(attempt.error).toBeTruthy();
    await expect(page.locator('[data-clause-vote="support"]')).toHaveAttribute('aria-pressed','false');
  }finally{release();await other.close();}
});
