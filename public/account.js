import {createClient} from '@supabase/supabase-js';
import {ACCOUNT_CONFIG} from './account-config.js';

// Account identity is optional. No client, auth request, or civic request is
// created for a fresh guest until they open this panel.
const staticMode = document.querySelector('meta[name="helios-mode"]')?.content === 'static';
const researchPage = Boolean(document.getElementById('research-title'));
const defaultScope = researchPage ? 'research' : 'votes';
const hintKey = 'helios-account-present-v1';
const clientStorageKey = 'helios-account-session-v1';
const guestKey = 'helios-account-guest-v1';
const capabilities = new Map();
let client = null, initializing = null, processing = false, opener = null, activeReason = 'account';
let returnTo = '';
let authEpoch = 0, signInPending = false, guestOverride = false;
let verifiedAccessToken = null;
try { guestOverride = localStorage.getItem(guestKey) === '1'; } catch {}
let state = {status:'guest', user:null, persistence:{votes:false,research:false}, storage:null};
const hint = () => { try { return localStorage.getItem(hintKey) === '1'; } catch { return false; } };
const setHint = value => { try { if (value) localStorage.setItem(hintKey,'1'); else localStorage.removeItem(hintKey); } catch {} };
const setGuestOverride = value => { guestOverride=value;try { if(value)localStorage.setItem(guestKey,'1');else localStorage.removeItem(guestKey); }catch{} };
const scopePath = scope => scope === 'research' ? '/api/research/account' : '/api/account';
const publicState = () => ({status:state.status, authenticated:state.status === 'signed-in', user:state.user ? {...state.user} : null, persistence:{...state.persistence}, static:staticMode});
const usingAccount = scope => state.status === 'signed-in' && state.persistence[scope] === true;
const stripAuthParameters = url => {
  for(const key of ['code','error','error_code','error_description','sb_flow_id'])url.searchParams.delete(key);
  return url;
};
const cleanReturnTo = value => {
  let url;
  try { url=new URL(value,location.origin);if(url.origin!==location.origin)url=new URL(location.href); }
  catch { url=new URL(location.href); }
  stripAuthParameters(url);
  return url.pathname+url.search+url.hash;
};
returnTo=cleanReturnTo(location.href);

const dialog = document.createElement('dialog');
dialog.id = 'helios-account-dialog';
dialog.className = 'helios-account-dialog';
dialog.setAttribute('aria-labelledby','helios-account-title');
dialog.setAttribute('aria-describedby','helios-account-description');
dialog.innerHTML = `
  <div class="helios-account-head"><span class="helios-account-eyebrow">HELIOS / OPTIONAL ACCOUNT</span><button type="button" class="helios-account-close" id="helios-account-close" aria-label="Close account panel">×</button></div>
  <h2 id="helios-account-title">Keep your votes with you.</h2>
  <p id="helios-account-description">Explore freely. Sign in to keep connected votes and shared work with your account when saving is available.</p>
  <button type="button" class="helios-account-secondary helios-account-guest" id="helios-account-guest">Continue as guest</button>
  <p id="helios-account-status" class="helios-account-status" role="status" aria-live="polite">Sign in is optional.</p>
  <div id="helios-account-signed-in" hidden><p class="helios-account-identity" id="helios-account-identity"></p><p id="helios-account-persistence"></p><button type="button" class="helios-account-secondary" id="helios-account-signout">Sign out on this device</button></div>
  <form id="helios-account-form">
    <label for="helios-account-email">Email</label><input id="helios-account-email" type="email" autocomplete="username" maxlength="254" required>
    <label for="helios-account-password">Password</label><input id="helios-account-password" type="password" autocomplete="current-password" maxlength="1024" required>
    <button type="submit" class="helios-account-primary" id="helios-account-submit">Sign in to an existing account</button>
    <p class="helios-account-help" id="helios-account-new-users">New account signup and email sign-in are not available yet. You can continue as a guest.</p>
    <button type="button" class="helios-account-link" id="helios-account-email-link" hidden>Email a sign-in link</button>
  </form>
  <p class="helios-account-separation" id="helios-account-separation">Existing browser votes stay separate. Signing in does not upload your private journal, drafts, or practice choices.</p>
`;
document.body.append(dialog);
const $ = id => document.getElementById(id);

