export function normalizeDigits(value){return String(value).replace(/[٠-٩۰-۹]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.includes(c)?'٠١٢٣٤٥٦٧٨٩'.indexOf(c):'۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٫,]/g,'.').replace(/٬/g,'');}
export function numberCandidates(text){
  const normalized=normalizeDigits(text),matches=[...normalized.matchAll(/\d{1,9}(?:\.\d{1,4})?/g)],results=[];
  for(const match of matches){const raw=match[0],value=Number(raw);if(raw.length<2||!Number.isFinite(value))continue;
    const line=normalized.slice(0,match.index).split('\n').at(-1)+normalized.slice(match.index).split('\n')[0];
    let score=raw.includes('.')?5:0;score+=Math.min(raw.replace('.','').length,6);if(/kwh|m[³3]|reading|consumption|قراءة|عداد/i.test(line))score+=8;if(/serial|s\/n|no\.|رقم|model|volt|hz|amp|20[12]\d/i.test(line))score-=12;
    if(!results.some(r=>r.raw===raw))results.push({raw,value,score});
  }
  return results.sort((a,b)=>b.score-a.score).slice(0,12);
}
export function guessTarget(filename,index,text=''){
  const s=filename+' '+text;let house=/hessa|hissa|حص[هة]/i.test(s)?0:/yous|yus|يوسف/i.test(s)?1:/saif|سيف/i.test(s)?2:index%3;
  const kind=/kwh|electric|كهرب/i.test(s)?'electricity':/water|m[³3]|ما[ءي]/i.test(s)?'water':index<3?'electricity':'water';
  return {house,kind,inferred:/hessa|hissa|yous|yus|saif|حص[هة]|يوسف|سيف/i.test(s)};
}
export function validatePhotoReadings(rows){
  if(!rows.length||rows.length>6)throw Error('اختر من صورة إلى 6 صور');const seen=new Set();
  return rows.map(row=>{
    const house=Number(row.house),kind=row.kind,raw=normalizeDigits(row.value).trim();
    if(![0,1,2].includes(house)||!['electricity','water'].includes(kind))throw Error('اختر البيت ونوع العداد لكل صورة');
    if(!/^\d{1,9}(?:\.\d{1,4})?$/.test(raw))throw Error('راجع القراءة في كل صورة، وأدخل الأرقام فقط');
    if(!row.confirmed)throw Error('أكد مراجعة كل صورة قبل تعبئة القراءات');
    const key=house+':'+kind;if(seen.has(key))throw Error('فيه صورتان لنفس البيت ونوع العداد. عدّل التوزيع قبل التأكيد');seen.add(key);
    return {house,kind,value:raw,confirmed:true};
  });
}
