export type Pattern = 'solid'|'honeycomb'|'grid'|'voronoi'|'gyroid';
export type Mode = 'print'|'laser';
export interface Config {thickness:number; density:number; cell:number; wall:number; pattern:Pattern; mode:Mode; kerf:number; sheetWidth:number; sheetHeight:number; relief:number; connectorDiameter:number; connectors:boolean; boundaries:number[]; sliceSizing?:'thickness'|'count'; sliceThicknessLimit?:number; laserSource?:'slice'|'silhouette'; silhouetteDirection?:'front'|'side'|'top'; silhouetteHoles?:boolean; silhouetteOffset?:number; geometryResolution?:number; reliefPattern?:'grooves'|'dots'|'cross'; reliefSpacing?:number; connectorMode?:'pins'|'plug'; connectorDepth?:number; connectorClearance?:number; nestingGap?:number;}
export const defaults:Config={thickness:5,density:35,cell:8,wall:2,pattern:'solid',mode:'print',kerf:0.15,sheetWidth:300,sheetHeight:200,relief:0,connectorDiameter:3,connectors:false,boundaries:[]};
export function boundaries(min:number,max:number,step:number):number[]{if(![min,max,step].every(Number.isFinite)||step<=0||max<=min)throw Error('Ungültige Schnittparameter');let n=Math.ceil((max-min)/step);if(n>1&&(max-min)-(n-1)*step<0.05)n--;if(n>150)throw Error('Maximal 150 Scheiben');return Array.from({length:n+1},(_,i)=>i===n?max:Math.min(max,min+i*step));}
export function validateBoundaries(values:number[],min:number,max:number){if(![min,max,...values].every(Number.isFinite)||max<=min||values.length>151||values.length<2||Math.abs(values[0]-min)>0.001||Math.abs(values.at(-1)!-max)>0.001||values.some((v,i)=>i>0&&v-values[i-1]<0.05))throw Error('Schnittgrenzen müssen aufsteigend sein und das Modell vollständig abdecken.');}
export interface ProjectFile {schemaVersion:1; name:string; config:Config; sourceSTLBase64:string; filename:string;}

/** Slice distances refer to the center plane; solids extend to either boundary. */
export function sliceMidpoint(start:number,end:number):number {
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('Ungültige Schnittgrenzen.');
  return start+(end-start)/2;
}

/** Equal slices always cover the complete model. A thickness request is an
 * upper bound: choose enough slices, then derive their exact common thickness.
 */
export function uniformSlicePlan(min:number,max:number,request:{kind:'count'|'thickness';value:number}):{boundaries:number[];thickness:number} {
  const span=max-min;
  if(!Number.isFinite(min)||!Number.isFinite(max)||span<=0||!Number.isFinite(request.value)||request.value<=0)throw Error('Ungültige Schnittparameter.');
  const count=request.kind==='count'?request.value:Math.max(1,Math.ceil(span/request.value-1e-6));
  if(!Number.isInteger(count)||count<1||count>150)throw Error('Die Anzahl muss zwischen 1 und 150 Scheiben liegen.');
  const thickness=span/count;
  if(thickness<0.05)throw Error('Die Scheibendicke muss mindestens 0,05 mm betragen.');
  return {thickness,boundaries:Array.from({length:count+1},(_,i)=>i===count?max:min+i*thickness)};
}

/** Preserve the last edited quantity when model size or slicing axis changes. */
export function resizeUniformSlices(config:Config,min:number,max:number):Config {
  const kind=config.sliceSizing??'thickness';
  const value=kind==='count'?Math.max(1,config.boundaries.length-1):(config.sliceThicknessLimit??config.thickness);
  return {...config,...uniformSlicePlan(min,max,{kind,value}),sliceSizing:kind,...(kind==='thickness'?{sliceThicknessLimit:value}:{})};
}
