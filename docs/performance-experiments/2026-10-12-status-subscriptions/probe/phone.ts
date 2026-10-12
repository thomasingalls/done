/** Target-scoped phone adapter. Never attach to or evaluate an unrelated tab. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const origin = 'http://localhost:53771';
export const adb = (...args: string[]) => execFileSync('/private/tmp/done-phone-receive-debug/platform-tools/adb',args,{encoding:'utf8'});
const wait = (ms:number) => new Promise(resolve=>setTimeout(resolve,ms));
export class Phone {
  ws: WebSocket;
  sequence=0;
  pending=new Map<number,{yes:(value:any)=>void,no:(cause:Error)=>void,timer:ReturnType<typeof setTimeout>}>();
  errors: string[]=[];
  requests: any[]=[];
  phase='setup';
  inScope=false;
  constructor(ws:WebSocket) {
    this.ws=ws;
    ws.onmessage=e=>{
      const v=JSON.parse(String(e.data));
      if(v.id){const p=this.pending.get(v.id);if(!p)return;this.pending.delete(v.id);clearTimeout(p.timer);v.error?p.no(Error(v.error.message)):p.yes(v.result);return;}
      if(v.method==='Runtime.executionContextsCleared')this.inScope=false;
      if(v.method==='Runtime.exceptionThrown')this.errors.push(v.params.exceptionDetails.text);
      if(v.method==='Network.responseReceived'){
        const u=new URL(v.params.response.url);
        if(u.origin===origin && u.pathname.startsWith('/account/'))this.requests.push({path:u.pathname,status:v.params.response.status,phase:this.phase,at:Date.now()});
      }
    };
  }
  send(method:string,params:any={}):Promise<any> {
    if(!/^(Runtime\.evaluate|Runtime\.enable|Network\.(enable|setBypassServiceWorker|emulateNetworkConditions)|Page\.(navigate|close)|Input\.dispatchKeyEvent)$/.test(method))throw Error('Phone command outside allowlist: '+method);
    if(method==='Input.dispatchKeyEvent'&&!this.inScope)throw Error('Input outside verified test document');
    return new Promise((yes,no)=>{const id=++this.sequence;const timer=setTimeout(()=>{this.pending.delete(id);no(Error('Phone command timed out: '+method));},30000);this.pending.set(id,{yes,no,timer});this.ws.send(JSON.stringify({id,method,params}));});
  }
  async evaluate(fn:any,arg?:any):Promise<any> {
    const expression=`(()=>{if(location.origin!==${JSON.stringify(origin)})throw Error('Wrong test origin');return (${fn.toString()})(${JSON.stringify(arg)??'undefined'});})()`;
    const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
    this.inScope=true;return r.result.value;
  }
  async until(fn:any,arg?:any,timeout=30000){const start=Date.now();while(Date.now()-start<timeout){try{const value=await this.evaluate(fn,arg);if(value)return value;}catch(error){if(!/Cannot find context|Execution context was destroyed/.test(String(error)))throw error;}await wait(100);}throw Error('Phone condition timed out');}
  async click(label:string){await this.until((label:string)=>[...document.querySelectorAll<HTMLButtonElement>('button,a')].some(b=>(b.textContent?.trim()===label||b.getAttribute('aria-label')===label)&&!b.disabled),label);await this.evaluate((label:string)=>{const b=[...document.querySelectorAll<HTMLButtonElement>('button,a')].find(b=>(b.textContent?.trim()===label||b.getAttribute('aria-label')===label)&&!b.disabled)!;b.click();},label);}
  async fill(label:string,value:string){await this.evaluate(({label,value}:any)=>{const e=[...document.querySelectorAll('input')].find(e=>e.getAttribute('aria-label')===label||e.labels?.[0]?.textContent?.trim()===label);if(!e)throw Error('Missing input '+label);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},{label,value});}
  async navigate(path:string){if(!path.startsWith('/')||path.startsWith('//'))throw Error('Test navigation only');const before=await this.evaluate(()=>performance.timeOrigin);await this.send('Page.navigate',{url:origin+path});await this.until((before:number)=>performance.timeOrigin!==before&&document.readyState==='complete',before);}
  async key(key:string,code:string,keyCode:number,modifiers=0){await this.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:keyCode,modifiers});await this.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:keyCode,modifiers});}
  async text(){return this.evaluate(()=>{const el=document.querySelector('.card[data-editing="true"] .cm-content');const v=(window as any).__perfEditors.find((v:any)=>v.contentDOM===el);return v.state.doc.toString();});}
  async menu(open:boolean){if(await this.evaluate((open:boolean)=>!!document.querySelector(`.menu-trigger[aria-label="${open?'Open menu':'Close menu'}"]`),open))await this.click(open?'Open menu':'Close menu');}
  async exported(){await this.menu(true);return this.evaluate(async()=>{
    const create=URL.createObjectURL, click=HTMLAnchorElement.prototype.click;
    let bytes:Promise<ArrayBuffer>|undefined;
    try{
      URL.createObjectURL=(blob:Blob|MediaSource)=>{if(!(blob instanceof Blob))throw Error('Unexpected export');bytes=blob.arrayBuffer();return 'blob:disposable-performance-export';};
      HTMLAnchorElement.prototype.click=function(){if(this.href!=='blob:disposable-performance-export')throw Error('Unexpected download');};
      const button=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Export markdown');if(!button)throw Error('No export action');button.click();if(!bytes)throw Error('No export');
      const b=new Uint8Array(await bytes),d=new DataView(b.buffer),decode=new TextDecoder(),files:Record<string,string>={};let at=0;
      while(d.getUint32(at,true)===0x04034b50){if(d.getUint16(at+8,true)!==0)throw Error('Compressed export');const size=d.getUint32(at+18,true),n=d.getUint16(at+26,true),extra=d.getUint16(at+28,true),start=at+30+n+extra;files[decode.decode(b.slice(at+30,at+30+n))]=decode.decode(b.slice(start,start+size));at=start+size;}
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(files)));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    }finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;}
  });}
  async unlock(code:string){await this.click('I already have a workspace');await this.until(()=>[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')?.startsWith('Resume device connection')));await this.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Resume device connection'))!.click());await this.until(()=>!!document.querySelector('input[type=password]'));await this.fill('Device-lock code',code);await this.click('Unlock enrollment');await this.until(()=>!!document.querySelector('.shell'),undefined,45000);}
  async close(){const owned=await this.evaluate(()=>true).catch(()=>false);if(owned)try{await this.send('Page.close');}catch{}this.ws.close();}
}
export async function connectPhone(){
  adb('shell','am','start','-a','android.intent.action.VIEW','-d',origin+'/__status-probe-empty.html','-p','com.android.chrome');
  let tab:any;
  for(let i=0;i<40;i++){const tabs=await(await fetch('http://127.0.0.1:53893/json/list')).json() as any[];const matches=tabs.filter(t=>t.type==='page'&&t.url===origin+'/__status-probe-empty.html');if(matches.length>1)throw Error('Ambiguous disposable phone tabs');if(matches.length===1){tab=matches[0];break;}await wait(100);}
  if(!tab)throw Error('No disposable phone tab');
  const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise<void>((yes,no)=>{ws.onopen=()=>yes();ws.onerror=()=>no(Error('Phone CDP connection'));});
  const phone=new Phone(ws);await phone.send('Runtime.enable');await phone.send('Network.enable',{maxPostDataSize:0});return phone;
}
export async function restorePhone(p:Phone,state:any,marker:string){
  if(state.cookies.length)throw Error('Phone fixture unexpectedly needs browser-wide cookies');
  const origins=state.origins.filter((o:any)=>o.origin===origin);if(origins.length!==1)throw Error('Fixture origin mismatch');
  await p.evaluate(async(marker:string)=>{const owned=localStorage.getItem('__doneStatusProbe');const dbs=await indexedDB.databases(), registrations=await navigator.serviceWorker.getRegistrations(), cachesFound=await caches.keys();if(owned!==marker&&(localStorage.length||dbs.length||registrations.length||cachesFound.length))throw Error('Refusing pre-existing phone test-origin storage');},marker);
  const bundle=readFileSync('node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/lib/coreBundle.js','utf8');
  const literal=bundle.match(/source10 = ('.*');\n/)?.[1];if(!literal)throw Error('Pinned storage codec absent');
  const source=new Function('return '+literal)();
  const restore = { toString: () => `async ({state,marker}) => {
    const module={exports:{}};${source}
    for(const reg of await navigator.serviceWorker.getRegistrations())await reg.unregister();
    for(const name of await caches.keys())await caches.delete(name);
    for(const db of await indexedDB.databases())await new Promise((yes,no)=>{const r=indexedDB.deleteDatabase(db.name);r.onsuccess=()=>yes();r.onerror=()=>no(Error('Test database delete'));r.onblocked=()=>no(Error('Test database still open'));});
    await new StorageScript(false).restore(state);
    localStorage.setItem('__doneStatusProbe',marker);
  }` };
  await p.evaluate(restore,{state:origins[0],marker});
}
