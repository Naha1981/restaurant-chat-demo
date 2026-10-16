const http=require('http'),fs=require('fs');
const KEY=process.env.GEMINI_API_KEY;const MODEL=process.env.GEMINI_MODEL||'gemini-3.8-flash';
const T=JSON.parse(fs.readFileSync(__dirname+'/tenants.json','utf8'));
const HITS=[];
function sys(t){return `You are the instant enquiry assistant for ${t.name}, a restaurant or cafe in Johannesburg. This is a DEMO built by NahaLabs from the public website ${t.site}, so the owner can see how guest enquiries could be answered at any hour. It is not live and not connected to their bookings.
Use ONLY the venue facts below. If something is not in them (prices, availability, allergens, specials), say you do not have it and that the team will confirm. Never invent hours, prices or availability. Never claim a booking is made; say the details are noted and the team will confirm.
- Reply in short, friendly, plain messages (1-3 sentences). One question at a time.
- For a booking ask: date, time, number of guests, name, phone number. For function or event enquiries ask: date, guest count, type of event, name, phone.
- When you have the details, give a short summary: SUMMARY FOR ${t.name.toUpperCase()}: need | date/time | guests | name | phone | notes
- Stay on topic and steer back politely.
VENUE FACTS (from their public site):
${t.k}`}
function page(slug,t){return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t.name} - enquiry assistant demo</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#111;color:#eee;display:flex;flex-direction:column;height:100vh;height:100dvh}
header{background:#1d1d1d;padding:12px 16px}header b{display:block}header small{color:#9a9a9a}
#log{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
.m{max-width:82%;padding:9px 12px;border-radius:10px;white-space:pre-wrap;line-height:1.35}.u{align-self:flex-end;background:#2f6f4f}.b{align-self:flex-start;background:#242424}
form{display:flex;gap:8px;padding:10px;background:#1d1d1d}input{flex:1;padding:12px;border-radius:20px;border:0;background:#2c2c2c;color:#eee;font-size:16px}button{border:0;border-radius:20px;padding:0 18px;background:#2f6f4f;color:#fff;font-size:16px}
.note{background:#181818;color:#9a9a9a;font-size:12px;padding:6px 12px;text-align:center}</style></head><body>
<header><b>${t.name}</b><small>Guest enquiry assistant - demo by NahaLabs</small></header>
<div class="note">Demo, not live. Pretend you are a guest. The first reply can take up to a minute while the free server wakes up, then it is fast.</div>
<div id="log"></div><form id="f"><input id="t" placeholder="Type a message" autocomplete="off"><button>Send</button></form>
<script>const log=document.getElementById('log'),t=document.getElementById('t');let hist=[];
function add(c,x){const d=document.createElement('div');d.className='m '+c;d.textContent=x;log.appendChild(d);log.scrollTop=log.scrollHeight;return d}
add('b','Hi, thanks for contacting ${t.name.replace(/'/g,"")}. Would you like to book a table, ask about our menu or hours, or enquire about an event?');
document.getElementById('f').onsubmit=async e=>{e.preventDefault();const v=t.value.trim();if(!v)return;t.value='';add('u',v);hist.push({role:'user',content:v});const w=add('b','...');
try{const r=await fetch('/api/chat/${slug}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:hist})});const j=await r.json();w.textContent=j.reply||'Sorry, something went wrong.';hist.push({role:'assistant',content:j.reply||''})}catch(_){w.textContent='Sorry, something went wrong.'}};
</script></body></html>`}
http.createServer(async(req,res)=>{
 if(req.url==='/health'){res.writeHead(200);return res.end('ok')}
 if(req.method==='GET'&&req.url.startsWith('/stats')){const ok=req.url.includes('k='+process.env.STATS_KEY);res.writeHead(ok?200:404,{'Content-Type':'application/json'});return res.end(ok?JSON.stringify(HITS.slice(-200)):'{}')}
 let m=req.url.match(/^\/api\/chat\/([a-z0-9-]+)$/);
 if(req.method==='POST'&&m&&T[m[1]]){const t=T[m[1]];let b='';req.on('data',c=>b+=c);req.on('end',async()=>{try{
  const {messages}=JSON.parse(b);HITS.push({t:new Date().toISOString(),b:m[1],chat:messages.length,last:String(messages[messages.length-1].content).slice(0,80)});
  const msgs=[{role:'system',content:sys(t)},...messages.slice(-20).map(x=>({role:x.role==='assistant'?'assistant':'user',content:String(x.content).slice(0,1000)}))];
  let reply=null;const chain=[MODEL,'gemini-3.5-flash','gemini-3.6-flash','gemini-3.1-flash-lite'];
  for(let i=0;i<6&&!reply;i++){try{const r=await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',{method:'POST',signal:AbortSignal.timeout(9000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+KEY},body:JSON.stringify({model:chain[i%chain.length],messages:msgs})});const j=await r.json();reply=j.choices&&j.choices[0]&&j.choices[0].message.content}catch(_){}}
  if(!reply)reply='Sorry, I am slow to answer right now. Would you like to book a table or ask about the menu?';
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({reply}))}catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end('{"reply":null}')}});return}
 m=req.url.match(/^\/c\/([a-z0-9-]+)/);
 if(req.method==='GET'&&m&&T[m[1]]){HITS.push({t:new Date().toISOString(),p:req.url.slice(0,80),ua:String(req.headers['user-agent']||'').slice(0,90)});res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(page(m[1],T[m[1]]))}
 res.writeHead(404);res.end('Not found')
}).listen(process.env.PORT||3000);
