import {listRescueEntries,readRescueEntry} from './rescueStorage';

const start=document.getElementById('start-app') as HTMLButtonElement;
const rescue=document.getElementById('rescue-data') as HTMLButtonElement;
const status=document.getElementById('startup-status')!;
const files=document.getElementById('rescue-files')!;
let starting=false;
start.onclick=async()=>{
  if(starting)return;
  starting=true;start.disabled=true;rescue.disabled=true;
  status.textContent='保存レースを読み込んでいます。起動できない場合は、ページを開き直して「保存データの救出」を選んでください。';
  // Paint this message before importing React, the model or the saved archive.
  await new Promise(resolve=>setTimeout(resolve,50));
  try {await import('./main');}
  catch(error){
    status.textContent=`起動できませんでした。保存データの救出を試してください。${error instanceof Error?error.message:''}`;
    starting=false;start.disabled=false;rescue.disabled=false;
  }
};
rescue.onclick=async()=>{
  start.disabled=true;rescue.disabled=true;files.replaceChildren();
  status.textContent='保存項目を確認しています。全レースの展開・集計は行いません。';
  try {
    const entries=await listRescueEntries();
    const note=document.createElement('p');
    note.textContent='以下を1つずつ保存してください。救出ファイルは通常の一括読込用ではありません。保存したファイルをChatGPTに渡して復旧に使います。';
    files.append(note);
    for(const entry of entries){
      const button=document.createElement('button');
      button.style.cssText='display:block;max-width:100%;overflow-wrap:anywhere;margin:12px 0;padding:12px;font-size:14px';
      button.textContent=`${entry.key}（${entry.source}）を保存`;
      button.onclick=async()=>{
        button.disabled=true;status.textContent=`${entry.key}を読み出しています。`;
        try {
          const blob=await readRescueEntry(entry);
          const url=URL.createObjectURL(blob), a=document.createElement('a');
          a.href=url;a.download=`nar-rescue-${entry.source}-${entry.key}.json`;
          document.body.append(a);a.click();a.remove();
          setTimeout(()=>URL.revokeObjectURL(url),60000);
          status.textContent='ダウンロードを開始しました。iPhoneの保存先でファイルを確認し、残りも1つずつ保存してください。';
        }catch(error){status.textContent=error instanceof Error?error.message:'書き出しに失敗しました。';}
        finally{button.disabled=false;}
      };
      files.append(button);
    }
    status.textContent=entries.length?`${entries.length}件の保存項目があります。元データへの書き込みは行っていません。`:'このブラウザには保存データがありません。通常タブで開いてください。';
  }catch(error){status.textContent=error instanceof Error?error.message:'保存領域の確認に失敗しました。';}
  finally{start.disabled=false;rescue.disabled=false;}
};
