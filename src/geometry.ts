import * as THREE from 'three';
import Module from 'manifold-3d';
import wasmURL from 'manifold-3d/manifold.wasm?url';
import type {Vec2, Vec3} from 'manifold-3d';
import {sliceMidpoint,type Config} from './model';
import {advancedCutters} from './patterns';
import {spatialCore} from './spatialCore';
import {applyRelief} from './relief';
let modulePromise: ReturnType<typeof Module> | undefined;
let loadedModule:Awaited<ReturnType<typeof Module>>|undefined;
export function loadedLib(){if(!loadedModule)throw Error('Geometriekern ist noch nicht geladen.');return loadedModule;}
export async function getLib(){
  modulePromise ??= Module(typeof window === 'undefined' ? undefined : {locateFile: () => wasmURL}).then(m=>{m.setup();loadedModule=m;return m});
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
export function cutters(lib:Lib,b:[number[],number[]],z0:number,z1:number,c:Config):Solid|null {
  if(![c.cell,c.density,c.wall].every(Number.isFinite)||c.cell<1||c.density<0||c.density>100||c.wall<0)throw Error('Ungültige Musterparameter.');
  if(c.pattern==='solid'||c.density===0)return null;
  if(c.pattern==='voronoi'||c.pattern==='gyroid')return advancedCutters(lib,b,z0,z1,c);
  const radius=c.cell*Math.sqrt(Math.min(.95,c.density/100)),dx=c.pattern==='grid'?c.cell*2:c.cell*1.5,dy=c.pattern==='grid'?c.cell*2:c.cell*Math.sqrt(3),parts:Solid[]=[];
  try{
    for(let col=Math.floor(b[0][0]/dx)-1;col<=Math.ceil(b[1][0]/dx)+1;col++)for(let row=Math.floor(b[0][1]/dy)-1;row<=Math.ceil(b[1][1]/dy)+1;row++){
      const x=col*dx,y=row*dy+(c.pattern==='grid'?0:(col%2)*dy/2);
      if(x+radius<b[0][0]||x-radius>b[1][0]||y+radius<b[0][1]||y-radius>b[1][1])continue;
      const points:Vec2[]=c.pattern==='grid'?[[x-radius,y-radius],[x+radius,y-radius],[x+radius,y+radius],[x-radius,y+radius]]:polygon(x,y,radius,6);
      const raw=lib.Manifold.extrude([points],z1-z0+2);try{parts.push(raw.translate([0,0,z0-1]));}finally{raw.delete();}
      if(parts.length>900)throw Error('Zu viele Musterzellen. Zellgröße erhöhen.');
    }
    return parts.length?lib.Manifold.union(parts):null;
  }finally{parts.forEach(part=>part.delete());}
}
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
/** Exact slab intersection with a spatially offset interior and real cut geometry. */
export function makeSlice(lib:Lib,source:Solid,z0:number,z1:number,c:Config,normal:Vec3=[0,0,1],preparedCore?:Solid|null):Solid {
  if(!Number.isFinite(z0)||!Number.isFinite(z1)||z1<=z0)throw Error('Ungültige Schnittgrenzen.');
  if(![c.cell,c.density,c.wall].every(Number.isFinite)||c.cell<1||c.density<0||c.density>100||c.wall<0)throw Error('Ungültige Musterparameter.');
  const n=normalizeNormal(normal),lower=source.trimByPlane(n,z0);
  let piece:Solid,ownedCore:Solid|undefined;
  try{piece=lower.trimByPlane(n.map(v=>-v) as Vec3,-z1);}finally{lower.delete();}
  if(piece.isEmpty())return piece;
  const matrix=new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...n),new THREE.Vector3(0,0,1)));
  try{
    const local=piece.transform(matrix.elements as Parameters<Solid['transform']>[0]);piece.delete();piece=local;
    if(c.pattern!=='solid'&&c.density>0){
      const b=piece.boundingBox(),holes=cutters(lib,[b.min,b.max],z0,z1,c);
      if(holes){
        let localCore:Solid|undefined,guarded:Solid|undefined;
        try{
          if(c.wall>0){
            const sourceBox=source.boundingBox();
            const region=Math.abs(n[2]-1)<1e-8?{min:[...sourceBox.min.slice(0,2),z0-c.wall],max:[...sourceBox.max.slice(0,2),z1+c.wall]}:undefined;
            const core=preparedCore??(ownedCore=spatialCore(lib,source,c.wall,c.geometryResolution??.5,region));
            localCore=core.transform(matrix.elements as Parameters<Solid['transform']>[0]);guarded=holes.intersect(localCore);
          }
          const next=piece.subtract(guarded??holes);piece.delete();piece=next;
        }finally{localCore?.delete();guarded?.delete();holes.delete();}
      }
    }
    if(c.mode==='print'&&c.relief>0){const next=applyRelief(lib,piece,z0,z1,c);if(next!==piece){piece.delete();piece=next;}}
    const restored=piece.transform(matrix.invert().elements as Parameters<Solid['transform']>[0]);piece.delete();piece=restored;
    if(piece.status()!=='NoError')throw Error('Ungültiges Ergebnis: '+piece.status());
    return piece;
  }catch(error){piece.delete();throw error;}finally{ownedCore?.delete();}
}
/** Scale the applied model to physical XYZ dimensions, anchored at its minimum corner.
 * The original geometry is retained; all factors must be positive to preserve winding.
 */
export function scaleGeometryToDimensions(geometry:THREE.BufferGeometry,target:[number,number,number]):THREE.BufferGeometry {
  if(target.some(value=>!Number.isFinite(value)||value<=0))throw Error('Alle Zielmaße müssen größer als 0 mm und endlich sein.');
  const box=new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute);
  const size=box.getSize(new THREE.Vector3()).toArray();
  if(size.some(value=>!Number.isFinite(value)||value<=0))throw Error('Das Modell benötigt eine positive Ausdehnung auf allen drei Achsen.');
  const result=geometry.clone();
  result.translate(-box.min.x,-box.min.y,-box.min.z);
  result.scale(target[0]/size[0],target[1]/size[1],target[2]/size[2]);
  result.translate(box.min.x,box.min.y,box.min.z);
  result.computeBoundingBox();result.computeVertexNormals();
  return result;
}

/** Center the bounding box in XY and place its bottom at Z=0.
 * The translation allows existing project boundaries to move with the mesh.
 */
export function centerGeometryOnBed(geometry:THREE.BufferGeometry):{geometry:THREE.BufferGeometry;translation:[number,number,number]} {
  const positions=geometry.getAttribute('position');
  if(!positions||positions.count===0)throw Error('Das Modell ist leer.');
  const box=new THREE.Box3().setFromBufferAttribute(positions as THREE.BufferAttribute);
  if([...box.min.toArray(),...box.max.toArray()].some(value=>!Number.isFinite(value)))throw Error('Ungültige Modellkoordinaten.');
  const center=box.getCenter(new THREE.Vector3());
  const translation:[number,number,number]=[-center.x,-center.y,-box.min.z];
  const result=geometry.clone();result.translate(...translation);result.computeBoundingBox();
  return {geometry:result,translation};
}

/** Laser contours come from the slab's middle, never an end face. */
export function sliceContoursAtMidpoint(solid:Solid,start:number,end:number):Vec2[][] {
  const section=solid.slice(sliceMidpoint(start,end));
  try{return section.toPolygons();}finally{section.delete();}
}
