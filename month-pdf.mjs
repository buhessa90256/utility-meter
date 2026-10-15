const enc=new TextEncoder();
export function imagePagesToPdf(pages){
  if(!pages.length)throw Error('التقرير فارغ');
  const objects=[],pageIds=[];
  objects.push(enc.encode('<< /Type /Catalog /Pages 2 0 R >>'),null);
  for(const page of pages){
    const imageId=objects.length+1,contentId=imageId+1,pageId=imageId+2;
    const head=enc.encode(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`),tail=enc.encode('\nendstream');
    const image=new Uint8Array(head.length+page.bytes.length+tail.length);image.set(head);image.set(page.bytes,head.length);image.set(tail,head.length+page.bytes.length);objects.push(image);
    const command='q 595.28 0 0 841.89 0 0 cm /Report Do Q';objects.push(enc.encode(`<< /Length ${command.length} >>\nstream\n${command}\nendstream`));
    objects.push(enc.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Report ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));pageIds.push(pageId);
  }
  objects[1]=enc.encode(`<< /Type /Pages /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] /Count ${pageIds.length} >>`);
  const chunks=[enc.encode('%PDF-1.4\n%Addaad\n')],offsets=[0];let size=chunks[0].length;
  for(let i=0;i<objects.length;i++){offsets.push(size);const start=enc.encode(`${i+1} 0 obj\n`),end=enc.encode('\nendobj\n');chunks.push(start,objects[i],end);size+=start.length+objects[i].length+end.length;}
  const xref=size;chunks.push(enc.encode(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return new Blob(chunks,{type:'application/pdf'});
}
export async function createMonthPdf(month){
  if(document.fonts)await document.fonts.ready;
  const W=1240,H=1754,canvases=[];
  const currency=month.currency||'درهم',fmt=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n),money=c=>new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(c/100);
  const title=new Date(month.month+'-02T12:00:00').toLocaleDateString('ar-AE',{month:'long',year:'numeric'});
  let canvas,ctx;
  function text(value,x,y,size=24,color='#203e32',weight=400,align='right') {ctx.fillStyle=color;ctx.font=`${weight} ${size}px "IBM Plex Sans Arabic", Tahoma, Arial, sans-serif`;ctx.textAlign=align;ctx.direction='rtl';ctx.fillText(String(value),x,y);}
  function box(x,y,w,h,color='#f1f5ed'){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
  function newPage(subtitle){canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);box(0,0,W,205,'#214f43');text('عدّاد',W-80,78,48,'#e2edc7',700);text(title,W-80,135,35,'#fff',600);text(subtitle,W-80,174,20,'#cbdcca');canvases.push(canvas);}
  function foot(page,total){text('عدّاد | تقرير الكهرباء والماي',W-80,H-52,18,'#8b9786');text(`صفحة ${page} من ${total}`,80,H-52,18,'#8b9786',400,'left');}
  function wrap(value,maxWidth,size){ctx.font=`400 ${size}px "IBM Plex Sans Arabic", Tahoma, Arial, sans-serif`;const lines=[];for(const paragraph of String(value).split('\n')){let line='';for(const word of paragraph.split(/\s+/)){const next=line?line+' '+word:word;if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);}return lines;}
  newPage('تفاصيل الحساب والقراءات لكل بيت');
  box(65,240,W-130,135);text('إجمالي الشهر',W-95,283,23,'#6d7e65');text(money(month.totalCents)+' '+currency,W-95,343,46,'#214f43',700);text(month.official===''||month.official==null?'تكلفة استهلاك - الفاتورة الرسمية غير مدخلة':'بعد توزيع فرق الفاتورة بالتساوي',95,327,20,'#78886b',400,'left');
  const xs=[W-95,830,640,440,215];
  month.rows.forEach((row,i)=>{
    const y=408+i*324;box(65,y,W-130,292,'#f8faf6');text(row.name,W-95,y+45,30,'#214f43',600);text(money(row.totalCents)+' '+currency,95,y+45,29,'#214f43',600,'left');
    const headers=['العداد','السابق','الحالي','الاستهلاك','التكلفة'];headers.forEach((v,j)=>text(v,xs[j],y+91,19,'#809077',500));
    ['electricity','water'].forEach((kind,k)=>{const meter=row[kind],yy=y+137+k*48;const read=n=>n===''||n==null?'—':fmt(n);text(kind==='electricity'?'الكهرباء':'الماي',xs[0],yy,22);text(read(meter.previous),xs[1],yy,22);text(read(meter.current),xs[2],yy,22);text(fmt(meter.usage),xs[3],yy,22);text(money(row[kind+'Cents']),xs[4],yy,22);});
    const special=['electricity','water'].filter(k=>row[k].mode!=='normal').map(k=>(k==='electricity'?'الكهرباء':'الماي')+': '+(row[k].mode==='estimated'?'تقديري':'عداد جديد')+(row[k].referenceCurrent!=null?' | مرجع الجديد '+fmt(row[k].referenceCurrent):'')).join(' - ');
    text('فرق الفاتورة: '+money(row.adjustmentCents)+' '+currency,W-95,y+235,20,'#7d8d70');if(special)text(special,W-95,y+269,18,'#9c773f');
  });
  text('تكلفة الاستهلاك: '+money(month.baseCents)+' '+currency,W-90,1452,23);text('الفرق الموزّع: '+money(month.differenceCents)+' '+currency,W-90,1495,23);
  text('الأسعار: كهرباء '+month.rates.electricity+' | ماي '+month.rates.water,W-90,1540,21,'#7c8e70');text('تاريخ تنزيل التقرير: '+new Date().toLocaleDateString('ar-AE'),W-90,1585,20,'#7c8e70');
  const explanations=[month.notes||'',...month.rows.flatMap(row=>['electricity','water'].filter(k=>row[k].mode==='estimated'||row[k].mode==='replaced').map(k=>row.name+' - '+(k==='electricity'?'الكهرباء':'الماي')+': '+(row[k].reason|| (row[k].mode==='replaced'?'نهاية القديم '+fmt(row[k].oldFinal)+'، بداية الجديد '+fmt(row[k].newStart):'متوسط آخر '+row[k].samples+' أشهر فعلية.'))))].filter(Boolean);
  if(explanations.length){newPage('ملاحظات الحساب والتقديرات');let y=270;for(const note of explanations){for(const line of wrap(note,W-170,24)){if(y>H-155){newPage('ملاحظات الحساب - تابع');y=270;}text(line,W-85,y,24);y+=42;}y+=24;}}
  const pages=[];
  for(let i=0;i<canvases.length;i++){canvas=canvases[i];ctx=canvas.getContext('2d');foot(i+1,canvases.length);const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));pages.push({width:W,height:H,bytes:new Uint8Array(await jpeg.arrayBuffer())});}
  return imagePagesToPdf(pages);
}
export async function downloadMonthPdf(month){
  const blob=await createMonthPdf(month),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`addaad-${month.month}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
