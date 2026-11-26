import { neon } from '@neondatabase/serverless';
import { getAuth } from '../../../lib/auth';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store, private'}});
async function authorized(){
 const ids=(process.env.TIMELOG_MANAGER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(ids.length!==2||new Set(ids).size!==2)return false;
 const {data}=await getAuth().getSession();
 return !!data?.user?.id && ids.includes(data.user.id) && data.user.emailVerified===true;
}
function str(v:unknown,max=500){return typeof v==='string'&&v.length<=max;}
function valid(p:any){
 if(!p||!Array.isArray(p.employees)||!Array.isArray(p.shifts)||!p.company||p.employees.length>500||p.shifts.length>100000)return false;
 const ids=new Set<string>(), shifts=new Set<string>(), cprs=new Set<string>();
 for(const e of p.employees){if(!e||!str(e.id,100)||!e.id||ids.has(e.id)||!str(e.name)||!e.name.trim()||typeof e.active!=='boolean'||(e.phone!==undefined&&!str(e.phone,50))||(e.email!==undefined&&(!str(e.email,254)||(e.email!==''&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)))))return false;
 if(e.cpr!==undefined&&e.cpr!==''){if(typeof e.cpr!=='string'||!/^\d{6}-?\d{4}$/.test(e.cpr))return false;const digits=e.cpr.replace(/-/g,'');if(cprs.has(digits))return false;cprs.add(digits);}
 ids.add(e.id);}
 const dates=new Map<string,boolean>();
 for(const s of p.shifts){if(!s||!str(s.id,100)||!s.id||shifts.has(s.id)||!ids.has(s.employee_id)||typeof s.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!Number.isFinite(Date.parse(s.date))||new Date(s.date).toISOString().slice(0,10)!==s.date||typeof s.hours!=='number'||!Number.isFinite(s.hours)||s.hours<0||s.hours>24||!str(s.note??'',2000))return false;if(s.dayOff!==undefined&&typeof s.dayOff!=='boolean')return false;const key=JSON.stringify([s.employee_id,s.date]);if(dates.has(key)&&(dates.get(key)||s.dayOff))return false;dates.set(key,!!s.dayOff);if(s.dayOff){if(s.hours!==0||s.startTime!==undefined||s.endTime!==undefined||s.overnight!==undefined)return false;}else if(s.hours<=0)return false;if(s.startTime!==undefined||s.endTime!==undefined||s.overnight!==undefined){const t=/^([01]\d|2[0-3]):[0-5]\d$/;if(typeof s.startTime!=='string'||typeof s.endTime!=='string'||!t.test(s.startTime)||!t.test(s.endTime)||typeof s.overnight!=='boolean')return false;const m=(v:string)=>Number(v.slice(0,2))*60+Number(v.slice(3));const minutes=m(s.endTime)-m(s.startTime)+(s.overnight?1440:0);if(minutes<=0||minutes>1440||Math.abs(s.hours-minutes/60)>1e-8)return false;}shifts.add(s.id);}
 return ['name','cvr','address','phone','email'].every(k=>str(p.company[k]));
}
export async function GET(){try{if(!await authorized())return reply({error:'Ingen adgang'},403);const sql=neon(process.env.DATABASE_URL!);const [row]=await sql`SELECT revision,payload FROM public.timelog_state WHERE id=1`;return row?reply(row):reply({error:'Database mangler'},503);}catch{return reply({error:'Serverfejl'},500);}}
export async function PUT(req:Request){try{
 const origin=req.headers.get('origin');if(!origin||origin!==new URL(req.url).origin||!req.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Ugyldig anmodning'},403);
 if(!await authorized())return reply({error:'Ingen adgang'},403);
 const raw=await req.text();if(raw.length>10000000)return reply({error:'Filen er for stor'},413);
 const {revision,payload}=JSON.parse(raw);if(!Number.isSafeInteger(revision)||!valid(payload))return reply({error:'Ugyldige data'},400);
 const sql=neon(process.env.DATABASE_URL!);const [row]=await sql`UPDATE public.timelog_state SET payload=${JSON.stringify(payload)}::jsonb, revision=revision+1 WHERE id=1 AND revision=${revision} RETURNING revision,payload`;
 return row?reply(row):reply({error:'Data er ændret på en anden enhed. Genindlæs før du prøver igen.'},409);
 }catch{return reply({error:'Data kunne ikke gemmes'},500);}}
