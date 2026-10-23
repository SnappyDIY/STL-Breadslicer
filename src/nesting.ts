import {loadedLib} from './geometry';
import {bounds,kerfContours,signedArea,type Loop} from './laser';
export type NestedPart={index:number;rotation:number;x:number;y:number;loops:Loop[]};
export type NestingPage={parts:NestedPart[];width:number;height:number};
/** Contour collision packing with quarter turns and automatic extra sheets.
 * Holes are reserved, so loose parts cannot accidentally be nested in cutouts. */
export function nestContours(sets:Loop[][],width:number,height:number,gap=3,kerf=0):NestingPage[]{
  if(![width,height,gap,kerf].every(Number.isFinite)||width<=0||height<=0||gap<0||kerf<0)throw Error('Ungültige Plattenmaße oder Abstände.');
  const lib=loadedLib(),pages:NestingPage[]=[],occupied:InstanceType<typeof lib.CrossSection>[][]=[];
  const shapes=sets.map((loops,index)=>({index,loops:kerfContours(loops,kerf)})).filter(item=>item.loops.length);
  shapes.sort((a,b)=>Math.abs(b.loops.reduce((s,p)=>s+signedArea(p),0))-Math.abs(a.loops.reduce((s,p)=>s+signedArea(p),0)));
  try{
    for(const item of shapes){
      let placed=false;
      for(let pageIndex=0;pageIndex<=pages.length&&!placed;pageIndex++){
        const fresh=pageIndex===pages.length,page=fresh?{parts:[],width,height}:pages[pageIndex];
        let best:{part:NestedPart;shape:InstanceType<typeof lib.CrossSection>;score:number}|undefined;
        for(const rotation of [0,90,180,270]){
          const angle=rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
          const rotated=item.loops.map(loop=>loop.map(([x,y])=>[x*c-y*s,x*s+y*c] as [number,number]));
          const b=bounds(rotated),w=b.maxX-b.minX,h=b.maxY-b.minY;
          if(w+gap>width+1e-6||h+gap>height+1e-6)continue;
          const local=rotated.map(loop=>loop.map(([x,y])=>[x-b.minX,y-b.minY] as [number,number]));
          const raw=new lib.CrossSection(local.filter(loop=>signedArea(loop)>0)),padded=raw.offset(gap/2,'Round',2,24);raw.delete();
          try{
            const xs=new Set<number>([gap/2]),ys=new Set<number>([gap/2]);
            for(const existing of page.parts){
              const box=bounds(existing.loops);xs.add(box.maxX+gap);ys.add(box.maxY+gap);xs.add(box.minX);ys.add(box.minY);
              const moving=local.filter(p=>signedArea(p)>0).flat(),fixed=existing.loops.filter(p=>signedArea(p)>0).flat();
              // Boundary contact candidates allow concave silhouettes to interlock.
              const strideA=Math.max(1,Math.ceil(moving.length/12)),strideB=Math.max(1,Math.ceil(fixed.length/12));
              for(let i=0;i<moving.length;i+=strideA)for(let j=0;j<fixed.length;j+=strideB){xs.add(fixed[j][0]-moving[i][0]+gap);ys.add(fixed[j][1]-moving[i][1]+gap);}
            }
            const bounded=(values:Set<number>,limit:number)=>[...values].filter(x=>x>=gap/2-1e-6&&x<=limit+1e-6).sort((a,b)=>a-b).filter((_,i,all)=>i%Math.max(1,Math.ceil(all.length/160))===0);
            const xx=bounded(xs,width-gap/2-w),yy=bounded(ys,height-gap/2-h);
            let found=false;
            for(const y of yy){if(found)break;for(const x of xx){
              const translated=padded.translate([x,y]);let collision=false;
              try{for(const [i,other] of (occupied[pageIndex]??[]).entries()){
                const box=bounds(page.parts[i].loops);
                if(x+w+gap<=box.minX||box.maxX+gap<=x||y+h+gap<=box.minY||box.maxY+gap<=y)continue;
                const intersection=translated.intersect(other);try{if(intersection.area()>1e-6){collision=true;break;}}finally{intersection.delete();}
              }}catch(error){translated.delete();throw error;}
              if(collision){translated.delete();continue;}
              const score=(y+h)*width+x+w;
              if(!best||score<best.score){best?.shape.delete();best={part:{index:item.index,rotation,x,y,loops:local.map(loop=>loop.map(([px,py])=>[px+x,py+y]))},shape:translated,score};}else translated.delete();
              found=true;break;
            }}
          }finally{padded.delete();}
        }
        if(best){if(fresh){pages.push(page);occupied.push([]);}page.parts.push(best.part);occupied[pageIndex].push(best.shape);placed=true;}
        else if(fresh)throw Error(`Scheibe ${item.index+1} passt auch gedreht nicht auf die Platte.`);
      }
    }
    return pages;
  }finally{occupied.flat().forEach(shape=>shape.delete());}
}

export function nestedSVG(page:NestingPage):string{
  const shapes=page.parts.map(part=>`<g id="slice-${part.index+1}" data-rotation="${part.rotation}">${[...part.loops].sort((a,b)=>signedArea(a)-signedArea(b)).map(loop=>`<path d="${loop.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(4)} ${(page.height-y).toFixed(4)}`).join(' ')} Z"/>`).join('')}</g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}mm" height="${page.height}mm" viewBox="0 0 ${page.width} ${page.height}"><g fill="none" stroke="red" stroke-width="0.05">${shapes}</g></svg>`;
}
