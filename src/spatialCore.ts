import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import type {getLib,Solid} from './geometry';

/** Euclidean inward distance field accelerated by a triangle BVH.
 * The inner mesh is sampled at the configured manufacturing resolution. */
export function spatialCore(lib:Awaited<ReturnType<typeof getLib>>,source:Solid,wall:number,resolution=.5,region?:{min:number[];max:number[]}):Solid{
  if(!Number.isFinite(wall)||wall<=0||!Number.isFinite(resolution)||resolution<=0)throw Error('Ungültige Wandstärke oder Fertigungsauflösung.');
  const sourceBox=source.boundingBox(),box={min:sourceBox.min.map((v,i)=>Math.max(v,region?.min[i]??v)),max:sourceBox.max.map((v,i)=>Math.min(v,region?.max[i]??v))} as typeof sourceBox,step=Math.min(resolution,wall/3);
  if(box.max.reduce((n,v,i)=>n*Math.ceil((v-box.min[i])/step+3),1)>2_000_000)throw Error('Räumlicher Wandabstand zu aufwendig. Fertigungsauflösung (mm) erhöhen.');
  const mesh=source.getMesh(),positions=new Float32Array(mesh.triVerts.length*3);
  for(let i=0;i<mesh.triVerts.length;i++){const j=mesh.triVerts[i]*mesh.numProp;positions.set(mesh.vertProperties.subarray(j,j+3),i*3);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  try{
    const bvh=new MeshBVH(geometry),point=new THREE.Vector3(),ray=new THREE.Ray(),direction=new THREE.Vector3(1,.3713907,.6947139).normalize();
    const target={point:new THREE.Vector3(),distance:0,faceIndex:0};
    return lib.Manifold.levelSet(xyz=>{
      point.set(...xyz);const nearest=bvh.closestPointToPoint(point,target,wall,wall+step*2);
      // Points too close to either side of the surface cannot be in the core.
      const distance=(nearest?.distance??(wall+step*2))-wall-step*.5;
      if(distance<=0)return distance;
      ray.set(point,direction);const hit=bvh.raycastFirst(ray,THREE.DoubleSide);
      return hit?.face&&hit.face.normal.dot(direction)>0?distance:-(nearest?.distance??wall)-wall;
    },box,step);
  }finally{geometry.dispose();}
}
