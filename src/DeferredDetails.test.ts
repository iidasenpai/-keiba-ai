import {describe,it,expect} from 'vitest';
import {createElement} from 'react';import {renderToString} from 'react-dom/server';
import DeferredDetails,{databasePage} from './DeferredDetails';
describe('history UI load',()=>{
 it('never builds hidden detail children, but shows them when opened',()=>{
  let calls=0;const render=()=>{calls++;return createElement('div',null,'履歴集計');};
  const closed=renderToString(createElement(DeferredDetails,{open:false,onOpenChange:()=>{},summary:'詳細',children:render}));
  expect(calls).toBe(0);expect(closed).toContain('詳細');expect(closed).not.toContain('履歴集計');
  const opened=renderToString(createElement(DeferredDetails,{open:true,onOpenChange:()=>{},summary:'詳細',children:render}));expect(calls).toBe(1);expect(opened).toContain('履歴集計');
 });
 it('shows at most 50 horses, preserves all matches, and clamps after filtering',()=>{
  const rows=Array.from({length:123},(_,id)=>({id}));
  expect(databasePage(rows,0).rows).toHaveLength(50);expect(databasePage(rows,1).rows[0].id).toBe(50);
  expect(databasePage(rows,2).rows).toHaveLength(23);expect(databasePage(rows.slice(0,4),2).rows).toHaveLength(4);expect(databasePage([],10).rows).toEqual([]);
  expect([0,1,2].flatMap(p=>databasePage(rows,p).rows)).toEqual(rows);
 });
});
