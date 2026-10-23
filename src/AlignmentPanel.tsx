import React from 'react';
import {alignmentTargets,type AlignmentTarget,type PlanarFace} from './alignment';
type Props={faces:PlanarFace[];selected:PlanarFace|null;picking:boolean;disabled:boolean;target:AlignmentTarget;roll:number;keepUpright:boolean;onKeepUpright:(enabled:boolean)=>void;alignToEdge:boolean;onAlignToEdge:(enabled:boolean)=>void;canUndo:boolean;onPick:()=>void;onSelect:(face:PlanarFace)=>void;onTarget:(target:AlignmentTarget)=>void;onRoll:(roll:number)=>void;onApply:()=>void;onUndo:()=>void};
export function AlignmentPanel({faces,selected,picking,disabled,target,roll,keepUpright,onKeepUpright,alignToEdge,onAlignToEdge,canUndo,onPick,onSelect,onTarget,onRoll,onApply,onUndo}:Props){
  const verticalTarget=target!=='top'&&target!=='bottom',yawOnly=verticalTarget&&keepUpright;
  const largest=faces[0]?.area??0,totalArea=faces.reduce((sum,face)=>sum+face.area,0);
  const candidates=faces.filter(face=>face.triangles.length>=2&&face.area>=Math.max(largest*.01,totalArea*.001)).slice(0,12);
  return <div className="model-alignment">
    <h3>Modell ausrichten</h3>
    <button className={'wide '+(picking?'primary':'')} aria-pressed={picking} disabled={disabled} onClick={onPick}>{picking?'Flächenauswahl beenden':'Fläche am Modell wählen'}</button>
    <p className="hint">{selected?`Bezugsfläche: ${selected.area.toLocaleString('de-DE',{maximumFractionDigits:2})} mm²`:'Fläche anklicken, Ziel wählen und anwenden.'}{yawOnly?' · Figur bleibt aufrecht.':''}</p>
    <label className="alignment-option"><span>Diese Fläche zeigt nach</span><select aria-label="Ausrichtungsziel" value={target} disabled={disabled} onChange={e=>onTarget(e.target.value as AlignmentTarget)}>{Object.entries(alignmentTargets).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label>
    <div className="button-pair"><button disabled={disabled||!selected} onClick={onApply}>Ausrichtung anwenden</button><button disabled={disabled||!canUndo} onClick={onUndo}>Rückgängig</button></div>
    <details className="alignment-advanced"><summary>Erweitert</summary>
    <label className="alignment-option"><span>Erkannte ebene Flächen</span><select aria-label="Erkannte ebene Flächen" disabled={disabled||!candidates.length} value={selected&&candidates.includes(selected)?faces.indexOf(selected):''} onChange={e=>{if(e.target.value!=='')onSelect(faces[Number(e.target.value)]);}}><option value="">{candidates.length?'Fläche auswählen …':'Keine größere ebene Fläche erkannt'}</option>{candidates.map(face=><option key={faces.indexOf(face)} value={faces.indexOf(face)}>Fläche {faces.indexOf(face)+1} · {face.area.toFixed(1)} mm²</option>)}</select></label>
    {selected&&<p className="hint">{selected.triangles.length} Dreiecke gemeinsam erkannt{selected.triangles.length===1?' · einzelne Facette':''}</p>}
    {verticalTarget&&<label className="scale-proportions"><input type="checkbox" checked={keepUpright} disabled={disabled} onChange={e=>onKeepUpright(e.target.checked)}/>Aufrecht lassen – nur um Z drehen</label>}
    <label className="scale-proportions"><input type="checkbox" checked={!yawOnly&&alignToEdge} disabled={disabled||yawOnly} onChange={e=>onAlignToEdge(e.target.checked)}/>Zusätzlich an Flächenkante drehen</label>
    <label className="alignment-option"><span>Drehung in der Ebene</span><select aria-label="Drehung in der Ebene" value={yawOnly?0:roll} disabled={disabled||yawOnly} onChange={e=>onRoll(Number(e.target.value))}>{[0,90,180,270].map(value=><option key={value} value={value}>{value}°</option>)}</select></label>
    <p className="hint">{yawOnly?'Nur um Z drehen. Höhe und Neigung der Figur bleiben erhalten; die Flächenneigung wird nicht korrigiert.':alignToEdge?'Die längste Flächenkante bestimmt zusätzlich die Drehung in der Ebene.':'Nur die Fläche zur Zielrichtung drehen, ohne zusätzliche Drehung um ihre Normale.'} Zentriert das Modell neu und setzt die Schnittgrenzen neu.</p>
    </details>
  </div>;
}
