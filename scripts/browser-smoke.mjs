import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'inherit'});
let browser;
try {
  const url='http://127.0.0.1:4173';
  for(let i=0;;i++){
    try{const response=await fetch(url);if(response.ok)break}catch{}
    if(i===100)throw Error('Preview server did not start');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({acceptDownloads:true});
  const errors=[],remoteRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!request.url().startsWith(url)&&!request.url().startsWith('blob:')&&!request.url().startsWith('data:'))remoteRequests.push(request.url())});
  await page.goto(url);
  await page.getByRole('button',{name:'🐇 Beispielhase laden (lokal generiert)'}).click();
  await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent.startsWith('Geladen:'),null,{timeout:60000});
  await page.getByLabel('Muster',{exact:true}).selectOption('solid');
  await page.getByRole('button',{name:'Scheiben erzeugen',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent.includes('echte Volumenscheiben erstellt'),null,{timeout:60000});
  const stlDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'STL',exact:true}).click();
  const stl=await stlDownload,bytes=await readFile(await stl.path());
  assert.equal(bytes.length,84+bytes.readUInt32LE(80)*50,'STL triangle count must match binary length');
  assert.ok(bytes.readUInt32LE(80)>0);
  assert.equal(await page.getByRole('button',{name:'SVG',exact:true}).count(),0);
  await page.getByLabel('Fertigungsmodus').selectOption('laser');
  const svgDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'SVG',exact:true}).click();
  const svg=await svgDownload,xml=await readFile(await svg.path(),'utf8');
  assert.match(xml,/width="[\d.]+mm"/);assert.match(xml,/<path d="M/);
  assert.equal(await page.getByRole('button',{name:'STL',exact:true}).count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(remoteRequests,[],'All model processing and WASM loading must stay local');
  console.info('Browser smoke passed: local bunny import, WASM, slicing, STL and SVG download, separate manufacturing modes; no external requests.');
} finally {
  await browser?.close();server.kill();
}
