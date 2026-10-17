const http=require('http'),fs=require('fs');
const KEY=process.env.GEMINI_API_KEY,MODEL=process.env.GEMINI_MODEL||'gemini-3.8-flash';
const RESEND=process.env.RESEND_API_KEY,LEAD_TO=process.env.LEAD_TO||'ai-solutions@nahalabs.co.za',ADMIN=process.env.ADMIN_KEY||'';
const L=JSON.parse(fs.readFileSync(__dirname+'/listings.json','utf8')),TEAM=JSON.parse(fs.readFileSync(__dirname+'/team.json','utf8')),KB=JSON.parse(fs.readFileSync(__dirname+'/kb.json','utf8'));
const HTML=fs.readFileSync(__dirname+'/index.html','utf8');
const LEADS=[],HITS=[],RL={};
const SYSTEM=`You are the enquiry assistant for NestHaven Properties, a Gauteng estate agency based in Ruimsig, Roodepoort, Johannesburg. You are an AI assistant run by NahaLabs on NestHaven's behalf. You answer buyer, seller, landlord and tenant enquiries at any hour, using ONLY the facts below, which come from NestHaven's public website.
Rules:
- Short, warm, plain replies (1-3 sentences). One question at a time. Write like a helpful person at the agency, in South African English.
- Never invent prices, listings, availability, hours, fees, commission, bond rates, agent availability or promises. Listing prices and status are as shown on the website and the team confirms them. If a fact is not below, say you do not have it and that the team will confirm.
- You cannot book anything. For a viewing, valuation, rental enquiry or call back, collect: name, phone number, what they need, the listing reference or area, preferred day and time. Then tell them to press "Send to the team" (the Request tab) or to use the form: you cannot send it yourself. Never say a viewing is booked. Say the team confirms.
- Office visits are by appointment only. Opening hours are not published, so do not state any.
- Valuations: request, an agent visits the property, a valuation report follows within 24 hours of the visit (as described on the website). No commitment.
- When someone asks for a human, give the direct lines: Skhumbuzo Masilela +27 73 997 5343 (also the office line), Thully Masilela +27 78 603 0977 (WhatsApp number on the contact page), info@nesthaven.co.za.
- When recommending listings, give the reference, price, suburb, bedrooms and bathrooms from the list. Say the team confirms availability. Never describe features that are not listed.
- Do not give legal, tax or financial advice. Stay on property topics at NestHaven. Be honest that you are an AI assistant if asked.
- POPIA: do not ask for ID numbers or financial details in chat.
ABOUT\n${KB.about}\n\nSERVICES\n${KB.services}\n\nVALUATION PROCESS\n${KB.valuation}\n\nCONTACT\n${KB.contact}\nAddress: Ruimsig, Roodepoort, Johannesburg. Office visits by appointment. Office phone +27 73 997 5343, email info@nesthaven.co.za. PPRA registered, FFC No. 202615011670000. Commercial: no commercial properties currently listed; off-market commercial can be discussed with the team.
TEAM (public site)\n${TEAM.map(t=>`${t.name} - ${t.role} - ${t.phone}`).join('\n')}
LISTINGS as shown on the website (${L.length} total)\n${L.map(l=>`ref ${l.ref} | ${l.kind==='rent'?'TO LET':'FOR SALE'} | ${l.price}${l.kind==='rent'?'' :''} | ${l.title} | ${l.location} | ${l.details||'no bedroom data'} | agent ${l.agent||'not shown'}`).join('\n')}`;
function ip(req){return (req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim()}
function limited(req,n,win){const k=ip(req)+req.url.split('?')[0],now=Date.now();(RL[k]=(RL[k]||[]).filter(t=>now-t<win)).push(now);return RL[k].length>n}
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function body(req,max=20000){return new Promise((ok,no)=>{let b='';req.on('data',c=>{b+=c;if(b.length>max){no(new Error('big'));req.destroy()}});req.on('end',()=>ok(b))})}
async function gemini(msgs){const chain=[MODEL,'gemini-3.5-flash','gemini-3.6-flash','gemini-3.1-flash-lite'];
 for(let i=0;i<6;i++){try{const r=await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',{method:'POST',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+KEY},body:JSON.stringify({model:chain[i%chain.length],messages:msgs})});const j=await r.json();const t=j.choices&&j.choices[0]&&j.choices[0].message.content;if(t)return t}catch(_){}}return null}
async function revup(l){const K=process.env.REVUP_KEY;if(!K)return {ok:false,why:'no key'};try{const c=new AbortController();const t=setTimeout(()=>c.abort(),15000);const r=await fetch('https://nahalabs-growth.onrender.com/api/v1/responder/enquiries',{method:'POST',signal:c.signal,headers:{Authorization:'Bearer '+K,'Content-Type':'application/json'},body:JSON.stringify({enquiry:`${l.type}: ${l.message||'(no message)'} | Name: ${l.name} | Phone: ${l.phone}${l.ref?' | Ref: '+l.ref:''}`})});clearTimeout(t);const j=await r.json().catch(()=>({}));return {ok:r.ok,status:r.status,body:JSON.stringify(j).slice(0,600)}}catch(e){return {ok:false,why:String(e).slice(0,100)}}}
async function mail(subject,text){if(!RESEND)return {ok:false,why:'no key'};try{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+RESEND,'Content-Type':'application/json'},body:JSON.stringify({from:'NestHaven Enquiries via NahaLabs <ai-solutions@nahalabs.co.za>',to:[LEAD_TO],subject,text})});const j=await r.json();return {ok:r.ok,id:j.id,why:r.ok?'':JSON.stringify(j).slice(0,200)}}catch(e){return {ok:false,why:String(e).slice(0,100)}}}
const TYPES=['Viewing request','Valuation request','Rental enquiry','Buying or selling enquiry','Call back request','Other'];
const handler=async(req,res)=>{
 const u=req.url.split('?')[0];
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST'});return res.end()}
 res.setHeader('Access-Control-Allow-Origin','*');
 const J=(c,o)=>{res.writeHead(c,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(o))};
 try{
 if(u==='/health'){res.writeHead(200);return res.end('ok')}
 if(u==='/api/listings'&&req.method==='GET'){return J(200,{updated:'16 Oct 2026',source:'https://www.nesthaven.co.za',listings:L})}
 if(u==='/api/chat'&&req.method==='POST'){
  if(limited(req,30,600000))return J(429,{reply:'You are sending messages quickly. Please wait a moment, or call the team on +27 73 997 5343.'});
  const {messages}=JSON.parse(await body(req));if(!Array.isArray(messages)||!messages.length)return J(400,{reply:null});
  HITS.push({t:new Date().toISOString(),chat:messages.length});
  const msgs=[{role:'system',content:SYSTEM},...messages.slice(-16).map(m=>({role:m.role==='assistant'?'assistant':'user',content:String(m.content).slice(0,800)}))];
  const reply=await gemini(msgs)||'I am slow to answer right now. You can send your details with the Request tab, or call the team on +27 73 997 5343.';
  return J(200,{reply})}
 if(u==='/api/lead'&&req.method==='POST'){
  if(limited(req,6,3600000))return J(429,{ok:false,error:'Too many requests. Please call +27 73 997 5343.'});
  const d=JSON.parse(await body(req,8000));
  if(d.website)return J(200,{ok:true});
  const name=String(d.name||'').trim().slice(0,80),phone=String(d.phone||'').trim().slice(0,30),email=String(d.email||'').trim().slice(0,120);
  const type=TYPES.includes(d.type)?d.type:'Other',ref=String(d.ref||'').trim().slice(0,40),when=String(d.when||'').trim().slice(0,120),msg=String(d.message||'').trim().slice(0,1000),wa=!!d.whatsapp;
  if(name.length<2)return J(400,{ok:false,error:'Please enter your name.'});
  if(!/^[+0-9 ()-]{9,20}$/.test(phone))return J(400,{ok:false,error:'Please enter a valid phone number.'});
  if(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return J(400,{ok:false,error:'That email address does not look right.'});
  if(!d.consent)return J(400,{ok:false,error:'Please tick the consent box so the team can contact you.'});
  const lead={id:'L'+Date.now().toString(36),t:new Date().toISOString(),name,phone,email,type,ref,when,message:msg,whatsapp:wa,test:!!d.test};
  const txt=`New enquiry from the NestHaven enquiry assistant${lead.test?' (TEST ENTRY)':''}\n\nType: ${type}\nName: ${name}\nPhone: ${phone}${wa?' (OK to contact on WhatsApp)':''}\nEmail: ${email||'not given'}\nListing / area: ${ref||'not given'}\nPreferred time: ${when||'not given'}\nMessage: ${msg||'none'}\nReceived: ${lead.t}\nLead ID: ${lead.id}\n\nThe person consented under POPIA to be contacted about this enquiry. Nothing has been booked. Please confirm directly with them.`;
  const m=await mail(`[NestHaven enquiry]${lead.test?' TEST -':''} ${type} - ${name}`,txt);lead.emailed=m.ok;try{lead.revup=await revup(lead);console.log('REVUP '+lead.id+' ok='+lead.revup.ok+' '+(lead.revup.status||lead.revup.why||''))}catch(e){};lead.emailId=m.id;LEADS.push(lead);console.log('LEAD '+lead.id+' emailed='+m.ok+' '+(m.why||m.id||''));
  return J(200,{ok:true,emailed:m.ok,id:lead.id})}
 if(u==='/admin'){const k=new URL(req.url,'http://x').searchParams.get('k');if(!ADMIN||k!==ADMIN){res.writeHead(404);return res.end('Not found')}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end('<meta name=viewport content="width=device-width"><body style="font-family:system-ui;padding:16px"><h3>Leads since last restart ('+LEADS.length+')</h3>'+LEADS.slice().reverse().map(l=>'<p><b>'+esc(l.type)+'</b> '+esc(l.name)+' '+esc(l.phone)+' '+esc(l.email)+'<br>'+esc(l.ref)+' | '+esc(l.when)+' | '+esc(l.message)+'<br><small>'+l.t+' '+l.id+' emailed='+l.emailed+(l.test?' TEST':'')+'</small></p>').join(''))}
 if(req.method==='GET'&&(u==='/'||u==='/index.html')){HITS.push({t:new Date().toISOString(),p:'/',ua:String(req.headers['user-agent']||'').slice(0,90)});res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(HTML)}
 res.writeHead(404);res.end('Not found')
 }catch(e){J(400,{ok:false,reply:null,error:'Something went wrong.'})}
};
if(require.main===module)http.createServer(handler).listen(process.env.PORT||3000);
module.exports=handler;
