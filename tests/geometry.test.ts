import {beforeAll, describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import JSZip from 'jszip';
import type {Vec3} from 'manifold-3d';
import {getLib, toSolid, toGeometry, makeSlice, extentAlong, normalizeNormal, scaleGeometryToDimensions, centerGeometryOnBed, sliceContoursAtMidpoint, type Solid} from '../src/geometry';
import {makeBunnyGeometry} from '../src/bunny';
import {spatialCore} from '../src/spatialCore';
import {boundaries, defaults, validateBoundaries} from '../src/model';
import {stlBlob, threeMF} from '../src/export';
import {svgFor, signedArea} from '../src/laser';
let lib: Awaited<ReturnType<typeof getLib>>;
beforeAll(async()=>{lib=await getLib()},30000);
const config={...defaults,pattern:'solid' as const};
function checkSolid(s:Solid){expect(s.status()).toBe('NoError');expect(s.isEmpty()).toBe(false);expect(s.volume()).toBeGreaterThan(0)}
/** Every geometric edge must occur twice with opposite directions. */
function checkEdges(g:THREE.BufferGeometry){
 const p=g.getAttribute('position'),edges=new Map<string,{count:number,balance:number}>();
 const key=(i:number)=>[p.getX(i),p.getY(i),p.getZ(i)].join(',');
 const count=g.index?.count??p.count;
 for(let i=0;i<count;i+=3){const ids=[0,1,2].map(j=>key(g.index?g.index.getX(i+j):i+j));
  for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3];expect(a).not.toBe(b);const k=[a,b].sort().join('|');const e=edges.get(k)??{count:0,balance:0};e.count++;e.balance+=a<b?1:-1;edges.set(k,e)}
 }
 expect(edges.size).toBeGreaterThan(0);
 for(const edge of edges.values()){expect(edge.count).toBe(2);expect(edge.balance).toBe(0)}
}
async function stlRoundTrip(s:Solid){
 const g=toGeometry(s);
 try{checkEdges(g);const data=await stlBlob(g).arrayBuffer(),parsed=new STLLoader().parse(data);
  try{const restored=toSolid(parsed,lib);try{checkSolid(restored);expect(Math.abs(restored.volume()-s.volume())/s.volume()).toBeLessThan(1e-4)}finally{restored.delete()}}finally{parsed.dispose()}
 }finally{g.dispose()}
}
describe('Exact solid slicing',()=>{
 it.each<Vec3>([[0,0,1],[0,0,9],[1,0,0],[0,1,0],[1,2,3]])('conserves volume along normal (%s, %s, %s)',async(...args)=>{
  const n=args as Vec3,source=lib.Manifold.cube([60,60,60],true),[min,max]=extentAlong(source,n),cuts=boundaries(min,max,5);let volume=0;
  try{if(n.filter(x=>x!==0).length===1)expect(cuts).toHaveLength(13);
   for(let i=0;i<cuts.length-1;i++){const part=makeSlice(lib,source,cuts[i],cuts[i+1],config,n);
    try{checkSolid(part);const [a,b]=extentAlong(part,n);expect(a).toBeGreaterThanOrEqual(cuts[i]-1e-4);expect(b).toBeLessThanOrEqual(cuts[i+1]+1e-4);volume+=part.volume();await stlRoundTrip(part)}finally{part.delete()}}
   expect(volume).toBeCloseTo(source.volume(),2);
  }finally{source.delete()}
 },60000);
 it('rejects invalid normals and non-finite boundaries',()=>{
  expect(()=>normalizeNormal([0,0,0])).toThrow();expect(()=>normalizeNormal([NaN,1,0])).toThrow();
  expect(()=>boundaries(NaN,60,5)).toThrow();expect(()=>validateBoundaries([0,NaN,60],0,60)).toThrow();
 });
 it('rejects non-finite pattern input before constructing cutters',()=>{
  const source=lib.Manifold.cube([60,60,60]);try{expect(()=>makeSlice(lib,source,0,5,{...defaults,wall:Infinity})).toThrow()}finally{source.delete()}
 });
 it('rejects an open mesh',()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));try{expect(()=>toSolid(g,lib)).toThrow()}finally{g.dispose()}});
 it.each(['honeycomb','grid','voronoi','gyroid'] as const)('creates valid %s cutouts',pattern=>{
  const source=lib.Manifold.cube([60,60,60]);let part:Solid|undefined;
  try{part=makeSlice(lib,source,10,15,{...defaults,pattern});checkSolid(part);expect(part.volume()).toBeLessThan(18000);const g=toGeometry(part);try{checkEdges(g)}finally{g.dispose()}}finally{part?.delete();source.delete()}
 },30000);
});
describe('Procedural bunny acceptance',()=>{
 it('is watertight at default resolution and produces twelve valid 5 mm slabs at 60 mm height',async()=>{
  const g=makeBunnyGeometry();g.computeBoundingBox();const box=g.boundingBox!;g.scale(60/(box.max.z-box.min.z),60/(box.max.z-box.min.z),60/(box.max.z-box.min.z));g.computeBoundingBox();g.translate(0,0,-g.boundingBox!.min.z);
  let source:Solid|undefined;
  try{checkEdges(g);source=toSolid(g,lib);checkSolid(source);await stlRoundTrip(source);
   const cuts=boundaries(0,60,5);let volume=0;expect(cuts).toHaveLength(13);
   for(let i=0;i<12;i++){const part=makeSlice(lib,source,cuts[i],cuts[i+1],config);
    try{checkSolid(part);volume+=part.volume();await stlRoundTrip(part);const section=part.slice((cuts[i]+cuts[i+1])/2);try{expect(section.area()).toBeGreaterThan(0);expect(svgFor(section.toPolygons())).toContain('mm')}finally{section.delete()}}finally{part.delete()}}
   expect(Math.abs(volume-source.volume())/source.volume()).toBeLessThan(1e-5);
   for(const angles of [[90,0,0],[0,90,0],[23,41,17]] as Vec3[]){const rotated=source.rotate(angles);try{const [lo,hi]=extentAlong(rotated,[0,0,1]),b=boundaries(lo,hi,5);let v=0;for(let i=0;i<b.length-1;i++){const p=makeSlice(lib,rotated,b[i],b[i+1],config);try{checkSolid(p);v+=p.volume()}finally{p.delete()}}expect(Math.abs(v-rotated.volume())/rotated.volume()).toBeLessThan(1e-5)}finally{rotated.delete()}}
   console.info('Bunny validation:',JSON.stringify({height:60,slabs:12,triangles:source.numTri(),volume:source.volume(),slabVolume:volume}));
  }finally{source?.delete();g.dispose()}
 },120000);
});
describe('Laser and manufacturing exports',()=>{
 it('preserves concave sections, holes and millimeter SVG dimensions',()=>{
  const outer: [number,number][]=[[0,0],[30,0],[30,10],[10,10],[10,30],[0,30]],hole:[number,number][]=[[2,2],[2,5],[5,5],[5,2]];
  const s=lib.Manifold.extrude([outer,hole],5);
  try{checkSolid(s);const section=s.slice(2.5);try{const loops=section.toPolygons();expect(loops).toHaveLength(2);expect(loops.reduce((a,l)=>a+signedArea(l),0)).toBeCloseTo(491,4);const svg=svgFor(loops);expect(svg).toContain('width="36.000mm"');expect(svg).toContain('height="36.000mm"');expect(svg.match(/<path /g)).toHaveLength(2)}finally{section.delete()}}finally{s.delete()}
 });
 it('writes shared vertex indices into a manifold 3MF mesh',async()=>{
  const g=new THREE.BoxGeometry(10,20,60);
  try{const zip=await JSZip.loadAsync(await (await threeMF([g])).arrayBuffer());const xml=await zip.file('3D/3dmodel.model')!.async('string');expect(xml).toContain('unit="millimeter"');expect(xml.match(/<vertex /g)).toHaveLength(8);expect(xml.match(/<triangle /g)).toHaveLength(12);
   const vertices=[...xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].map(m=>m.slice(1).map(Number));const faces=[...xml.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].flatMap(m=>m.slice(1).map(Number));const parsed=new THREE.BufferGeometry();parsed.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flat(),3));parsed.setIndex(faces);try{checkEdges(parsed);const solid=toSolid(parsed,lib);try{expect(solid.volume()).toBeCloseTo(12000,3)}finally{solid.delete()}}finally{parsed.dispose()}
  }finally{g.dispose()}
 });
});

