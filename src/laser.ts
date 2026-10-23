import * as THREE from 'three';
import {loadedLib} from './geometry';
export type Pt=[number,number];export type Loop=Pt[];
/** Topology-aware Clipper2 offset: outer paths expand and holes shrink together. */
export function offsetContours(loops:Loop[],distance:number):Loop[]{
  if(!Number.isFinite(distance))throw Error('Ungültiger Konturabstand.');
  if(!loops.length||distance===0)return loops;
  const lib=loadedLib(),section=new lib.CrossSection(loops,'NonZero');
  let shifted:InstanceType<typeof lib.CrossSection>|undefined;
  try{shifted=section.offset(distance,'Miter',2,48);return shifted.toPolygons();}finally{shifted?.delete();section.delete();}
}
export function kerfContours(loops:Loop[],kerf=0):Loop[]{
  if(!Number.isFinite(kerf)||kerf<0)throw Error('Ungültige Kerf-Kompensation.');
  return offsetContours(loops,kerf/2);
}
export function contoursAtZ(geometry:THREE.BufferGeometry,z:number):Loop[]{const g=geometry.index?geometry.toNonIndexed():geometry;const p=g.getAttribute('position');const segments:[Pt,Pt][]=[];const eps=1e-5;for(let i=0;i<p.count;i+=3){const v=Array.from({length:3},(_,j)=>[p.getX(i+j),p.getY(i+j),p.getZ(i+j)]);const points:Pt[]=[];for(let e=0;e<3;e++){const a=v[e],b=v[(e+1)%3];if((a[2]<z&&b[2]>z)||(a[2]>z&&b[2]<z)){const t=(z-a[2])/(b[2]-a[2]);points.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])])}}if(points.length===2)segments.push([points[0],points[1]])}if(g!==geometry)g.dispose();const key=(a:Pt)=>`${Math.round(a[0]/eps)},${Math.round(a[1]/eps)}`;const adj=new Map<string,Pt[]>();for(const [a,b] of segments){for(const [x,y] of [[a,b],[b,a]]){const k=key(x);adj.set(k,[...(adj.get(k)||[]),y])}}const used=new Set<string>();const loops:Loop[]=[];for(const [a,b] of segments){const edge=(x:Pt,y:Pt)=>[key(x),key(y)].sort().join('|');if(used.has(edge(a,b)))continue;const loop:Loop=[a];let prev=a,cur=b;used.add(edge(a,b));for(let j=0;j<segments.length+2;j++){if(key(cur)===key(a))break;loop.push(cur);const next=(adj.get(key(cur))||[]).find(v=>key(v)!==key(prev)&&!used.has(edge(cur,v)));if(!next)break;used.add(edge(cur,next));prev=cur;cur=next}if(loop.length>=3&&key(cur)===key(a))loops.push(loop)}return loops}
export function signedArea(p:Loop){return p.reduce((s,v,i)=>{const w=p[(i+1)%p.length];return s+v[0]*w[1]-w[0]*v[1]},0)/2}
export function offsetLoop(loop:Loop,offset:number):Loop{const sign=Math.sign(signedArea(loop))||1;return loop.map((p,i)=>{const prev=loop[(i+loop.length-1)%loop.length],next=loop[(i+1)%loop.length];const norm=(a:Pt,b:Pt):Pt=>{const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy)||1;return [sign*dy/d,-sign*dx/d]};const n1=norm(prev,p),n2=norm(p,next),mx=n1[0]+n2[0],my=n1[1]+n2[1],den=(mx*n1[0]+my*n1[1])||1;const scale=Math.min(3,Math.abs(1/den))*Math.sign(den)*offset;return [p[0]+mx*scale,p[1]+my*scale]})}
export function bounds(loops:Loop[]){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const loop of loops)for(const [x,y] of loop){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}return minX===Infinity?{minX:0,minY:0,maxX:0,maxY:0}:{minX,minY,maxX,maxY};}
export function svgFor(loops:Loop[],kerf=0):string{
 const corrected=kerfContours(loops,kerf);if(!corrected.length)throw Error('Keine geschlossenen Schnittkonturen gefunden');
 const b=bounds(corrected),pad=3,w=b.maxX-b.minX+2*pad,h=b.maxY-b.minY+2*pad;
 const paths=corrected.map(loop=>`<path d="${loop.map((p,i)=>`${i?'L':'M'}${(p[0]-b.minX+pad).toFixed(4)} ${(b.maxY-p[1]+pad).toFixed(4)}`).join(' ')} Z"/>`).join('\n');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(3)}mm" height="${h.toFixed(3)}mm" viewBox="0 0 ${w.toFixed(3)} ${h.toFixed(3)}"><g fill="none" stroke="#ff0000" stroke-width="0.05">${paths}</g></svg>`;
}
export function dxfFor(loops:Loop[],kerf=0):string{if(!Number.isFinite(kerf)||kerf<0)throw Error('Ungültige Kerf-Kompensation.');const corrected=kerfContours(loops,kerf);let out='0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';for(const loop of corrected){out+='0\nLWPOLYLINE\n8\nCUT\n90\n'+loop.length+'\n70\n1\n';for(const [x,y] of loop)out+=`10\n${x}\n20\n${y}\n`;}return out+'0\nENDSEC\n0\nEOF\n'}
export interface Placement {index:number;x:number;y:number;width:number;height:number}
export function shelfNest(sizes:{width:number;height:number}[],sheetW:number,sheetH:number,gap=3):Placement[]{const result:Placement[]=[];let x=gap,y=gap,row=0;for(let i=0;i<sizes.length;i++){const {width,height}=sizes[i];if(width+2*gap>sheetW||height+2*gap>sheetH)throw Error('Teil ist größer als die Materialplatte');if(x+width+gap>sheetW){x=gap;y+=row+gap;row=0}if(y+height+gap>sheetH)throw Error('Materialplatte voll; weitere Platte erforderlich');result.push({index:i,x,y,width,height});x+=width+gap;row=Math.max(row,height)}return result}
