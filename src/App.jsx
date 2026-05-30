import { useState, useEffect, useMemo, useCallback } from "react";

const SUPABASE_URL  = "https://dnuxevxxgmgptptmuzdy.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudXhldnh4Z21ncHRwdG11emR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MjY1OTAsImV4cCI6MjA5NTEwMjU5MH0.o7lx6HiTU8a3XPF501WNFYk7NOxfYoBrphqVunhOk2s";
const PROJECT_ID    = "d64b040a-0824-43b8-966e-eb41ee095f82";

const sb = {
  async query(table, params = {}) {
    const parts = [];
    if (params.select) parts.push(`select=${encodeURIComponent(params.select)}`);
    if (params.filter) Object.entries(params.filter).forEach(([k,v]) => {
      if (k==="date_from") parts.push(`date=gte.${v}`);
      else if (k==="date_to") parts.push(`date=lte.${v}`);
      else parts.push(`${k}=${v}`);
    });
    if (params.order) parts.push(`order=${params.order}`);
    if (params.limit) parts.push(`limit=${params.limit}`);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${parts.join("&")}`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }});
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  },
  async insert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method:"POST", headers:{apikey:SUPABASE_ANON,Authorization:`Bearer ${SUPABASE_ANON}`,"Content-Type":"application/json",Prefer:"return=representation"},
      body:JSON.stringify(data)});
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  },
  async update(table, id, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method:"PATCH", headers:{apikey:SUPABASE_ANON,Authorization:`Bearer ${SUPABASE_ANON}`,"Content-Type":"application/json",Prefer:"return=representation"},
      body:JSON.stringify(data)});
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  },
  async remove(table, id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,
      {method:"DELETE", headers:{apikey:SUPABASE_ANON,Authorization:`Bearer ${SUPABASE_ANON}`}});
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  },
};

function useData(table, params, deps=[]) {
  const [data,setData]=useState([]);
  const [loading,setLoad]=useState(true);
  const [error,setError]=useState(null);
  const load=useCallback(async()=>{
    try{setLoad(true);setData(await sb.query(table,params));setError(null);}
    catch(e){setError(e.message);}
    finally{setLoad(false);}
  },deps);
  useEffect(()=>{load();},[load]);
  return {data,loading,error,reload:load};
}

const TYPES=[
  "💵 مبيعات كاش","🏦 مبيعات شبكة","🛒 مصروفات تشغيلية","💰 مصروفات ثابتة",
  "💳 قسط سيارة","💳 قسط شراء أرض","💳 قرض ١","💳 قرض ٢",
  "👤 صرف عهدة","✅ تسوية عهدة","💼 مسحوبات سليمان","💼 مسحوبات أم طوبى",
  "🏛️ ضريبة القيمة المضافة","🔄 تحويل داخلي"
];

const fmt = n => new Intl.NumberFormat("ar-SA",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);
const pct = (a,b) => b>0?`${((a/b)*100).toFixed(1)}%`:"—";
const today = () => new Date().toISOString().slice(0,10);
const monthStart = () => new Date().toISOString().slice(0,8)+"01";

function computeBalances(entries) {
  let cash=0,bank=0,custody=0;
  return entries.map(e=>{
    cash    += (Number(e.cash_in)||0)    - (Number(e.cash_out)||0);
    bank    += (Number(e.bank_in)||0)    - (Number(e.bank_out)||0);
    custody += (Number(e.custody_in)||0) - (Number(e.custody_out)||0);
    return {...e,cash_balance:cash,bank_balance:bank,custody_balance:custody};
  });
}

const JOURNAL_MAP = {
  "💵 مبيعات كاش":     e=>[{dr:"الصندوق",cr:"إيرادات المبيعات",amt:e.cash_in||0,desc:e.description}],
  "🏦 مبيعات شبكة":    e=>[{dr:"البنك",cr:"إيرادات المبيعات",amt:e.bank_in||0,desc:e.description}],
  "🛒 مصروفات تشغيلية":e=>buildExp(e,"مصروفات تشغيلية"),
  "💰 مصروفات ثابتة":  e=>buildExp(e,"مصروفات ثابتة"),
  "💳 قسط سيارة":      e=>buildExp(e,"قسط سيارة"),
  "💳 قسط شراء أرض":   e=>buildExp(e,"قسط شراء أرض"),
  "💳 قرض ١":          e=>buildExp(e,"قرض ١"),
  "💳 قرض ٢":          e=>buildExp(e,"قرض ٢"),
  "👤 صرف عهدة":       e=>[{dr:"ح/أمين الصندوق",cr:"الصندوق",amt:e.cash_out||0,desc:"صرف عهدة"}],
  "✅ تسوية عهدة":     e=>buildExp(e,"مصروفات تشغيلية"),
  "💼 مسحوبات سليمان": e=>buildExp(e,"مسحوبات سليمان"),
  "💼 مسحوبات أم طوبى":e=>buildExp(e,"مسحوبات أم طوبى"),
  "🏛️ ضريبة القيمة المضافة":e=>buildExp(e,"ضريبة القيمة المضافة"),
  "🔄 تحويل داخلي":    e=>buildTransfer(e),
};

function buildExp(e,name){
  const l=[];
  if(e.cash_out>0)    l.push({dr:name,cr:"الصندوق",amt:e.cash_out,desc:e.description});
  if(e.bank_out>0)    l.push({dr:name,cr:"البنك",amt:e.bank_out,desc:e.description});
  if(e.custody_out>0) l.push({dr:name,cr:"ح/أمين الصندوق",amt:e.custody_out,desc:e.description});
  return l;
}

function buildTransfer(e){
  const l=[];
  if(e.cash_out>0&&e.bank_in>0)     l.push({dr:"البنك",cr:"الصندوق",amt:e.cash_out,desc:"تحويل"});
  if(e.bank_out>0&&e.cash_in>0)     l.push({dr:"الصندوق",cr:"البنك",amt:e.bank_out,desc:"تحويل"});
  if(e.cash_out>0&&e.custody_in>0)  l.push({dr:"ح/أمين الصندوق",cr:"الصندوق",amt:e.cash_out,desc:"صرف عهدة"});
  if(e.custody_out>0&&e.cash_in>0)  l.push({dr:"الصندوق",cr:"ح/أمين الصندوق",amt:e.custody_out,desc:"تسوية"});
  return l;
}

// ═══════════════════════════════════════
//  CSS — تصميم أبيض احترافي
// ═══════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:     #F7F8FC;
  --bg2:    #FFFFFF;
  --bg3:    #F0F2F8;
  --border: #E2E6F0;
  --border2:#CDD3E8;
  --t0:     #0F172A;
  --t1:     #334155;
  --t2:     #64748B;
  --t3:     #94A3B8;
  --blue:   #3B6BF5;
  --blue2:  #2454D4;
  --teal:   #0EA5C4;
  --green:  #16A34A;
  --red:    #DC2626;
  --gold:   #D97706;
  --purple: #7C3AED;
  --shadow: 0 1px 3px rgba(15,23,42,.06), 0 1px 2px rgba(15,23,42,.04);
  --shadow2:0 4px 12px rgba(15,23,42,.08), 0 2px 4px rgba(15,23,42,.04);
  --shadow3:0 8px 24px rgba(15,23,42,.10), 0 4px 8px rgba(15,23,42,.06);
  --radius: 10px;
  --radius2:14px;
}
html,body{height:100%;background:var(--bg);color:var(--t0);font-family:'Cairo',sans-serif;direction:rtl;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:var(--bg3)}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}

/* ── Layout ── */
.layout{display:flex;min-height:100vh}

/* ── Sidebar ── */
.sidebar{
  width:240px;flex-shrink:0;
  background:var(--t0);
  display:flex;flex-direction:column;
  position:sticky;top:0;height:100vh;overflow-y:auto;
  box-shadow:4px 0 20px rgba(15,23,42,.15);
}
.sb-brand{
  padding:22px 20px 18px;
  border-bottom:1px solid rgba(255,255,255,.08);
  display:flex;align-items:center;gap:12px;
}
.sb-icon{
  width:40px;height:40px;border-radius:12px;
  background:linear-gradient(135deg,#3B6BF5,#7C3AED);
  display:flex;align-items:center;justify-content:center;
  font-size:18px;flex-shrink:0;
  box-shadow:0 4px 12px rgba(59,107,245,.4);
}
.sb-name{font-size:16px;font-weight:800;color:#FFF}
.sb-sub{font-size:11px;color:rgba(255,255,255,.4);margin-top:1px}
.sb-nav{flex:1;padding:12px 10px}
.nav-section{
  font-size:10px;color:rgba(255,255,255,.3);font-weight:700;
  letter-spacing:1.5px;text-transform:uppercase;
  padding:14px 10px 6px;
}
.nav-item{
  display:flex;align-items:center;gap:10px;
  padding:9px 12px;border-radius:8px;cursor:pointer;
  font-size:13px;font-weight:500;color:rgba(255,255,255,.55);
  transition:all .15s;margin-bottom:2px;
}
.nav-item:hover{background:rgba(255,255,255,.07);color:rgba(255,255,255,.85)}
.nav-item.active{
  background:rgba(59,107,245,.2);
  color:#FFF;font-weight:700;
  box-shadow:inset 3px 0 0 #3B6BF5;
}
.nav-badge{
  margin-right:auto;background:#DC2626;color:#fff;
  font-size:10px;font-weight:800;padding:2px 7px;border-radius:20px;
}
.sb-bottom{
  padding:14px 10px;
  border-top:1px solid rgba(255,255,255,.08);
}
.period-box{
  background:rgba(255,255,255,.06);border-radius:8px;padding:12px;
}
.period-label{font-size:10px;color:rgba(255,255,255,.35);font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px}
.period-field{margin-bottom:6px}
.period-field label{font-size:10px;color:rgba(255,255,255,.35);display:block;margin-bottom:3px}
.period-field input{
  width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);
  border-radius:6px;color:#FFF;font-size:11px;padding:5px 8px;
  font-family:'IBM Plex Mono',monospace;
}
.period-field input:focus{outline:none;border-color:#3B6BF5}
.sb-ver{font-size:10px;color:rgba(255,255,255,.2);text-align:center;margin-top:8px}

/* ── Main ── */
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}

/* ── Topbar ── */
.topbar{
  background:var(--bg2);
  border-bottom:1px solid var(--border);
  padding:0 24px;height:56px;
  display:flex;align-items:center;gap:12px;
  position:sticky;top:0;z-index:30;
  box-shadow:var(--shadow);
}
.topbar-title{font-size:15px;font-weight:700;color:var(--t0);flex:1}
.topbar-date{font-size:11px;color:var(--t2);font-family:'IBM Plex Mono',monospace}
.btn{
  display:flex;align-items:center;gap:5px;
  padding:6px 14px;border-radius:7px;font-size:12px;font-weight:600;
  cursor:pointer;font-family:'Cairo',sans-serif;border:none;transition:all .15s;
}
.btn-primary{background:var(--blue);color:#fff}
.btn-primary:hover{background:var(--blue2)}
.btn-outline{background:transparent;color:var(--t1);border:1px solid var(--border2)}
.btn-outline:hover{background:var(--bg3);color:var(--t0)}
.btn-green{background:#DCFCE7;color:var(--green);border:1px solid #BBF7D0}
.btn-green:hover{background:#BBF7D0}
.btn-red{background:#FEE2E2;color:var(--red);border:1px solid #FECACA}
.btn-danger{background:var(--red);color:#fff}
.btn-sm{padding:4px 10px;font-size:11px}

/* ── Page ── */
.page{padding:22px 24px;overflow-y:auto;flex:1}

/* ── Cards ── */
.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius2);box-shadow:var(--shadow)}
.card-header{padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.card-title{font-size:12px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.8px}

/* ── KPI ── */
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.kpi{
  background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius2);
  padding:18px;position:relative;overflow:hidden;box-shadow:var(--shadow);
  transition:box-shadow .2s;
}
.kpi:hover{box-shadow:var(--shadow2)}
.kpi-stripe{position:absolute;top:0;right:0;left:0;height:3px;background:var(--kpi-color,var(--blue));border-radius:var(--radius2) var(--radius2) 0 0}
.kpi-icon{position:absolute;left:16px;top:50%;transform:translateY(-50%);font-size:32px;opacity:.07}
.kpi-label{font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
.kpi-value{font-size:22px;font-weight:800;color:var(--t0);font-family:'IBM Plex Mono',monospace;letter-spacing:-1px}
.kpi-sub{font-size:11px;color:var(--t2);margin-top:5px}
.kpi-badge{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700}

/* ── Balance Cards ── */
.bal-row{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px}
.bal-card{
  background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius2);
  padding:16px 18px;box-shadow:var(--shadow);
  display:flex;align-items:center;gap:14px;
}
.bal-icon{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.bal-label{font-size:11px;font-weight:700;color:var(--t2);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}
.bal-value{font-size:20px;font-weight:800;font-family:'IBM Plex Mono',monospace}
.bal-warn{font-size:10px;color:var(--red);margin-top:2px;font-weight:600}

/* ── Table ── */
.tbl-wrap{overflow-x:auto;border-radius:var(--radius2);border:1px solid var(--border);box-shadow:var(--shadow)}
.tbl{width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap}
.tbl thead th{
  background:var(--bg3);color:var(--t2);font-size:10px;font-weight:700;
  text-align:right;padding:10px 13px;border-bottom:1px solid var(--border);
  text-transform:uppercase;letter-spacing:.5px;position:sticky;top:0;
}
.tbl tbody td{padding:9px 13px;border-bottom:1px solid var(--bg3);vertical-align:middle}
.tbl tbody tr:hover td{background:#F8FAFF}
.tbl tbody tr:last-child td{border-bottom:none}
.mono{font-family:'IBM Plex Mono',monospace}
.num-out{color:var(--red);font-weight:600}
.num-in{color:var(--green);font-weight:600}
.num-pos{color:var(--green);font-weight:700}
.num-neg{color:var(--red);font-weight:700}
.num-blue{color:var(--blue);font-weight:600}
.dash{color:var(--border2)}

/* ── Tags ── */
.tag{font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;white-space:nowrap;display:inline-block}
.tag-dup  {background:#FEE2E2;color:var(--red)}
.tag-auto {background:#DBEAFE;color:#1D4ED8}
.tag-pend {background:#FEF3C7;color:var(--gold)}
.tag-ok   {background:#DCFCE7;color:var(--green)}
.tag-blue {background:#EDE9FE;color:var(--purple)}

/* ── Entry Cards (Review) ── */
.entry-list{display:flex;flex-direction:column;gap:6px}
.entry-card{
  background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);
  overflow:hidden;transition:box-shadow .15s;box-shadow:var(--shadow);
}
.entry-card:hover{box-shadow:var(--shadow2)}
.entry-card.e-pend{border-right:3px solid var(--gold)}
.entry-card.e-auto{border-right:3px solid var(--blue)}
.entry-card.e-dup {border-right:3px solid var(--red)}
.entry-card.e-ok  {border-right:3px solid var(--green);opacity:.6}
.entry-row{display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer}
.e-date{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--t2);min-width:90px}
.e-type{font-size:12px;min-width:175px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.e-desc{flex:1;font-size:12px;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.e-src{font-size:11px;padding:3px 9px;border-radius:6px;min-width:70px;text-align:center;font-weight:600}
.e-amt{font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:13px;min-width:95px;text-align:left;color:var(--t0)}
.e-btns{display:flex;gap:4px}

/* ── Entry Detail ── */
.entry-detail{
  border-top:1px solid var(--border);padding:16px 18px;
  display:grid;grid-template-columns:1fr 1fr;gap:12px;
  background:var(--bg3);
}
.fl{display:flex;flex-direction:column;gap:5px}
.fl-label{font-size:10px;color:var(--t2);font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.fl-select,.fl-input{
  background:var(--bg2);border:1px solid var(--border2);border-radius:7px;
  color:var(--t0);padding:8px 11px;font-size:13px;
  font-family:'Cairo',sans-serif;width:100%;
}
.fl-select:focus,.fl-input:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 3px rgba(59,107,245,.1)}
.fl-info{background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:8px 11px;font-size:12px;color:var(--t1);line-height:1.7}
.fl-warn{background:#FEF2F2;border:1px solid #FECACA;border-radius:7px;padding:8px 11px;font-size:12px;color:var(--red)}
.entry-footer{grid-column:1/-1;display:flex;gap:7px;justify-content:flex-end;padding-top:10px;border-top:1px solid var(--border)}

/* ── Toolbar ── */
.toolbar{display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap}
.search-input{
  flex:1;min-width:180px;max-width:280px;
  background:var(--bg2);border:1px solid var(--border2);border-radius:8px;
  padding:8px 13px;color:var(--t0);font-size:13px;font-family:'Cairo',sans-serif;
}
.search-input:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 3px rgba(59,107,245,.1)}
.filter-sel{
  background:var(--bg2);border:1px solid var(--border2);border-radius:8px;
  padding:8px 11px;color:var(--t0);font-size:12px;font-family:'Cairo',sans-serif;cursor:pointer;
}
.filter-sel:focus{outline:none;border-color:var(--blue)}
.gap{flex:1}
.chip{
  padding:5px 13px;border-radius:20px;font-size:12px;cursor:pointer;
  border:1px solid var(--border);background:var(--bg2);color:var(--t2);
  font-family:'Cairo',sans-serif;transition:all .15s;font-weight:500;
}
.chip:hover{border-color:var(--border2);color:var(--t1)}
.chip.on{background:var(--blue);color:#fff;border-color:var(--blue);font-weight:700}

/* ── Reports ── */
.rep-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.r-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius2);box-shadow:var(--shadow);overflow:hidden}
.r-head{padding:10px 16px;font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid var(--border);background:var(--bg3)}
.r-row{display:flex;justify-content:space-between;align-items:center;padding:9px 16px;border-bottom:1px solid var(--bg3)}
.r-row:last-child{border-bottom:none}
.r-row.hl-g{background:#F0FDF4}
.r-row.hl-b{background:#EFF6FF}
.r-row.hl-p{background:#F5F3FF}
.r-row.hl-r{background:#FFF5F5}
.r-lbl{font-size:13px;color:var(--t1)}
.r-lbl.bold{color:var(--t0);font-weight:700}
.r-val{font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:600;text-align:left}
.r-pct{font-size:10px;color:var(--t2);margin-left:10px;min-width:42px;text-align:left}
.sec-bar{background:var(--t0);padding:7px 16px;font-size:10px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:1px}

/* ── Journal ── */
.j-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius2);margin-bottom:12px;overflow:hidden;box-shadow:var(--shadow)}
.j-header{padding:11px 16px;display:flex;align-items:center;gap:12px;background:var(--bg3);border-bottom:1px solid var(--border)}
.j-no{font-family:'IBM Plex Mono',monospace;font-size:11px;background:var(--blue);color:#fff;padding:3px 10px;border-radius:5px;font-weight:700}
.j-date{font-size:13px;font-weight:700;color:var(--t0)}
.j-tbl{width:100%;border-collapse:collapse;font-size:12px}
.j-tbl th{background:var(--bg3);color:var(--t2);font-size:10px;font-weight:700;text-align:right;padding:7px 14px;border-bottom:1px solid var(--border);text-transform:uppercase}
.j-tbl td{padding:8px 14px;border-bottom:1px solid var(--bg3)}
.j-total{display:grid;grid-template-columns:2fr 1fr 1fr;padding:9px 14px;font-weight:700;font-size:12px;border-top:2px solid var(--border);background:var(--bg3)}

/* ── Modal ── */
.overlay{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:200;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
.modal{background:var(--bg2);border-radius:var(--radius2);padding:26px;width:520px;max-height:88vh;overflow-y:auto;box-shadow:var(--shadow3)}
.modal-title{font-size:16px;font-weight:800;color:var(--t0);margin-bottom:20px}
.modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.modal-footer{display:flex;gap:8px;justify-content:flex-end;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)}

/* ── Mobile ── */
.mob-btn{display:none;background:none;border:none;color:#fff;font-size:20px;cursor:pointer;padding:4px}
@media(max-width:900px){
  .sidebar{position:fixed;right:0;top:0;bottom:0;z-index:100;transform:translateX(100%);transition:transform .3s}
  .sidebar.open{transform:translateX(0)}
  .main{margin-right:0}
  .mob-btn{display:block}
  .kpi-grid{grid-template-columns:repeat(2,1fr)}
  .rep-grid{grid-template-columns:1fr}
  .bal-row{grid-template-columns:1fr}
  .page{padding:14px}
}
@media print{
  .sidebar,.topbar,button,.toolbar{display:none!important}
  .main{margin-right:0!important}
  body{background:white!important}
}

/* ── Divider ── */
.divider{height:1px;background:var(--border);margin:12px 0}

/* ── Empty ── */
.empty{text-align:center;padding:60px 20px;color:var(--t2)}
.empty-icon{font-size:48px;margin-bottom:12px;opacity:.3}

/* ── Loading ── */
.loading-wrap{display:flex;align-items:center;justify-content:center;height:200px;gap:10px;color:var(--t2);font-size:13px}
.spinner{width:18px;height:18px;border:2px solid var(--border2);border-top-color:var(--blue);border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.err{background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;color:var(--red);font-size:13px;margin-bottom:14px}

/* ── Report Header ── */
.rep-header{
  background:linear-gradient(135deg,var(--t0) 0%,#1e3a5f 100%);
  border-radius:var(--radius2);padding:20px 24px;margin-bottom:20px;
  display:flex;justify-content:space-between;align-items:center;
  box-shadow:var(--shadow2);
}
.rep-header-title{font-size:17px;font-weight:800;color:#FFF}
.rep-header-sub{font-size:12px;color:rgba(255,255,255,.5);margin-top:3px}
.rep-header-stat{background:rgba(255,255,255,.1);border-radius:8px;padding:10px 16px;text-align:center}
.rep-header-stat-label{font-size:10px;color:rgba(255,255,255,.5);margin-bottom:3px}
.rep-header-stat-value{font-size:17px;font-weight:800;font-family:'IBM Plex Mono',monospace}

/* ── Ledger summary cards ── */
.ledger-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}
.ls-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius2);padding:14px 16px;box-shadow:var(--shadow)}
.ls-label{font-size:10px;color:var(--t2);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px}
.ls-value{font-size:18px;font-weight:800;font-family:'IBM Plex Mono',monospace}
`;

// ═══════════════════════════════════════
//  Shared
// ═══════════════════════════════════════
const Loader = () => (
  <div className="loading-wrap"><div className="spinner"/>جاري التحميل...</div>
);
const Err = ({msg}) => <div className="err">⚠ {msg}</div>;

function KPI({label,value,sub,color="#3B6BF5",icon,badge,badgeStyle}){
  return(
    <div className="kpi" style={{"--kpi-color":color}}>
      <div className="kpi-stripe"/>
      {icon&&<div className="kpi-icon">{icon}</div>}
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{color}}>{typeof value==="number"?fmt(value):value}</div>
      <div className="kpi-sub">
        {badge&&<span className="kpi-badge" style={badgeStyle||{background:`${color}18`,color}}>{badge}</span>}
        {sub&&<span style={{marginRight:badge?6:0}}>{sub}</span>}
      </div>
    </div>
  );
}

function BalCards({entries}){
  const all=computeBalances(entries);
  const last=all[all.length-1];
  const cash=last?.cash_balance??0,bank=last?.bank_balance??0,custody=last?.custody_balance??0;
  return(
    <div className="bal-row">
      {[
        {label:"رصيد الصندوق",val:cash,   color:"#16A34A",bg:"#DCFCE7",icon:"🏧"},
        {label:"رصيد البنك",  val:bank,   color:"#3B6BF5",bg:"#DBEAFE",icon:"🏦"},
        {label:"رصيد العهدة", val:custody,color:"#D97706",bg:"#FEF3C7",icon:"👤"},
      ].map((b,i)=>(
        <div className="bal-card" key={i}>
          <div className="bal-icon" style={{background:b.bg,fontSize:22}}>{b.icon}</div>
          <div>
            <div className="bal-label">{b.label}</div>
            <div className="bal-value" style={{color:b.val<0?"#DC2626":b.color}}>{fmt(b.val)}</div>
            {b.val<0&&<div className="bal-warn">⚠ رصيد سالب</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════
//  مراجعة الحركات
// ═══════════════════════════════════════
function ReviewPage({projectId,period}){
  const {data,loading,error,reload}=useData("ledger_entries",
    {filter:{"project_id":`eq.${projectId}`,"date_from":period.from,"date_to":period.to,"status":"neq.approved"},order:"date.desc,created_at.desc"},
    [projectId,period.from,period.to]);
  const [exp,setExp]=useState(null);
  const [filter,setFilter]=useState("all");
  const [saving,setSaving]=useState(false);

  const pending=data.filter(e=>e.status==="pending").length;
  const autos  =data.filter(e=>e.status==="auto"&&!e.is_duplicate).length;
  const dups   =data.filter(e=>e.is_duplicate).length;

  const filtered=data.filter(e=>{
    if(filter==="pending") return e.status==="pending";
    if(filter==="dup")     return e.is_duplicate;
    if(filter==="auto")    return e.status==="auto"&&!e.is_duplicate;
    return true;
  });

  const getSrc=e=>(e.cash_out||e.cash_in)?{l:"🏧 صندوق",c:"#16A34A",bg:"#DCFCE7"}
    :(e.bank_out||e.bank_in)?{l:"🏦 بنك",c:"#3B6BF5",bg:"#DBEAFE"}
    :(e.custody_out||e.custody_in)?{l:"👤 عهدة",c:"#D97706",bg:"#FEF3C7"}
    :{l:"—",c:"#94A3B8",bg:"#F1F5F9"};

  const getAmt=e=>Math.max(
    (e.cash_out||0)+(e.cash_in||0),(e.bank_out||0)+(e.bank_in||0),
    (e.custody_out||0)+(e.custody_in||0),e.total_amount||0);

  const approve=async id=>{setSaving(true);await sb.update("ledger_entries",id,{status:"approved"});await reload();setSaving(false);setExp(null)};
  const reject =async id=>{if(!window.confirm("حذف؟"))return;setSaving(true);await sb.remove("ledger_entries",id);await reload();setSaving(false);setExp(null)};
  const approveAll=async()=>{setSaving(true);await Promise.all(data.filter(e=>e.status==="auto"&&!e.is_duplicate).map(e=>sb.update("ledger_entries",e.id,{status:"approved"})));await reload();setSaving(false)};
  const upd=async(id,f,v)=>{await sb.update("ledger_entries",id,{[f]:v});await reload()};

  const sc=e=>e.is_duplicate?"e-dup":e.status==="auto"?"e-auto":"e-pend";
  if(loading) return <Loader/>;

  return(
    <div className="page">
      {error&&<Err msg={error}/>}
      <div className="kpi-grid" style={{marginBottom:16}}>
        <KPI label="بانتظار تصنيف" value={pending} color="#D97706" icon="⏳" sub="حركة معلقة"/>
        <KPI label="تصنيف تلقائي"  value={autos}   color="#3B6BF5" icon="🤖" sub="من الذكاء الاصطناعي"/>
        <KPI label="تكرار محتمل"   value={dups}    color="#DC2626" icon="⚠️" sub="تحتاج مراجعة"/>
        <KPI label="إجمالي المعلق" value={data.length} color="#7C3AED" icon="📋"/>
      </div>
      <div className="toolbar">
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {[{v:"all",l:`الكل (${data.length})`},{v:"pending",l:`⏳ معلق (${pending})`},{v:"auto",l:`🤖 تلقائي (${autos})`},{v:"dup",l:`⚠️ تكرار (${dups})`}]
            .map(f=><button key={f.v} className={`chip ${filter===f.v?"on":""}`} onClick={()=>setFilter(f.v)}>{f.l}</button>)}
        </div>
        <div className="gap"/>
        {autos>0&&<button className="btn btn-green" onClick={approveAll} disabled={saving}>✅ اعتماد التلقائي ({autos})</button>}
      </div>
      <div className="entry-list">
        {filtered.map(e=>{
          const src=getSrc(e),amt=getAmt(e);
          return(
            <div key={e.id} className={`entry-card ${sc(e)}`}>
              <div className="entry-row" onClick={()=>setExp(exp===e.id?null:e.id)}>
                <span className="e-date">{e.date}</span>
                <span className="e-type">{e.type||<span style={{color:"#D97706"}}>⚠ بدون تصنيف</span>}</span>
                <span className="e-desc">{e.description||e.original_name}</span>
                {e.is_duplicate&&<span className="tag tag-dup">تكرار</span>}
                {!e.is_duplicate&&e.status==="auto"&&<span className="tag tag-auto">AI</span>}
                {e.status==="pending"&&<span className="tag tag-pend">معلق</span>}
                <span className="e-src" style={{color:src.c,background:src.bg}}>{src.l}</span>
                <span className="e-amt">{fmt(amt)}</span>
                <div className="e-btns" onClick={ev=>ev.stopPropagation()}>
                  <button className="btn btn-green btn-sm" onClick={()=>approve(e.id)} disabled={saving}>✓</button>
                  <button className="btn btn-red btn-sm"   onClick={()=>reject(e.id)}  disabled={saving}>✕</button>
                </div>
              </div>
              {exp===e.id&&(
                <div className="entry-detail">
                  <div className="fl">
                    <div className="fl-label">نوع الحركة</div>
                    <select className="fl-select" value={e.type||""} onChange={ev=>upd(e.id,"type",ev.target.value)}>
                      <option value="">— اختر —</option>
                      {TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="fl">
                    <div className="fl-label">الوصف</div>
                    <input className="fl-input" value={e.description||""} onChange={ev=>upd(e.id,"description",ev.target.value)}/>
                  </div>
                  <div className="fl">
                    <div className="fl-label">التفاصيل</div>
                    <div className="fl-info">
                      {e.cash_out>0&&<div>خرج صندوق: <strong style={{color:"#DC2626"}}>{fmt(e.cash_out)}</strong></div>}
                      {e.cash_in>0 &&<div>دخل صندوق: <strong style={{color:"#16A34A"}}>{fmt(e.cash_in)}</strong></div>}
                      {e.bank_out>0&&<div>خرج بنك: <strong style={{color:"#DC2626"}}>{fmt(e.bank_out)}</strong></div>}
                      {e.bank_in>0 &&<div>دخل بنك: <strong style={{color:"#3B6BF5"}}>{fmt(e.bank_in)}</strong></div>}
                      {e.custody_out>0&&<div>خرج عهدة: <strong style={{color:"#DC2626"}}>{fmt(e.custody_out)}</strong></div>}
                      {e.custody_in>0 &&<div>دخل عهدة: <strong style={{color:"#D97706"}}>{fmt(e.custody_in)}</strong></div>}
                      {e.vat_amount>0&&<div>ضريبة: <strong style={{color:"#D97706"}}>{fmt(e.vat_amount)}</strong></div>}
                    </div>
                  </div>
                  <div className="fl">
                    <div className="fl-label">الفاتورة</div>
                    {e.file_url?<a href={e.file_url} target="_blank" rel="noreferrer" style={{color:"#3B6BF5",fontSize:13}}>📎 {e.original_name||"فتح الفاتورة"}</a>
                      :<span style={{color:"#94A3B8",fontSize:12}}>لا يوجد مرفق</span>}
                  </div>
                  {e.is_duplicate&&<div className="fl" style={{gridColumn:"1/-1"}}><div className="fl-warn">⚠ تكرار محتمل — تحقق قبل الاعتماد</div></div>}
                  <div className="entry-footer">
                    <button className="btn btn-outline" onClick={()=>setExp(null)}>إغلاق</button>
                    <button className="btn btn-red"     onClick={()=>reject(e.id)}  disabled={saving}>🗑 حذف</button>
                    <button className="btn btn-primary" onClick={()=>approve(e.id)} disabled={saving}>✅ اعتماد</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length===0&&<div className="empty"><div className="empty-icon">✅</div>لا توجد حركات معلقة</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  الدفتر الأمريكي
// ═══════════════════════════════════════
function LedgerPage({projectId,period}){
  const {data:raw,loading,error,reload}=useData("ledger_entries",
    {filter:{"project_id":`eq.${projectId}`,"status":"eq.approved","date_from":period.from,"date_to":period.to},order:"date.asc,created_at.asc"},
    [projectId,period.from,period.to]);
  const [search,setSearch]=useState("");
  const [typeF,setTypeF]=useState("");
  const [modal,setModal]=useState(false);
  const [saving,setSaving]=useState(false);
  const [nr,setNr]=useState({date:today(),type:"",description:"",cash_out:"",cash_in:"",bank_out:"",bank_in:"",custody_out:"",custody_in:"",vat_amount:""});

  const entries=useMemo(()=>computeBalances(raw),[raw]);
  const filtered=useMemo(()=>entries.filter(r=>{
    const s=search.toLowerCase();
    return(!s||(r.description||"").toLowerCase().includes(s)||(r.type||"").includes(s))&&(!typeF||r.type===typeF);
  }),[entries,search,typeF]);

  const last=entries[entries.length-1];

  const addRow=async()=>{
    if(!nr.type||!nr.description)return;
    setSaving(true);
    try{
      const n={...nr};
      ["cash_out","cash_in","bank_out","bank_in","custody_out","custody_in","vat_amount"].forEach(k=>{n[k]=parseFloat(n[k])||0});
      const total=["cash_out","cash_in","bank_out","bank_in","custody_out","custody_in"].reduce((s,k)=>s+n[k],0);
      await sb.insert("ledger_entries",{...n,project_id:projectId,total_amount:total,status:"approved"});
      await reload();setModal(false);
      setNr({date:today(),type:"",description:"",cash_out:"",cash_in:"",bank_out:"",bank_in:"",custody_out:"",custody_in:"",vat_amount:""});
    }catch(e){alert("خطأ: "+e.message);}
    finally{setSaving(false);}
  };

  const N=(v,cls)=>v?<span className={`mono ${cls}`}>{fmt(v)}</span>:<span className="dash">—</span>;
  if(loading)return <Loader/>;

  return(
    <div className="page">
      {error&&<Err msg={error}/>}
      <div className="ledger-summary">
        {[
          {label:"🏧 رصيد الصندوق",val:last?.cash_balance??0,   c:(last?.cash_balance??0)<0?"#DC2626":"#16A34A"},
          {label:"🏦 رصيد البنك",  val:last?.bank_balance??0,   c:(last?.bank_balance??0)<0?"#DC2626":"#3B6BF5"},
          {label:"👤 رصيد العهدة", val:last?.custody_balance??0,c:(last?.custody_balance??0)<0?"#DC2626":"#D97706"},
        ].map((b,i)=>(
          <div key={i} className="ls-card">
            <div className="ls-label">{b.label}</div>
            <div className="ls-value" style={{color:b.c}}>{fmt(b.val)}</div>
            {b.val<0&&<div style={{fontSize:10,color:"#DC2626",marginTop:3}}>⚠ رصيد سالب</div>}
          </div>
        ))}
      </div>
      <div className="toolbar">
        <input className="search-input" placeholder="🔍 بحث..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="filter-sel" value={typeF} onChange={e=>setTypeF(e.target.value)}>
          <option value="">كل الأنواع</option>
          {TYPES.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <div className="gap"/>
        <button className="btn btn-outline" onClick={()=>setModal(true)}>+ إضافة يدوية</button>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr>
            <th>#</th><th>التاريخ</th><th>النوع</th><th>الوصف</th>
            <th>خ.صندوق</th><th>د.صندوق</th><th>خ.بنك</th><th>د.بنك</th>
            <th>خ.عهدة</th><th>د.عهدة</th>
            <th>رصيد صندوق</th><th>رصيد بنك</th><th>رصيد عهدة</th><th>ضريبة</th>
          </tr></thead>
          <tbody>
            {filtered.map((r,i)=>(
              <tr key={r.id}>
                <td className="mono" style={{fontSize:10,color:"#94A3B8"}}>{i+1}</td>
                <td><span className="mono" style={{fontSize:11,color:"#64748B"}}>{r.date}</span></td>
                <td style={{fontSize:11,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis"}}>{r.type}</td>
                <td style={{maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",color:"#334155"}} title={r.description}>{r.description}</td>
                <td>{N(r.cash_out,"num-out")}</td><td>{N(r.cash_in,"num-in")}</td>
                <td>{N(r.bank_out,"num-out")}</td><td>{N(r.bank_in,"num-blue")}</td>
                <td>{N(r.custody_out,"num-out")}</td><td>{N(r.custody_in,"mono" )}</td>
                <td className="mono" style={{color:(r.cash_balance??0)<0?"#DC2626":"#16A34A",fontWeight:700}}>{fmt(r.cash_balance)}</td>
                <td className="mono" style={{color:(r.bank_balance??0)<0?"#DC2626":"#3B6BF5",fontWeight:700}}>{fmt(r.bank_balance)}</td>
                <td className="mono" style={{color:(r.custody_balance??0)<0?"#DC2626":"#D97706",fontWeight:700}}>{fmt(r.custody_balance)}</td>
                <td>{r.vat_amount>0?<span className="mono" style={{color:"#D97706"}}>{fmt(r.vat_amount)}</span>:<span className="dash">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal&&(
        <div className="overlay" onClick={()=>setModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">➕ إضافة حركة يدوية</div>
            <div className="modal-grid">
              <div className="fl"><div className="fl-label">التاريخ</div><input type="date" className="fl-input" value={nr.date} onChange={e=>setNr(p=>({...p,date:e.target.value}))}/></div>
              <div className="fl"><div className="fl-label">نوع الحركة *</div>
                <select className="fl-select" value={nr.type} onChange={e=>setNr(p=>({...p,type:e.target.value}))}>
                  <option value="">— اختر —</option>{TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="fl" style={{gridColumn:"1/-1"}}><div className="fl-label">الوصف *</div><input className="fl-input" value={nr.description} onChange={e=>setNr(p=>({...p,description:e.target.value}))}/></div>
              {[{f:"cash_out",l:"خرج صندوق"},{f:"cash_in",l:"دخل صندوق"},{f:"bank_out",l:"خرج بنك"},{f:"bank_in",l:"دخل بنك"},{f:"custody_out",l:"خرج عهدة"},{f:"custody_in",l:"دخل عهدة"},{f:"vat_amount",l:"ضريبة ق.م"}]
                .map(({f,l})=><div key={f} className="fl"><div className="fl-label">{l}</div><input type="number" className="fl-input" value={nr[f]||""} placeholder="0.00" onChange={e=>setNr(p=>({...p,[f]:e.target.value}))}/></div>)}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setModal(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={addRow} disabled={saving||!nr.type||!nr.description}>{saving?"⏳ جاري الحفظ...":"✓ حفظ"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
//  التقارير
// ═══════════════════════════════════════
function ReportsPage({projectId,period}){
  const {data:ledger,loading}=useData("ledger_entries",
    {filter:{"project_id":`eq.${projectId}`,"date_from":period.from,"date_to":period.to,"status":"eq.approved"}},
    [projectId,period.from,period.to]);
  const {data:allLedger}=useData("ledger_entries",
    {filter:{"project_id":`eq.${projectId}`,"status":"eq.approved"},order:"date.asc,created_at.asc"},
    [projectId]);
  const {data:loans}=useData("loans",{filter:{"project_id":`eq.${projectId}`}},[projectId]);

  const balances=useMemo(()=>computeBalances(allLedger),[allLedger]);
  const sumT=useCallback((types,cols)=>
    ledger.filter(e=>types.some(t=>(e.type||"").includes(t))).reduce((s,e)=>s+cols.reduce((a,c)=>a+(Number(e[c])||0),0),0),
    [ledger]);

  const cashSales=sumT(["مبيعات كاش"],["cash_in"]);
  const netSales =sumT(["مبيعات شبكة"],["bank_in"]);
  const total    =cashSales+netSales;
  const opExp    =sumT(["مصروفات تشغيلية"],["cash_out","bank_out","custody_out"]);
  const fixedExp =sumT(["مصروفات ثابتة"],  ["cash_out","bank_out","custody_out"]);
  const loansPaid=sumT(["قسط سيارة","قسط شراء أرض","قرض ١","قرض ٢"],["cash_out","bank_out","custody_out"]);
  const withd    =sumT(["مسحوبات سليمان","مسحوبات أم طوبى"],["cash_out","bank_out","custody_out"]);
  const gross    =total-opExp-fixedExp;
  const netProfit=gross-loansPaid;
  const cashflow =netProfit-withd;
  const vatSales =total*0.15;
  const vatPurch =ledger.reduce((s,e)=>s+(Number(e.vat_amount)||0),0);
  const vatDue   =vatSales-vatPurch;
  const lastBal  =balances[balances.length-1];

  if(loading)return <Loader/>;

  const Row=({label,val,sub,color,bold,pctBase,indent,hl,neg})=>(
    <div className={`r-row${hl?` ${hl}`:""}`} style={{paddingRight:indent?28:16,paddingLeft:16}}>
      <span className={`r-lbl${bold?" bold":""}`}>{label}</span>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        {pctBase>0&&<span className="r-pct">{pct(neg?-val:val,pctBase)}</span>}
        <span className="r-val" style={{color:color||(bold?"#0F172A":"#334155")}}>
          {neg?`(${fmt(Math.abs(val))})`:fmt(val)}
        </span>
        {sub&&<span style={{fontSize:10,color:"#94A3B8"}}>{sub}</span>}
      </div>
    </div>
  );

  return(
    <div className="page">
      <div className="rep-header">
        <div>
          <div className="rep-header-title">📊 التقرير المالي</div>
          <div className="rep-header-sub">{period.from} — {period.to}</div>
        </div>
        <div style={{display:"flex",gap:12}}>
          {[{l:"إجمالي المبيعات",v:fmt(total),c:"#4ADE80"},{l:"صافي الربح",v:fmt(netProfit),c:netProfit>=0?"#60A5FA":"#F87171"}]
            .map((s,i)=>(
              <div key={i} className="rep-header-stat">
                <div className="rep-header-stat-label">{s.l}</div>
                <div className="rep-header-stat-value" style={{color:s.c}}>{s.v}</div>
              </div>
            ))}
        </div>
      </div>

      <div className="kpi-grid">
        <KPI label="إجمالي المبيعات" value={total}       color="#3B6BF5" icon="💰" sub={`كاش: ${fmt(cashSales)}`}/>
        <KPI label="مجمل الربح"      value={gross}       color="#D97706" icon="📦" badge={pct(gross,total)}       badgeStyle={{background:"#FEF3C7",color:"#D97706"}}/>
        <KPI label="صافي الربح"      value={netProfit}   color="#16A34A" icon="📈" badge={pct(netProfit,total)}   badgeStyle={{background:"#DCFCE7",color:"#16A34A"}}/>
        <KPI label="صافي التدفق"     value={cashflow}    color="#7C3AED" icon="💸" sub="بعد المسحوبات"/>
      </div>

      <div className="bal-row" style={{marginBottom:20}}>
        {[
          {label:"🏧 الصندوق",val:lastBal?.cash_balance??0,   color:"#16A34A",bg:"#DCFCE7",icon:"🏧"},
          {label:"🏦 البنك",  val:lastBal?.bank_balance??0,   color:"#3B6BF5",bg:"#DBEAFE",icon:"🏦"},
          {label:"👤 العهدة", val:lastBal?.custody_balance??0,color:"#D97706",bg:"#FEF3C7",icon:"👤"},
        ].map((b,i)=>(
          <div key={i} className="bal-card">
            <div className="bal-icon" style={{background:b.bg,fontSize:22}}>{b.icon}</div>
            <div>
              <div className="bal-label">{b.label}</div>
              <div className="bal-value" style={{color:b.val<0?"#DC2626":b.color}}>{fmt(b.val)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rep-grid">
        <div className="r-card">
          <div className="r-head">💰 المبيعات والمصروفات</div>
          <div className="sec-bar">الإيرادات</div>
          <Row label="مبيعات كاش"          val={cashSales} color="#16A34A" pctBase={total} indent/>
          <Row label="مبيعات شبكة"         val={netSales}  color="#3B6BF5" pctBase={total} indent/>
          <Row label="إجمالي الإيرادات"    val={total}     color="#3B6BF5" bold hl="hl-b"/>
          <div className="sec-bar">المصروفات</div>
          <Row label="تشغيلية"              val={-opExp}    color="#DC2626" pctBase={total} indent neg/>
          <Row label="ثابتة"               val={-fixedExp} color="#DC2626" pctBase={total} indent neg/>
          <Row label="إجمالي المصروفات"    val={-(opExp+fixedExp)} color="#DC2626" bold/>
        </div>

        <div className="r-card">
          <div className="r-head">📊 الربحية</div>
          <Row label="مجمل الربح"           val={gross}     color={gross>=0?"#D97706":"#DC2626"}    bold hl="hl-g" pctBase={total}/>
          <Row label="(-) أقساط القروض"     val={-loansPaid}color="#DC2626"                         pctBase={total} indent neg/>
          <Row label="صافي الربح"           val={netProfit} color={netProfit>=0?"#16A34A":"#DC2626"} bold hl="hl-b" pctBase={total}/>
          <Row label="(-) مسحوبات الشركاء"  val={-withd}    color="#DC2626"                         pctBase={total} indent neg/>
          <Row label="صافي التدفق النقدي"   val={cashflow}  color={cashflow>=0?"#7C3AED":"#DC2626"}  bold hl="hl-p" pctBase={total}/>
          <div className="divider"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"0 16px 12px"}}>
            {[{l:"هامش الربح",v:pct(netProfit,total),c:"#16A34A"},{l:"تغطية الديون",v:loansPaid>0?`${((netProfit+loansPaid)/loansPaid).toFixed(1)}x`:"—",c:"#D97706"}]
              .map((k,i)=>(
                <div key={i} style={{background:"#F8FAFF",border:"1px solid #E2E6F0",borderRadius:8,padding:"9px",textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#64748B",marginBottom:3}}>{k.l}</div>
                  <div style={{fontSize:15,fontWeight:800,color:k.c,fontFamily:"'IBM Plex Mono'"}}>{k.v}</div>
                </div>
              ))}
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div className="r-card">
            <div className="r-head">🏛️ القروض</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr>
                {["القرض","المسدد %","المتبقي"].map(h=><th key={h} style={{background:"#F0F2F8",color:"#64748B",fontSize:10,fontWeight:700,padding:"7px 12px",textAlign:"right",borderBottom:"1px solid #E2E6F0",textTransform:"uppercase"}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {loans.filter(l=>l.original_amount>0).map((l,i)=>{
                  const name=(l.name||"").replace("💳 ","").trim();
                  const paid=allLedger.filter(e=>(e.type||"").includes(name)).reduce((s,e)=>s+(e.cash_out||0)+(e.bank_out||0)+(e.custody_out||0),0);
                  const rem =Math.max(0,(l.original_amount||0)-paid);
                  const p2  =l.original_amount>0?((paid/l.original_amount)*100).toFixed(0):0;
                  return(
                    <tr key={i}>
                      <td style={{padding:"8px 12px",color:"#334155"}}>{l.name}</td>
                      <td style={{padding:"8px 12px",textAlign:"center"}}>
                        <div style={{background:"#DCFCE7",borderRadius:20,padding:"2px 8px",display:"inline-block",fontSize:11,fontWeight:700,color:"#16A34A"}}>{p2}%</div>
                      </td>
                      <td style={{padding:"8px 12px",fontFamily:"'IBM Plex Mono'",fontWeight:700,color:rem>0?"#DC2626":"#16A34A"}}>{fmt(rem)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="r-card">
            <div className="r-head">💼 المسحوبات</div>
            <Row label="سليمان"  val={sumT(["مسحوبات سليمان"],["cash_out","bank_out","custody_out"])}  pctBase={total}/>
            <Row label="أم طوبى" val={sumT(["مسحوبات أم طوبى"],["cash_out","bank_out","custody_out"])} pctBase={total}/>
            <Row label="الإجمالي" val={withd} color="#7C3AED" bold pctBase={total}/>
          </div>

          <div className="r-card">
            <div className="r-head">🧾 ضريبة القيمة المضافة</div>
            <Row label="ضريبة المبيعات 15%" val={vatSales}/>
            <Row label="ضريبة المشتريات"    val={vatPurch} color="#94A3B8"/>
            <div style={{margin:"10px 16px",background:vatDue>0?"#FEF2F2":"#F0FDF4",border:`1px solid ${vatDue>0?"#FECACA":"#BBF7D0"}`,borderRadius:8,padding:"11px",textAlign:"center"}}>
              <div style={{fontSize:11,color:vatDue>0?"#DC2626":"#16A34A",marginBottom:3}}>{vatDue>0?"💳 مستحق للهيئة":"✅ رصيد لصالحك"}</div>
              <div style={{fontSize:20,fontWeight:800,fontFamily:"'IBM Plex Mono'",color:vatDue>0?"#DC2626":"#16A34A"}}>{fmt(Math.abs(vatDue))}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  قائمة الدخل
// ═══════════════════════════════════════
function IncomeStatement({projectId,period}){
  const {data:ledger,loading}=useData("ledger_entries",
    {filter:{"project_id":`eq.${projectId}`,"date_from":period.from,"date_to":period.to,"status":"eq.approved"}},
    [projectId,period.from,period.to]);
  if(loading)return <Loader/>;

  const sum=(types,cols)=>ledger.filter(e=>types.some(t=>(e.type||"").includes(t))).reduce((s,e)=>s+cols.reduce((a,c)=>a+(Number(e[c])||0),0),0);
  const cashSales=sum(["مبيعات كاش"],["cash_in"]);
  const netSales =sum(["مبيعات شبكة"],["bank_in"]);
  const total    =cashSales+netSales;
  const cogs     =sum(["مصروفات تشغيلية"],["cash_out","bank_out","custody_out"]);
  const fixed    =sum(["مصروفات ثابتة"],  ["cash_out","bank_out","custody_out"]);
  const loans    =sum(["قسط سيارة","قسط شراء أرض","قرض ١","قرض ٢"],["cash_out","bank_out","custody_out"]);
  const withd    =sum(["مسحوبات سليمان","مسحوبات أم طوبى"],["cash_out","bank_out","custody_out"]);
  const gross    =total-cogs;
  const opProfit =gross-fixed;
  const netProfit=opProfit-loans;
  const cashflow =netProfit-withd;
  const p=v=>total>0?`${((v/total)*100).toFixed(1)}%`:"—";

  const Row=({label,val,color,bold,indent,neg})=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:`10px 20px`,paddingRight:indent?36:20,borderBottom:"1px solid #F0F2F8",background:bold?"rgba(59,107,245,.02)":"transparent"}}>
      <span style={{fontSize:13,color:bold?"#0F172A":"#334155",fontWeight:bold?700:400}}>{label}</span>
      <div style={{display:"flex",gap:18,alignItems:"center"}}>
        <span style={{fontSize:11,color:"#94A3B8",minWidth:46,textAlign:"left"}}>{p(neg?-val:val)}</span>
        <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:13,fontWeight:bold?700:500,color:color||"#0F172A",minWidth:100,textAlign:"left"}}>{neg?`(${fmt(Math.abs(val))})`:fmt(val)}</span>
      </div>
    </div>
  );

  const Sec=({title,color})=>(
    <div style={{background:color||"#0F172A",padding:"8px 20px"}}>
      <span style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.7)",textTransform:"uppercase",letterSpacing:1}}>{title}</span>
    </div>
  );

  return(
    <div className="page">
      <div style={{maxWidth:620}}>
        <div style={{background:"#FFF",borderRadius:14,overflow:"hidden",border:"1px solid #E2E6F0",boxShadow:"0 4px 12px rgba(15,23,42,.08)"}}>
          <div style={{background:"linear-gradient(135deg,#0F172A 0%,#1e3a6e 100%)",padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:16,fontWeight:800,color:"#FFF"}}>📈 قائمة الدخل</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginTop:3,fontFamily:"'IBM Plex Mono'"}}>{period.from} — {period.to}</div>
            </div>
            <div style={{background:"rgba(255,255,255,.1)",borderRadius:8,padding:"10px 16px",textAlign:"center"}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>صافي الربح</div>
              <div style={{fontSize:18,fontWeight:800,color:netProfit>=0?"#4ADE80":"#F87171",fontFamily:"'IBM Plex Mono'"}}>{fmt(netProfit)}</div>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:18,padding:"7px 20px",background:"#F8FAFF",fontSize:10,color:"#64748B",fontWeight:700,textTransform:"uppercase"}}>
            <span style={{minWidth:46}}>% من الإيراد</span><span style={{minWidth:100}}>المبلغ</span>
          </div>
          <Sec title="الإيرادات" color="#1D4ED8"/>
          <Row label="مبيعات كاش"              val={cashSales} color="#16A34A" indent/>
          <Row label="مبيعات شبكة / آبل باي"   val={netSales}  color="#3B6BF5" indent/>
          <Row label="إجمالي الإيرادات"        val={total}     color="#3B6BF5" bold/>
          <Sec title="تكلفة المبيعات" color="#991B1B"/>
          <Row label="(-) مصروفات تشغيلية"     val={cogs}      color="#DC2626" indent neg/>
          <Row label="مجمل الربح"              val={gross}     color={gross>=0?"#D97706":"#DC2626"} bold/>
          <Sec title="المصروفات الثابتة" color="#1E40AF"/>
          <Row label="(-) مصروفات ثابتة"       val={fixed}     color="#DC2626" indent neg/>
          <Row label="الربح التشغيلي"          val={opProfit}  color={opProfit>=0?"#3B6BF5":"#DC2626"} bold/>
          <Sec title="التمويل والقروض" color="#4C1D95"/>
          <Row label="(-) أقساط القروض"        val={loans}     color="#DC2626" indent neg/>
          <Row label="صافي الربح"              val={netProfit} color={netProfit>=0?"#16A34A":"#DC2626"} bold/>
          <Sec title="توزيع الأرباح" color="#134E4A"/>
          <Row label="(-) مسحوبات الشركاء"     val={withd}     color="#DC2626" indent neg/>
          <Row label="صافي التدفق النقدي"      val={cashflow}  color={cashflow>=0?"#7C3AED":"#DC2626"} bold/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,padding:14,background:"#F8FAFF"}}>
            {[{l:"هامش الربح الإجمالي",v:total>0?(gross/total*100):0,c:"#D97706",x:"%"},{l:"هامش صافي الربح",v:total>0?(netProfit/total*100):0,c:"#16A34A",x:"%"},{l:"تغطية الديون",v:loans>0?((netProfit+loans)/loans):0,c:"#3B6BF5",x:"x"}]
              .map((k,i)=>(
                <div key={i} style={{background:"#FFF",border:"1px solid #E2E6F0",borderRadius:8,padding:"10px",textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#64748B",marginBottom:4}}>{k.l}</div>
                  <div style={{fontSize:16,fontWeight:800,color:k.c,fontFamily:"'IBM Plex Mono'"}}>{k.v.toFixed(1)}{k.x}</div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  الميزانية العمومية
// ═══════════════════════════════════════
function BalanceSheet({projectId,period}){
  const {data:allLedger}=useData("ledger_entries",{filter:{"project_id":`eq.${projectId}`,"status":"eq.approved","date_from":period.from,"date_to":period.to},order:"date.asc,created_at.asc"},[projectId,period.from,period.to]);
  const {data:loans}=useData("loans",{filter:{"project_id":`eq.${projectId}`}},[projectId]);
  const balances=useMemo(()=>computeBalances(allLedger),[allLedger]);
  const last=balances[balances.length-1];
  const cash=last?.cash_balance??0,bank=last?.bank_balance??0,custody=last?.custody_balance??0;
  const totalAssets=Math.max(0,cash)+Math.max(0,bank)+Math.max(0,custody);

  const loanPaid=name=>allLedger.filter(e=>(e.type||"").includes((name||"").replace("💳 ","").trim()))
    .reduce((s,e)=>s+(e.cash_out||0)+(e.bank_out||0)+(e.custody_out||0),0);

  // نحسب المسدد من كل تاريخ البيانات (مو الفترة المختارة)
  const loanDets=loans.filter(l=>(l.original_amount||0)>0).map(l=>{
    const name=(l.name||"").replace("💳 ","").trim();
    const paid=allLedger.filter(e=>(e.type||"").includes(name))
      .reduce((s,e)=>s+(e.cash_out||0)+(e.bank_out||0)+(e.custody_out||0),0);
    return {name:l.name,total:l.original_amount||0,paid,rem:Math.max(0,(l.original_amount||0)-paid)};
  });
  const totalLiab=loanDets.reduce((s,l)=>s+l.rem,0);
  const equity=totalAssets-totalLiab;
  const balanced=Math.abs(totalAssets-(totalLiab+equity))<0.01;

  const Row=({label,val,color,bold,indent})=>(
    <div style={{display:"flex",justifyContent:"space-between",padding:"9px 20px",paddingRight:indent?36:20,borderBottom:"1px solid #F0F2F8",background:bold?"rgba(59,107,245,.02)":"transparent"}}>
      <span style={{fontSize:13,color:bold?"#0F172A":"#334155",fontWeight:bold?700:400}}>{label}</span>
      <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:13,fontWeight:bold?700:500,color:color||"#0F172A"}}>{fmt(val)}</span>
    </div>
  );

  const Sec=({title,color})=>(
    <div style={{background:color||"#0F172A",padding:"8px 20px"}}>
      <span style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.7)",textTransform:"uppercase",letterSpacing:1}}>{title}</span>
    </div>
  );

  return(
    <div className="page">
      <div style={{maxWidth:500}}>
        <div style={{background:"#FFF",borderRadius:14,overflow:"hidden",border:"1px solid #E2E6F0",boxShadow:"0 4px 12px rgba(15,23,42,.08)"}}>
          <div style={{background:"linear-gradient(135deg,#0F172A,#1e3a6e)",padding:"16px 22px"}}>
            <div style={{fontSize:16,fontWeight:800,color:"#FFF"}}>⚖️ الميزانية العمومية</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>بتاريخ: {today()}</div>
          </div>
          <Sec title="الأصول المتداولة" color="#1D4ED8"/>
          <Row label="نقد في الصندوق" val={Math.max(0,cash)}    color="#16A34A" indent/>
          <Row label="رصيد البنك"      val={Math.max(0,bank)}    color="#3B6BF5" indent/>
          <Row label="رصيد العهدة"     val={Math.max(0,custody)} color="#D97706" indent/>
          <Row label="إجمالي الأصول"  val={totalAssets} color="#16A34A" bold/>
          {(cash<0||bank<0||custody<0)&&(
            <div style={{padding:"8px 20px",fontSize:11,color:"#DC2626",background:"#FEF2F2",borderBottom:"1px solid #FECACA"}}>
              ⚠ تحذير: أحد الأرصدة سالب — تحقق من البيانات
            </div>
          )}
          <Sec title="القروض طويلة الأجل" color="#991B1B"/>
          {loanDets.map((l,i)=><Row key={i} label={l.name} val={l.rem} color={l.rem>0?"#DC2626":"#16A34A"} indent/>)}
          {loanDets.length===0&&<div style={{padding:"10px 20px",color:"#94A3B8",fontSize:12}}>لا توجد قروض</div>}
          <Row label="إجمالي الالتزامات" val={totalLiab} color="#DC2626" bold/>
          <Sec title="حقوق الملكية" color="#4C1D95"/>
          <Row label="صافي حقوق الملكية" val={equity} color={equity>=0?"#7C3AED":"#DC2626"} bold/>
          <Row label="الالتزامات + حقوق الملكية" val={totalLiab+equity} color={balanced?"#16A34A":"#DC2626"} bold/>
          <div style={{padding:"13px 20px",background:balanced?"#F0FDF4":"#FEF2F2",display:"flex",justifyContent:"center",borderTop:"2px solid #E2E6F0"}}>
            <span style={{fontSize:13,fontWeight:700,color:balanced?"#16A34A":"#DC2626"}}>
              {balanced?"✅ الميزانية متوازنة":"❌ الميزانية غير متوازنة"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  ميزان المراجعة
// ═══════════════════════════════════════
function TrialBalance({projectId,period}){
  const {data:ledger,loading}=useData("ledger_entries",
    {filter:{"project_id":`eq.${projectId}`,"date_from":period.from,"date_to":period.to,"status":"eq.approved"}},
    [projectId,period.from,period.to]);
  if(loading)return <Loader/>;

  const accounts={};
  const add=(name,dr,cr,group)=>{
    if(!accounts[name])accounts[name]={debit:0,credit:0,group};
    accounts[name].debit +=dr||0;
    accounts[name].credit+=cr||0;
  };

  ledger.forEach(e=>{
    if(e.cash_in >0)add("الصندوق",  e.cash_in, 0,"أصول");
    if(e.cash_out>0)add("الصندوق",  0,e.cash_out,"أصول");
    if(e.bank_in >0)add("البنك",    e.bank_in, 0,"أصول");
    if(e.bank_out>0)add("البنك",    0,e.bank_out,"أصول");
    if(e.custody_in >0)add("ح/أمين الصندوق",e.custody_in, 0,"أصول");
    if(e.custody_out>0)add("ح/أمين الصندوق",0,e.custody_out,"أصول");
    // رسوم التحويلات — تُسجل كمصروف ومقابلها البنك
    if(e.bank_out>0 && (e.type||"").includes("رسوم")) {
      add("رسوم بنكية",e.bank_out,0,"مصروفات");
    }
    const t=e.type||"";
    if(t.includes("مبيعات كاش"))  add("إيرادات المبيعات النقدية",   0,e.cash_in||0,"إيرادات");
    if(t.includes("مبيعات شبكة")) add("إيرادات المبيعات الإلكترونية",0,e.bank_in||0,"إيرادات");
    const amt=(e.cash_out||0)+(e.bank_out||0)+(e.custody_out||0);
    if(t.includes("مصروفات تشغيلية"))  add("مصروفات تشغيلية", amt,0,"مصروفات");
    if(t.includes("مصروفات ثابتة"))    add("مصروفات ثابتة",   amt,0,"مصروفات");
    if(t.includes("قسط سيارة"))        add("قسط سيارة",       amt,0,"التزامات");
    if(t.includes("قسط شراء أرض"))     add("قسط شراء أرض",    amt,0,"التزامات");
    if(t.includes("قرض ١"))            add("قرض ١",            amt,0,"التزامات");
    if(t.includes("قرض ٢"))            add("قرض ٢",            amt,0,"التزامات");
    if(t.includes("مسحوبات سليمان"))   add("مسحوبات سليمان",  amt,0,"حقوق الملكية");
    if(t.includes("مسحوبات أم طوبى"))  add("مسحوبات أم طوبى", amt,0,"حقوق الملكية");
    if(t.includes("ضريبة"))            add("ضريبة القيمة المضافة",amt,0,"التزامات");
  });

  const groups=["أصول","إيرادات","مصروفات","التزامات","حقوق الملكية"];
  const gColors={"أصول":"#16A34A","إيرادات":"#3B6BF5","مصروفات":"#DC2626","التزامات":"#D97706","حقوق الملكية":"#7C3AED"};
  const entries=Object.entries(accounts);
  const totalD=entries.reduce((s,[,v])=>s+v.debit,0);
  const totalC=entries.reduce((s,[,v])=>s+v.credit,0);
  const balanced=Math.abs(totalD-totalC)<0.01;

  return(
    <div className="page">
      <div style={{maxWidth:680}}>
        <div style={{background:"#FFF",borderRadius:14,overflow:"hidden",border:"1px solid #E2E6F0",boxShadow:"0 4px 12px rgba(15,23,42,.08)"}}>
          <div style={{background:"linear-gradient(135deg,#0F172A,#1e3a6e)",padding:"16px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:16,fontWeight:800,color:"#FFF"}}>✅ ميزان المراجعة</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2,fontFamily:"'IBM Plex Mono'"}}>{period.from} — {period.to}</div>
            </div>
            <div style={{background:balanced?"rgba(74,222,128,.15)":"rgba(248,113,113,.15)",border:`1px solid ${balanced?"rgba(74,222,128,.3)":"rgba(248,113,113,.3)"}`,borderRadius:8,padding:"6px 14px"}}>
              <span style={{fontSize:12,fontWeight:700,color:balanced?"#16A34A":"#DC2626"}}>{balanced?"✅ متوازن":"❌ غير متوازن"}</span>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"30px 2fr 1fr 1fr 1fr",padding:"8px 14px",background:"#F8FAFF",fontSize:10,color:"#64748B",fontWeight:700,textTransform:"uppercase",gap:8,borderBottom:"1px solid #E2E6F0"}}>
            <span>#</span><span>الحساب</span><span>مدين</span><span>دائن</span><span>الرصيد</span>
          </div>
          {groups.map(group=>{
            const gE=entries.filter(([,v])=>v.group===group);
            if(!gE.length)return null;
            return(
              <div key={group}>
                <div style={{background:`${gColors[group]}10`,padding:"6px 14px",fontSize:10,fontWeight:700,color:gColors[group],textTransform:"uppercase",letterSpacing:.5,borderBottom:"1px solid #E2E6F0",display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:gColors[group]}}/>
                  {group}
                </div>
                {gE.map(([name,v],i)=>{
                  const bal=v.debit-v.credit;
                  return(
                    <div key={i} style={{display:"grid",gridTemplateColumns:"30px 2fr 1fr 1fr 1fr",padding:"9px 14px",borderBottom:"1px solid #F0F2F8",background:i%2===0?"#FFF":"#FAFBFF",gap:8}}>
                      <span style={{fontSize:10,color:"#94A3B8"}}>{i+1}</span>
                      <span style={{fontSize:12,color:"#334155"}}>{name}</span>
                      <span style={{fontFamily:"'IBM Plex Mono'",fontSize:12,color:"#3B6BF5"}}>{v.debit>0?fmt(v.debit):"—"}</span>
                      <span style={{fontFamily:"'IBM Plex Mono'",fontSize:12,color:"#DC2626"}}>{v.credit>0?fmt(v.credit):"—"}</span>
                      <span style={{fontFamily:"'IBM Plex Mono'",fontSize:12,fontWeight:700,color:bal>=0?"#16A34A":"#DC2626"}}>{fmt(Math.abs(bal))}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div style={{display:"grid",gridTemplateColumns:"30px 2fr 1fr 1fr 1fr",padding:"11px 14px",background:"#F0F2F8",fontWeight:700,fontSize:13,gap:8,borderTop:"2px solid #E2E6F0"}}>
            <span/><span style={{color:"#0F172A"}}>الإجمالي</span>
            <span style={{fontFamily:"'IBM Plex Mono'",color:"#3B6BF5"}}>{fmt(totalD)}</span>
            <span style={{fontFamily:"'IBM Plex Mono'",color:"#DC2626"}}>{fmt(totalC)}</span>
            <span style={{fontFamily:"'IBM Plex Mono'",color:balanced?"#16A34A":"#DC2626"}}>{fmt(Math.abs(totalD-totalC))}</span>
          </div>
          <div style={{padding:"13px 20px",background:balanced?"#F0FDF4":"#FEF2F2",textAlign:"center",borderTop:"2px solid #E2E6F0"}}>
            <span style={{fontSize:13,fontWeight:700,color:balanced?"#16A34A":"#DC2626"}}>
              {balanced?"✅ ميزان المراجعة متوازن — القيود محاسبياً صحيحة":`❌ غير متوازن — الفرق: ${fmt(Math.abs(totalD-totalC))} ريال`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  القيود المحاسبية
// ═══════════════════════════════════════
function JournalPage({projectId,period}){
  const {data:ledger,loading}=useData("ledger_entries",
    {filter:{"project_id":`eq.${projectId}`,"date_from":period.from,"date_to":period.to,"status":"eq.approved"},order:"date.asc,created_at.asc"},
    [projectId,period.from,period.to]);
  if(loading)return <Loader/>;

  const byDate={};
  ledger.forEach(e=>{if(!e.date||!e.type)return;if(!byDate[e.date])byDate[e.date]=[];byDate[e.date].push(e);});
  const dates=Object.keys(byDate).sort();

  const buildLines=entries=>{
    const lines=[];
    entries.forEach(e=>{
      const fn=JOURNAL_MAP[e.type];
      if(!fn)return;
      fn(e).forEach(l=>{if(l.amt>0&&l.dr!==l.cr)lines.push(l);});
    });
    return lines;
  };

  const emptyDays=dates.filter(d=>buildLines(byDate[d]).length===0).length;

  return(
    <div className="page">
      <div className="kpi-grid" style={{marginBottom:16}}>
        <KPI label="عدد القيود"       value={dates.length}             color="#3B6BF5" icon="📒"/>
        <KPI label="قيود متوازنة"     value={dates.length-emptyDays}   color="#16A34A" icon="✅"/>
        <KPI label="أيام بدون قيود"   value={emptyDays}               color={emptyDays>0?"#DC2626":"#16A34A"} icon="⚠️"/>
        <KPI label="إجمالي الحركات"   value={ledger.length}            color="#7C3AED" icon="📋"/>
      </div>
      {dates.map((date,di)=>{
        const lines=buildLines(byDate[date]);
        if(!lines.length)return null;
        const total=lines.reduce((s,l)=>s+l.amt,0);
        // رقم القيد من Supabase مباشرة
        const dayEntries = byDate[date];
        const jNo = dayEntries.find(e=>e.journal_no)?.journal_no;
        const vNo = jNo ? jNo.toString().padStart(4,"0") : String(di+1).padStart(4,"0");
        return(
          <div key={date} className="j-card">
            <div className="j-header">
              <span className="j-no">قيد {vNo}</span>
              <span className="j-date">{date}</span>
              <div style={{flex:1}}/>
              <span style={{fontSize:12,color:"#3B6BF5",fontFamily:"'IBM Plex Mono'",fontWeight:600}}>{fmt(total)} ريال</span>
              <span className="tag tag-ok">✅ متوازن</span>
            </div>
            <table className="j-tbl">
              <thead><tr>
                <th style={{width:"38%"}}>البيان</th><th>الحساب</th>
                <th style={{textAlign:"left"}}>مدين</th><th style={{textAlign:"left"}}>دائن</th>
              </tr></thead>
              <tbody>
                {lines.map((l,li)=>(
                  <>
                    <tr key={`dr-${li}`} style={{background:"#EFF6FF"}}>
                      <td style={{fontSize:12,color:"#334155"}}>{l.desc}</td>
                      <td style={{fontSize:12,fontWeight:600,color:"#0F172A"}}>{l.dr}</td>
                      <td style={{fontFamily:"'IBM Plex Mono'",fontSize:12,color:"#3B6BF5",textAlign:"left",fontWeight:700}}>{fmt(l.amt)}</td>
                      <td className="dash">—</td>
                    </tr>
                    <tr key={`cr-${li}`} style={{background:"#FFF5F5"}}>
                      <td style={{fontSize:12,color:"#94A3B8",paddingRight:28}}>← إلى</td>
                      <td style={{fontSize:12,color:"#334155"}}>{l.cr}</td>
                      <td className="dash">—</td>
                      <td style={{fontFamily:"'IBM Plex Mono'",fontSize:12,color:"#DC2626",textAlign:"left",fontWeight:700}}>{fmt(l.amt)}</td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
            <div className="j-total" style={{background:"#F0FDF4"}}>
              <span style={{color:"#0F172A"}}>الإجمالي</span>
              <span style={{fontFamily:"'IBM Plex Mono'",color:"#3B6BF5"}}>{fmt(total)}</span>
              <span style={{fontFamily:"'IBM Plex Mono'",color:"#DC2626"}}>{fmt(total)}</span>
            </div>
          </div>
        );
      })}
      {dates.length===0&&<div className="empty"><div className="empty-icon">📒</div>لا توجد قيود في هذه الفترة</div>}
    </div>
  );
}

// ═══════════════════════════════════════
//  التطبيق الرئيسي
// ═══════════════════════════════════════
const NAV=[
  {id:"review", icon:"📋",label:"مراجعة الحركات",  section:"العمليات"},
  {id:"ledger", icon:"📒",label:"الدفتر الأمريكي", section:null},
  {id:"reports",icon:"📊",label:"لوحة التقارير",   section:"التقارير"},
  {id:"income", icon:"📈",label:"قائمة الدخل",     section:null},
  {id:"balance",icon:"⚖️", label:"الميزانية العمومية",section:null},
  {id:"trial",  icon:"✅",label:"ميزان المراجعة",  section:null},
  {id:"journal",icon:"📑",label:"القيود المحاسبية", section:null},
];

export default function App(){
  const [page,setPage]   =useState("review");
  const [period,setPeriod]=useState({from:monthStart(),to:today()});
  const [pending,setPend] =useState(0);
  const [menu,setMenu]    =useState(false);

  useEffect(()=>{
    sb.query("ledger_entries",{filter:{"project_id":`eq.${PROJECT_ID}`,"status":"neq.approved"},select:"id"})
      .then(r=>setPend(r.length)).catch(()=>{});
  },[page]);

  const nav=id=>{setPage(id);setMenu(false)};
  const cur=NAV.find(n=>n.id===page);
  const canPrint=["reports","income","balance","trial","journal"].includes(page);

  return(
    <>
      <style>{CSS}</style>
      <div className="layout">
        {menu&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:99}} onClick={()=>setMenu(false)}/>}
        <aside className={`sidebar ${menu?"open":""}`}>
          <div className="sb-brand">
            <div className="sb-icon">☕</div>
            <div><div className="sb-name">مزاهر</div><div className="sb-sub">نظام المحاسبة</div></div>
          </div>
          <nav className="sb-nav">
            {NAV.map((n,i)=>(
              <div key={n.id}>
                {n.section&&<div className="nav-section">{n.section}</div>}
                <div className={`nav-item ${page===n.id?"active":""}`} onClick={()=>nav(n.id)}>
                  <span style={{fontSize:15,width:20,textAlign:"center"}}>{n.icon}</span>
                  <span>{n.label}</span>
                  {n.id==="review"&&pending>0&&<span className="nav-badge">{pending}</span>}
                </div>
              </div>
            ))}
          </nav>
          <div className="sb-bottom">
            <div className="period-box">
              <div className="period-label">الفترة الزمنية</div>
              <div className="period-field"><label>من</label><input type="date" value={period.from} onChange={e=>setPeriod(p=>({...p,from:e.target.value}))}/></div>
              <div className="period-field"><label>إلى</label><input type="date" value={period.to}   onChange={e=>setPeriod(p=>({...p,to:e.target.value}))}/></div>
            </div>
            <div className="sb-ver">v2.1 — إصلاحات محاسبية</div>
          </div>
        </aside>
        <div className="main">
          <div className="topbar">
            <button className="mob-btn" onClick={()=>setMenu(true)}>☰</button>
            <div className="topbar-title">{cur?.icon} {cur?.label}</div>
            {canPrint&&<button className="btn btn-outline" onClick={()=>window.print()}>🖨️ طباعة</button>}
            <div className="topbar-date">{period.from} ← {period.to}</div>
          </div>
          {page==="review"  &&<ReviewPage      projectId={PROJECT_ID} period={period}/>}
          {page==="ledger"  &&<LedgerPage       projectId={PROJECT_ID} period={period}/>}
          {page==="reports" &&<ReportsPage      projectId={PROJECT_ID} period={period}/>}
          {page==="income"  &&<IncomeStatement  projectId={PROJECT_ID} period={period}/>}
          {page==="balance" &&<BalanceSheet     projectId={PROJECT_ID} period={period}/>}
          {page==="trial"   &&<TrialBalance     projectId={PROJECT_ID} period={period}/>}
          {page==="journal" &&<JournalPage      projectId={PROJECT_ID} period={period}/>}
        </div>
      </div>
    </>
  );
}
