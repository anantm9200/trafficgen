import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../command-center/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../command-center/app.js',import.meta.url),'utf8');
test('campaign builder exposes explicit safe-step controls and no mutating clicks',()=>{
 for(const id of ['journey-steps','add-nav','add-assert','add-scroll','add-dwell','report-dialog','report-sessions','export-runs'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/journey:getJourney\(\)/);
 assert.doesNotMatch(html,/id="add-(click|submit|purchase|checkout)"/);
});
test('monitor distinguishes explicit run evidence from legacy browser traversal',()=>{
 assert.match(js,/Legacy automatic browsing/);
 assert.match(js,/session\.journey\?\.steps/);
 assert.match(js,/Synthetic QA only/);
 assert.match(js,/text\('li',/);
});

test('bounded status polling does not dispatch synthetic traffic or poll hidden tabs',()=>{
 assert.match(js,/async function pollActiveRuns/);
 assert.match(js,/document\.visibilityState==='hidden'/);
 assert.match(js,/\.slice\(0,3\)/);
 assert.match(js,/setInterval\(pollActiveRuns,15000\)/);
});
