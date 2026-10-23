import {beforeAll,describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {detectPlanarFaces,alignGeometryToFace,faceBoundaryDirection,alignmentTargets,type AlignmentTarget} from '../src/alignment';
import {getLib,toGeometry,toSolid} from '../src/geometry';
import {projectSilhouette} from '../src/silhouette';
import {bounds} from '../src/laser';
let lib:Awaited<ReturnType<typeof getLib>>;
beforeAll(async()=>{lib=await getLib();});
function tiltedBox(){const source=lib.Manifold.cube([10,20,30]);try{const g=toGeometry(source);g.rotateX(.41);g.rotateY(.73);g.rotateZ(-.25);g.translate(100,-50,75);return g;}finally{source.delete();}}
describe('Planar face alignment',()=>{
 it('combines a finely triangulated, slightly uneven surface into one averaged reference',()=>{
  const g=new THREE.PlaneGeometry(10,10,8,8),p=g.getAttribute('position');
  for(let i=0;i<p.count;i++)p.setZ(i,.008*Math.sin(Math.PI*(p.getX(i)+5)/10)*Math.sin(Math.PI*(p.getY(i)+5)/10));
  const before=Array.from(p.array);
  try{const faces=detectPlanarFaces(g);expect(faces).toHaveLength(1);expect(faces[0].triangles).toHaveLength(128);expect(faces[0].area).toBeCloseTo(100,2);expect(faces[0].normal[2]).toBeCloseTo(1,6);expect(Array.from(p.array)).toEqual(before);}finally{g.dispose();}
 });
 it('does not chain its way around a curved cylinder',()=>{
  const g=new THREE.CylinderGeometry(10,10,4,64);
  try{const faces=detectPlanarFaces(g),sides=faces.filter(face=>Math.abs(face.normal[1])<.5);expect(sides.length).toBeGreaterThan(8);expect(sides.every(face=>face.triangles.length<20)).toBe(true);expect(faces.flatMap(face=>face.triangles)).toHaveLength(g.index!.count/3);}finally{g.dispose();}
 });
 it('keeps disconnected nearby coplanar surfaces separate',()=>{
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,0,0,1,1,0,0,1,0,1.001,0,0,2.001,0,0,2.001,1,0,1.001,0,0,2.001,1,0,1.001,1,0],3));
  try{const faces=detectPlanarFaces(g);expect(faces).toHaveLength(2);expect(faces.every(face=>face.triangles.length===2)).toBe(true);}finally{g.dispose();}
 });
 it('detects the six complete planes of a tilted STL independent of vertex normals',()=>{
  const g=tiltedBox();g.deleteAttribute('normal');
  try{const faces=detectPlanarFaces(g);expect(faces).toHaveLength(6);expect(faces.map(face=>face.area).sort((a,b)=>a-b)).toEqual(expect.arrayContaining([expect.closeTo(200,2),expect.closeTo(300,2),expect.closeTo(600,2)]));expect(faces.every(face=>face.triangles.length===2)).toBe(true);}finally{g.dispose();}
 });
 it.each(Object.keys(alignmentTargets) as AlignmentTarget[])('aligns a chosen face to %s, preserving volume and recentering',target=>{
  const g=tiltedBox(),faces=detectPlanarFaces(g),face=faces[0];const before=Array.from(g.getAttribute('position').array);
  const aligned=alignGeometryToFace(g,face.normal,target),solid=toSolid(aligned,lib);
  try{
   const detected=detectPlanarFaces(aligned),matching=detected.find(candidate=>candidate.triangles.includes(face.triangles[0]))!;
   expect(new THREE.Vector3(...matching.normal).dot(new THREE.Vector3(...alignmentTargets[target].normal))).toBeCloseTo(1,6);
   expect(solid.volume()).toBeCloseTo(6000,1);expect(solid.status()).toBe('NoError');
   aligned.computeBoundingBox();const b=aligned.boundingBox!;expect(b.min.z).toBeCloseTo(0,5);expect(b.min.x+b.max.x).toBeCloseTo(0,5);expect(b.min.y+b.max.y).toBeCloseTo(0,5);
   expect(Array.from(g.getAttribute('position').array)).toEqual(before);
  }finally{solid.delete();aligned.dispose();g.dispose();}
 });
 it('supports indexed geometry, opposite normals and in-plane quarter turns',()=>{
  const g=new THREE.BoxGeometry(10,20,30),faces=detectPlanarFaces(g),face=faces.find(f=>f.normal[2]>.99)!;
  const aligned=alignGeometryToFace(g,face.normal,'bottom',90),solid=toSolid(aligned,lib);
  try{const b=bounds(projectSilhouette(lib,solid,[0,0,1]));expect(b.maxX-b.minX).toBeCloseTo(20,4);expect(b.maxY-b.minY).toBeCloseTo(10,4);}finally{g.dispose();aligned.dispose();solid.delete();}
 });
 it('uses a boundary edge instead of the diagonal to fully restore axes on a tilted box',()=>{
  const g=tiltedBox(),face=detectPlanarFaces(g)[0],tangent=faceBoundaryDirection(g,face)!;
  const aligned=alignGeometryToFace(g,face.normal,'bottom',0,tangent);
  try{aligned.computeBoundingBox();const size=aligned.boundingBox!.getSize(new THREE.Vector3());expect(size.x).toBeCloseTo(30,3);expect(size.y).toBeCloseTo(20,3);expect(size.z).toBeCloseTo(10,3);expect(new THREE.Vector3(...tangent).dot(new THREE.Vector3(...face.normal))).toBeCloseTo(0,5);}finally{g.dispose();aligned.dispose();}
 });
 it('ignores degenerate triangles and rejects invalid alignment directions',()=>{
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,0,0,0,0,0,0],3));
  try{expect(detectPlanarFaces(g)).toEqual([]);expect(()=>alignGeometryToFace(g,[0,0,0],'front')).toThrow();expect(()=>alignGeometryToFace(g,[1,0,0],'front',NaN)).toThrow();}finally{g.dispose();}
 });
 it('does not roll a model whose chosen face already points forward',()=>{
  // A rotated boundary edge must not silently become a new horizontal axis.
  const g=new THREE.BoxGeometry(10,20,30);g.rotateY(.6);g.translate(12,-5,20);
  const normal:[number,number,number]=[0,-1,0];
  const aligned=alignGeometryToFace(g,normal,'front');
  try{
   const p=g.getAttribute('position'),q=aligned.getAttribute('position');
   // Compare relative vertices: centering is allowed; an extra rotation is not.
   for(let i=1;i<p.count;i++)for(let axis=0;axis<3;axis++)expect(q.getComponent(i,axis)-q.getComponent(0,axis)).toBeCloseTo(p.getComponent(i,axis)-p.getComponent(0,axis),4);
  }finally{g.dispose();aligned.dispose();}
 });
 it('corrects a vertical front plane with yaw only, without tipping world Z',()=>{
  const g=new THREE.BoxGeometry(10,20,30);g.rotateZ(.4);
  const normal=new THREE.Vector3(0,-1,0).applyAxisAngle(new THREE.Vector3(0,0,1),.4).toArray() as [number,number,number];
  const aligned=alignGeometryToFace(g,normal,'front');
  try{const p=g.getAttribute('position'),q=aligned.getAttribute('position');for(let i=1;i<p.count;i++)expect(q.getZ(i)-q.getZ(0)).toBeCloseTo(p.getZ(i)-p.getZ(0),5);}finally{g.dispose();aligned.dispose();}
 });
 it('preserves every Z coordinate when keeping a slanted face upright, ignoring edge roll',()=>{
  const g=new THREE.BoxGeometry(10,20,30);g.rotateZ(.4);g.translate(0,0,15);
  const normal:[number,number,number]=[.4,-.8,.6];
  const aligned=alignGeometryToFace(g,normal,'front',90,[1,0,0],true);
  try{const p=g.getAttribute('position'),q=aligned.getAttribute('position');for(let i=0;i<p.count;i++)expect(q.getZ(i)).toBeCloseTo(p.getZ(i),5);}finally{g.dispose();aligned.dispose();}
 });
 it('rejects a horizontal face in upright front mode but allows laying it down',()=>{
  const g=new THREE.BoxGeometry(10,20,30);
  try{expect(()=>alignGeometryToFace(g,[0,0,1],'front',0,undefined,true)).toThrow('Aufrecht lassen');const aligned=alignGeometryToFace(g,[0,0,1],'bottom',0,undefined,true);aligned.dispose();}finally{g.dispose();}
 });
});
