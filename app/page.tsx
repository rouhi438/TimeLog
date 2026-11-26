"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { authClient } from "../lib/auth-client";

type Employee = {
  id: string;
  name: string;
  active: boolean;
  phone?: string;
  email?: string;
  cpr?: string; // write only
  hasCpr?: boolean;
  cprLast4?: string;
};
type Shift = {
  id: string;
  employee_id: string;
  date: string;
  hours: number;
  startTime?: string;
  endTime?: string;
  overnight?: boolean;
  dayOff?: boolean;
  note?: string;
};
type Company = {
  name: string;
  cvr: string;
  address: string;
  phone: string;
  email: string;
};
const monthNames = [
  "Januar",
  "Februar",
  "Marts",
  "April",
  "Maj",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "December",
];
function localDate(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function duration(start:string,end:string,overnight:boolean) { if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end))return 0; const m=(v:string)=>Number(v.slice(0,2))*60+Number(v.slice(3)); return m(end)-m(start)+(overnight?1440:0); }
function formatHours(h:number) { const m=Math.round(h*60); return `${Math.floor(m/60)} t${m%60 ? ` ${m%60} min` : ''}`; }
function shiftTime(s:Shift) { if(s.dayOff)return "Fridag"; return s.startTime && s.endTime ? `${s.startTime}–${s.endTime}${s.overnight?' (+1 dag)':''}` : 'Tidspunkter ikke registreret'; }
const uid = () => crypto.randomUUID();
function csvEscape(v: any) {
  let text = String(v ?? "");
  if (typeof v === "string" && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export default function Home() {
  const [employees, setEmployees] = useState<Employee[]>([]),
    [shifts, setShifts] = useState<Shift[]>([]),
    [company, setCompany] = useState<Company>({
      name: "Gastronomia Pizza",
      cvr: "",
      address: "",
      phone: "",
      email: "",
    });
  const [date, setDate] = useState(localDate()),
    [empId, setEmpId] = useState(""),
    [hours, setHours] = useState(""),
    [note, setNote] = useState(""),
    [tab, setTab] = useState("home"),
    [month, setMonth] = useState(localDate().slice(0, 7)),
    [name, setName] = useState(""),
    [bulk, setBulk] = useState(""),
    [editId, setEditId] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [authMsg, setAuthMsg] = useState(""),
    [user, setUser] = useState<any>(null),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(false);
  const [employeeEditId, setEmployeeEditId] = useState("");
  const [employeePhone, setEmployeePhone] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [employeeCpr, setEmployeeCpr] = useState("");
  const [removeCpr,setRemoveCpr]=useState(false);
  const [revealBusy,setRevealBusy]=useState(false);
  const [revealed,setRevealed]=useState<Record<string,string>>({});
  const [printCprs,setPrintCprs]=useState<Record<string,string>>({});
  const [printing,setPrinting]=useState(false);
  const requestGeneration=useRef(0);
  function clearSensitive(){requestGeneration.current++;setRevealed({});setPrintCprs({});setPrintReady(false);setRevealBusy(false);setPrinting(false);}
  useEffect(()=>{clearSensitive();},[tab,employeeEditId]);

  const [startTime,setStartTime]=useState("");
  const [endTime,setEndTime]=useState("");
  const [overnight,setOvernight]=useState(false);
  const [legacy,setLegacy]=useState(false);
  const [dayOff,setDayOff]=useState(false);
  const [calendarDay,setCalendarDay]=useState(localDate());
  const [calendarEmployee,setCalendarEmployee]=useState("");
  const [reportPeriod,setReportPeriod]=useState<"month"|"year">("month");
  const [showReportDetails, setShowReportDetails] = useState(false);
  useEffect(()=>{clearSensitive();},[month,reportPeriod]);
  const minutes=duration(startTime,endTime,overnight);
  const connected = true;
  const [revision, setRevision] = useState(-1),
    [resetToken, setResetToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const session = authClient.useSession();

  const sessionData = session.data as unknown as {
    user?: {
      id: string;
      email?: string;
      name?: string;
    };
  } | null;
  useEffect(() => {
    setResetToken(new URLSearchParams(location.search).get("token") || "");
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  useEffect(() => {
    clearSensitive();
    setUser(null);
    setEmployeeCpr("");
    setRemoveCpr(false);
    setEmployees([]);
    setShifts([]);
    setRevision(-1);
    setCompany({
      name: "Gastronomia Pizza",
      cvr: "",
      address: "",
      phone: "",
      email: "",
    });
    if (sessionData?.user) loadData();
    else if (!session.isPending) setReady(true);
  }, [sessionData?.user?.id, session.isPending]);
  useEffect(()=>{if(tab!=="employees"){setEmployeeCpr("");setRemoveCpr(false);}},[tab]);
  async function loadData() {
    setLoading(true);
    try {
      const r = await fetch("/api/data", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setEmployees(d.payload.employees);
      setShifts(d.payload.shifts);
      setCompany(d.payload.company);
      setRevision(d.revision);
      setUser(sessionData?.user || true);
    } catch (e) {
      setAuthMsg(String(e));
      setUser(null);
    } finally {
      setLoading(false);
      setReady(true);
    }
  }
  async function commit(payload: {
    employees: Employee[];
    shifts: Shift[];
    company: Company;
  }) {
    if (busy || revision < 0) return false;
    setBusy(true);
    try {
      const r = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, payload }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setEmployees(d.payload.employees);
      setShifts(d.payload.shifts);
      setCompany(d.payload.company);
      setRevision(d.revision);
      return true;
    } catch (e) {
      alert(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    setAuthMsg("");

    if (!email.trim() || !password) {
      setAuthMsg("Indtast e-mail og adgangskode.");
      return;
    }

    try {
      const { error } = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password: password,
      });

      if (error) {
        setAuthMsg(error.message || "Login mislykkedes");
        return;
      }

      setPassword("");
      location.replace("/");
    } catch (e) {
      setAuthMsg(e instanceof Error ? e.message : "Login mislykkedes");
    }
  }

  async function forgot() {
    setAuthMsg("");

    try {
      const { error } = await authClient.requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo: location.origin + "/",
      });

      if (error) {
        setAuthMsg(error.message || "Kunne ikke sende e-mail");
        return;
      }

      setAuthMsg("Hvis kontoen findes, modtager du en e-mail.");
    } catch (e) {
      setAuthMsg(e instanceof Error ? e.message : "Prøv igen senere.");
    }
  }

  async function reset() {
    setAuthMsg("");

    if (!resetToken) {
      setAuthMsg("Ugyldigt eller udløbet link.");
      return;
    }

    if (password.length < 8) {
      setAuthMsg("Adgangskoden skal være mindst 8 tegn.");
      return;
    }

    try {
      const { error } = await authClient.resetPassword({
        token: resetToken,
        newPassword: password,
      });

      if (error) {
        setAuthMsg(error.message || "Kunne ikke ændre adgangskode");
        return;
      }

      setPassword("");
      setResetToken("");
      window.history.replaceState({}, "", "/");

      setAuthMsg("Adgangskoden er ændret. Log ind med din nye adgangskode.");
    } catch (e) {
      setAuthMsg(
        e instanceof Error ? e.message : "Kunne ikke ændre adgangskode",
      );
    }
  }

  async function verify() {
    const address = email.trim();

    if (!address) {
      setAuthMsg("Indtast din e-mail.");
      return;
    }

    try {
      const r = await fetch("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: address,
          type: "email-verification",
        }),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "Kunne ikke sende kode");

      setOtpEmail(address);
      setOtp("");
      setShowOtp(true);
      setAuthMsg("Indtast den 6-cifrede kode fra din e-mail.");
    } catch (e) {
      setAuthMsg(e instanceof Error ? e.message : "Prøv igen senere.");
    }
  }

  async function verifyCode() {
    if (!/^\d{6}$/.test(otp)) {
      setAuthMsg("Indtast en gyldig 6-cifret kode.");
      return;
    }

    try {
      const r = await fetch("/api/auth/email-otp/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: otpEmail,
          otp,
        }),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "Ugyldig kode");

      setShowOtp(false);
      setOtp("");
      setAuthMsg("E-mail bekræftet. Du kan nu logge ind.");
    } catch (e) {
      setAuthMsg(e instanceof Error ? e.message : "Prøv igen senere.");
    }
  }

  async function logout() {
    clearSensitive();
    await authClient.signOut({});
    location.replace("/");
  }
  function clearEmployeeForm() {
    setEmployeeEditId("");
    setName("");
    setEmployeePhone("");
    setEmployeeEmail("");
    setEmployeeCpr("");
    setRemoveCpr(false);
  }
  function editEmployee(e: Employee) {
    setEmployeeEditId(e.id);
    setName(e.name);
    setEmployeePhone(e.phone || "");
    setEmployeeEmail(e.email || "");
    setEmployeeCpr("");
    setRemoveCpr(false);
  }
  async function addEmployee() {
    const fullName = name.trim();
    const phone = employeePhone.trim();
    const email = employeeEmail.trim();
    if (!fullName) { alert("Indtast medarbejderens navn."); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert("Indtast en gyldig e-mailadresse."); return;
    }
    if (employeeEditId && !employees.some(e => e.id === employeeEditId)) {
      alert("Medarbejderen findes ikke længere."); return;
    }
    const rawCpr = employeeCpr.trim();
    const digits = rawCpr.replace(/-/g, "");
    if (rawCpr && !/^\d{6}-?\d{4}$/.test(rawCpr)) {
      alert("CPR-nummer skal bestå af 10 cifre (DDMMÅÅ-XXXX)."); return;
    }
    const cpr = digits ? `${digits.slice(0, 6)}-${digits.slice(6)}` : "";
    const fields = { name: fullName, phone, email, ...(removeCpr?{cpr:""}:cpr?{cpr}:{}) };
    const next = employeeEditId
      ? employees.map(e => e.id === employeeEditId ? { ...e, ...fields } : e)
      : [...employees, { id: uid(), active: true, ...fields }];
    if (await commit({ employees: next, shifts, company })) clearEmployeeForm();
  }
  async function fetchCpr(id:string){
    const r=await fetch("/api/data",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({employeeId:id})});
    const d=await r.json();if(!r.ok||typeof d.cpr!=="string"||!/^\d{6}-\d{4}$/.test(d.cpr))throw Error("CPR");return d.cpr as string;
  }
  async function revealCpr(id:string){
    if(revealed[id]){setRevealed(old=>{const next={...old};delete next[id];return next;});return;}
    if(revealBusy)return;const generation=requestGeneration.current;setRevealBusy(true);
    try{const value=await fetchCpr(id);if(generation===requestGeneration.current)setRevealed(old=>({...old,[id]:value}));}catch{if(generation===requestGeneration.current)alert("CPR kunne ikke vises.");}finally{if(generation===requestGeneration.current)setRevealBusy(false);}
  }
  function clearEntry() { setEditId(""); setNote(""); setHours(""); setStartTime(""); setEndTime(""); setOvernight(false); setLegacy(false); setDayOff(false); }
  async function saveShift() {
    const total=dayOff?0:legacy?Number(hours):minutes/60;
    if(!empId || !date || !Number.isFinite(total) || (!dayOff && total<=0) || total>24) { alert("Vælg medarbejder, dato og gyldig start- og sluttid."); return; }
    if(shifts.some(s=>s.id!==editId && s.employee_id===empId && s.date===date && (dayOff||s.dayOff))) { alert("Der findes allerede en registrering eller fridag for denne medarbejder på datoen. Redigér den eksisterende registrering."); return; }
    const item:Shift={id:editId||uid(),employee_id:empId,date,hours:total,note,...(dayOff?{dayOff:true}:legacy?{}:{startTime,endTime,overnight})};
    if(await commit({employees,shifts:editId?shifts.map(x=>x.id===editId?item:x):[...shifts,item],company})) { clearEntry(); setMonth(date.slice(0,7)); setCalendarDay(date); setTab("calendar"); }
  }
  async function removeShift(id: string) {
    if (confirm("Slet denne registrering?"))
      await commit({
        employees,
        shifts: shifts.filter((x) => x.id !== id),
        company,
      });
  }
  async function toggleEmployee(e: Employee) {
    await commit({
      employees: employees.map((x) =>
        x.id === e.id ? { ...x, active: !x.active } : x,
      ),
      shifts,
      company,
    });
  }
  async function saveCompany() {
    if (await commit({ employees, shifts, company })) alert("Profil gemt");
  }
  function startEdit(s: Shift) {
    setEditId(s.id);
    setEmpId(s.employee_id);
    setDate(s.date);
    setHours(String(s.hours));
    setStartTime(s.startTime||""); setEndTime(s.endTime||""); setOvernight(!!s.overnight); setLegacy(!s.startTime||!s.endTime); setDayOff(!!s.dayOff);
    setNote(s.note || "");
    setTab("entry");
  }
  async function bulkImport() {
    const lines = bulk
      .split(/\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    let made: Shift[] = [];
    for (const line of lines) {
      const parts = line.split(/[;\t ]+/);
      if (parts.length < 2) continue;
      const day = parts[0];
      const off=/^(fri|fridag)$/i.test(parts[1]);
      const timed=!off && parts[1].includes(":");
      const start=parts[1], end=parts[2]||"";
      const overnightImport=timed && end.endsWith("+1");
      const cleanEnd=overnightImport?end.slice(0,-2):end;
      const hrs=off?0:timed?duration(start,cleanEnd,overnightImport)/60:Number(parts[1].replace(",", "."));
      const target = parts.slice(timed?3:2).join(" ");
      if (!day || !Number.isFinite(hrs) || (!off && hrs <= 0) || hrs > 24) continue;
      let employee =
        employees.find((e) => e.name.toLowerCase() === target.toLowerCase()) ||
        employees.find(
          (e) =>
            e.name.toLowerCase().includes(target.toLowerCase()) &&
            target.length > 0,
        );
      if (!employee && !target && employees.length === 1)
        employee = employees[0];
      if (!employee) continue;
      const d = day.includes("-") ? day : `${month}-${day.padStart(2, "0")}`;
      if([...shifts,...made].some(s=>s.employee_id===employee.id && s.date===d && (off||s.dayOff))) { alert(`Fridag konflikter med en registrering: ${d}. Ingen linjer importeret.`); return; }
      made.push({
        id: uid(),
        employee_id: employee.id,
        date: d,
        hours: hrs,
        note: "Bulk import",
        ...(off?{dayOff:true}:timed?{startTime:start,endTime:cleanEnd,overnight:overnightImport}:{}),
      });
    }
    if (!made.length) {
      alert(
        "Ingen linjer kunne importeres. Format: YYYY-MM-DD timer medarbejdernavn (eller dag timer hvis måneden er valgt).",
      );
      return;
    }
    if (!(await commit({ employees, shifts: [...shifts, ...made], company })))
      return;
    setBulk("");
    alert(
      `${made.length} registreringer tilføjet. Kontrollér dem i kalenderlisten.`,
    );
  }
  const monthShifts = useMemo(
    () => shifts.filter((s) => s.date.startsWith(month)),
    [shifts, month],
  );
  const totals = useMemo(
    () =>
      employees.map((e) => ({
        e,
        total: monthShifts
          .filter((s) => s.employee_id === e.id)
          .reduce((a, s) => a + s.hours, 0),
      })),
    [employees, monthShifts],
  );
  const allHours = monthShifts.reduce((a, s) => a + s.hours, 0);
  const reportKey=reportPeriod==="year"?month.slice(0,4):month;
  const reportShifts=shifts.filter(s=>s.date.startsWith(reportKey));
  const reportTotals=employees.map(e=>({e,total:reportShifts.filter(s=>s.employee_id===e.id).reduce((a,s)=>a+s.hours,0)}));
  const reportHours=reportShifts.reduce((a,s)=>a+s.hours,0);
  const reportDays=new Set(reportShifts.filter(s=>!s.dayOff && s.hours>0).map(s=>s.date)).size;
  const palette=["#16834c","#187da5","#d58b23","#8161a9","#bd545b"];
  let angle=0;
  const chartSegments=reportTotals.filter(x=>x.total>0).map((x,i)=>{const a=angle;angle+=x.total/reportHours*360;return `${palette[i%palette.length]} ${a}deg ${angle}deg`;});
  const calendarShifts=monthShifts.filter(s=>!calendarEmployee||s.employee_id===calendarEmployee);
  const [cy,cm]=month.split("-").map(Number);
  const offset=(new Date(cy,cm-1,1).getDay()+6)%7;
  const days=new Date(cy,cm,0).getDate();
  function moveMonth(delta:number) { const d=new Date(cy,cm-1+delta,1);const next=localDate(d);setMonth(next.slice(0,7));setCalendarDay(next); }
  const selectedDay=calendarDay.startsWith(month)?calendarDay:month+"-01";
  function exportCSV() {
    const rows = [
      ["Dato", "Medarbejder", "Start", "Slut", "Næste dag", "Timer", "Varighed", "Status", "Note"],
      ...reportShifts
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((s) => [
          s.date,
          employees.find((e) => e.id === s.employee_id)?.name || "",
          s.startTime||"", s.endTime||"", s.overnight?"Ja":"",
          s.hours.toLocaleString("da-DK",{maximumFractionDigits:6}), formatHours(s.hours),
          s.dayOff?"Fridag":"Arbejde", s.note || "",
        ]),
    ];
    const csv = rows.map((r) => r.map(csvEscape).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timelog-${reportKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function exportPDF() {
    if(printing)return;
    const generation=requestGeneration.current;setPrinting(true);
    try{
      const values:Record<string,string>={};
      for(const {e} of reportTotals){if(e.hasCpr)values[e.id]=await fetchCpr(e.id);if(generation!==requestGeneration.current)return;}
      if(generation!==requestGeneration.current)return;
      setPrintCprs(values);
      // The effect prints after React commits the print-only fields.
      setPrintReady(true);
    }catch{if(generation===requestGeneration.current){setPrintCprs({});setPrinting(false);alert("CPR kunne ikke hentes. Rapporten blev ikke udskrevet.");}}
  }
  const [printReady,setPrintReady]=useState(false);
  useEffect(()=>{
    if(!printReady||tab!=="reports")return;
    const cleanup=()=>{document.body.classList.remove("print-report");setPrintCprs({});setPrintReady(false);setPrinting(false);};
    window.addEventListener("afterprint",cleanup,{once:true});
    document.body.classList.add("print-report");
    try{window.print();}catch{cleanup();}
    return ()=>{window.removeEventListener("afterprint",cleanup);document.body.classList.remove("print-report");};
  },[printReady,tab]);
  function backup() {
    if (!confirm("Backup indeholder personoplysninger, men ingen CPR-numre. Opbevar filen sikkert. Fortsæt?")) return;
    const blob = new Blob(
      [JSON.stringify({ employees:employees.map(({cpr,hasCpr,cprLast4,...e})=>e), shifts, company }, null, 2)],
      { type: "application/json" },
    );
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = "timelog-backup.json";
    a.click();
    URL.revokeObjectURL(u);
  }
  function restore(e: any) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const d = JSON.parse(String(reader.result));
        if(!Array.isArray(d.employees))throw Error("Invalid backup");
        d.employees=d.employees.map(({cpr,hasCpr,cprLast4,...e}:Employee)=>e);
        if (
          confirm("Erstat data med denne backup? CPR bevares kun for medarbejdere med samme ID; øvrige CPR slettes. CPR importeres ikke.") &&
          (await commit(d))
        )
          alert("Backup indlæst");
      } catch {
        alert("Filen kunne ikke læses.");
      }
    };
    reader.readAsText(f);
  }
  const grouped = monthShifts
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <main className="shell">
      <header className="top">
        <div className="brand">
          <img src="/logo.svg" alt="TimeLog" />
          <div>
            <h1>TimeLog</h1>
            <p>{user ? company.name : "Timeregistrering"}</p>
          </div>
        </div>
        <div className="monthpick">
          <input
            type="month"
            value={month}
            onChange={(e) => {if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value);}}
          />
        </div>
      </header>
      {connected && (!user || resetToken) ? (
        <section className="panel auth">
          <h2>Log ind</h2>
          <p>Log ind med din godkendte konto.</p>
          <input
            placeholder="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            placeholder="Adgangskode"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="actions">
            <button onClick={resetToken ? reset : login}>
              {resetToken ? "Gem ny adgangskode" : "Log ind"}
            </button>
            <button className="secondary" onClick={forgot}>
              Glemt adgangskode?
            </button>
            <button className="secondary" onClick={verify}>
              Bekræft e-mail
            </button>
            {sessionData?.user && (
              <button className="secondary" onClick={logout}>
                Log ud
              </button>
            )}
          </div>

          {showOtp && (
            <div>
              <label>
                Bekræftelseskode
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="6-cifret kode"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                />
              </label>
              <button onClick={verifyCode}>Bekræft kode</button>
            </div>
          )}
          <small>{authMsg}</small>
        </section>
      ) : (
        <>
          <section className="stats">
            <div className="stat">
              <small>Timer i måneden</small>
              <strong>
                {allHours.toLocaleString("da-DK", { maximumFractionDigits: 2 })}
              </strong>
            </div>
            <div className="stat">
              <small>Aktive medarbejdere</small>
              <strong>{employees.filter((e) => e.active).length}</strong>
            </div>
            <div className="stat">
              <small>Registreringer</small>
              <strong>{monthShifts.filter(s=>!s.dayOff).length}</strong>
            </div>
          </section>
          <nav className="nav">
            {[
              ["home", "Oversigt"],
              ["calendar", "Kalender"],
              ["entry", "Timer"],
              ["employees", "Medarbejdere"],
              ["reports", "Rapporter"],
              ["settings", "Indstillinger"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "home" && (
            <section className="panel">
              <div className="sectionhead">
                <h2>Månedens oversigt</h2>
                <button className="secondary" onClick={() => setTab("entry")}>
                  + Registrér
                </button>
              </div>
              {totals.map(({ e, total }) => (
                <div className="personrow" key={e.id}>
                  <div>
                    <b>{e.name}</b>
                    <small>{e.active ? "Aktiv" : "Inaktiv"}</small>{e.hasCpr&&<button type="button" className="secondary" aria-label={revealed[e.id]?"Skjul CPR":"Vis CPR"} disabled={revealBusy} onClick={()=>revealCpr(e.id)}>{revealed[e.id]||`••••••-${e.cprLast4||"••••"}`}</button>}
                  </div>
                  <strong>
                    {formatHours(total)}
                  </strong>
                </div>
              ))}
              {employees.length === 0 && (
                <p className="empty">Tilføj medarbejdere i Medarbejdere.</p>
              )}
              <h3>Seneste registreringer</h3>
              {grouped.slice(0, 8).map((s) => (
                <div className="listrow" key={s.id}>
                  <div>
                    <b>
                      {employees.find((e) => e.id === s.employee_id)?.name ||
                        "—"}
                    </b>
                    <small>
                      {s.date} · {shiftTime(s)}
                      {s.note ? ` · ${s.note}` : ""}
                    </small>
                  </div>
                  <strong>{formatHours(s.hours)}</strong>
                  <button className="iconbtn" onClick={() => startEdit(s)}>
                    ✎
                  </button>
                </div>
              ))}
            </section>
          )}
          {tab === "calendar" && <section className="panel calendar-panel">
            <div className="sectionhead calendar-heading"><button className="secondary" aria-label="Forrige måned" onClick={()=>moveMonth(-1)}>‹</button><h2>{monthNames[cm-1]} {cy}</h2><button className="secondary" aria-label="Næste måned" onClick={()=>moveMonth(1)}>›</button></div>
            <label>Medarbejder<select value={calendarEmployee} onChange={e=>setCalendarEmployee(e.target.value)}><option value="">Alle medarbejdere</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
            <div className="calendar-grid">{['Man','Tir','Ons','Tor','Fre','Lør','Søn'].map(d=><span className="weekday" key={d}>{d}</span>)}{Array.from({length:offset},(_,i)=><span key={'blank'+i}/>)}{Array.from({length:days},(_,i)=>{const d=month+'-'+String(i+1).padStart(2,'0');const records=calendarShifts.filter(s=>s.date===d);const total=records.reduce((a,s)=>a+s.hours,0);const off=records.some(s=>s.dayOff);return <button key={d} className={'calendar-day '+(d===selectedDay?'selected ':'')+(total>0?'worked ': '')+(off?'day-off':'')} aria-pressed={d===selectedDay} onClick={()=>setCalendarDay(d)}><span>{i+1}</span>{total>0&&<small>{formatHours(total)}</small>}{off&&<small className="off-label">Fri</small>}</button>})}</div>
            <style>{`.calendar-day.day-off:not(.worked){background:#e7e5fa;color:#45368a;border-color:#c9c2ef}.calendar-day.day-off.selected{outline:2px solid #6955b4;outline-offset:1px}.calendar-day .off-label{color:#45368a;background:#e7e5fa;padding:2px 4px;border-radius:4px}.calendar-day.day-off.worked{border-color:#6955b4}`}</style>
            <div className="totalbox"><span>Denne måned</span><strong>{formatHours(calendarShifts.reduce((a,s)=>a+s.hours,0))}</strong></div>
            <div className="sectionhead"><h3>{selectedDay}</h3><button onClick={()=>{clearEntry();setDate(selectedDay);if(calendarEmployee)setEmpId(calendarEmployee);setTab("entry")}}>+ Registrér</button></div>
            {calendarShifts.filter(s=>s.date===selectedDay).length===0&&<p className="empty">Ingen registreringer denne dag.</p>}
            {calendarShifts.filter(s=>s.date===selectedDay).map(s=><div className="listrow" key={s.id}><div><b>{employees.find(e=>e.id===s.employee_id)?.name}</b><small>{shiftTime(s)}{s.note?` · ${s.note}`:""}</small></div><strong>{formatHours(s.hours)}</strong><button className="iconbtn" onClick={()=>startEdit(s)} aria-label="Redigér">✎</button></div>)}
          </section>}
          {tab === "entry" && (
            <section className="panel">
              <h2>
                {editId ? "Redigér registrering" : "Registrér arbejdstimer"}
              </h2>
              <label>
                Medarbejder
                <select
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                >
                  <option value="">Vælg medarbejder</option>
                  {employees
                    .filter((e) => e.active || e.id === empId)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Dato
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>Registreringstype<select value={dayOff?"off":"work"} onChange={e=>setDayOff(e.target.value==="off")}><option value="work">Arbejdstid</option><option value="off">Fridag</option></select></label>
              {dayOff ? <div className="duration-box" style={{background:"#e7e5fa",color:"#45368a"}}><b>Fridag</b><span>0 timer</span></div> : legacy ? <div className="legacy-note"><p>Historisk registrering uden start- og sluttid.</p><label>Timer<input type="number" min="0" max="24" step="any" value={hours} onChange={e=>setHours(e.target.value)}/></label><button className="secondary" onClick={()=>setLegacy(false)}>Angiv præcise tidspunkter</button></div> : <>
                <div className="time-fields"><label>Mødetid<input type="time" step="60" value={startTime} onChange={e=>setStartTime(e.target.value)}/></label><label>Sluttid<input type="time" step="60" value={endTime} onChange={e=>setEndTime(e.target.value)}/></label></div>
                <label className="checkline"><input type="checkbox" checked={overnight} onChange={e=>setOvernight(e.target.checked)}/> Slut næste dag</label>
                <div className="duration-box"><small>Samlet arbejdstid</small><strong>{minutes>0&&minutes<=1440?formatHours(minutes/60):"—"}</strong><span>{startTime&&endTime?`${startTime} – ${endTime}${overnight?' (+1 dag)':''}`:"Vælg start- og sluttid"}</span></div>
              </>}
              <label>
                Note (valgfri)
                <input
                  placeholder="Fx ekstra vagt"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <div className="actions">
                <button onClick={saveShift}>
                  {editId ? "Opdatér" : "Gem registrering"}
                </button>
                {editId && (
                  <button
                    className="secondary"
                    onClick={clearEntry}
                  >
                    Annullér
                  </button>
                )}
              </div>
              <hr />
              <h3>Registreringer i {month}</h3>
              {grouped.map((s) => (
                <div className="listrow" key={s.id}>
                  <div>
                    <b>{employees.find((e) => e.id === s.employee_id)?.name}</b>
                    <small>
                      {s.date} · {shiftTime(s)} · {s.note || "—"}
                    </small>
                  </div>
                  <strong>{formatHours(s.hours)}</strong>
                  <button className="iconbtn" onClick={() => startEdit(s)}>
                    ✎
                  </button>
                  <button
                    className="iconbtn danger"
                    onClick={() => removeShift(s.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </section>
          )}
          {tab === "employees" && (
            <section className="panel">
              <h2>{employeeEditId ? "Redigér medarbejder" : "Medarbejdere"}</h2>
              <form onSubmit={e => { e.preventDefault(); void addEmployee(); }}>
                <label>Fulde navn<input required maxLength={500} placeholder="Medarbejderens navn" value={name} onChange={e => setName(e.target.value)} /></label>
                <label>CPR-nummer (valgfrit)<input type="password" inputMode="numeric" autoComplete="off" maxLength={11} placeholder={employees.find(e=>e.id===employeeEditId)?.hasCpr?"Registreret – tomt felt bevarer CPR":"DDMMÅÅ-XXXX"} disabled={removeCpr} value={employeeCpr} onChange={e => setEmployeeCpr(e.target.value)} /></label>
                {employees.find(e=>e.id===employeeEditId)?.hasCpr && <div className="actions"><button type="button" className="secondary" disabled={revealBusy||busy} onClick={()=>revealCpr(employeeEditId)}>{revealed[employeeEditId]||`••••••-${employees.find(e=>e.id===employeeEditId)?.cprLast4||"••••"}`}</button><button type="button" className="secondary" onClick={()=>{setRemoveCpr(!removeCpr);setEmployeeCpr("");}}>{removeCpr?"Fortryd fjernelse":"Fjern CPR ved gemning"}</button></div>}
                <label>Telefonnummer (valgfrit)<input type="tel" maxLength={50} value={employeePhone} onChange={e => setEmployeePhone(e.target.value)} /></label>
                <label>E-mail (valgfrit)<input type="email" maxLength={254} value={employeeEmail} onChange={e => setEmployeeEmail(e.target.value)} /></label>
                <div className="actions">
                  <button type="submit" disabled={busy}>{employeeEditId ? "Gem ændringer" : "+ Tilføj medarbejder"}</button>
                  {employeeEditId && <button type="button" className="secondary" onClick={clearEmployeeForm}>Annullér</button>}
                </div>
              </form>
              {employees.map((e) => (
                <div className="listrow" key={e.id}>
                  <div>
                    <b>{e.name}</b>
                    <small>{e.active ? "Aktiv" : "Inaktiv"}</small>{e.hasCpr&&<button type="button" className="secondary" aria-label={revealed[e.id]?"Skjul CPR":"Vis CPR"} disabled={revealBusy} onClick={()=>revealCpr(e.id)}>{revealed[e.id]||`••••••-${e.cprLast4||"••••"}`}</button>}
                  </div>
                  <button type="button" className="secondary" disabled={busy} onClick={() => editEmployee(e)}>Redigér</button>
                  <button
                    className="secondary"
                    onClick={() => toggleEmployee(e)}
                  >
                    {e.active ? "Deaktivér" : "Aktivér"}
                  </button>
                </div>
              ))}
            </section>
          )}
          {tab === "reports" && (
            <section className="panel report-panel">
              <div className="report-switch no-print"><button className={reportPeriod==="month"?"":"secondary"} onClick={()=>setReportPeriod("month")}>Månedsrapport</button><button className={reportPeriod==="year"?"":"secondary"} onClick={()=>setReportPeriod("year")}>Årsrapport</button></div>
              <h2>Rapporter · {reportKey}</h2>
              <div className="report-company"><b>{company.name}</b><small>{[company.cvr&&`CVR: ${company.cvr}`,company.address,company.phone,company.email].filter(Boolean).join(" · ")}</small></div>
              <div className="report-metrics"><div className="totalbox"><span>Samlet arbejdstid</span><strong>{formatHours(reportHours)}</strong></div><div className="totalbox"><span>Arbejdsdage (datoer)</span><strong>{reportDays}</strong></div></div>
              <h3>Medarbejderoversigt</h3>
              <div className="report-overview"><div>{reportTotals.map(({e,total},i)=><div className="personrow" key={e.id}><b>{e.name}{printCprs[e.id]&&<small className="cpr-print-only">CPR: {printCprs[e.id]}</small>}</b><strong>{formatHours(total)}</strong></div>)}</div>{reportHours>0&&<div className="donut" role="img" aria-label="Fordeling af arbejdstid" style={{background:`conic-gradient(${chartSegments.join(',')})`}}><span>{formatHours(reportHours)}</span></div>}</div>
              <div className="sectionhead">
                <h3>Registreringer ({reportShifts.length})</h3>
                <button
                  type="button"
                  className="secondary no-print"
                  aria-expanded={showReportDetails}
                  aria-controls="report-details"
                  onClick={() => setShowReportDetails((open) => !open)}
                >
                  {showReportDetails ? "Skjul detaljer ▲" : "Vis detaljer ▼"}
                </button>
              </div>
              <style>{`@media screen { .report-details-collapsed, .cpr-print-only { display: none; } } @media print { .cpr-print-only { display: block; } }`}</style>
              <div id="report-details" className={`report-table${showReportDetails ? "" : " report-details-collapsed"}`}><table><thead><tr><th>Dato</th><th>Medarbejder</th><th>Start / slut</th><th>Varighed</th><th>Status</th><th>Note</th></tr></thead><tbody>{reportShifts.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(s=><tr key={s.id}><td>{s.date}</td><td>{employees.find(e=>e.id===s.employee_id)?.name}</td><td>{shiftTime(s)}</td><td>{formatHours(s.hours)}</td><td>{s.dayOff?"Fridag":"Arbejde"}</td><td>{s.note}</td></tr>)}</tbody></table></div>
              <div className="actions export-actions">
                <button onClick={exportCSV}>Eksportér CSV / Excel</button>
                <button className="secondary" disabled={printing||busy} onClick={exportPDF}>
                  Gem som PDF / Print
                </button>
              </div>
              <p className="hint">
                CSV åbnes i Excel. PDF-knappen åbner printdialogen, hvor du
                vælger ‘Gem som PDF’.
              </p>
              <div className="no-print"><hr />
              <h3>Hurtig indtastning (historik)</h3>
              <p className="hint">
                Én registrering pr. linje: <code>2026-11-02 15:20 21:45 Anders</code>{" "}
                eller <code>02 6 Anders</code> (datoen følger den valgte måned).
                Historiske timer kan stadig importeres som decimaler. Brug 02:00+1 for slut næste dag. Fridag: <code>27 Fri Anders</code>.
              </p>
              <textarea
                rows={7}
                placeholder={"02 15:20 21:45 Anders\n04 16:00 22:10 Anders"}
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
              />
              <button onClick={bulkImport}>Importer linjer</button></div>
            </section>
          )}
          {tab === "settings" && (
            <section className="panel">
              <h2>Virksomhedsprofil</h2>
              <p className="hint">
                Udfyld selv virksomhedens oplysninger. Oplysninger gemmes i den
                private database.
              </p>
              {(
                [
                  ["name", "Virksomhed"],
                  ["cvr", "CVR"],
                  ["address", "Adresse"],
                  ["phone", "Telefon"],
                  ["email", "E-mail"],
                ] as const
              ).map(([k, l]) => (
                <label key={k}>
                  {l}
                  <input
                    value={company[k]}
                    onChange={(e) =>
                      setCompany((c) => ({ ...c, [k]: e.target.value }))
                    }
                  />
                </label>
              ))}
              <button onClick={saveCompany}>Gem profil</button>
              <hr />
              <h3>Backup og gendannelse</h3>
              <button className="secondary" onClick={backup}>
                Download backup uden CPR (JSON)
              </button>
              <label className="filelabel">
                Gendan backup
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={restore}
                />
              </label>
              {connected && user && (
                <button className="secondary" onClick={logout}>
                  Log ud
                </button>
              )}
              <button className="secondary" onClick={() => location.reload()}>
                Genindlæs data
              </button>
              <p className="hint">
                {busy ? "Gemmer…" : "Cloud storage: Neon."}
              </p>
            </section>
          )}
        </>
      )}
      <footer>
        TimeLog · Timeregistrering{" "}
        <span>{loading ? "Synkroniserer…" : ""}</span>
      </footer>
    </main>
  );
}
