export async function decryptHistory(envelope,keyText){
  const decode=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
  if(!envelope||envelope.format!=='addaad-aes-gcm-v1'||!envelope.iv||!envelope.ciphertext)throw Error('ملف السجل الخاص غير متوافق');
  const key=await crypto.subtle.importKey('raw',decode(keyText),'AES-GCM',false,['decrypt']);
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(envelope.iv)},key,decode(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
export const encode64=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export async function encryptHistory(data,keyText){
  const decode=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey('raw',decode(keyText),'AES-GCM',false,['encrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(data)));
  return {format:'addaad-aes-gcm-v1',iv:encode64(iv),ciphertext:encode64(new Uint8Array(ciphertext))};
}
