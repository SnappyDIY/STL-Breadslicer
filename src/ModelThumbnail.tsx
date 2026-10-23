import React,{useEffect,useState} from 'react';
import * as THREE from 'three';
import {Icon} from './ui';

/** Render a static preview only when the applied source geometry changes. */
export function ModelThumbnail({geometry,filename}:{geometry:THREE.BufferGeometry|null;filename:string}){
  const [preview,setPreview]=useState<{geometry:THREE.BufferGeometry;url:string}|null>(null);
  useEffect(()=>{
    if(!geometry)return;
    let renderer:THREE.WebGLRenderer|undefined,material:THREE.MeshStandardMaterial|undefined;
    try{
      renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
      renderer.setSize(160,200);renderer.setPixelRatio(1);
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,.8,.01,10000);
      camera.up.set(0,0,1);
      const box=new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute),center=box.getCenter(new THREE.Vector3());
      const radius=Math.max(box.getSize(new THREE.Vector3()).length()/2,.01);
      const distance=radius/Math.sin(THREE.MathUtils.degToRad(32/2)*.8)*1.08;
      camera.position.copy(center).addScaledVector(new THREE.Vector3(-.7,-1.9,.95).normalize(),distance);
      camera.near=radius/100;camera.far=distance+radius*5;camera.updateProjectionMatrix();camera.lookAt(center);
      material=new THREE.MeshStandardMaterial({color:0xd6d5c9,roughness:.65});
      scene.add(new THREE.Mesh(geometry,material),new THREE.HemisphereLight(0xffffff,0x586f79,2));
      const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.copy(center).add(new THREE.Vector3(-1,-2,3).multiplyScalar(radius*3));scene.add(light);
      renderer.render(scene,camera);
      setPreview({geometry,url:renderer.domElement.toDataURL('image/png')});
    }catch{setPreview(null);}
    finally{material?.dispose();renderer?.dispose();renderer?.forceContextLoss();}
  },[geometry]);
  return <div className="model-thumb">{preview?.geometry===geometry?<img src={preview.url} alt={`STL-Vorschau: ${filename}`}/>:<span role="img" aria-label="Modellvorschau nicht verfügbar"><Icon name="cube" size={40}/></span>}</div>;
}
