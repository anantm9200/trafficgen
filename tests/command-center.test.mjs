import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../public/',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const js=readFileSync(new URL('app.js',root),'utf8');
const css=readFileSync(new URL('styles.css',root),'utf8');
test('six independent workspaces have navigable and accessible landmarks',()=>{
 for(const page of ['overview','campaigns','create','activity','analytics','settings']){
  assert.match(html,new RegExp('id="'+page+'"'));
  assert.match(html,new RegExp('href="#'+page+'"'));
 }
 assert.match(js,/function activateRoute\(\)/);
 assert.match(js,/aria-current/);
 assert.match(css,/workspace-screen\[hidden\]/);
});
test('overview renders only authenticated execution evidence',()=>{
 for(const id of ['activity-chart','worker-depth','worker-wait','worker-exec','worker-uptime','recent-activity','outcome-chart','qa-report-count','qa-progress-track'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/const campaigns=state\.campaigns,runs=state\.runs,worker=state\.workerHealth/);
 assert.match(js,/run\.createdAt\|\|run\.startedAt/);
 assert.match(js,/source==='authenticated_qa_reporting_api'/);
 assert.match(html,/Synthetic QA sessions only/);
});
test('campaign search and recurring schedule remain bounded and preview-only',()=>{
 for(const id of ['campaign-search','campaign-filters','schedule-mode','schedule-fields','plan-preview'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/type="datetime-local"/);
 assert.match(js,/state\.campaignSearch/);
 assert.match(js,/function updateDraftPreview\(\)/);
 assert.match(js,/scheduleMode/);
 assert.match(html,/No traffic or analytics events are generated during setup/);
 assert.doesNotMatch(html,/id="add-(click|purchase|checkout|submit)"/);
});
test('theme, bounded auto-refresh and consent-safe labeling are explicit',()=>{
 assert.match(html,/id="theme-toggle"/);
 assert.match(css,/:root\[data-theme="dark"\]/);
 assert.match(js,/document\.visibilityState!=='hidden'/);
 assert.match(js,/60000\)/);
 assert.match(html,/Production analytics protected/);
});

test('workspace key validates separately before DGX connection',()=>{
 const code=readFileSync(new URL('command-center/app.js',root),'utf8');
 assert.match(code,/async function verifyWorkspaceKey/);
 assert.match(code,/\/api\/auth-check/);
 assert.match(code,/Workspace key verified/);
 assert.match(code,/state\.keyAccepted&&state\.connected/);
});
