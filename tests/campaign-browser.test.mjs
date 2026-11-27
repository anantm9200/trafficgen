import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {chromium} from 'playwright';
import {CampaignStore} from '../src/campaign-store.mjs';
import {createCampaignApi} from '../src/campaign-api.mjs';

test('operator creates a draft in Chromium and reads it back from SQLite after reloading', async t => {
  const store = new CampaignStore();
  const apiKey = randomUUID();
  const {server} = createCampaignApi({
    verifySite: async () => assert.fail('Saving a draft must not request ownership verification'),
    dispatchWorker: async () => assert.fail('Saving a draft must not launch a worker'),
    store, apiKey, webRoot: fileURLToPath(new URL('../command-center', import.meta.url))
  });
  t.after(() => store.close());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({serviceWorkers:'block'});
  await page.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort());
  await page.goto(origin);
  await page.getByRole('link', {name:'Settings'}).click();
  await page.locator('#api-key').fill(apiKey);
  await page.locator('#connect').click();
  await page.waitForFunction(() => document.querySelector('#connection').textContent === 'API connected');
  await page.locator('a[href="#create"]').click();
  await page.locator('#create-form [name="name"]').fill('Staging navigation');
  await page.locator('#create-form [name="siteUrl"]').fill('https://example.org');
  await page.locator('#create-form button[type="submit"]').click();
  await page.locator('#campaign-list .campaign').waitFor();
  await page.reload();
  await page.locator('#campaign-list .campaign').waitFor();
  assert.match(await page.locator('#campaign-list').innerText(), /Staging navigation/);
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].status, 'draft');
});
