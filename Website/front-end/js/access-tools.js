/* Public station and facility views. Source claims never become reviewed surveys. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
  const state={tab:query.get('view')==='facilities'?'facilities':'stations',stations:[],stationSource:null,facilities:[],boroughs:[],toiletMetadata:null,limit:40,selected:null,feed:null};
  const kindNames={entrance:'Entrance',lift:'Lift',ramp_claim:'Ramp evidence',accessible_toilet_claim:'Toilets · OSM evidence',toiletmap_toilet:'Toilets · Toilet Map',adult_changing_candidate:'Adult changing candidate'};
  const accessNames={Full:'Street to all platforms (source)',Partial:'Street to some platforms (source)',Interchange:'Interchange access only (source)',None:'No step-free access recorded'};
  function node(tag,text,attrs={}){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;}
  function safeLink(text,url){try{const u=new URL(url,location.href);if(!['http:','https:'].includes(u.protocol))return node('span',text);return node('a',text,{href:u.href,target:u.origin===location.origin?'_self':'_blank',rel:'noopener noreferrer'});}catch{return node('span',text);}}
  async function json(path){const r=await fetch(path);if(!r.ok)throw new Error('Data could not be loaded. Please retry.');return r.json();}
  function asArray(v){return v===undefined||v===null?[]:Array.isArray(v)?v:[v];}
  function value(v){return v===undefined||v===null||v===''?'Unknown':Array.isArray(v)?v.join(' / '):typeof v==='object'?JSON.stringify(v):String(v);}
  function formatTime(v){return v?new Date(v).toLocaleString('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'})+' London time':'Unavailable';}
  function norm(s){return String(s).toLowerCase().replace(/\s+(underground station|dlr station|rail station|station)$/,'').replace(/&/g,'and').replace(/[^a-z0-9]/g,'');}
  function freshFeed(){return state.feed?.status==='fresh'&&Date.parse(state.feed.expires_at)>Date.now();}
  function disruptions(s){if(!freshFeed())return [];const names=state.stations.filter(x=>norm(x.station_name)===norm(s.station_name));return state.feed.records.filter(d=>[s.source_naptan_id,s.matched_naptan_id].filter(Boolean).includes(d.naptan_id)||(names.length===1&&norm(d.station_name)===norm(s.station_name)));}
  function recordName(r){return state.tab==='stations'?(r.api_station_name||r.station_name):r.name_raw?r.name_en:({entrance:'Unnamed entrance',lift:'Unnamed lift',ramp_claim:'Unnamed ramp feature',accessible_toilet_claim:'Unnamed toilet feature',adult_changing_candidate:'Unnamed adult changing candidate'}[r.feature_kinds[0]]||r.name_en);}
  function id(r){return r.station_id||r.feature_id;}
  function table(headers,rows){const wrap=node('div',undefined,{class:'tool-table-wrap'}),t=node('table',undefined,{class:'tool-table'}),thead=node('thead'),tr=node('tr');headers.forEach(h=>tr.append(node('th',h,{scope:'col'})));thead.append(tr);t.append(thead);const body=node('tbody');rows.forEach(row=>{const tr=node('tr');row.forEach(cell=>tr.append(node('td',value(cell))));body.append(tr);});t.append(body);wrap.append(t);return wrap;}
  function sourceLines(obj,result=[]){if(!obj||typeof obj!=='object')return result;for(const[k,v]of Object.entries(obj)){if(k==='Line')result.push(...asArray(v));else if(typeof v==='object')for(const item of asArray(v))sourceLines(item,result);}return result;}
  const map=L.map('evidence-map',{preferCanvas:true,scrollWheelZoom:false}).setView([51.5074,-.1278],10),markers=L.layerGroup().addTo(map);let selectedMarker=null;
  if(!query.has('noTiles'))L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
  function selection(r,pan=true,focus=false){
    state.selected=r;const url=new URL(location.href);url.searchParams.set('view',state.tab);url.searchParams.delete('tab');url.searchParams.delete('station');url.searchParams.delete('feature');url.searchParams.set(state.tab==='stations'?'station':'feature',id(r));history.replaceState({},'',url);
    document.querySelectorAll('.tool-result').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===id(r))));
    if(selectedMarker){map.removeLayer(selectedMarker);selectedMarker=null;}
    if(Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)){selectedMarker=L.circleMarker([r.latitude,r.longitude],{radius:10,color:'#233a6b',fillColor:'#f2c994',fillOpacity:1,weight:3}).addTo(map);selectedMarker.bindTooltip(node('span',recordName(r)));if(pan)map.setView([r.latitude,r.longitude],15);}
    const detail=$('details');detail.replaceChildren(node('h2',recordName(r)));
    const back=node('button','↑ Back to results',{type:'button',class:'tool-button explore-detail-back'});back.onclick=()=>{$('results').scrollIntoView({block:'start'});$('results').querySelector('[aria-pressed=true]')?.focus({preventScroll:true});};detail.append(back);
    if(state.tab==='stations')stationDetails(r,detail);else if(r.source_provider==='toiletmap')toiletDetails(r,detail);else facilityDetails(r,detail);
    if(state.tab==='facilities')facilityObservations(r,detail);
    if(focus){detail.tabIndex=-1;detail.focus({preventScroll:true});detail.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
  }
  function stationDetails(s,detail){
    detail.append(node('p',accessNames[s.accessibility_type_raw]||'Access not recorded',{class:'tool-badge'}));
    detail.append(node('p','Typical access in the TfL source. This does not confirm level boarding or a working lift today.',{class:'tool-note'}));
    if(freshFeed()){
      const reports=disruptions(s);detail.append(node('h3','Current lift reports'));
      if(reports.length)reports.forEach(d=>detail.append(node('p',d.message,{class:'tool-warning'})));
      else detail.append(node('p','No matching disruption is reported in this feed. This does not confirm that every lift is working.'));
    }else detail.append(node('p','Current lift status is unavailable. Do not use the saved snapshot as a live status.',{class:'tool-warning'}));
    const source=s.source_record||{},lines=sourceLines(source.Lines),toilets=asArray(source.Toilets?.Toilet),lifts=asArray(source.Lifts?.Lift);
    detail.append(node('h3','Platforms and boarding'));
    if(!lines.length)detail.append(node('p','No platform-level detail is supplied for this station.'));
    else detail.append(table(['Line (source)','Platform / direction','Manual boarding ramp','Step / gap (mm)'],lines.map(l=>[l.LineName,[l.Platform,l.Direction].filter(Boolean).join(' · '),Array.isArray(l.LevelAccessByManualRamp)?'Unclear source field — see notes':l.LevelAccessByManualRamp,[l.StepMin===undefined?'Step unknown':`Step ${l.StepMin}–${l.StepMax??'?'} mm`,l.GapMin===undefined?'gap unknown':`gap ${l.GapMin}–${l.GapMax??'?'} mm`].join('; ')])));
    const details=node('details');details.append(node('summary','Entrance, boarding and interchange notes'));
    for(const l of lines){const notes=[l.SpecificEntranceRequired,l.LocationOfLevelAccess,l.AdditionalAccessibilityInformation].filter(Boolean);if(notes.length)details.append(node('p',`${value(l.LineName)} / platform ${value(l.Platform)}: ${notes.map(value).join(' · ')}`));}
    details.append(node('p','Platform-specific lift routes and interchange details are retained in the complete source record. Their existence does not establish an accessible route to your destination.'));details.append(safeLink('Open the complete TfL source','https://content.tfl.gov.uk/lrad-v2.xml'));detail.append(details);
    detail.append(node('h3','Recorded lifts and toilets'),node('p',`${lifts.length} lift records · ${toilets.length} toilet records. Missing records do not mean the facility is absent.`));
    if(toilets.length)detail.append(table(['Toilet type','Accessible (source)','Inside gates','Location'],toilets.map(t=>[t.Type,t.Accessible,t.InsideGateLine,t.Location])));
    detail.append(node('p',`Static access file last modified: ${s.source_http_last_modified_at?.slice(0,10)||'not supplied'}. Coordinates fetched: ${s.coordinate_retrieved_at?.slice(0,10)||'unmatched'}.`,{class:'tool-status'}));
    if(!Number.isFinite(s.latitude))detail.append(node('p','Coordinate matching needs review; this station has no map marker.',{class:'tool-warning'}));
    detail.append(safeLink('TfL step-free travel information','https://tfl.gov.uk/transport-accessibility/wheelchair-access-and-avoiding-stairs'));
  }
  function facilityDetails(p,detail){
    detail.append(node('p',p.feature_kinds.map(k=>kindNames[k]||k).join(' · '),{class:'tool-badge'}));
    detail.append(node('p','OSM source evidence — not an independent site survey. A mapped lift or ramp does not establish access to every public floor.',{class:'tool-note'}));
    if(p.feature_kinds.includes('adult_changing_candidate'))detail.append(node('p','Unverified Changing Places candidate. No official registry record has been imported; this name does not confirm registration or specialist equipment.',{class:'tool-warning'}));
    const tags=p.source_tags||{};detail.append(table(['Source field','Recorded value'],Object.entries(tags)));
    detail.append(node('p',`Snapshot: ${p.source_snapshot_at.slice(0,10)}. OSM object last edited: ${p.source_last_modified_at.slice(0,10)}. An edit date is not a survey date.`,{class:'tool-status'}));
    if(p.name_raw&&p.name_raw!==p.name_en)detail.append(node('p','Original name: '+p.name_raw));
    detail.append(safeLink('View the original OSM object',p.source_url));
    if(p.matched_place_id){detail.append(node('p','Linked to an existing place using the same OSM object ID.'));detail.append(safeLink('Open this place on the main map','map.html?view=places&borough='+p.borough_code+'&place='+encodeURIComponent(p.matched_place_id)));}
    else detail.append(node('p','No confirmed link to an existing venue. Nearby points are not automatically treated as the same place.'));
  }
  const claimNames={yes:'Yes (source)',no:'No (source)',partial:'Partial (source)',unknown:'Unknown'};
  async function facilityObservations(p,detail){
    detail.append(safeLink('Share a dated observation','observations.html?view=facilities&place='+encodeURIComponent(p.feature_id)+'&borough='+p.borough_code));
    const section=node('section');section.append(node('h3','Reviewed observations'));
    const status=node('p','Loading reviewed observations…');section.append(status);detail.append(section);
    try{const response=await fetch('/api/observations?place_id='+encodeURIComponent(p.feature_id),{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error();status.textContent=data.records.length?'Dated contributions, separate from source claims.':'No approved observations have been published for this record.';for(const observation of data.records){const card=node('article',undefined,{class:'observation-card'});card.append(node('p',`${observation.attribute.replaceAll('_',' ')}: ${observation.value}`),node('p',`Scope: ${observation.scope} · Observed: ${observation.observed_at}`),safeLink('Open evidence',observation.evidence_url));if(observation.notes)card.append(node('p',observation.notes));section.append(card);}}
    catch{status.textContent='Reviewed observations are temporarily unavailable. Source information is shown separately.';}
  }
  function toiletDetails(p,detail){
    const claims=p.source_claims;
    detail.append(node('p','Toilet Map · public toilet record',{class:'tool-badge'}));
    detail.append(node('p','Published source information, not a new Access London inspection. Confirm access and hours before travelling.',{class:'tool-note'}));
    detail.append(table(['Facility information','Source answer'],[
      ['Wheelchair accessible',claimNames[claims.accessible]],['RADAR key',claimNames[claims.radar]],
      ['No payment required',claimNames[claims.no_payment]],['Baby changing',claimNames[claims.baby_change]],
      ['Attended',claimNames[claims.attended]],['All-gender provision',claimNames[claims.all_gender]],
      ['Urinal only',claimNames[claims.urinal_only]]
    ]));
    if(p.payment_details_source)detail.append(node('p','Payment details: '+p.payment_details_source));
    const ranges=[...new Set((p.opening_times_normalized||[]).filter(Boolean).map(times=>times.join('–')))];
    detail.append(node('h3','Opening information'));
    detail.append(node('p',ranges.length?'Recorded time ranges: '+ranges.join('; '):'No structured opening-time fields supplied; check any source notes below.'));
    if(ranges.length)detail.append(node('p','The export does not document its weekday ordering. Confirm the applicable days and bank-holiday hours with the venue.',{class:'tool-note'}));
    if(p.notes_source)detail.append(node('h3','Provider notes (unreviewed)'),node('p',p.notes_source));
    detail.append(node('p',`Export date: ${p.source_snapshot_date||'not supplied'}. Source record updated: ${formatTime(p.source_updated_at)}.`,{class:'tool-status'}));
    detail.append(node('p',p.source_verified_at?'Provider verification timestamp: '+formatTime(p.source_verified_at)+'. This is not an Access London survey date.':'The provider supplies no verification timestamp.',{class:'tool-status'}));
    detail.append(node('p','This record does not establish official Changing Places registration.',{class:'tool-note'}));
    if(p.candidate_osm_matches.length){
      detail.append(node('h3','Nearby OSM records'));
      detail.append(node('p','These are unreviewed proximity candidates. They may describe the same toilet or a different facility; records have not been merged.'));
      p.candidate_osm_matches.forEach(candidate=>detail.append(safeLink(candidate.name+' · '+candidate.distance_m+' m',
        'https://www.openstreetmap.org/'+candidate.source_id.replace(/^osm:/,''))));
    }
    detail.append(safeLink('Toilet Map source and download',p.source_url));
    detail.append(node('p','Contains data from the Toilet Map © 2025 – CC BY 4.0. Filtered to London; fields normalized; source claims retained.',{class:'tool-status'}));
  }
  function toiletAccess(r){
    if(r.source_provider==='toiletmap')return r.source_claims.accessible;
    if(!r.feature_kinds.includes('accessible_toilet_claim'))return null;
    const tags=r.source_tags||{},answer=tags['toilets:wheelchair']||(tags.amenity==='toilets'?tags.wheelchair:null);
    return answer==='yes'||answer==='designated'?'yes':answer==='no'?'no':answer==='limited'?'partial':'unknown';
  }
  function render(fit=true){
    const search=$('search').value.trim().toLowerCase(),borough=$('borough').value,kind=$('kind').value;
    const all=state.tab==='stations'?state.stations:state.facilities;
    const provider=$('facility-source').value,toilet=$('toilet-access').value;
    const rows=all.filter(r=>(borough==='all'||borough==='london'&&r.within_london===true||r.borough_code===borough)&&(!search||[recordName(r),r.station_name,r.name_raw,r.borough_name].filter(Boolean).join(' ').toLowerCase().includes(search))&&(kind==='all'||state.tab==='stations'&&r.accessibility_type_raw===kind||state.tab==='facilities'&&(kind==='all_toilets'?toiletAccess(r)!==null:r.feature_kinds.includes(kind)))&&(state.tab==='stations'||(provider==='all'||(r.source_provider||'osm')===provider)&&(toilet==='all'||toiletAccess(r)===toilet))).sort((a,b)=>recordName(a).localeCompare(recordName(b))||id(a).localeCompare(id(b)));
    const shown=rows.slice(0,state.limit);$('result-summary').textContent=`${rows.length.toLocaleString('en-GB')} matching records · showing ${shown.length}. The map follows the shown results.`;$('more').hidden=shown.length>=rows.length;
    $('results').replaceChildren();markers.clearLayers();const points=[];
    shown.forEach(r=>{
      const button=node('button',undefined,{type:'button',class:'tool-result','aria-pressed':String(!!state.selected&&id(state.selected)===id(r))});button.dataset.id=id(r);button.append(node('strong',recordName(r)),node('span',state.tab==='stations'?(accessNames[r.accessibility_type_raw]||'Unknown access'):r.feature_kinds.map(k=>kindNames[k]).join(' · ')),node('span',r.borough_name||'Outside London or coordinate unmatched'));
      if(state.tab==='stations'&&disruptions(r).length)button.append(node('span','Lift disruption reported',{class:'tool-warning'}));button.addEventListener('click',()=>selection(r,true,true));$('results').append(button);
      if(Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)){const latlng=[r.latitude,r.longitude];points.push(latlng);const marker=L.circleMarker(latlng,{radius:6,color:state.tab==='stations'?'#233a6b':'#2f6b3c',fillColor:'#fbfbf2',fillOpacity:.9,weight:2}).addTo(markers);marker.bindTooltip(node('span',recordName(r)));marker.on('click',()=>selection(r,false,true));}
    });
    if(!rows.length)$('results').append(node('p','No records match these filters. Try a different search or borough.'));
    if(fit&&points.length)map.fitBounds(L.latLngBounds(points),{padding:[25,25],maxZoom:14});
  }
  function setTab(tab){
    state.tab=tab;state.limit=40;state.selected=null;if(selectedMarker){map.removeLayer(selectedMarker);selectedMarker=null;}$('search').value='';$('kind').replaceChildren();
    $('lift-status').hidden=tab!=='stations';$('facility-filters').hidden=tab!=='facilities';$('facility-source').value='all';$('toilet-access').value='all';$('tool-title').textContent=tab==='stations'?'Find a station':'Explore access details';$('tool-intro').textContent=tab==='stations'?'Check the access information for your arrival. Select a station for platform and lift details.':'Explore entrances, lifts, ramps and toilet records from OSM and Toilet Map. Select a source or inspect each record’s details.';$('search').placeholder=tab==='stations'?'Search station names':'Search facility names';
    $('borough').querySelector('option[value=all]').textContent=tab==='stations'?'Whole TfL source network':'All source facilities';
    $('filter-label').textContent=tab==='stations'?'Station access':'Facility evidence';
    const options=tab==='stations'?[['all','All access types'],['Full','Street to all platforms'],['Partial','Street to some platforms'],['Interchange','Interchange only'],['None','No step-free access recorded']]:[['all','All facility records'],['all_toilets','All toilet records'],...Object.entries(kindNames)];
    options.forEach(([v,t])=>$('kind').append(node('option',t,{value:v})));
    const meta=state.toiletMetadata;
    const matched=state.stations.filter(s=>Number.isFinite(s.longitude)&&Number.isFinite(s.latitude)).length;
    $('source-note').textContent=tab==='stations'?`${state.stations.length} source station records; ${matched} have matched coordinates, including ${state.stations.filter(s=>s.within_london===true).length} inside London. ${state.stations.length-matched} coordinate matches remain unresolved. Static source last modified: ${state.stationSource.source_http_last_modified_at.slice(0,10)}; fetched: ${state.stationSource.retrieved_at.slice(0,10)}.`:`4,514 OSM facility objects (3 November 2026) and ${meta.counts.london_records.toLocaleString('en-GB')} Toilet Map records (${meta.source_snapshot_date}). Sources may overlap; these are not counts of unique toilets. No official Changing Places register or new field survey is included.`;
    $('details').replaceChildren(node('h2','Choose a result'),node('p','Select a record for its source details.'));render();
  }
  function renderFeed(){
    const f=state.feed, fresh=freshFeed();$('feed-count').textContent=fresh?f.records.length+' reports':'Unavailable';$('feed-summary').textContent=fresh?`${f.message} Retrieved ${formatTime(f.retrieved_at)} · ${f.records.length} reports.`:`${f?.message||'Current lift status is unavailable.'} Last successful retrieval: ${formatTime(f?.retrieved_at)}.`;
    $('feed-summary').className='tool-status'+(fresh?'':' tool-warning');$('feed-records').replaceChildren();
    if(fresh)f.records.forEach(d=>$('feed-records').append(node('p',d.message,{class:'tool-warning'})));
    else $('feed-records').append(node('p','No current status can be established from this response.'));
    if(state.tab==='stations'&&window.AccessWorkspace?.currentView==='stations'){render(false);if(state.selected)selection(state.selected,false);}
  }
  async function refreshFeed(){
    $('refresh-feed').disabled=true;
    try{let proxy;try{const r=await fetch('/api/tfl/lifts',{cache:'no-store'});proxy=await r.json();}catch{}if(proxy?.status==='fresh'&&Date.parse(proxy.expires_at)>Date.now())state.feed=proxy;else{try{const {browserLiftFeed}=await import('./tfl-feed.mjs');state.feed=await browserLiftFeed();}catch{state.feed=proxy?.status?proxy:{status:'unavailable',records:[],message:'Neither the server nor the official TfL feed could be reached. Check with TfL before travelling.'};}}}
    catch{state.feed={status:'unavailable',records:[],message:'The TfL feed could not be reached. Check with TfL before travelling.'};}
    finally{$('refresh-feed').disabled=false;renderFeed();}
  }
  async function load(){
    $('load-error').hidden=true;$('retry-data').hidden=true;
    try{
      const [stations,facilities,boroughs,toilets,metadata]=await Promise.all([json('../data/tfl/station_access.json'),json('../data/venue_evidence/source_features.geojson'),json('../data/boroughs.json'),json('../data/toiletmap/london_toilets.geojson'),json('../data/toiletmap/metadata.json')]);
      state.stations=stations.stations;state.stationSource=stations.source;state.facilities=[...facilities.features,...toilets.features].map(f=>f.properties);state.boroughs=boroughs;state.toiletMetadata=metadata;
      while($('borough').options.length>2)$('borough').remove(2);boroughs.slice().sort((a,b)=>a.borough_name.localeCompare(b.borough_name)).forEach(b=>$('borough').append(node('option',b.borough_name,{value:b.borough_code})));
      loaded=true;const pending=lastActivation||[window.AccessWorkspace?.currentView||state.tab,window.AccessWorkspace?.borough||'london',query.get('station')||query.get('feature')];activate(...pending);
    }catch(e){$('load-error').hidden=false;$('load-error').textContent=e.message;$('retry-data').hidden=false;$('result-summary').textContent='Data is unavailable.';}
  }
  let loaded=false,lastActivation=null;
  function activate(tab,borough,selectedId){
    if(!['stations','facilities'].includes(tab))return;
    lastActivation=[tab,borough,selectedId];if(!loaded)return;
    const changed=state.tab!==tab||!$('kind').options.length;
    if(changed)setTab(tab);
    $('borough').value=[...$('borough').options].some(o=>o.value===borough)?borough:'london';
    const filters=new URLSearchParams(location.search);
    for(const [name,control] of [['kind','kind'],['source','facility-source'],['toilet_access','toilet-access']]){
      const requested=filters.get(name)||'all';$(control).value=[...$(control).options].some(o=>o.value===requested)?requested:'all';
    }
    map.invalidateSize();render();if(tab==='stations'&&!freshFeed())refreshFeed();
    if(selectedId){const r=(tab==='stations'?state.stations:state.facilities).find(r=>id(r)===selectedId);if(r){if(borough!=='all'&&r.within_london!==true)$('borough').value='all';selection(r);}}
  }
  window.AccessTools={activate,setBorough(borough){if(loaded){$('borough').value=borough;render();}}};
  new ResizeObserver(()=>map.invalidateSize()).observe($('evidence-map'));
  $('borough').addEventListener('change',()=>window.AccessWorkspace?.setBorough($('borough').value,'tools'));
  ['search','borough','kind','facility-source','toilet-access'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',()=>{state.limit=40;const u=new URL(location.href);for(const [name,control] of [['kind','kind'],['source','facility-source'],['toilet_access','toilet-access']]){const v=$(control).value;if(v==='all')u.searchParams.delete(name);else u.searchParams.set(name,v);}history.replaceState({},'',u);render();}));
  $('more').onclick=()=>{state.limit+=40;render(false);};$('refresh-feed').onclick=refreshFeed;$('retry-data').onclick=load;
  load();refreshFeed();setInterval(()=>{if(document.visibilityState==='visible'&&window.AccessWorkspace?.currentView==='stations')refreshFeed();},120000);setInterval(()=>{if(state.feed?.status==='fresh'&&!freshFeed())renderFeed();},30000);
})();
