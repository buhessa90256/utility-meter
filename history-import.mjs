export async function decryptHistory(envelope,keyText){
  const decode=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
  if(!envelope||envelope.format!=='addaad-aes-gcm-v1'||!envelope.iv||!envelope.ciphertext)throw Error('ملف السجل الخاص غير متوافق');
  const key=await crypto.subtle.importKey('raw',decode(keyText),'AES-GCM',false,['decrypt']);
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(envelope.iv)},key,decode(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
