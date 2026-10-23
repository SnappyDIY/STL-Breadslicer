import React, {useEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {sliceMidpoint} from './model';
import {bounds, signedArea, kerfContours, type Loop} from './laser';

export function Icon({name, size=18}: {name:string;size?:number}) {
  const paths:Record<string,React.ReactNode>={
    folder:<><path d="M3 7h6l2 2h10v11H3z"/><path d="M3 7V4h7l2 3"/></>,
    save:<><path d="M4 3h14l3 3v15H3V3z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/></>,
    download:<><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    home:<><path d="m3 10 9-7 9 7M6 9v12h12V9M10 21v-7h4v7"/></>,
    fit:<><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/><rect x="8" y="8" width="8" height="8" rx="2"/></>,
    plus:<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/></>,
    minus:<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6"/></>,
    settings:<><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3z"/><circle cx="12" cy="12" r="3"/></>,
    cube:<><path d="m12 2 9 5v10l-9 5-9-5V7zm0 10 9-5m-9 5L3 7m9 5v10"/></>,
    layers:<><path d="m12 3 10 5-10 5L2 8zm-10 9 10 5 10-5M2 16l10 5 10-5"/></>,
    laser:<><path d="m15 2-3 7h6l-9 13 3-10H6z"/></>,
    rotate:<><path d="M4 9a8 8 0 1 1 0 6M4 3v6h6"/></>,
    check:<path d="m5 12 4 4L19 6"/>,
    chevron:<path d="m6 9 6 6 6-6"/>,
    toast:<g strokeLinejoin="round"><path d="M4 10C.8 8 .9 4.1 5 3h7c4.2 1 4.3 5 .8 7v9H4Z" fill="#c48a4b" stroke="#a66a33" strokeWidth="1.1"/><path d="M6 9C3.7 8 3.7 5.6 6 5h5c2.4.6 2.4 3 .2 4v8H6Z" fill="#edbb72" stroke="none"/><path d="M9 12C5.8 10 5.9 6.1 10 5h7c4.2 1 4.3 5 .8 7v9H9Z" fill="#fff0cd" stroke="#d89d55" strokeWidth="1.3"/><path d="M11 12c-2.1-.7-2.7-3-.3-4.4 1.3-.8 4.3-.8 5.6 0 2.4 1.4 1.8 3.7-.3 4.4v6.9h-5Z" fill="#ffe3a9" stroke="none"/><g fill="#e7bb78" stroke="none"><circle cx="12" cy="13" r=".55"/><circle cx="15" cy="11" r=".45"/><circle cx="14.6" cy="16" r=".6"/></g></g>,
    bunny:<><path fill="currentColor" stroke="none" d="M7 10C2-2 9-3 10 9h3C14-3 21-2 17 11c9 12-17 15-14 2 1-2 2-3 4-3Z"/><circle cx="8" cy="15" r="1" fill="#1b292e" stroke="none"/><circle cx="15" cy="15" r="1" fill="#1b292e" stroke="none"/><path d="m10 18 2 1 1-1" stroke="#1b292e"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]??paths.cube}</svg>;
}
export type ViewMode='original'|'cuts'|'exploded';
export type CameraCommand={action:'fit'|'home'|'in'|'out';id:number};
const EMPTY_MESHES:THREE.BufferGeometry[]=[];const EMPTY_CUTS:number[]=[];const Z_NORMAL:[number,number,number]=[0,0,1];
export function Scene({source,meshes=EMPTY_MESHES,selected=0,selectedDistance,mode='original',cuts=EMPTY_CUTS,normal=Z_NORMAL,light=false,wireframe=false,command,picking=false,selectedTriangles=EMPTY_CUTS,onFacePick}: {
  source?:THREE.BufferGeometry|null;meshes?:THREE.BufferGeometry[];selected?:number;selectedDistance?:number;mode?:ViewMode;cuts?:number[];normal?:[number,number,number];light?:boolean;wireframe?:boolean;command?:CameraCommand;picking?:boolean;selectedTriangles?:number[];onFacePick?:(triangle:number)=>void;
}) {
  const hostRef=useRef<HTMLDivElement>(null);
  const actionRef=useRef<(action:CameraCommand['action'])=>void>(()=>{});
  const pickRef=useRef(onFacePick);pickRef.current=onFacePick;
  const highlightRef=useRef<(triangles:number[])=>void>(()=>{});
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    const host=hostRef.current!;
    let renderer:THREE.WebGLRenderer;
    try {renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});} catch {setFailed(true);return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
    host.appendChild(renderer.domElement);
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(36,1,.05,10000);camera.up.set(0,0,1);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;
    scene.add(new THREE.HemisphereLight(0xffffff,0x566774,1.7));
    const key=new THREE.DirectionalLight(0xfff4e3,2.3);key.position.set(-60,-100,160);scene.add(key);
    const rim=new THREE.DirectionalLight(0xa9f0ed,.8);rim.position.set(60,90,100);scene.add(rim);
    const model=new THREE.Group();scene.add(model);
    const owned:THREE.BufferGeometry[]=[];
    const sourceBounds=source?new THREE.Box3().setFromBufferAttribute(source.getAttribute('position') as THREE.BufferAttribute):null;
    const sourceSize=sourceBounds?.getSize(new THREE.Vector3())??new THREE.Vector3(60,60,60);
    const scale=Math.max(...sourceSize.toArray(),10);
    const n=new THREE.Vector3(...normal).normalize();
    const hasParts=meshes.length>0 && mode==='exploded';
    if(hasParts)meshes.forEach((geometry,i)=>{
      const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:i===selected?0xf4be64:i%2?0xa4c6cb:0xd2dbdc,roughness:.4,metalness:.12,wireframe}));
      mesh.position.copy(n).multiplyScalar(i*scale*.035);model.add(mesh);
    });
    else if(source){
      let joined=source;if(!light&&!picking){const smooth=source.clone();smooth.deleteAttribute('normal');joined=mergeVertices(smooth,1e-5);smooth.dispose();joined.computeVertexNormals();owned.push(joined);}
      model.add(new THREE.Mesh(joined,new THREE.MeshStandardMaterial({color:light?0xe8eeed:0xe4e2d8,roughness:.38,metalness:.16,wireframe})));
    }
    const pickMeshes=model.children.filter(o=>o instanceof THREE.Mesh) as THREE.Mesh[];
    let highlight:THREE.Mesh|undefined;
    const clearHighlight=()=>{if(highlight){scene.remove(highlight);highlight.geometry.dispose();(highlight.material as THREE.Material).dispose();highlight=undefined;}};
    highlightRef.current=triangles=>{
      clearHighlight();if(!source||!triangles.length)return;
      const p=source.getAttribute('position'),positions=new Float32Array(triangles.length*9);
      triangles.forEach((face,i)=>{for(let j=0;j<3;j++){const k=source.index?source.index.getX(face*3+j):face*3+j;positions.set([p.getX(k),p.getY(k),p.getZ(k)],i*9+j*3);}});
      const patch=new THREE.BufferGeometry();patch.setAttribute('position',new THREE.BufferAttribute(positions,3));
      highlight=new THREE.Mesh(patch,new THREE.MeshBasicMaterial({color:0x00d8c7,transparent:true,opacity:.8,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,depthWrite:false}));scene.add(highlight);
    };
    highlightRef.current(selectedTriangles);
    const raycaster=new THREE.Raycaster();let pointerStart:[number,number]|null=null;
    const pointerDown=(event:PointerEvent)=>{pointerStart=event.button===0?[event.clientX,event.clientY]:null;};
    const pointerUp=(event:PointerEvent)=>{
      if(!picking||!pointerStart||Math.hypot(event.clientX-pointerStart[0],event.clientY-pointerStart[1])>5)return;
      pointerStart=null;const rect=renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
      const hit=raycaster.intersectObjects(pickMeshes,false)[0];if(hit?.faceIndex!=null)pickRef.current?.(hit.faceIndex);
    };
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);
    renderer.domElement.style.cursor=picking?'crosshair':'';
    const modelBounds=new THREE.Box3().setFromObject(model);
    const center=modelBounds.isEmpty()?new THREE.Vector3():modelBounds.getCenter(new THREE.Vector3());
    const radius=Math.max(modelBounds.isEmpty()?40:modelBounds.getSize(new THREE.Vector3()).length()*.5,5);
    const grid=new THREE.GridHelper(scale*3,30,light?0x9cabb3:0x52636c,light?0x81939e:0x3a4b54);grid.rotation.x=Math.PI/2;
    const gridMaterials=Array.isArray(grid.material)?grid.material:[grid.material];gridMaterials.forEach(m=>{m.transparent=true;m.opacity=light?.25:.5;});grid.position.set(center.x,center.y,(modelBounds.isEmpty()?0:modelBounds.min.z)-.1);scene.add(grid);
    if(mode==='cuts'&&source&&cuts.length>1){
      const localBox=sourceBounds!.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(n,new THREE.Vector3(0,0,1))));const planeSize=localBox.getSize(new THREE.Vector3());
      cuts.slice(0,-1).map((start,i)=>sliceMidpoint(start,cuts[i+1])).forEach((distance,i)=>{
        const active=selectedDistance===undefined?i===selected:Math.abs(distance-selectedDistance)<1e-5;
        const planeGeometry=new THREE.PlaneGeometry(planeSize.x*1.17,planeSize.y*1.2);owned.push(planeGeometry);
        const plane=new THREE.Mesh(planeGeometry,new THREE.MeshBasicMaterial({color:active?0xffbf49:0x13c8c4,transparent:true,opacity:active?.32:.095,side:THREE.DoubleSide,depthWrite:false}));
        plane.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),n);
        plane.position.copy(center).addScaledVector(n,distance-center.dot(n));
        const edgeGeometry=new THREE.EdgesGeometry(planeGeometry);owned.push(edgeGeometry);
        const edge=new THREE.LineSegments(edgeGeometry,new THREE.LineBasicMaterial({color:active?0xffc54f:0x16b9b9,transparent:true,opacity:.8}));plane.add(edge);scene.add(plane);
      });
    }
    const fit=()=>{controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(-.7,-1.9,.95).normalize().multiplyScalar(radius*3.5));camera.near=radius/200;camera.far=radius*100;camera.updateProjectionMatrix();controls.update();};fit();
    actionRef.current=action=>{if(action==='fit'||action==='home')fit();else{camera.position.sub(controls.target).multiplyScalar(action==='in'?.8:1.25).add(controls.target);controls.update();}};
    const resize=()=>{const w=host.clientWidth,h=host.clientHeight;camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();renderer.setSize(w,h);};
    const observer=new ResizeObserver(resize);observer.observe(host);resize();
    let frame=0;const render=()=>{frame=requestAnimationFrame(render);controls.update();renderer.render(scene,camera);};render();
    return()=>{highlightRef.current=()=>{};clearHighlight();renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);cancelAnimationFrame(frame);observer.disconnect();controls.dispose();scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose());}});grid.geometry.dispose();owned.forEach(g=>g.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  },[source,meshes,selected,selectedDistance,mode,cuts,normal,light,wireframe,picking]);
  useEffect(()=>{highlightRef.current(selectedTriangles);},[selectedTriangles]);
  useEffect(()=>{if(command)actionRef.current(command.action);},[command]);
  return <div className={'scene '+(light?'scene-light':'')} ref={hostRef}>{failed&&<p className="scene-error">Die 3D-Ansicht benötigt WebGL. 2D-Konturen und Exporte sind weiterhin verfügbar.</p>}</div>;
}
const EMPTY:Loop[]=[];
export function Contours({loops=EMPTY,small=false,kerf=0,filled=false,shadow=false}:{loops?:Loop[];small?:boolean;kerf?:number;filled?:boolean;shadow?:boolean}) {
  if(!loops.length)return <svg className="contours" viewBox="0 0 200 80" role="img" aria-label="Noch keine Kontur"><text x="100" y="42" textAnchor="middle" fontSize="10" fill="#819199">Noch keine Kontur</text></svg>;
  const corrected=kerfContours(loops,kerf);
  const b=bounds(corrected),pad=Math.max(b.maxX-b.minX,b.maxY-b.minY)*.08+1;
  return <svg className={'contours '+(small?'thumbnail':'')} viewBox={`${b.minX-pad} ${-b.maxY-pad} ${b.maxX-b.minX+pad*2} ${b.maxY-b.minY+pad*2}`} role="img" aria-label={small?'Querschnitt der Scheibe':shadow?'Silhouette des gesamten Modells':'Laserkontur der aktiven Scheibe'}>
    {filled&&<path d={loops.map(loop=>loop.map(([x,y],i)=>`${i?'L':'M'}${x},${-y}`).join(' ')+'Z').join(' ')} fill={small?'#80959a':shadow?'#263d43':'#e8f4f3'} fillRule="evenodd"/>}
    {corrected.map((loop,i)=>{const area=signedArea(loop);const points=loop;return <path key={i} d={points.map(([x,y],j)=>`${j?'L':'M'}${x},${-y}`).join(' ')+'Z'} fill="none" stroke={small?'#edf3f5':area>=0?'#1e3037':'#e34e58'} strokeWidth={small?1:.95} vectorEffect="non-scaling-stroke"/>;})}
    {!loops.length&&<text x="0" y="0" textAnchor="middle" fontSize="3" fill="#819199">Keine Scheibe ausgewählt</text>}
  </svg>;
}
