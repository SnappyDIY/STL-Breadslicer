import type {Config} from './model';
import type {getLib,Solid} from './geometry';
type Lib=Awaited<ReturnType<typeof getLib>>;
type Point=[number,number];

/** Deterministic Voronoi diagram, clipped by the bisectors of the actual sites. */
export function voronoiCells(min:Point,max:Point,spacing:number):Point[][]{
  const sites:Point[]=[],noise=(a:number,b:number)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n)-.5;};
  for(let x=Math.floor(min[0]/spacing)-1;x<=Math.ceil(max[0]/spacing)+1;x++)for(let y=Math.floor(min[1]/spacing)-1;y<=Math.ceil(max[1]/spacing)+1;y++)sites.push([(x+.5+noise(x,y)*.65)*spacing,(y+.5+noise(y,x+19)*.65)*spacing]);
  if(sites.length>900)throw Error('Zu viele Voronoi-Zellen. Zellgröße erhöhen.');
  return sites.map((site,i)=>{
    let polygon:Point[]=[[min[0],min[1]],[max[0],min[1]],[max[0],max[1]],[min[0],max[1]]];
    for(let j=0;j<sites.length&&polygon.length;j++){
      if(i===j)continue;const other=sites[j],nx=other[0]-site[0],ny=other[1]-site[1],limit=(other[0]**2+other[1]**2-site[0]**2-site[1]**2)/2;
      const clipped:Point[]=[];
      for(let k=0;k<polygon.length;k++){
        const a=polygon[k],b=polygon[(k+1)%polygon.length],da=a[0]*nx+a[1]*ny-limit,db=b[0]*nx+b[1]*ny-limit;
        if(da<=1e-9)clipped.push(a);
        if((da<0&&db>0)||(da>0&&db<0)){const t=da/(da-db);clipped.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
      }
      polygon=clipped;
    }
    return polygon;
  }).filter(p=>p.length>=3);
}

export function advancedCutters(lib:Lib,b:[number[],number[]],z0:number,z1:number,c:Config):Solid|null{
  if(c.pattern==='gyroid'){
    const k=2*Math.PI/c.cell,step=Math.min(c.cell/8,(z1-z0+2)/4),size=[b[1][0]-b[0][0],b[1][1]-b[0][1],z1-z0+2];
    if(size.reduce((n,v)=>n*Math.ceil(v/step+2),1)>1_500_000)throw Error('Gyroid zu fein. Zellgröße erhöhen.');
    const threshold=1.5*(1-c.density/100);
    return lib.Manifold.levelSet(([x,y,z])=>Math.abs(Math.sin(k*x)*Math.cos(k*y)+Math.sin(k*y)*Math.cos(k*z)+Math.sin(k*z)*Math.cos(k*x))-threshold,{min:[b[0][0]-step,b[0][1]-step,z0-1],max:[b[1][0]+step,b[1][1]+step,z1+1]},step);
  }
  if(c.pattern!=='voronoi')return null;
  const cells=voronoiCells([b[0][0],b[0][1]],[b[1][0],b[1][1]],c.cell*1.5),scale=Math.sqrt(c.density/100);
  const shapes=cells.map(points=>{const center=points.reduce((s,p)=>[s[0]+p[0]/points.length,s[1]+p[1]/points.length] as Point,[0,0] as Point);return points.map(p=>[center[0]+(p[0]-center[0])*scale,center[1]+(p[1]-center[1])*scale] as Point);});
  const raw=lib.Manifold.extrude(shapes,z1-z0+2);
  try{return raw.translate([0,0,z0-1]);}finally{raw.delete();}
}
