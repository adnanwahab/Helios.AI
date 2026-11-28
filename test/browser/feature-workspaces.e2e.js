import {test,expect} from '@playwright/test';
import {FEATURE_ROUTES} from '../../public/feature-routes.js';

const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
const authOrigin='https://ssopopwnuqygetznsmtg.supabase.co';
const user={id:'4e152d2a-7f81-4b5d-92b0-c0c35fd675a0',email:'workspace@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{},is_anonymous:false};
const token=['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',Buffer.from(JSON.stringify({sub:user.id,exp:4102444800,iat:1704067200,iss:authOrigin+'/auth/v1',aud:'authenticated'})).toString('base64url'),'mock-signature'].join('.');
const session={access_token:token,refresh_token:'mock-refresh-only-for-intercepted-tests',expires_in:3600,expires_at:4102444800,token_type:'bearer',user};
async function mockAccount(page){
  await page.route(authOrigin+'/auth/v1/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/token'))return json(route,session);
    if(path.endsWith('/user'))return json(route,user);
    if(path.endsWith('/logout'))return route.fulfill({status:204});
    throw Error('Unexpected auth operation in isolated UI test: '+path);
  });
  await page.route('**/api/account/config',route=>json(route,{available:true,accountPersistence:{votes:true,research:false,preferences:true},storage:'pglite',emailSignInEnabled:false,passwordSignInEnabled:true}));
  await page.route('**/api/account/me',route=>json(route,{signedIn:true,account:{id:user.id,email:user.email},persistence:{votes:true,research:false,preferences:true},storage:'pglite'}));
  await page.route('**/api/session',route=>json(route,{csrfToken:'test-session-csrf'}));
}
async function signIn(page,trigger){
  await page.locator(trigger).click();
  await page.locator('#helios-account-email').fill(user.email);
  await page.locator('#helios-account-password').fill('test-password-never-sent-to-a-provider');
  await page.locator('#helios-account-submit').click();
  await expect(page.locator('#helios-account-identity')).toContainText(user.email);
  await page.locator('#helios-account-close').click();
}

test('feature directory lists all routes and reports unavailable connections honestly',async({page},testInfo)=>{
  await page.route('**/api/features',route=>json(route,{mode:'practice',storage:'unconfigured',features:FEATURE_ROUTES.map(feature=>({id:feature.id,available:!feature.backend,state:feature.backend?'unavailable':'local',reason:feature.backend?'This service is not configured for this preview.':null}))}));
  await page.goto('/features');
  await expect(page.locator('.feature-card')).toHaveCount(15);
  await expect(page.locator('#directory-status')).toContainText('0 of 9');
  for(const feature of FEATURE_ROUTES)await expect(page.locator(`[data-feature="${feature.id}"] .card-open`)).toHaveAttribute('href',feature.route);
  await page.locator('[data-filter="server"]').click();await expect(page.locator('.feature-card')).toHaveCount(9);
  await expect(page.locator('.card-status').first()).toHaveText('Setup needed');
  await page.locator('[data-filter="all"]').click();await page.locator('#feature-search').fill('private journal');await expect(page.locator('.feature-card')).toHaveCount(1);
  await page.locator('#feature-search').fill('');
  await page.screenshot({path:testInfo.outputPath('features-desktop.png'),fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('features-mobile.png'),fullPage:true,animations:'disabled'});
});

test('private journal saves, reloads and deletes without any API or auth request',async({page},testInfo)=>{
  const sent=[];page.on('request',request=>{if(request.url().includes('/api/')||request.url().startsWith(authOrigin)||request.url().endsWith('/public/account.js'))sent.push(request.url());});
  await page.goto('/journal');
  await page.locator('#journal-title').fill('A private bus-stop thought');
  await page.locator('#journal-body').fill('This private test entry must never leave browser storage.');
  await page.getByRole('button',{name:'Save on this device'}).click();
  await expect(page.locator('#journal-status')).toHaveText('Saved on this device. Nothing was sent to a server.');
  await expect(page.locator('.journal-entry')).toHaveCount(1);
  await page.reload();await page.locator('.journal-entry').click();
  await expect(page.locator('#journal-body')).toHaveValue('This private test entry must never leave browser storage.');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('journal-mobile.png'),fullPage:true,animations:'disabled'});
  page.once('dialog',dialog=>dialog.accept());await page.locator('#journal-delete').click();
  await expect(page.locator('.journal-entry')).toHaveCount(0);await page.reload();await expect(page.locator('.journal-entry')).toHaveCount(0);
  expect(sent).toEqual([]);
});

test('AI drafting requires consent, keeps the original after failure and reuses the retry key',async({page})=>{
  const writes=[];await page.route('**/api/drafting/config',route=>json(route,{enabled:true,model:'mock-model',requiresConsent:true}));
  await page.route('**/api/session',route=>json(route,{csrfToken:'test-session-csrf'}));
  await page.route('**/api/drafting/revise',route=>{writes.push({body:route.request().postDataJSON(),headers:route.request().headers()});return writes.length===1?json(route,{error:'Provider unavailable'},502):json(route,{revision:'A bounded shade pilot with accessibility review.',changes:[{objection:'Maintenance costs are uncertain.',compromise:'Set a pilot budget and review it after six months.'}],model:'mock-model',source:'openai',reviewRequired:true});});
  await page.goto('/draft');await page.locator('#draft-bill').fill('Add shade to bus stops.');
  await expect(page.locator('#draft-submit')).toBeDisabled();expect(writes).toHaveLength(0);
  await page.locator('#draft-consent').check();await page.locator('#draft-submit').click();
  await expect(page.locator('#draft-status')).toContainText('Provider unavailable');await expect(page.locator('#draft-bill')).toHaveValue('Add shade to bus stops.');
  await page.locator('#draft-submit').click();await expect(page.locator('#draft-result')).toHaveValue('A bounded shade pilot with accessibility review.');
  expect(writes).toHaveLength(2);expect(writes[0].headers['idempotency-key']).toBe(writes[1].headers['idempotency-key']);expect(writes[0].headers['x-csrf-token']).toBe('test-session-csrf');expect(writes[0].body.consent).toBe(true);
  await expect(page.locator('#draft-status')).toContainText('Nothing has been published');
});

