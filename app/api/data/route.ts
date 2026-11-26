import { neon } from '@neondatabase/serverless';
import { assertCprKey, encryptCpr, decryptCpr, normalizeCpr } from '../../../lib/cpr';
import { getAuth } from '../../../lib/auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store, private, max-age=0','Pragma':'no-cache','Expires':'0'}});
async function authorized(){
 const ids=(process.env.TIMELOG_MANAGER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(ids.length!==2||new Set(ids).size!==2)return false;
 const {data}=await getAuth().getSession();
 return !!data?.user?.id && ids.includes(data.user.id) && data.user.emailVerified===true;
}
function str(v:unknown,max=500){return typeof v==='string'&&v.length<=max;}
function valid(p:any){
 if(!p||!Array.isArray(p.employees)||!Array.isArray(p.shifts)||!p.company||p.employees.length>500||p.shifts.length>100000)return false;
 const ids=new Set<string>(), shifts=new Set<string>();
 for(const e of p.employees){if(!e||!str(e.id,100)||!e.id||ids.has(e.id)||!str(e.name)||!e.name.trim()||typeof e.active!=='boolean'||(e.phone!==undefined&&!str(e.phone,50))||(e.email!==undefined&&(!str(e.email,254)||(e.email!==''&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)))))return false;
 if(e.cpr!==undefined&&(typeof e.cpr!=='string'||(e.cpr!==''&&!/^\d{6}-?\d{4}$/.test(e.cpr))))return false;
 ids.add(e.id);}
 const dates=new Map<string,boolean>();
 for(const s of p.shifts){if(!s||!str(s.id,100)||!s.id||shifts.has(s.id)||!ids.has(s.employee_id)||typeof s.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!Number.isFinite(Date.parse(s.date))||new Date(s.date).toISOString().slice(0,10)!==s.date||typeof s.hours!=='number'||!Number.isFinite(s.hours)||s.hours<0||s.hours>24||!str(s.note??'',2000))return false;if(s.dayOff!==undefined&&typeof s.dayOff!=='boolean')return false;const key=JSON.stringify([s.employee_id,s.date]);if(dates.has(key)&&(dates.get(key)||s.dayOff))return false;dates.set(key,!!s.dayOff);if(s.dayOff){if(s.hours!==0||s.startTime!==undefined||s.endTime!==undefined||s.overnight!==undefined)return false;}else if(s.hours<=0)return false;if(s.startTime!==undefined||s.endTime!==undefined||s.overnight!==undefined){const t=/^([01]\d|2[0-3]):[0-5]\d$/;if(typeof s.startTime!=='string'||typeof s.endTime!=='string'||!t.test(s.startTime)||!t.test(s.endTime)||typeof s.overnight!=='boolean')return false;const m=(v:string)=>Number(v.slice(0,2))*60+Number(v.slice(3));const minutes=m(s.endTime)-m(s.startTime)+(s.overnight?1440:0);if(minutes<=0||minutes>1440||Math.abs(s.hours-minutes/60)>1e-8)return false;}shifts.add(s.id);}
 return ['name','cvr','address','phone','email'].every(k=>str(p.company[k]));
}
// Only explicitly allowed fields cross the API boundary.
function clean(p:any){return {employees:p.employees.map((e:any)=>({id:e.id,name:e.name,active:e.active,phone:e.phone,email:e.email,...(e.cpr!==undefined?{cpr:e.cpr}:{})})),shifts:p.shifts.map((s:any)=>({id:s.id,employee_id:s.employee_id,date:s.date,hours:s.hours,note:s.note,dayOff:s.dayOff,startTime:s.startTime,endTime:s.endTime,overnight:s.overnight})),company:Object.fromEntries(['name','cvr','address','phone','email'].map(k=>[k,p.company[k]]))};}
function publicRow(row:any){const p=clean(row.payload);return {revision:row.revision,payload:{...p,employees:p.employees.map(({cpr,...e}:any)=>({...e,hasCpr:!!cpr,cprLast4:cpr?decryptCpr(e.id,cpr).slice(-4):undefined}))}};}
function sameOrigin(req:Request){return req.headers.get('origin')===new URL(req.url).origin&&!!req.headers.get('content-type')?.startsWith('application/json');}
export async function GET(){try{
 if(!await authorized())return reply({error:'Ingen adgang'},403);assertCprKey();const sql=neon(process.env.DATABASE_URL!);
 for(let attempt=0;attempt<3;attempt++){
 const [row]=await sql`SELECT revision,payload FROM public.timelog_state WHERE id=1`;if(!row)return reply({error:'Database mangler'},503);
 const p=clean(row.payload);let changed=false;
 for(const e of p.employees){if(e.cpr){if(e.cpr.startsWith('v1:'))decryptCpr(e.id,e.cpr);else{e.cpr=encryptCpr(e.id,e.cpr);changed=true;}}}
 if(!changed)return reply(publicRow(row));
 const [saved]=await sql`UPDATE public.timelog_state SET payload=${JSON.stringify(p)}::jsonb, revision=revision+1 WHERE id=1 AND revision=${row.revision} RETURNING revision,payload`;
 if(saved)return reply(publicRow(saved));
 }return reply({error:'Genindlæs data'},409);
 }catch{return reply({error:'Serverfejl'},500);}}
