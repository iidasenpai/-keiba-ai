import {validateStructuredTraining} from './structuredTraining';
import {sourceDetailIssues,raceClassFromName} from './evidenceReview';
// Source files are untrusted input. Validate the complete batch before editing a draft.
const KINDS=['race','form','standard','recent','training','comment'];
const TRACKS=['帯広','門別','盛岡','水沢','浦和','船橋','大井','川崎','金沢','笠松','名古屋','園田','姫路','高知','佐賀'];
const tidy=(x:any)=>String(x??'').normalize('NFKC').replace(/[\s・･]/g,'');
const str=(x:any,max=500000)=>{if(typeof x!=='string'||x.length>max)throw Error('文字列の形式またはサイズが不正です');return x;};
const validIndexDate=(x:any)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
function urlKind(url:string){
 const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw Error('参照URLが不正です');
 const pdf=u.pathname.match(/^\/PDF\/(\d{4})\/(\d{2})\/(\d{2})\/(h(\d{2})|(\d{8})_v(\d{2}))\.pdf$/);
 if(pdf&&['uma-katsu.net','www.kanazawakeiba-yoso.com'].includes(u.hostname)){
  if(u.search)throw Error('調教PDFの参照URLが不正です');
  const saga=u.hostname==='uma-katsu.net';
  if(saga?!pdf[5]:!pdf[7]||pdf[6]!==pdf[1]+pdf[2]+pdf[3])throw Error('調教PDFの参照元・日付が不正です');
  return {u,id:'',kind:'training',trainingDate:pdf[1]+'-'+pdf[2]+'-'+pdf[3],trainingRaceNo:String(Number(saga?pdf[5]:pdf[7])),trainingTrack:saga?'佐賀':'金沢'};
 }
 if(u.hostname==='nar.sp.netkeiba.com'){
  const id=u.searchParams.get('race_id');if(!/^\d{12}$/.test(id||''))throw Error('netkeibaレースIDが不正です');
  const kind=u.pathname==='/race/shutuba.html'?'race':u.pathname==='/race/newspaper.html'?'form':u.pathname==='/race/speed.html'?(u.searchParams.get('mode')==='past'?'recent':'standard'):'';
  return {u,id,kind};
 }
 if(u.hostname==='s.keibabook.co.jp'){
  const m=u.pathname.match(/^\/chihou\/(cyokyo|danwa)\/(?:1|3)\/(\d{16})$/);if(!m)throw Error('競馬ブックURLが不正です');
  return {u,id:m[2],kind:m[1]==='cyokyo'?'training':'comment'};
 }
 throw Error('未対応の参照サイトです');
}
export function prepareSources(bundles:any[]) {
 if(!bundles.length||bundles.length>8)throw Error('取得ファイルを選んでください（8個以内）');
 const sources:any={},errors:string[]=[];
 for(const b of bundles){
  if(b?.format!=='nar-source-bundle'||b.version!==1||!Array.isArray(b.pages)||b.pages.length>6||!Array.isArray(b.errors))throw Error('Safari取得ファイルの形式が違います');
  for(const e of b.errors)errors.push(String(e?.message||'取得失敗').slice(0,200));
  for(const p of b.pages){
   if(!KINDS.includes(p?.kind))throw Error('未対応のデータ種別です');
   const link=urlKind(str(p.url,500));if(link.kind!==p.kind)throw Error('データ種別とURLが一致しません');
   const m=p.meta;if(m?.surface!==undefined&&!['ダート','芝'].includes(m.surface))throw Error('馬場種別が不正です');if(m){for(const k of ['raceDate','track','raceNo','distance'])str(m[k],30);for(const k of ['raceName','startTime','going','raceClass'])if(m[k]!==undefined)str(m[k],200);}
   if(!m||!/^\d{4}-\d{2}-\d{2}$/.test(m.raceDate)||new Date(m.raceDate+'T00:00:00Z').toISOString().slice(0,10)!==m.raceDate||!TRACKS.includes(m.track)||!/^([1-9]|1[0-2])$/.test(m.raceNo)||!/^\d{3,4}$/.test(m.distance))throw Error('開催情報が不正です');
   if(m.startTime&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(m.startTime))throw Error('発走時刻が不正です');
   const day=m.raceDate.replaceAll('-','');if('trainingDate' in link){if(link.trainingDate!==m.raceDate||link.trainingRaceNo!==m.raceNo||link.trainingTrack!==m.track)throw Error('調教PDFの開催日・会場・Rが一致しません');}else if(day.slice(0,4)!==link.id.slice(0,4)||(link.u.hostname==='nar.sp.netkeiba.com'?(link.id.slice(6,10)!==day.slice(4)||Number(link.id.slice(-2))!==Number(m.raceNo)):link.id.slice(-4)!==day.slice(4)))throw Error('開催日・Rと参照元IDが違います');
   if(!Number.isFinite(Date.parse(p.capturedAt))||Date.parse(p.capturedAt)>Date.now()+300000)throw Error('取得日時が不正です');
   str(p.text);if(p.paceText!==undefined)str(p.paceText);str(p.capturedAt,40);if(!Array.isArray(p.roster)||p.roster.length<1||p.roster.length>18||!Array.isArray(p.rows)||p.rows.length!==p.roster.length)throw Error('出走馬一覧が不正です');
   const nos=new Set();for(const [i,h] of p.roster.entries()){
    if(!/^(?:[1-9]|1[0-8])$/.test(h.umaban)||!str(h.name,40).trim()||nos.has(h.umaban))throw Error('馬番・馬名の重複または欠落があります');nos.add(h.umaban);
    if(p.rows[i].umaban!==h.umaban||tidy(p.rows[i].name)!==tidy(h.name))throw Error('行データと馬一覧が一致しません');
    if(p.kind==='race')for(const k of ['sex','jockey','weight','odds','ninki','bodyChange','raceStatus'])if(p.rows[i][k]!==undefined)str(p.rows[i][k],100);
    if(['standard','recent'].includes(p.kind)){
     const c=p.rows[i].cells;if(!Array.isArray(c)||c.length!==(p.kind==='standard'?15:12)||c.some(v=>typeof v!=='string'||v.length>200)||c[0]!==h.umaban||tidy(c[2])!==tidy(h.name))throw Error('指数表の列数・馬情報が変わっています');
     const row=p.rows[i];
     for(const key of ['distDate','courseDate']){const date=row[key]??row.referenceDates?.[key==='distDate'?'distance':'course'];if(date!==undefined&&date!==null&&date!==''&&(!validIndexDate(date)||date>=m.raceDate))throw Error('適性指数の日付が不正です');}
     if(row.bestDate!==undefined&&row.bestDate!==''&&(!validIndexDate(row.bestDate)||row.bestDate>=m.raceDate))throw Error('最高指数の日付が不正です');
     if(row.runDates!==undefined&&(!Array.isArray(row.runDates)||row.runDates.length!==5||row.runDates.some((d:any)=>d!==null&&d!==''&&(!validIndexDate(d)||d>=m.raceDate))))throw Error('近5走の日付が不正です');
    }
    if(p.kind==='form'){
     const row=p.rows[i];if(row.historyStatus!==undefined&&!['available','unavailable','no-history'].includes(row.historyStatus))throw Error('詳細の取得状態が不正です');
     if(row.historyReason!==undefined)str(row.historyReason,200);
     if(row.layoffWeeks!==undefined&&row.layoffWeeks!==null&&(!Number.isFinite(row.layoffWeeks)||row.layoffWeeks<0||row.layoffWeeks>260))throw Error('休養週数が不正です');
     if(row.courseRecord!==undefined&&row.courseRecord!==null&&['win','second','third','other'].some(k=>!Number.isInteger(row.courseRecord[k])||row.courseRecord[k]<0||row.courseRecord[k]>1000))throw Error('コース成績が不正です');
     if(row.pastRuns!==undefined){if(!Array.isArray(row.pastRuns)||row.pastRuns.length>5)throw Error('過去走詳細は5走以内です');
      for(const run of row.pastRuns){
       if(typeof run.track!=='string'||run.track.length>20||!['ダート','芝'].includes(run.surface)||!Number.isInteger(run.distance)||run.distance<100||run.distance>5000||!Number.isInteger(run.fieldSize)||run.fieldSize<1||run.fieldSize>24||!Array.isArray(run.positions)||run.positions.length>4||run.positions.some(v=>v!==null&&(!Number.isInteger(v)||v<1||v>run.fieldSize)))throw Error('通過順・距離・頭数の形式が不正です');
       if(run.date&&(!validIndexDate(run.date)||run.date>=m.raceDate))throw Error('過去走詳細の日付が不正です');
       if(run.raceClass!==undefined)str(run.raceClass,100);if(run.weight!==undefined&&run.weight!==''&&(typeof run.weight!=='number'||run.weight<20||run.weight>80))throw Error('過去走斤量が不正です');
      }
     }
    }
   }
   if(sources[p.kind])throw Error(`${p.kind}が重複しています。古いファイルを外してください`);
   sources[p.kind]=p;
  }
 }
 if(!sources.race)throw Error('netkeiba出馬表の取得が必要です');
 const base=sources.race,byNo=new Map(base.roster.map(h=>[h.umaban,tidy(h.name)]));
 for(const p of Object.values(sources) as any[]){
  for(const k of ['raceDate','track','raceNo','distance'])if(p.meta[k]!==base.meta[k])throw Error('異なるレースが混在しています（'+k+'）');
  if(p.meta.startTime&&base.meta.startTime&&p.meta.startTime!==base.meta.startTime)throw Error('発走時刻が一致しません');
  if(p.roster.length!==base.roster.length||p.roster.some(h=>byNo.get(h.umaban)!==tidy(h.name)))throw Error(p.kind+'の馬番・馬名が出馬表と一致しません');
 }
 if(sources.training?.representation==='structured-workouts-v1')validateStructuredTraining(sources.training,sources.form);
 if(sources.training&&['uma-katsu.net','www.kanazawakeiba-yoso.com'].includes(new URL(sources.training.url).hostname)&&sources.training.representation!=='structured-workouts-v1')throw Error('調教PDFは構造化記録として取り込んでください');
 const absent=KINDS.filter(k=>!sources[k]);
 const detailIssues=sourceDetailIssues({sources,meta:base.meta});
 return {sources,meta:{...base.meta,raceClass:base.meta.raceClass||raceClassFromName(base.meta.raceName)},detailIssues,sourceRaceId:new URL(base.url).searchParams.get('race_id'),errors,absent};
}
// Preserve five slots, including non-starters. The adjacent annual best is cells[3].
export function indexFields(row:any,recent=false){
 const c=row.cells,number=(v:any)=>/^-?\d+(?:\.\d+)?\*?$/.test(String(v))?String(v).replace('*',''):'';
 if(!recent)return {...Object.fromEntries(['best','avg5','dist','course','r3','r2','r1'].map((k,i)=>[k,number(c[i+3])])),...(validIndexDate(row.bestDate)&&number(c[3])!==''?{bestDate:row.bestDate}:{}),...Object.fromEntries([['distDate',row.distDate??row.referenceDates?.distance],['courseDate',row.courseDate??row.referenceDates?.course]].filter(([,v])=>validIndexDate(v)))};
 const oldToNew=c.slice(4,9).map((v:string,i:number)=>{
  const m=v.replace(/\s+/g,' ').match(/^(.+?)(ダ|芝)(\d{3,4})\s+([SMH])\s+(-?\d+(?:\.\d+)?)\s*\(([-+]?\d+(?:\.\d+)?)\)$/);
  return m?{track:m[1],surface:m[2]==='芝'?'芝':'ダート',distance:Number(m[3]),pace:m[4],index:Number(m[5]),adjustment:Number(m[6]),source:['東京','中山','京都','阪神','中京','新潟','福島','小倉','札幌','函館'].includes(m[1])?'JRA':'NAR',...(validIndexDate(row.runDates?.[i])?{date:row.runDates[i]}:{})}:{index:null,missing:true};
 });
 const recentRuns=oldToNew.reverse();
 const highest=c[3].replace(/\s+/g,' ').match(/^(.+?)(ダ|芝)\d{3,4}\s+[SMH]\s+(-?\d+(?:\.\d+)?)/);
 return {recentRuns,r1:recentRuns[0].index===null?'':String(recentRuns[0].index),r2:recentRuns[1].index===null?'':String(recentRuns[1].index),r3:recentRuns[2].index===null?'':String(recentRuns[2].index),avg5:number(c[9]),...(highest?{bestSurface:highest[2]==='芝'?'芝':'ダート'}:{})};
}

