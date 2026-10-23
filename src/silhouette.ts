import * as THREE from 'three';
import type {Vec3} from 'manifold-3d';
import {getLib,normalizeNormal,type Solid} from './geometry';
import {signedArea,type Loop} from './laser';

export type SilhouetteDirection='front'|'side'|'top';
export const silhouetteDirections:Record<SilhouetteDirection,{label:string;normal:Vec3}>={
  front:{label:'Vorne · Y',normal:[0,-1,0]},
  side:{label:'Seite · X',normal:[1,0,0]},
  top:{label:'Oben · Z',normal:[0,0,1]},
};

/** Orthonormal projection frame: keep world Z upright for front/side views.
 * No perspective or scaling is introduced, so output coordinates remain mm.
 */
export function silhouetteFrame(normal:Vec3):THREE.Matrix4 {
  const n=new THREE.Vector3(...normalizeNormal(normal));
  const upSeed=Math.abs(n.z)>.999?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
  const right=new THREE.Vector3().crossVectors(upSeed,n).normalize();
  const up=new THREE.Vector3().crossVectors(n,right).normalize();
  return new THREE.Matrix4().makeBasis(right,up,n).invert();
}

/** Orthographic shadow of the WHOLE source solid. Projection combines overlapping
 * regions at all depths; hidden cavities do not create spurious openings.
 */
export function projectSilhouette(lib:Awaited<ReturnType<typeof getLib>>,source:Solid,normal:Vec3,includeHoles=false,offset=0):Loop[] {
  if(!Number.isFinite(offset))throw Error('Ungültiger Silhouettenabstand.');
  const frame=silhouetteFrame(normal);
  const local=source.transform(frame.elements as Parameters<Solid['transform']>[0]);
  let projection:ReturnType<Solid['project']>|undefined;
  let filled:InstanceType<typeof lib.CrossSection>|undefined;
  let expanded:InstanceType<typeof lib.CrossSection>|undefined;
  try{
    projection=local.project();
    const loops=projection.toPolygons();
    // Positive contours fill holes. Union also removes any island outline
    // nested inside a now-filled hole, so it cannot become an unwanted cut.
    if(!includeHoles)filled=new lib.CrossSection(loops.filter(loop=>signedArea(loop)>0));
    const contour=filled??projection;
    if(offset===0)return contour.toPolygons();
    expanded=contour.offset(offset,'Round',2,64);
    return expanded.toPolygons();
  }finally{expanded?.delete();filled?.delete();projection?.delete();local.delete();}
}
