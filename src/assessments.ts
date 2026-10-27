// Evidence text is not a rating. Preserve the note and expose the derived score separately.
const clamp=(n:number,l:number,h:number)=>Math.max(l,Math.min(h,n));
const harmless=/(?:僅かな|わずかな)?(?:遅れ|後着)(?:は|も|が)?(?:心配|不安|問題)(?:は)?(?:なし|ない|無|なく)|(?:心配|不安|問題|反動)(?:は|も|が)?(?:なし|ない|無|なく)|遅れ心配なし/g;
export function commentAssessment(raw:any){
 const sentences=String(raw||'').normalize('NFKC').split(/[。！？\n]/).map(s=>s.trim()).filter(Boolean);
 if(!sentences.length)return {score:null,positive:[],negative:[],conditional:[]};
 let score=55;const positive:string[]=[],negative:string[]=[],conditional:string[]=[];
 for(const sentence of sentences){
  const text=sentence.replace(harmless,'');
  const negated=/(?:好調|順調|上向|良化|好仕上がり|仕上がり良|期待|楽しみ).{0,10}(?:ではない|でない|ではなく|していない|いていない|とはいえない|とは言えない|できない|出来ない|薄い|乏しい)/.test(text);
  const concern=/様子見|半信半疑|良化途上|状態ひと息|疲れ|本調子.{0,8}(?:ない|届か|至ら)|余裕残り|重め|叩(?:き|いた).{0,8}(?:必要|から)|使ってから|慎重|割引|期待薄|まだ.{0,12}ない/.test(text);
  if(negated||concern){score-=5;negative.push(sentence);continue;}
  if(/できれば|運べれば|決まれば|次第|なら|課題|どうか|未知/.test(text))conditional.push(sentence);
  if(/好仕上がり|態勢.{0,3}整|好調|上向|良くなって|状態改善|状態充実/.test(text)){score+=4;positive.push(sentence);}
  if(/ここ目標|巻き返せる|好レース|楽しみ/.test(text)){score+=3;positive.push(sentence);}
  if(/使いつつ|課題|出遅れ|気ムラ/.test(text))score-=3;
 }
 return {score:Math.round(clamp(score,35,75)),positive:[...new Set(positive)],negative,conditional};
}
export const commentScore=(raw:any)=>commentAssessment(raw).score??55;
export function latestWorkout(lines:string[]){
 // Session boundaries, not an arbitrary number of trailing lines. Never use (前回) as today's clock.
 const sessions:{previous:boolean;label:string;lines:string[]}[]=[];let current:any=null;
 for(const raw of lines){const line=raw.trim();if(!line)continue;
  if(/^(?:\(前回\)\s*)?(?:\d{4}\/)?\d{1,2}\/\d{1,2}(?:\s|$)/.test(line)||/^\(前回\)/.test(line)){
   current={previous:/^\(前回\)/.test(line),label:line,lines:[]};sessions.push(current);
  }else if(current)current.lines.push(line);
 }
 const latest=sessions.filter(s=>!s.previous).at(-1);let lastF:number|null=null;
 if(latest)for(const line of latest.lines){
  const clock=line.replace(/[［\[].*?[］\]]/g,'').trim();
  if(!/^\d{1,3}\.\d(?:\s+\d{1,3}\.\d){0,5}$/.test(clock))continue;
  const values=clock.split(/\s+/).map(Number),last=values.at(-1)!;
  // A 3F time such as 40.5 is not a 1F time. Positional numbers and other horses' clocks are excluded.
  if(last>=9&&last<=20)lastF=last;
 }
 return {latest,lastF,sessionCount:sessions.length};
}
export function trainingAssessment(block:{summary:string;arrow:string;lines:string[]}){
 const workout=latestWorkout(block.lines);const words=(block.summary+' '+(workout.latest?.lines.join(' ')||'')).normalize('NFKC').replace(harmless,'');let score=0;
 if(/[↗↑]/.test(block.arrow))score+=2;if(/[↘↓]/.test(block.arrow))score-=2;
 const pos=[/抜群|絶好|好気配|力強い|鋭い|迫力|文句なし|申し分なし|伸び良好|動き良好|時計優秀|好時計/];
 if(pos.some(r=>r.test(words)))score+=3;
 if(/良化|上向き|順調|軽快|余力十分|反応良|脚捌き良|仕上がり良|気配上々|馬なり余力|状態改善|動作が改善/.test(words))score++;
 if(/モタれ|前向きさに欠け|上昇味薄い|物足りない|重い|反応鈍|伸び欠く|気配平凡|一息|バテ|低調/.test(words))score-=2;
 if(/大きく遅れ|一杯.*遅れ|動き重い|精彩欠く|状態ひと息|不振/.test(words))score-=2;
 if(/先着/.test(words))score+=2;if(/同入/.test(words))score++;
 if(/遅れ/.test(words))score-=3;
 if(/馬なり余力/.test(words))score++;
 const lastF=workout.lastF;if(lastF!==null){if(lastF<=11.3)score+=4;else if(lastF<=11.8)score+=3;else if(lastF<=12.3)score+=2;else if(lastF>=13.5)score-=2;}
 if(/一杯に追う|叩き一杯/.test(words)&&lastF!==null&&lastF>=13)score-=2;
 if(/連闘.*軽め|攻め軽め|低負荷/.test(block.summary))score=Math.min(score,1);
 const numeric=Math.round(clamp(70+score*4,30,97));
 return {numeric,grade:numeric>=88?'S':numeric>=78?'A':numeric>=65?'B':numeric>=50?'C':'D',lastF,workoutDate:workout.latest?.label||'',clockVerified:!!workout.latest};
}