describe('Contour-following pattern rim',()=>{
 it('keeps the exterior contour intact on a curved slab',()=>{
  const source=lib.Manifold.cylinder(5,20,20,64);
  const part=makeSlice(lib,source,0,5,{...defaults,cell:3,wall:2,density:65,pattern:'honeycomb'});
  const original=source.slice(2.5),section=part.slice(2.5);
  try{
   checkSolid(part);
   const expected=original.toPolygons().filter(p=>signedArea(p)>0).reduce((a,p)=>a+signedArea(p),0);
   const loops=section.toPolygons(),outer=loops.filter(p=>signedArea(p)>0).reduce((a,p)=>a+signedArea(p),0);
   expect(outer).toBeCloseTo(expected,2);
   const holes=loops.filter(p=>signedArea(p)<0);expect(holes.length).toBeGreaterThan(0);
   for(const loop of holes)for(const [x,y] of loop)expect(Math.hypot(x,y)).toBeLessThanOrEqual(18.01);
  }finally{original.delete();section.delete();part.delete();source.delete()}
 });
});

describe('Patterned demo acceptance',()=>{
 it('creates all twelve honeycomb slabs including small tip sections',()=>{
  const geometry=makeBunnyGeometry(32);geometry.computeBoundingBox();const box=geometry.boundingBox!,base=box.min.z,scale=60/(box.max.z-box.min.z);geometry.scale(scale,scale,scale);geometry.translate(0,0,-base*scale);
  const source=toSolid(geometry,lib),[lo,hi]=extentAlong(source,[0,0,1]),cuts=boundaries(lo,hi,5),core=spatialCore(lib,source,1.5,.5);
  try{expect(cuts).toHaveLength(13);for(let i=0;i<cuts.length-1;i++){const part=makeSlice(lib,source,cuts[i],cuts[i+1],{...defaults,cell:3,wall:1.5,pattern:'honeycomb'},[0,0,1],core);try{checkSolid(part);}finally{part.delete();}}}finally{core.delete();source.delete();geometry.dispose();}
 },30000);
});