function message(text, error=false) {
  $('helios-account-status').textContent=text;
  $('helios-account-status').classList.toggle('error',error);
}

function capabilityMessage(scope=defaultScope) {
  if (staticMode) return 'This static preview does not connect to accounts. Continue as a guest to explore.';
  if (state.persistence[scope]) return scope==='research'
    ? 'New shared rooms and contributions can be saved with your account. Work saved as a guest stays separate.'
    : 'Connected votes you cast while signed in can be saved with your account and found on another device.';
  return scope==='research'
    ? 'Account saving is not available here yet. Your research drafts stay in this browser, and you can keep designing as a guest.'
    : 'Account saving is not available here yet. Guest voting and local drafts remain available.';
}

function render() {
  const signed=state.status==='signed-in';
  const verifying=state.status==='verifying';
  for(const button of document.querySelectorAll('[data-open-login]')) {
    if(button.dataset.loginReason==='save_votes') button.textContent=signed&&usingAccount('votes')?'Account vote settings':'Save with an account';
    else button.textContent=signed?'Account':verifying?'Checking account…':'Sign in';
    button.setAttribute('aria-haspopup','dialog');
    button.setAttribute('aria-controls','helios-account-dialog');
  }
  $('helios-account-form').hidden=signed;
  $('helios-account-signed-in').hidden=!signed;
  $('helios-account-identity').textContent=signed?`Signed in as ${state.user?.email || 'your Helios account'}`:'';
  $('helios-account-persistence').textContent=capabilityMessage();
  $('helios-account-submit').disabled=processing||verifying||staticMode||!ACCOUNT_CONFIG.passwordSignInEnabled;
  $('helios-account-email').disabled=processing||verifying||staticMode;
  $('helios-account-password').disabled=processing||verifying||staticMode;
  $('helios-account-signout').disabled=processing;
  $('helios-account-email-link').hidden=staticMode||!ACCOUNT_CONFIG.emailSignInEnabled;
  $('helios-account-email-link').disabled=processing;
  $('helios-account-new-users').textContent=staticMode?'Account connections are disabled in this static preview.':ACCOUNT_CONFIG.emailSignInEnabled?'You can also receive a sign-in link by email.':'New account signup and email sign-in are not available yet. You can continue as a guest.';
  $('helios-account-guest').textContent=signed?'Return to the workspace':'Continue as guest';
}

function emitChange() {
  render();
  window.dispatchEvent(new CustomEvent('helios:auth-changed',{detail:publicState()}));
}

function beginVerification() {
  verifiedAccessToken=null;
  state={...state,status:'verifying',user:null};
  message('Checking your account before connected actions can continue…');
  emitChange();
}

function sessionError(text) {
  verifiedAccessToken=null;
  state={...state,status:'session-error',user:null};
  message(text,true);
  emitChange();
}

function queueSessionVerification(session) {
  const epoch=++authEpoch;
  if(!session){
    verifiedAccessToken=null;state={...state,status:'guest',user:null};setHint(false);emitChange();return;
  }
  // Publish the transition synchronously, before the SDK callback returns.
  beginVerification();
  setTimeout(()=>acceptSession(session,{epoch}).catch(()=>{}),0);
}

