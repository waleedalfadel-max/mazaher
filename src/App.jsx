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
.sidebar{width:210px;background:#161B22;border-left:1px solid #21262D;padding:16px 0;position:fixed;top:0;right:0;bottom:0;display:flex;flex-direction:column;z-index:50}
.content{margin-right:210px;flex:1}
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
  const { data: ledger, loading: l1 } = useData("ledger_entries",{filter:{"project_id":`eq.${projectId}`,"date":`gte.${period.from}&date=lte.${period.to}`,"status":"eq.approved"}},[projectId,period.from,period.to]);
  const { data: salesData, loading: l2 } = useData("sales",{filter:{"project_id":`eq.${projectId}`,"date":`gte.${period.from}&date=lte.${period.to}`}},[projectId,period.from,period.to]);
  const { data: loansData } = useData("loans",{filter:{"project_id":`eq.${projectId}`}},[projectId]);
  const { data: allLedger } = useData("ledger_with_balances",{filter:{"project_id":`eq.${projectId}`},order:"date.asc,created_at.asc"},[projectId]);

  const sum = (type,cols) => ledger.filter(e=>e.type===type).reduce((s,e)=>s+cols.reduce((a,c)=>a+(e[c]||0),0),0);
  const sumTypes = (types,cols) => types.reduce((s,t)=>s+sum(t,cols),0);

  // المبيعات من الدفتر مباشرة
  const cashSales  = ledger.filter(e=>e.type==="💵 مبيعات كاش").reduce((s,e)=>s+(e.cash_in||0),0);
  const netSales   = ledger.filter(e=>e.type==="🏦 مبيعات شبكة").reduce((s,e)=>s+(e.bank_in||0),0);
  const totalSales = cashSales + netSales;
  const opExp        = sum("🛒 مصروفات تشغيلية",["cash_out","bank_out","custody_out"]);
  const fixedExp     = sum("💰 مصروفات ثابتة",["cash_out","bank_out","custody_out"]);
  const totalExp     = opExp + fixedExp;
  const totalLoans   = sumTypes(["💳 قسط سيارة","💳 قسط شراء أرض","💳 قرض ١","💳 قرض ٢"],["cash_out","bank_out","custody_out"]);
  const totalWithd   = sumTypes(["💼 مسحوبات سليمان","💼 مسحوبات أم طوبى"],["cash_out","bank_out","custody_out"]);
  const gross        = totalSales - totalExp;
  const net          = gross - totalLoans;
  const cashflow     = net - totalWithd;
  const lastRow      = allLedger[allLedger.length-1];
  const vatPurchases = ledger.reduce((s,e)=>s+(e.vat_amount||0),0);

  const loanPaid = (name) => sumTypes([name],["cash_out","bank_out","custody_out"]) + (allLedger.filter(e=>e.type===name).reduce((s,e)=>s+(e.cash_out||0)+(e.bank_out||0)+(e.custody_out||0),0));

  if(l1||l2) return <div className="page"><div className="loading">⏳ جاري التحميل...</div></div>;

  return (
    <div className="page">
      <div className="kpis">
        {[{l:"إجمالي المبيعات",v:totalSales,s:`كاش ${fmt(cashSales)}`,c:"#00D4AA"},
          {l:"مجمل الربح",v:gross,s:pct(gross,totalSales)+" من المبيعات",c:"#D29922"},
          {l:"صافي الربح",v:net,s:`هامش ${pct(net,totalSales)}`,c:"#58A6FF"},
          {l:"صافي التدفق",v:cashflow,s:"بعد المسحوبات",c:"#8B5CF6"}]
          .map((k,i)=><div key={i} className="kpi" style={{borderTopColor:k.c}}><div className="kpi-l">{k.l}</div><div className="kpi-v" style={{color:k.c}}>{fmt(k.v)}</div><div className="kpi-s">{k.s}</div></div>)}
      </div>
      <div className="bal-grid">
        {[{l:"🏧 الصندوق",v:lastRow?.cash_balance||0,c:(lastRow?.cash_balance||0)<0?"#DA3633":"#3FB950"},
          {l:"🏦 البنك",  v:lastRow?.bank_balance||0, c:(lastRow?.bank_balance||0)<0?"#DA3633":"#58A6FF"},
          {l:"👤 العهدة", v:lastRow?.custody_balance||0,c:(lastRow?.custody_balance||0)<0?"#DA3633":"#D29922"}]
          .map((b,i)=><div key={i} className="bal-item"><div className="bal-lbl">{b.l}</div><div className="bal-val" style={{color:b.c}}>{fmt(b.v)}</div></div>)}
      </div>
      <div className="rep-grid">
        <div className="rcard">
          <div className="rcard-t">💰 المبيعات</div>
          <div className="rrow"><span className="rrow-l">كاش</span><div><span className="rrow-p">{pct(cashSales,totalSales)}</span><span className="rrow-v" style={{color:"#00D4AA"}}>{fmt(cashSales)}</span></div></div>
          <div className="rrow"><span className="rrow-l">شبكة</span><div><span className="rrow-p">{pct(netSales,totalSales)}</span><span className="rrow-v" style={{color:"#58A6FF"}}>{fmt(netSales)}</span></div></div>
          <div className="rrow"><span className="rrow-l" style={{fontWeight:600}}>الإجمالي</span><span className="rrow-v" style={{color:"#00D4AA",fontSize:14}}>{fmt(totalSales)}</span></div>
          <div style={{marginTop:12,borderTop:"1px solid #21262D",paddingTop:11}}>
            <div className="rcard-t">📦 المصروفات</div>
            <div className="rrow"><span className="rrow-l">تشغيلية</span><div><span className="rrow-p">{pct(opExp,totalSales)}</span><span className="rrow-v">{fmt(opExp)}</span></div></div>
            <div className="rrow"><span className="rrow-l">ثابتة</span><div><span className="rrow-p">{pct(fixedExp,totalSales)}</span><span className="rrow-v">{fmt(fixedExp)}</span></div></div>
            <div className="rrow"><span className="rrow-l" style={{fontWeight:600}}>الإجمالي</span><span className="rrow-v" style={{color:"#DA3633",fontSize:14}}>{fmt(totalExp)}</span></div>
          </div>
        </div>
        <div className="rcard">
          <div className="rcard-t">📊 الربحية</div>
          <div className="rrow hl-g"><span className="rrow-l">مجمل الربح</span><span className="rrow-v" style={{color:"#D29922"}}>{fmt(gross)}</span></div>
          <div className="rrow"><span className="rrow-l" style={{color:"#8B949E"}}>(-) الأقساط</span><span className="rrow-v" style={{color:"#DA3633"}}>({fmt(totalLoans)})</span></div>
          <div className="rrow hl-b"><span className="rrow-l">صافي الربح</span><span className="rrow-v" style={{color:"#58A6FF"}}>{fmt(net)}</span></div>
          <div className="rrow"><span className="rrow-l" style={{color:"#8B949E"}}>(-) المسحوبات</span><span className="rrow-v" style={{color:"#8B949E"}}>({fmt(totalWithd)})</span></div>
          <div className="rrow hl-p"><span className="rrow-l" style={{fontWeight:600}}>صافي التدفق</span><span className="rrow-v" style={{color:"#8B5CF6",fontSize:14}}>{fmt(cashflow)}</span></div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div className="rcard">
            <div className="rcard-t">🏛️ القروض الإجمالي</div>
            <table className="loan-t">
              <thead><tr><th>القرض</th><th style={{textAlign:"center"}}>المسدد</th><th style={{textAlign:"left"}}>المتبقي</th></tr></thead>
              <tbody>{loansData.filter(l=>l.original_amount>0).map((l,i)=>{
                const paid = allLedger.filter(e=>e.type===`💳 ${l.name}`).reduce((s,e)=>s+(e.cash_out||0)+(e.bank_out||0)+(e.custody_out||0),0);
                const rem  = l.original_amount - paid;
                return <tr key={i}><td>{l.name}</td><td style={{textAlign:"center",color:"#8B949E"}}>{fmt(paid)}</td><td style={{textAlign:"left",color:"#D29922",fontWeight:600}}>{fmt(rem)}</td></tr>;
              })}</tbody>
            </table>
          </div>
          <div className="rcard">
            <div className="rcard-t">💼 المسحوبات</div>
            <div className="rrow"><span className="rrow-l">سليمان</span><span className="rrow-v">{fmt(sum("💼 مسحوبات سليمان",["cash_out","bank_out","custody_out"]))}</span></div>
            <div className="rrow"><span className="rrow-l">أم طوبى</span><span className="rrow-v">{fmt(sum("💼 مسحوبات أم طوبى",["cash_out","bank_out","custody_out"]))}</span></div>
            <div className="rrow"><span className="rrow-l" style={{fontWeight:600}}>الإجمالي</span><span className="rrow-v" style={{color:"#8B5CF6"}}>{fmt(totalWithd)}</span></div>
          </div>
          <div className="rcard">
            <div className="rcard-t">🧾 ضريبة القيمة المضافة</div>
            <div className="rrow"><span className="rrow-l">ضريبة المبيعات 15%</span><span className="rrow-v">{fmt(totalSales*0.15)}</span></div>
            <div className="rrow"><span className="rrow-l">ضريبة المشتريات</span><span className="rrow-v" style={{color:"#8B949E"}}>{fmt(vatPurchases)}</span></div>
            <div className="vat-box"><div className="vat-l">المستحقة للدفع</div><div className="vat-v">{fmt(totalSales*0.15-vatPurchases)}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  ٩. التطبيق الرئيسي
// ══════════════════════════════════════════
export default function App() {
  const [page, setPage]       = useState("review");
  const [projectId, setProj]  = useState(null);
  const [period, setPeriod]   = useState({ from: new Date().toISOString().slice(0,8)+"01", to: new Date().toISOString().slice(0,10) });
  const [pendingCount, setPending] = useState(0);

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
    {id:"review", icon:"📋", label:"مراجعة الحركات", badge:pendingCount},
    {id:"ledger", icon:"📒", label:"الدفتر الأمريكي", badge:0},
    {id:"reports",icon:"📊", label:"التقارير",        badge:0},
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
        <aside className="sidebar">
          <div className="brand"><div className="brand-name">⚙️ مزاهر</div><div className="brand-role">لوحة المحاسب</div></div>
          {NAV.map(n=>(
            <div key={n.id} className={`nav-item ${page===n.id?"active":""}`} onClick={()=>setPage(n.id)}>
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
            <div className="page-title">{NAV.find(n=>n.id===page)?.label}</div>
            <div className="period-sel">
              <span style={{fontSize:11,color:"#8B949E"}}>من</span>
              <input className="pinput" value={period.from} onChange={e=>setPeriod(p=>({...p,from:e.target.value}))}/>
              <span style={{fontSize:11,color:"#8B949E"}}>إلى</span>
              <input className="pinput" value={period.to}   onChange={e=>setPeriod(p=>({...p,to:e.target.value}))}/>
            </div>
          </div>
          {page==="review"  && <ReviewPage  projectId={projectId} period={period}/>}
          {page==="ledger"  && <LedgerPage  projectId={projectId} period={period}/>}
          {page==="reports" && <ReportsPage projectId={projectId} period={period}/>}
        </div>
      </div>
    </>
  );
}
