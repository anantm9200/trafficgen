import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8')
  .replace(/<link[^>]*>/g,'').replaceAll('<script type="module" src="/app.js"></script>','');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('Dashboard typography and layout are legible on desktop, tablet and mobile',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const viewport of [{width:1440,height:900},{width:1024,height:768},{width:390,height:844}]){
   const page=await browser.newPage({viewport});
   try{
    await page.setContent(html);
    await page.addStyleTag({content:css});
    const result=await page.evaluate(()=>{
     const px=s=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
     const height=s=>parseFloat(getComputedStyle(document.querySelector(s)).minHeight);
     return{
      body:parseFloat(getComputedStyle(document.body).fontSize),
      title:px('#view-overview .section-heading h1'),
      paragraph:px('#view-overview .section-heading p'),
      nav:px('.nav-link'),
      button:px('.section-heading .button'),
      buttonHeight:height('.section-heading .button'),
      kpi:px('.kpi strong'),
      maxWidth:document.documentElement.scrollWidth,
      canvasWidth:document.documentElement.clientWidth,
      heroVisible:document.querySelector('.hero-details')!==null
     };
    });
    assert.ok(result.body>=15,JSON.stringify({viewport,result}));
    assert.ok(result.title>=30,JSON.stringify({viewport,result}));
    assert.ok(result.paragraph>=14,JSON.stringify({viewport,result}));
    assert.ok(result.nav>=13,JSON.stringify({viewport,result}));
    assert.ok(result.button>=13,JSON.stringify({viewport,result}));
    assert.ok(result.buttonHeight>=44,JSON.stringify({viewport,result}));
    assert.ok(result.kpi>=30,JSON.stringify({viewport,result}));
    assert.equal(result.heroVisible,true);
    assert.ok(result.maxWidth<=result.canvasWidth+2,'Horizontal overflow '+JSON.stringify({viewport,result}));
    await page.evaluate(()=>{
     document.querySelector('#view-overview').classList.remove('active');
     document.querySelector('#view-builder').classList.add('active');
    });
    const inputs=await page.evaluate(()=>({
      font:parseFloat(getComputedStyle(document.querySelector('#plan-name')).fontSize),
      height:parseFloat(getComputedStyle(document.querySelector('#plan-name')).height),
      label:parseFloat(getComputedStyle(document.querySelector('label[for="plan-name"]')).fontSize)
    }));
    assert.ok(inputs.font>=15&&inputs.height>=48&&inputs.label>=12,JSON.stringify({viewport,inputs}));
    assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth))<=2,'Builder overflow at '+viewport.width);
   }finally{await page.close();}
  }
 }finally{await browser.close();}
});
