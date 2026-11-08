import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../app/chatgpt-auth';
import placeData from './place-index.json';
import { validateObservation, feedState } from './access-validation.mjs';
import { fetchLiftFeed, nextRetryAt } from './tfl-feed.mjs';
const index=placeData as Record<string,[string,string,string?]>;
function recordTypes(rows:Record<string,unknown>[]){return rows.map(row=>({...row,record_type:index[String(row.place_id)]?.[2]||'place'}));}
const publicFields='o.id,o.place_id,o.borough_code,o.place_name,o.attribute,o.value,o.scope,o.observed_at,o.evidence_url,o.notes,o.created_at';
const lastReview='LEFT JOIN observation_reviews r ON r.id=(SELECT MAX(r2.id) FROM observation_reviews r2 WHERE r2.observation_id=o.id)';
function db(){if(!env.DB)throw new Error('Shared storage is temporarily unavailable.');return env.DB;}
export function response(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
function fail(message:string,status=400){return response({error:message},status);}
function canReview(user:{email:string}|null){const emails=(env.REVIEWER_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);return !!user&&emails.includes(user.email.toLowerCase());}
async function readBody(request:Request){
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new Error('Use the form on this website.');
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('JSON input is required.');
  if(Number(request.headers.get('content-length')||0)>16384)throw new Error('Submission is too large.');
  const text=await request.text();if(text.length>16384)throw new Error('Submission is too large.');return JSON.parse(text);
}
export async function session(){const user=await getChatGPTUser();return response({signed_in:!!user,display_name:user?.displayName??null,can_review:canReview(user)});}
export async function observations(request:Request){
  const url=new URL(request.url);const user=await getChatGPTUser();
  try{
    if(request.method==='GET'){
      if(url.searchParams.get('mine')==='1'){
        if(!user)return fail('Sign in to view your submissions.',401);
        const rows=await db().prepare(`SELECT ${publicFields},COALESCE(r.decision,'pending') AS review_status,r.reason AS review_reason FROM observations o ${lastReview} WHERE o.contributor_id=? ORDER BY o.created_at DESC LIMIT 100`).bind(user.userId).all();return response({records:recordTypes(rows.results)});
      }
      const place=url.searchParams.get('place_id');if(place&&!index[place])return fail('Unknown place.',404);
      const rows=await db().prepare(`SELECT ${publicFields},r.created_at AS reviewed_at FROM observations o ${lastReview} WHERE r.decision='approved' ${place?'AND o.place_id=?':''} ORDER BY o.observed_at DESC LIMIT 100`).bind(...(place?[place]:[])).all();return response({records:recordTypes(rows.results)});
    }
    if(!user)return fail('Sign in before submitting an observation.',401);
    const row=validateObservation(await readBody(request),index);
    const created=new Date().toISOString(),cutoff=new Date(Date.now()-86400000).toISOString(),id=crypto.randomUUID();
    const result=await db().prepare('INSERT INTO observations (id,place_id,borough_code,place_name,attribute,value,scope,observed_at,evidence_url,notes,contributor_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM observations WHERE contributor_id=? AND created_at>?)<20').bind(id,row.place_id,row.borough_code,row.place_name,row.attribute,row.value,row.scope,row.observed_at,row.evidence_url,row.notes,user.userId,created,user.userId,cutoff).run();
    if(!result.meta.changes)return fail('You have reached the limit of 20 submissions per day. Please return tomorrow.',429);
    return response({id,review_status:'pending',message:'Stored for review. It is not public yet.'},201);
  }catch(error){console.error('Observation request failed',error instanceof Error?error.message:'unknown');return fail(error instanceof Error?error.message:'The observation could not be processed.',400);}
}
export async function reviews(request:Request){
  const user=await getChatGPTUser();if(!user)return fail('Sign in to review observations.',401);if(!canReview(user))return fail('Reviewer access is required.',403);
  try{
    if(request.method==='GET'){
      const status=new URL(request.url).searchParams.get('status')||'pending';if(!['pending','approved','rejected','needs_changes'].includes(status))return fail('Invalid review status.');
      const rows=await db().prepare(`SELECT ${publicFields},COALESCE(r.decision,'pending') AS review_status,r.reason AS review_reason,CASE WHEN o.contributor_id=? THEN 1 ELSE 0 END AS is_own FROM observations o ${lastReview} WHERE COALESCE(r.decision,'pending')=? ORDER BY o.created_at DESC LIMIT 100`).bind(user.userId,status).all();return response({records:recordTypes(rows.results)});
    }
    const body=await readBody(request);
    if(!body||typeof body.observation_id!=='string'||!['approved','rejected','needs_changes'].includes(body.decision)||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)return fail('Provide a decision and a short reason.');
    const row=await db().prepare('SELECT contributor_id FROM observations WHERE id=?').bind(body.observation_id).first<{contributor_id:string}>();
    if(!row)return fail('Observation not found.',404);if(row.contributor_id===user.userId)return fail('Another reviewer must review your own observation.',403);
    await db().prepare('INSERT INTO observation_reviews (observation_id,reviewer_id,decision,reason,created_at) VALUES (?,?,?,?,?)').bind(body.observation_id,user.userId,body.decision,body.reason.trim(),new Date().toISOString()).run();return response({review_status:body.decision});
  }catch(error){return fail(error instanceof Error?error.message:'Review failed.');}
}
export async function liftDisruptions(){
  let cached:{payload:string;fetched_at:string}|null=null;let refreshFailed=false;
  let retry:{next_retry_at:string;upstream_status:number|null}|null=null;
  try{cached=await db().prepare('SELECT payload,fetched_at FROM feed_cache WHERE key=?').bind('tfl-lifts').first();}catch{}
  try{const saved=await db().prepare('SELECT payload FROM feed_cache WHERE key=?').bind('tfl-lifts-retry').first<{payload:string}>();if(saved)retry=JSON.parse(saved.payload);}catch{}
  const backingOff=!!retry&&Date.parse(retry.next_retry_at)>Date.now();
  if(backingOff)refreshFailed=true;
  if(!backingOff&&(!cached||feedState(cached.fetched_at)==='unavailable'||Date.now()-Date.parse(cached.fetched_at)>120000)){
    try{
      const records=await fetchLiftFeed({appKey:env.TFL_APP_KEY});cached={payload:JSON.stringify(records),fetched_at:new Date().toISOString()};
      try{await db().prepare('INSERT INTO feed_cache (key,payload,fetched_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind('tfl-lifts',cached.payload,cached.fetched_at).run();}catch{}
      retry=null;try{await db().prepare('DELETE FROM feed_cache WHERE key=?').bind('tfl-lifts-retry').run();}catch{}
    }catch(error){
      refreshFailed=true;console.error('TfL lift refresh failed:',error instanceof Error?error.message:'unknown');
      retry={next_retry_at:nextRetryAt(error),upstream_status:(error as {status?:number})?.status??null};
      try{await db().prepare('INSERT INTO feed_cache (key,payload,fetched_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind('tfl-lifts-retry',JSON.stringify(retry),new Date().toISOString()).run();}catch{}
    }
  }
  const status=cached?feedState(cached.fetched_at):'unavailable';
  return response({status,refresh_failed:refreshFailed,proxy_retry_at:retry?.next_retry_at??null,upstream_status:retry?.upstream_status??null,transport:'server_proxy',retrieved_at:cached?.fetched_at??null,expires_at:cached?new Date(Date.parse(cached.fetched_at)+900000).toISOString():null,records:status==='fresh'&&cached?JSON.parse(cached.payload):[],message:status==='fresh'?(refreshFailed?'Showing recent cached data; the latest refresh failed.':'Latest TfL lift-disruption feed. No reported disruption does not confirm a working lift.'):'Current lift status is unavailable from the server proxy. The website will try the official feed directly.',source_url:'https://api.tfl.gov.uk/Disruptions/Lifts/',attribution:'Powered by TfL Open Data'},status==='unavailable'?503:200);
}
