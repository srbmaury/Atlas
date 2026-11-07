import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  let lastId=2;
  const savedConversations=new Map<string,{id:string;title:string;messages:unknown[];updated:number}>();
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    const path=url.pathname.replace(/^\/api/,'');
    const method=route.request().method();
    const json=(value:unknown)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
    if(path.endsWith('/audit'))return json({events:[],next_cursor:null});
    if(path==='/me') return json({id:'u1',email:'test@example.com',mode:'ai',max_file_bytes:10485760});
    if(path==='/workspaces') return json([{id:'w1',name:'Test workspace',role:'manager'}]);
    if(path==='/workspaces/w1/documents')return json([{id:'d1',name:'notes.md',size:128,status:'ready',pages:1,chunk_count:1}]);
    if(path==='/gmail/status')return json({connected:false,email:null,configured:false});
    if(path==='/drive/status')return json({connected:false,account:null,configured:false});
    if(path==='/workspaces/w1/sources')return json([{provider:'github',connected:true,account:'test-user'},{provider:'calendar',connected:true,account:'test-user'}]);
    if(path.includes('external')&&method==='GET')return json([]);
    if(path==='/workspaces/w1/conversations'&&method==='GET')return json([{id:'old',title:'Earlier conversation',updated:1234}]);
    if(path==='/workspaces/w1/conversations'&&method==='POST'){
      const data=route.request().postDataJSON();
      const item={id:`new-${++lastId}`,title:data.title,messages:data.messages,updated:1235};
      savedConversations.set(item.id,item);
      return json(item);
    }
    if(path==='/workspaces/w1/conversations/old')return json({id:'old',title:'Earlier conversation',updated:1234,messages:[{role:'user',content:'Old question'}]});
    if(path.startsWith('/workspaces/w1/conversations/')&&method==='GET')return json(savedConversations.get(path.split('/').pop()!)||{id:path.split('/').pop(),title:'New chat',messages:[],updated:1235});
    if(path.startsWith('/workspaces/w1/conversations/')&&method==='PUT'){
      const data=route.request().postDataJSON();
      const item={id:path.split('/').pop()!,title:data.title,messages:data.messages,updated:1236};
      savedConversations.set(item.id,item);
      return json(item);
    }
    if(path==='/workspaces/w1/connected-chat/stream'&&method==='POST'){
      const data=route.request().postDataJSON();
      const scope=[...(data.include_documents?['documents']:[]),...(data.include_gmail?['gmail']:[]),...(data.providers||[])];
      const sources=(data.providers||[]).includes('github')?[{chunk_id:'pr-1',document_id:'',name:'A very long GitHub pull request title without a file extension',page:0,location_type:'github',provider:'github',url:'https://github.com/example/repo/pull/1',text:'First source line.\nSecond source line.\n\nOriginal: https://example.com/record?q=ok.'}]:[];
      const result={answer:'The answer is grounded in the selected sources. [1]',sources,mode:'connected',scope,coverage_note:'Some claims were omitted because the selected passages did not support them.',
        retrieval:{passages_considered:sources.length,passages_used:sources.length,sources:scope.map(provider=>({provider,status:'searched',found:provider==='github'?sources.length:0,considered:provider==='github'?sources.length:0,used:provider==='github'?sources.length:0}))},
        citation_audit:{claims:[{claim:'The answer is grounded in the selected sources.',citations:[1],overlap:0.2,status:'needs_review'}],needs_review:1,note:'Heuristic checks only.'}};
      const body=[
        {type:'status',text:'Searching selected sources…'},
        {type:'delta',text:result.answer},
        {type:'done',result}
      ].map(event=>JSON.stringify(event)).join('\n')+'\n';
      return route.fulfill({status:200,contentType:'application/x-ndjson',body});
    }
    if(path==='/workspaces/w1/chat')return json({answer:'The answer is grounded in the document. '.repeat(60),sources:[],mode:'ai'});
    if(path==='/workspaces/w1/source-status'||path==='/workspaces/w1/external-connections')return json([]);
    return json([]);
  });
  await page.goto('/');
  await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
});

