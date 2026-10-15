import {normalizeDigits} from './meter-ocr-core.mjs';
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function screenCandidates(items,{focused=false}={}){
  const heights=items.filter(i=>i.poly?.length===4).map(i=>distance(i.poly[0],i.poly[3])).sort((a,b)=>a-b);
  const median=heights[Math.floor(heights.length/2)]||0;
  return items.flatMap(item=>{
    const raw=normalizeDigits(item.text).trim().replace(/\s+/g,'');
    if(!/^\d{3,8}(?:\.\d{1,3})?$/.test(raw)||!item.poly||item.score<.55)return [];
    const h=distance(item.poly[0],item.poly[3]),w=distance(item.poly[0],item.poly[1]);
    const angle=Math.abs(Math.atan2(item.poly[1][1]-item.poly[0][1],item.poly[1][0]-item.poly[0][0]));
    if(angle>Math.PI/6)return [];
    if(w/h<1.5||w/h>12||(!focused&&h<median*1.25))return [];
    // Place-value scales are not meter readings. An exact power of ten
    // remains a manual-entry case rather than risking a scale label.
    if(/^10+$/.test(raw)||/^(19|20)\d{2}$/.test(raw))return [];
    const cx=item.poly.reduce((s,p)=>s+p[0],0)/4,cy=item.poly.reduce((s,p)=>s+p[1],0)/4;
    if(items.some(other=>/serial|s\/n|^no\.?$|رقم/i.test(other.text)&&other.poly&&Math.hypot(other.poly[2][0]-cx,other.poly[2][1]-cy)<h*5))return [];
    return [{raw,value:Number(raw),score:item.score,poly:item.poly,height:h,rank:h*Math.min(1,item.score+.1)}];
  }).sort((a,b)=>b.rank-a.rank).slice(0,3);
}
export function matchingReading(proposal,checks){
  if(!proposal||proposal.score<.7)return '';
  return checks.some(check=>check.confidence>=45&&/^\d{3,9}(?:\.\d{1,3})?$/.test(normalizeDigits(check.text).trim())&&Number(normalizeDigits(check.text).trim())===proposal.value)?proposal.raw:'';
}
export function displayCrop(source,poly,{variant='color'}={}){
  const width=Math.max(distance(poly[0],poly[1]),distance(poly[2],poly[3])),height=Math.max(distance(poly[0],poly[3]),distance(poly[1],poly[2]));
  const scale=Math.min(4,1000/width,140/height),canvas=document.createElement('canvas');
  canvas.width=Math.ceil(width*1.06*scale);canvas.height=Math.ceil(height*1.12*scale);
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),cx=poly.reduce((s,p)=>s+p[0],0)/4,cy=poly.reduce((s,p)=>s+p[1],0)/4;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width/2,canvas.height/2);ctx.scale(scale,scale);ctx.rotate(-Math.atan2(poly[1][1]-poly[0][1],poly[1][0]-poly[0][0]));ctx.drawImage(source,-cx,-cy);ctx.resetTransform();
  if(variant!=='color'){
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),d=pixels.data;
    for(let i=0;i<d.length;i+=4){let v=.299*d[i]+.587*d[i+1]+.114*d[i+2];v=Math.max(0,Math.min(255,(v-128)*1.6+128));if(variant==='inverse')v=255-v;d[i]=d[i+1]=d[i+2]=v;}
    ctx.putImageData(pixels,0,0);
  }
  return canvas;
}

