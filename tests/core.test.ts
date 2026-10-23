import{describe,it,expect}from'vitest';import{boundaries,validateBoundaries,sliceMidpoint,uniformSlicePlan,resizeUniformSlices,defaults}from'../src/model';import{signedArea,offsetLoop,shelfNest,dxfFor}from'../src/laser';
describe('Slicing',()=>{it('60mm in 12 slices',()=>{const b=boundaries(0,60,5);expect(b).toHaveLength(13);expect(b[12]).toBe(60);validateBoundaries(b,0,60)});it('remainder',()=>expect(boundaries(0,62,5).at(-1)).toBe(62));it('rejects crossing',()=>expect(()=>validateBoundaries([0,10,9,60],0,60)).toThrow())});describe('Laser',()=>{const square:[[number,number],[number,number],[number,number],[number,number]]=[[0,0],[10,0],[10,10],[0,10]];it('area',()=>expect(signedArea(square)).toBe(100));it('kerf expansion',()=>expect(offsetLoop(square,.1)[0][0]).toBeLessThan(0));it('shelf packing',()=>expect(shelfNest([{width:20,height:10},{width:20,height:10}],100,50)).toHaveLength(2));it('DXF polyline',()=>expect(dxfFor([square])).toContain('LWPOLYLINE'))});
describe('Floating-point slice extents',()=>{
  it('absorbs a tiny residual slab after scaling an STL',()=>{
    const cuts=boundaries(-0.000001,60.000001,5);
    expect(cuts).toHaveLength(13);
    expect(cuts.at(-1)).toBe(60.000001);
    validateBoundaries(cuts,-0.000001,60.000001);
  });
  it('preserves a manufacturable residual slab',()=>{
    const cuts=boundaries(0,60.1,5);
    expect(cuts).toHaveLength(14);
    validateBoundaries(cuts,0,60.1);
  });
});

describe('Slice midpoint convention',()=>{
 it('places five 6 mm slabs at 3, 9, 15, 21 and 27 mm',()=>{
  const cuts=boundaries(0,30,6);
  expect(cuts.slice(0,-1).map((start,i)=>sliceMidpoint(start,cuts[i+1]))).toEqual([3,9,15,21,27]);
  const center=sliceMidpoint(cuts[2],cuts[3]);expect(center-3).toBe(12);expect(center+3).toBe(18);
 });
 it('uses the actual center of a thinner remainder and rejects invalid planes',()=>{
  expect(sliceMidpoint(30,32)).toBe(31);
  for(const [start,end] of [[15,15],[18,12],[NaN,18],[12,Infinity]])expect(()=>sliceMidpoint(start,end)).toThrow();
 });
});

describe('Coupled equal slice count and thickness',()=>{
 it('makes two 10 mm slabs from a 20 mm extent',()=>{
  const plan=uniformSlicePlan(0,20,{kind:'count',value:2});
  expect(plan.thickness).toBe(10);expect(plan.boundaries).toEqual([0,10,20]);
 });
 it('derives two slabs when the thickness is 10 mm across 20 mm',()=>{
  const plan=uniformSlicePlan(-10,10,{kind:'thickness',value:10});
  expect(plan.thickness).toBe(10);expect(plan.boundaries).toEqual([-10,0,10]);
 });
 it('adjusts a non-dividing thickness so all slabs remain equal',()=>{
  const plan=uniformSlicePlan(0,20,{kind:'thickness',value:6});
  expect(plan.thickness).toBe(5);expect(plan.boundaries).toEqual([0,5,10,15,20]);
 });
 it('retains the chosen count after a resize or slicing-axis change',()=>{
  const old={...defaults,sliceSizing:'count' as const,...uniformSlicePlan(0,20,{kind:'count',value:2})};
  const resized=resizeUniformSlices(old,0,30);expect(resized.thickness).toBe(15);expect(resized.boundaries).toEqual([0,15,30]);
  const otherAxis=resizeUniformSlices(resized,-10,10);expect(otherAxis.thickness).toBe(10);expect(otherAxis.boundaries).toEqual([-10,0,10]);
 });
 it('uses the chosen thickness to derive count when the model changes',()=>{
  const old={...defaults,sliceSizing:'thickness' as const,...uniformSlicePlan(0,20,{kind:'thickness',value:10})};
  const resized=resizeUniformSlices(old,0,30);expect(resized.thickness).toBe(10);expect(resized.boundaries).toEqual([0,10,20,30]);
 });
 it('ignores floating-point slivers and places the last boundary at the model end',()=>{
  const plan=uniformSlicePlan(0,20.0000001,{kind:'thickness',value:10});
  expect(plan.boundaries).toHaveLength(3);expect(plan.boundaries.at(-1)).toBe(20.0000001);expect(plan.thickness*2).toBeCloseTo(20.0000001,8);
 });
 it('rejects fractional counts, excessive counts, invalid extents and tiny thicknesses',()=>{
  for(const count of [0,2.5,151,NaN])expect(()=>uniformSlicePlan(0,20,{kind:'count',value:count})).toThrow();
  expect(()=>uniformSlicePlan(0,0,{kind:'count',value:2})).toThrow();
  expect(()=>uniformSlicePlan(0,1,{kind:'count',value:100})).toThrow();
 });
});

describe('Thickness request across slicing axes',()=>{
 it('avoids accumulating rounding changes when switching axes and back',()=>{
  const original=resizeUniformSlices({...defaults,thickness:5},0,60);
  const alongX=resizeUniformSlices(original,-22.88,22.88);
  expect(alongX.boundaries).toHaveLength(11);
  expect(alongX.thickness).toBeCloseTo(4.576,5);
  const restored=resizeUniformSlices(alongX,0,60);
  expect(restored.boundaries).toHaveLength(13);expect(restored.thickness).toBe(5);
 });
});