// Source filters are intentionally hidden until the compact picker is opened.
// Keep test assertions scoped to the open popover rather than exposing every
// integration in the main toolbar.
async function openSourcePicker(page: import('@playwright/test').Page) {
  const trigger = page.getByRole('button', {name:/Sources:/});
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
}

test('Home question begins an independent conversation',async({page})=>{
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  await page.getByRole('textbox',{name:'Ask Atlas'}).fill('Fresh question from home');
  await page.getByRole('button',{name:'Ask Atlas',exact:true}).last().click();
  await expect(page.getByText('Fresh question from home').first()).toBeVisible();
  await expect(page.locator('.user-message')).toHaveCount(1);
});

test('composer remains in view after long response',async({page})=>{
  await page.getByRole('textbox',{name:'Your question'}).fill('Write a long answer');
  await page.getByRole('button',{name:'Send question'}).click();
  await expect(page.locator('.answer-row')).toBeVisible();
  const thread=page.locator('.chat-workspace .thread');
  const composer=page.locator('.chat-workspace .composer');
  await expect(composer).toBeInViewport();
  await thread.evaluate(node=>node.scrollTop=node.scrollHeight);
  await expect(composer).toBeInViewport();
});

test('Gmail replaces sources gallery without stacking beneath it',async({page})=>{
  await page.getByRole('button',{name:'Connected sources',exact:true}).click();
  await page.locator('.integration-tile').filter({hasText:'Gmail'}).click();
  await expect(page.getByRole('heading',{name:'Gmail',exact:true})).toBeVisible();
  await expect(page.locator('.integrations-grid')).toHaveCount(0);
  await page.getByRole('button',{name:/All sources/}).click();
  await expect(page.locator('.integrations-grid')).toBeVisible();
});

test('All conversations opens the saved history panel',async({page})=>{
  await page.getByRole('button',{name:/All conversations/}).click();
  await expect(page.locator('.chat-history')).toBeVisible();
  await expect(page.locator('.chat-history-open')).toHaveText('Earlier conversation');
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  await page.getByRole('button',{name:'Open conversations',exact:true}).click();
  await expect(page.locator('.chat-history')).toBeVisible();
});

test('connection dialog traps focus and dismisses with Escape',async({page})=>{
  await page.getByRole('button',{name:'Connected sources',exact:true}).click();
  await page.locator('.integration-tile').filter({hasText:'GitHub'}).click();
  const dialog=page.getByRole('dialog',{name:'Manage source connection'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Close dialog'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('source-only questions can exclude documents and restore scope from chat history',async({page})=>{
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'Documents'}).uncheck();
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'GitHub'}).check();
  await page.getByRole('textbox',{name:'Your question'}).fill('List three open pull requests from GitHub');
  await page.getByRole('button',{name:'Send question'}).click();
  await expect(page.locator('.answer-head').last()).toContainText('GitHub');
  await expect(page.locator('.answer-head').last()).not.toContainText('Documents');
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'Documents'}).check();
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'GitHub'}).uncheck();
  await page.getByRole('button',{name:'List three open pull requests from GitHub',exact:true}).click();
  await openSourcePicker(page);
  await expect(page.getByRole('checkbox',{name:'Documents'})).not.toBeChecked();
  await openSourcePicker(page);
  await expect(page.getByRole('checkbox',{name:'GitHub'})).toBeChecked();
});

