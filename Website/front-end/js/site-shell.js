/* Shared navigation and same-page exploration. No data is merged by proximity. */
(() => {
 'use strict';
 const page=document.body.dataset.page;
 document.querySelector(`[data-nav="${page==='help'?'help':page}"]`)?.setAttribute('aria-current','page');
 const initial=new URL(location.href);
 const back=document.getElementById('back-to-map');
 if(back&&initial.searchParams.get('borough')){const q=new URLSearchParams({borough:initial.searchParams.get('borough')}),place=initial.searchParams.get('place');if(place){if(initial.searchParams.get('view')==='facilities'||place.startsWith('toiletmap:')){q.set('view','facilities');q.set('feature',place);}else q.set('place',place);}back.href='map.html?'+q;}
 if(page!=='map')return;
 const names={places:'Places',stations:'Stations',facilities:'Facilities'};
 const valid=view=>Object.hasOwn(names,view)?view:'places';
 const state={view:valid(initial.searchParams.get('view')),borough:initial.searchParams.get('borough')||'london',script:null};
 const allButtons=[...document.querySelectorAll('[data-view]')];
 function official(value){const b=window.accessPlacePage?.state.boroughs?.find(x=>x.ui_code===value||x.borough_code===value);return b?.borough_code||value;}
 function context(){const b=window.accessPlacePage?.state.boroughs?.find(x=>x.borough_code===official(state.borough));document.getElementById('explore-context').textContent=b?'Exploring '+b.borough_name:state.borough==='all'?'Whole TfL source network':'All London boroughs';}
 function resize(){document.documentElement.style.setProperty('--site-header-height',document.querySelector('.site-header').offsetHeight+'px');document.documentElement.style.setProperty('--chrome-height',(document.querySelector('.site-header').offsetHeight+document.querySelector('.explore-bar').offsetHeight)+'px');}
 async function tools(){if(window.AccessTools)return;if(!state.script)state.script=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='js/access-tools.js?v=20261108-needs';s.onload=resolve;s.onerror=()=>{state.script=null;s.remove();reject(new Error('The map view could not load. Try again.'));};document.body.append(s);});await state.script;}
 async function activate(view,{push=false,url=null}={}){
  state.view=valid(view);const u=url||new URL(location.href);u.searchParams.set('view',state.view);if(push)history.pushState({},'',u);else history.replaceState({},'',u);
  allButtons.forEach(b=>{const selected=b.dataset.view===state.view;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
  document.getElementById('places-workspace').hidden=state.view!=='places';document.getElementById('tools-workspace').hidden=state.view==='places';document.getElementById('tools-workspace').setAttribute('aria-labelledby','view-'+state.view);document.title=names[state.view]+' · Explore London · Access London';context();resize();
  if(state.view==='places'){
   const p=window.accessPlacePage,b=official(state.borough),selected=u.searchParams.get('place');
   if(p?.state.dataReady){const match=p.state.boroughs.find(x=>x.borough_code===b);if(match&&(p.state.area!==match.ui_code||(selected&&p.state.sel!==selected)))await p.openArea(b,selected);else if(!match&&p.state.level==='area')p.setState({level:'city',sel:null,vstep:'list',q:''});p.geoMap?.reveal();}
  }else{
   try{await tools();window.AccessTools?.activate(state.view,official(state.borough),u.searchParams.get('station')||u.searchParams.get('feature'));}
   catch(e){const error=document.getElementById('load-error');error.textContent=e.message;error.hidden=false;document.getElementById('retry-data').hidden=false;document.getElementById('retry-data').onclick=()=>activate(state.view);}
  }
 }
 window.AccessWorkspace={get currentView(){return state.view;},get borough(){return official(state.borough);},setBorough(value,source){const changed=official(state.borough)!==official(value);state.borough=official(value);context();const u=new URL(location.href);if(changed&&source==='tools')u.searchParams.delete('place');if(['london','all'].includes(state.borough))u.searchParams.delete('borough');else u.searchParams.set('borough',state.borough);if(state.borough==='all')u.searchParams.set('network','all');else u.searchParams.delete('network');history.replaceState({},'',u);if(source==='places')window.AccessTools?.setBorough(state.borough);},placesReady(){state.borough=official(state.borough);context();if(state.view!=='places')window.AccessTools?.activate(state.view,state.borough,new URL(location.href).searchParams.get('station')||new URL(location.href).searchParams.get('feature'));},activate};
 if(initial.searchParams.get('network')==='all')state.borough='all';
 allButtons.forEach((button,index)=>{button.onclick=()=>{const u=new URL(location.href);u.searchParams.delete('station');u.searchParams.delete('feature');activate(button.dataset.view,{push:true,url:u});};button.onkeydown=e=>{let i;if(e.key==='ArrowRight')i=(index+1)%3;else if(e.key==='ArrowLeft')i=(index+2)%3;else if(e.key==='Home')i=0;else if(e.key==='End')i=2;else return;e.preventDefault();allButtons[i].focus();allButtons[i].click();};});
 document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;const u=new URL(a.href,location.href);if(u.origin!==location.origin||!['/map','/map.html'].includes(u.pathname))return;if(a.hasAttribute('download')||a.target==='_blank')return;e.preventDefault();state.borough=u.searchParams.get('borough')||state.borough;const view=u.searchParams.get('view')||'places';if(!u.searchParams.has('borough')&&!['london','all'].includes(state.borough))u.searchParams.set('borough',official(state.borough));activate(view,{push:true,url:u});});
 window.addEventListener('popstate',()=>{const u=new URL(location.href);state.borough=u.searchParams.get('borough')||(u.searchParams.get('network')==='all'?'all':'london');activate(u.searchParams.get('view'),{url:u});});
 new ResizeObserver(resize).observe(document.querySelector('.site-header'));new ResizeObserver(resize).observe(document.querySelector('.explore-bar'));
 activate(state.view);
})();
