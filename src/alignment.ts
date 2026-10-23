import * as THREE from 'three';
import {centerGeometryOnBed,normalizeNormal} from './geometry';

export type AlignmentTarget='front'|'back'|'right'|'left'|'bottom'|'top';
export const alignmentTargets:Record<AlignmentTarget,{label:string;normal:[number,number,number]}>={
  front:{label:'Vorne (−Y)',normal:[0,-1,0]},back:{label:'Hinten (+Y)',normal:[0,1,0]},
  right:{label:'Rechts (+X)',normal:[1,0,0]},left:{label:'Links (−X)',normal:[-1,0,0]},
  bottom:{label:'Unten (−Z)',normal:[0,0,-1]},top:{label:'Oben (+Z)',normal:[0,0,1]},
};
export type PlanarFace={normal:[number,number,number];area:number;triangles:number[]};

/** Grow connected, nearly planar reference patches without altering the mesh.
 * Every member is checked against the seed plane, preventing gradual growth
 * around curved surfaces. Normals are averaged by triangle area. */
export function detectPlanarFaces(geometry:THREE.BufferGeometry):PlanarFace[]{
  const positions=geometry.getAttribute('position');
  if(!positions)return [];
  const box=new THREE.Box3().setFromBufferAttribute(positions as THREE.BufferAttribute);
  const tolerance=Math.max(box.getSize(new THREE.Vector3()).length()*.002,1e-6);
  const cosine=Math.cos(8*Math.PI/180);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),edge=new THREE.Vector3(),n=new THREE.Vector3();
  const count=geometry.index?.count??positions.count;
  const triangleCount=Math.floor(count/3),normals=new Float64Array(triangleCount*3),areas=new Float64Array(triangleCount),vertices=new Int32Array(count);
  const points:THREE.Vector3[]=[],welded=new Map<string,number>(),edges=new Map<string,number>(),neighbors:number[][]=Array.from({length:triangleCount},()=>[]);
  for(let i=0;i<count;i+=3){
    const vertex=(j:number)=>geometry.index?geometry.index.getX(j):j;
    a.fromBufferAttribute(positions,vertex(i));b.fromBufferAttribute(positions,vertex(i+1));c.fromBufferAttribute(positions,vertex(i+2));
    const triangle=i/3;
    for(const [j,point] of [a,b,c].entries()){
      const key=point.toArray().join(',');let id=welded.get(key);
      if(id===undefined){id=points.length;welded.set(key,id);points.push(point.clone());}
      vertices[i+j]=id;
    }
    n.crossVectors(edge.subVectors(b,a),edge.clone().subVectors(c,a));const area=n.length()/2;
    if(area<1e-10)continue;
    n.normalize();areas[triangle]=area;normals.set(n.toArray(),i);
    for(let j=0;j<3;j++){
      const u=vertices[i+j],v=vertices[i+(j+1)%3],key=u<v?`${u}:${v}`:`${v}:${u}`;
      const other=edges.get(key);
      if(other===undefined)edges.set(key,triangle);else{neighbors[triangle].push(other);neighbors[other].push(triangle);}
    }
  }
  const visited=new Uint8Array(triangleCount),groups:PlanarFace[]=[];
  const order=Array.from({length:triangleCount},(_,i)=>i).filter(i=>areas[i]>0).sort((a,b)=>areas[b]-areas[a]);
  for(const seed of order){
    if(visited[seed])continue;
    const normal=new THREE.Vector3().fromArray(normals,seed*3),origin=points[vertices[seed*3]],sum=new THREE.Vector3();
    const triangles=[seed];visited[seed]=1;let area=0;
    for(let head=0;head<triangles.length;head++){
      const current=triangles[head];sum.addScaledVector(n.fromArray(normals,current*3),areas[current]);area+=areas[current];
      for(const next of neighbors[current]){
        if(visited[next]||areas[next]===0||normal.dot(n.fromArray(normals,next*3))<cosine)continue;
        let fits=true;
        for(let j=0;j<3;j++)if(Math.abs(normal.dot(edge.subVectors(points[vertices[next*3+j]],origin)))>tolerance){fits=false;break;}
        if(fits){visited[next]=1;triangles.push(next);}
      }
    }
    groups.push({normal:sum.normalize().toArray() as [number,number,number],area,triangles});
  }
  return groups.sort((a,b)=>b.area-a.area);
}

/** Longest boundary edge, excluding internal triangulation diagonals. */
export function faceBoundaryDirection(geometry:THREE.BufferGeometry,face:PlanarFace):[number,number,number]|undefined{
  const positions=geometry.getAttribute('position');
  const edges=new Map<string,{a:THREE.Vector3;b:THREE.Vector3;count:number}>();
  for(const triangle of face.triangles){
    const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,geometry.index?geometry.index.getX(triangle*3+j):triangle*3+j));
    for(let j=0;j<3;j++){
      const a=points[j],b=points[(j+1)%3],key=[a.toArray().join(','),b.toArray().join(',')].sort().join('|');
      const existing=edges.get(key);if(existing)existing.count++;else edges.set(key,{a,b,count:1});
    }
  }
  const boundary=[...edges.values()].filter(edge=>edge.count===1).sort((a,b)=>b.a.distanceToSquared(b.b)-a.a.distanceToSquared(a.b))[0];
  return boundary?boundary.b.clone().sub(boundary.a).normalize().toArray() as [number,number,number]:undefined;
}

/** Rotate the actual source mesh into world axes, then recenter without scaling.
 * An optional boundary edge fixes the remaining rotation around the face normal. */
export function alignGeometryToFace(geometry:THREE.BufferGeometry,normal:[number,number,number],target:AlignmentTarget,roll=0,tangent?:[number,number,number],keepUpright=false):THREE.BufferGeometry{
  if(!Number.isFinite(roll))throw Error('Ungültige Drehung in der Ebene.');
  const from=new THREE.Vector3(...normalizeNormal(normal)),to=new THREE.Vector3(...alignmentTargets[target].normal);
  const rotation=new THREE.Quaternion().setFromUnitVectors(from,to);
  const yawOnly=keepUpright&&Math.abs(to.z)<.5;
  if(yawOnly){
    const horizontal=new THREE.Vector3(from.x,from.y,0);
    if(horizontal.lengthSq()<1e-10)throw Error('Diese Fläche zeigt nach oben oder unten. Eine seitliche Fläche wählen oder „Aufrecht lassen“ ausschalten.');
    horizontal.normalize();
    rotation.setFromAxisAngle(new THREE.Vector3(0,0,1),Math.atan2(horizontal.x*to.y-horizontal.y*to.x,horizontal.dot(to)));
  }else if(tangent){
    const right=new THREE.Vector3(...tangent).addScaledVector(from,-new THREE.Vector3(...tangent).dot(from));
    if(right.lengthSq()<1e-12)throw Error('Die Bezugskante liegt nicht in der Fläche.');
    right.normalize();
    const targetRight=Math.abs(to.x)>.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);
    const sourceFrame=new THREE.Matrix4().makeBasis(right,new THREE.Vector3().crossVectors(from,right),from);
    const targetFrame=new THREE.Matrix4().makeBasis(targetRight,new THREE.Vector3().crossVectors(to,targetRight),to);
    rotation.setFromRotationMatrix(targetFrame.multiply(sourceFrame.invert()));
  }
  if(!yawOnly)rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(to,roll*Math.PI/180));
  const rotated=geometry.clone().applyQuaternion(rotation);
  try{return centerGeometryOnBed(rotated).geometry;}finally{rotated.dispose();}
}