test('single and multiple selected providers are sent with the prompt',async({page})=>{
  await page.route('**/api/workspaces/w1/sources',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([
    {provider:'github',connected:true,account:'test-user'},
    {provider:'calendar',connected:true,account:'test-user'},
  ])}));
  const requests: {question:string;include_documents:boolean;providers:string[]}[]=[];
  await page.route('**/api/workspaces/w1/connected-chat/stream',async route=>{
    const data=route.request().postDataJSON();
    requests.push(data);
    const sources=data.providers.includes('github')?[{chunk_id:'pr-1',document_id:'',name:'GitHub issue',page:0,location_type:'github',provider:'github',url:'https://github.com/example/repo/issues/1',text:'First source line.\nSecond source line.\n\nOriginal: https://example.com/record?q=ok.'}]:[];
    const result={answer:'A supported result. [1]',sources,mode:'connected',scope:[...(data.include_documents?['documents']:[]),...data.providers]};
    const body=[{type:'status',text:'Searching selected sources…'},{type:'done',result}].map(event=>JSON.stringify(event)).join('\n')+'\n';
    await route.fulfill({status:200,contentType:'application/x-ndjson',body});
  });

  await page.reload();
  await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
  await openSourcePicker(page);
  await expect(page.getByRole('checkbox',{name:'Calendar'})).toBeEnabled();
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'Documents'}).uncheck();
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'GitHub'}).check();
  await page.getByRole('textbox',{name:'Your question'}).fill('Summarize the selected issue');
  await page.getByRole('button',{name:'Send question'}).click();
  await expect.poll(()=>requests.length).toBe(1);
  expect(requests[0]).toMatchObject({include_documents:false,providers:['github']});

  await page.getByRole('button',{name:'New chat',exact:true}).click();
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'Documents'}).uncheck();
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'GitHub'}).check();
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'Calendar'}).check();
  await page.getByRole('textbox',{name:'Your question'}).fill('Compare details from the selected sources');
  await page.getByRole('button',{name:'Send question'}).click();
  await expect.poll(()=>requests.length).toBe(2);
  expect(requests[1]).toMatchObject({include_documents:false,providers:['github','calendar']});
});

test('source passage keeps paragraphs and makes URLs clickable',async({page})=>{
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'Documents'}).uncheck();
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'GitHub'}).check();
  await page.getByRole('textbox',{name:'Your question'}).fill('Find the source passage');
  await page.getByRole('button',{name:'Send question'}).click();
  await page.getByRole('button',{name:/Open source 1: A very long GitHub pull request title/}).click();
  const dialog=page.getByRole('dialog',{name:'Source passage'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('region',{name:'Cited sentence'}).locator('.document-plain p')).toHaveText('First source line. Second source line.');
  const cited=dialog.getByRole('region',{name:'Cited sentence'});
  await expect(cited.locator('.document-field')).toContainText('Original');
  const link=cited.getByRole('link',{name:'https://example.com/record?q=ok'});
  await expect(link).toHaveAttribute('href','https://example.com/record?q=ok');
  await expect(link).toHaveAttribute('target','_blank');
});

test('answer shows readable source previews, evidence review, and follow-up prompts',async({page})=>{
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'Documents'}).uncheck();
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'GitHub'}).check();
  await page.getByRole('textbox',{name:'Your question'}).fill('Summarize this pull request');
  await page.getByRole('button',{name:'Send question'}).click();
  await expect(page.locator('.citation-preview')).toContainText('First source line.');
  await expect(page.getByText('Some claims may need a closer look.')).toBeVisible();
  await expect(page.getByText('Some claims were omitted because the selected passages did not support them.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Explain this evidence'})).toBeVisible();
  await page.getByText('Sources and evidence').click();
  await expect(page.locator('.answer-trace')).toContainText('1 matches');
  await expect(page.locator('.answer-trace')).toContainText('need review');
});

