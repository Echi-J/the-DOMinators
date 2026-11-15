(function(){
  'use strict';
  function distanceMeters(a,b){const lat=(a[1]+b[1])/2*Math.PI/180;const x=(a[0]-b[0])*111320*Math.cos(lat);const y=(a[1]-b[1])*111320;return Math.hypot(x,y);}
  function segmentMeters(p,a,b){const lat=p[1]*Math.PI/180;const kx=111320*Math.cos(lat),ky=111320;const ax=(a[0]-p[0])*kx,ay=(a[1]-p[1])*ky,bx=(b[0]-p[0])*kx,by=(b[1]-p[1])*ky;const dx=bx-ax,dy=by-ay;const t=dx*dx+dy*dy?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy))):0;return Math.hypot(ax+dx*t,ay+dy*t);}
  function nearRoute(p,coordinates,threshold=80){if(!Array.isArray(coordinates))return false;for(let i=1;i<coordinates.length;i++)if(segmentMeters(p,coordinates[i-1],coordinates[i])<=threshold)return true;return false;}
  const helpers={distanceMeters,segmentMeters,nearRoute};
  if(typeof module!=='undefined'&&module.exports)module.exports=helpers;
  if(typeof window!=='undefined')window.JourneyGeometry=helpers;
})();
