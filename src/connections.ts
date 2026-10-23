import type {getLib,Solid} from './geometry';
import type {Config} from './model';
import {bounds,type Loop} from './laser';
type Lib=Awaited<ReturnType<typeof getLib>>;
export type StackPart={solid:Solid;start:number;end:number};
export type Accessory={name:string;solid:Solid};
const inside=(x:number,y:number,loops:Loop[])=>{let yes=false;for(const loop of loops)for(let i=0,j=loop.length-1;i<loop.length;j=i++){const a=loop[i],b=loop[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
function cylinder(lib:Lib,x:number,y:number,start:number,end:number,radius:number){const raw=lib.Manifold.cylinder(end-start,radius,radius,40);try{return raw.translate([x,y,start]);}finally{raw.delete();}}
function fits(part:Solid,tool:Solid){const common=part.intersect(tool);try{return common.volume()>=tool.volume()*(1-1e-5);}finally{common.delete();}}

/** Two matching connectors per adjacent interface, verified in actual material.
 * Mutates the owned stack; returned dowels are separate printable solids. */
export function connectStack(lib:Lib,parts:StackPart[],c:Config):Accessory[]{
  const accessories:Accessory[]=[];
  if(!c.connectors)return accessories;
  const diameter=c.connectorDiameter,clearance=c.connectorClearance??.15,requested=c.connectorDepth??2;
  if(!Number.isFinite(diameter)||diameter<=0||!Number.isFinite(clearance)||clearance<0||!Number.isFinite(requested)||requested<=0)throw Error('Ungültige Verbindungsmaße.');
  const r=diameter/2,hole=r+clearance/2;
  try{
    for(let i=0;i<parts.length-1;i++){
      const a=parts[i],b=parts[i+1];if(Math.abs(a.end-b.start)>.001)throw Error('Verbindungen benötigen unmittelbar benachbarte Scheiben.');
      const z=a.end,depth=Math.min(requested,(a.end-a.start)*.4,(b.end-b.start)*.4);
      const textureDepth=c.relief??0;
      if(textureDepth>=depth-.1)throw Error('Für Verbindungen unter dem Relief eine größere Einstecktiefe oder geringere Relieftiefe wählen.');
      const sa=a.solid.slice(z-textureDepth-1e-4),sb=b.solid.slice(z+1e-4),joint=sa.intersect(sb);sa.delete();sb.delete();
      const safe=joint.offset(-hole-.25,'Round');joint.delete();
      let loops:Loop[];try{loops=safe.toPolygons();}finally{safe.delete();}
      const box=bounds(loops),points:[number,number][]=[],candidates:[number,number][]=[];
      for(let x=0;x<13;x++)for(let y=0;y<13;y++){const px=box.minX+(box.maxX-box.minX)*(x+.5)/13,py=box.minY+(box.maxY-box.minY)*(y+.5)/13;if(inside(px,py,loops))candidates.push([px,py]);}
      // Deterministic far-apart pairs resist twisting. Verify pocket depth in 3D.
      candidates.sort((p,q)=>p[0]-q[0]||p[1]-q[1]);
      for(let attempt=0;attempt<2;attempt++){
        const ordered=attempt===0?candidates:[...candidates].sort((p,q)=>Math.hypot(q[0]-points[0][0],q[1]-points[0][1])-Math.hypot(p[0]-points[0][0],p[1]-points[0][1]));
        for(const [x,y] of ordered){
          if(points.some(p=>Math.hypot(p[0]-x,p[1]-y)<diameter+clearance+1))continue;
          const lower=cylinder(lib,x,y,z-depth,z-textureDepth-1e-4,hole+.15),upper=cylinder(lib,x,y,z+1e-4,z+depth+Math.min(clearance,depth*.1),hole+.15);
          let valid:boolean;try{valid=fits(a.solid,lower)&&fits(b.solid,upper);}finally{lower.delete();upper.delete();}
          if(valid){points.push([x,y]);break;}
        }
        if(!points.length)break;
      }
      if(points.length<2)throw Error(`Zwischen Scheibe ${i+1} und ${i+2} fehlt Platz für zwei Verbindungen. Durchmesser/Tiefe verkleinern oder Modell vergrößern.`);
      for(const [j,[x,y]] of points.entries()){
        if(c.connectorMode==='plug'){
          const peg=cylinder(lib,x,y,z-Math.min(depth,textureDepth+.3),z+depth,r),socket=cylinder(lib,x,y,z-.001,z+depth+Math.min(clearance,depth*.1),hole);
          try{const nextA=a.solid.add(peg),nextB=b.solid.subtract(socket);a.solid.delete();b.solid.delete();a.solid=nextA;b.solid=nextB;}finally{peg.delete();socket.delete();}
        }else{
          const lower=cylinder(lib,x,y,z-depth,z+.001,hole),upper=cylinder(lib,x,y,z-.001,z+depth+Math.min(clearance,depth*.1),hole);
          try{const nextA=a.solid.subtract(lower),nextB=b.solid.subtract(upper);a.solid.delete();b.solid.delete();a.solid=nextA;b.solid=nextB;}finally{lower.delete();upper.delete();}
          accessories.push({name:`passstift_${i+1}_${j+1}.stl`,solid:cylinder(lib,0,0,0,depth*2-Math.min(clearance,depth*.2),r)});
        }
      }
    }
    return accessories;
  }catch(error){accessories.forEach(item=>item.solid.delete());throw error;}
}
