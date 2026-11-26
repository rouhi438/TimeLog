import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
function key(){const k=process.env.TIMELOG_CPR_KEY||'';if(!/^[a-fA-F0-9]{64}$/.test(k))throw Error('CPR key missing or invalid');return Buffer.from(k,'hex');}
export function normalizeCpr(v:string){if(!/^\d{6}-?\d{4}$/.test(v))throw Error('Invalid CPR');return v.replace('-','');}
export function encryptCpr(id:string,v:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);c.setAAD(Buffer.from('timelog:cpr:v1:'+id));const data=Buffer.concat([c.update(normalizeCpr(v),'utf8'),c.final()]);return ['v1',iv.toString('hex'),c.getAuthTag().toString('hex'),data.toString('hex')].join(':');}
export function decryptCpr(id:string,v:string){if(!/^v1:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]{20}$/.test(v))throw Error('Invalid encrypted CPR');const [,iv,tag,data]=v.split(':');const d=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'hex'));d.setAAD(Buffer.from('timelog:cpr:v1:'+id));d.setAuthTag(Buffer.from(tag,'hex'));return normalizeCpr(Buffer.concat([d.update(Buffer.from(data,'hex')),d.final()]).toString('utf8'));}
export function assertCprKey(){key();}
