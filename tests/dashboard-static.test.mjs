import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('Dashboard has all primary views and no embedded tokens',()=>{
  for(const page of ['overview','builder','campaigns','runs','analytics','websites','devices','settings'])
    assert.ok(html.includes('id="view-'+page+'"'),'missing '+page);
  assert.ok(!/GITHUB_WORKFLOW_TOKEN\\s*[=:]\\s*["'][^"']{20,}/.test(html));
});
test('Static frontend links to real browser scripts',()=>{
 assert.match(html, /href="\/styles.css"/);
 assert.match(html, /src="\/app.js"/);
 assert.ok(css.length>15000);
 assert.ok(js.length>15000);
 for(const route of ['/api/health','/api/spec','/api/validate','/api/dispatch','/api/runs'])
  assert.ok(js.includes(route),'missing '+route);
});

test('Delivered browser JavaScript parses without syntax errors',()=>{assert.doesNotThrow(()=>new Script(js,{filename:'app.js'}));assert.ok(js.includes('/api/auth-check'));});