async function loadCapabilities(scope, {refresh=false}={}) {
  if(staticMode) return {votes:false,research:false};
  if(refresh)capabilities.delete(scope);
  if(capabilities.has(scope)) return capabilities.get(scope);
  let value;
  try {
    const response=await fetch(scopePath(scope)+'/config',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
    const config=await response.json();
    if(!response.ok||config.available!==true) throw Error('Account saving is unavailable.');
    value={votes:config.accountPersistence?.votes===true,research:config.accountPersistence?.research===true};
    state.storage=config.storage||null;
  } catch {value={votes:false,research:false};}
  capabilities.set(scope,value);
  // Each configuration describes its own service; a separate research runtime
  // cannot enable civic account votes or vice versa.
  state.persistence[scope]=value[scope]===true;
  return value;
}

async function acceptSession(session, {announce=true, epoch=authEpoch}={}) {
  if(guestOverride||epoch!==authEpoch)return;
  if(!session){verifiedAccessToken=null;state={...state,status:'guest',user:null};setHint(false);if(announce)emitChange();else render();return;}
  try {
    const {data,error}=await client.auth.getUser(session.access_token);
    if(error||!data?.user||data.user.id!==session.user?.id) throw Error('Your account session could not be verified. Sign in again.');
    if(guestOverride||epoch!==authEpoch)return;
    const verifiedUser={id:data.user.id,email:data.user.email||''};
    await loadCapabilities(defaultScope);
    if(guestOverride||epoch!==authEpoch)return;
    const persistence={...state.persistence};
    if(persistence[defaultScope]) {
      const response=await fetch(scopePath(defaultScope)+'/me',{credentials:'same-origin',cache:'no-store',headers:{'X-Helios-Access-Token':session.access_token},signal:AbortSignal.timeout(10000)});
      const identity=await response.json();
      if(!response.ok||identity.signedIn!==true||identity.account?.id!==data.user.id)throw Error('This deployment could not verify the account for saving. Sign in again before saving with it.');
      persistence[defaultScope]=identity.persistence?.[defaultScope]===true;
    }
    if(guestOverride||epoch!==authEpoch)return;
    const current=await client.auth.getSession();
    if(guestOverride||epoch!==authEpoch)return;
    if(current.error||current.data.session?.access_token!==session.access_token||current.data.session?.user?.id!==verifiedUser.id)throw Error('Your account changed during verification. Sign in again before saving.');
    // No identity is public, and no proof is usable, until every check passes.
    verifiedAccessToken=session.access_token;
    state={...state,status:'signed-in',user:verifiedUser,persistence};setHint(true);
    message(capabilityMessage(),false);
    if(announce)emitChange();else render();
  } catch(error) {
    if(guestOverride||epoch!==authEpoch)return;
    sessionError(error.message);
    throw error;
  }
}

async function initialize() {
  if(staticMode){message(capabilityMessage());render();return null;}
  if(initializing)return initializing;
  if(!guestOverride&&!signInPending&&hint()&&state.status==='guest'){++authEpoch;beginVerification();}
  const epoch=authEpoch;
  initializing=(async()=>{
    if(!ACCOUNT_CONFIG.url||!ACCOUNT_CONFIG.publishableKey)throw Error('Account sign-in is not configured for this deployment. Continue as a guest.');
    if(!client){
      client=createClient(ACCOUNT_CONFIG.url,ACCOUNT_CONFIG.publishableKey,{auth:{storageKey:clientStorageKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce'}});
      client.auth.onAuthStateChange((event,session)=>{
        // Keep asynchronous Supabase work outside the synchronous auth callback.
        if(event==='INITIAL_SESSION'||processing||guestOverride)return;
        if(['SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED','USER_UPDATED'].includes(event)){
          if(event!=='USER_UPDATED'&&session&&state.status==='signed-in'&&session.access_token===verifiedAccessToken&&session.user?.id===state.user?.id)return;
          queueSessionVerification(session);
        }
      });
    }
    await loadCapabilities(defaultScope);
    if(guestOverride||signInPending)return client;
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    if(guestOverride||signInPending||epoch!==authEpoch)return client;
    let verificationEpoch=epoch;
    if(data.session&&state.status!=='verifying'){verificationEpoch=++authEpoch;beginVerification();}
    await acceptSession(data.session,{announce:Boolean(data.session)||state.status==='verifying',epoch:verificationEpoch});
    return client;
  })().catch(error=>{initializing=null;if(epoch===authEpoch){if(state.status==='verifying')sessionError(error.message);else message(error.message,true);}throw error;});
  return initializing;
}

async function fetchHeaders(scope='votes') {
  if(staticMode)return {};
  const epoch=authEpoch;
  const changed=()=>guestOverride||epoch!==authEpoch;
  const transitionError=()=>Error('Your account is changing or being verified. Wait for verification, then review the action and try again.');
  if(state.status==='verifying')throw transitionError();
  if(state.status==='session-error')throw Error('Sign in again or explicitly continue as a guest before saving. Your draft has not been submitted.');
  if(guestOverride)return {};
  if(!client&&!initializing&&!hint())return {};
  await initialize();
  if(changed()||state.status==='verifying')throw transitionError();
  if(state.status==='session-error')throw Error('Sign in again before saving with your account. Your draft has not been submitted.');
  if(state.status!=='signed-in')return {};
  const userId=state.user?.id,token=verifiedAccessToken;
  await loadCapabilities(scope);
  if(changed()||state.status!=='signed-in'||state.user?.id!==userId||verifiedAccessToken!==token)throw transitionError();
  if(!state.persistence[scope])return {};
  const {data,error}=await client.auth.getSession();
  if(changed()||state.status!=='signed-in'||state.user?.id!==userId||verifiedAccessToken!==token)throw transitionError();
  if(error||!data.session?.access_token){++authEpoch;sessionError('Your account session expired. Sign in again before saving.');throw transitionError();}
  if(!token||data.session.access_token!==token||data.session.user?.id!==userId){queueSessionVerification(data.session);throw transitionError();}
  return {'X-Helios-Access-Token':token};
}

async function openLogin(options={}) {
  if(!dialog.open)opener=document.activeElement;
  activeReason=options.reason==='save_votes'?'save_votes':'account';
  returnTo=cleanReturnTo(options.returnTo||location.pathname+location.search+location.hash);
  $('helios-account-title').textContent=activeReason==='save_votes'?'Save connected votes with an account.':'Keep your votes with you.';
  render();
  if(!dialog.open)dialog.showModal();
  if(staticMode){message(capabilityMessage());$('helios-account-guest').focus();return;}
  message('Checking account options…');
  try {await loadCapabilities(defaultScope,{refresh:true});await initialize();message(state.status==='verifying'?'Checking your account before connected actions can continue…':state.status==='session-error'?'Your previous account session could not be verified. Sign in again, or continue as a guest.':state.status==='signed-in'?capabilityMessage():`${capabilityMessage()} Sign in is optional.`,state.status==='session-error');if(state.status==='signed-in')emitChange();}
  catch(error){message(error.message,true);}
  render();
  if(dialog.open)(['signed-in','verifying'].includes(state.status)?$('helios-account-guest'):$('helios-account-email')).focus();
}

function closeDialog() {dialog.close();}
async function continueAsGuest() {
  // A deliberate guest choice wins over a late auth callback or an in-flight
  // password response. It also survives a reload if remote sign-out is offline.
  ++authEpoch;verifiedAccessToken=null;setGuestOverride(true);setHint(false);
  state={...state,status:'guest',user:null};
  try {localStorage.removeItem(clientStorageKey);}catch{}
  emitChange();
  if(client)try{await client.auth.signOut({scope:'local'});}catch{}
}
dialog.addEventListener('close',()=>{if(signInPending&&!guestOverride)continueAsGuest();$('helios-account-password').value='';if(opener?.isConnected)opener.focus({preventScroll:true});});
$('helios-account-close').addEventListener('click',closeDialog);
$('helios-account-guest').addEventListener('click',()=>{if(state.status!=='signed-in'||signInPending)continueAsGuest();closeDialog();});
dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeDialog();}});
document.addEventListener('click',event=>{const button=event.target.closest('[data-open-login]');if(button){event.preventDefault();openLogin({reason:button.dataset.loginReason||'account'});}});
window.addEventListener('open_login',event=>openLogin(event.detail||{}));
window.open_login=openLogin;
window.HeliosAccount=Object.freeze({open:openLogin,fetchHeaders,getState:publicState,isSavingWithAccount:usingAccount});

$('helios-account-form').addEventListener('submit',async event=>{
  event.preventDefault();if(processing||staticMode||!ACCOUNT_CONFIG.passwordSignInEnabled)return;
  const epoch=++authEpoch;
  processing=true;signInPending=true;beginVerification();message('Signing in…');
  try{
    const auth=await initialize();
    if(epoch!==authEpoch)return;
    // An explicit sign-in attempt is required to leave guest mode.
    guestOverride=false;
    const {data,error}=await auth.auth.signInWithPassword({email:$('helios-account-email').value.trim(),password:$('helios-account-password').value});
    if(epoch!==authEpoch||guestOverride){await auth.auth.signOut({scope:'local'});return;}
    if(error||!data.session)throw Error('Sign-in failed. Check the email and password for an existing, confirmed account.');
    $('helios-account-password').value='';
    await acceptSession(data.session,{epoch});
    if(epoch===authEpoch&&state.status==='signed-in')setGuestOverride(false);
  }catch(error){if(epoch===authEpoch)sessionError(error.message||'Sign-in could not be completed. You can continue as a guest.');}
  finally{processing=false;signInPending=false;render();}
});

$('helios-account-signout').addEventListener('click',async()=>{
  if(processing||!client)return;const epoch=++authEpoch;processing=true;beginVerification();
  try{const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;if(epoch!==authEpoch)return;setGuestOverride(true);state={...state,status:'guest',user:null};setHint(false);message('Signed out on this device. Your private drafts have not changed.');emitChange();}
  catch{if(epoch===authEpoch)sessionError('Sign-out could not be completed. Try again or continue as a guest.');}
  finally{processing=false;render();}
});

$('helios-account-email-link').addEventListener('click',async()=>{
  if(processing||staticMode||!ACCOUNT_CONFIG.emailSignInEnabled)return;
  const email=$('helios-account-email');if(!email.reportValidity())return;
  processing=true;render();message('Requesting an email sign-in link…');
  try{const auth=await initialize();const {error}=await auth.auth.signInWithOtp({email:email.value.trim(),options:{emailRedirectTo:location.origin+returnTo}});if(error)throw error;message('Check your email for the sign-in link. Your draft stays here.');}
  catch{message('The email could not be sent. You can continue as a guest.',true);}
  finally{processing=false;render();}
});

async function completeEmailCallback(code,flowId) {
  if(staticMode||!ACCOUNT_CONFIG.emailSignInEnabled||!code||processing)return;
  const epoch=++authEpoch;
  processing=true;signInPending=true;guestOverride=false;
  beginVerification();
  if(!dialog.open){opener=document.activeElement;dialog.showModal();}
  $('helios-account-guest').focus();
  try{
    // signInPending prevents initialization from adopting an older SDK session.
    const auth=await initialize();
    if(epoch!==authEpoch||guestOverride)return;
    const {data,error}=await auth.auth.exchangeCodeForSession(code,flowId===null?undefined:{flowId});
    if(epoch!==authEpoch||guestOverride){await auth.auth.signOut({scope:'local'});return;}
    if(error||!data.session)throw Error('The email sign-in link could not be verified.');
    await acceptSession(data.session,{epoch});
    if(epoch===authEpoch&&state.status==='signed-in')setGuestOverride(false);
  }catch{
    if(epoch===authEpoch){
      // A failed link must not expose a previously stored account as its result.
      setGuestOverride(true);setHint(false);
      sessionError('This email link could not complete sign-in. Open it in the browser where you requested it, or request a new link. You can continue as a guest.');
    }
  }finally{processing=false;signInPending=false;render();}
}

render();
const requestedLogin=new URL(location.href);
const callbackCode=requestedLogin.searchParams.get('code')?.trim();
const callbackFlowId=requestedLogin.searchParams.get('sb_flow_id');
const showLogin=requestedLogin.searchParams.get('open_login')==='1';
stripAuthParameters(requestedLogin);
if(showLogin)requestedLogin.searchParams.delete('open_login');
if(requestedLogin.href!==location.href)history.replaceState(history.state,'',requestedLogin.pathname+requestedLogin.search+requestedLogin.hash);
if(!staticMode&&ACCOUNT_CONFIG.emailSignInEnabled&&callbackCode) {
  completeEmailCallback(callbackCode,callbackFlowId);
} else if(showLogin) {
  openLogin({returnTo:requestedLogin.pathname+requestedLogin.search+requestedLogin.hash});
} else if(!staticMode&&!guestOverride&&hint())initialize().catch(()=>{});
