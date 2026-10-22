import {beforeAll, describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import JSZip from 'jszip';
import type {Vec3} from 'manifold-3d';
import {getLib, toSolid, toGeometry, makeSlice, extentAlong, normalizeNormal, type Solid} from '../src/geometry';
import {makeBunnyGeometry} from '../src/bunny';
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
 it.each<Vec3>([[0,0,1],[0,0,9],[1,0,0],[0,1,0],[1,2,3]])('conserves volume along normal %j',async(...args)=>{
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
 it('rejects an open mesh',()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));try{expect(()=>toSolid(g,lib)).toThrow()}finally{g.dispose()}});
 it.each(['honeycomb','grid','voronoi','gyroid'] as const)('creates valid %s cutouts',pattern=>{
  const source=lib.Manifold.cube([60,60,60]);let part:Solid|undefined;
  try{part=makeSlice(lib,source,10,15,{...defaults,pattern});checkSolid(part);expect(part.volume()).toBeLessThan(18000);const g=toGeometry(part);try{checkEdges(g)}finally{g.dispose()}}finally{part?.delete();source.delete()}
 });
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
