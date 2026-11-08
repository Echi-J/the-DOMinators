(function(global){
  'use strict';
  const base=new URL('../../data/',document.currentScript.src),cache=new Map();
  function read(path){if(!cache.has(path))cache.set(path,fetch(new URL(path,base)).then(r=>{if(!r.ok)throw new Error('Additional evidence could not be loaded.');return r.json();}).catch(e=>{cache.delete(path);throw e;}));return cache.get(path);}
  const labels={wheelchair:'Wheelchair access',entrance:'Entrance type','entrance:step_count':'Entrance steps','entrance:width':'Entrance width (source)','entrance:threshold':'Threshold (source)','entrance:ramp':'Entrance ramp','door:width':'Door width (source)','door:automatic':'Automatic door',width:'Width (source)',incline:'Incline (source)',ramp:'Ramp','ramp:wheelchair':'Wheelchair ramp','ramp:portable':'Portable ramp',step_count:'Steps','toilets:wheelchair':'Wheelchair toilet','toilets:access':'Toilet access','changing_table:adult':'Adult changing table',hoist:'Hoist',level:'Level',access:'Access restrictions',fee:'Fee',opening_hours:'Opening hours',highway:'Mapped feature',indoor:'Indoor feature',amenity:'Amenity'};
  const attributeLabels={entrance_step_free:'Step-free entrance',lift_present:'Lift present',lift_operational:'Lift working',ramp_present:'Ramp present',toilet_wheelchair_accessible:'Wheelchair-accessible toilet',adult_changing_equipment_present:'Adult changing equipment'};
  global.AccessEvidence={
    read,attributeLabels,
    borough:code=>read('venue_evidence/boroughs/'+code+'.json'),
    stations:()=>read('tfl/stations.geojson').then(x=>x.features),
    operators:()=>read('venue_evidence/operator_statements.json').then(x=>x.statements),
    rows:record=>Object.entries(record?.source_tags||{}).filter(([key])=>labels[key]).map(([key,value])=>({label:labels[key],value:String(value)})),
    async reviewed(placeId){const r=await fetch('/api/observations?place_id='+encodeURIComponent(placeId),{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Reviewed observations are unavailable.');return d.records;},
    observationURL(p){return 'observations.html?place='+encodeURIComponent(p.id)+'&borough='+encodeURIComponent(p.borough_code);},
    nearest(p,stations){return stations.map(f=>({...f.properties,distance:AccessData.haversine({longitude:p.longitude,latitude:p.latitude},f.properties)})).sort((a,b)=>a.distance-b.distance).slice(0,3).map(s=>({name:s.api_station_name||s.station_name,distance:AccessData.distance(s.distance),access:s.accessibility_type_raw,url:'map.html?view=stations&station='+encodeURIComponent(s.station_id)}));}
  };
})(window);
