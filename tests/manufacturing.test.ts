import {beforeAll,describe,it,expect} from 'vitest';
import {getLib,makeSlice,extentAlong,type Solid} from '../src/geometry';
import {defaults} from '../src/model';
import {voronoiCells} from '../src/patterns';
import {spatialCore} from '../src/spatialCore';
import {connectStack,type StackPart} from '../src/connections';
import {bounds,signedArea,kerfContours,svgFor,dxfFor} from '../src/laser';
import {nestContours,nestedSVG} from '../src/nesting';
let lib:Awaited<ReturnType<typeof getLib>>;
beforeAll(async()=>{lib=await getLib();});
const valid=(solid:Solid)=>{expect(solid.status()).toBe('NoError');expect(solid.volume()).toBeGreaterThan(0);};
describe('Manufacturing geometry',()=>{
 it('partitions the rectangle into real Voronoi cells without gaps or overlaps',()=>{
  const cells=voronoiCells([0,0],[20,20],5);expect(cells.length).toBeGreaterThan(8);
  expect(cells.reduce((sum,p)=>sum+signedArea(p),0)).toBeCloseTo(400,4);
  expect(new Set(cells.map(p=>p.length)).size).toBeGreaterThan(1);
  const sections=cells.map(p=>new lib.CrossSection([p]));
  try{for(let i=0;i<sections.length;i++)for(let j=i+1;j<sections.length;j++){const common=sections[i].intersect(sections[j]);try{expect(common.area()).toBeLessThan(1e-6);}finally{common.delete();}}}finally{sections.forEach(s=>s.delete());}
 });
 it('creates a three-dimensional gyroid that changes with Z',()=>{
  const source=lib.Manifold.cube([12,12,8]),part=makeSlice(lib,source,0,8,{...defaults,pattern:'gyroid',density:55,cell:6,wall:0});
  const a=part.slice(1),b=part.slice(2.3);
  try{valid(part);expect(part.volume()).toBeLessThan(source.volume());expect(a.toPolygons()).not.toEqual(b.toPolygons());}finally{a.delete();b.delete();part.delete();source.delete();}
 });
 it.each(['grooves','dots','cross'] as const)('engraves %s only to the selected depth and retains dimensions',reliefPattern=>{
  const source=lib.Manifold.cube([20,20,5]),part=makeSlice(lib,source,0,5,{...defaults,relief:.4,reliefPattern,reliefSpacing:3,wall:1});
  const below=part.slice(4.5),top=part.slice(4.9);
  try{valid(part);expect(part.volume()).toBeLessThan(2000);expect(below.area()).toBeCloseTo(400,4);expect(top.area()).toBeLessThan(400);expect(part.boundingBox()).toEqual(source.boundingBox());}finally{below.delete();top.delete();part.delete();source.delete();}
 });
 it('builds a spatial interior with measured Euclidean wall distance',()=>{
  const source=lib.Manifold.sphere(6,32),core=spatialCore(lib,source,1,.3);
  try{valid(core);const mesh=core.getMesh();for(let i=0;i<mesh.vertProperties.length;i+=mesh.numProp)expect(Math.hypot(mesh.vertProperties[i],mesh.vertProperties[i+1],mesh.vertProperties[i+2])).toBeLessThan(5.05);}finally{core.delete();source.delete();}
 });
 it.each(['pins','plug'] as const)('creates matching %s connections without overlapping material',connectorMode=>{
  const raw=lib.Manifold.cube([20,20,5]),upper=raw.translate([0,0,5]);
  const parts:StackPart[]=[{solid:raw,start:0,end:5},{solid:upper,start:5,end:10}];
  const pins=connectStack(lib,parts,{...defaults,connectors:true,connectorMode,connectorDiameter:2,connectorDepth:1,connectorClearance:.2});
  const collision=parts[0].solid.intersect(parts[1].solid),a=parts[0].solid.slice(4.5),b=parts[1].solid.slice(5.5);
  try{parts.forEach(p=>valid(p.solid));expect(collision.volume()).toBeLessThan(1e-5);expect(pins).toHaveLength(connectorMode==='pins'?2:0);pins.forEach(pin=>valid(pin.solid));if(connectorMode==='pins'){const ab=a.subtract(b),ba=b.subtract(a);try{expect(ab.area()+ba.area()).toBeLessThan(1e-5);}finally{ab.delete();ba.delete();}}else expect(parts[0].solid.boundingBox().max[2]).toBeCloseTo(6,4);}finally{collision.delete();a.delete();b.delete();parts.forEach(p=>p.solid.delete());pins.forEach(p=>p.solid.delete());}
 });
 it('reports when real material has no room for connections',()=>{
  const lower=lib.Manifold.cube([2,2,5]),raw=lib.Manifold.cube([2,2,5]),upper=raw.translate([0,0,5]);raw.delete();
  try{expect(()=>connectStack(lib,[{solid:lower,start:0,end:5},{solid:upper,start:5,end:10}],{...defaults,connectors:true,connectorDiameter:3})).toThrow('fehlt Platz');}finally{lower.delete();upper.delete();}
 });
 it('anchors connectors beneath an engraved grip texture',()=>{
  const source=lib.Manifold.cube([20,20,10]),config={...defaults,relief:.3,reliefPattern:'cross' as const,connectorDiameter:3,connectorDepth:2,connectors:true,connectorMode:'plug' as const};
  const parts:StackPart[]=[{solid:makeSlice(lib,source,0,5,config),start:0,end:5},{solid:makeSlice(lib,source,5,10,config),start:5,end:10}];
  try{const pins=connectStack(lib,parts,config);expect(pins).toHaveLength(0);parts.forEach(part=>valid(part.solid));expect(parts[0].solid.boundingBox().max[2]).toBeCloseTo(7,4);}finally{parts.forEach(part=>part.solid.delete());source.delete();}
 });
 it('combines the centered imported-model settings with relief and sockets',()=>{
  const raw=lib.Manifold.cube([20,20,10]),source=raw.translate([-10,-10,0]);raw.delete();
  const config={...defaults,cell:3,wall:1.5,relief:.3,reliefPattern:'cross' as const,connectorDiameter:3,connectors:true,connectorMode:'plug' as const};
  const parts:StackPart[]=[{solid:makeSlice(lib,source,0,5,config),start:0,end:5},{solid:makeSlice(lib,source,5,10,config),start:5,end:10}];
  try{expect(connectStack(lib,parts,config)).toHaveLength(0);parts.forEach(part=>valid(part.solid));}finally{parts.forEach(part=>part.solid.delete());source.delete();}
 });
 it('applies relief in the chosen slicing frame rather than always world Z',()=>{
  const source=lib.Manifold.cube([10,20,30]),part=makeSlice(lib,source,0,5,{...defaults,relief:.3,reliefPattern:'grooves'},[1,0,0]);
  try{valid(part);expect(extentAlong(part,[1,0,0])[1]).toBeCloseTo(5,4);expect(part.volume()).toBeLessThan(3000);}finally{source.delete();part.delete();}
 });
});
describe('Kerf and contour nesting',()=>{
 const square:[number,number][][]=[[[0,0],[10,0],[10,10],[0,10]]];
 it('offsets all contours together, collapses small openings and exports compensated dimensions',()=>{
  const hole:[number,number][]=[[4,4],[4,6],[6,6],[6,4]],loops=kerfContours([...square,hole],4);
  expect(loops).toHaveLength(1);const b=bounds(loops);expect(b.maxX-b.minX).toBeCloseTo(14,5);expect(svgFor(square,.2)).toContain('width="16.200mm"');expect(dxfFor(square,.2)).toContain('$INSUNITS');
 });
 it('rotates parts to fit and adds sheets without dropping parts',()=>{
  const tall:[number,number][][]=[[[0,0],[4,0],[4,10],[0,10]]];
  const pages=nestContours([tall,tall,tall],12,6,1,.2);
  expect(pages).toHaveLength(3);expect(pages.flatMap(p=>p.parts)).toHaveLength(3);expect(pages[0].parts[0].rotation%180).toBe(90);expect(nestedSVG(pages[0])).toContain('width="12mm"');
 });
 it('interlocks concave contours using their actual shape rather than bounding rectangles',()=>{
  const l:[number,number][][]=[[[0,0],[8,0],[8,2],[2,2],[2,8],[0,8]]];
  const pages=nestContours([l,l],10,10,0,0);expect(pages).toHaveLength(1);
  const a=new lib.CrossSection(pages[0].parts[0].loops),b=new lib.CrossSection(pages[0].parts[1].loops),overlap=a.intersect(b);
  try{expect(overlap.area()).toBeLessThan(1e-6);}finally{a.delete();b.delete();overlap.delete();}
 });
 it('rejects oversize parts and invalid dimensions',()=>{expect(()=>nestContours([square],5,5)).toThrow('passt');expect(()=>nestContours([square],NaN,20)).toThrow('Ungültige');});
 it('honors the specified gap between compensated cutting contours',()=>{
  const pages=nestContours([square,square],25,13,2,.2);expect(pages).toHaveLength(1);
  const a=bounds(pages[0].parts[0].loops),b=bounds(pages[0].parts[1].loops);
  expect(Math.max(b.minX-a.maxX,a.minX-b.maxX,b.minY-a.maxY,a.minY-b.maxY)).toBeGreaterThanOrEqual(2-1e-6);
 });
});