describe('Physical model dimensions',()=>{
 it.each<[number,number,number]>([[20,40,60],[25,12,90]])('scales to %s × %s × %s mm and preserves the source',async(x,y,z)=>{
  const original=new THREE.BoxGeometry(10,20,30);original.translate(8,14,20);
  const before=Array.from(original.getAttribute('position').array);
  const scaled=scaleGeometryToDimensions(original,[x,y,z]);
  const solid=toSolid(scaled,lib);
  try{
   checkSolid(solid);const box=solid.boundingBox();
   for(const [axis,target] of [x,y,z].entries())expect(box.max[axis]-box.min[axis]).toBeCloseTo(target,4);
   expect(box.min).toEqual([3,4,5]);
   expect(solid.volume()).toBeCloseTo(x*y*z,2);
   expect(Array.from(original.getAttribute('position').array)).toEqual(before);
   await stlRoundTrip(solid);
   const cuts=boundaries(box.min[2],box.max[2],5);let volume=0;
   for(let i=0;i<cuts.length-1;i++){const slab=makeSlice(lib,solid,cuts[i],cuts[i+1],config);try{checkSolid(slab);volume+=slab.volume();}finally{slab.delete();}}
   expect(volume).toBeCloseTo(solid.volume(),2);
  }finally{solid.delete();scaled.dispose();original.dispose();}
 });
 it('rejects zero, negative and non-finite target dimensions',()=>{
  const geometry=new THREE.BoxGeometry(10,20,30);
  try{for(const targets of [[0,20,30],[-1,20,30],[10,NaN,30],[10,20,Infinity]] as [number,number,number][])expect(()=>scaleGeometryToDimensions(geometry,targets)).toThrow();}finally{geometry.dispose();}
 });
});

describe('Centered import and center-plane laser contours',()=>{
 it('centers an offset STL in XY and grounds it at zero without changing dimensions',async()=>{
  const input=new THREE.BoxGeometry(20,10,30);input.translate(120,-70,200);
  const inputPositions=Array.from(input.getAttribute('position').array);
  const centered=centerGeometryOnBed(input),solid=toSolid(centered.geometry,lib);
  try{
   const box=solid.boundingBox();expect(box.min).toEqual([-10,-5,0]);expect(box.max).toEqual([10,5,30]);
   expect(centered.translation).toEqual([-120,70,-185]);expect(solid.volume()).toBeCloseTo(6000,3);
   expect(Array.from(input.getAttribute('position').array)).toEqual(inputPositions);
   await stlRoundTrip(solid);
   // Move saved manual cuts with the model, including a reversed slicing axis.
   for(const normal of [[1,0,0],[0,0,-1]] as Vec3[]){
    const before=toSolid(input,lib);try{
     const extent=extentAlong(before,normal),saved=boundaries(...extent,6);
     const shift=centered.translation.reduce((sum,v,i)=>sum+v*normal[i],0);
     const restored=saved.map(value=>value+shift);validateBoundaries(restored,...extentAlong(solid,normal));
     for(let i=1;i<saved.length;i++)expect(restored[i]-restored[i-1]).toBeCloseTo(saved[i]-saved[i-1],8);
    }finally{before.delete();}
   }
  }finally{solid.delete();centered.geometry.dispose();input.dispose();}
 });
 it('uses Z=15 for a 6 mm slab from 12 to 18 mm on a 30 mm taper',()=>{
  const source=lib.Manifold.cylinder(30,15,0,96);
  const slab=makeSlice(lib,source,12,18,config);
  const middle=source.slice(15),bottom=source.slice(12),top=source.slice(18);
  try{
   const loops=sliceContoursAtMidpoint(slab,12,18),area=loops.reduce((sum,loop)=>sum+signedArea(loop),0);
   expect(area).toBeCloseTo(middle.area(),4);
   expect(Math.abs(area-bottom.area())).toBeGreaterThan(50);
   expect(Math.abs(area-top.area())).toBeGreaterThan(50);
   expect(svgFor(loops)).toContain('width="21.000mm"');
   const [lo,hi]=extentAlong(slab,[0,0,1]);expect(lo).toBeCloseTo(12,5);expect(hi).toBeCloseTo(18,5);
  }finally{middle.delete();bottom.delete();top.delete();slab.delete();source.delete();}
 });
});
