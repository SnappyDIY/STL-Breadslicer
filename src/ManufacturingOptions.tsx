import React from 'react';
import type {Config} from './model';
import {NumberField} from './NumberField';
type Props={config:Config;disabled:boolean;onUpdate:(patch:Partial<Config>)=>void};
export function ManufacturingOptions({config:c,disabled,onUpdate}:Props){
  const inactive=disabled||c.mode!=='print';
  const field=(key:keyof Config,label:string,value:number,min:number,max:number,step:number)=><label className="value-row"><span>{label}</span><NumberField aria-label={label} disabled={inactive} value={value} min={min} max={max} step={step} onCommit={v=>onUpdate({[key]:v})}/></label>;
  return <>
    <details><summary>Oberflächen / Relief</summary>
      <select aria-label="Reliefmuster" disabled={inactive} value={c.relief>0?(c.reliefPattern??'grooves'):'off'} onChange={e=>onUpdate(e.target.value==='off'?{relief:0}:{relief:Math.min(c.relief||.3,c.thickness*.4),reliefPattern:e.target.value as Config['reliefPattern']})}><option value="off">Ohne Relief</option><option value="grooves">Rillen</option><option value="dots">Punkte</option><option value="cross">Kreuzraster</option></select>
      {c.relief>0&&<>{field('relief','Relieftiefe (mm)',c.relief,.01,Math.max(.01,c.thickness*.45),.05)}{field('reliefSpacing','Reliefabstand (mm)',c.reliefSpacing??3,.5,50,.5)}</>}
      <p className="hint">Eingraviert auf der oberen Schnittfläche. Außenmaße bleiben erhalten. Für 3D-Druck.</p>
    </details>
    <details><summary>Verbindungen</summary>
      <select aria-label="Verbindungsart" disabled={inactive} value={c.connectors?(c.connectorMode??'pins'):'off'} onChange={e=>onUpdate({connectors:e.target.value!=='off',connectorMode:e.target.value==='plug'?'plug':'pins'})}><option value="off">Ohne Verbindungen</option><option value="pins">Passbohrungen mit losen Stiften</option><option value="plug">Steckzapfen und Buchsen</option></select>
      {c.connectors&&<>{field('connectorDiameter','Stiftdurchmesser (mm)',c.connectorDiameter,.3,20,.1)}{field('connectorDepth','Einstecktiefe (mm)',c.connectorDepth??2,.2,20,.1)}{field('connectorClearance','Passungsspiel (mm)',c.connectorClearance??.15,0,1,.05)}</>}
      <p className="hint">Zwei geprüfte Verbindungen je Trennfläche. Zapfen stehen über die Scheibendicke hinaus. Lose Stifte sind im STL-ZIP und 3MF enthalten. Für 3D-Druck.</p>
    </details>
  </>;
}
