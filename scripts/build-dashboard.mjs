import {copyFile, mkdir} from 'node:fs/promises';

const output = new URL('../dist/', import.meta.url);
await mkdir(new URL('command-center/', output), {recursive: true});
for (const path of ['index.html', 'app.js', 'styles.css', 'favicon.svg',
  'command-center/index.html', 'command-center/app.js', 'command-center/styles.css']) {
  await copyFile(new URL('../' + path, import.meta.url), new URL(path, output));
}
