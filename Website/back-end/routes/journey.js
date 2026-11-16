/* Route requests through the server so the ORS key is never exposed in the browser.
 * Why: keep the ORS key on the server and return real GeoJSON only.
 * Official API (2026): https://api.heigit.org/openrouteservice/v2/
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
const router = Router();
const throttle = rateLimit({ windowMs: 15 * 60 * 1000, limit: 35, standardHeaders: 'draft-7', legacyHeaders: false, message: {error:'Too many requests. Try again later.'}});
function validPoint(p) {return Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=-0.6&&p[0]<=0.4&&p[1]>=51.2&&p[1]<=51.75;}
function safeFailure(res,status,message){return res.status(status).json({error:message});}
router.get('/journey/status',(_req,res)=>res.json({routingConfigured:!!process.env.ORS_API_KEY}));
router.get('/journey/search',throttle,async(req,res)=>{
  const q=String(req.query.q||'').trim();
  if(q.length<3||q.length>100)return safeFailure(res,400,'Enter at least 3 characters.');
  if(!process.env.ORS_API_KEY)return safeFailure(res,503,'Location search needs an openrouteservice API key. You can also choose a point on the map.');
  try{
    const u=new URL('https://api.heigit.org/pelias/v1/search');
    u.searchParams.set('text',q+', London');u.searchParams.set('boundary.country','GB');u.searchParams.set('size','5');
    const r=await fetch(u,{headers:{Authorization:process.env.ORS_API_KEY},signal:AbortSignal.timeout(12000)});
    if(!r.ok)return safeFailure(res,502,'Location search is temporarily unavailable. Choose a point on the map instead.');
    const data=await r.json();
    const results=(data.features||[]).filter(f=>validPoint(f.geometry?.coordinates)).map(f=>({name:String(f.properties?.label||f.properties?.name||'London place').slice(0,140),coordinates:f.geometry.coordinates}));
    res.json({results});
  }catch(e){console.error('Geocoding failed:',e.message);safeFailure(res,502,'Location search failed. Choose a point on the map instead.');}
});
router.post('/journey/route',throttle,async(req,res)=>{
  const {start,end,mode}=req.body||{};
  if(!validPoint(start)||!validPoint(end)||!['wheelchair','foot-walking'].includes(mode))return safeFailure(res,400,'Choose valid start and destination points in London.');
  if(!process.env.ORS_API_KEY)return safeFailure(res,503,'Route checking is not configured. Add ORS_API_KEY on the server.');
  try{
    const r=await fetch(`https://api.heigit.org/openrouteservice/v2/directions/${mode}/geojson`,{method:'POST',headers:{Authorization:process.env.ORS_API_KEY,'Content-Type':'application/json','Accept':'application/geo+json'},body:JSON.stringify({coordinates:[start,end]}),signal:AbortSignal.timeout(22000)});
    if(!r.ok){console.error('Routing service status:',r.status);return safeFailure(res,r.status===429?429:502,r.status===429?'Route service is busy. Please try again shortly.':'No route could be calculated for these locations.');}
    const data=await r.json();const f=data.features?.[0];
    if(!f||f.geometry?.type!=='LineString'||!Array.isArray(f.geometry.coordinates)||f.geometry.coordinates.length<2||f.geometry.coordinates.length>15000)return safeFailure(res,502,'The routing service did not return a usable route.');
    const summary=f.properties?.summary||{};
    res.json({type:'FeatureCollection',features:[{type:'Feature',properties:{distance:Number(summary.distance)||null,duration:Number(summary.duration)||null},geometry:f.geometry}],profile:mode});
  }catch(e){console.error('Route request failed:',e.message);safeFailure(res,502,'The routing service could not be reached. Your selected locations are still saved.');}
});
export default router;
