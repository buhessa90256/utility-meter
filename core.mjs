export const KEY = 'utility-meter-v1';
export const defaults = () => ({version:1, settings:{names:['بوحصه','أبو يوسف','أبو سيف'],electricity:0.067,water:2.090,currency:'درهم',average:3},months:[],trash:[]});
export function number(value,label='القيمة') {
  if(value === '' || value == null || !Number.isFinite(Number(value)) || Number(value)<0 || Number(value)>1e12) throw Error(`${label}: أدخل رقماً صحيحاً غير سالب`);
  return Number(value);
}
export const cents = n => Math.round((n + Number.EPSILON)*100);
export function consumption(input,history,house,kind,month,window=3){
  if(input.mode==='estimated'){
    const records=history.filter(m=>m.month<month && m.rows[house]?.[kind]?.mode!=='estimated').sort((a,b)=>b.month.localeCompare(a.month)).slice(0,window);
    if(!records.length) throw Error('لا توجد أشهر فعلية سابقة لحساب المتوسط. سجّل قراءة فعلية أولاً.');
    return { ...input, usage:records.reduce((s,m)=>s+m.rows[house][kind].usage,0)/records.length, samples:records.length, window};
  }
  const previous=number(input.previous,'القراءة السابقة'),current=number(input.current,'القراءة الحالية');
  if(input.mode==='replaced'){
    const oldFinal=number(input.oldFinal,'القراءة النهائية للعداد القديم'),newStart=number(input.newStart,'بداية العداد الجديد');
    if(oldFinal<previous || current<newStart) throw Error('تحقق من القراءات: نهاية القديم أقل من السابق، أو الحالي أقل من بداية الجديد.');
    return {...input,previous,current,oldFinal,newStart,usage:oldFinal-previous+current-newStart};
  }
  if(input.mode!=='normal') throw Error('حالة العداد غير صحيحة');
  if(current<previous) throw Error('القراءة الحالية أقل من السابقة. اختر «تم تغيير العداد» إذا تغيّر العداد.');
  return {...input,previous,current,usage:current-previous};
}
export function calculate(draft,history){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.month)) throw Error('اختر الشهر');
  const electricity=number(draft.rates.electricity,'سعر الكهرباء'),water=number(draft.rates.water,'سعر الماي');
  const rows=draft.rows.map((r,i)=>{
    const e=consumption(r.electricity,history,i,'electricity',draft.month,draft.average);
    const w=consumption(r.water,history,i,'water',draft.month,draft.average);
    return {name:r.name,electricity:e,water:w,electricityCents:cents(e.usage*electricity),waterCents:cents(w.usage*water)};
  });
  const base=rows.reduce((s,r)=>s+r.electricityCents+r.waterCents,0);
  const official=draft.official==='' || draft.official==null ? null : cents(number(draft.official,'إجمالي الفاتورة'));
  const difference=official===null?0:official-base;
  const share=Math.trunc(difference/rows.length), remainder=difference-share*rows.length;
  rows.forEach((r,i)=>{r.adjustmentCents=share+(i<Math.abs(remainder)?Math.sign(remainder):0);r.totalCents=r.electricityCents+r.waterCents+r.adjustmentCents;});
  if(rows.some(r=>r.totalCents<0)) throw Error('إجمالي الفاتورة منخفض وينتج مبلغاً سالباً لأحد البيوت عند توزيع الفرق بالتساوي. راجع الفاتورة أو القراءات.');
  return {...draft,rates:{electricity,water},rows,baseCents:base,differenceCents:difference,totalCents:official??base,updatedAt:new Date().toISOString()};
}
export function previousReading(months,month,index,kind){
  const latest=months.filter(m=>m.month<month).sort((a,b)=>b.month.localeCompare(a.month));
  let estimated=0;
  for(const record of latest){const r=record.rows[index]?.[kind];if(!r)continue;if(r.mode==='estimated'){estimated+=r.usage;}else{return r.current+estimated;}}
  return '';
}
export function validateBackup(data){
  if(!data || data.version!==1 || !data.settings || !Array.isArray(data.months) || data.months.length>2400) throw Error('ملف النسخة الاحتياطية غير متوافق');
  if(!Array.isArray(data.settings.names)||data.settings.names.length!==3||data.settings.names.some(n=>typeof n!=='string'||!n.trim()||n.length>60))throw Error('أسماء البيوت غير صالحة');
  number(data.settings.electricity);number(data.settings.water);
  if(![3,5,6].includes(Number(data.settings.average)) || typeof data.settings.currency!=='string'||data.settings.currency.length>20)throw Error('إعدادات غير صالحة');
  const seen=new Set();
  const months=[...data.months].sort((a,b)=>a.month.localeCompare(b.month)).reduce((acc,m)=>{
    if(seen.has(m.month)||!Array.isArray(m.rows)||m.rows.length!==3||m.rows.some(r=>typeof r.name!=='string'||r.name.length>60)||![3,5,6].includes(Number(m.average)))throw Error('سجل شهري غير صالح أو مكرر');
    seen.add(m.month);acc.push(calculate(m,acc));return acc;
  },[]);
  return {version:1,settings:data.settings,months,trash:[]};
}
