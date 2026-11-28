import {test,expect} from 'bun:test';
import {client,setup} from './helpers.js';

const draft=title=>({title,brief:'Compare alternative scenarios with evidence.',agentCount:100,maxConcurrent:2});
const get=(rt,browser,token)=>rt.app(new Request('http://localhost/api/research/rooms',{
  headers:{...(browser?{cookie:browser.cookie}:{}),...(token?{'x-helios-access-token':token}:{})},
}));
const userA={id:'11111111-1111-4111-8111-111111111111'},userB={id:'22222222-2222-4222-8222-222222222222'};
const mockAuth=async(url,init)=>new Headers(init.headers).get('authorization')==='Bearer user-a'?Response.json(userA):new Headers(init.headers).get('authorization')==='Bearer user-b'?Response.json(userB):Response.json({error:'Invalid'},{status:401});

test('room listing exposes only rooms owned or contributed to by the requesting browser session',async()=>{
  const rt=await setup();
  try {
    const alice=await client(rt),bob=await client(rt),visitor=await client(rt);
    const owned=await (await alice.post('/api/research/rooms',draft('Alice room'))).json();
    const contributed=await (await bob.post('/api/research/rooms',draft('Bob collaboration'))).json();
    await bob.post('/api/research/rooms',draft('Bob separate room'));
    const note=await alice.post(`/api/research/rooms/${contributed.room.id}/contributions`,{frameId:contributed.frames[0].id,text:'Check the local baseline.'});
    expect(note.status).toBe(201);
    const mine=await (await get(rt,alice)).json();
    expect(mine.rooms.map(r=>r.id).sort()).toEqual([owned.room.id,contributed.room.id].sort());
    expect(mine.rooms.find(r=>r.id===owned.room.id).canSupervise).toBe(true);
    expect(mine.rooms.find(r=>r.id===contributed.room.id).canSupervise).toBe(false);
    expect(mine).toMatchObject({scope:'browser',limit:30});
    expect(JSON.stringify(mine)).not.toContain('actor');
    expect(JSON.stringify(mine)).not.toContain(alice.cookie.split('=')[1]);
    expect((await (await get(rt,visitor)).json()).rooms).toEqual([]);
    expect((await (await get(rt)).json()).rooms).toEqual([]);
    const attempted=await rt.app(new Request(`http://localhost/api/research/rooms?actor=${encodeURIComponent(alice.cookie)}`,{headers:{cookie:visitor.cookie}}));
    expect((await attempted.json()).rooms).toEqual([]);
  } finally {await rt.store.close();}
});

test('verified account rooms reconnect on another session without merging earlier guest activity',async()=>{
  const rt=await setup({accountFetch:mockAuth});
  try {
    const first=await client(rt),second=await client(rt),other=await client(rt);
    const guest=await (await first.post('/api/research/rooms',draft('Earlier guest room'))).json();
    const account=await (await first.post('/api/research/rooms',draft('Signed-in room'),{'x-helios-access-token':'user-a'})).json();
    const recovered=await (await get(rt,second,'user-a')).json();
    expect(recovered.scope).toBe('account');
    expect(recovered.rooms.map(r=>r.id)).toEqual([account.room.id]);
    expect((await (await get(rt,other,'user-b')).json()).rooms).toEqual([]);
    expect((await (await get(rt,first)).json()).rooms.map(r=>r.id)).toEqual([guest.room.id]);
    expect((await get(rt,first,'invalid')).status).toBe(401);
  }finally{await rt.store.close();}
});

test('room listing is bounded to 30 recent records and excludes private input fields',async()=>{
  const rt=await setup();
  try {
    for(let i=0;i<31;i++)await rt.db.transaction(q=>rt.store.research.createIn(q,{...draft('Room '+i),inputData:'Private input field',frames:[{title:'Now',year:2026,summary:'',assumptions:'',laws:[]}]},'test-owner'));
    const list=await rt.store.research.listRooms('test-owner');
    expect(list.rooms).toHaveLength(30);
    for(const room of list.rooms)expect(Object.keys(room).sort()).toEqual(['canSupervise','id','paused','title','updatedAt'].sort());
    expect(JSON.stringify(list)).not.toContain('Private input field');
    expect(JSON.stringify(list)).not.toContain('test-owner');
  }finally{await rt.store.close();}
});
