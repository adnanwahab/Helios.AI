import {readFile} from 'node:fs/promises';
import {test, expect} from '@playwright/test';
import {sampleBoard} from '../../public/constitution-model.js';

const authOrigin = 'https://ssopopwnuqygetznsmtg.supabase.co';
const user = {id:'4e152d2a-7f81-4b5d-92b0-c0c35fd675a0',email:'account-test@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{},is_anonymous:false};
const token = ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',Buffer.from(JSON.stringify({sub:user.id,exp:4102444800,iat:1704067200,iss:authOrigin+'/auth/v1',aud:'authenticated'})).toString('base64url'),'mock-signature'].join('.');
const session = {access_token:token,refresh_token:'mock-refresh-for-intercepted-tests-only',expires_in:3600,expires_at:4102444800,token_type:'bearer',user};
const json = (route, body, status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});

async function mockAccount(page, {invalid=false}={}) {
  const seen = {provider:[],writes:[]};
  await page.route(authOrigin+'/auth/v1/**', async route => {
    const request=route.request(),url=new URL(request.url());seen.provider.push(url.pathname);
    if(url.pathname.endsWith('/token'))return json(route,session);
    if(url.pathname.endsWith('/user'))return json(route,invalid?{message:'Invalid token'}:user,invalid?401:200);
    if(url.pathname.endsWith('/logout'))return route.fulfill({status:204});
    throw Error('Unexpected provider route in mocked account test: '+url.pathname);
  });
  await page.route('**/api/account/config', route => json(route,{available:true,loginOptional:true,accountPersistence:{votes:true,research:false},storage:'pglite',emailSignInEnabled:false,passwordSignInEnabled:true}));
  await page.route('**/api/account/me', route => json(route,{signedIn:true,account:{id:user.id,email:user.email},persistence:{votes:true,research:false},storage:'pglite'}));
  await page.route('**/api/session', route => json(route,{csrfToken:'mock-browser-csrf-token'}));
  let vote=null;
  await page.route('**/api/constitution', route => {
    const board=sampleBoard();
    const signed=route.request().headers()['x-helios-access-token']===token;
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

test('guests start without auth or API calls and closing login preserves their private draft', async ({page}) => {
  const requests=[];
  page.on('request',request=>{if(request.url().includes('/api/')||request.url().startsWith(authOrigin))requests.push(request.url());});
  await page.goto('/');
  await expect(page.locator('#constitution-list .clause-card').first()).toBeVisible();
  await expect(page.locator('#account-open')).toBeVisible();
  await expect(page.locator('#helios-account-dialog')).not.toBeVisible();
  expect(requests).toEqual([]);
  await page.locator('#journal').fill('Private test draft: shaded stops that welcome every neighbor.');
  await page.locator('#account-open').click();
  await expect(page.locator('#helios-account-dialog')).toBeVisible();
  await expect(page.locator('#helios-account-new-users')).toContainText('not available yet');
  await page.locator('#helios-account-guest').click();
  await expect(page.locator('#helios-account-dialog')).not.toBeVisible();
  await expect(page.locator('#journal')).toHaveValue('Private test draft: shaded stops that welcome every neighbor.');
  await expect(page.locator('#account-open')).toBeFocused();
  expect(requests.filter(url=>url.startsWith(authOrigin))).toEqual([]);
  expect(requests.filter(url=>url.includes('/api/constitution')||url.includes('/api/session'))).toEqual([]);
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
  await page.locator('#board-connect').click();
  await expect(page.locator('#board-status')).toContainText('Connected');
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
