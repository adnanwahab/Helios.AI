import {archiveRange,localToday,parseDay,shiftDay,monthDays,withinArchive,journalEntry} from './bear-journal-model.js';
const $=id=>document.getElementById(id);
const game=window.rainbowGarden,range=archiveRange(localToday());
let day=range.end,selection=game.journalSelection(),calendarKey='';
const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
const weekdayLabels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const dateLabel=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});
const moodColors={Hopeful:'#aee5ba',Curious:'#f9d99a',Content:'#b3dfdd',Thoughtful:'#c1b9ec',Tired:'#9fa9c3',Frustrated:'#efa4a5',Grateful:'#f5c1b1',Playful:'#f1a9dc',Worried:'#b6afe4',Proud:'#f4d78e'};
const elem=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
function setDay(next){if(!withinArchive(next,range))return;day=next;render()}
function moveDay(n){setDay(shiftDay(day,n))}
function chooseMonth(y,m){const days=monthDays(y,m,range);if(!days.length)return;const wanted=Number(day.slice(-2));setDay(days.reduce((best,x)=>Math.abs(Number(x.slice(-2))-wanted)<Math.abs(Number(best.slice(-2))-wanted)?x:best,days[0]))}
function syncSelectors(){
 const y=Number(day.slice(0,4)),m=Number(day.slice(5,7));
 $('journal-year').value=String(y);
 for(const option of $('journal-month').options)option.disabled=!monthDays(y,Number(option.value),range).length;
 $('journal-month').value=String(m);$('journal-date').value=day;
 $('journal-previous').disabled=day===range.start;$('journal-next').disabled=day===range.end;
 $('journal-today').disabled=day===range.end;
}
function renderCalendar(){
 const key=selection.name+'|'+day.slice(0,7);
 if(key!==calendarKey){
   calendarKey=key;
   const grid=$('journal-calendar');grid.replaceChildren();
   for(const label of weekdayLabels){const n=elem('span',label);n.className='journal-weekday';grid.append(n)}
   const [y,m]=day.split('-').map(Number);
   const firstWeekday=new Date(Date.UTC(y,m-1,1)).getUTCDay();
   const dates=monthDays(y,m,range);
   const first=dates.length?Number(dates[0].slice(-2)):1;
   for(let i=0;i<firstWeekday+first-1;i++){const blank=elem('span');blank.setAttribute('aria-hidden','true');grid.append(blank)}
   for(const date of dates){
     const entry=journalEntry(selection.name,date),button=elem('button',String(Number(date.slice(-2))));
     button.type='button';button.dataset.journalDay=date;button.title=entry.mood+' · '+entry.title;
     button.setAttribute('aria-label',dateLabel.format(parseDay(date))+' — '+entry.mood+', '+entry.title);
     button.style.setProperty('--diary-dot',moodColors[entry.mood]);button.addEventListener('click',()=>setDay(date));grid.append(button);
   }
 }
 for(const button of $('journal-calendar').querySelectorAll('[data-journal-day]'))button.setAttribute('aria-pressed',String(button.dataset.journalDay===day));
}
function render(){
 const entry=journalEntry(selection.name,day);
 $('journal-archive').dataset.bear=selection.name;$('journal-archive').dataset.date=day;
 $('journal-owner').textContent=selection.name+'’s journal';
 $('journal-count').textContent=range.count.toLocaleString('en-US')+' daily entries';
 $('journal-range').textContent=range.start+' → '+range.end;
 $('journal-entry-date').textContent=dateLabel.format(parseDay(day));$('journal-entry-date').dateTime=day;
 $('journal-entry-title').textContent=entry.title;
 $('journal-entry-text').textContent=entry.text;
 $('journal-entry-category').textContent=entry.category;
 $('journal-entry-mood').textContent=entry.mood;$('journal-entry-mood').style.setProperty('--diary-dot',moodColors[entry.mood]);
 $('journal-entry-season').textContent=entry.season;
 $('journal-entry-friend').textContent='Friendship thread: '+entry.friend;
 $('journal-entry-wish').textContent='Recurring wish: '+entry.theme;
 const shared=selection.sharedDate;
 $('journal-share').textContent=shared===day?'Withdraw this entry':shared?'Share this entry instead':'Share this entry';
 $('journal-withdraw').hidden=!shared||shared===day;
 $('journal-share-status').textContent=shared?'Shared in the fictional story: '+shared+'. One daily entry per bear.':'Private to this fictional Pensieve. Reading does not share it.';
 syncSelectors();renderCalendar();
}
for(let y=Number(range.end.slice(0,4));y>=Number(range.start.slice(0,4));y--){const o=elem('option',String(y));o.value=String(y);$('journal-year').append(o)}
months.forEach((m,i)=>{const o=elem('option',m);o.value=String(i+1);$('journal-month').append(o)});
$('journal-date').min=range.start;$('journal-date').max=range.end;
$('journal-date').addEventListener('change',()=>{const next=$('journal-date').value;if(withinArchive(next,range))setDay(next);else $('journal-date').value=day});
$('journal-year').addEventListener('change',()=>{
 const y=Number($('journal-year').value),current=Number($('journal-month').value);
 const available=Array.from({length:12},(_,i)=>i+1).filter(m=>monthDays(y,m,range).length);
 const m=available.reduce((best,v)=>Math.abs(v-current)<Math.abs(best-current)?v:best,available[0]);chooseMonth(y,m);
});
$('journal-month').addEventListener('change',()=>chooseMonth(Number($('journal-year').value),Number($('journal-month').value)));
$('journal-previous').addEventListener('click',()=>moveDay(-1));$('journal-next').addEventListener('click',()=>moveDay(1));
$('journal-today').addEventListener('click',()=>setDay(range.end));
$('journal-random').addEventListener('click',()=>setDay(shiftDay(range.start,Math.floor(Math.random()*range.count))));
$('journal-share').addEventListener('click',()=>{if(selection.sharedDate===day)game.setJournalShare(selection.index,null);else game.setJournalShare(selection.index,journalEntry(selection.name,day))});
$('journal-withdraw').addEventListener('click',()=>game.setJournalShare(selection.index,null));
document.addEventListener('rainbow:journal-selection',e=>{
 const next=e.detail;
 if(next.name!==selection.name||next.sharedDate!==selection.sharedDate){selection=next;render()}
 else selection=next;
});
document.addEventListener('rainbow:journal-open',e=>{setDay(e.detail.date);$('journal-archive').scrollIntoView({block:'start',behavior:'instant'})});
document.addEventListener('rainbow:journal-reset',()=>{selection=game.journalSelection();setDay(range.end)});
render();