test('account preferences require verified proof and retain edits on a revision conflict',async({page})=>{
  await mockAccount(page);let revision=0,settings={displayName:'',theme:'system',reducedMotion:false,favoriteLawIds:[]},writes=[];
  await page.route('**/api/account/preferences',route=>{
    if(route.request().method()==='GET')return json(route,{preferences:settings,revision,updatedAt:revision?'2026-11-28T12:00:00Z':null});
    writes.push({body:route.request().postDataJSON(),headers:route.request().headers()});
    if(writes.length===1){revision=2;settings={...settings,displayName:'Changed elsewhere'};return json(route,{error:'Your settings changed on another device. Reload before saving.'},409);}
    settings=writes.at(-1).body.preferences;revision++;return json(route,{preferences:settings,revision,updatedAt:'2026-11-28T12:00:00Z'});
  });
  await page.goto('/account');await expect(page.locator('#preferences-fields')).toBeDisabled();
  await signIn(page,'#account-open');await expect(page.locator('#preferences-fields')).toBeEnabled();
  await page.locator('#preference-name').fill('My unsaved choice');await page.locator('#preferences-save').click();
  await expect(page.locator('#preferences-status')).toContainText('changed on another device');await expect(page.locator('#preference-name')).toHaveValue('My unsaved choice');
  expect(writes[0].headers['x-helios-access-token']).toBe(token);expect(writes[0].headers['x-csrf-token']).toBe('test-session-csrf');
  page.once('dialog',dialog=>dialog.accept());await page.locator('#preferences-reload').click();await expect(page.locator('#preference-name')).toHaveValue('Changed elsewhere');
  await page.locator('#preference-name').fill('Reviewed preference');await page.locator('#preferences-save').click();
  await expect(page.locator('#preferences-status')).toContainText('Revision 3');expect(writes[1].body.expectedRevision).toBe(2);
});

test('automatic PR requires exact preview and publication consent and confirms only a returned GitHub receipt',async({page})=>{
  await mockAccount(page);const writes=[];
  await page.route('**/api/github/config',route=>json(route,{enabled:true,repository:'adnanwahab/HeliosHTML',requiresAccount:true}));
  await page.route('**/api/github/pull-requests',route=>{
    writes.push({body:route.request().postDataJSON(),headers:route.request().headers()});
    if(writes.length===1)return json(route,{error:'GitHub request uncertain; retry with the same request ID.'},502);
    return json(route,{number:999,url:'https://github.com/adnanwahab/HeliosHTML/pull/999',draft:true,repository:'adnanwahab/HeliosHTML',state:'open',path:'data/contributions/test.json'});
  });
  await page.goto('/pull-requests');await page.locator('#proposal-title').fill('A shade pilot');await page.locator('#proposal-message').fill('Try accessible shade at one bus stop and measure rider comfort.');
  await page.getByRole('button',{name:'Review the public proposal'}).click();await expect(page.locator('#proposal-review-message')).toHaveText('Try accessible shade at one bus stop and measure rider comfort.');expect(writes).toHaveLength(0);
  await expect(page.locator('#proposal-create')).toBeDisabled();await signIn(page,'#pr-account-open');
  await page.locator('#proposal-public-consent').check();await expect(page.locator('#proposal-create')).toBeDisabled();await page.locator('#proposal-rights').check();
  await page.locator('#proposal-create').click();await expect(page.locator('#proposal-status')).toContainText('Publication not confirmed');await expect(page.locator('#proposal-receipt')).toBeHidden();
  await page.locator('#proposal-create').click();await expect(page.locator('#proposal-receipt-link')).toHaveAttribute('href','https://github.com/adnanwahab/HeliosHTML/pull/999');
  expect(writes).toHaveLength(2);expect(writes[0].headers['idempotency-key']).toBe(writes[1].headers['idempotency-key']);expect(writes[0].headers['x-helios-access-token']).toBe(token);expect(writes[0].body.consent).toBe(true);expect(writes[0].body.rightsConfirmed).toBe(true);
});

test('email opt-in separates a stored subscription from unavailable delivery',async({page})=>{
  const writes=[];await page.route('**/api/email/config',route=>json(route,{subscriptionsEnabled:true,deliveryEnabled:false,delayHours:72,reason:'Subscriptions can be saved. Email delivery is not configured.'}));
  await page.route('**/api/email/subscribe',route=>{writes.push(route.request().postDataJSON());return json(route,{ok:true,deliveryEnabled:false,message:'Your opt-in is saved. Email delivery is not configured yet.'},202);});
  await page.goto('/notifications');await expect(page.locator('#email-availability')).toContainText('not configured');await page.locator('#notification-email').fill('subscriber@example.invalid');
  await expect(page.locator('#notification-submit')).toBeDisabled();expect(writes).toHaveLength(0);
  await page.locator('#notification-consent').check();await page.locator('#notification-submit').click();await expect(page.locator('#notification-status')).toHaveText('Your opt-in is saved. Email delivery is not configured yet.');
  expect(writes).toHaveLength(1);expect(writes[0].consent).toBe(true);await expect(page.locator('#notification-consent')).not.toBeChecked();
});
