import * as THREE from 'three';

/** A locally generated, watertight stylized sitting rabbit. Dimensions in millimeters.
 * The implicit surface is polygonized using marching tetrahedra (no external asset/license).
 */
export function makeBunnyGeometry(resolution = 54): THREE.BufferGeometry {
  const nx=resolution, ny=Math.round(resolution*.83), nz=Math.round(resolution*1.22);
  if(!Number.isInteger(resolution)||resolution<12||resolution>100)throw Error('Auflösung muss zwischen 12 und 100 liegen.');
  const lo=[-45,-38,-15], hi=[50,40,112];
  const dx=(hi[0]-lo[0])/nx,dy=(hi[1]-lo[1])/ny,dz=(hi[2]-lo[2])/nz;
  type V=[number,number,number];
  const ell=(p:V,c:V,r:V)=>Math.hypot((p[0]-c[0])/r[0],(p[1]-c[1])/r[1],(p[2]-c[2])/r[2])-1;
  const smooth=(a:number,b:number,k:number)=>{const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25};
  const field=(p:V)=>{
    let d=ell(p,[8,0,31],[28,22,30]);
    d=smooth(d,ell(p,[-15,0,53],[17,16,19]),.32);
    d=smooth(d,ell(p,[-23,-1,47],[12,13,10]),.25);
    d=smooth(d,ell(p,[-22,-9,79],[7,6,22]),.18);
    d=smooth(d,ell(p,[-8,9,81],[7,6,19]),.18);
    d=smooth(d,ell(p,[26,3,14],[12,15,11]),.25);
    d=smooth(d,ell(p,[-12,-12,9],[12,9,9]),.25);
    d=smooth(d,ell(p,[-12,12,9],[11,8,9]),.25);
    d=smooth(d,ell(p,[33,2,44],[9,10,10]),.2);
    return d;
  };
  const strideX=nx+1,strideY=(nx+1)*(ny+1);
  const values=new Float32Array((nx+1)*(ny+1)*(nz+1));
  const at=(x:number,y:number,z:number)=>x+y*strideX+z*strideY;
  for(let z=0;z<=nz;z++)for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++)values[at(x,y,z)]=field([lo[0]+x*dx,lo[1]+y*dy,lo[2]+z*dz]);
  const corners:V[]=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
  const tets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
  const pos:number[]=[];
  const interpolate=(a:V,b:V,fa:number,fb:number):V=>{// Canonical edge order gives identical float32 vertices across tetrahedra.
    if(a[0]>b[0]||(a[0]===b[0]&&(a[1]>b[1]||(a[1]===b[1]&&a[2]>b[2])))){[a,b]=[b,a];[fa,fb]=[fb,fa]}
    const t=fa/(fa-fb);return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]};
  const triangle=(a:V,b:V,c:V)=>{
    const ab=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const ac=new THREE.Vector3(c[0]-a[0],c[1]-a[1],c[2]-a[2]);
    const n=ab.cross(ac);const mid:V=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3];
    const eps=.05,grad=new THREE.Vector3(field([mid[0]+eps,mid[1],mid[2]])-field([mid[0]-eps,mid[1],mid[2]]),field([mid[0],mid[1]+eps,mid[2]])-field([mid[0],mid[1]-eps,mid[2]]),field([mid[0],mid[1],mid[2]+eps])-field([mid[0],mid[1],mid[2]-eps]));
    if(n.dot(grad)<0)[b,c]=[c,b];pos.push(...a,...b,...c);
  };
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const points=corners.map(([cx,cy,cz]):V=>[lo[0]+(x+cx)*dx,lo[1]+(y+cy)*dy,lo[2]+(z+cz)*dz]);
    const f=corners.map(([cx,cy,cz])=>values[at(x+cx,y+cy,z+cz)]);
    if(f.every(v=>v>=0)||f.every(v=>v<0))continue;
    for(const tet of tets){const inside=tet.filter(i=>f[i]<0),outside=tet.filter(i=>f[i]>=0);if(inside.length===0||inside.length===4)continue;
      const cut=(a:number,b:number)=>interpolate(points[a],points[b],f[a],f[b]);
      if(inside.length===1){const a=inside[0];triangle(cut(a,outside[0]),cut(a,outside[1]),cut(a,outside[2]));}
      else if(inside.length===3){const a=outside[0];triangle(cut(a,inside[0]),cut(a,inside[1]),cut(a,inside[2]));}
      else {const [a,b]=inside,[c,d]=outside;const p=cut(a,c),q=cut(a,d),r=cut(b,c),s=cut(b,d);triangle(p,q,r);triangle(q,s,r);}
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geometry.computeVertexNormals();return geometry;
}

