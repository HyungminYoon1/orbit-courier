const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const primaryFlow=async(page,outDir)=>{
 const errors=[],checks=[],outcomes=[];page.on('pageerror',e=>errors.push(e.message));
 const ok=(v,l)=>{if(!v)throw Error(l);checks.push(l);};
 await page.reload();
 const input=async(id,value)=>{const el=page.locator('#'+id);const current=Number(await el.inputValue());const step=Number(await el.getAttribute('step'));await el.focus();for(let n=0;n<Math.round(Math.abs(value-current)/step);n++)await page.keyboard.press(value>current?'ArrowRight':'ArrowLeft');assert.equal(Number(await el.inputValue()),value);};
 const launch=async()=>{await page.locator('#launch').click();await page.locator('#outcome').waitFor({state:'visible',timeout:30000});};
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('#seed').fill('qa-orbit-1013');await page.locator('#apply-seed').click();
 await page.locator('#stage').selectOption('1');await page.locator('#reset').click();
 await page.locator('#seed').fill('잘못된코드');await page.locator('#apply-seed').click();
 ok((await page.locator('#notice').innerText()).includes('도전 코드'),'invalid code rejected');
 await page.locator('#seed').fill('qa-orbit-1013');await page.locator('#apply-seed').click();
 ok((await page.locator('#notice').innerText())==='','corrected code clears stale error');
 await page.getByText('비교 실험',{exact:true}).click();
 await page.locator('#playback').selectOption('4');
 await input('angle',90);await input('power',110);await input('burn',0);
 await page.locator('#launch').click();await page.locator('#launch').click();
 ok((await page.locator('#flight-state').innerText())==='일시정지','pause flight via UI');
 await page.locator('#launch').click();await page.locator('#outcome').waitFor({state:'visible',timeout:30000});
 ok((await page.locator('#outcome').innerText()).includes('조건 미충족'),'elliptic launch fails');
 ok((await page.locator('#outcome').innerText()).includes('이심률'),'failure diagnoses eccentricity');
 await page.screenshot({path:outDir+'/ellipse-failure-1440.png',fullPage:true});
 await page.locator('#retry').click();await input('power',100);await launch();
 ok((await page.locator('#outcome').innerText()).includes('임무 성공'),'independent circular orbit succeeds');
 ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('web-lab-progress-v1')).apps['orbit-courier'].completed===1),'only one independent completion');
 for(let stage=1;stage<=6;stage++){
  if(stage>1){await page.locator('#next').click();await page.locator('#reference').click();await launch();}
  outcomes.push(await page.locator('#outcome h2').innerText());
  ok(outcomes.at(-1).includes('임무 성공'),'mission '+stage+' actual success');
  ok((await page.locator('#experiment-copy').innerText()).length>60,'mission '+stage+' experiment content');
  await page.screenshot({path:outDir+'/mission-'+stage+'-1440.png',fullPage:true});
 }
 ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('web-lab-progress-v1')).apps['orbit-courier'].completed===1),'assisted flights do not add independent completions');
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'result no overflow '+width);
  await page.screenshot({path:outDir+'/transfer-result-'+width+'.png',fullPage:true});
 }
 await page.reload();
 ok(await page.locator('#seed').inputValue()==='qa-orbit-1013'&&await page.locator('#stage').inputValue()==='6','reload code and mission checkpoint');
 ok((await page.locator('#status').innerText()).includes('힌트 사용'),'assistance survives reload');
 await page.locator('#reset').click();
 const plan=await page.locator('#angle,#power,#burn,#burnAt').evaluateAll(nodes=>nodes.map(n=>n.value));
 await page.locator('#reset').click();
 ok(JSON.stringify(plan)===JSON.stringify(await page.locator('#angle,#power,#burn,#burnAt').evaluateAll(nodes=>nodes.map(n=>n.value))),'deterministic authored reset');
 ok(errors.length===0,'no observed page errors');
 return {checks:checks.length,errors,outcomes,selectors:['#experiment-copy','#launch','#retry','#radius-chart','#reference'],screenshots:['ellipse-failure-1440.png','mission-1-1440.png','mission-6-1440.png','transfer-result-390.png','transfer-result-320.png']};
};
async function audit(page,outDir){
  await fs.mkdir(outDir,{recursive:true});
  const additions=[];
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  const logs=[];page.on('console',message=>{if(['warning','error'].includes(message.type()))logs.push(message.type()+': '+message.text());});
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:width===1440?1000:844});
    await page.evaluate(()=>scrollTo(0,0));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'startup horizontal fit '+width);
    await page.screenshot({path:outDir+'/startup-'+width+'.png'});
  }
  await page.setViewportSize({width:1440,height:1000});

  await page.locator('#seed').fill('edge-orbit'); await page.locator('#apply-seed').click();
  await page.locator('#space').focus();
  const attempts=await page.locator('#attempts').innerText();
  await page.locator('#space').dispatchEvent('keydown',{key:' ',isComposing:true});
  assert.equal(await page.locator('#attempts').innerText(),attempts,'fixture IME must not launch');
  await page.keyboard.down('Space'); await page.keyboard.down('Space');
  assert.equal(await page.locator('#flight-state').innerText(),'비행 중','held Space repeat must not pause');
  await page.keyboard.up('Space'); await page.locator('#reset').click();
  await page.locator('#angle').focus(); await page.keyboard.press('End'); await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#angle').inputValue(),'180','range max clamps real keyboard');
  await page.locator('#power').focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#power').inputValue(),'20','range min clamps real keyboard');
  await page.locator('#reset').click();
  additions.push('IME fixture, real held Space, actual keyboard range clamps');

  const primary=await primaryFlow(page,outDir);

  
  const privateKey='orbit-courier-v2';
  const durableBefore=await page.evaluate(k=>localStorage.getItem(k),privateKey);
  const summaryBefore=await page.evaluate(()=>localStorage.getItem('web-lab-progress-v1'));
  await page.evaluate(k=>{window.edgeSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===k)throw new DOMException('fixture quota','QuotaExceededError');return window.edgeSet.call(this,key,value);};},privateKey);
  try{

  await page.locator('#reset').click();
  await page.locator('#hint').click();
  assert.match(await page.locator('#notice').innerText(),/저장 불가/);

    assert.equal(await page.evaluate(k=>localStorage.getItem(k),privateKey),durableBefore,'quota preserves durable private data');
    assert.equal(await page.evaluate(()=>localStorage.getItem('web-lab-progress-v1')),summaryBefore,'quota does not publish');
  }finally{await page.evaluate(()=>{Storage.prototype.setItem=window.edgeSet;delete window.edgeSet;});}
  const peer={completed:2,total:9,updatedAt:'2026-10-13T00:00:00.000Z'};
  await page.evaluate(entry=>{
    const raw=localStorage.getItem('web-lab-progress-v1');
    const value=raw?JSON.parse(raw):{version:1,apps:{}};
    value.apps['echo-vault']=entry;
    localStorage.setItem('web-lab-progress-v1',JSON.stringify(value));
    localStorage.setItem('edge-peer-private','keep');
  },peer);
  await page.getByText('조작·점수·기기 기록',{exact:true}).click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#clear').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('edge-peer-private')),'keep','own erase retains peer private key');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('web-lab-progress-v1')).apps['echo-vault']),peer,'own erase retains peer aggregate');
  assert.equal(await page.evaluate(k=>localStorage.getItem(k),privateKey),null,'own erase removes own private key');
  additions.push('Storage.setItem quota fixture, readback preservation, actual own erase retaining peer fixture');

  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:width===1440?1000:844});
    await page.locator('#space').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'final horizontal fit '+width);
    await page.screenshot({path:outDir+'/final-viewport-'+width+'.png'});
  }
  assert.deepEqual(logs,[],'observed console errors/warnings');
  assert.deepEqual(pageErrors,[],'all-flow page errors');
  const report={primary,additions,logs,pageErrors,fixtureBoundary:'Synthetic IME/detached event/File.text timing are failure injections; normal controls use Playwright input. Headless Chrome viewport emulation is not a physical phone.'};
  await fs.writeFile(outDir+'/browser-report.json',JSON.stringify(report,null,2),'utf8');
  return report;
}
module.exports=audit;
if(require.main===module)(async()=>{
  const url=process.argv[2],target=new URL(url);if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||!target.port)throw Error('Supply own loopback URL');
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||path.resolve(__dirname,'../../output/playwright/implement-20261012/node_modules/playwright'));
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--mute-audio']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  try{const page=await context.newPage();await page.goto(url);const result=await audit(page,path.resolve(__dirname,'../.qa/output/playwright/edge-20261013'));console.log(JSON.stringify(result,null,2));}
  finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

