import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculate,consumption,previousReading,validateBackup,defaults,mergeHistory} from './core.mjs';
import {decryptHistory} from './history-import.mjs';
import {randomBytes,createCipheriv} from 'node:crypto';
const draft=(month='2026-01')=>({month,official:'',rates:{electricity:.067,water:2.090},average:3,currency:'درهم',notes:'',rows:['أ','ب','ج'].map(name=>({name,electricity:{mode:'normal',previous:100,current:200},water:{mode:'normal',previous:10,current:20}}))});
test('actual consumption and rate calculation',()=>{const m=calculate(draft(),[]);assert.equal(m.totalCents,8280);assert.equal(m.rows[0].electricityCents,670);assert.equal(m.rows[0].waterCents,2090);});
test('official bill splits cents exactly, including negative differences',()=>{for(const official of ['100.00','82.81','82.79','60.01']){const d=draft();d.official=official;const m=calculate(d,[]);assert.equal(m.rows.reduce((s,r)=>s+r.totalCents,0),Math.round(Number(official)*100));assert.ok(Math.max(...m.rows.map(r=>r.adjustmentCents))-Math.min(...m.rows.map(r=>r.adjustmentCents))<=1);}});
test('replacement combines old and new meter and supports baseline 2686',()=>assert.equal(consumption({mode:'replaced',previous:900,oldFinal:950,newStart:2686,current:2706},[],0,'electricity','2026-01').usage,70));
test('invalid and decreasing readings rejected',()=>{assert.throws(()=>consumption({mode:'normal',previous:200,current:100},[],0,'water','2026-01'));assert.throws(()=>consumption({mode:'normal',previous:'',current:100},[],0,'water','2026-01'));assert.throws(()=>consumption({mode:'replaced',previous:900,oldFinal:800,newStart:10,current:20},[],0,'water','2026-01'));});
test('average uses only earlier actual months, excludes estimates and future records',()=>{const jan=calculate(draft(),[]),febDraft=draft('2026-02');febDraft.rows[0].electricity={mode:'estimated'};const feb=calculate(febDraft,[jan]);assert.equal(feb.rows[0].electricity.samples,1);const marchDraft=draft('2026-03');marchDraft.rows[0].electricity={mode:'estimated'};const march=calculate(marchDraft,[jan,feb,calculate(draft('2026-04'),[])]);assert.equal(march.rows[0].electricity.samples,1);assert.equal(march.rows[0].electricity.usage,100);assert.equal(previousReading([jan,feb,march],'2026-04',0,'electricity'),400);});
test('missing history never silently treated as zero',()=>assert.throws(()=>consumption({mode:'estimated'},[],0,'electricity','2026-01')));
test('backup validated and totals recalculated',()=>{const d=defaults();d.months=[calculate(draft(),[])];d.months[0].totalCents=123;assert.equal(validateBackup(d).months[0].totalCents,8280);assert.throws(()=>validateBackup({...d,months:[d.months[0],d.months[0]]}));assert.throws(()=>validateBackup({version:8}));});
test('month rates immutable when default rates change',()=>{const d=defaults(),m=calculate(draft(),[]);d.settings.electricity=5;assert.equal(m.rates.electricity,.067);});
test('historical estimate retains replacement baseline through a backup roundtrip',()=>{
  const d=defaults(),month=draft();month.rows[0].electricity={mode:'estimated',method:'historical',usage:125.5,referenceCurrent:2686,reason:'Recorded historical estimate with new meter reference'};
  d.months=[calculate(month,[])];const restored=validateBackup(JSON.parse(JSON.stringify(d)));
  assert.equal(restored.months[0].rows[0].electricity.usage,125.5);
  assert.equal(previousReading(restored.months,'2026-02',0,'electricity'),2686);
  assert.throws(()=>consumption({mode:'estimated',method:'historical',usage:15},[],0,'electricity','2026-01'));
});
test('merging historical data preserves existing months and is idempotent',()=>{
  const current=defaults(),incoming=defaults();current.months=[calculate(draft(),[])];incoming.months=[calculate(draft(),[]),calculate(draft('2026-02'),[])];incoming.archive=[{id:'ambiguous',title:'Original source',text:'Unconfirmed date'}];
  const first=mergeHistory(current,incoming);assert.equal(first.added,1);assert.deepEqual(first.conflicts,['2026-01']);assert.equal(first.data.months[0].updatedAt,current.months[0].updatedAt);
  assert.equal(mergeHistory(first.data,incoming).added,0);assert.equal(first.data.archive.filter(r=>r.id==='ambiguous').length,1);assert.ok(first.data.archive.some(r=>r.id==='import-conflict-2026-01'));
});
test('private history encryption authenticates the key and rejects tampering',async()=>{
  const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),plain=JSON.stringify({version:1,message:'private test reading'});
  const ciphertext=Buffer.concat([cipher.update(plain),cipher.final(),cipher.getAuthTag()]);const envelope={format:'addaad-aes-gcm-v1',iv:iv.toString('base64url'),ciphertext:ciphertext.toString('base64url')};
  assert.equal((await decryptHistory(envelope,key.toString('base64url'))).message,'private test reading');
  await assert.rejects(decryptHistory(envelope,randomBytes(32).toString('base64url')));
  ciphertext[0]^=1;await assert.rejects(decryptHistory({...envelope,ciphertext:ciphertext.toString('base64url')},key.toString('base64url')));
});
