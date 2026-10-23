import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'inherit'});
let browser;
try {
  const origin='http://127.0.0.1:4173';
  const url=origin+(process.env.PAGES_BASE_PATH || '/');
  for(let i=0;;i++){
    try{const response=await fetch(url);if(response.ok)break}catch{}
    if(i===100)throw Error('Preview server did not start');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1536,height:1024}});
  const errors=[],remoteRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!request.url().startsWith(origin)&&!request.url().startsWith('blob:')&&!request.url().startsWith('data:'))remoteRequests.push(request.url())});
  await page.goto(url);
  await page.getByAltText('Toast mit versetzter Scheibe',{exact:true}).evaluate(img=>img.decode());
  await page.getByRole('heading',{name:'Alle Scheiben (12)',exact:true}).waitFor({timeout:60000});
  await page.getByRole('button',{name:'Aktive Scheibe als STL exportieren',exact:true}).waitFor();
  await page.getByLabel('Scheibe 6 auswählen',{exact:true}).click();
  await page.getByRole('heading',{name:'Aktive Scheibe 6 / 12',exact:true}).waitFor();
  const stlDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Aktive Scheibe als STL exportieren',exact:true}).click();
  const stl=await stlDownload,bytes=await readFile(await stl.path());
  assert.equal(bytes.length,84+bytes.readUInt32LE(80)*50);
  assert.ok(bytes.readUInt32LE(80)>0);
  await page.getByRole('button',{name:'Lasercutting',exact:true}).click();
  const svgDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Aktive Laser-Kontur als SVG',exact:true}).click();
  const svg=await svgDownload,xml=await readFile(await svg.path(),'utf8');
  assert.match(xml,/width="[\d.]+mm"/);assert.match(xml,/<path d="M/);
  assert.equal(await page.getByRole('button',{name:'Aktive Scheibe als STL exportieren',exact:true}).count(),0);
  // The chosen slicing axis must survive saving/reopening a project.
  await page.getByRole('button',{name:'X',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent.includes('10 gültige Volumenscheiben'),null,{timeout:60000});
  const saved=page.waitForEvent('download');
  await page.getByRole('button',{name:'Projekt speichern',exact:true}).click();
  const projectPath=await (await saved).path();
  const project=JSON.parse(await readFile(projectPath,'utf8'));
  assert.deepEqual(project.sliceNormal,[1,0,0]);
  await page.getByRole('button',{name:'Z',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent.includes('12 gültige Volumenscheiben'),null,{timeout:60000});
  await page.getByLabel('Projektdatei auswählen').setInputFiles(projectPath);
  await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent.includes('10 gültige Volumenscheiben'),null,{timeout:60000});
  assert.equal(await page.getByRole('button',{name:'X',exact:true}).getAttribute('aria-pressed'),'true');
  assert.deepEqual(errors,[]);assert.deepEqual(remoteRequests,[]);
  console.info('Browser smoke passed: local 60 mm bunny, 12 solid slices, synchronized selection, STL/SVG downloads and project axis round trip; no external requests.');
} finally {
  await browser?.close();server.kill();
}