export async function PUT(req:Request){try{
 if(!sameOrigin(req)||!await authorized())return reply({error:'Ingen adgang'},403);assertCprKey();
 const raw=await req.text();if(raw.length>10000000)return reply({error:'Filen er for stor'},413);
 const {revision,payload}=JSON.parse(raw);if(!Number.isSafeInteger(revision)||!valid(payload))return reply({error:'Ugyldige data'},400);
 const sql=neon(process.env.DATABASE_URL!);const [old]=await sql`SELECT revision,payload FROM public.timelog_state WHERE id=1`;
 if(!old||old.revision!==revision)return reply({error:'Data er ændret på en anden enhed. Genindlæs før du prøver igen.'},409);
 const p=clean(payload);const previous=new Map<string,string>(old.payload.employees.map((e:any)=>[e.id,e.cpr||'']));const seen=new Set<string>();
 for(const e of p.employees){const oldValue=previous.get(e.id)||'';let value='';if(e.cpr!==undefined){value=e.cpr?normalizeCpr(e.cpr):'';}else if(oldValue){value=oldValue.startsWith('v1:')?decryptCpr(e.id,oldValue):normalizeCpr(oldValue);}
 if(value){if(seen.has(value))return reply({error:'CPR-nummeret er allerede registreret'},400);seen.add(value);e.cpr=e.cpr===undefined&&oldValue.startsWith('v1:')?oldValue:encryptCpr(e.id,value);}else delete e.cpr;}
 const [row]=await sql`UPDATE public.timelog_state SET payload=${JSON.stringify(p)}::jsonb, revision=revision+1 WHERE id=1 AND revision=${revision} RETURNING revision,payload`;
 return row?reply(publicRow(row)):reply({error:'Data er ændret på en anden enhed. Genindlæs før du prøver igen.'},409);
 }catch{return reply({error:'Data kunne ikke gemmes'},500);}}
// A separate explicit request; no CPR in the URL, list or ordinary update response.
export async function POST(req:Request){try{
 if(!sameOrigin(req)||!await authorized())return reply({error:'Ingen adgang'},403);assertCprKey();
 const raw=await req.text();if(raw.length>1000)return reply({error:'Ugyldig anmodning'},400);const {employeeId}=JSON.parse(raw);if(!str(employeeId,100)||!employeeId)return reply({error:'Ugyldig anmodning'},400);
 const sql=neon(process.env.DATABASE_URL!);const [row]=await sql`SELECT payload FROM public.timelog_state WHERE id=1`;const employee=row?.payload?.employees?.find((e:any)=>e.id===employeeId);
 if(!employee?.cpr)return reply({error:'CPR er ikke registreret'},404);
 const v=decryptCpr(employee.id,employee.cpr);return reply({cpr:v.slice(0,6)+'-'+v.slice(6)});
 }catch{return reply({error:'CPR kunne ikke vises'},500);}}
