import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
export const contexts=new AsyncLocalStorage();
export const sha=b=>createHash('sha256').update(b).digest('hex');
let events=[];
export function observe(tag,data={}){const c=contexts.getStore();if(c&&events.length<100000)events.push({at:Date.now(),id:c.id,path:c.path,bodySha256:c.bodySha256,credentialSha256:c.credentialSha256,tag,...data});}
export function observeValue(tag,value,data={}){observe(tag,data);return value;}
export function take(){const old=events;events=[];return old;}
