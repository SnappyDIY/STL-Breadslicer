import {beforeAll,describe,expect,it} from 'vitest';
import type {Vec3} from 'manifold-3d';
import {getLib,type Solid} from '../src/geometry';
import {projectSilhouette,silhouetteDirections,silhouetteFrame} from '../src/silhouette';
import {bounds,signedArea,svgFor,dxfFor} from '../src/laser';
let lib:Awaited<ReturnType<typeof getLib>>;
beforeAll(async()=>{lib=await getLib();},30000);
const area=(loops:[number,number][][])=>loops.reduce((sum,loop)=>sum+signedArea(loop),0);

describe('Whole-model orthographic silhouette',()=>{
 it.each(['front','side','top'] as const)('preserves millimeter dimensions in the %s view',direction=>{
  const source=lib.Manifold.cube([10,20,30]);
  try{
   const loops=projectSilhouette(lib,source,silhouetteDirections[direction].normal);
   const b=bounds(loops),expected={front:[10,30],side:[20,30],top:[10,20]}[direction];
   expect(b.maxX-b.minX).toBeCloseTo(expected[0],5);expect(b.maxY-b.minY).toBeCloseTo(expected[1],5);
   expect(area(loops)).toBeCloseTo(expected[0]*expected[1],4);
   expect(source.volume()).toBeCloseTo(6000,4);
   expect(svgFor(loops)).toContain(`width="${(expected[0]+6).toFixed(3)}mm"`);
   expect(dxfFor(loops)).toContain('LWPOLYLINE');
  }finally{source.delete();}
 });
 it('preserves concavity rather than using a bounding rectangle or convex hull',()=>{
  const source=lib.Manifold.extrude([[[0,0],[30,0],[30,10],[10,10],[10,30],[0,30]]],8);
  try{const loops=projectSilhouette(lib,source,[0,0,1]);expect(loops).toHaveLength(1);expect(area(loops)).toBeCloseTo(500,3);}finally{source.delete();}
 });
 it('combines projected regions at different depths into a single outline',()=>{
  const a=lib.Manifold.cube([20,20,2]),raw=lib.Manifold.cube([20,20,2]),b=raw.translate([10,0,10]);raw.delete();
  const source=a.add(b);a.delete();b.delete();
  try{const loops=projectSilhouette(lib,source,[0,0,1],true);expect(loops).toHaveLength(1);expect(area(loops)).toBeCloseTo(600,3);}finally{source.delete();}
 });
 it('keeps through-openings optionally, fills them by default, and removes nested islands',()=>{
  const outer=lib.Manifold.cylinder(5,10,10,64),inner=lib.Manifold.cylinder(5,4,4,64),ring=outer.subtract(inner);
  const island=lib.Manifold.cylinder(5,1,1,32),source=ring.add(island);outer.delete();inner.delete();ring.delete();island.delete();
  try{
   const withHoles=projectSilhouette(lib,source,[0,0,1],true),filled=projectSilhouette(lib,source,[0,0,1]);
   expect(withHoles).toHaveLength(3);expect(withHoles.filter(loop=>signedArea(loop)<0)).toHaveLength(1);
   expect(filled).toHaveLength(1);expect(area(filled)).toBeGreaterThan(area(withHoles));
  }finally{source.delete();}
 });
 it('does not show an opening when another surface blocks the light at another depth',()=>{
  const outer=lib.Manifold.cylinder(5,10,10,64),inner=lib.Manifold.cylinder(5,4,4,64),ring=outer.subtract(inner);
  const raw=lib.Manifold.cylinder(1,10,10,64),cap=raw.translate([0,0,10]),source=ring.add(cap);
  outer.delete();inner.delete();ring.delete();raw.delete();cap.delete();
  try{const loops=projectSilhouette(lib,source,[0,0,1],true);expect(loops).toHaveLength(1);}finally{source.delete();}
 });
 it('supports arbitrary viewing normals with no perspective scale factor',()=>{
  const source=lib.Manifold.cube([10,20,30]);
  try{const loops=projectSilhouette(lib,source,[1,2,3]);expect(area(loops)).toBeCloseTo(1800/Math.sqrt(14),3);}finally{source.delete();}
 });
 it('rejects invalid projection directions',()=>{
  for(const normal of [[0,0,0],[NaN,0,1]] as Vec3[])expect(()=>silhouetteFrame(normal)).toThrow();
 });
});

describe('Silhouette DXF kerf and units',()=>{
 it('declares millimeters and applies the same outward kerf as SVG',()=>{
  const square:[number,number][][]=[[[0,0],[10,0],[10,10],[0,10]]];
  const dxf=dxfFor(square,.2);
  expect(dxf).toContain('$INSUNITS\n70\n4');
  expect(dxf).toContain('10\n-0.1\n20\n-0.1\n');
  expect(()=>dxfFor(square,NaN)).toThrow();
 });
});

describe('Silhouette contour distance',()=>{
 it('expands and shrinks a projected rectangle by the requested mm on each side',()=>{
  const source=lib.Manifold.cube([10,20,30]);
  try{
   for(const distance of [2,-2,0]){
    const loops=projectSilhouette(lib,source,[0,0,1],false,distance),b=bounds(loops);
    expect(b.maxX-b.minX).toBeCloseTo(10+2*distance,4);
    expect(b.maxY-b.minY).toBeCloseTo(20+2*distance,4);
    expect(svgFor(loops)).toContain(`width="${(16+2*distance).toFixed(3)}mm"`);
   }
   expect(projectSilhouette(lib,source,[0,0,1],false,-6)).toHaveLength(0);
   expect(()=>projectSilhouette(lib,source,[0,0,1],false,NaN)).toThrow();
   expect(source.volume()).toBeCloseTo(6000,4);
  }finally{source.delete();}
 });
 it('contracts through-holes for positive distance and merges nearby islands',()=>{
  const outer=lib.Manifold.cube([30,30,5]),inner=lib.Manifold.cube([10,10,5]).translate([10,10,0]),ring=outer.subtract(inner);
  try{
   const loops=projectSilhouette(lib,ring,[0,0,1],true,2),holes=loops.filter(loop=>signedArea(loop)<0);
   expect(holes).toHaveLength(1);
   const b=bounds(holes);expect(b.maxX-b.minX).toBeCloseTo(6,4);
   expect(projectSilhouette(lib,ring,[0,0,1],true,6)).toHaveLength(1);
  }finally{outer.delete();inner.delete();ring.delete();}
  const a=lib.Manifold.cube([10,10,5]),b=lib.Manifold.cube([10,10,5]).translate([12,0,0]),source=a.add(b);
  try{expect(projectSilhouette(lib,source,[0,0,1],false,0)).toHaveLength(2);expect(projectSilhouette(lib,source,[0,0,1],false,2)).toHaveLength(1);}finally{a.delete();b.delete();source.delete();}
 });
});
