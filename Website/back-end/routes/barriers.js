/* Road barrier reports are separate from venue accessibility answers.
 * Upload is a small browser-compressed JPEG in JSON, avoiding a new multipart framework.
 * All reports start pending; photos are public only after review.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { db } from '../db.js';
const router=Router();
const limit=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many reports. Please try later.'}});
const TYPES=['blocked_pavement','uneven_surface','step_or_kerb','narrow_passage','other','unspecified'];
const point=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)&&x>=-0.6&&x<=0.4&&y>=51.2&&y<=51.75;
function reviewOK(req){const a=process.env.REVIEW_KEY||'';const b=String(req.get('X-Review-Key')||'');return a.length>=16&&b.length===a.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
router.get('/barriers',async(req,res)=>{
  const [rows]=await db.query("SELECT id, lon, lat, type, note, created_at, reviewed_at, photo_mime IS NOT NULL AS has_photo FROM barrier_reports WHERE status='approved' ORDER BY created_at DESC LIMIT 500");
  res.set('Cache-Control','no-store');res.json({reports:rows.map(r=>({...r,lon:Number(r.lon),lat:Number(r.lat),has_photo:!!r.has_photo}))});
});
router.post('/barriers',limit,async(req,res)=>{
  const {lon,lat,type,note='',photo=null}=req.body||{};
  if(!point(lon,lat))return res.status(400).json({error:'Choose an accurate location in London.'});
  if(!TYPES.includes(type))return res.status(400).json({error:'Choose a valid barrier type.'});
  if(typeof note!=='string'||note.length>400)return res.status(400).json({error:'Description is too long.'});
  let bytes=null;
  if(photo!==null){
    if(typeof photo!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo))return res.status(400).json({error:'Upload a valid JPEG photo.'});
    bytes=Buffer.from(photo.slice('data:image/jpeg;base64,'.length),'base64');
    if(bytes.length<100||bytes.length>900000||bytes[0]!==0xff||bytes[1]!==0xd8||bytes[bytes.length-2]!==0xff||bytes[bytes.length-1]!==0xd9)return res.status(400).json({error:'Photo must be a JPEG smaller than 900 KB.'});
  }
  const id=randomUUID();
  await db.query("INSERT INTO barrier_reports(id,lon,lat,type,note,photo_bytes,photo_mime,status,created_at) VALUES(?,?,?,?,?,?,?,'pending',UTC_TIMESTAMP())",[id,lon,lat,type,note.trim(),bytes,bytes?'image/jpeg':null]);
  res.status(201).json({id,status:'pending',message:'Report received. It will appear publicly after review.'});
});
router.get('/barriers/:id/photo',async(req,res)=>{
  if(!/^[0-9a-f-]{36}$/i.test(req.params.id))return res.status(404).end();
  const [[row]] = await db.query("SELECT photo_bytes FROM barrier_reports WHERE id=? AND status='approved'",[req.params.id]);
  if(!row?.photo_bytes)return res.status(404).end();
  res.set({'Content-Type':'image/jpeg','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'});res.send(row.photo_bytes);
});
router.get('/review/barriers',async(req,res)=>{
  if(!reviewOK(req))return res.status(403).json({error:'Reviewer access required.'});
  const [rows]=await db.query("SELECT id,lon,lat,type,note,created_at,photo_mime IS NOT NULL AS has_photo FROM barrier_reports WHERE status='pending' ORDER BY created_at LIMIT 100");
  res.json({reports:rows});
});
router.get('/review/barriers/:id/photo',async(req,res)=>{
  if(!reviewOK(req))return res.status(403).end();
  const [[row]]=await db.query("SELECT photo_bytes FROM barrier_reports WHERE id=? AND status='pending'",[req.params.id]);
  if(!row?.photo_bytes)return res.status(404).end();res.set({'Content-Type':'image/jpeg','Cache-Control':'no-store'}).send(row.photo_bytes);
});
router.post('/review/barriers/:id',async(req,res)=>{
  if(!reviewOK(req))return res.status(403).json({error:'Reviewer access required.'});
  if(!['approved','rejected'].includes(req.body?.decision))return res.status(400).json({error:'Choose approved or rejected.'});
  const [result]=await db.query("UPDATE barrier_reports SET status=?,reviewed_at=UTC_TIMESTAMP() WHERE id=? AND status='pending'",[req.body.decision,req.params.id]);
  if(!result.affectedRows)return res.status(404).json({error:'Pending report not found.'});res.json({status:req.body.decision});
});
export default router;
