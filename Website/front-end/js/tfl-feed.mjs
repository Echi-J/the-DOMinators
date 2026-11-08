export const LIFT_FEED_URL='https://api.tfl.gov.uk/Disruptions/Lifts/';

export function validateLiftFeed(data){
  if(!Array.isArray(data)||data.length>2000)throw new Error('Unexpected TfL response.');
  return data.map(d=>{
    if(!d||!['naptanCode','stopPointName','message'].every(k=>typeof d[k]==='string'))throw new Error('Invalid TfL disruption.');
    return {naptan_id:d.naptanCode,station_name:d.stopPointName,message:d.message,
      from_stop_area:d.outageStartArea??null,to_stop_area:d.outageEndArea??null,
      ics_code:d.icsCode??null,outage_started_at:null};
  });
}

// TfL permits anonymous cross-origin reads. The browser can still read the
// official feed when the shared server egress is temporarily rate-limited.
export async function browserLiftFeed(fetchImpl=fetch,now=()=>Date.now()){
  const response=await fetchImpl(LIFT_FEED_URL,{mode:'cors',credentials:'omit',
    cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('TfL direct HTTP '+response.status);
  const records=validateLiftFeed(await response.json()),timestamp=now();
  return {status:'fresh',refresh_failed:false,retrieved_at:new Date(timestamp).toISOString(),
    expires_at:new Date(timestamp+15*60_000).toISOString(),records,transport:'official_browser',
    source_url:LIFT_FEED_URL,attribution:'Powered by TfL Open Data',
    message:'Retrieved directly from TfL in this browser. The server proxy is temporarily unavailable. An empty feed does not confirm that lifts are working.'};
}