test('select all toggles, and calendar prompts stay scoped to calendar',async({page})=>{
  const providers=['github','notion','slack','calendar','linear','jira','onedrive','outlook','sharepoint'];
  await page.route('**/api/workspaces/w1/sources',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(providers.map(provider=>({provider,connected:true,account:'test-user'})))}));
  await page.route('**/api/gmail/status*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({connected:true,email:'test@example.com',configured:true})}));
  await page.route('**/api/workspaces/w1/drive/status',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({connected:true,account:'test@example.com',configured:true})}));
  const requests: {question:string;include_documents:boolean;include_gmail:boolean;providers:string[]}[]=[];
  await page.route('**/api/workspaces/w1/connected-chat/stream',async route=>{
    requests.push(route.request().postDataJSON());
    const result={answer:'Your next calendar event is: [1]',sources:[],mode:'source_results',scope:['calendar']};
    await route.fulfill({status:200,contentType:'application/x-ndjson',body:JSON.stringify({type:'done',result})+'\n'});
  });

  await page.reload();
  await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
  await openSourcePicker(page);
  await expect(page.getByRole('checkbox',{name:'Calendar'})).toBeEnabled();
  await openSourcePicker(page);
  await page.getByRole('button',{name:'Select all connected sources and documents'}).click();
  await expect(page.getByRole('button',{name:'Unselect all connected sources and documents'})).toBeVisible();
  for (const name of ['Documents','Gmail','Drive','GitHub','Notion','Slack','Calendar','Linear','Jira','OneDrive','Outlook','SharePoint'])
  await openSourcePicker(page);
    await expect(page.getByRole('checkbox',{name,exact:true})).toBeChecked();
  await openSourcePicker(page);
  await page.getByRole('button',{name:'Unselect all connected sources and documents'}).click();
  for (const name of ['Documents','Gmail','Drive','GitHub','Notion','Slack','Calendar','Linear','Jira','OneDrive','Outlook','SharePoint'])
  await openSourcePicker(page);
    await expect(page.getByRole('checkbox',{name,exact:true})).not.toBeChecked();

  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'Calendar'}).check();
  await page.getByRole('textbox',{name:'Your question'}).fill('list next 10 events from my calendar');
  await page.getByRole('button',{name:'Send question'}).click();
  await expect.poll(()=>requests.length).toBe(1);
  expect(requests[0]).toMatchObject({include_documents:false,include_gmail:false,providers:['calendar']});
});

test('explicit Gmail selection is preserved for flight email questions',async({page})=>{
  await page.route('**/api/gmail/status*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({connected:true,email:'test@example.com',configured:true})}));
  const requests: {question:string;include_documents:boolean;include_gmail:boolean;providers:string[]}[]=[];
  await page.route('**/api/workspaces/w1/connected-chat/stream',async route=>{
    const data=route.request().postDataJSON();
    requests.push(data);
    const result={answer:'No matching email was found.',sources:[],mode:'source_results',scope:['gmail']};
    await route.fulfill({status:200,contentType:'application/x-ndjson',body:JSON.stringify({type:'done',result})+'\n'});
  });
  await page.reload();
  await openSourcePicker(page);
  await expect(page.getByRole('checkbox',{name:'Gmail'})).toBeEnabled();
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'Documents'}).uncheck();
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'Gmail'}).check();
  await page.getByRole('textbox',{name:'Your question'}).fill('Find my flight email for Varanasi 6E 501');
  await page.getByRole('button',{name:'Send question'}).click();
  await expect.poll(()=>requests.length).toBe(1);
  expect(requests[0]).toMatchObject({include_documents:false,include_gmail:true,providers:[]});
  await expect(page.locator('.answer-row')).toBeVisible();
  await expect(page.locator('.answer-head').last()).toContainText('Live source results');
  await expect(page.locator('.answer-head').last()).toContainText('Gmail');
  await openSourcePicker(page);
  await expect(page.getByRole('checkbox',{name:'Calendar'})).not.toBeChecked();
});

test('new chat resets source scope to documents only',async({page})=>{
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'Documents'}).uncheck();
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'GitHub'}).check();
  await page.getByRole('button',{name:'New chat',exact:true}).click();
  await openSourcePicker(page);
  await expect(page.getByRole('checkbox',{name:'Documents'})).toBeChecked();
  await openSourcePicker(page);
  await expect(page.getByRole('checkbox',{name:'GitHub'})).not.toBeChecked();
});

test('pull-request questions use the selected GitHub scope',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'Documents'}).uncheck();
  await openSourcePicker(page);
  await page.getByRole('checkbox',{name:'GitHub'}).check();
  await page.getByRole('textbox',{name:'Your question'}).fill('my pull requests');
  await page.getByRole('button',{name:'Send question'}).click();
  await expect(page.locator('.answer-head').last()).toContainText('GitHub');
  await expect(page.locator('.answer-head').last()).not.toContainText('Documents');
  await openSourcePicker(page);
  await expect(page.getByRole('checkbox',{name:'Documents'})).not.toBeChecked();
  await openSourcePicker(page);
  await expect(page.getByRole('checkbox',{name:'GitHub'})).toBeChecked();
  await expect(page.locator('.evidence-panel')).toHaveCount(0);
  await expect(page.locator('.answer .source-chip .file.source')).toHaveText('SRC');
  const badge=await page.locator('.answer .source-chip .file.source').boundingBox();
  expect(badge?.width).toBe(25);
  const research=await page.locator('.chat-workspace .research').evaluate(node=>getComputedStyle(node).gridTemplateColumns);
  expect(research.trim().split(/\s+/)).toHaveLength(1);
});

