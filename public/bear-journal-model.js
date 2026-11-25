// Fictional, deterministic story data. No real person, network, database or model API.
export const JOURNAL_VERSION='bear-diary-v1';
const DAY=86400000;
const pad=n=>String(n).padStart(2,'0');
const isoDate=d=>d.toISOString().slice(0,10);
export function localToday(d=new Date()){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
export function parseDay(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Choose a calendar date.');
  const d=new Date(value+'T00:00:00.000Z');
  if(!Number.isFinite(+d)||isoDate(d)!==value)throw Error('Invalid calendar date.');
  return d;
}
export function shiftDay(value,days){const d=parseDay(value);if(!Number.isInteger(days))throw Error('Use whole days.');return isoDate(new Date(+d+days*DAY))}
export function archiveRange(today=localToday()){
  const end=parseDay(today),start=new Date(+end);
  // Include both the anniversary and today; clamp a leap-day anniversary to Feb 28.
  const month=start.getUTCMonth();start.setUTCFullYear(end.getUTCFullYear()-10);
  if(start.getUTCMonth()!==month)start.setUTCDate(0);
  return {start:isoDate(start),end:today,count:Math.round((end-start)/DAY)+1};
}
export function monthDays(year,month,range){
  if(!Number.isInteger(year)||!Number.isInteger(month)||month<1||month>12)throw Error('Invalid calendar month.');
  const last=new Date(Date.UTC(year,month,0)).getUTCDate();
  return Array.from({length:last},(_,i)=>year+'-'+pad(month)+'-'+pad(i+1)).filter(d=>d>=range.start&&d<=range.end);
}
export function withinArchive(day,range){try{parseDay(day);return day>=range.start&&day<=range.end}catch{return false}}
const profiles=[
 ['Professor Honey','repairing clocks','a copper gear','Strawberry','teaching repair without doing the work for someone','the clock workshop','sharing tools instead of guarding them'],
 ['Strawberry','baking and accessible design','a flour-dusted recipe card','Professor Honey','asking visitors what makes a space comfortable','the kitchen courtyard','making worktables welcoming to every bear'],
 ['Blueberry','night-time walks and transit','a paper bus timetable','Dreamer','finding dependable rides after a long day','the moonlit stop','helping late travelers feel welcome'],
 ['Dreamer','writing small stories','a notebook with a silver bookmark','Blueberry','finishing a tale instead of starting another','the Dream Library','keeping a place to read open a little longer'],
 ['Clover','growing herbs and tomatoes','a packet of basil seeds','Sunny','remembering to water the smallest plants','the greenhouse','making a garden that belongs to everyone'],
 ['Sunny','games and outdoor gatherings','a yellow skipping rope','Clover','making room for shy players','the fountain lawn','planning play that includes different abilities'],
 ['Pixel','electronics and invention','a lamp with a loose switch','Professor Honey','taking a broken gadget apart slowly','the maker desk','starting a lending shelf for tools'],
 ['Quiet','reading and nature walks','a soft blue scarf','Fern','finding a quiet corner without avoiding everyone','the reading nook','keeping calm places within the shared gardens'],
 ['Peaches','ceramics and small repairs','a chipped peach-colored mug','Pixel','accepting imperfect first attempts','the pottery shed','sharing a workbench with beginners'],
 ['Mochi','cooking and planting','a jar of pickled radishes','Clover','balancing careful plans with improvisation','the herb beds','holding a friendly meal in the garden'],
 ['Pip','mapping footpaths','a folded neighborhood map','Blueberry','asking for directions before getting lost','the fountain walk','marking safer, accessible routes'],
 ['Juniper','woodworking and model building','a small wooden bird','Peaches','measuring before making the first cut','the model workshop','opening a repair circle'],
 ['Maple','collecting leaves','a pressed maple leaf','Marigold','letting some things grow at their own pace','the west garden','looking after shared trees'],
 ['Biscuit','bicycle repair and delivery','a spare bicycle bell','Pip','finding time to rest between errands','the shuttle path','testing a dependable evening ride'],
 ['Luna','stargazing and optical gadgets','a tiny telescope lens','Dreamer','explaining an idea in simpler words','the observation table','sharing a small telescope with visitors'],
 ['Marigold','flower arranging','a bright orange ribbon','Maple','planting for the next season rather than today','the rose garden','making a shaded place to meet'],
 ['Cloud','watching weather and drawing maps','a watercolor cloud sketch','River','learning to leave earlier on rainy days','the sheltered stop','keeping travel accessible in bad weather'],
 ['Fern','botany and quiet crafts','a magnifying glass','Quiet','noticing when a friend needs space','the fern path','building a gentle garden corner'],
 ['Sprout','tending seedlings and compost','a tiny green watering can','Clover','sticking with a small routine','the raised beds','creating a shared seed library'],
 ['Poppy','music and neighborhood outings','a little red songbook','Sunny','listening for a quieter voice in the group','the library steps','planning an evening shuttle for gatherings'],
 ['Twinkle','inventing lights and lanterns','a paper star lantern','Luna','asking for help with a tricky joint','the lantern bench','making repairs easier for newcomers'],
 ['Cocoa','baking and friendship','a tin of cocoa powder','Mochi','making enough room for another guest','the picnic garden','bringing neighbors together over snacks'],
 ['River','walking by the fountain and drawing routes','a smooth river stone','Cloud','choosing a slower route when tired','the fountain path','connecting pleasant paths to reliable transport'],
 ['Mint','mixing herbal tea and repairing kettles','a green tea tin','Strawberry','letting others choose their own way to learn','the tea workshop','helping a neighborhood learning space feel like home']
];
export const BEAR_JOURNAL_NAMES=Object.freeze(profiles.map(p=>p[0]));
const byName=new Map(profiles.map(p=>[p[0],p]));
const moods=['Hopeful','Curious','Content','Thoughtful','Tired','Frustrated','Grateful','Playful','Worried','Proud'];
const categories=['Everyday life','Friendship','Learning','Garden life','Community ideas','Rest','Small setbacks','Future wishes'];
const seasons=[
 ['Winter','frost on the grass','warm tea','the early dusk','a windy afternoon'],
 ['Spring','new green leaves','a sudden shower','flowers opening','a bright morning'],
 ['Summer','long evening light','warm stone paths','the shade of the trees','a heavy afternoon shower'],
 ['Autumn','fallen leaves','a crisp breeze','golden afternoon light','a cool morning']
];
function generator(seed){let n=2166136261;for(let i=0;i<seed.length;i++){n^=seed.charCodeAt(i);n=Math.imul(n,16777619)}return ()=>{n=(n+0x6d2b79f5)|0;let t=Math.imul(n^(n>>>15),1|n);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296}}
function pick(r,a){return a[Math.floor(r()*a.length)]}
const weatherMood=['a bit distracted','ready to try again','in a wonderfully silly mood','unusually patient','a little overwhelmed','glad to see a familiar face','quietly determined','curious about everything'];
const yearArcs=[
 'I was still learning the neighborhood and what mattered to me.',
 'I started noticing which small routines made our days better.',
 'I began taking my little projects more seriously.',
 'I wanted to spend more time listening to the other bears.',
 'I started valuing quieter days and dependable friendships.',
 'I found that small experiments were easier than grand promises.',
 'I began writing down what worked and what did not.',
 'I started inviting others to try my ideas with me.',
 'I learned to revise plans when someone raised a concern.',
 'I tried to turn old wishes into small, practical experiments.',
 'I have been wondering how our individual stories might inform shared ideas.'
];
export function journalEntry(name,day){
 const d=parseDay(day),p=byName.get(name);if(!p)throw Error('Unknown fictional bear.');
 const [,hobby,object,friend,challenge,place,goal]=p;
 const random=generator(JOURNAL_VERSION+'|'+name+'|'+day);
 const month=d.getUTCMonth(),year=d.getUTCFullYear(),season=seasons[Math.floor((month+1)%12/3)],weather=pick(random,season.slice(1));
 const mood=pick(random,moods),category=pick(random,categories),feeling=pick(random,weatherMood);
 const neighbor=pick(random,[friend,friend,...BEAR_JOURNAL_NAMES.filter(n=>n!==name&&n!==friend)]);
 const arc=yearArcs[Math.max(0,Math.min(yearArcs.length-1,year-2016))];
 const detail=pick(random,['I stayed for a few extra minutes.','I put the idea in my little notebook.','It was a better day than I expected.','I wish I had remembered to bring a snack.','It made the afternoon feel less hurried.','I decided to ask again tomorrow.','A little patience went a long way.','I watched the sky change color on the way home.']);
 const templates={
  'Everyday life':['An ordinary little day','I woke up feeling '+feeling+' and brought '+object+' to '+place+'. I spent some time '+hobby+' while I noticed '+weather+'. '+detail],
  'Friendship':['A moment with '+neighbor,'I met '+neighbor+' at '+place+'. We talked about '+hobby+' and ended up laughing over something tiny. I remembered that a good conversation can be more important than finishing a project. '+detail],
  'Learning':['Something new to learn','I tried '+challenge+' at '+place+'. I got help from '+neighbor+' when I was unsure, then made another attempt. I wrote down one thing I learned so I can remember it next time. '+detail],
  'Garden life':['A walk through the gardens','I took '+object+' along the garden path and noticed '+weather+'. '+neighbor+' was there, so we stopped for a moment to talk. I like the gardens best when there is room for different kinds of days. '+detail],
  'Community ideas':['A tiny idea for tomorrow','Today I kept thinking about '+goal+'. I asked '+neighbor+' what they would change first. We agreed to start small, and I wrote down a question we still need to answer. '+detail],
  'Rest':['A slower afternoon','I was '+feeling+' today, so I gave myself a break from '+hobby+'. I sat near '+place+' and noticed '+weather+'. I left my project for another day instead of rushing. '+detail],
  'Small setbacks':['Not quite as planned','I struggled with '+challenge+' today. '+object.charAt(0).toUpperCase()+object.slice(1)+' reminded me that practice can be messy. '+neighbor+' helped me think of one smaller step. '+detail],
  'Future wishes':['A small wish for the future','I imagined '+goal+' while I was sitting near '+place+'. I could picture '+neighbor+' trying it with me, but I still wonder who else might want something different. I will keep that question open. '+detail]
 };
 const [title,body]=templates[category];
 // Stable date/character stamp, weekday & occasional longer reflection.
 const weekday=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getUTCDay()];
 const reflection=d.getUTCDate()===1?' '+arc:'';
 return {id:name+'|'+day,date:day,weekday,season:season[0],mood,category,title,text:body+reflection,friend:neighbor,theme:goal,version:JOURNAL_VERSION};
}
