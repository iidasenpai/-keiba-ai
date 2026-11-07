import {describe,it,expect} from 'vitest';
import {ArchiveArrayReader,decodeArchiveStream} from './archiveReader';
import {encodeArchive} from './modelSafety';
describe('bounded archive decoding',()=>{
 const rows=[{id:'1',name:'高知😀',nested:[{x:'comma, bracket] quote" slash\\ newline\n'}]},null,4,true,['佐賀',{}]];
 const text=JSON.stringify(rows);
 it('preserves every value when chunks split inside escapes or Japanese text',()=>{
  for(const size of [1,2,3,7,64]){const p=new ArchiveArrayReader();for(let i=0;i<text.length;i+=size)p.feed(text.slice(i,i+size));expect(p.finish()).toEqual(rows);}
 });
 it('accepts an empty array and surrounding whitespace',()=>{const p=new ArchiveArrayReader();p.feed(' \n[');p.feed(' ]\n');expect(p.finish()).toEqual([]);});
 it.each(['[1,]','[,1]','[1,,2]','[{}','{}','[]{}','["bad\\"]'])('rejects invalid/truncated archives: %s',s=>{expect(()=>{const p=new ArchiveArrayReader();p.feed(s);p.finish();}).toThrow();});
 it('loads existing plain JSON archives',async()=>{expect(await decodeArchiveStream(text)).toEqual(rows);});
 it('round trips the existing gzip format without changing nested saved locks',async()=>{
  const records=Array.from({length:150},(_,i)=>({id:String(i),predictionLock:{models:{StyleFixed:{version:'style-fixed-v1',ranks:[1,2,3]}},horses:[{name:'馬😀',text:'過去走,[]"\\'.repeat(1000)}]}}));
  expect(await decodeArchiveStream(await encodeArchive(records))).toEqual(records);
 });
});
