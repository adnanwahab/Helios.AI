// Shared, public route directory. These descriptions contain no runtime secrets.
export const FEATURE_ROUTES = Object.freeze([
  {id:'landing',title:'The civic workshop',route:'/',category:'Explore',kind:'browser',storage:'Browser',description:'Begin with a thought, turn it into a proposal, and choose what to share.',action:'Open the workshop',api:[]},
  {id:'experiences',title:'Three.js & WebGPU worlds',route:'/experiences',category:'Explore',kind:'browser',storage:'Browser graphics',description:'Explore interactive worlds, particle studios, and playful visual experiments.',action:'Explore the experiences',api:[]},
  {id:'world-map',title:'Find your kind of place',route:'/world-map',category:'Explore',kind:'browser',storage:'Browser + shareable URL',description:'Adjust five preferences and see how the world suitability map changes.',action:'Explore the world map',api:[]},
  {id:'simulations',title:'Consensus World',route:'/simulate',category:'Explore',kind:'browser',storage:'Browser simulation',description:'Compare a proposal across synthetic voters. Change assumptions and run again.',action:'Run a local simulation',api:[]},
  {id:'law-catalog',title:'The original 100 laws',route:'/laws',category:'Explore',kind:'browser',storage:'Bundled public catalog',description:'Read the original editorial proposals, their goals, safeguards, and measures.',action:'Read the proposals',api:['GET /api/catalog']},
  {id:'journal',title:'Your private journal',route:'/journal',category:'Explore',kind:'browser',storage:'This browser only',description:'Save a thought for yourself. Export or delete it whenever you choose.',action:'Open your journal',api:[]},
  {id:'votes',title:'Shared advisory votes',route:'/votes',category:'Participate',kind:'server',storage:'Shared civic database',description:'Save support, uncertainty, or opposition against the exact proposal revision.',action:'Visit the shared law board',api:['GET /api/law-board','POST /api/law-board/:id/vote']},
  {id:'proposals',title:'Propose & revise a law',route:'/proposals',category:'Participate',kind:'server',storage:'Shared civic database',description:'Explain a change, name its safeguards, and submit a proposal for human review.',action:'Propose a change',api:['POST /api/laws','POST /api/laws/:id/amendments','POST /api/law-board/:id/update']},
  {id:'account',title:'Your account & preferences',route:'/account',category:'Participate',kind:'server',storage:'Your signed-in account',description:'Keep your display preferences and favorite proposals with your account.',action:'Manage your account',api:['GET /api/account/config','GET /api/account/preferences','POST /api/account/preferences']},
  {id:'pull-requests',title:'Make a proposal pull request',route:'/pull-requests',category:'Participate',kind:'server',storage:'Public GitHub + receipt',description:'Review your exact public proposal, then ask Helios to create its GitHub pull request.',action:'Prepare a pull request',api:['GET /api/github/config','POST /api/github/pull-requests']},
  {id:'drafting',title:'Improve a draft with AI',route:'/draft',category:'Participate',kind:'server',storage:'AI provider + saved retry receipt',description:'Ask for clearer wording, stronger safeguards, and responses to objections.',action:'Open the drafting studio',api:['GET /api/drafting/config','POST /api/drafting/revise']},
  {id:'email',title:'One thoughtful email',route:'/notifications',category:'Participate',kind:'server',storage:'Email subscription database',description:'Opt in to one follow-up email about a Helios proposal, with an unsubscribe link.',action:'Choose an email follow-up',api:['GET /api/email/config','POST /api/email/subscribe']},
  {id:'agents',title:'Mini Symphony agents',route:'/agents',category:'Research together',kind:'server',storage:'Durable tasks + worker leases',description:'Plan a research mission, supervise connected workers, and review their results.',action:'Open the coordinator',api:['GET /api/research/status','POST /api/research/rooms/:id/plan','POST /api/research/rooms/:id/control']},
  {id:'research',title:'Shared research rooms',route:'/research',category:'Research together',kind:'server',storage:'Shared research database',description:'Share a brief, inspect tasks and evidence, and work from the same saved room.',action:'Open a research room',api:['GET /api/research/rooms','POST /api/research/rooms','GET /api/research/rooms/:id']},
  {id:'keyframes',title:'Design future keyframes',route:'/keyframes',category:'Research together',kind:'server',storage:'Shared frames + revision history',description:'Build possible futures together, connect proposed laws, and preserve each revision.',action:'Design a future together',api:['POST /api/research/rooms/:id/frames','POST /api/research/rooms/:id/frames/:frameId','GET /api/research/rooms/:id/frames/:frameId/history']},
].map(feature=>Object.freeze({...feature,backend:feature.kind==='server'})));

export const FEATURE_GROUPS = Object.freeze(['Explore','Participate','Research together']);

// GitHub Pages is served under a repository subpath and has no rewrite server.
// Resolve files relative to this module so a fork keeps every link inside itself.
const staticPaths={landing:'../index.html',experiences:'../experiments.html','world-map':'./world-map/index.html',simulations:'./consensus-world.html','law-catalog':'../helios_100_frontend_demo.html',journal:'./feature-workspace.html?feature=journal',votes:'../law-atlas.html',proposals:'../index.html#journal-workbench',account:'./feature-workspace.html?feature=account','pull-requests':'./feature-workspace.html?feature=pull-requests',drafting:'./feature-workspace.html?feature=drafting',email:'./feature-workspace.html?feature=email',agents:'../research.html',research:'../research.html',keyframes:'../research.html#keyframes'};
export function staticFeatureHref(id){return new URL(staticPaths[id]||'./feature-directory.html',import.meta.url).href;}
export function rewriteStaticFeatureLinks(root){
  for(const link of root.querySelectorAll('a[href]')){
    const href=link.getAttribute('href');
    if(href==='/features'){link.href=new URL('./feature-directory.html',import.meta.url).href;continue;}
    if(href==='/?compose=pr'){link.href=new URL('../index.html?compose=pr',import.meta.url).href;continue;}
    const feature=FEATURE_ROUTES.find(item=>item.route===href);if(feature)link.href=staticFeatureHref(feature.id);
  }
}