export function prepareBatch(data:any){
 if(data?.format!=='nar-race-batch'||data.version!==1||!Array.isArray(data.races)||data.races.length>100||!Array.isArray(data.errors)||data.errors.length>100)throw Error('一括予想ファイルの形式が違います');
 str(data.raceDate,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(data.raceDate)||new Date(data.raceDate+'T00:00:00Z').toISOString().slice(0,10)!==data.raceDate)throw Error('対象日が不正です');
 str(data.createdAt,40);if(!Number.isFinite(Date.parse(data.createdAt))||Date.parse(data.createdAt)>Date.now()+300000)throw Error('ファイル作成日時が不正です');
 if(!Number.isInteger(data.expectedTotal)||data.expectedTotal<1||data.expectedTotal>100||data.expectedTotal!==data.races.length+data.errors.length)throw Error('対象数と取得済み・取得失敗の件数が一致しません');
 const seen=new Set(),drafts=[];
 const key=(track:string,raceNo:string)=>`${data.raceDate}|${track}|${raceNo}`;
 for(const r of data.races){
  if(!Array.isArray(r?.bundles))throw Error('レースの取得データがありません');
  const d=prepareSources(r.bundles);
  if(d.meta.raceDate!==data.raceDate)throw Error('異なる開催日が混在しています');
  const k=key(d.meta.track,d.meta.raceNo);if(seen.has(k))throw Error('同じレースが重複しています');seen.add(k);
  drafts.push({...d,key:k});
 }
 const errors=data.errors.map(e=>{
  if(!TRACKS.includes(e?.track)||!/^([1-9]|1[0-2])$/.test(e.raceNo))throw Error('取得失敗レースの情報が不正です');
  str(e.message,500);const k=key(e.track,e.raceNo);if(seen.has(k))throw Error('取得済みと取得失敗に同じレースがあります');seen.add(k);
  return {key:k,track:e.track,raceNo:e.raceNo,message:e.message};
 });
 drafts.sort((a,b)=>a.meta.track.localeCompare(b.meta.track,'ja')||Number(a.meta.raceNo)-Number(b.meta.raceNo));
 return {raceDate:data.raceDate,expectedTotal:data.expectedTotal,createdAt:data.createdAt,drafts,errors};
}
