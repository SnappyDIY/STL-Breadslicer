import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import * as THREE from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {getLib,toSolid,toGeometry,makeSlice,extentAlong,scaleGeometryToDimensions,centerGeometryOnBed,sliceContoursAtMidpoint,type Solid} from './geometry';
import {defaults,boundaries,validateBoundaries,sliceMidpoint,uniformSlicePlan,resizeUniformSlices,type Config,type ProjectFile} from './model';
import {svgFor,dxfFor,bounds,type Loop} from './laser';
import {stlBlob,download,zipFiles,threeMF} from './export';
import {makeBunnyGeometry} from './bunny';
import {Icon,Scene,Contours,type ViewMode,type CameraCommand} from './ui';
import {NumberField} from './NumberField';
import {projectSilhouette,silhouetteDirections,type SilhouetteDirection} from './silhouette';
import {SilhouettePanel} from './SilhouettePanel';
import {detectPlanarFaces,alignGeometryToFace,faceBoundaryDirection,type AlignmentTarget} from './alignment';
import {AlignmentPanel} from './AlignmentPanel';
import {ModelThumbnail} from './ModelThumbnail';
import {spatialCore} from './spatialCore';
import {connectStack,type StackPart} from './connections';
import {ManufacturingOptions} from './ManufacturingOptions';
import {nestContours,nestedSVG} from './nesting';
import './style.css';

type Part={solid:Solid;geometry:THREE.BufferGeometry;localGeometry:THREE.BufferGeometry;start:number;end:number;loops:Loop[]};
type Vec3=[number,number,number];
const AXES:Record<string,Vec3>={X:[1,0,0],Y:[0,1,0],Z:[0,0,1]};
const release=(parts:Part[])=>parts.forEach(p=>{p.solid.delete();p.geometry.dispose();p.localGeometry.dispose();});
const labels:Record<Config['pattern'],string>={solid:'Massiv',honeycomb:'Honeycomb',grid:'Gitter',voronoi:'Voronoi',gyroid:'Gyroid'};

