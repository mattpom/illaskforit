import articles from './articles.json' with { type: 'json' };
import { adminHTML, adminScript, adminCSS } from './admin.mjs';
const articleSet = new Set(articles);
const origins = new Set(['https://illaskforit.com', 'https://www.illaskforit.com']);
const enc = new TextEncoder();
const cookieName = '__Host-iafi-moderator';
const security = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000',
};
function response(data, status = 200, headers = {}) {
  return new Response(status===204?null:JSON.stringify(data), { status, headers: { ...security, ...headers } });
}
function bytes64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
async function key(secret) { return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
async function sign(secret, payload) { return bytes64(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(payload))); }
async function verify(secret, token) {
  try {
    const [payload, signature, extra] = token.split('.');
    if (extra || !payload || !signature || !/^[A-Za-z0-9_-]+$/.test(signature)) return null;
    const raw = Uint8Array.from(atob(signature.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));
    if (!(await crypto.subtle.verify('HMAC', await key(secret), raw, enc.encode(payload)))) return null;
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload), c => c.charCodeAt(0))));
  } catch { return null; }
}
async function token(secret, data) { const p = btoa(JSON.stringify(data)); return `${p}.${await sign(secret,p)}`; }
async function sameSecret(a,b) { return await sign(b,a) === await sign(b,b); }
async function json(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Use a JSON request.');
  if (Number(request.headers.get('content-length') || 0) > 16000) throw new Error('Submission is too long.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing submission.');
  let size = 0; const chunks = [];
  for (;;) { const {done,value} = await reader.read(); if(done) break; size += value.length; if(size>16000) { await reader.cancel(); throw new Error('Submission is too long.'); } chunks.push(value); }
  const all = new Uint8Array(size); let offset=0; for(const c of chunks) { all.set(c,offset); offset+=c.length; }
  const value = JSON.parse(new TextDecoder().decode(all));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid submission.');
  return value;
}
async function limit(env, name, maximum, period, now, ip) {
  // Only a short-lived keyed digest is stored, never a raw IP address.
  const digest = await sign(env.ADMIN_KEY, `${Math.floor(now/period)}:${ip}`);
  const id = `${name}:${Math.floor(now/period)}:${digest}`;
  const row = await env.DB.prepare('INSERT INTO limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(id, now+period*2).first();
  return row.count <= maximum;
}
async function authenticated(request, env, now) {
  const raw = request.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  const data = raw && await verify(env.ADMIN_KEY,raw);
  return data?.kind === 'moderator' && data.expires > now && data.expires <= now+28800;
}
async function handle(request,env) {
  const url = new URL(request.url), now = Math.floor(Date.now()/1000);
  const origin = request.headers.get('origin');
  const ownOrigin = url.origin;
  const publicPath = ['/comments','/challenge'].includes(url.pathname);
  if (request.method==='OPTIONS') {
    if (!publicPath || !origins.has(origin)) return response({error:'Not allowed.'},403);
    return response(null,204,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'});
  }
  if (!env.DB || typeof env.ADMIN_KEY!=='string' || env.ADMIN_KEY.length<32) return response({error:'Comments are temporarily unavailable.'},503);
  if (publicPath && origin && !origins.has(origin)) return response({error:'Not allowed.'},403);
  if (!publicPath && ['POST','PATCH','DELETE'].includes(request.method) && origin !== ownOrigin) return response({error:'Not allowed.'},403);
  if (publicPath && request.method==='POST' && !origins.has(origin)) return response({error:'Not allowed.'},403);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (url.pathname==='/challenge' && request.method==='GET') {
    const article = url.searchParams.get('article');
    if (!articleSet.has(article)) return response({error:'Unknown article.'},404);
    return response({challenge:await token(env.ADMIN_KEY,{kind:'comment',article,issued:now,nonce:crypto.randomUUID()})});
  }
  if (url.pathname==='/comments' && request.method==='GET') {
    const article=url.searchParams.get('article');
    if(!articleSet.has(article)) return response({error:'Unknown article.'},404);
    const cursor=Number(url.searchParams.get('offset') || 0);
    if(!Number.isSafeInteger(cursor) || cursor<0 || cursor>100000) return response({error:'Invalid page.'},400);
    const {results}=await env.DB.prepare("SELECT id,name,body,created_at FROM comments WHERE article=? AND status='approved' ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?").bind(article,cursor).all();
    const more=results.length>50; const comments=results.slice(0,50);
    return response({comments,next:more?cursor+50:null});
  }
  if (url.pathname==='/comments' && request.method==='POST') {
    if(!await limit(env,'post',5,3600,now,ip) || !await limit(env,'daily',500,86400,now,'site')) return response({error:'Too many submissions. Please try again later.'},429,{'Retry-After':'3600'});
    let data; try { data=await json(request); } catch { return response({error:'Invalid or oversized submission.'},400); }
    const {article,name,body,website,consent,challenge}=data;
    if(typeof website!=='string' || website.length || consent!==true || !articleSet.has(article) || typeof name!=='string' || typeof body!=='string' || name.trim().length<2 || name.trim().length>60 || body.trim().length<10 || body.trim().length>3000 || /[\x00-\x1f\x7f]/.test(name)) return response({error:'Use a display name (2–60 characters), a comment (10–3,000 characters), and check the approval notice.'},400);
    const proof=typeof challenge==='string' && await verify(env.ADMIN_KEY,challenge);
    if(!proof || proof.kind!=='comment' || proof.article!==article || typeof proof.issued!=='number' || now-proof.issued<5 || now-proof.issued>7200 || typeof proof.nonce!=='string') return response({error:'Please wait five seconds after loading the form, then try again. Refresh the page if it has been open for two hours.'},400);
    const id=crypto.randomUUID();
    const result=await env.DB.prepare("INSERT INTO comments(id,article,name,body,status,created_at,nonce) VALUES (?,?,?,?,'pending',?,?) ON CONFLICT(nonce) DO NOTHING").bind(id,article,name.trim(),body.trim(),now,proof.nonce).run();
    if(!result.meta.changes) return response({error:'This submission has already been received.'},409);
    return response({message:'Your comment was received and is waiting for approval. It is not public yet.'},201);
  }
  if(url.pathname==='/admin' && request.method==='GET') {
    return new Response(adminHTML,{headers:{...security,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
  }
  if(url.pathname==='/admin.js' && request.method==='GET') return new Response(adminScript,{headers:{...security,'Content-Type':'application/javascript; charset=utf-8'}});
  if(url.pathname==='/admin.css' && request.method==='GET') return new Response(adminCSS,{headers:{...security,'Content-Type':'text/css; charset=utf-8'}});
  if(url.pathname==='/admin/login' && request.method==='POST') {
    if(origin!==ownOrigin) return response({error:'Not allowed.'},403);
    if(!await limit(env,'login',10,900,now,ip)) return response({error:'Too many sign-in attempts. Try again in 15 minutes.'},429);
    let data; try{data=await json(request);}catch{return response({error:'Invalid request.'},400);}
    if(typeof data.key!=='string' || !await sameSecret(data.key,env.ADMIN_KEY)) return response({error:'Incorrect moderation key.'},401);
    const session=await token(env.ADMIN_KEY,{kind:'moderator',expires:now+28800});
    return response({ok:true},200,{'Set-Cookie':`${cookieName}=${session}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800`});
  }
  if(url.pathname.startsWith('/admin/')) {
    if(!await authenticated(request,env,now)) return response({error:'Sign in to moderate comments.'},401);
    if(request.method!=='GET' && origin!==ownOrigin) return response({error:'Not allowed.'},403);
    if(url.pathname==='/admin/logout' && request.method==='POST') return response({ok:true},200,{'Set-Cookie':`${cookieName}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`});
    if(url.pathname==='/admin/comments' && request.method==='GET') {
      const status=url.searchParams.get('status') || 'pending';
      if(!['pending','approved','rejected'].includes(status)) return response({error:'Invalid status.'},400);
      const offset=Number(url.searchParams.get('offset') || 0);
      if(!Number.isSafeInteger(offset)||offset<0||offset>100000) return response({error:'Invalid page.'},400);
      const {results}=await env.DB.prepare('SELECT id,article,name,body,status,created_at,moderated_at FROM comments WHERE status=? ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?').bind(status,offset).all();
      return response({comments:results.slice(0,50),next:results.length>50?offset+50:null});
    }
    if(url.pathname==='/admin/moderate' && request.method==='POST') {
      let data;try{data=await json(request);}catch{return response({error:'Invalid request.'},400);}
      if(!['pending','approved','rejected'].includes(data.status)||typeof data.id!=='string') return response({error:'Invalid decision.'},400);
      const row=await env.DB.prepare('UPDATE comments SET status=?,moderated_at=? WHERE id=? RETURNING id,status').bind(data.status,now,data.id).first();
      return row?response(row):response({error:'Comment not found.'},404);
    }
  }
  return response({error:'Not found.'},404);
}
export default {
  async fetch(request,env) {
    let result;
    try { result=await handle(request,env); }
    catch { result=response({error:'Comments are temporarily unavailable. Your text has not been cleared; please try again later.'},503); }
    const origin=request.headers.get('origin');
    if(origins.has(origin) && ['/comments','/challenge'].includes(new URL(request.url).pathname)) {
      result.headers.set('Access-Control-Allow-Origin',origin); result.headers.set('Vary','Origin');
    }
    return result;
  },
  async scheduled(event,env) {
    const now=Math.floor(Date.now()/1000);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM limits WHERE expires_at<?').bind(now),
      env.DB.prepare("DELETE FROM comments WHERE status IN ('pending','rejected') AND created_at<?").bind(now-90*86400),
    ]);
  },
};
