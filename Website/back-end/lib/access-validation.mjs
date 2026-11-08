export const ATTRIBUTES={entrance_step_free:'Step-free entrance',lift_present:'Lift present',lift_operational:'Lift working',ramp_present:'Ramp present',toilet_wheelchair_accessible:'Wheelchair-accessible toilet',adult_changing_equipment_present:'Adult changing equipment'};
export const VALUES=['yes','no','partial','unknown'];
export function validateObservation(body,index,now=Date.now()){
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid observation.');
  for(const key of ['place_id','borough_code','attribute','value','scope','observed_at','evidence_url','notes'])if(typeof body[key]!=='string')throw new Error('Complete all observation fields.');
  const place=index[body.place_id];
  if(!place||place[0]!==body.borough_code)throw new Error('Select a place from the current map.');
  if(!Object.hasOwn(ATTRIBUTES,body.attribute)||!VALUES.includes(body.value))throw new Error('Choose a valid observation type and answer.');
  if(!body.scope.trim()||body.scope.length>300||body.notes.length>2000)throw new Error('Describe the specific entrance or floor (300 characters maximum). Notes may contain up to 2,000 characters.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(body.observed_at))throw new Error('Use a valid observation date.');
  const date=Date.parse(body.observed_at+'T00:00:00Z');
  if(!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==body.observed_at||date>now)throw new Error('Observation date must be valid and cannot be in the future.');
  let url;try{url=new URL(body.evidence_url);}catch{throw new Error('Add an evidence link.');}
  if(!['http:','https:'].includes(url.protocol)||body.evidence_url.length>2000)throw new Error('Evidence must use an http or https link.');
  return {place_id:body.place_id,borough_code:place[0],place_name:place[1],attribute:body.attribute,value:body.value,scope:body.scope.trim(),observed_at:body.observed_at,evidence_url:url.href,notes:body.notes.trim()};
}
export { validateLiftFeed } from '../../front-end/js/tfl-feed.mjs';
export function feedState(fetchedAt,now=Date.now()){
  const timestamp=Date.parse(fetchedAt);
  if(!Number.isFinite(timestamp)||timestamp>now+60_000)return 'unavailable';
  return now-timestamp<15*60_000?'fresh':'stale';
}
