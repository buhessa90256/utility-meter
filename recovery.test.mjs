import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encryptHistory,decryptHistory,encode64} from './history-import.mjs';
import {defaults,validateBackup,calculate,mergeHistory,previousReading} from './core.mjs';
const fixture=()=>{
 const d=defaults();d.months.push(calculate({month:'2026-09',official:'',rates:d.settings,average:5,currency:'درهم',rows:d.settings.names.map(name=>({name,electricity:{mode:'estimated',method:'historical',usage:50,reason:'تغيير العداد',referenceCurrent:2686},water:{mode:'normal',previous:10,current:15}}))},[]));return d;
};
test('portable encrypted snapshot survives a completely empty store and retains new meter baseline',async()=>{
 const data=fixture(),key=encode64(crypto.getRandomValues(new Uint8Array(32)));
 const envelope=await encryptHistory(data,key);
 const snapshot=encode64(new TextEncoder().encode(JSON.stringify(envelope)));
 const fragment=new URLSearchParams({unlock:key,snapshot,view:'history'});
 const reloaded=new URLSearchParams(fragment.toString());
 const decoded=JSON.parse(Buffer.from(reloaded.get('snapshot'),'base64url').toString());
 const restored=validateBackup(await decryptHistory(decoded,reloaded.get('unlock')));
 assert.equal(restored.months.length,1);
 assert.equal(previousReading(restored.months,'2026-10',0,'electricity'),2686);
 assert.equal(restored.months[0].totalCents,data.months[0].totalCents);
});
test('each encrypted save gets a fresh IV and wrong keys cannot read the snapshot',async()=>{
 const key=encode64(crypto.getRandomValues(new Uint8Array(32)));
 const one=await encryptHistory(fixture(),key),two=await encryptHistory(fixture(),key);
 assert.notEqual(one.iv,two.iv);
 await assert.rejects(()=>decryptHistory(one,encode64(crypto.getRandomValues(new Uint8Array(32)))));
});
test('recovery merges missing months without replacing newer local readings',()=>{
 const old=fixture(),current=fixture();current.months[0].notes='local edit';
 const merged=mergeHistory(current,old);
 assert.equal(merged.data.months[0].notes,'local edit');
 assert.deepEqual(merged.conflicts,['2026-09']);
});
