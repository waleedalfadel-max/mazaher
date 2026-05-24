import { useState, useEffect, useMemo } from "react";

// ══════════════════════════════════════════
//  ١. إعدادات Supabase — غيّر هذين فقط
// ══════════════════════════════════════════
const SUPABASE_URL    = "https://dnuxevxxgmgptptmuzdy.supabase.co";
const SUPABASE_ANON   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudXhldnh4Z21ncHRwdG11emR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MjY1OTAsImV4cCI6MjA5NTEwMjU5MH0.o7lx6HiTU8a3XPF501WNFYk7NOxfYoBrphqVunhOk2s";
const PROJECT_NAME    = "مزاهر";
const PROJECT_ID      = "d64b040a-0824-43b8-966e-eb41ee095f82";

// ══════════════════════════════════════════
//  ٢. Supabase Client بسيط (بدون مكتبة)
// ══════════════════════════════════════════
const sb = {
  async query(table, params = {}) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?`;
    const parts = [];
    if (params.select) parts.push(`select=${params.select}`);
    if (params.filter) {
      Object.entries(params.filter).forEach(([k,v]) => {
        if (k === "date_from") parts.push(`date=gte.${v}`);
        else if (k === "date_to") parts.push(`date=lte.${v}`);
        else parts.push(`${k}=${v}`);
      });
    }
    if (params.order) parts.push(`order=${params.order}`);
    if (params.limit) parts.push(`limit=${params.limit}`);
    url += parts.join("&");
    const res = await fetch(url, {
      headers: {
        "apikey": SUPABASE_ANON,
        "Authorization": `Bearer ${SUPABASE_ANON}`,
        "Content-Type": "application/json"
      }
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async insert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}`, "Content-Type": "application/json", "Prefer": "return=representation" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async update(table, id, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}`, "Content-Type": "application/json", "Prefer": "return=representation" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async remove(table, id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
      headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}` },
    });
    if (!res.ok) throw new Error(await res.text());
  },
};

// ══════════════════════════════════════════
//  ٣. Hook لجلب البيانات
// ══════════════════════════════════════════
function useData(table, params, deps = []) {
  const [data, setData]     = useState([]);
  const [loading, setLoad]  = useState(true);
  const [error, setError]   = useState(null);

  const load = async () => {
    try {
      setLoad(true);
      const res = await sb.query(table, params);
      setData(res);
      setError(null);
    } catch(e) { setError(e.message); }
    finally   { setLoad(false); }
  };

  useEffect(() => { load(); }, deps);
  return { data, loading, error, reload: load };
}

// ══════════════════════════════════════════
//  ٤. Constants
// ══════════════════════════════════════════
const TYPES   = ["💵 مبيعات كاش","🏦 مبيعات شبكة","🛒 مصروفات تشغيلية","💰 مصروفات ثابتة","💳 قسط سيارة","💳 قسط شراء أرض","💳 قرض ١","💳 قرض ٢","👤 صرف عهدة","💼 مسحوبات سليمان","💼 مسحوبات أم طوبى","🏛️ ضريبة القيمة المضافة","🔄 تحويل داخلي"];
const SOURCES = [{v:"cash",l:"🏧 صندوق"},{v:"bank",l:"🏦 بنك"},{v:"custody",l:"👤 عهدة"}];
const fmt     = (n) => new Intl.NumberFormat("ar-SA",{minimumFractionDigits:2}).format(n||0);
const pct     = (a,b) => b ? `${((a/b)*100).toFixed(1)}%` : "—";
const srcC    = {cash:"#3FB950",bank:"#58A6FF",custody:"#D29922"};
const srcL    = {cash:"🏧 صندوق",bank:"🏦 بنك",custody:"👤 عهدة"};
const today   = () => new Date().toISOString().slice(0,10);

