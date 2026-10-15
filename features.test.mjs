import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeDigits,numberCandidates,guessTarget,validatePhotoReadings} from './meter-ocr-core.mjs';
import {imagePagesToPdf} from './month-pdf.mjs';
import {screenCandidates,matchingReading} from './meter-screen.mjs';
const line=(text,score,y,h,w=140)=>({text,score,poly:[[20,y],[20+w,y],[20+w,y+h],[20,y+h]]});
test('screen selection rejects specifications and place-value labels even with high OCR confidence',()=>{
  const rows=[line('IEC62053-21:2003',.99,0,12),line('100000',.99,20,8),line('10000',.99,30,8),line('50Hz',.99,100,12),line('006731',.85,50,32)];
  assert.deepEqual(screenCandidates(rows).map(c=>c.raw),['006731']);
  assert.equal(screenCandidates(rows.slice(0,4)).length,0);
});
test('independent verification preserves leading zeroes and rejects dropped digits and decimal disagreements',()=>{
  const proposal={raw:'006731',value:6731,score:.88};
  assert.equal(matchingReading(proposal,[{text:'06731',confidence:70}]),'006731');
  assert.equal(matchingReading(proposal,[{text:'00673',confidence:99}]),'');
  assert.equal(matchingReading(proposal,[{text:'673.1',confidence:99}]),'');
  assert.equal(matchingReading(proposal,[{text:'6731',confidence:12}]),'');
  assert.equal(matchingReading({...proposal,score:.4},[{text:'6731',confidence:99}]),'');
});
test('long serials and vertical rim engraving never become proposed readings',()=>{
  assert.equal(screenCandidates([line('812345678',.999,0,35)],{focused:true}).length,0);
  const vertical={text:'6123456',score:.999,poly:[[100,20],[120,160],[90,165],[70,25]]};
  assert.equal(screenCandidates([vertical],{focused:true}).length,0);
});
test('normalizes Arabic digits and decimal marks without dropping zeroes',()=>{assert.equal(normalizeDigits('٠٠٢٦٨٦٫٥'),'002686.5');assert.equal(normalizeDigits('۱۲٬۳۴۵٫۶'),'12345.6');});
test('reading candidates rank usage higher than serial numbers',()=>{const c=numberCandidates('Serial No. 987654321\nReading 002686.5 kWh\n230V 50Hz');assert.equal(c[0].raw,'002686.5');assert.equal(c[0].value,2686.5);});
test('photo assignments use names and units with explicit order fallback',()=>{assert.deepEqual(guessTarget('abo-yousef-water.jpg',0),{house:1,kind:'water',inferred:true});assert.equal(guessTarget('IMG_334.jpg',5).house,2);assert.equal(guessTarget('IMG_334.jpg',5).kind,'water');});
test('six photo readings require individual confirmation and unique targets',()=>{const rows=Array.from({length:6},(_,i)=>({house:i%3,kind:i<3?'electricity':'water',value:'100.5',confirmed:true}));assert.equal(validatePhotoReadings(rows).length,6);assert.throws(()=>validatePhotoReadings(rows.map((r,i)=>i===0?{...r,confirmed:false}:r)));assert.throws(()=>validatePhotoReadings([...rows.slice(0,5),rows[0]]));assert.throws(()=>validatePhotoReadings([{...rows[0],value:'no reading'}]));assert.throws(()=>validatePhotoReadings([]));});
test('PDF builder emits consistent object offsets and page count',async()=>{const blob=imagePagesToPdf([{width:2,height:2,bytes:new Uint8Array([255,216,255,217])},{width:2,height:2,bytes:new Uint8Array([255,216,255,217])}]),bytes=new Uint8Array(await blob.arrayBuffer()),text=new TextDecoder('latin1').decode(bytes);assert.ok(text.startsWith('%PDF-1.4'));assert.ok(text.includes('/Count 2'));const start=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(new TextDecoder().decode(bytes.slice(start,start+4)),'xref');assert.ok(text.endsWith('%%EOF'));});
