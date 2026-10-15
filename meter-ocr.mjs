import {numberCandidates,guessTarget,validatePhotoReadings} from './meter-ocr-core.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let libraryPromise;
function loadLibrary(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(!libraryPromise)libraryPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('./tesseract.min.js',import.meta.url).href;script.onload=()=>resolve(window.Tesseract);script.onerror=()=>{libraryPromise=null;script.remove();reject(Error('تعذر تحميل قارئ الصور. تحقق من الإنترنت وحاول مرة ثانية.'));};document.head.append(script);});return libraryPromise;
}
async function readPhoto(file){
  const url=URL.createObjectURL(file),image=new Image();image.src=url;
  try{await image.decode();const scale=Math.min(1,2000/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);if(canvas.width<30||canvas.height<30)throw Error('الصورة صغيرة جداً');canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas;}finally{URL.revokeObjectURL(url);}
}
export function setupPhotoReader({host,getNames,getMonth,applyReadings}){
  let items=[],worker=null,busy=false,generation=0,selectedMonth='',expectedCount=0;
  host.innerHTML='<div class="photo-heading"><div><h2>قراءة العدادات من الصور</h2><p>اختر صور العدادات الستة دفعة واحدة. نقرأ الأرقام ثم تراجع كل صورة قبل تعبئة الحساب.</p></div><label class="primary file-button">▣ اختيار صور العدادات<input id="meter-photos" type="file" accept="image/*" multiple hidden></label></div><p class="muted">الصور تبقى على جهازك. أول استخدام يحتاج الإنترنت لتنزيل محرك القراءة. عند غياب أسماء الملفات: الترتيب المبدئي 3 كهرباء ثم 3 ماي، وبكل مجموعة بوحصه ثم أبو يوسف ثم أبو سيف؛ تقدر تعدّله قبل التأكيد.</p><div class="ocr-status" role="status" aria-live="polite"></div><div class="ocr-grid"></div><div class="ocr-error error" role="alert"></div><div class="ocr-actions actions" hidden><button type="button" class="primary ocr-apply">تأكيد وتعبئة القراءات</button><button type="button" class="secondary ocr-cancel">إلغاء الصور</button><span class="muted">التعبئة لا تحفظ الحساب. راجع الحسبة ثم احفظ الشهر بنفسك.</span></div>';
  const input=host.querySelector('input'),grid=host.querySelector('.ocr-grid'),status=host.querySelector('.ocr-status'),error=host.querySelector('.ocr-error'),actions=host.querySelector('.ocr-actions'),apply=host.querySelector('.ocr-apply');
  function setBusy(value){busy=value;input.disabled=value;apply.disabled=value;grid.querySelectorAll('button').forEach(b=>b.disabled=value);}
  async function release(){if(worker){const old=worker;worker=null;await old.terminate().catch(()=>{});}}
  async function engine(){if(worker)return worker;status.textContent='تحميل محرك قراءة الصور…';const lib=await loadLibrary();worker=await lib.createWorker('eng',1,{workerPath:new URL('./tesseract-worker.min.js',import.meta.url).href,corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',logger:m=>{if(busy&&m.status==='recognizing text')status.textContent='جارٍ استخراج الأرقام… '+Math.round(m.progress*100)+'%';}});await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'});return worker;}
  function draw(item){
    const card=item.card,names=getNames();card.innerHTML=`<div class="photo-image"><img src="${item.canvas.toDataURL('image/jpeg',.85)}" alt="صورة العداد ${item.index+1}"></div><p class="photo-name">${esc(item.name)}</p><div class="fields"><label>البيت<select data-photo="house">${names.map((n,i)=>`<option value="${i}" ${Number(item.house)===i?'selected':''}>${esc(n)}</option>`).join('')}</select></label><label>نوع العداد<select data-photo="kind"><option value="electricity" ${item.kind==='electricity'?'selected':''}>كهرباء</option><option value="water" ${item.kind==='water'?'selected':''}>ماي</option></select></label></div><label>القراءة المستخرجة (قابلة للتعديل)<input type="text" inputmode="decimal" data-photo="value" value="${esc(item.value)}" placeholder="راجع الأرقام في الصورة"></label><div class="ocr-candidates">${item.candidates.map(c=>`<button type="button" data-candidate="${esc(c.raw)}">${esc(c.raw)}</button>`).join('')}</div><p class="muted photo-feedback">${esc(item.feedback||'بانتظار استخراج الأرقام…')}</p><div class="actions"><button class="text-button photo-crop" type="button">تحديد شاشة الأرقام وإعادة القراءة</button><button class="text-button photo-rotate" type="button">تدوير ↻</button></div><div class="crop-editor" hidden><p class="muted">اسحب فوق شاشة الأرقام فقط، ثم اضغط إعادة القراءة.</p><canvas class="crop-canvas" aria-label="تحديد منطقة أرقام العداد"></canvas><button class="secondary crop-read" type="button">قراءة المنطقة المحددة</button><button class="text-button crop-reset" type="button">قراءة الصورة كاملة</button></div><label class="photo-confirm"><input type="checkbox" data-photo="confirmed" ${item.confirmed?'checked':''}> راجعت الصورة والبيت ونوع العداد والقراءة</label>`;
    const unconfirm=()=>{item.confirmed=false;card.querySelector('[data-photo="confirmed"]').checked=false;};
    card.querySelectorAll('[data-photo]').forEach(el=>el.addEventListener('input',()=>{item[el.dataset.photo]=el.type==='checkbox'?el.checked:el.value;if(el.dataset.photo!=='confirmed')unconfirm();}));
    card.querySelectorAll('[data-candidate]').forEach(button=>button.onclick=()=>{item.value=button.dataset.candidate;card.querySelector('[data-photo="value"]').value=item.value;unconfirm();});
    card.querySelector('.photo-rotate').onclick=()=>{const rotated=document.createElement('canvas');rotated.width=item.canvas.height;rotated.height=item.canvas.width;const ctx=rotated.getContext('2d');ctx.translate(rotated.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(item.canvas,0,0);item.canvas=rotated;item.rect=null;item.candidates=[];item.value='';item.feedback='تم تدوير الصورة؛ حدّد الأرقام وأعد القراءة.';item.confirmed=false;draw(item);};
    card.querySelector('.photo-crop').onclick=()=>{const editor=card.querySelector('.crop-editor');editor.hidden=!editor.hidden;if(!editor.hidden)setupCrop(item);};
    card.querySelector('.crop-read').onclick=()=>scanOne(item).catch(e=>error.textContent=e.message);
    card.querySelector('.crop-reset').onclick=()=>{item.rect=null;scanOne(item).catch(e=>error.textContent=e.message);};
  }
  function setupCrop(item){
    const surface=item.card.querySelector('.crop-canvas'),scale=Math.min(1,600/item.canvas.width);surface.width=Math.round(item.canvas.width*scale);surface.height=Math.round(item.canvas.height*scale);const ctx=surface.getContext('2d');let start=null;
    const paint=rect=>{ctx.clearRect(0,0,surface.width,surface.height);ctx.drawImage(item.canvas,0,0,surface.width,surface.height);if(rect){ctx.strokeStyle='#80db54';ctx.lineWidth=3;ctx.strokeRect(rect.x,rect.y,rect.w,rect.h);}};paint();
    const point=e=>{const r=surface.getBoundingClientRect();return {x:Math.max(0,Math.min(surface.width,(e.clientX-r.left)*surface.width/r.width)),y:Math.max(0,Math.min(surface.height,(e.clientY-r.top)*surface.height/r.height))};};
    surface.onpointerdown=e=>{start=point(e);surface.setPointerCapture(e.pointerId);};
    surface.onpointermove=e=>{if(!start)return;const p=point(e);paint({x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(p.x-start.x),h:Math.abs(p.y-start.y)});};
    surface.onpointerup=e=>{if(!start)return;const p=point(e),rect={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(p.x-start.x),h:Math.abs(p.y-start.y)};start=null;if(rect.w<8||rect.h<8){item.rect=null;paint();return;}item.rect={left:Math.floor(rect.x/scale),top:Math.floor(rect.y/scale),width:Math.floor(rect.w/scale),height:Math.floor(rect.h/scale)};item.confirmed=false;item.card.querySelector('[data-photo="confirmed"]').checked=false;paint(rect);};surface.onpointercancel=()=>{start=null;};
  }
  async function recognize(item){
    const w=await engine();let source=item.canvas;
    if(item.rect){const cropped=document.createElement('canvas'),r=item.rect,factor=Math.max(1,Math.min(3,1200/r.width));cropped.width=Math.round(r.width*factor);cropped.height=Math.round(r.height*factor);cropped.getContext('2d').drawImage(item.canvas,r.left,r.top,r.width,r.height,0,0,cropped.width,cropped.height);source=cropped;}
    await w.setParameters({tessedit_pageseg_mode:item.rect?'7':'11'});const {data}=await w.recognize(source);item.candidates=numberCandidates(data.text);item.value=item.candidates[0]?.raw??'';item.confirmed=false;
    const inferred=guessTarget(item.name,item.index,data.text);if(/kwh|electric|water|m[³3]/i.test(data.text))item.kind=inferred.kind;
    item.feedback=item.value?'قراءة مقترحة؛ تأكد أنها أرقام الاستهلاك وليست الرقم التسلسلي، وراجع موضع الفاصلة.':'ما قدرنا نقرأ الأرقام بوضوح. حدّد شاشة الأرقام لإعادة القراءة، أو اكتب القراءة يدوياً.';draw(item);
  }
  async function scanOne(item){if(busy)return;error.textContent='';setBusy(true);try{await recognize(item);status.textContent='تمت إعادة القراءة. راجع النتيجة وأكدها.';}finally{await release();setBusy(false);}}
  input.onchange=async()=>{
    const files=[...input.files];input.value='';if(!files.length)return;
    if(files.length>6){error.textContent='اختر حتى 6 صور في الدفعة الواحدة.';return;}if(files.some(f=>f.size>20*1024*1024)){error.textContent='الصورة أكبر من 20 ميغابايت. صغّرها أو اختر صورة ثانية.';return;}
    const token=++generation;expectedCount=files.length;selectedMonth=getMonth();items=[];grid.replaceChildren();error.textContent='';actions.hidden=false;setBusy(true);
    try{for(let i=0;i<files.length;i++){
      if(token!==generation)break;status.textContent=`قراءة صورة ${i+1} من ${files.length}…`;
      const target=guessTarget(files[i].name,i),item={index:i,name:files[i].name,...target,value:'',confirmed:false,candidates:[],rect:null};item.card=document.createElement('article');item.card.className='ocr-card';grid.append(item.card);
      try{item.canvas=await readPhoto(files[i]);items.push(item);draw(item);await recognize(item);}catch(e){if(item.canvas){item.feedback='تعذرت القراءة التلقائية. تقدر تكتب القراءة من الصورة، أو تعيد المحاولة بعد الاتصال بالإنترنت.';draw(item);}else{item.card.innerHTML='<p class="error">تعذر فتح '+esc(item.name)+'. اختر صورة JPG أو PNG أو WebP واضحة.</p>';}}
    }status.textContent='انتهت معالجة الصور. راجع البيت والنوع والقراءة، وأكد كل صورة قبل تعبئة الحساب.';
    }finally{await release();setBusy(false);}
  };
  host.querySelector('.ocr-cancel').onclick=async()=>{generation++;await release();items=[];grid.replaceChildren();actions.hidden=true;status.textContent='';error.textContent='';setBusy(false);};
  apply.onclick=()=>{try{if(busy)return;if(items.length!==expectedCount)throw Error('تعذر فتح بعض الصور. أعد اختيار صور واضحة قبل تطبيق الدفعة كاملة.');if(getMonth()!==selectedMonth)throw Error('تغيّر شهر الحساب بعد اختيار الصور. أعد اختيار الصور للشهر المطلوب.');const rows=validatePhotoReadings(items);applyReadings(rows);status.textContent='تمت تعبئة القراءات بعد تأكيدك. راجع حساب الشهر ثم احفظه.';actions.hidden=true;grid.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);error.textContent='';}catch(e){error.textContent=e.message;}};
}