// ══════════════════════════════════════════
//  ٥. CSS
// ══════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0D1117;color:#C9D1D9;font-family:'IBM Plex Sans Arabic',sans-serif;direction:rtl}
.layout{display:flex;min-height:100vh}
.sidebar{width:210px;background:#161B22;border-left:1px solid #21262D;padding:16px 0;position:fixed;top:0;right:0;bottom:0;display:flex;flex-direction:column;z-index:50;transition:transform 0.3s}
.sidebar.hidden{transform:translateX(100%)}
.content{margin-right:210px;flex:1}
@media(max-width:768px){
  .sidebar{width:200px;transform:translateX(100%)}
  .sidebar.open{transform:translateX(0)}
  .content{margin-right:0}
  .topbar{padding:8px 12px}
  .page{padding:10px 12px}
  .kpis{grid-template-columns:repeat(2,1fr)!important;gap:8px!important}
  .bal-grid{grid-template-columns:repeat(3,1fr)!important}
  .rep-grid{grid-template-columns:1fr!important}
  .ledger-table{font-size:11px}
  .ledger-table th,.ledger-table td{padding:6px 6px}
  .mobile-menu-btn{display:flex!important}
  .overlay-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:49}
  .overlay-bg.show{display:block}
}
.mobile-menu-btn{display:none;background:transparent;border:none;color:#E6EDF3;font-size:20px;cursor:pointer;padding:4px 8px}
.brand{padding:12px 18px 18px;border-bottom:1px solid #21262D;margin-bottom:8px}
.brand-name{font-size:15px;font-weight:700;color:#E6EDF3}
.brand-role{font-size:11px;color:#58A6FF;margin-top:2px}
.nav-item{display:flex;align-items:center;gap:9px;padding:8px 18px;cursor:pointer;font-size:13px;color:#8B949E;border-right:3px solid transparent;transition:all 0.15s}
.nav-item:hover{background:#21262D;color:#E6EDF3}
.nav-item.active{color:#E6EDF3;border-right-color:#58A6FF;background:rgba(88,166,255,0.06)}
.nav-icon{font-size:15px;width:18px;text-align:center}
.nav-badge{background:#DA3633;color:#fff;border-radius:10px;padding:1px 6px;font-size:10px;font-weight:700;margin-right:auto}
.sidebar-bottom{margin-top:auto;padding:12px 18px;border-top:1px solid #21262D}
.sync-btn{width:100%;padding:7px;background:#21262D;border:1px solid #30363D;border-radius:6px;color:#8B949E;font-size:12px;cursor:pointer;font-family:'IBM Plex Sans Arabic',sans-serif}
.sync-btn:hover{color:#E6EDF3;border-color:#58A6FF}
.topbar{background:#161B22;border-bottom:1px solid #21262D;padding:11px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:40}
.page-title{font-size:14px;font-weight:600;color:#E6EDF3}
.period-sel{display:flex;align-items:center;gap:5px;background:#21262D;border:1px solid #30363D;border-radius:6px;padding:4px 10px}
.pinput{background:transparent;border:none;color:#E6EDF3;font-size:11px;font-family:'JetBrains Mono',monospace;width:95px}
.pinput:focus{outline:none}
.page{padding:16px 20px}
.loading{text-align:center;padding:60px 20px;color:#8B949E;font-size:13px}
.error-box{background:rgba(218,54,51,0.1);border:1px solid rgba(218,54,51,0.3);border-radius:8px;padding:12px 16px;color:#DA3633;font-size:13px;margin-bottom:14px}

/* Review */
.stats-row{display:flex;gap:10px;margin-bottom:14px}
.stat-card{background:#161B22;border:1px solid #21262D;border-radius:8px;padding:10px 14px;flex:1;display:flex;align-items:center;gap:9px}
.stat-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.stat-num{font-size:18px;font-weight:700;color:#E6EDF3;font-family:'JetBrains Mono',monospace}
.stat-lbl{font-size:11px;color:#8B949E}
.filter-row{display:flex;gap:7px;margin-bottom:12px;align-items:center;flex-wrap:wrap}
.fb{padding:4px 12px;border-radius:20px;font-size:12px;cursor:pointer;border:1px solid #30363D;background:transparent;color:#8B949E;font-family:'IBM Plex Sans Arabic',sans-serif}
.fb.on{background:#21262D;color:#E6EDF3;border-color:#58A6FF}
.gap{flex:1}
.btn-aa{padding:5px 14px;background:#238636;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-family:'IBM Plex Sans Arabic',sans-serif;font-weight:600}
.entry{background:#161B22;border:1px solid #21262D;border-radius:8px;margin-bottom:7px;overflow:hidden}
.entry.s-pending{border-right:3px solid #D29922}
.entry.s-auto{border-right:3px solid #1F6FEB}
.entry.s-dup{border-right:3px solid #DA3633}
.entry.s-approved{border-right:3px solid #238636;opacity:0.55}
.erow{display:flex;align-items:center;gap:9px;padding:10px 13px;cursor:pointer}
.edate{font-size:11px;color:#8B949E;font-family:'JetBrains Mono',monospace;min-width:88px}
.etype{font-size:12px;min-width:165px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.edesc{flex:1;font-size:12px;color:#C9D1D9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.esrc{font-size:11px;padding:2px 7px;border-radius:4px;background:#21262D;min-width:68px;text-align:center}
.eamt{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:13px;min-width:90px;text-align:left}
.ebtns{display:flex;gap:4px}
.ba{padding:3px 9px;background:#238636;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;font-weight:600}
.br{padding:3px 8px;background:#21262D;color:#DA3633;border:1px solid #DA3633;border-radius:4px;font-size:11px;cursor:pointer}
.bx{padding:3px 7px;background:#21262D;color:#8B949E;border:none;border-radius:4px;font-size:11px;cursor:pointer}
.tag{font-size:10px;padding:2px 6px;border-radius:4px;font-weight:700;white-space:nowrap}
.tag-dup{background:#DA3633;color:#fff}
.tag-auto{background:#1F6FEB;color:#fff}
.tag-ok{background:#238636;color:#fff}
.ebody{border-top:1px solid #21262D;padding:13px 16px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.fl{display:flex;flex-direction:column;gap:5px}
.flabel{font-size:10px;color:#8B949E;text-transform:uppercase;letter-spacing:0.5px}
.fsel,.finp{background:#0D1117;border:1px solid #30363D;border-radius:6px;color:#E6EDF3;padding:6px 10px;font-size:13px;font-family:'IBM Plex Sans Arabic',sans-serif;width:100%}
.fsel:focus,.finp:focus{outline:none;border-color:#58A6FF}
.finfo{background:#0D1117;border:1px solid #21262D;border-radius:6px;padding:7px 11px;font-size:12px;color:#8B949E}
.flink{color:#58A6FF;font-size:12px;cursor:pointer}
.fwarn{background:#0D1117;border:1px solid #DA3633;border-radius:6px;padding:7px 11px;font-size:12px;color:#DA3633}
.efoot{grid-column:1/-1;display:flex;gap:7px;justify-content:flex-end;padding-top:9px;border-top:1px solid #21262D}
.bla{padding:6px 18px;background:#238636;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;font-family:'IBM Plex Sans Arabic',sans-serif}
.blr{padding:6px 13px;background:transparent;color:#DA3633;border:1px solid #DA3633;border-radius:6px;font-size:13px;cursor:pointer;font-family:'IBM Plex Sans Arabic',sans-serif}
.bls{padding:6px 13px;background:transparent;color:#8B949E;border:1px solid #30363D;border-radius:6px;font-size:13px;cursor:pointer;font-family:'IBM Plex Sans Arabic',sans-serif}

/* Ledger */
.ledger-toolbar{display:flex;gap:8px;margin-bottom:14px;align-items:center}
.search-box{flex:1;max-width:280px;background:#161B22;border:1px solid #30363D;border-radius:6px;padding:6px 12px;color:#E6EDF3;font-size:13px;font-family:'IBM Plex Sans Arabic',sans-serif}
.search-box:focus{outline:none;border-color:#58A6FF}
.ltype-filter{background:#161B22;border:1px solid #30363D;border-radius:6px;padding:6px 10px;color:#E6EDF3;font-size:12px;font-family:'IBM Plex Sans Arabic',sans-serif;cursor:pointer}
.btn-add{padding:6px 16px;background:#21262D;border:1px solid #30363D;border-radius:6px;color:#E6EDF3;font-size:12px;cursor:pointer;font-family:'IBM Plex Sans Arabic',sans-serif}
.btn-add:hover{border-color:#58A6FF;color:#58A6FF}
.ledger-table{width:100%;border-collapse:collapse;font-size:12px}
.ledger-table th{background:#161B22;color:#8B949E;font-weight:600;text-align:right;padding:9px 10px;border-bottom:2px solid #21262D;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;position:sticky;top:52px;z-index:10}
.ledger-table td{padding:8px 10px;border-bottom:1px solid rgba(33,38,45,0.7);vertical-align:middle}
.ledger-table tr:hover td{background:rgba(33,38,45,0.5)}
.td-date{font-family:'JetBrains Mono',monospace;font-size:11px;color:#8B949E;white-space:nowrap}
.td-type{font-size:11px;white-space:nowrap}
.td-desc{color:#C9D1D9;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.td-num{font-family:'JetBrains Mono',monospace;text-align:left;white-space:nowrap;font-size:12px}
.td-bal{font-family:'JetBrains Mono',monospace;font-weight:600;text-align:left;white-space:nowrap;font-size:12px}
.ledger-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}
.lsum-card{background:#161B22;border:1px solid #21262D;border-radius:8px;padding:12px 16px}
.lsum-l{font-size:10px;color:#8B949E;margin-bottom:4px}
.lsum-v{font-size:17px;font-weight:700;font-family:'JetBrains Mono',monospace}

/* Reports */
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
.kpi{background:#161B22;border:1px solid #21262D;border-radius:9px;padding:14px;border-top-width:3px;border-top-style:solid}
.kpi-l{font-size:11px;color:#8B949E;margin-bottom:5px}
.kpi-v{font-size:22px;font-weight:700;font-family:'JetBrains Mono',monospace;letter-spacing:-1px}
.kpi-s{font-size:11px;color:#8B949E;margin-top:4px}
.bal-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px}
.bal-item{background:#161B22;border:1px solid #21262D;border-radius:8px;padding:12px;text-align:center}
.bal-lbl{font-size:10px;color:#8B949E;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px}
.bal-val{font-size:18px;font-weight:700;font-family:'JetBrains Mono',monospace}
.rep-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.rcard{background:#161B22;border:1px solid #21262D;border-radius:9px;padding:15px}
.rcard-t{font-size:10px;font-weight:600;color:#8B949E;text-transform:uppercase;letter-spacing:1px;margin-bottom:11px}
.rrow{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #21262D}
.rrow:last-child{border-bottom:none}
.rrow-l{font-size:12px;color:#C9D1D9}
.rrow-v{font-size:12px;font-family:'JetBrains Mono',monospace;font-weight:600}
.rrow-p{font-size:10px;color:#8B949E;margin-right:5px}
.hl-g{background:rgba(35,134,54,0.07);margin:0 -15px;padding:7px 15px}
.hl-b{background:rgba(31,111,235,0.07);margin:0 -15px;padding:7px 15px}
.hl-p{background:rgba(139,92,246,0.07);margin:0 -15px;padding:7px 15px}
.loan-t{width:100%;border-collapse:collapse}
.loan-t th{font-size:10px;color:#8B949E;text-align:right;padding:6px 0;border-bottom:1px solid #21262D;text-transform:uppercase}
.loan-t td{font-size:11px;padding:8px 0;border-bottom:1px solid rgba(33,38,45,0.6);font-family:'JetBrains Mono',monospace}
.loan-t td:first-child{font-family:'IBM Plex Sans Arabic',sans-serif;color:#C9D1D9;font-size:12px}
.vat-box{background:rgba(210,153,34,0.08);border:1px solid rgba(210,153,34,0.25);border-radius:7px;padding:12px;text-align:center;margin-top:10px}
.vat-l{font-size:11px;color:#D29922;margin-bottom:3px}
.vat-v{font-size:20px;font-weight:700;color:#D29922;font-family:'JetBrains Mono',monospace}
  @media print{.sidebar,.topbar,button{display:none!important}.content{margin-right:0!important}.layout{display:block!important}.page{padding:10px!important}body{background:white!important}}
  /* تحسينات التقارير */
  .report-header{background:linear-gradient(135deg,#1B4F72 0%,#2980B9 100%);padding:20px;border-radius:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
  .report-header-title{font-size:18px;font-weight:700;color:#fff}
  .report-header-sub{font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px}
  .report-header-badge{background:rgba(255,255,255,0.15);border-radius:8px;padding:8px 14px;text-align:center}
  .kpi-trend{font-size:10px;margin-top:3px;display:flex;align-items:center;gap:3px}
  .trend-up{color:#3FB950}
  .trend-down{color:#DA3633}
  .section-divider{height:1px;background:linear-gradient(90deg,transparent,#30363D,transparent);margin:16px 0}

.overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;display:flex;align-items:center;justify-content:center}
.modal{background:#161B22;border:1px solid #30363D;border-radius:12px;padding:24px;width:500px;max-height:85vh;overflow-y:auto}
.modal-title{font-size:15px;font-weight:700;color:#E6EDF3;margin-bottom:18px}
.modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.modal-footer{display:flex;gap:8px;justify-content:flex-end;margin-top:18px;padding-top:14px;border-top:1px solid #21262D}
`;

// ══════════════════════════════════════════
//  ٦. شاشة مراجعة الحركات — من Supabase
// ══════════════════════════════════════════
function ReviewPage({ projectId, period }) {
  const { data, loading, error, reload } = useData(
    "ledger_entries",
    { filter: { "project_id": `eq.${projectId}`, "date_from": period.from, "date_to": period.to, "status": "neq.approved" }, order: "date.desc,created_at.desc" },
    [projectId, period.from, period.to]
  );
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter]     = useState("all");
  const [saving, setSaving]     = useState(false);

  const pending  = data.filter(e=>e.status==="pending").length;
  const dups     = data.filter(e=>e.is_duplicate).length;
  const autoC    = data.filter(e=>e.status==="auto"&&!e.is_duplicate).length;

  const filtered = data.filter(e=>{
    if(filter==="pending") return e.status==="pending";
    if(filter==="dup")     return e.is_duplicate;
    return true;
  });

  const getSource = (e) => e.cash_out>0||e.cash_in>0?"cash":e.bank_out>0||e.bank_in>0?"bank":e.custody_out>0||e.custody_in>0?"custody":"";

  const approve = async (id) => {
    setSaving(true);
    await sb.update("ledger_entries", id, { status:"approved" });
    await reload();
    setSaving(false);
    setExpanded(null);
  };

  const reject = async (id) => {
    setSaving(true);
    await sb.remove("ledger_entries", id);
    await reload();
    setSaving(false);
    setExpanded(null);
  };

  const approveAll = async () => {
    setSaving(true);
    const toApprove = data.filter(e=>e.status==="auto"&&!e.is_duplicate);
    await Promise.all(toApprove.map(e=>sb.update("ledger_entries",e.id,{status:"approved"})));
    await reload();
    setSaving(false);
  };

  const updateEntry = async (id, field, val) => {
    await sb.update("ledger_entries", id, { [field]: val });
    await reload();
  };

  const sc = (e) => e.is_duplicate?"s-dup":e.status==="auto"?"s-auto":"s-pending";

  if (loading) return <div className="page"><div className="loading">⏳ جاري التحميل...</div></div>;

  return (
    <div className="page">
      {error && <div className="error-box">❌ {error}</div>}

      <div className="stats-row">
        {[{c:"#D29922",n:pending,l:"تنتظر تصنيف"},{c:"#1F6FEB",n:autoC,l:"تلقائي"},{c:"#DA3633",n:dups,l:"تكرار"}]
          .map((s,i)=><div key={i} className="stat-card"><div className="stat-dot" style={{background:s.c}}/><div><div className="stat-num">{s.n}</div><div className="stat-lbl">{s.l}</div></div></div>)}
      </div>

      <div className="filter-row">
        {[{v:"all",l:`الكل (${data.length})`},{v:"pending",l:`🟡 تصنيف (${pending})`},{v:"dup",l:`🔴 تكرار (${dups})`}]
          .map(f=><button key={f.v} className={`fb ${filter===f.v?"on":""}`} onClick={()=>setFilter(f.v)}>{f.l}</button>)}
        <div className="gap"/>
        <button className="btn-aa" onClick={approveAll} disabled={saving}>✅ اعتماد التلقائي كله</button>
      </div>

      {filtered.map(e=>(
        <div key={e.id} className={`entry ${sc(e)}`}>
          <div className="erow" onClick={()=>setExpanded(expanded===e.id?null:e.id)}>
            <span className="edate">{e.date}</span>
            <span className="etype">{e.type||<span style={{color:"#D29922"}}>⚠️ بدون تصنيف</span>}</span>
            <span className="edesc">{e.description}</span>
            {e.is_duplicate&&<span className="tag tag-dup">تكرار</span>}
            {e.status==="auto"&&!e.is_duplicate&&<span className="tag tag-auto">تلقائي</span>}
            <span className="esrc" style={{color:srcC[getSource(e)]||"#8B949E"}}>{srcL[getSource(e)]||"—"}</span>
            <span className="eamt">{fmt(e.total_amount)}</span>
            <div className="ebtns" onClick={ev=>ev.stopPropagation()}>
              <button className="ba" onClick={()=>approve(e.id)} disabled={saving}>✓</button>
              <button className="br" onClick={()=>reject(e.id)} disabled={saving}>✕</button>
              <button className="bx">{expanded===e.id?"▲":"▼"}</button>
            </div>
          </div>

          {expanded===e.id&&(
            <div className="ebody">
              <div className="fl"><div className="flabel">نوع الحركة</div>
                <select className="fsel" value={e.type||""} onChange={ev=>updateEntry(e.id,"type",ev.target.value)}>
                  <option value="">— اختر النوع —</option>
                  {TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="fl"><div className="flabel">الوصف</div>
                <input className="finp" value={e.description||""} onChange={ev=>updateEntry(e.id,"description",ev.target.value)}/>
              </div>
              <div className="fl"><div className="flabel">المبلغ الإجمالي</div>
                <div className="finfo">الإجمالي: <strong style={{color:"#E6EDF3"}}>{fmt(e.total_amount)}</strong>{e.vat_amount>0&&<> | ضريبة: <strong style={{color:"#D29922"}}>{fmt(e.vat_amount)}</strong></>}</div>
              </div>
              <div className="fl"><div className="flabel">الفاتورة</div>
                {e.file_url?<a className="flink" href={e.file_url} target="_blank" rel="noreferrer">📎 {e.original_name||"فتح الفاتورة"}</a>:<span style={{color:"#8B949E",fontSize:12}}>لا يوجد</span>}
              </div>
              {e.is_duplicate&&<div className="fl" style={{gridColumn:"1/-1"}}><div className="flabel" style={{color:"#DA3633"}}>⚠️ تكرار محتمل</div><div className="fwarn">نفس التاريخ والمبلغ والوصف موجودان مسبقاً</div></div>}
              <div className="efoot"><button className="bls" onClick={()=>setExpanded(null)}>تجاهل</button><button className="blr" onClick={()=>reject(e.id)} disabled={saving}>حذف</button><button className="bla" onClick={()=>approve(e.id)} disabled={saving}>✓ اعتماد الحركة</button></div>
            </div>
          )}
        </div>
      ))}
      {filtered.length===0&&!loading&&<div style={{textAlign:"center",padding:"50px 20px",color:"#8B949E"}}>✅ لا توجد حركات منتظرة في هذه الفترة</div>}
    </div>
  );
}

// ══════════════════════════════════════════
//  ٧. شاشة الدفتر — من Supabase
// ══════════════════════════════════════════
function LedgerPage({ projectId, period }) {
  const { data, loading, error, reload } = useData(
    "ledger_with_balances",
    { filter: { "project_id": `eq.${projectId}` }, order: "date.asc,created_at.asc" },
    [projectId]
  );
  const [search, setSearch]   = useState("");
  const [typeFilter, setTypeF] = useState("");
  const [showModal, setModal]  = useState(false);
  const [saving, setSaving]    = useState(false);
  const [newRow, setNewRow]    = useState({date:today(),type:"",description:"",cash_out:0,cash_in:0,bank_out:0,bank_in:0,custody_out:0,custody_in:0,vat_amount:0});

  const filtered = useMemo(()=>data.filter(r=>{
    const s = search.toLowerCase();
    return (!s||(r.description||"").toLowerCase().includes(s)||r.type.toLowerCase().includes(s))&&(!typeFilter||r.type===typeFilter);
  }),[data,search,typeFilter]);

  const lastRow = data[data.length-1];

  const addRow = async () => {
    setSaving(true);
    try {
      const total = ["cash_out","cash_in","bank_out","bank_in","custody_out","custody_in"].reduce((s,k)=>s+(Number(newRow[k])||0),0);
      await sb.insert("ledger_entries",{...newRow,project_id:projectId,total_amount:total,status:"approved"});
      await reload();
      setModal(false);
      setNewRow({date:today(),type:"",description:"",cash_out:0,cash_in:0,bank_out:0,bank_in:0,custody_out:0,custody_in:0,vat_amount:0});
    } catch(e){ alert(e.message); }
    finally{ setSaving(false); }
  };

  const colNum = (n,c) => n ? <span style={{color:c}}>{fmt(n)}</span> : <span style={{color:"#2D333B"}}>—</span>;

  if(loading) return <div className="page"><div className="loading">⏳ جاري التحميل...</div></div>;

  return (
    <div className="page">
      {error&&<div className="error-box">❌ {error}</div>}
      <div className="ledger-summary">
        {[{l:"رصيد الصندوق",v:lastRow?.cash_balance||0,c:(lastRow?.cash_balance||0)<0?"#DA3633":"#3FB950"},
          {l:"رصيد البنك",  v:lastRow?.bank_balance||0,c:(lastRow?.bank_balance||0)<0?"#DA3633":"#58A6FF"},
          {l:"رصيد العهدة",v:lastRow?.custody_balance||0,c:(lastRow?.custody_balance||0)<0?"#DA3633":"#D29922"}]
          .map((s,i)=><div key={i} className="lsum-card"><div className="lsum-l">{s.l}</div><div className="lsum-v" style={{color:s.c}}>{fmt(s.v)}</div></div>)}
      </div>
      <div className="ledger-toolbar">
        <input className="search-box" placeholder="🔍 بحث..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="ltype-filter" value={typeFilter} onChange={e=>setTypeF(e.target.value)}>
          <option value="">كل الأنواع</option>
          {TYPES.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <div className="gap"/>
        <button className="btn-add" onClick={()=>setModal(true)}>+ إضافة حركة يدوية</button>
      </div>
      <div style={{overflowX:"auto",borderRadius:8,border:"1px solid #21262D"}}>
        <table className="ledger-table">
          <thead><tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>خ.صندوق</th><th>د.صندوق</th><th>خ.بنك</th><th>د.بنك</th><th>خ.عهدة</th><th>د.عهدة</th><th>رصيد صندوق</th><th>رصيد بنك</th><th>رصيد عهدة</th><th>ضريبة</th></tr></thead>
          <tbody>
            {filtered.map(r=>(
              <tr key={r.id}>
                <td className="td-date">{r.date}</td>
                <td className="td-type">{r.type}</td>
                <td className="td-desc" title={r.description}>{r.description}</td>
                <td className="td-num">{colNum(r.cash_out,"#DA3633")}</td>
                <td className="td-num">{colNum(r.cash_in,"#3FB950")}</td>
                <td className="td-num">{colNum(r.bank_out,"#DA3633")}</td>
                <td className="td-num">{colNum(r.bank_in,"#58A6FF")}</td>
                <td className="td-num">{colNum(r.custody_out,"#DA3633")}</td>
                <td className="td-num">{colNum(r.custody_in,"#D29922")}</td>
                <td className="td-bal" style={{color:(r.cash_balance||0)<0?"#DA3633":"#3FB950"}}>{fmt(r.cash_balance)}</td>
                <td className="td-bal" style={{color:(r.bank_balance||0)<0?"#DA3633":"#58A6FF"}}>{fmt(r.bank_balance)}</td>
                <td className="td-bal" style={{color:(r.custody_balance||0)<0?"#DA3633":"#D29922"}}>{fmt(r.custody_balance)}</td>
                <td className="td-num" style={{color:"#D29922"}}>{r.vat_amount>0?fmt(r.vat_amount):"—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showModal&&(
        <div className="overlay" onClick={()=>setModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">➕ إضافة حركة يدوية</div>
            <div className="modal-grid">
              <div className="fl"><div className="flabel">التاريخ</div><input type="date" className="finp" value={newRow.date} onChange={e=>setNewRow(p=>({...p,date:e.target.value}))}/></div>
              <div className="fl"><div className="flabel">نوع الحركة</div>
                <select className="fsel" value={newRow.type} onChange={e=>setNewRow(p=>({...p,type:e.target.value}))}>
                  <option value="">— اختر —</option>{TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="fl" style={{gridColumn:"1/-1"}}><div className="flabel">الوصف</div><input className="finp" value={newRow.description} onChange={e=>setNewRow(p=>({...p,description:e.target.value}))}/></div>
              {[{f:"cash_out",l:"خرج صندوق"},{f:"cash_in",l:"دخل صندوق"},{f:"bank_out",l:"خرج بنك"},{f:"bank_in",l:"دخل بنك"},{f:"custody_out",l:"خرج عهدة"},{f:"custody_in",l:"دخل عهدة"},{f:"vat_amount",l:"ضريبة ق.م"}]
                .map(({f,l})=><div key={f} className="fl"><div className="flabel">{l}</div><input type="number" className="finp" value={newRow[f]||""} placeholder="0.00" onChange={e=>setNewRow(p=>({...p,[f]:e.target.value}))}/></div>)}
            </div>
            <div className="modal-footer"><button className="bls" onClick={()=>setModal(false)}>إلغاء</button><button className="bla" onClick={addRow} disabled={saving||!newRow.type||!newRow.description}>{saving?"⏳ جاري الحفظ...":"✓ حفظ الحركة"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
//  ٨. شاشة التقارير — من Supabase
// ══════════════════════════════════════════
function ReportsPage({ projectId, period }) {
  const { data: ledger, loading: l1 } = useData("ledger_entries",{filter:{"project_id":`eq.${projectId}`,"date_from":period.from,"date_to":period.to,"status":"eq.approved"}},[projectId,period.from,period.to]);
  const { data: loansData } = useData("loans",{filter:{"project_id":`eq.${projectId}`}},[projectId]);
  const { data: allLedger } = useData("ledger_with_balances",{filter:{"project_id":`eq.${projectId}`},order:"date.asc,created_at.asc"},[projectId]);

  const sum = (types,cols) => ledger.filter(e=>types.some(t=>e.type&&e.type.includes(t))).reduce((s,e)=>s+cols.reduce((a,c)=>a+(Number(e[c])||0),0),0);

  const cashSales  = ledger.filter(e=>e.type==="💵 مبيعات كاش").reduce((s,e)=>s+(e.cash_in||0),0);
  const netSales   = ledger.filter(e=>e.type==="🏦 مبيعات شبكة").reduce((s,e)=>s+(e.bank_in||0),0);
  const total      = cashSales + netSales;
  const opExp      = sum(["مصروفات تشغيلية"],["cash_out","bank_out","custody_out"]);
  const fixedExp   = sum(["مصروفات ثابتة"],["cash_out","bank_out","custody_out"]);
  const loans      = sum(["قسط سيارة","قسط شراء أرض","قرض ١","قرض ٢"],["cash_out","bank_out","custody_out"]);
  const withd      = sum(["مسحوبات سليمان","مسحوبات أم طوبى"],["cash_out","bank_out","custody_out"]);
  const gross      = total - opExp - fixedExp;
  const net        = gross - loans;
  const cashflow   = net - withd;
  const last       = allLedger[allLedger.length-1];
  const vatPurch   = ledger.reduce((s,e)=>s+(e.vat_amount||0),0);
  const p = (v,b) => b>0?`${((v/b)*100).toFixed(1)}%`:"—";

  if(l1) return <div className="page"><div className="loading">⏳ جاري التحميل...</div></div>;

  const KPI = ({label,value,sub,color,icon}) => (
    <div className="kpi" style={{borderTopColor:color,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:12,left:12,fontSize:22,opacity:0.15}}>{icon}</div>
      <div className="kpi-l">{label}</div>
      <div className="kpi-v" style={{color}}>{fmt(value)}</div>
      <div className="kpi-s">{sub}</div>
    </div>
  );

  const SRow = ({label,value,pct,color,bold,indent,negative}) => (
    <div className="rrow" style={{background:bold?"rgba(255,255,255,0.02)":"transparent",paddingRight:indent?28:12,paddingLeft:12}}>
      <span className="rrow-l" style={{fontWeight:bold?"600":"400",color:bold?"#E6EDF3":"#C9D1D9"}}>{label}</span>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        {pct && <span style={{fontSize:10,color:"#8B949E",minWidth:45,textAlign:"left"}}>{pct}</span>}
        <span className="rrow-v" style={{color:color||(bold?"#E6EDF3":"#C9D1D9"),fontSize:bold?14:12,minWidth:90,textAlign:"left"}}>
          {negative ? `(${fmt(Math.abs(value))})` : fmt(value)}
        </span>
      </div>
    </div>
  );

  return (
    <div className="page">
      {/* Header */}
      <div className="report-header">
        <div>
          <div className="report-header-title">📊 التقرير المالي — مزاهر</div>
          <div className="report-header-sub">{period.from} إلى {period.to}</div>
        </div>
        <div style={{display:"flex",gap:12}}>
          {[
            {l:"إجمالي المبيعات",v:fmt(total),c:"#00D4AA"},
            {l:"صافي الربح",     v:fmt(net),  c:net>=0?"#3FB950":"#DA3633"},
          ].map((b,i)=>(
            <div key={i} className="report-header-badge">
              <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",marginBottom:2}}>{b.l}</div>
              <div style={{fontSize:15,fontWeight:700,color:b.c,fontFamily:"JetBrains Mono"}}>{b.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpis" style={{marginBottom:20}}>
        <KPI label="💰 إجمالي المبيعات" value={total}     sub={`كاش ${fmt(cashSales)}`}      color="#00D4AA" icon="💰"/>
        <KPI label="📦 مجمل الربح"      value={gross}     sub={`${p(gross,total)} من المبيعات`} color="#D29922" icon="📦"/>
        <KPI label="📈 صافي الربح"      value={net}       sub={`هامش ${p(net,total)}`}          color="#58A6FF" icon="📈"/>
        <KPI label="💸 صافي التدفق"     value={cashflow}  sub="بعد المسحوبات"                   color="#8B5CF6" icon="💸"/>
      </div>

      {/* الأرصدة */}
      <div className="bal-grid" style={{marginBottom:20}}>
        {[{l:"🏧 الصندوق",v:last?.cash_balance||0,c:"#3FB950"},{l:"🏦 البنك",v:last?.bank_balance||0,c:(last?.bank_balance||0)<0?"#DA3633":"#58A6FF"},{l:"👤 العهدة",v:last?.custody_balance||0,c:"#D29922"}]
          .map((b,i)=>(
            <div key={i} className="bal-item" style={{background:"linear-gradient(135deg,#161B22,#1E2D45)"}}>
              <div className="bal-lbl">{b.l}</div>
              <div className="bal-val" style={{color:b.c}}>{fmt(b.v)}</div>
            </div>
          ))}
      </div>

      <div className="rep-grid">
        {/* المبيعات والمصروفات */}
        <div className="rcard">
          <div className="rcard-t" style={{color:"#00D4AA"}}>💰 المبيعات</div>
          <SRow label="مبيعات كاش"    value={cashSales} pct={p(cashSales,total)} color="#00D4AA" indent/>
          <SRow label="مبيعات شبكة"   value={netSales}  pct={p(netSales,total)}  color="#58A6FF" indent/>
          <div className="section-divider"/>
          <SRow label="إجمالي المبيعات" value={total} color="#00D4AA" bold/>

          <div style={{marginTop:16}}>
            <div className="rcard-t" style={{color:"#DA3633"}}>📦 المصروفات</div>
            <SRow label="تشغيلية" value={opExp}    pct={p(opExp,total)}   color="#DA3633" indent negative/>
            <SRow label="ثابتة"   value={fixedExp} pct={p(fixedExp,total)} color="#DA3633" indent negative/>
            <div className="section-divider"/>
            <SRow label="إجمالي المصروفات" value={opExp+fixedExp} color="#DA3633" bold negative/>
          </div>
        </div>

        {/* الربحية */}
        <div className="rcard">
          <div className="rcard-t" style={{color:"#D29922"}}>📊 الربحية</div>
          <div style={{background:"rgba(210,153,34,0.08)",margin:"0 -15px",padding:"10px 15px",borderRadius:0}}>
            <SRow label="مجمل الربح" value={gross} color="#D29922" bold pct={p(gross,total)}/>
          </div>
          <SRow label="(-) أقساط القروض" value={loans} color="#DA3633" indent negative pct={p(loans,total)}/>
          <div style={{background:"rgba(88,166,255,0.08)",margin:"0 -15px",padding:"10px 15px"}}>
            <SRow label="صافي الربح" value={net} color="#58A6FF" bold pct={p(net,total)}/>
          </div>
          <SRow label="(-) مسحوبات الشركاء" value={withd} color="#DA3633" indent negative pct={p(withd,total)}/>
          <div style={{background:"rgba(139,92,246,0.08)",margin:"0 -15px",padding:"10px 15px",borderRadius:"0 0 8px 8px"}}>
            <SRow label="صافي التدفق النقدي" value={cashflow} color="#8B5CF6" bold pct={p(cashflow,total)}/>
          </div>

          {/* المؤشرات */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:14}}>
            {[{l:"هامش الربح",v:`${p(net,total)}`,c:"#58A6FF"},{l:"تغطية الديون",v:loans>0?`${((net+loans)/loans).toFixed(1)}x`:"—",c:"#D29922"}]
              .map((k,i)=>(
                <div key={i} style={{background:"#0D1117",border:"1px solid #21262D",borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#8B949E"}}>{k.l}</div>
                  <div style={{fontSize:15,fontWeight:700,color:k.c,fontFamily:"JetBrains Mono"}}>{k.v}</div>
                </div>
              ))}
          </div>
        </div>

        {/* القروض والمسحوبات والضريبة */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div className="rcard">
            <div className="rcard-t" style={{color:"#D29922"}}>🏛️ القروض</div>
            <table className="loan-t">
              <thead><tr><th>القرض</th><th style={{textAlign:"center"}}>المسدد</th><th style={{textAlign:"left",color:"#D29922"}}>المتبقي</th></tr></thead>
              <tbody>{loansData.filter(l=>l.original_amount>0).map((l,i)=>{
                const paid = allLedger.filter(e=>e.type===`💳 ${l.name}`).reduce((s,e)=>s+(e.cash_out||0)+(e.bank_out||0)+(e.custody_out||0),0);
                const rem  = Math.max(0,(l.original_amount||0)-paid);
                const pct2 = l.original_amount>0?((paid/l.original_amount)*100).toFixed(0):0;
                return (
                  <tr key={i}>
                    <td>{l.name}</td>
                    <td style={{textAlign:"center"}}>
                      <div style={{color:"#8B949E"}}>{fmt(paid)}</div>
                      <div style={{fontSize:10,color:"#3FB950"}}>{pct2}%</div>
                    </td>
                    <td style={{textAlign:"left",color:"#D29922",fontWeight:600}}>{fmt(rem)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>

          <div className="rcard">
            <div className="rcard-t" style={{color:"#8B5CF6"}}>💼 المسحوبات</div>
            <SRow label="سليمان"  value={sum(["مسحوبات سليمان"],["cash_out","bank_out","custody_out"])} pct={p(sum(["مسحوبات سليمان"],["cash_out","bank_out","custody_out"]),total)}/>
            <SRow label="أم طوبى" value={sum(["مسحوبات أم طوبى"],["cash_out","bank_out","custody_out"])} pct={p(sum(["مسحوبات أم طوبى"],["cash_out","bank_out","custody_out"]),total)}/>
            <div className="section-divider"/>
            <SRow label="الإجمالي" value={withd} color="#8B5CF6" bold pct={p(withd,total)}/>
          </div>

          <div className="rcard">
            <div className="rcard-t" style={{color:"#D29922"}}>🧾 ضريبة القيمة المضافة</div>
            <SRow label="ضريبة المبيعات 15%" value={total*0.15}/>
            <SRow label="ضريبة المشتريات"    value={vatPurch} color="#8B949E"/>
            <div className="section-divider"/>
            <div className="vat-box">
              <div className="vat-l">💳 الضريبة المستحقة للدفع</div>
              <div className="vat-v">{fmt(total*0.15-vatPurch)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
// ══════════════════════════════════════════
//  ٩. التطبيق الرئيسي
// ══════════════════════════════════════════

// ══════════════════════════════════════════
//  قائمة الدخل
// ══════════════════════════════════════════
function IncomeStatement({ projectId, period }) {
  const { data: ledger, loading } = useData("ledger_entries",
    { filter: { "project_id": `eq.${projectId}`, "date_from": period.from, "date_to": period.to, "status": "eq.approved" }},
    [projectId, period.from, period.to]);

  if (loading) return <div className="page"><div className="loading">جاري التحميل...</div></div>;

  const sumT = (types, cols) => ledger.filter(e => types.some(t => e.type && e.type.includes(t)))
    .reduce((s,e) => s + cols.reduce((a,c) => a + (Number(e[c])||0), 0), 0);

  const cashSales = ledger.filter(e=>e.type==="💵 مبيعات كاش").reduce((s,e)=>s+(e.cash_in||0),0);
  const netSales  = ledger.filter(e=>e.type==="🏦 مبيعات شبكة").reduce((s,e)=>s+(e.bank_in||0),0);
  const total     = cashSales + netSales;
  const cogs      = sumT(["مصروفات تشغيلية"], ["cash_out","bank_out","custody_out"]);
  const fixed     = sumT(["مصروفات ثابتة"],   ["cash_out","bank_out","custody_out"]);
  const loans     = sumT(["قسط سيارة","قسط شراء أرض","قرض ١","قرض ٢"], ["cash_out","bank_out","custody_out"]);
  const withd     = sumT(["مسحوبات سليمان","مسحوبات أم طوبى"], ["cash_out","bank_out","custody_out"]);
  const gross     = total - cogs;
  const opProfit  = gross - fixed;
  const netProfit = opProfit - loans;
  const cashflow  = netProfit - withd;
  const p = v => total > 0 ? `${((v/total)*100).toFixed(1)}%` : "—";

  const Row = ({label, value, color, bold, indent}) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
      padding:"9px 16px",paddingRight:indent?32:16,borderBottom:"1px solid #21262D",
      background:bold?"rgba(255,255,255,0.03)":"transparent"}}>
      <span style={{fontSize:13,color:bold?"#E6EDF3":"#C9D1D9",fontWeight:bold?"600":"400"}}>{label}</span>
      <div style={{display:"flex",gap:24,alignItems:"center"}}>
        <span style={{fontSize:11,color:"#8B949E",minWidth:50,textAlign:"left"}}>{p(value)}</span>
        <span style={{fontFamily:"JetBrains Mono",fontSize:13,fontWeight:bold?"700":"500",
          color:color||(value>=0?"#E6EDF3":"#DA3633"),minWidth:100,textAlign:"left"}}>{fmt(value)}</span>
      </div>
    </div>
  );

  const Sec = ({title,bg}) => (
    <div style={{background:bg||"#1A252F",padding:"7px 16px"}}>
      <span style={{fontSize:10,fontWeight:700,color:"#FFF",textTransform:"uppercase",letterSpacing:1}}>{title}</span>
    </div>
  );

  return (
    <div className="page">
      <div style={{maxWidth:640,background:"#161B22",borderRadius:10,overflow:"hidden",border:"1px solid #21262D"}}>
        <div style={{background:"#1B4F72",padding:"14px 16px",display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:15,fontWeight:700,color:"#FFF"}}>📈 قائمة الدخل</span>
          <span style={{fontSize:11,color:"rgba(255,255,255,0.6)",fontFamily:"JetBrains Mono"}}>{period.from} — {period.to}</span>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:24,padding:"6px 16px",background:"#21262D",fontSize:10,color:"#8B949E",fontWeight:600}}>
          <span style={{minWidth:50}}>% من المبيعات</span><span style={{minWidth:100}}>المبلغ</span>
        </div>
        <Sec title="الإيرادات" bg="#0D4F3C"/>
        <Row label="مبيعات كاش"  value={cashSales} color="#00D4AA" indent/>
        <Row label="مبيعات شبكة" value={netSales}  color="#58A6FF" indent/>
        <Row label="إجمالي الإيرادات" value={total} color="#00D4AA" bold/>
        <Sec title="تكلفة المبيعات" bg="#4A1010"/>
        <Row label="(-) مصروفات تشغيلية" value={-cogs}  color="#DA3633" indent/>
        <Row label="مجمل الربح" value={gross} color={gross>=0?"#3FB950":"#DA3633"} bold/>
        <Sec title="المصروفات التشغيلية" bg="#1A2F4A"/>
        <Row label="(-) مصروفات ثابتة" value={-fixed} color="#DA3633" indent/>
        <Row label="الربح التشغيلي" value={opProfit} color={opProfit>=0?"#58A6FF":"#DA3633"} bold/>
        <Sec title="التمويل" bg="#2D1B4E"/>
        <Row label="(-) أقساط القروض" value={-loans} color="#DA3633" indent/>
        <Row label="صافي الربح" value={netProfit} color={netProfit>=0?"#8B5CF6":"#DA3633"} bold/>
        <Sec title="توزيع الأرباح" bg="#1A2020"/>
        <Row label="(-) مسحوبات الشركاء" value={-withd} color="#DA3633" indent/>
        <Row label="صافي التدفق النقدي" value={cashflow} color={cashflow>=0?"#D29922":"#DA3633"} bold/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,padding:14,background:"#0D1117"}}>
          {[{l:"هامش الربح الإجمالي",v:total>0?(gross/total*100):0,c:"#3FB950"},
            {l:"هامش صافي الربح",v:total>0?(netProfit/total*100):0,c:"#8B5CF6"},
            {l:"نسبة تغطية الديون",v:loans>0?((netProfit+loans)/loans):0,c:"#D29922",x:"x"}]
            .map((k,i)=>(
              <div key={i} style={{background:"#161B22",border:"1px solid #21262D",borderRadius:8,padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:10,color:"#8B949E",marginBottom:4}}>{k.l}</div>
                <div style={{fontSize:15,fontWeight:700,color:k.c,fontFamily:"JetBrains Mono"}}>{k.v.toFixed(1)}{k.x||"%"}</div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  الميزانية العمومية
// ══════════════════════════════════════════
function BalanceSheet({ projectId }) {
  const { data: ledger } = useData("ledger_with_balances",
    { filter: { "project_id": `eq.${projectId}` }, order: "date.asc,created_at.asc" }, [projectId]);
  const { data: loans }  = useData("loans",
    { filter: { "project_id": `eq.${projectId}` } }, [projectId]);

  const last    = ledger[ledger.length-1];
  const cashBal = last?.cash_balance    || 0;
  const bankBal = last?.bank_balance    || 0;
  const custBal = last?.custody_balance || 0;
  const totalAssets = Math.max(0,cashBal)+Math.max(0,bankBal)+Math.max(0,custBal);

  const loanPaid = name => ledger.filter(e=>e.type===`💳 ${name}`)
    .reduce((s,e)=>s+(e.cash_out||0)+(e.bank_out||0)+(e.custody_out||0),0);

  const totalLiab = loans.reduce((s,l)=>s+Math.max(0,(l.original_amount||0)-loanPaid(l.name)),0);
  const equity    = totalAssets - totalLiab;
  const balanced  = Math.abs(totalAssets-(totalLiab+equity)) < 1;

  const Row = ({label,value,color,bold,indent}) => (
    <div style={{display:"flex",justifyContent:"space-between",padding:"8px 16px",
      paddingRight:indent?32:16,borderBottom:"1px solid #21262D",background:bold?"rgba(255,255,255,0.03)":"transparent"}}>
      <span style={{fontSize:13,color:bold?"#E6EDF3":"#C9D1D9",fontWeight:bold?"600":"400"}}>{label}</span>
      <span style={{fontFamily:"JetBrains Mono",fontSize:13,fontWeight:bold?"700":"500",
        color:color||(value>=0?"#E6EDF3":"#DA3633")}}>{fmt(value)}</span>
    </div>
  );
  const Sec = ({title,bg}) => (
    <div style={{background:bg||"#1A252F",padding:"7px 16px"}}>
      <span style={{fontSize:10,fontWeight:700,color:"#FFF",textTransform:"uppercase",letterSpacing:1}}>{title}</span>
    </div>
  );

  return (
    <div className="page">
      <div style={{maxWidth:520,background:"#161B22",borderRadius:10,overflow:"hidden",border:"1px solid #21262D"}}>
        <div style={{background:"#1B4F72",padding:"14px 16px"}}>
          <span style={{fontSize:15,fontWeight:700,color:"#FFF"}}>⚖️ الميزانية العمومية</span>
        </div>
        <Sec title="الأصول المتداولة" bg="#0D4F3C"/>
        <Row label="نقد في الصندوق" value={cashBal} color="#3FB950" indent/>
        <Row label="رصيد البنك"      value={bankBal} color={bankBal>=0?"#58A6FF":"#DA3633"} indent/>
        <Row label="رصيد العهدة"     value={custBal} color="#D29922" indent/>
        <Row label="إجمالي الأصول"  value={totalAssets} color="#3FB950" bold/>
        <Sec title="الالتزامات — القروض" bg="#4A1010"/>
        {loans.filter(l=>l.original_amount>0).map((l,i)=>(
          <Row key={i} label={l.name} value={Math.max(0,(l.original_amount||0)-loanPaid(l.name))} color="#DA3633" indent/>
        ))}
        <Row label="إجمالي الالتزامات" value={totalLiab} color="#DA3633" bold/>
        <Sec title="حقوق الملكية" bg="#2D1B4E"/>
        <Row label="صافي حقوق الملكية" value={equity} color={equity>=0?"#8B5CF6":"#DA3633"} bold/>
        <div style={{padding:"12px 16px",background:balanced?"rgba(63,185,80,0.1)":"rgba(218,54,51,0.1)",
          display:"flex",justifyContent:"center",borderTop:"2px solid #21262D"}}>
          <span style={{fontSize:13,fontWeight:700,color:balanced?"#3FB950":"#DA3633"}}>
            {balanced?"✅ الميزانية متوازنة":"❌ الميزانية غير متوازنة"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  ميزان المراجعة
// ══════════════════════════════════════════
function TrialBalance({ projectId, period }) {
  const { data: ledger, loading } = useData("ledger_entries",
    { filter: { "project_id": `eq.${projectId}`, "date_from": period.from, "date_to": period.to, "status": "eq.approved" }},
    [projectId, period.from, period.to]);

  if (loading) return <div className="page"><div className="loading">جاري التحميل...</div></div>;

  const accounts = {};
  const add = (name, d, c) => {
    if (!accounts[name]) accounts[name] = {debit:0,credit:0};
    accounts[name].debit  += d||0;
    accounts[name].credit += c||0;
  };

  ledger.forEach(e=>{
    if (e.cash_out)    add("الصندوق", 0, e.cash_out);
    if (e.cash_in)     add("الصندوق", e.cash_in, 0);
    if (e.bank_out)    add("البنك", 0, e.bank_out);
    if (e.bank_in)     add("البنك", e.bank_in, 0);
    if (e.custody_out) add("العهدة", 0, e.custody_out);
    if (e.custody_in)  add("العهدة", e.custody_in, 0);
    const t   = e.type||"";
    const amt = (e.cash_out||0)+(e.bank_out||0)+(e.custody_out||0);
    const amtIn=(e.cash_in||0)+(e.bank_in||0)+(e.custody_in||0);
    if(t.includes("مبيعات كاش"))       add("إيرادات كاش",0,amtIn);
    if(t.includes("مبيعات شبكة"))      add("إيرادات شبكة",0,amtIn);
    if(t.includes("مصروفات تشغيلية"))  add("مصروفات تشغيلية",amt,0);
    if(t.includes("مصروفات ثابتة"))    add("مصروفات ثابتة",amt,0);
    if(t.includes("قسط")||t.includes("قرض")) add("سداد القروض",amt,0);
    if(t.includes("مسحوبات"))          add("مسحوبات الشركاء",amt,0);
    if(t.includes("ضريبة"))            add("ضريبة القيمة المضافة",amt,0);
  });

  const entries  = Object.entries(accounts);
  const totalD   = entries.reduce((s,[,v])=>s+v.debit,0);
  const totalC   = entries.reduce((s,[,v])=>s+v.credit,0);
  const balanced = Math.abs(totalD-totalC)<1;

  return (
    <div className="page">
      <div style={{maxWidth:680,background:"#161B22",borderRadius:10,overflow:"hidden",border:"1px solid #21262D"}}>
        <div style={{background:"#1B4F72",padding:"14px 16px",display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:15,fontWeight:700,color:"#FFF"}}>✅ ميزان المراجعة</span>
          <span style={{fontSize:11,color:"rgba(255,255,255,0.6)",fontFamily:"JetBrains Mono"}}>{period.from} — {period.to}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",padding:"7px 16px",
          background:"#21262D",fontSize:10,color:"#8B949E",fontWeight:600,textTransform:"uppercase"}}>
          <span>الحساب</span><span>مدين</span><span>دائن</span><span>الرصيد</span>
        </div>
        {entries.map(([name,v],i)=>{
          const bal=v.debit-v.credit;
          return (
            <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",
              padding:"8px 16px",borderBottom:"1px solid #21262D",
              background:i%2===0?"#161B22":"rgba(255,255,255,0.01)"}}>
              <span style={{fontSize:12,color:"#C9D1D9"}}>{name}</span>
              <span style={{fontFamily:"JetBrains Mono",fontSize:12,color:"#58A6FF"}}>{fmt(v.debit)}</span>
              <span style={{fontFamily:"JetBrains Mono",fontSize:12,color:"#DA3633"}}>{fmt(v.credit)}</span>
              <span style={{fontFamily:"JetBrains Mono",fontSize:12,fontWeight:600,color:bal>=0?"#3FB950":"#DA3633"}}>{fmt(bal)}</span>
            </div>
          );
        })}
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",padding:"10px 16px",background:"#21262D",fontWeight:700}}>
          <span style={{fontSize:12,color:"#FFF"}}>الإجمالي</span>
          <span style={{fontFamily:"JetBrains Mono",fontSize:12,color:"#58A6FF"}}>{fmt(totalD)}</span>
          <span style={{fontFamily:"JetBrains Mono",fontSize:12,color:"#DA3633"}}>{fmt(totalC)}</span>
          <span style={{fontFamily:"JetBrains Mono",fontSize:12,color:balanced?"#3FB950":"#DA3633"}}>{fmt(totalD-totalC)}</span>
        </div>
        <div style={{padding:"13px 16px",background:balanced?"rgba(63,185,80,0.1)":"rgba(218,54,51,0.1)",
          textAlign:"center",borderTop:"2px solid #21262D"}}>
          <span style={{fontSize:13,fontWeight:700,color:balanced?"#3FB950":"#DA3633"}}>
            {balanced?"✅ ميزان المراجعة متوازن — لا توجد أخطاء إدخال":`❌ غير متوازن — فرق: ${fmt(totalD-totalC)} ريال`}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage]       = useState("review");
  const [projectId, setProj]  = useState(null);
  const [period, setPeriod]   = useState({ from: new Date().toISOString().slice(0,8)+"01", to: new Date().toISOString().slice(0,10) });
  const [pendingCount, setPending] = useState(0);
  const [menuOpen, setMenu]   = useState(false);

  // استخدام PROJECT_ID مباشرة
  useEffect(()=>{
    setProj(PROJECT_ID);
  },[]);

  // تحديث عدد الحركات المنتظرة
  useEffect(()=>{
    if(!projectId) return;
    sb.query("ledger_entries",{filter:{"project_id":`eq.${projectId}`,"status":"neq.approved"},select:"id"})
      .then(res=>setPending(res.length));
  },[projectId,page]);

  const NAV = [
    {id:"review",   icon:"📋", label:"مراجعة الحركات",    badge:pendingCount},
    {id:"ledger",   icon:"📒", label:"الدفتر الأمريكي",   badge:0},
    {id:"reports",  icon:"📊", label:"التقارير",           badge:0},
    {id:"income",   icon:"📈", label:"قائمة الدخل",       badge:0},
    {id:"balance",  icon:"⚖️", label:"الميزانية العمومية", badge:0},
    {id:"trial",    icon:"✅", label:"ميزان المراجعة",     badge:0},
  ];

  if(!projectId) return (
    <>
      <style>{CSS}</style>
      <div className="loading" style={{paddingTop:100}}>⏳ جاري الاتصال بقاعدة البيانات...</div>
    </>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="layout">
        <div className={`overlay-bg ${menuOpen?"show":""}`} onClick={()=>setMenu(false)}/>
        <aside className={`sidebar ${menuOpen?"open":""}`}>
          <div className="brand" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div className="brand-name">⚙️ مزاهر</div><div className="brand-role">لوحة المحاسب</div></div>
            <button className="mobile-menu-btn" style={{display:"flex"}} onClick={()=>setMenu(false)}>✕</button>
          </div>
          {NAV.map(n=>(
            <div key={n.id} className={`nav-item ${page===n.id?"active":""}`} onClick={()=>{setPage(n.id);setMenu(false);}}>
              <span className="nav-icon">{n.icon}</span>
              <span>{n.label}</span>
              {n.badge>0&&<span className="nav-badge">{n.badge}</span>}
            </div>
          ))}
          <div className="sidebar-bottom">
            <button className="sync-btn" onClick={()=>alert("المزامنة تشتغل تلقائياً كل 10 دقائق من Google Apps Script")}>🔄 مزامنة Drive</button>
          </div>
        </aside>
        <div className="content">
          <div className="topbar">
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <button className="mobile-menu-btn" onClick={()=>setMenu(true)}>☰</button>
              <div className="page-title">{NAV.find(n=>n.id===page)?.label}</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <div className="period-sel">
                <span style={{fontSize:11,color:"#8B949E"}}>من</span>
                <input className="pinput" value={period.from} onChange={e=>setPeriod(p=>({...p,from:e.target.value}))}/>
                <span style={{fontSize:11,color:"#8B949E"}}>إلى</span>
                <input className="pinput" value={period.to}   onChange={e=>setPeriod(p=>({...p,to:e.target.value}))}/>
              </div>
              {["reports","income","balance","trial"].includes(page) && (
                <button onClick={()=>window.print()} style={{padding:"5px 12px",background:"#238636",color:"#fff",border:"none",borderRadius:6,fontSize:12,cursor:"pointer",fontFamily:"IBM Plex Sans Arabic"}}>
                  🖨️ طباعة / PDF
                </button>
              )}
            </div>
          </div>
          {page==="review"  && <ReviewPage       projectId={projectId} period={period}/>}
          {page==="ledger"  && <LedgerPage       projectId={projectId} period={period}/>}
          {page==="reports" && <ReportsPage      projectId={projectId} period={period}/>}
          {page==="income"  && <IncomeStatement  projectId={projectId} period={period}/>}
          {page==="balance" && <BalanceSheet     projectId={projectId} period={period}/>}
          {page==="trial"   && <TrialBalance     projectId={projectId} period={period}/>}
        </div>
      </div>
    </>
  );
}
