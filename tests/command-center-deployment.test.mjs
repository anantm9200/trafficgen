import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('standalone command center is namespaced and does not overwrite existing production homepage',()=>{
 const html=get('../command-center/index.html');
 assert.match(html,/href="\/command-center\/styles.css\?v=20261118-m7"/);
 assert.match(html,/src="\/command-center\/app.js\?v=20261118-m7"/);
 assert.match(html,/SYNTHETIC QA/);
 assert.doesNotMatch(html,/LOCAL STAGING/);
 for(const section of ['overview','campaigns','create','activity','analytics','settings'])assert.match(html,new RegExp('id="'+section+'"'));
});
test('production command center uses authenticated gateway while localhost uses direct API',()=>{
 const js=get('../command-center/app.js');
 assert.match(js,/function campaignApiUrl\(path\)/);
 assert.match(js,/location\.hostname==='127\.0\.0\.1'/);
 assert.match(js,/\/api\/campaign-gateway\?route=/);
 assert.match(js,/encodeURIComponent\(path\.slice\(5\)\)/);
 assert.match(js,/sessionStorage\.getItem\(KEY\)/);
 assert.doesNotMatch(js,/localStorage\.setItem\([^\n]*api.key/i);
});
