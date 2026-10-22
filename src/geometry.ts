import * as THREE from 'three';
import Module from 'manifold-3d';
import wasmURL from 'manifold-3d/manifold.wasm?url';
import type {Vec2, Vec3} from 'manifold-3d';
import type {Config} from './model';
let modulePromise: ReturnType<typeof Module> | undefined;
export async function getLib(){
  modulePromise ??= Module(typeof window === 'undefined' ? undefined : {locateFile: () => wasmURL}).then(m=>{m.setup();return m});
  return modulePromise;
}
type Lib=Awaited<ReturnType<typeof getLib>>;export type Solid=InstanceType<Lib['Manifold']>;
/** Weld STL's duplicated float32 positions without rounding away small features. */
export function toSolid(g:THREE.BufferGeometry,lib:Lib):Solid {
  const p=g.getAttribute('position');
  if(!p || p.itemSize!==3)throw Error('Das Netz benötigt XYZ-Positionen.');
  const count=g.index?.count ?? p.count;
  if(count===0 || count%3!==0)throw Error('Leeres oder unvollständiges Dreiecksnetz.');
  const vertices:number[]=[],faces:number[]=[],seen=new Map<string,number>();
  for(let i=0;i<count;i++){
    const j=g.index ? g.index.getX(i) : i;
    const xyz=[Math.fround(p.getX(j)),Math.fround(p.getY(j)),Math.fround(p.getZ(j))];
    if(!xyz.every(Number.isFinite))throw Error('Nicht endliche Netzkoordinaten.');
    const key=xyz.join(',');let index=seen.get(key);
    if(index===undefined){index=vertices.length/3;vertices.push(...xyz);seen.set(key,index)}
    faces.push(index);
  }
  const mesh=new lib.Mesh({numProp:3,vertProperties:new Float32Array(vertices),triVerts:new Uint32Array(faces)});
  const solid=new lib.Manifold(mesh);
  if(solid.status()!=='NoError' || solid.isEmpty() || solid.volume()<=0){
    const status=solid.status();solid.delete();throw Error('Das Netz ist nicht geschlossen und orientiert: '+status);
  }
  return solid;
}
export function toGeometry(s:Solid):THREE.BufferGeometry{const m=s.getMesh();const positions=new Float32Array(m.triVerts.length*3);for(let i=0;i<m.triVerts.length;i++){const n=m.triVerts[i]*m.numProp;positions.set(m.vertProperties.slice(n,n+3),i*3)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.computeVertexNormals();return g}
export function polygon(cx:number,cy:number,r:number,n:number,angle=0){return Array.from({length:n},(_,i):Vec2=>[cx+r*Math.cos(angle+i*2*Math.PI/n),cy+r*Math.sin(angle+i*2*Math.PI/n)])}
export function cutters(lib:Lib,b:[number[],number[]],z0:number,z1:number,c:Config):Solid|null {if(![c.cell,c.density,c.wall].every(Number.isFinite)||c.cell<1||c.density<0||c.density>100||c.wall<0)throw Error('Ungültige Musterparameter.');if(c.pattern==='solid'||c.density===0)return null;const {Manifold}=lib;const cell=Math.max(1,c.cell);const radius=cell*Math.sqrt(Math.min(.85,c.density/100));const dx=c.pattern==='grid'?cell*2:cell*1.5;const dy=c.pattern==='grid'?cell*2:cell*Math.sqrt(3);const parts:Solid[]=[];let n=0;const xMin=b[0][0]+c.wall,xMax=b[1][0]-c.wall,yMin=b[0][1]+c.wall,yMax=b[1][1]-c.wall;for(let col=Math.floor(xMin/dx)-1;col<=Math.ceil(xMax/dx)+1;col++)for(let row=Math.floor(yMin/dy)-1;row<=Math.ceil(yMax/dy)+1;row++){const x=col*dx,y=row*dy+(c.pattern==='grid'?0:(col%2)*dy/2);if(x-radius<xMin||x+radius>xMax||y-radius<yMin||y+radius>yMax)continue;let points:Vec2[];if(c.pattern==='grid')points=[[x-radius,y-radius],[x+radius,y-radius],[x+radius,y+radius],[x-radius,y+radius]];else if(c.pattern==='voronoi'){const jitter=(k:number)=>Math.sin(col*17.13+row*43.9+k*21.1)*.17;points=Array.from({length:7},(_,i):Vec2=>{const a=i*2*Math.PI/7;return [x+radius*(1+jitter(i))*Math.cos(a),y+radius*(1+jitter(i))*Math.sin(a)]})}else if(c.pattern==='gyroid'){points=polygon(x,y,radius,12,Math.sin(z0/cell+x/cell)*.45)}else points=polygon(x,y,radius,6);const raw=Manifold.extrude([points],z1-z0+2,0,0,[1,1]);parts.push(raw.translate([0,0,z0-1]));raw.delete();if(++n>700){parts.forEach(s=>s.delete());throw Error('Zu viele Musterzellen. Zellgröße erhöhen.')}}if(!parts.length)return null;const joined=Manifold.union(parts);parts.forEach(s=>s.delete());return joined}
export function normalizeNormal(normal:Vec3):Vec3 {
  const length=Math.hypot(...normal);
  if(!normal.every(Number.isFinite)||!Number.isFinite(length)||length===0)throw Error('Ungültige Schnittrichtung.');
  return normal.map(v=>v/length) as Vec3;
}
/** Extent uses the actual vertices, not the corners of an axis-aligned box. */
export function extentAlong(source:Solid,normal:Vec3):[number,number] {
  const n=normalizeNormal(normal),m=source.getMesh();let lo=Infinity,hi=-Infinity;
  for(let i=0;i<m.vertProperties.length;i+=m.numProp){
    const d=n[0]*m.vertProperties[i]+n[1]*m.vertProperties[i+1]+n[2]*m.vertProperties[i+2];
    lo=Math.min(lo,d);hi=Math.max(hi,d);
  }
  return [lo,hi];
}
/** Exact half-space intersection. Distances are millimeters along the unit normal. */
export function makeSlice(lib:Lib,source:Solid,z0:number,z1:number,c:Config,normal:Vec3=[0,0,1]):Solid {
  if(!Number.isFinite(z0)||!Number.isFinite(z1)||z1<=z0)throw Error('Ungültige Schnittgrenzen.');
  if(![c.cell,c.density,c.wall].every(Number.isFinite)||c.cell<1||c.density<0||c.density>100||c.wall<0)throw Error('Ungültige Musterparameter.');
  const n=normalizeNormal(normal);
  const lower=source.trimByPlane(n,z0);
  let piece:Solid;
  try{piece=lower.trimByPlane(n.map(v=>-v) as Vec3,-z1)}finally{lower.delete()}
  if(piece.isEmpty())return piece;
  if(c.pattern!=='solid'&&c.density>0){
    // Patterns are defined in the slice plane; rotate to that frame and back.
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...n),new THREE.Vector3(0,0,1));
    const matrix=new THREE.Matrix4().makeRotationFromQuaternion(q);
    const local=piece.transform(matrix.elements as Parameters<Solid['transform']>[0]);piece.delete();piece=local;
    const b=piece.boundingBox();
    const holes=cutters(lib,[b.min,b.max],z0,z1,c);
    if(holes){try{const result=piece.subtract(holes);piece.delete();piece=result}finally{holes.delete()}}
    const restored=piece.transform(matrix.invert().elements as Parameters<Solid['transform']>[0]);piece.delete();piece=restored;
  }
  if(piece.status()!=='NoError'){const status=piece.status();piece.delete();throw Error('Schnittfehler: '+status)}
  return piece;
}