test('global search starts independent research after opening a saved chat',async({page})=>{
  await page.getByRole('button',{name:'Earlier conversation',exact:true}).click();
  await expect(page.locator('.user-message')).toHaveText(/Old question/);
  await page.getByRole('button',{name:/Search documents or ask/}).click();
  await expect(page.getByRole('textbox',{name:'Search your workspace',exact:true})).toBeFocused();
  await page.getByRole('textbox',{name:'Search your workspace',exact:true}).fill('Independent question');
  await page.getByRole('button',{name:'Search selected sources with Atlas: Independent question',exact:true}).click();
  await expect(page.locator('.answer-row')).toBeVisible();
  await expect(page.locator('.user-message')).toHaveCount(1);
  await expect(page.locator('.user-message')).toHaveText(/Independent question/);
});

test('workspace and document search inputs do not show the inner focus box',async({page})=>{
  await page.getByRole('button',{name:/Search documents or ask/}).click();
  const workspaceSearch=page.getByRole('textbox',{name:'Search your workspace',exact:true});
  await expect(workspaceSearch).toBeFocused();
  await expect.poll(()=>workspaceSearch.evaluate(node=>getComputedStyle(node).outlineStyle)).toBe('none');
  await expect.poll(()=>workspaceSearch.evaluate(node=>getComputedStyle(node).boxShadow)).toBe('none');

  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Documents',exact:true}).click();
  const documentSearch=page.getByRole('searchbox',{name:'Search documents'});
  await expect(documentSearch).toBeFocused();
  await expect.poll(()=>documentSearch.evaluate(node=>getComputedStyle(node).outlineStyle)).toBe('none');
  await expect.poll(()=>documentSearch.evaluate(node=>getComputedStyle(node).boxShadow)).toBe('none');
});

test('library search and clear restore the document list',async({page})=>{
  await page.getByRole('button',{name:'Documents',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search documents'}).fill('missing-file');
  await expect(page.getByRole('heading',{name:'No matching documents'})).toBeVisible();
  await page.getByRole('button',{name:'Clear search',exact:true}).click();
  await expect(page.getByRole('button',{name:'notes.md',exact:true})).toBeVisible();
});

test('mobile navigation closes after choosing a destination',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.getByRole('button',{name:'Documents',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Documents',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Close navigation',exact:true})).toHaveCount(0);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  expect(overflow).toBe(false);
});

test('Home keeps the primary research entry accessible on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Open menu',exact:true}).click();
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Ask anything across your knowledge'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Ask Atlas'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
});

test('nested citations open a modal excerpt and restore focus',async({page}, testInfo)=>{
 await page.route('**/api/workspaces/w1/connected-chat/stream',route=>route.fulfill({status:200,contentType:'application/x-ndjson',body:JSON.stringify({type:'done',result:{answer:'Evidence **supports [1]**.',mode:'connected',sources:[{chunk_id:'pr-1',document_id:'',name:'Release decision',page:0,location_type:'github',provider:'github',url:'https://github.com/example/repo/pull/1',text:'Release after accessibility review.'}]}})+'\n'}));
  await openSourcePicker(page);
 await page.getByRole('checkbox',{name:'GitHub'}).check();
 await page.getByRole('textbox',{name:'Your question'}).fill('Summarize the sources');
 await page.getByRole('button',{name:'Send question'}).click();
 const citation=page.getByRole('button',{name:'Open source 1: Release decision',exact:true});
 await expect(citation).toBeVisible();
 await citation.click();
 const drawer=page.getByRole('dialog',{name:'Source passage'});
 await expect(drawer).toContainText('Release after accessibility review.');
 await page.screenshot({path:testInfo.outputPath('after-evidence.png'),animations:'disabled'});
 await expect(drawer).toContainText('GitHub');
 await expect(drawer).not.toContainText('Section 0');
 await expect(drawer.getByRole('link',{name:'Open in GitHub',exact:true})).toHaveAttribute('href','https://github.com/example/repo/pull/1');
 await expect(drawer.getByRole('button',{name:'Close preview'})).toBeFocused();
 await page.keyboard.press('Shift+Tab');
 await expect(drawer.getByRole('button',{name:'Close',exact:true})).toBeFocused();
 await page.keyboard.press('Tab');
 await expect(drawer.getByRole('button',{name:'Close preview'})).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(drawer).toHaveCount(0);
 await expect(citation).toBeFocused();
});

