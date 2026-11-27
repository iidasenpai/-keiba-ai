import {useEffect,useState,ReactNode} from 'react';
// Passing a render function is essential: closed panels must not construct
// heavy children (CSS hiding and a native closed <details> do not do this).
export default function DeferredDetails({open,onOpenChange,summary,children,className}:{open:boolean;onOpenChange:(open:boolean)=>void;summary:ReactNode;children:()=>ReactNode;className?:string}){
 return <details className={className} open={open} onToggle={e=>{if(e.currentTarget===e.target&&e.currentTarget.open!==open)onOpenChange(e.currentTarget.open);}}><summary className="list-none cursor-pointer">{summary}</summary>{open?children():null}</details>;
}
export function useDesktopLayout(){
 const [desktop,setDesktop]=useState(()=>typeof window!=='undefined'&&typeof window.matchMedia==='function'?window.matchMedia('(min-width: 640px)').matches:false);
 useEffect(()=>{if(typeof window.matchMedia!=='function')return;const m=window.matchMedia('(min-width: 640px)'),update=()=>setDesktop(m.matches);update();m.addEventListener('change',update);return()=>m.removeEventListener('change',update);},[]);
 return desktop;
}
export function databasePage(rows:any[],page:number,size=50){const current=Math.max(0,Math.min(page,Math.max(0,Math.ceil(rows.length/size)-1)));return {page:current,pages:Math.ceil(rows.length/size),rows:rows.slice(current*size,(current+1)*size)};}
