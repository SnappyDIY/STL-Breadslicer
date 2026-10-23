import type {getLib,Solid} from './geometry';
import type {Config} from './model';

/** Engraved grip textures on the upper cut face; slab dimensions stay unchanged. */
export function applyRelief(lib:Awaited<ReturnType<typeof getLib>>,piece:Solid,start:number,end:number,c:Config):Solid{
  const depth=c.relief,spacing=c.reliefSpacing??3;
  if(!Number.isFinite(depth)||depth<0||depth>(end-start)*.45)throw Error('Relieftiefe darf höchstens 45 % der Scheibendicke betragen.');
  if(!Number.isFinite(spacing)||spacing<.5)throw Error('Reliefabstand muss mindestens 0,5 mm betragen.');
  if(!depth)return piece;
  const section=piece.slice(end-1e-5),inset=section.offset(-Math.max(.3,c.wall),'Round');section.delete();
  const tools:Solid[]=[];let mask:Solid|undefined,joined:Solid|undefined,clipped:Solid|undefined;
  try{
    if(inset.isEmpty())return piece;
    const b=piece.boundingBox(),width=spacing*.25,top=end-depth;
    if((b.max[0]-b.min[0])*(b.max[1]-b.min[1])/spacing**2>1600)throw Error('Relief zu fein. Musterabstand erhöhen.');
    const addBox=(size:[number,number,number],position:[number,number,number])=>{const raw=lib.Manifold.cube(size);try{tools.push(raw.translate(position));}finally{raw.delete();}};
    if(c.reliefPattern==='dots'){
      for(let x=Math.ceil(b.min[0]/spacing)*spacing;x<=b.max[0];x+=spacing)for(let y=Math.ceil(b.min[1]/spacing)*spacing;y<=b.max[1];y+=spacing){const raw=lib.Manifold.cylinder(depth+.1,width,width,20);try{tools.push(raw.translate([x,y,top]));}finally{raw.delete();}}
    }else{
      for(let x=Math.ceil(b.min[0]/spacing)*spacing;x<=b.max[0];x+=spacing)addBox([width,b.max[1]-b.min[1]+2,depth+.1],[x-width/2,b.min[1]-1,top]);
      if(c.reliefPattern==='cross')for(let y=Math.ceil(b.min[1]/spacing)*spacing;y<=b.max[1];y+=spacing)addBox([b.max[0]-b.min[0]+2,width,depth+.1],[b.min[0]-1,y-width/2,top]);
    }
    if(!tools.length)return piece;
    const raw=inset.extrude(depth+.2);try{mask=raw.translate([0,0,top-.05]);}finally{raw.delete();}
    joined=lib.Manifold.union(tools);clipped=joined.intersect(mask);
    return piece.subtract(clipped);
  }finally{inset.delete();tools.forEach(tool=>tool.delete());mask?.delete();joined?.delete();clipped?.delete();}
}