test('IME confirmation does not submit a question',async({page})=>{
 const input=page.getByRole('textbox',{name:'Your question'});
 await input.fill('質問');
 await input.dispatchEvent('keydown',{key:'Enter',isComposing:true});
 await expect(page.locator('.user-message')).toHaveCount(0);
});

test('audit screen captures',async({page}, testInfo)=>{
 test.setTimeout(120000);
 for(const width of [390,768,1280,1920]){
 await page.setViewportSize({width,height:900});
 for(const theme of ['light','dark']){
 await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
 for(const screen of ['Home','Documents','Connected sources','Ask Atlas']){
 if(await page.getByRole('button',{name:'Open menu',exact:true}).isVisible())await page.getByRole('button',{name:'Open menu',exact:true}).click();
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:screen,exact:true}).click();
 await page.screenshot({path:testInfo.outputPath(`${process.env.AUDIT_PHASE||'after'}-${screen}-${width}-${theme}.png`),fullPage:true,animations:'disabled'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),`${screen} ${width} ${theme}`).toBe(false);
 if(width>600){
 const sidebar=await page.locator('.sidebar').boundingBox();
 const main=await page.locator('.main').boundingBox();
 expect(main!.x,`Navigation must not cover ${screen} at ${width}px`).toBeGreaterThanOrEqual(sidebar!.x+sidebar!.width);
 }
 }
 }
 }
});

test('document processing failures expose context and retry',async({page})=>{
 await page.route('**/api/workspaces/w1/documents',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([
 {id:'bad',name:'failed.pdf',size:512,status:'failed',pages:0,chunk_count:0,error:'The PDF is password protected. Upload an unlocked copy.'},
 {id:'pending',name:'pending.md',size:128,status:'processing',pages:1,chunk_count:0}
 ])}));
 await page.reload();
 await page.getByRole('button',{name:'Documents',exact:true}).click();
 await expect(page.getByText('The PDF is password protected. Upload an unlocked copy.')).toBeVisible();
 await expect(page.getByRole('button',{name:'Reindex failed.pdf'})).toBeVisible();
 await expect(page.getByText('Processing',{exact:true})).toBeVisible();
 await page.getByRole('searchbox',{name:'Search documents'}).fill('absent');
 await expect(page.getByRole('heading',{name:'No matching documents'})).toBeVisible();
});

test('authentication failure stays actionable and announced',async({page}, testInfo)=>{
 await page.route('**/api/me',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({detail:'Please sign in.'})}));
 await page.reload();
 await expect(page.getByRole('heading',{name:'Create your workspace'})).toBeVisible();
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.route('**/api/auth/login',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({detail:'Incorrect email or password.'})}));
 await page.getByLabel('Email address').fill('test@example.com');
 await page.getByLabel('Password',{exact:true}).fill('wrong-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.locator('.auth-form').getByRole('alert')).toContainText('Incorrect email or password.');
 await page.screenshot({path:testInfo.outputPath('after-auth.png'),animations:'disabled'});
});

