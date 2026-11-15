(async function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const ui={start:null,end:null,map:null,route:null,reports:[],routeMarkers:[],reportMarkers:[],mapPick:null,reportPoint:null,compressedPhoto:null,lookupCounter:0};
 const names={blocked_pavement:'Blocked pavement',uneven_surface:'Uneven surface',step_or_kerb:'Step or high kerb',narrow_passage:'Narrow passage',other:'Other problem',unspecified:'Problem reported'};
 function status(msg,error=false){$('status').textContent=msg;$('status').classList.toggle('error',error);}
 async function request(url,options={}){const r=await fetch(url,options);let d;try{d=await r.json();}catch{throw new Error('The service returned an invalid response.');}if(!r.ok)throw new Error(d.error||'The request failed.');return d;}
 function canPoint(p){return Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);}
 const empty={type:'FeatureCollection',features:[]};
 const sym=(text,barrier=false)=>{const n=document.createElement('div');n.className='point-label'+(barrier?' barrier-label':'');n.textContent=text;return n;};
 function fitMap(coords){if(!ui.map||!coords.length)return;const b=new maplibregl.LngLatBounds(coords[0],coords[0]);coords.forEach(p=>b.extend(p));ui.map.fitBounds(b,{padding:65,maxZoom:15,duration:0});}
 function addMarker(coord,label){return new maplibregl.Marker({element:sym(label)}).setLngLat(coord).addTo(ui.map);}
 function redrawEndpoints(){ui.routeMarkers.forEach(m=>m.remove());ui.routeMarkers=[];if(!ui.map)return;if(ui.start)ui.routeMarkers.push(addMarker(ui.start.coordinates,'A'));if(ui.end)ui.routeMarkers.push(addMarker(ui.end.coordinates,'B'));}
 function setPoint(which,p,label){ui[which]={coordinates:p,name:label};$(which==='start'?'from':'to').value=label;$(which==='start'?'from-options':'to-options').hidden=true;redrawEndpoints();status(`${which==='start'?'Start':'Destination'} selected. ${ui.start&&ui.end?'Press Check route.':'Choose the other location.'}`);}
 function mapPicker(which){if(!ui.map){status('Map unavailable. Use location search instead.',true);return;}ui.mapPick=which;$('map-hint').hidden=false;$('map-hint').textContent=which==='report'?'Click where you found the problem.':`Click on the map to choose ${which==='start'?'your start':'your destination'}.`;
   if(which==='report'){$('report-dialog').close();status('Choose the barrier location on the map.');}}
 async function searchField(which,q){const list=$(which==='start'?'from-options':'to-options');list.hidden=false;list.replaceChildren();const seq=++ui.lookupCounter;
   if(q.trim().length<3){list.hidden=true;return;}
   const p=document.createElement('p');p.textContent='Searching…';list.append(p);
   try{const d=await request('/api/journey/search?q='+encodeURIComponent(q));if(seq!==ui.lookupCounter)return;list.replaceChildren();if(!d.results?.length){list.textContent='No locations found. Try another name or use the map.';return;}
     d.results.forEach(r=>{const b=document.createElement('button');b.type='button';b.textContent=r.name;b.addEventListener('click',()=>setPoint(which,r.coordinates,r.name));list.append(b);});}
   catch(e){if(seq!==ui.lookupCounter)return;list.textContent=e.message;}
 }
 let debounce;
 [['from','start'],['to','end']].forEach(([id,which])=>{$(id).addEventListener('input',()=>{ui[which]=null;clearTimeout(debounce);const q=$(id).value;debounce=setTimeout(()=>searchField(which,q),550);});$(id).addEventListener('focus',()=>{if($(id).value.length>=3&&!ui[which])searchField(which,$(id).value);});});
 document.querySelectorAll('[data-pick]').forEach(b=>b.addEventListener('click',()=>mapPicker(b.dataset.pick)));
 function locate(cb){if(!navigator.geolocation){status('This browser does not support location sharing.',true);return;}status('Requesting location permission…');navigator.geolocation.getCurrentPosition(p=>{const xy=[p.coords.longitude,p.coords.latitude];if(xy[0]<-.6||xy[0]>.4||xy[1]<51.2||xy[1]>51.75){status('Location is outside the supported London area.',true);return;}cb(xy);},()=>status('Location not available. Search or choose a point on the map.',true),{enableHighAccuracy:true,timeout:11000,maximumAge:30000});}
 $('my-location').onclick=()=>locate(xy=>{setPoint('start',xy,'My location');ui.map?.flyTo({center:xy,zoom:14,duration:0});});
 async function loadReports(){try{const d=await request('/api/barriers');ui.reports=d.reports||[];renderReports();}catch(e){status('Public barrier reports are temporarily unavailable. '+e.message,true);}}
 function renderReports(){if(!ui.map)return;ui.reportMarkers.forEach(m=>m.remove());ui.reportMarkers=[];for(const r of ui.reports){const m=new maplibregl.Marker({element:sym('!',true)}).setLngLat([r.lon,r.lat]).addTo(ui.map);m.getElement().role='button';m.getElement().tabIndex=0;m.getElement().ariaLabel='View '+(names[r.type]||'barrier')+' report';m.getElement().addEventListener('click',()=>details(r));m.getElement().addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();details(r);}});ui.reportMarkers.push(m);}renderNearby();}
 function friendlyDate(v){const d=new Date(v);return Number.isNaN(d.getTime())?'Date not available':d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}
 function details(r){$('detail-body').replaceChildren();const title=document.createElement('strong');title.textContent=names[r.type]||'Reported problem';const time=document.createElement('p');time.textContent='Reported '+friendlyDate(r.created_at);const note=document.createElement('p');note.textContent=r.note||'No additional details provided.';const warn=document.createElement('p');warn.className='note';warn.textContent='Community report. Details may have changed since the report.';$('detail-body').append(title,time,note,warn);if(r.has_photo){const img=document.createElement('img');img.alt='Photo submitted with this barrier report';img.src='/api/barriers/'+encodeURIComponent(r.id)+'/photo';$('detail-body').append(img);}$('detail-dialog').showModal();ui.map?.flyTo({center:[r.lon,r.lat],zoom:15,duration:0});}
 $('detail-close').onclick=$('detail-done').onclick=()=>$('detail-dialog').close();
 function renderNearby(){const section=$('result'),list=$('barrier-list');list.replaceChildren();if(!ui.route)return;const line=ui.route.features[0].geometry.coordinates;const near=ui.reports.filter(r=>JourneyGeometry.nearRoute([r.lon,r.lat],line,80));const heading=document.createElement('p');heading.className='note';heading.textContent=near.length?`${near.length} published report${near.length===1?'':'s'} within approximately 80 m of the route.`:'No published barriers found near this route. This does not confirm that the route is barrier-free.';list.append(heading);near.forEach(r=>{const b=document.createElement('button');b.type='button';b.className='barrier-row';const t=document.createElement('strong');t.textContent=names[r.type]||'Barrier';const s=document.createElement('span');s.textContent='Reported '+friendlyDate(r.created_at);b.append(t,s);b.addEventListener('click',()=>details(r));list.append(b);});section.hidden=false;}
 function clearRoute(){ui.route=null;if(ui.map?.getSource('journey-route'))ui.map.getSource('journey-route').setData(empty);$('result').hidden=true;}
 $('journey-form').addEventListener('submit',async e=>{e.preventDefault();if(!ui.start||!ui.end){status('Select a location suggestion for both fields, or choose the points on the map.',true);return;}const btn=$('check-route');btn.disabled=true;btn.textContent='Checking route…';clearRoute();status('Calculating a suggested route…');
   try{const mode=new FormData(e.currentTarget).get('mode');const d=await request('/api/journey/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start:ui.start.coordinates,end:ui.end.coordinates,mode})});ui.route=d;
     if(!ui.map?.getSource('journey-route'))throw new Error('The map is not ready yet. Try again.');ui.map.getSource('journey-route').setData(d);const f=d.features[0],p=f.properties;$('route-summary').textContent=`${p.distance? (p.distance/1000).toFixed(1)+' km':'Distance unavailable'} · ${p.duration?Math.ceil(p.duration/60)+' min':'Time unavailable'}`;fitMap(f.geometry.coordinates);renderNearby();status('Suggested route ready. Check reported barriers before travelling.');}
   catch(err){status(err.message,true);}finally{btn.disabled=false;btn.textContent='Check route';}
 });
 $('report-open').onclick=()=>{resetReport();$('report-dialog').showModal();};
 $('report-close').onclick=()=>$('report-dialog').close();
 function resetReport(){ui.reportPoint=null;ui.compressedPhoto=null;$('report-form').reset();$('report-status').textContent='';$('report-location-status').textContent='Location not selected.';$('photo-state').textContent='Avoid including people or vehicle registration plates.';}
 function setReportPoint(xy){ui.reportPoint=xy;$('report-location-status').textContent=`Location selected: ${xy[1].toFixed(5)}, ${xy[0].toFixed(5)}`;status('Barrier location selected.');$('report-dialog').showModal();}
 $('report-gps').onclick=()=>locate(xy=>{ui.reportPoint=xy;$('report-location-status').textContent='Your current location selected. Check that this is where the barrier is.';});
 $('report-pick').onclick=()=>mapPicker('report');
 async function compress(file){if(!file.type.startsWith('image/'))throw new Error('Select an image file.');if(file.size>12*1024*1024)throw new Error('Photo is too large. Choose one below 12 MB.');const url=URL.createObjectURL(file);try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});const scale=Math.min(1,1100/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  // Canvas re-encoding removes embedded EXIF metadata, including GPS metadata.
  let quality=.75,data=canvas.toDataURL('image/jpeg',quality);while(data.length>1100000&&quality>.36){quality-=.12;data=canvas.toDataURL('image/jpeg',quality);}if(data.length>1200000)throw new Error('Photo is still too large. Choose a smaller image.');return data;
 }finally{URL.revokeObjectURL(url);}}
 $('photo').onchange=async()=>{const file=$('photo').files[0];ui.compressedPhoto=null;if(!file)return;$('photo-state').textContent='Preparing photo…';try{ui.compressedPhoto=await compress(file);$('photo-state').textContent='Photo ready. Please check it does not show identifiable people or number plates.';}catch(e){$('photo-state').textContent=e.message;}};
 $('report-form').addEventListener('submit',async e=>{e.preventDefault();const note=$('report-note').value.trim(),type=$('barrier-type').value;
   if(!ui.reportPoint){$('report-status').textContent='Select the barrier location first.';return;}
   if(!ui.compressedPhoto&&type==='unspecified'&&!note){$('report-status').textContent='Add a photo or choose a problem type.';return;}
   const btn=$('report-submit');btn.disabled=true;btn.textContent='Sending…';$('report-status').textContent='Saving your report…';
   try{const d=await request('/api/barriers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lon:ui.reportPoint[0],lat:ui.reportPoint[1],photo:ui.compressedPhoto,type,note})});$('report-dialog').close();status('Report received. It is waiting for review and is not public yet. Reference: '+d.id);resetReport();await loadReports();}
   catch(err){$('report-status').textContent=err.message;}finally{btn.disabled=false;btn.textContent='Send report';}
 });
 try{
   if(!window.maplibregl)throw new Error('MapLibre did not load. Check your connection.');
   const map=ui.map=new maplibregl.Map({container:'map',style:await MapLook.loadBasemap(),center:[-.05,51.52],zoom:12,attributionControl:true});
   map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
   await new Promise((ok,fail)=>{map.once('load',ok);map.once('error',e=>{if(!map.loaded())fail(e.error||new Error('Unable to load the map.'));});});
   map.addSource('journey-route',{type:'geojson',data:empty});map.addLayer({id:'journey-route-line',type:'line',source:'journey-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#165b37','line-width':6,'line-opacity':.95}});
   map.on('click',e=>{if(!ui.mapPick)return;const xy=[e.lngLat.lng,e.lngLat.lat],which=ui.mapPick;ui.mapPick=null;$('map-hint').hidden=true;
     if(which==='report')setReportPoint(xy);else setPoint(which,xy,`Map location (${xy[1].toFixed(4)}, ${xy[0].toFixed(4)})`);
   });
   await loadReports();status('Search for two locations or choose them directly on the map.');
 }catch(e){console.error(e);$('map-fallback').hidden=false;$('map-fallback').textContent=e.message||'Map unavailable.';status('The map could not load. Check your internet connection.',true);}
})();
