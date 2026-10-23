import React from 'react';
import {Contours,Icon} from './ui';
import {bounds,type Loop} from './laser';
import {silhouetteDirections,type SilhouetteDirection} from './silhouette';
import {NumberField} from './NumberField';

type Props={loops:Loop[];direction:SilhouetteDirection;includeHoles:boolean;offset:number;loading:boolean;error?:string;hasSource:boolean;kerf:number;onDirection:(direction:SilhouetteDirection)=>void;onHoles:(include:boolean)=>void;onOffset:(offset:number)=>void};
export function SilhouettePanel({loops,direction,includeHoles,offset,loading,error,hasSource,kerf,onDirection,onHoles,onOffset}:Props){
  const b=bounds(loops);
  return <section className="active-panel silhouette-panel panel">
    <h2>Modell-Silhouette</h2>
    <p className="silhouette-description">Paralleler Schattenumriss des gesamten Modells</p>
    <div className="segmented projection-directions" role="group" aria-label="Blickrichtung der Silhouette">
      {Object.entries(silhouetteDirections).map(([key,option])=><button key={key} aria-pressed={direction===key} className={direction===key?'active':''} disabled={!hasSource} onClick={()=>onDirection(key as SilhouetteDirection)}>{option.label}</button>)}
    </div>
    <div className="active-preview silhouette-preview">
      {loops.length&&!loading?<Contours loops={loops} filled shadow kerf={kerf}/>:<div className="empty-preview"><Icon name="laser" size={38}/><p>{error??(loading?'Silhouette wird berechnet …':hasSource?'Bei diesem Abstand bleibt keine Kontur übrig.':'Zuerst ein Modell laden')}</p></div>}
    </div>
    <label className="silhouette-offset"><span>Konturabstand (mm)</span><input type="range" aria-label="Konturabstand Schieberegler" min="-20" max="20" step=".1" value={offset} disabled={!hasSource} onChange={event=>onOffset(Number(event.target.value))}/><NumberField aria-label="Konturabstand (mm)" min={-20} max={20} step={.1} value={offset} disabled={!hasSource} onCommit={onOffset}/></label>
    <p className="hint offset-hint">Positiv: nach außen · negativ: nach innen · 0: Originalkontur</p>
    <label className="silhouette-holes"><input type="checkbox" checked={includeHoles} disabled={!hasSource} onChange={event=>onHoles(event.target.checked)}/>Durchgehende Innenöffnungen berücksichtigen</label>
    <p className="silhouette-size">{loops.length?`${(b.maxX-b.minX).toFixed(2)} × ${(b.maxY-b.minY).toFixed(2)} mm · ${loops.length} geschlossene Kontur${loops.length===1?'':'en'}`:'Maßhaltige Parallelprojektion in Millimetern'}</p>
    <p className="hint">Freie Blickrichtung: Modell links drehen und „Anwenden“. Scheibendicke und Füllmuster beeinflussen die Silhouette nicht.</p>
  </section>;
}
