(() => {
  'use strict';const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
  const labels={entrance_step_free:'Step-free entrance',lift_present:'Lift present',lift_operational:'Lift working',ramp_present:'Ramp present',toilet_wheelchair_accessible:'Wheelchair-accessible toilet',adult_changing_equipment_present:'Adult changing equipment'};
  let session={signed_in:false,can_review:false},places=[],selected=null,requestId=0;
  let facilitySources;
  function facilities(){return facilitySources??=Promise.all([api('../data/venue_evidence/source_features.geojson'),api('../data/toiletmap/london_toilets.geojson')]).then(sources=>sources.flatMap(s=>s.features.map(f=>({...f.properties,id:f.properties.feature_id,record_type:'facility'})))).catch(error=>{facilitySources=null;throw error;});}
  function el(tag,text,attrs={}){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;}
  async function api(url,options){const r=await fetch(url,{cache:'no-store',...options});const data=await r.json();if(!r.ok)throw new Error(data.error||'The service is unavailable. Please try again.');return data;}
  function choose(p){selected=p;$('selected-place').textContent=p.name_en+' · '+p.borough_name;$('place-results').replaceChildren();$('place-search').value=p.name_en;if(p.source_provider==='toiletmap')$('observation-form').elements.attribute.value='toilet_wheelchair_accessible';enableSubmit();}
  function enableSubmit(){$('submit-observation').disabled=!session.signed_in||!selected;}
  async function loadPlaces(){const code=$('borough').value,seq=++requestId;selected=null;places=[];enableSubmit();$('selected-place').textContent='No place selected.';$('place-results').replaceChildren();if(!code)return;
    try{const [data,extra]=await Promise.all([api('../data/places/'+encodeURIComponent(code)+'.geojson'),facilities()]);if(seq!==requestId)return;const byId=new Map(data.features.map(f=>[f.properties.id,f.properties]));extra.filter(p=>p.borough_code===code).forEach(p=>{if(!byId.has(p.id))byId.set(p.id,p);});places=[...byId.values()];const match=places.find(p=>p.id===query.get('place'));if(match)choose(match);}
    catch(e){$('selected-place').textContent=e.message;}
  }
  function search(){const q=$('place-search').value.trim().toLowerCase();selected=null;enableSubmit();$('selected-place').textContent='Select a matching place below.';$('place-results').replaceChildren();if(q.length<2)return;const matches=places.filter(p=>[p.name_en,p.address,p.postcode].join(' ').toLowerCase().includes(q)).slice(0,12);
    for(const p of matches){const b=el('button',p.name_en+(p.address?' · '+p.address:''),{type:'button',class:'tool-result'});b.onclick=()=>choose(p);$('place-results').append(b);}if(!matches.length)$('place-results').append(el('p','No matches in this borough.'));
  }
  function card(r,review=false){const c=el('article',undefined,{class:'observation-card'});c.append(el('h3',r.place_name),el('p',(labels[r.attribute]||r.attribute)+': '+r.value),el('p','Scope: '+r.scope),el('p','Observed: '+r.observed_at+(r.reviewed_at?' · Reviewed: '+r.reviewed_at.slice(0,10):'')));
    if(r.notes)c.append(el('p',r.notes));try{const u=new URL(r.evidence_url);if(['http:','https:'].includes(u.protocol))c.append(el('a','Open evidence',{href:u.href,target:'_blank',rel:'noopener noreferrer'}));}catch{}
    c.append(el('p',undefined));c.append(el('a','View record',{href:'map.html?borough='+encodeURIComponent(r.borough_code)+(r.record_type==='facility'?'&view=facilities&feature=':'&view=places&place=')+encodeURIComponent(r.place_id)}));
    if(r.review_status)c.append(el('p','Review status: '+r.review_status,{class:'tool-badge'}));if(r.review_reason)c.append(el('p','Review note: '+r.review_reason));
    if(review){if(r.is_own){c.append(el('p','Your submission — another reviewer must decide.',{class:'tool-warning'}));return c;}
      const reason=el('textarea',undefined,{rows:'2',maxlength:'1000','aria-label':'Review reason for '+r.place_name,placeholder:'Explain your decision'}),feedback=el('p',undefined,{role:'status'});c.append(reason);
      const buttons=[];for(const[decision,title]of [['approved','Approve'],['needs_changes','Needs changes'],['rejected','Reject']]){const b=el('button',title,{type:'button',class:'tool-button'});buttons.push(b);b.onclick=async()=>{if(!reason.value.trim()){feedback.textContent='Enter a review reason.';return;}buttons.forEach(x=>x.disabled=true);try{await api('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({observation_id:r.id,decision,reason:reason.value.trim()})});await loadReviews();await loadPublic();}catch(e){feedback.textContent=e.message;buttons.forEach(x=>x.disabled=false);}};c.append(b);}c.append(feedback);
    }return c;
  }
  async function list(url,target,review=false){target.textContent='Loading…';try{const d=await api(url);target.replaceChildren();if(!d.records.length)target.append(el('p',review?'No submissions in this review status.':'No records yet.'));d.records.forEach(r=>target.append(card(r,review)));}catch(e){target.textContent=e.message;}}
  const loadPublic=()=>list('/api/observations',$('public-records')),loadMine=()=>list('/api/observations?mine=1',$('mine-records')),loadReviews=()=>list('/api/reviews?status='+encodeURIComponent($('review-filter').value),$('review-records'),true);
  function panel(name){for(const p of ['submit','mine','review']){$(p+'-panel').hidden=p!==name;$('show-'+p).setAttribute('aria-pressed',String(p===name));}if(name==='mine')loadMine();if(name==='review')loadReviews();}
  $('show-submit').onclick=()=>panel('submit');$('show-mine').onclick=()=>panel('mine');$('show-review').onclick=()=>panel('review');$('review-filter').onchange=loadReviews;$('borough').onchange=loadPlaces;$('place-search').oninput=search;
  $('observation-form').onsubmit=async e=>{e.preventDefault();if(!selected||!session.signed_in)return;const fields=Object.fromEntries(new FormData(e.target));fields.place_id=selected.id;fields.borough_code=selected.borough_code;$('submit-observation').disabled=true;$('form-status').textContent='Submitting…';
    try{const d=await api('/api/observations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)});$('form-status').textContent=d.message+' Reference: '+d.id;e.target.reset();}catch(error){$('form-status').textContent=error.message;}finally{enableSubmit();}
  };
  $('observed-at').max=new Date().toISOString().slice(0,10);$('sign-in').href='/signin-with-chatgpt?return_to='+encodeURIComponent(location.pathname+location.search);
  async function init(){
    const tasks=await Promise.allSettled([api('/api/session'),api('../data/boroughs.json')]);
    if(tasks[0].status==='fulfilled'){session=tasks[0].value;$('session-status').textContent=session.signed_in?'Signed in as '+session.display_name+(session.can_review?' · Reviewer access':''):'Browse freely. Sign in to submit an observation for review.';$('sign-in').hidden=session.signed_in;$('sign-out').hidden=!session.signed_in;$('show-mine').hidden=!session.signed_in;$('show-review').hidden=!session.can_review;enableSubmit();}
    else{$('session-status').textContent='Sign-in service is unavailable. Your observation has not been submitted.';}
    if(tasks[1].status==='fulfilled'){tasks[1].value.slice().sort((a,b)=>a.borough_name.localeCompare(b.borough_name)).forEach(b=>$('borough').append(el('option',b.borough_name,{value:b.borough_code})));if(query.get('borough')){$('borough').value=query.get('borough');await loadPlaces();}}
    else $('selected-place').textContent='Place data is unavailable. Please reload the page.';
  }
  init();loadPublic();
})();
