import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import ModelComparisonPanel from './ModelComparisonPanel';
import AuditPanel from './AuditPanel';

// Simulates an archive whose records are expensive to materialize. Rendering a
// collapsed panel must not inspect even one record, irrespective of its size.
const inaccessibleArchive = () => new Proxy([] as any[], {
 get() { throw new Error('closed panel accessed the archive'); }
});
describe('startup archive work',()=>{
 it('does not evaluate model comparisons until opened',()=>{
  const html=renderToStaticMarkup(createElement(ModelComparisonPanel,{records:inaccessibleArchive()}));
  expect(html).toContain('保存した事前予想でモデルを比較');
  expect(html).not.toContain('<table');
 });
 it('does not build audit summaries until opened',()=>{
  const html=renderToStaticMarkup(createElement(AuditPanel,{records:inaccessibleArchive(),currentId:null,onCommit:async()=>{}}));
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('<table');
 });
});