test('workspace creation, settings deletion and sign out preserve the selected workspace',async({page})=>{
 let created=false;
 await page.route('**/api/workspaces',route=>{
  if(route.request().method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'w1',name:'Test workspace',role:'manager'},...(created?[{id:'w2',name:'Research review',role:'manager'}]:[])])});
  expect(route.request().postDataJSON()).toEqual({name:'Research review'});
  created=true;
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'w2',name:'Research review',role:'manager'})});
 });
 await page.route('**/api/workspaces/w2',route=>{
  expect(route.request().method()).toBe('DELETE');
  expect(route.request().postDataJSON()).toEqual({name:'Research review'});
  created=false;
  return route.fulfill({status:200,contentType:'application/json',body:'{}'});
 });
 await page.getByRole('button',{name:'Switch workspace',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Your workspaces'});
 await dialog.getByLabel('New workspace',{exact:true}).fill('Research review');
 await dialog.getByRole('button',{name:'Create workspace',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.locator('.workspace-btn')).toContainText('Research review');
 await page.getByRole('button',{name:'Switch workspace',exact:true}).click();
 await dialog.getByRole('link',{name:'Members, permissions & workspace settings'}).click();
 await expect(page).toHaveURL(/settings\?section=workspace&workspaceId=w2/);
 const remove=page.getByRole('button',{name:'Delete workspace',exact:true});
 await expect(remove).toBeDisabled();
 await page.getByLabel('Type workspace name to confirm').fill('Research review');
 await remove.click();
 await expect(page.getByText('Workspace deleted.',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Back to Atlas'}).click();
 await expect(page.locator('.workspace-btn')).toContainText('Test workspace');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Create your workspace',exact:true})).toBeVisible();
});

test('document actions preview, retry and remove a workspace file',async({page})=>{
 await page.route('**/api/workspaces/w1/documents/d1/chunks',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({document:{id:'d1',name:'notes.md',size:128,status:'ready',pages:1,chunk_count:1},chunks:[{id:'c1',page:1,text:'Review the release checklist.'}]})}));
 await page.getByRole('button',{name:'Documents',exact:true}).click();
 await page.getByRole('button',{name:'notes.md',exact:true}).click();
 const preview=page.getByRole('dialog',{name:'Document preview'});
 await expect(preview).toContainText('Review the release checklist.');
 await preview.getByRole('button',{name:'Close preview'}).click();
 const retry=page.waitForRequest(request=>request.url().endsWith('/documents/d1/retry')&&request.method()==='POST');
 await page.getByRole('button',{name:'Reindex notes.md',exact:true}).click();
 await retry;
 page.once('dialog',dialog=>dialog.accept());
 const removed=page.waitForRequest(request=>request.url().endsWith('/documents/d1')&&request.method()==='DELETE');
 await page.getByRole('button',{name:'Delete notes.md',exact:true}).click();
 await removed;
});

test('stopping an answer preserves the submitted question and releases busy state',async({page})=>{
 let pending:import('@playwright/test').Route|undefined;
 await page.route('**/api/workspaces/w1/connected-chat/stream',route=>{pending=route;});
 await page.getByRole('textbox',{name:'Your question'}).fill('A question that takes time');
 await page.getByRole('button',{name:'Send question'}).click();
 await expect.poll(()=>Boolean(pending)).toBe(true);
 await page.getByRole('button',{name:'Stop',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Answer stopped.'})).toBeVisible();
 await expect(page.locator('.user-message')).toHaveText(/A question that takes time/);
 await expect(page.locator('.answer-row')).toHaveCount(0);
 await pending!.abort().catch(()=>undefined);
 await page.getByRole('textbox',{name:'Your question'}).fill('Try another question');
 await expect(page.getByRole('button',{name:'Send question'})).toBeEnabled();
});

test('workspace metadata uses the workspaceId query parameter',async({page})=>{
 const statusRequest=page.waitForRequest(request=>{
  const url=new URL(request.url());
  return url.pathname==='/api/gmail/status'&&url.searchParams.get('workspaceId')==='w1';
 });
 await page.reload();
 const request=await statusRequest;
 expect([...new URL(request.url()).searchParams]).toEqual([['workspaceId','w1']]);
 await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
});

test('document imports recover an accepted staged upload after a lost acknowledgement',async({page})=>{
 const size=9*1024*1024;
 let chunks=0,completions=0;
 await page.route('**/api/workspaces/w1/uploads**',route=>{
  const path=new URL(route.request().url()).pathname;
  const json=(data:unknown)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  if(path.endsWith('/uploads'))return json({id:'upload-1',part_bytes:size});
  if(route.request().method()==='PUT'){chunks++;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Acknowledgement lost'})});}
  if(path.endsWith('/complete')){completions++;return json({id:'d1',name:'large.txt',size,status:'ready',pages:1,chunk_count:1});}
  return json({offset:size});
 });
 await page.locator('input[type=file]').setInputFiles({name:'large.txt',mimeType:'text/plain',buffer:Buffer.alloc(size,97)});
 await expect(page.getByRole('status').filter({hasText:'1 ready to search'})).toBeVisible();
 expect(chunks).toBe(1);
 expect(completions).toBe(1);
 await expect(page.getByRole('status').filter({hasText:'Uploading'})).toHaveCount(0);
});

test('web import reports success and clears its input',async({page})=>{
 await page.route('**/api/workspaces/w1/web-pages',route=>{
  expect(route.request().postDataJSON()).toEqual({url:'https://example.com/article'});
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({name:'Article',duplicate:false})});
 });
 await page.getByRole('button',{name:'Documents',exact:true}).click();
 await page.getByLabel('Save public web page').fill('https://example.com/article');
 await page.getByRole('button',{name:'Add URL',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Added Article to your library for indexing.'})).toBeVisible();
 await expect(page.getByLabel('Save public web page')).toHaveValue('');
});

test('empty-library Add documents button keeps its padding on Home', async ({ page }) => {
    await page.route('**/api/workspaces/w1/documents', route => route.fulfill({status:200,contentType:'application/json',body:'[]'}));
    await page.reload();
    await page.getByRole('button', {name:'Overview',exact:true}).click();
    const button = page.locator('.home-card-empty').getByRole('button', {name:'Add documents',exact:true});
    await expect(button).toBeVisible();
    const style = await button.evaluate(element => { const value=getComputedStyle(element); return {left:parseFloat(value.paddingLeft),right:parseFloat(value.paddingRight),top:parseFloat(value.paddingTop),height:element.getBoundingClientRect().height}; });
    expect(style.left).toBeGreaterThanOrEqual(12);
    expect(style.right).toBeGreaterThanOrEqual(12);
    expect(style.top).toBeGreaterThanOrEqual(8);
    expect(style.height).toBeGreaterThanOrEqual(34);
});

test('workspace switcher stays compact and avatar opens account settings', async ({ page }) => {
    await page.getByRole('button', {name:'Switch workspace',exact:true}).click();
    const dialog = page.getByRole('dialog', {name:'Your workspaces'});
    await expect(dialog.getByRole('heading',{name:'Members & access'})).toHaveCount(0);
    await expect(dialog.getByLabel('Registered member email')).toHaveCount(0);
    await expect(dialog.getByRole('link',{name:'Members, permissions & workspace settings'})).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('link',{name:'Account settings',exact:true}).first().click();
    await expect(page.getByRole('heading',{name:'Account',exact:true})).toBeVisible();
    await expect(page.getByRole('region',{name:'Profile',exact:true})).toContainText('test@example.com');
    await page.getByRole('button',{name:'Dark',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await page.getByRole('link',{name:'Back to Atlas'}).click();
    await expect(page.locator('.workspace-btn')).toContainText('Test workspace');
});

test('settings fit a narrow screen and preserve workspace on return', async ({ page }) => {
    await page.setViewportSize({width:390,height:844});
    await page.goto('/settings?section=workspace&workspaceId=w1');
    await expect(page.getByRole('heading',{name:'Workspace & members',exact:true})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({path:'test-results/settings-mobile.png',fullPage:true});
    await page.getByRole('button',{name:'Account',exact:true}).click();
    await page.getByRole('button',{name:'Sign out',exact:true}).click();
    await expect(page.getByRole('heading',{name:'You’re signed out',exact:true})).toBeVisible();
});
