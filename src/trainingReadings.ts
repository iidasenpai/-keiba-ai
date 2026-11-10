// Only identified furlong intervals are interpreted; no inferred 1F from a 3F mean.
export const TRAINING_READING_VERSION='training-reading-v2';
export function effortKind(text:string){
 if(/一杯|いっぱい|叩き/.test(text))return '一杯';
 if(/強め|強目|強び|強ビ|気合|仕掛/.test(text))return '強め';
 if(/馬なり|馬也|馬ナリ/.test(text))return '馬なり';
 return '';
}
export function readWorkout(label:string,lines:string[]){
 const text=[label,...lines].join('\n').normalize('NFKC');
 const clocks=new Map<number,number>();
 // Explicit 1F/2F values, or an aligned header followed by cumulative clocks.
 for(const m of text.matchAll(/([1-6])\s*F\s*[:：=]?\s*(\d{1,3}\.\d+)/gi))clocks.set(Number(m[1]),Number(m[2]));
 for(let i=0;i<lines.length-1;i++){
  const header=lines[i].normalize('NFKC').trim();
  if(!/^(?:[1-6]F\s*)+$/i.test(header))continue;
  const fs=[...header.matchAll(/([1-6])F/gi)].map(m=>+m[1]);
  const values=lines[i+1].trim().split(/\s+/);
  if(values.length===fs.length&&values.every(v=>/^\d{1,3}\.\d+$/.test(v)))fs.forEach((f,j)=>clocks.set(f,+values[j]));
 }
 let lastF=clocks.get(1)??null,previousF:number|null=null;
 const lap=text.match(/(?:ラップ|各1F)\s*[:：]\s*((?:\d{1,2}\.\d+\s*[-－→\s]\s*)+\d{1,2}\.\d+)/);
 if(lap){const a=lap[1].match(/\d{1,2}\.\d+/g)!.map(Number);if(a.length>=2&&a.every(v=>v>=9&&v<=20)){lastF=a.at(-1)!;previousF=a.at(-2)!;}}
 if(lastF!==null&&(lastF<9||lastF>20))lastF=null;
 if(lastF!==null&&clocks.has(2)&&previousF===null){const p=clocks.get(2)!-lastF;if(p>=9&&p<=20)previousF=p;}
 const course=text.match(/(?:コース\s*[:：]\s*([^\s\n]+)|(?:^|\s)(栗坂|美坂|栗CW|栗CW|美W|南W|川崎|小林|門別|園田|高知|佐賀)(?=\s|$))/m);
 const going=text.match(/(?:馬場\s*[:：]\s*)?(稍重|不良|良|重)(?=\s|$)/m)?.[1]||'';
 return {label,lastF,previousF,acceleration:lastF!==null&&previousF!==null?Math.round((previousF-lastF)*100)/100:null,effort:effortKind(text),course:course?.[1]||course?.[2]||'',going};
}
export function workoutReadings(lines:string[]){
 const sessions:{previous:boolean,label:string,lines:string[]}[]=[];let s:typeof sessions[number]|null=null;
 for(const raw of lines){const line=raw.normalize('NFKC').trim();
  if(/^(?:\((?:前回|前走時)\)\s*)?(?:\d{2,4}[\/-])?\d{1,2}[\/-]\d{1,2}(?:\s|\(|$)/.test(line)||/^\((?:前回|前走時)\)/.test(line)){
   s={previous:/^\((?:前回|前走時)\)/.test(line),label:line,lines:[]};sessions.push(s);
  }else if(s)s.lines.push(line);
 }
 const dated=(s:typeof sessions[number])=>{const m=s.label.match(/(?:(\d{2,4})[\/-])?(\d{1,2})[\/-](\d{1,2})/);return m?(Number(m[1]||0)*10000+Number(m[2])*100+Number(m[3])):0;};
 const current=sessions.filter(s=>!s.previous).sort((a,b)=>dated(a)-dated(b)).at(-1);
 const previous=sessions.filter(s=>s.previous).sort((a,b)=>dated(a)-dated(b)).at(-1);
 const latest=current?readWorkout(current.label,current.lines):null;
 const before=previous?readWorkout(previous.label,previous.lines):null;
 const comparable=!!(latest&&before&&latest.course&&latest.going&&latest.effort&&latest.course===before.course&&latest.going===before.going&&latest.effort===before.effort&&latest.lastF!==null&&before.lastF!==null);
 return {latest,before,previousDelta:comparable?Math.round((before!.lastF!-latest!.lastF!)*100)/100:null,sessionCount:sessions.filter(s=>!s.previous).length};
}