function App(){
  const accessoriesRef=useRef<{name:string;geometry:THREE.BufferGeometry}[]>([]);
  const [accessoryCount,setAccessoryCount]=useState(0);
  const [config,setConfig]=useState<Config>({...defaults,cell:3,wall:1.5});
  const [source,setSource]=useState<Solid|null>(null),[geometry,setGeometry]=useState<THREE.BufferGeometry|null>(null);
  const [filename,setFilename]=useState('Beispielhase.stl'),[raw,setRaw]=useState<ArrayBuffer|null>(null);
  const [rotation,setRotation]=useState<Vec3>([0,0,0]),[axis,setAxis]=useState('Z'),[reverse,setReverse]=useState(false);
  const [parts,setParts]=useState<Part[]>([]),[selected,setSelected]=useState(0),[view,setView]=useState<ViewMode>('cuts');
  const [tab,setTab]=useState('3d'),[manual,setManual]=useState(false),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(true);
  const [status,setStatus]=useState('Beispielmodell wird vorbereitet …'),[wireframe,setWireframe]=useState(false);
  const [command,setCommand]=useState<CameraCommand>({action:'fit',id:0});
  const [settings,setSettings]=useState(false),[exportMenu,setExportMenu]=useState(false);
  const [targetDimensions,setTargetDimensions]=useState<[string,string,string]>(['','','']);
  const [proportional,setProportional]=useState(true);
  const [facePicking,setFacePicking]=useState(false),[selectedFace,setSelectedFace]=useState<number|null>(null);
  const [alignToEdge,setAlignToEdge]=useState(false);
  const [keepUpright,setKeepUpright]=useState(true);
  const [alignmentTarget,setAlignmentTarget]=useState<AlignmentTarget>('front'),[alignmentRoll,setAlignmentRoll]=useState(0);
  const [alignmentUndo,setAlignmentUndo]=useState<{bytes:ArrayBuffer;config:Config;normal:Vec3}|null>(null);
  const planarFaces=useMemo(()=>geometry?detectPlanarFaces(geometry):[],[geometry]);
  const chosenFace=selectedFace===null?null:planarFaces[selectedFace]??null;
  useEffect(()=>{setSelectedFace(null);setFacePicking(false);},[geometry]);

  const fileRef=useRef<HTMLInputElement>(null),projectRef=useRef<HTMLInputElement>(null);
  const sourceRef=useRef<Solid|null>(null),partsRef=useRef<Part[]>([]),geometryRef=useRef<THREE.BufferGeometry|null>(null);
  const initialized=useRef(false),generation=useRef(0),running=useRef(false);
  const queuedGenerate=useRef<(()=>Promise<void>)|null>(null);
  const normal=useMemo(()=>AXES[axis].map(v=>v*(reverse?-1:1)) as Vec3,[axis,reverse]);
  const range=useMemo<[number,number]>(()=>source?extentAlong(source,normal):[0,60],[source,normal]);
  const meshes=useMemo(()=>parts.map(p=>p.geometry),[parts]);
  const active=parts[selected];
  const dimensions=useMemo(()=>{if(!geometry)return [0,0,0];geometry.computeBoundingBox();return geometry.boundingBox!.getSize(new THREE.Vector3()).toArray();},[geometry]);
  useEffect(()=>{setTargetDimensions(dimensions.map(value=>value.toFixed(2)) as [string,string,string]);},[dimensions]);
  const vertexCount=useMemo(()=>{if(!source)return 0;const mesh=source.getMesh();return mesh.vertProperties.length/mesh.numProp;},[source]);
  const ready=parts.length>0&&!busy&&!dirty;
  const laserSource=config.laserSource??'slice';
  const silhouetteDirection:SilhouetteDirection=config.silhouetteDirection&&config.silhouetteDirection in silhouetteDirections?config.silhouetteDirection:'front';
  const silhouetteHoles=config.silhouetteHoles??false;
  const silhouetteOffset=Number.isFinite(config.silhouetteOffset)?Math.max(-20,Math.min(20,config.silhouetteOffset!)):0;
  const projectionKey=`${silhouetteDirection}:${silhouetteHoles}:${silhouetteOffset}`;
  const [projection,setProjection]=useState<{source:Solid;key:string;loops:Loop[];error?:string}|null>(null);
  const projectionCurrent=projection?.source===source&&projection?.key===projectionKey;
  const silhouetteLoops=projectionCurrent?projection!.loops:[];
  const silhouetteLoading=laserSource==='silhouette'&&!!source&&!projectionCurrent;
  const laserLoops=laserSource==='silhouette'?silhouetteLoops:(active?.loops??[]);
  const laserReady=laserSource==='silhouette'?!!silhouetteLoops.length&&!silhouetteLoading:ready;
  const laserBounds=bounds(laserLoops);
  useEffect(()=>{
    if(laserSource!=='silhouette'||!source||projectionCurrent)return;
    let cancelled=false;
    void getLib().then(lib=>{
      if(cancelled)return;
      const loops=projectSilhouette(lib,source,silhouetteDirections[silhouetteDirection].normal,silhouetteHoles,silhouetteOffset);
      if(!cancelled)setProjection({source,key:projectionKey,loops});
    }).catch(error=>{if(!cancelled)setProjection({source,key:projectionKey,loops:[],error:'Projektion fehlgeschlagen: '+String(error)});});
    return()=>{cancelled=true;};
  },[source,laserSource,silhouetteDirection,silhouetteHoles,silhouetteOffset]);
  function chooseLaserSource(value:'slice'|'silhouette'){
    if(config.mode!=='laser')setDirty(true);
    setConfig(current=>({...current,laserSource:value,mode:'laser'}));
    if(value==='silhouette')setView('original');else setTab('contour');
  }

  function clearParts(){accessoriesRef.current.forEach(item=>item.geometry.dispose());accessoriesRef.current=[];setAccessoryCount(0);release(partsRef.current);partsRef.current=[];setParts([]);setSelected(5);setDirty(true);}
  function update(patch:Partial<Config>){if(Object.keys(patch).some(key=>!['sheetWidth','sheetHeight','nestingGap','kerf'].includes(key)))setDirty(true);setConfig(c=>({...c,...patch}));}
  function replaceSource(solid:Solid,g:THREE.BufferGeometry){clearParts();sourceRef.current?.delete();geometryRef.current?.dispose();sourceRef.current=solid;geometryRef.current=g;setSource(solid);setGeometry(g);}
  async function loadBuffer(data:ArrayBuffer,name:string,savedConfig?:Config,savedNormal?:Vec3){
    if(running.current)return;
    let pending:Solid|undefined;
    try{
      setBusy(true);setAlignmentUndo(null);setStatus('STL wird geprüft …');
      const parsed=new STLLoader().parse(data);let centered:ReturnType<typeof centerGeometryOnBed>;try{centered=centerGeometryOnBed(parsed);}finally{parsed.dispose();}const input=centered.geometry;let solid:Solid;
      try{solid=toSolid(input,await getLib());pending=solid;}finally{input.dispose();}
      const chosen=savedNormal??[0,0,1];const coordinate=chosen.findIndex(v=>v!==0);const newAxis=['X','Y','Z'][coordinate]??'Z';
      const extent=extentAlong(solid,chosen);
      const shift=centered.translation.reduce((sum,value,i)=>sum+value*chosen[i],0);const next=savedConfig?{...savedConfig,boundaries:savedConfig.boundaries.map(value=>value+shift)}:resizeUniformSlices({...config,pattern:defaults.pattern},...extent);
      validateBoundaries(next.boundaries,...extent);if(savedConfig)next.thickness=(extent[1]-extent[0])/(next.boundaries.length-1);setManual(next.boundaries.some((value,i)=>i>0&&Math.abs(value-next.boundaries[i-1]-next.thickness)>1e-4));const g=toGeometry(solid);let centeredBytes:ArrayBuffer;try{centeredBytes=await stlBlob(g).arrayBuffer();}catch(error){g.dispose();throw error;}replaceSource(solid,g);pending=undefined;setRaw(centeredBytes);setFilename(name);setRotation([0,0,0]);setAxis(newAxis);setReverse(chosen[coordinate]<0);setConfig(next);setStatus('Mesh ist gültig. Scheiben werden berechnet …');
    }catch(e){pending?.delete();setStatus('Import fehlgeschlagen: '+String(e));}finally{setBusy(false);}
  }
  async function demo(){
    if(running.current)return;
    setBusy(true);setStatus('Lokaler Beispielhase wird erstellt …');
    try{const g=makeBunnyGeometry();g.computeBoundingBox();const bb=g.boundingBox!,scale=60/(bb.max.z-bb.min.z);const base=bb.min.z;g.scale(scale,scale,scale);g.translate(0,0,-base*scale);const bytes=await stlBlob(g).arrayBuffer();g.dispose();await loadBuffer(bytes,'Beispielhase.stl');}
    catch(e){setStatus('Beispielmodell konnte nicht geladen werden: '+String(e));}finally{setBusy(false);}
  }
  useEffect(()=>{if(!initialized.current){initialized.current=true;void demo();}return()=>{};},[]);
  useEffect(()=>()=>{generation.current++;accessoriesRef.current.forEach(item=>item.geometry.dispose());release(partsRef.current);sourceRef.current?.delete();geometryRef.current?.dispose();},[]);
  async function orient(values:Vec3){
    if(!raw||running.current)return;
    try{setBusy(true);const input=new STLLoader().parse(raw.slice(0));input.rotateX(values[0]*Math.PI/180);input.rotateY(values[1]*Math.PI/180);input.rotateZ(values[2]*Math.PI/180);
      let centered:THREE.BufferGeometry;try{centered=centerGeometryOnBed(input).geometry;}finally{input.dispose();}let solid:Solid;try{solid=toSolid(centered,await getLib());}finally{centered.dispose();}
      replaceSource(solid,toGeometry(solid));setRotation(values);const extent=extentAlong(solid,normal);setConfig(c=>resizeUniformSlices(c,...extent));setManual(false);
    }catch(e){setStatus('Rotation fehlgeschlagen: '+String(e));}finally{setBusy(false);}
  }
  function pickAlignmentFace(triangle:number){
    const index=planarFaces.findIndex(face=>face.triangles.includes(triangle));
    if(index>=0){setSelectedFace(index);setStatus(`Fläche gewählt: ${planarFaces[index].area.toFixed(1)} mm². Zielrichtung festlegen und Ausrichtung anwenden.`);}
  }
  async function applyAlignment(){
    if(!geometry||!chosenFace||running.current)return;
    let aligned:THREE.BufferGeometry|undefined,pending:Solid|undefined,nextGeometry:THREE.BufferGeometry|undefined;
    try{
      setBusy(true);setStatus('Modell wird an der gewählten Fläche ausgerichtet …');
      const undoBytes=await stlBlob(geometry).arrayBuffer();
      aligned=alignGeometryToFace(geometry,chosenFace.normal,alignmentTarget,alignmentRoll,alignToEdge?faceBoundaryDirection(geometry,chosenFace):undefined,keepUpright);
      pending=toSolid(aligned,await getLib());nextGeometry=toGeometry(pending);
      const bytes=await stlBlob(nextGeometry).arrayBuffer(),next=resizeUniformSlices(config,...extentAlong(pending,normal));
      setAlignmentUndo({bytes:undoBytes,config,normal:[...normal] as Vec3});
      replaceSource(pending,nextGeometry);pending=undefined;nextGeometry=undefined;
      setRaw(bytes);setRotation([0,0,0]);setConfig(next);setManual(false);setView('original');camera('fit');
      setStatus('Modell an X/Y/Z ausgerichtet. Jetzt die Schnittrichtung wählen.');
    }catch(error){setStatus('Ausrichtung fehlgeschlagen: '+String(error));}
    finally{aligned?.dispose();pending?.delete();nextGeometry?.dispose();setBusy(false);}
  }
  function editTargetDimension(index:number,value:string){
    if(proportional&&Number(value)>0&&Number.isFinite(Number(value))&&dimensions[index]>0){
      const ratio=Number(value)/dimensions[index];
      setTargetDimensions(dimensions.map((dimension,i)=>i===index?value:(dimension*ratio).toFixed(2)) as [string,string,string]);
    }else setTargetDimensions(values=>values.map((dimension,i)=>i===index?value:dimension) as [string,string,string]);
  }
  async function applyScale(){
    if(!geometry||running.current)return;
    let scaled:THREE.BufferGeometry|undefined,pending:Solid|undefined;
    try{
      setBusy(true);setStatus('Modell wird auf Zielmaße skaliert …');
      const resized=scaleGeometryToDimensions(geometry,targetDimensions.map(Number) as Vec3);try{scaled=centerGeometryOnBed(resized).geometry;}finally{resized.dispose();}
      pending=toSolid(scaled,await getLib());
      const extent=extentAlong(pending,normal),next=resizeUniformSlices(config,...extent),cuts=next.boundaries;
      validateBoundaries(cuts,...extent);
      const nextGeometry=toGeometry(pending);
      let bytes:ArrayBuffer;
      try{bytes=await stlBlob(nextGeometry).arrayBuffer();}catch(error){nextGeometry.dispose();throw error;}
      replaceSource(pending,nextGeometry);pending=undefined;
      // Make the scaled, applied mesh the new rotation baseline so subsequent
      // orientation changes cannot silently restore the pre-scaled STL.
      setRaw(bytes);setRotation([0,0,0]);setManual(false);
      setConfig(next);camera('fit');
      setStatus('Zielmaße angewendet. Schnittgrenzen werden neu berechnet; Rand und Zellgröße bleiben in Millimetern.');
    }catch(error){setStatus('Skalierung fehlgeschlagen: '+String(error));}
    finally{scaled?.dispose();pending?.delete();setBusy(false);}
  }
  function chooseAxis(next:string,flip=reverse){if(!source||busy)return;setAxis(next);setReverse(flip);const n=AXES[next].map(v=>v*(flip?-1:1)) as Vec3;setDirty(true);setManual(false);setConfig(c=>resizeUniformSlices(c,...extentAlong(source,n)));}
  function setThickness(value:number){try{const plan=uniformSlicePlan(...range,{kind:'thickness',value});setManual(false);update({...plan,sliceSizing:'thickness',sliceThicknessLimit:value});return Number(plan.thickness.toFixed(4));}catch(e){setStatus(String(e));return false;}}
  function setCount(value:number){try{const plan=uniformSlicePlan(...range,{kind:'count',value});setManual(false);update({...plan,sliceSizing:'count'});return plan.boundaries.length-1;}catch(e){setStatus(String(e));return false;}}
  async function generate(){
    if(!source||running.current)return;
    const token=++generation.current;running.current=true;setBusy(true);setStatus('Scheiben werden berechnet …');
    const result:Part[]=[],stack:StackPart[]=[],extra:{name:string;geometry:THREE.BufferGeometry}[]=[];
    let core:Solid|undefined;
    try{
      const lib=await getLib(),cuts=config.boundaries;validateBoundaries(cuts,...range);
      const matrix=new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...normal),new THREE.Vector3(0,0,1))),inverse=matrix.clone().invert();
      const localSource=source.transform(matrix.elements as Parameters<Solid['transform']>[0]);
      try{
        if(config.pattern!=='solid'&&config.density>0&&config.wall>0){setStatus('Räumlicher Wandabstand wird berechnet …');await new Promise(resolve=>setTimeout(resolve,0));core=spatialCore(lib,localSource,config.wall,config.geometryResolution??.5);}
        for(let i=0;i<cuts.length-1;i++){
          if(token!==generation.current)return;
          const solid=makeSlice(lib,localSource,cuts[i],cuts[i+1],config,[0,0,1],core);
          if(solid.isEmpty()){solid.delete();continue;}
          stack.push({solid,start:cuts[i],end:cuts[i+1]});
          setStatus(`Scheibe ${i+1} / ${cuts.length-1} wird berechnet …`);await new Promise(resolve=>setTimeout(resolve,0));
        }
        if(config.mode==='print'&&config.connectors){
          setStatus('Verbindungen werden geprüft …');await new Promise(resolve=>setTimeout(resolve,0));
          const pins=connectStack(lib,stack,config);
          try{pins.forEach((pin,i)=>{const geometry=toGeometry(pin.solid);geometry.translate(dimensions[0]/2+5+(i%10)*(config.connectorDiameter+3),Math.floor(i/10)*(config.connectorDiameter+3),0);extra.push({name:pin.name,geometry});});}finally{pins.forEach(pin=>pin.solid.delete());}
        }
        for(const part of stack){
          const loops=sliceContoursAtMidpoint(part.solid,part.start,part.end),localGeometry=toGeometry(part.solid),solid=part.solid.transform(inverse.elements as Parameters<Solid['transform']>[0]);
          result.push({solid,geometry:toGeometry(solid),localGeometry,start:part.start,end:part.end,loops});
        }
      }finally{localSource.delete();}
      if(token!==generation.current){release(result);extra.forEach(item=>item.geometry.dispose());return;}
      release(partsRef.current);partsRef.current=result;setParts(result);
      accessoriesRef.current.forEach(item=>item.geometry.dispose());accessoriesRef.current=extra;setAccessoryCount(extra.length);
      setSelected(s=>Math.max(0,Math.min(s,result.length-1)));setDirty(false);
      setStatus(`${result.length} gültige Volumenscheiben${extra.length?` · ${extra.length} Passstifte`:''} · lokal berechnet`);
    }catch(e){release(result);extra.forEach(item=>item.geometry.dispose());setStatus('Berechnung fehlgeschlagen: '+String(e));}
    finally{core?.delete();stack.forEach(part=>part.solid.delete());running.current=false;setBusy(false);const queued=queuedGenerate.current;queuedGenerate.current=null;if(queued)void queued();}
  }
  useEffect(()=>{if(!source)return;generation.current++;queuedGenerate.current=null;const timer=setTimeout(()=>{if(running.current)queuedGenerate.current=generate;else void generate();},450);return()=>clearTimeout(timer);},[source,config.boundaries,config.pattern,config.cell,config.density,config.wall,config.mode,config.relief,config.reliefPattern,config.reliefSpacing,config.connectors,config.connectorMode,config.connectorDiameter,config.connectorDepth,config.connectorClearance,config.geometryResolution,normal]);
  async function saveProject(){
    if(!geometry)return;const bytes=new Uint8Array(await stlBlob(geometry).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const file:ProjectFile&{sliceNormal:Vec3}={schemaVersion:1,name:'BreadSlicer Project',filename,config,sourceSTLBase64:btoa(binary),sliceNormal:normal};
    download(new Blob([JSON.stringify(file)],{type:'application/json'}),'breadslicer-project.json');
  }
  async function openProject(file:File){try{const p=JSON.parse(await file.text()) as ProjectFile&{sliceNormal?:Vec3};if(p.schemaVersion!==1||!p.sourceSTLBase64)throw Error('Unbekanntes Projektformat');const normal=p.sliceNormal??[0,0,1];if(normal.length!==3||normal.filter(v=>Math.abs(v)===1).length!==1||normal.some(v=>![0,1,-1].includes(v)))throw Error('Ungültige Schnittachse');const bin=atob(p.sourceSTLBase64),bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));await loadBuffer(bytes.buffer,p.filename,p.config,normal);}catch(e){setStatus('Projektfehler: '+String(e));}}
  async function exportAll(){download(await zipFiles([...parts.map((p,i)=>({name:`slice_${String(i+1).padStart(3,'0')}.stl`,blob:stlBlob(p.geometry)})),...accessoriesRef.current.map(item=>({name:item.name,blob:stlBlob(item.geometry)}))]),'breadslicer-stl.zip');}
  const exportSVG=()=>{if(laserLoops.length)download(new Blob([svgFor(laserLoops,config.kerf)],{type:'image/svg+xml'}),laserSource==='silhouette'?`silhouette_${silhouetteDirection}.svg`:`slice_${selected+1}.svg`);};
  const exportDXF=()=>{if(laserLoops.length)download(new Blob([dxfFor(laserLoops,config.kerf)],{type:'application/dxf'}),laserSource==='silhouette'?`silhouette_${silhouetteDirection}.dxf`:`slice_${selected+1}.dxf`);};
  async function exportLaserZip(){download(await zipFiles(parts.map((p,i)=>({name:`slice_${String(i+1).padStart(3,'0')}.svg`,blob:svgFor(p.loops,config.kerf)}))),'breadslicer-laser.zip');}
  async function exportSheet(){
    try{
      setStatus('Konturen werden mit Drehung und Kerf angeordnet …');await new Promise(resolve=>setTimeout(resolve,0));
      const pages=nestContours(parts.map(p=>p.loops),config.sheetWidth,config.sheetHeight,config.nestingGap??3,config.kerf);
      const files=pages.flatMap((page,i)=>[{name:`platte_${i+1}.svg`,blob:nestedSVG(page)},{name:`platte_${i+1}.dxf`,blob:dxfFor(page.parts.flatMap(p=>p.loops),0)}]);
      files.push({name:'anordnung.json',blob:JSON.stringify(pages.map(page=>({width:page.width,height:page.height,parts:page.parts.map(({index,rotation,x,y})=>({slice:index+1,rotation,x,y}))})),null,2)});
      download(await zipFiles(files),'breadslicer-platten.zip');setStatus(`${pages.length} Platte(n) · SVG und DXF mit Kerf exportiert`);
    }catch(error){setStatus('Plattenlayout fehlgeschlagen: '+String(error));}
  }  const camera=(action:CameraCommand['action'])=>setCommand(c=>({action,id:c.id+1}));
  const field=(key:keyof Config,label:string,min:number,max:number,step:number)=> <label className="value-row"><span>{label}</span><NumberField aria-label={label} min={min} max={max} step={step} value={(config[key]??(key==='geometryResolution'?.5:key==='nestingGap'?3:0)) as number} disabled={busy} onCommit={value=>update({[key]:value})}/></label>;
  const sectionTitle=(n:number,title:string)=><h2><span className="step">{n}</span>{title}</h2>;
  return <div className="app-shell">
    <input className="hidden-input" ref={fileRef} aria-label="STL-Datei auswählen" type="file" accept=".stl" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void f.arrayBuffer().then(b=>loadBuffer(b,f.name));e.target.value='';}}/>
    <input className="hidden-input" ref={projectRef} aria-label="Projektdatei auswählen" type="file" accept=".json" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void openProject(f);e.target.value='';}}/>
    <header className="topbar">
      <div className="brand"><img src={`${import.meta.env.BASE_URL}toast.svg?v=3`} width="36" height="36" alt="Toast mit versetzter Scheibe"/><h1>STL BreadSlicer</h1><span>STL in Scheiben schneiden · 3D-Druck · Lasercutting</span></div>
      <div className="mode-switch" role="group" aria-label="Fertigungsmodus"><button className={config.mode==='print'?'active':''} disabled={busy} aria-pressed={config.mode==='print'} onClick={()=>update({mode:'print',laserSource:'slice'})}><Icon name="cube"/>3D-Druck</button><button className={config.mode==='laser'?'active':''} disabled={busy} aria-pressed={config.mode==='laser'} onClick={()=>{update({mode:'laser'});setTab('contour');}}><Icon name="laser"/>Lasercutting</button></div>
      <nav className="project-actions"><button aria-label="Projekt laden" disabled={busy} onClick={()=>projectRef.current?.click()}><Icon name="folder"/><span>Projekt laden</span></button><button aria-label="Projekt speichern" disabled={!source||busy} onClick={()=>void saveProject()}><Icon name="save"/><span>Speichern</span></button><div className="dropdown-wrap"><button aria-expanded={exportMenu} onClick={()=>setExportMenu(!exportMenu)}><Icon name="download"/>Export<Icon name="chevron" size={13}/></button>{exportMenu&&<div className="dropdown"><button disabled={config.mode==='laser'&&laserSource==='silhouette'?!laserReady:!ready} onClick={()=>{if(laserSource==='silhouette'&&config.mode==='laser')exportSVG();else void (config.mode==='print'?exportAll():exportLaserZip());setExportMenu(false);}}>{config.mode==='print'?'Alle STL als ZIP':laserSource==='silhouette'?'Silhouette als SVG':'Alle SVG als ZIP'}</button><button disabled={!ready||laserSource==='silhouette'} onClick={()=>{exportSheet();setExportMenu(false);}}>Plattenlayout SVG/DXF</button></div>}</div><button aria-label="Einstellungen" aria-pressed={settings} onClick={()=>setSettings(!settings)}><Icon name="settings"/></button></nav>
    </header>
    <div className="workspace">
      <aside className="sidebar panel">
        <section>{sectionTitle(1,'Modell')}<div className="model-info"><ModelThumbnail geometry={geometry} filename={filename}/><div><strong title={filename}>{filename}</strong><span>Vertices: {vertexCount.toLocaleString('de-DE')}</span><span>Faces: {(source?.numTri()??0).toLocaleString('de-DE')}</span><span>Größe (mm):</span><span>{dimensions.map(d=>d.toFixed(1)).join(' × ')}</span></div></div><p className="valid"><Icon name="check" size={14}/>{source?'Mesh ist gültig':'Modell wird geladen …'}</p><p className="hint">X/Y zentriert · Unterkante Z = 0 mm</p><button className="wide" disabled={busy} onClick={()=>fileRef.current?.click()}><Icon name="folder"/>Anderes Modell laden …</button><button className="demo-link" disabled={busy} onClick={()=>void demo()}>Lokalen Beispielhasen laden</button>
          <AlignmentPanel faces={planarFaces} selected={chosenFace} picking={facePicking} disabled={!source||busy} target={alignmentTarget} roll={alignmentRoll} keepUpright={keepUpright} onKeepUpright={setKeepUpright} alignToEdge={alignToEdge} onAlignToEdge={setAlignToEdge} canUndo={!!alignmentUndo} onPick={()=>{setFacePicking(value=>!value);setView('original');}} onSelect={face=>{setSelectedFace(planarFaces.indexOf(face));setFacePicking(true);setView('original');}} onTarget={setAlignmentTarget} onRoll={setAlignmentRoll} onApply={()=>void applyAlignment()} onUndo={()=>{if(alignmentUndo)void loadBuffer(alignmentUndo.bytes,filename,alignmentUndo.config,alignmentUndo.normal);}}/>
          <div className="model-scale"><h3>Modellgröße / Skalierung</h3><p className="hint">Zielmaße vor Randabstand und Füllung festlegen.</p>
            {(['X','Y','Z'] as const).map((name,i)=><label className="scale-dimension" key={name}><span>{name} · {['Breite','Tiefe','Höhe'][i]}</span><div><NumberField aria-label={`Zielmaß ${name} (mm)`} min="0.1" step="0.1" value={targetDimensions[i]} disabled={!source||busy} onCommit={value=>editTargetDimension(i,String(value))}/><span>mm</span></div></label>)}
            <label className="scale-proportions"><input type="checkbox" checked={proportional} disabled={busy} onChange={e=>{const locked=e.target.checked;setProportional(locked);if(locked){const ratio=Number(targetDimensions[0])/dimensions[0];setTargetDimensions(dimensions.map(value=>(value*(Number.isFinite(ratio)&&ratio>0?ratio:1)).toFixed(2)) as [string,string,string]);}}}/>Proportionen beibehalten</label>
            <button className="wide" disabled={!source||busy||targetDimensions.some(value=>!Number.isFinite(Number(value))||Number(value)<=0)} onClick={()=>void applyScale()}><Icon name="fit" size={15}/>Zielmaße anwenden</button>
            <p className="hint">Randabstand, Zellgröße und Scheibendicke behalten ihre mm-Werte. Schnittgrenzen werden neu gesetzt.</p>
          </div></section>
        <section>{sectionTitle(2,'Schnittrichtung')}<div className="segmented">{Object.keys(AXES).map(a=><button key={a} className={axis===a?'active':''} disabled={busy} aria-pressed={axis===a} onClick={()=>chooseAxis(a)}>{a}</button>)}</div><p className="hint"><Icon name="rotate" size={13}/>Frei rotieren über die Modellachsen</p>{(['X','Y','Z'] as const).map((a,i)=><label className="rotation-row" key={a}><span>Rotation {a}</span><input type="range" aria-label={`Rotation ${a} Schieberegler`} min="-180" max="180" step="5" value={rotation[i]} disabled={busy} onChange={e=>setRotation(v=>v.map((n,j)=>j===i?Number(e.target.value):n) as Vec3)}/><NumberField aria-label={`Rotation ${a} (°)`} min="-180" max="180" value={rotation[i]} disabled={busy} onCommit={value=>setRotation(v=>v.map((n,j)=>j===i?value:n) as Vec3)}/></label>)}<div className="button-pair"><button disabled={busy||!raw} onClick={()=>void orient(rotation)}>Anwenden</button><button disabled={busy||!raw} onClick={()=>void orient([0,0,0])}>Zurücksetzen</button></div><label className="toggle-row"><input type="checkbox" role="switch" checked={reverse} disabled={busy} onChange={e=>chooseAxis(axis,e.target.checked)}/><span>Schnittrichtung umkehren</span></label></section>
        <section>{sectionTitle(3,'Scheiben')}<label className="slider-title">Scheibendicke (mm)</label><div className="slider-row"><input type="range" aria-label="Scheibendicke Schieberegler" min="0.5" max={Math.max(20,range[1]-range[0])} step="0.01" value={config.thickness} disabled={busy} onChange={e=>setThickness(Number(e.target.value))}/><NumberField aria-label="Scheibendicke (mm)" min="0.05" step="0.01" value={Number(config.thickness.toFixed(4))} disabled={busy} onCommit={setThickness}/></div><label className="value-row"><span>Anzahl Scheiben</span><NumberField integer aria-label="Anzahl Scheiben" min="1" max="150" step="1" value={Math.max(0,config.boundaries.length-1)} disabled={busy} onCommit={setCount}/></label><p className="hint slice-coupling">{(range[1]-range[0]).toFixed(2)} mm entlang {axis} ÷ {Math.max(0,config.boundaries.length-1)} = {config.thickness.toFixed(2)} mm {manual?'im Mittel':'je Scheibe'}. Mit Return oder beim Verlassen des Felds anwenden.</p><div className="segmented"><button className={!manual?'active':''} disabled={busy} onClick={()=>{setManual(false);setThickness(config.thickness);}}>Gleichmäßig</button><button className={manual?'active':''} onClick={()=>setManual(true)}>Manuell</button></div>{manual&&<div className="manual-cuts">{config.boundaries.slice(1,-1).map((value,i)=><label className="value-row" key={i}><span>Grenze {i+1}</span><NumberField aria-label={`Grenze ${i+1}`} min={config.boundaries[i]+.05} max={config.boundaries[i+2]-.05} step=".1" value={value} disabled={busy} onCommit={next=>update({thickness:(range[1]-range[0])/(config.boundaries.length-1),boundaries:config.boundaries.map((z,j)=>j===i+1?next:z)})}/></label>)}</div>}</section>
        <section>{sectionTitle(4,'Muster / Füllung')}<select aria-label="Muster" value={config.pattern} disabled={busy} onChange={e=>update({pattern:e.target.value as Config['pattern']})}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><div className="pattern-settings"><div className={'pattern-swatch '+config.pattern}><Icon name="layers" size={30}/></div><div>{field('density','Dichte (%)',0,85,5)}{field('cell','Zellgröße (mm)',1,30,.5)}{field('wall','Wandstärke (mm)',0,15,.1)}</div></div><p className="hint">Dichte steuert den Öffnungsgrad. Der Wandabstand wird räumlich berechnet.</p>
        <ManufacturingOptions config={config} disabled={busy} onUpdate={update}/><details open={settings||undefined}><summary>Erweiterte Optionen <Icon name="chevron" size={14}/></summary>{field('sheetWidth','Plattenbreite (mm)',10,3000,10)}{field('sheetHeight','Plattenhöhe (mm)',10,3000,10)}{field('nestingGap','Teileabstand (mm)',0,20,.5)}{field('geometryResolution','Fertigungsauflösung (mm)',.05,2,.05)}<p className="hint">STL-Einheit: Millimeter. Keine Modelle werden hochgeladen. Kerf wird in SVG, DXF und Plattenlayout berücksichtigt. Kleinere Fertigungsauflösung = feinere Geometrie.</p></details>
        </section><button className="primary generate wide" disabled={!source||busy} onClick={()=>void generate()}><Icon name="layers"/>{busy?'Scheiben werden berechnet …':'Scheiben neu berechnen'}</button>
      </aside>
      <main className="main-workspace">
        <section className="model-stage">
          {facePicking&&<div className="face-pick-notice">Fläche am Modell anklicken · türkis = Auswahl · anschließend links anwenden</div>}<div className="stage-toolbar"><div className="view-switch"><span>Ansicht:</span>{([['original','Original'],['cuts','Schnitte'],['exploded','Explodiert']] as const).map(([v,label])=><button key={v} className={view===v?'active':''} aria-pressed={view===v} onClick={()=>setView(v)}>{label}</button>)}</div><div className="camera-tools"><button title="Standardansicht" aria-label="Standardansicht" onClick={()=>camera('home')}><Icon name="home"/></button><button title="Modell einpassen" aria-label="Modell einpassen" onClick={()=>camera('fit')}><Icon name="fit"/></button><button title="Vergrößern" aria-label="Vergrößern" onClick={()=>camera('in')}><Icon name="plus"/></button><button title="Verkleinern" aria-label="Verkleinern" onClick={()=>camera('out')}><Icon name="minus"/></button><select aria-label="Darstellung" value={wireframe?'wire':'real'} onChange={e=>setWireframe(e.target.value==='wire')}><option value="real">Realistisch</option><option value="wire">Drahtgitter</option></select></div></div>
          <Scene source={geometry} meshes={meshes} selected={selected} selectedDistance={active?sliceMidpoint(active.start,active.end):undefined} mode={view} cuts={config.boundaries} normal={normal} wireframe={wireframe} command={command} picking={facePicking} selectedTriangles={chosenFace?.triangles} onFacePick={pickAlignmentFace}/>
          <div className="dimensions"><strong>Modellabmessungen (mm)</strong><span>{dimensions.map((d,i)=>`${['X','Y','Z'][i]}: ${d.toFixed(1)}`).join('    ')}</span><span>Scheiben ({axis}{reverse?'−':''}): {Math.max(0,config.boundaries.length-1)} × {config.thickness.toFixed(1)} mm</span><span>Aktive Scheibe: {active?`${selected+1} · Mitte ${sliceMidpoint(active.start,active.end).toFixed(1)} mm (${active.start.toFixed(1)}–${active.end.toFixed(1)})`:'—'}</span></div><div className="axis-gizmo"><span className="z">Z ↑</span><span className="y">Y ↗</span><span className="x">X →</span></div><div className="stage-caption"><span className="live-dot"/>Ebenen zeigen die Scheibenmitten<span>Ziehen: drehen · Scrollen: zoomen</span></div>
        </section>
        {laserSource==='silhouette'?<SilhouettePanel loops={silhouetteLoops} direction={silhouetteDirection} includeHoles={silhouetteHoles} offset={silhouetteOffset} onOffset={offset=>setConfig(current=>({...current,silhouetteOffset:offset}))} loading={silhouetteLoading} error={projectionCurrent?projection?.error:undefined} hasSource={!!source} kerf={config.kerf} onDirection={direction=>setConfig(current=>({...current,silhouetteDirection:direction}))} onHoles={include=>setConfig(current=>({...current,silhouetteHoles:include}))}/>:<section className="active-panel panel"><h2>Aktive Scheibe {active?`${selected+1} / ${parts.length}`:'—'}</h2><div className="segmented preview-tabs">{[['3d','3D-Ansicht'],['pattern','Füllmuster'],['contour','Laser-Kontur']].map(([value,label])=><button key={value} className={tab===value?'active':''} onClick={()=>setTab(value)}>{label}</button>)}</div><div className={'active-preview '+(tab==='3d'?'preview-3d':'')}>{active?(tab==='3d'?<Scene source={active.localGeometry} light/>:<Contours loops={active.loops} filled={tab==='pattern'} kerf={tab==='contour'?config.kerf:0}/>):<div className="empty-preview"><Icon name="layers" size={40}/><p>{busy?'Scheiben werden vorbereitet …':'Modell laden und Scheiben berechnen'}</p></div>}</div><p className="slice-middle">{active?`Mitte: ${sliceMidpoint(active.start,active.end).toFixed(2)} mm · Bereich: ${active.start.toFixed(2)}–${active.end.toFixed(2)} mm`:'Laserkontur = mittlerer Querschnitt'}</p><p className="closed-solid"><span><Icon name="check" size={15}/></span>Geschlossene Volumenkörper</p>{field('wall','Randabstand (mm)',0,15,.1)}<p className="hint">{active?`${(active.end-active.start).toFixed(2)} mm dick · ${active.solid.numTri().toLocaleString('de-DE')} Dreiecke`:'Vorschau der ausgewählten Scheibe'}</p></section>}
        <section className="gallery panel"><h2>Alle Scheiben ({parts.length}) {dirty&&!busy&&<small>Änderungen ausstehend</small>}</h2><div className="slice-grid">{parts.map((p,i)=><button key={i} className={'slice-card '+(i===selected?'selected':'')} aria-label={`Scheibe ${i+1} auswählen`} aria-pressed={i===selected} onClick={()=>setSelected(i)}><span>{i+1}</span><Contours loops={p.loops} small filled/><small>{(p.end-p.start).toFixed(1)} mm</small></button>)}{!parts.length&&<div className="gallery-empty"><Icon name="layers" size={30}/><span>{busy?'Deine Scheiben werden berechnet …':'Hier erscheinen deine Scheiben.'}</span></div>}</div></section>
        <section className="laser-panel panel">
          <div className="laser-heading"><h2>{laserSource==='silhouette'?'2D-Modell-Silhouette':`2D-Laser-Kontur${active?` (Scheibe ${selected+1})`:''}`}</h2><div className="segmented laser-source-switch" role="group" aria-label="Laserquelle"><button aria-pressed={laserSource==='slice'} className={laserSource==='slice'?'active':''} onClick={()=>chooseLaserSource('slice')}>Scheibe</button><button aria-pressed={laserSource==='silhouette'} className={laserSource==='silhouette'?'active':''} onClick={()=>chooseLaserSource('silhouette')}>Silhouette</button></div></div>
          <p className="laser-middle">{laserSource==='silhouette'?`${silhouetteDirections[silhouetteDirection].label} · gesamtes Modell · Parallelprojektion`:active?`Schnittebene bei ${axis} = ${sliceMidpoint(active.start,active.end).toFixed(2)} mm · nur die Scheibenmitte`:'Die Kontur wird aus der Scheibenmitte berechnet.'}</p>
          <div className="laser-preview"><Contours loops={laserLoops} kerf={config.kerf} shadow={laserSource==='silhouette'}/></div><div className="legend"><span><i/>Außenkontur (Schneiden)</span><span><i/>Innenkonturen (Schneiden)</span></div>
          <label className="kerf-row"><span>Kerf-Kompensation (mm)</span><input type="range" aria-label="Kerf Schieberegler" min="0" max=".6" step=".01" value={config.kerf} onChange={e=>setConfig(c=>({...c,kerf:Number(e.target.value)}))}/><NumberField aria-label="Kerf-Kompensation (mm)" min="0" max="2" step=".01" value={config.kerf} onCommit={value=>setConfig(c=>({...c,kerf:value}))}/></label>
          <button className="wide" disabled={!laserReady} onClick={exportSVG}>Als SVG exportieren …</button>
        </section>
        <footer className="exportbar panel">{config.mode==='print'?<><button className="primary" disabled={!ready} onClick={()=>active&&download(stlBlob(active.geometry),`slice_${selected+1}.stl`)}><Icon name="download"/>Aktive Scheibe als STL exportieren</button><button disabled={!ready} onClick={()=>void exportAll()}><Icon name="layers"/>Alle Scheiben als ZIP exportieren{accessoryCount?` + ${accessoryCount} Stifte`:''}</button><button disabled={!ready} onClick={()=>void threeMF([...parts.map(p=>p.geometry),...accessoriesRef.current.map(item=>item.geometry)]).then(b=>download(b,'breadslicer.3mf'))}><Icon name="cube"/>3MF (gesamtes Projekt)</button></>:laserSource==='silhouette'?<><button className="primary" disabled={!laserReady} onClick={exportSVG}><Icon name="download"/>Silhouette als SVG</button><button disabled={!laserReady} onClick={exportDXF}><Icon name="download"/>Silhouette als DXF</button><span className="silhouette-export-info">Parallelprojektion · {(laserBounds.maxX-laserBounds.minX).toFixed(2)} × {(laserBounds.maxY-laserBounds.minY).toFixed(2)} mm</span></>:<><button className="primary" disabled={!ready} onClick={exportSVG}><Icon name="download"/>Aktive Laser-Kontur als SVG</button><button disabled={!ready} onClick={exportDXF}>Aktive Kontur als DXF</button><button disabled={!ready} onClick={()=>void exportLaserZip()}>Alle SVG als ZIP</button><button disabled={!ready} onClick={exportSheet}>Plattenlayout SVG/DXF</button></>}</footer>
      </main>
    </div><div className={'statusbar '+(busy?'working':'')} role="status"><span className="live-dot"/>{status}<span>v0.5 · Lokale Verarbeitung</span></div>
  </div>;
}
createRoot(document.getElementById('app')!).render(<App/>);
