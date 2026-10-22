export type Pattern = 'solid'|'honeycomb'|'grid'|'voronoi'|'gyroid';
export type Mode = 'print'|'laser';
export interface Config {thickness:number; density:number; cell:number; wall:number; pattern:Pattern; mode:Mode; kerf:number; sheetWidth:number; sheetHeight:number; relief:number; connectorDiameter:number; connectors:boolean; boundaries:number[];}
export const defaults:Config={thickness:5,density:35,cell:8,wall:2,pattern:'honeycomb',mode:'print',kerf:0.15,sheetWidth:300,sheetHeight:200,relief:0,connectorDiameter:3,connectors:false,boundaries:[]};
export function boundaries(min:number,max:number,step:number):number[]{if(!Number.isFinite(step)||step<=0||max<=min)throw Error('Ungültige Schnittparameter');const n=Math.ceil((max-min)/step);if(n>150)throw Error('Maximal 150 Scheiben');return Array.from({length:n+1},(_,i)=>i===n?max:Math.min(max,min+i*step));}
export function validateBoundaries(values:number[],min:number,max:number){if(values.length<2||Math.abs(values[0]-min)>0.001||Math.abs(values.at(-1)!-max)>0.001||values.some((v,i)=>i>0&&v-values[i-1]<0.05))throw Error('Schnittgrenzen müssen aufsteigend sein und das Modell vollständig abdecken.');}
export interface ProjectFile {schemaVersion:1; name:string; config:Config; sourceSTLBase64:string; filename:string;}
