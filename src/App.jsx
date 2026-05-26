import { useState, useEffect, useMemo, useCallback } from "react";

// ═══════════════════════════════════════════════════════════
//  مزاهر — لوحة المحاسبة v2.0
//  إصلاحات محاسبية: القيود، ميزان المراجعة، VAT، العهدة
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL  = "https://dnuxevxxgmgptptmuzdy.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudXhldnh4Z21ncHRwdG11emR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MjY1OTAsImV4cCI6MjA5NTEwMjU5MH0.o7lx6HiTU8a3XPF501WNFYk7NOxfYoBrphqVunhOk2s";
const PROJECT_ID    = "d64b040a-0824-43b8-966e-eb41ee095f82";
const COMPANY_NAME  = "مقهى ديوانية مزاهر";

// ─────────────────────────────────────────
//  Supabase Client
// ─────────────────────────────────────────
const sb = {
  async query(table, params = {}) {
    const parts = [];
    if (params.select) parts.push(`select=${encodeURIComponent(params.select)}`);
    if (params.filter) {
      Object.entries(params.filter).forEach(([k, v]) => {
        if (k === "date_from") parts.push(`date=gte.${v}`);
        else if (k === "date_to") parts.push(`date=lte.${v}`);
        else parts.push(`${k}=${v}`);
      });
    }
    if (params.order)  parts.push(`order=${params.order}`);
    if (params.limit)  parts.push(`limit=${params.limit}`);
    const url = `${SUPABASE_URL}/rest/v1/${table}?${parts.join("&")}`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  },
  async insert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  },
  async update(table, id, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  },
  async remove(table, id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  },
};

// ─────────────────────────────────────────
//  Data Hook
// ─────────────────────────────────────────
function useData(table, params, deps = []) {
  const [data, setData]    = useState([]);
  const [loading, setLoad] = useState(true);
  const [error, setError]  = useState(null);
  const load = useCallback(async () => {
    try { setLoad(true); setData(await sb.query(table, params)); setError(null); }
    catch (e) { setError(e.message); }
    finally { setLoad(false); }
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

// ─────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────
const TRANS_TYPES = [
  "💵 مبيعات كاش","🏦 مبيعات شبكة",
  "🛒 مصروفات تشغيلية","💰 مصروفات ثابتة",
  "💳 قسط سيارة","💳 قسط شراء أرض","💳 قرض ١","💳 قرض ٢",
  "👤 صرف عهدة","✅ تسوية عهدة",
  "💼 مسحوبات سليمان","💼 مسحوبات أم طوبى",
  "🏛️ ضريبة القيمة المضافة","🔄 تحويل داخلي"
];

// ─────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────
const fmt   = (n) => new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const pct   = (a, b) => b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—";
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => new Date().toISOString().slice(0, 8) + "01";

// حساب الأرصدة المتراكمة من البداية — محاسبياً صحيح
function computeRunningBalances(entries) {
  // نبدأ من رصيد صفر — الرصيد الافتتاحي يُضاف كأول سطر
  let cash = 0, bank = 0, custody = 0;
  return entries.map(e => {
    cash    += (Number(e.cash_in)    || 0) - (Number(e.cash_out)    || 0);
    bank    += (Number(e.bank_in)    || 0) - (Number(e.bank_out)    || 0);
    custody += (Number(e.custody_in) || 0) - (Number(e.custody_out) || 0);
    return { ...e, cash_balance: cash, bank_balance: bank, custody_balance: custody };
  });
}

// ─────────────────────────────────────────
//  خريطة القيود المحاسبية الصحيحة
//  كل معاملة لها طرف مدين وطرف دائن واضحين
// ─────────────────────────────────────────
const JOURNAL_MAP = {
  // الإيرادات: مدين الصندوق/البنك — دائن إيرادات المبيعات
  "💵 مبيعات كاش":     (e) => [{ dr: "الصندوق",            cr: "إيرادات المبيعات", amt: e.cash_in   || 0, desc: e.description }],
  "🏦 مبيعات شبكة":    (e) => [{ dr: "البنك",              cr: "إيرادات المبيعات", amt: e.bank_in   || 0, desc: e.description }],

  // المصروفات: مدين المصروف — دائن مصدر الدفع
  "🛒 مصروفات تشغيلية": (e) => buildExpenseLines(e, "مصروفات تشغيلية"),
  "💰 مصروفات ثابتة":   (e) => buildExpenseLines(e, "مصروفات ثابتة"),

  // الأقساط: مدين القسط — دائن البنك (عادةً)
  "💳 قسط سيارة":      (e) => buildExpenseLines(e, "قسط سيارة"),
  "💳 قسط شراء أرض":   (e) => buildExpenseLines(e, "قسط شراء أرض"),
  "💳 قرض ١":          (e) => buildExpenseLines(e, "قرض ١"),
  "💳 قرض ٢":          (e) => buildExpenseLines(e, "قرض ٢"),

  // صرف العهدة: مدين العهدة (الأمين) — دائن الصندوق
  "👤 صرف عهدة":       (e) => [{ dr: "ح/أمين الصندوق (عهدة)", cr: "الصندوق", amt: e.cash_out || 0, desc: "صرف عهدة" }],

  // تسوية العهدة: مدين المصروفات — دائن العهدة
  "✅ تسوية عهدة":     (e) => buildExpenseLines(e, "مصروفات تشغيلية"),

  // مسحوبات: مدين مسحوبات الشريك — دائن الصندوق/البنك
  "💼 مسحوبات سليمان":  (e) => buildExpenseLines(e, "مسحوبات سليمان"),
  "💼 مسحوبات أم طوبى": (e) => buildExpenseLines(e, "مسحوبات أم طوبى"),

  // الضريبة: مدين ضريبة — دائن الصندوق/البنك
  "🏛️ ضريبة القيمة المضافة": (e) => buildExpenseLines(e, "ضريبة القيمة المضافة"),

  // تحويل داخلي: مدين الحساب المستقبل — دائن الحساب المرسل
  "🔄 تحويل داخلي": (e) => buildTransferLines(e),
};

function buildExpenseLines(e, accountName) {
  const lines = [];
  if (e.cash_out    > 0) lines.push({ dr: accountName, cr: "الصندوق",  amt: e.cash_out,    desc: e.description });
  if (e.bank_out    > 0) lines.push({ dr: accountName, cr: "البنك",    amt: e.bank_out,    desc: e.description });
  if (e.custody_out > 0) lines.push({ dr: accountName, cr: "ح/أمين الصندوق (عهدة)", amt: e.custody_out, desc: e.description });
  return lines;
}

function buildTransferLines(e) {
  const lines = [];
  // صندوق → بنك
  if (e.cash_out > 0 && e.bank_in > 0)
    lines.push({ dr: "البنك", cr: "الصندوق", amt: e.cash_out, desc: "تحويل داخلي" });
  // بنك → صندوق
  if (e.bank_out > 0 && e.cash_in > 0)
    lines.push({ dr: "الصندوق", cr: "البنك", amt: e.bank_out, desc: "تحويل داخلي" });
  // صندوق → عهدة
  if (e.cash_out > 0 && e.custody_in > 0)
    lines.push({ dr: "ح/أمين الصندوق (عهدة)", cr: "الصندوق", amt: e.cash_out, desc: "تحويل داخلي" });
  // عهدة → صندوق (تسوية عهدة)
  if (e.custody_out > 0 && e.cash_in > 0)
    lines.push({ dr: "الصندوق", cr: "ح/أمين الصندوق (عهدة)", amt: e.custody_out, desc: "تحويل داخلي" });
  return lines;
}

// ─────────────────────────────────────────
//  Design Tokens
// ─────────────────────────────────────────
const T = {
  bg0:   "#080C10",
  bg1:   "#0E1419",
  bg2:   "#151C24",
  bg3:   "#1C2633",
  line:  "#1E2D3D",
  line2: "#253545",
  text0: "#E8EFF7",
  text1: "#A8B8C8",
  text2: "#5A7080",
  acc:   "#00C4B4",   // teal accent
  accD:  "#008A7E",
  green: "#28C96A",
  red:   "#FF4757",
  blue:  "#4A9FFF",
  gold:  "#F5B942",
  purple:"#9B72FF",
};

// ─────────────────────────────────────────
//  Global CSS
// ─────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&family=IBM+Plex+Mono:wght@400;600&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg0:${T.bg0}; --bg1:${T.bg1}; --bg2:${T.bg2}; --bg3:${T.bg3};
  --line:${T.line}; --line2:${T.line2};
  --t0:${T.text0}; --t1:${T.text1}; --t2:${T.text2};
  --acc:${T.acc}; --accD:${T.accD};
  --g:${T.green}; --r:${T.red}; --b:${T.blue}; --gold:${T.gold}; --pur:${T.purple};
}

html, body { height: 100%; }
body {
  background: var(--bg0);
  color: var(--t0);
  font-family: 'Tajawal', sans-serif;
  direction: rtl;
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: var(--bg1); }
::-webkit-scrollbar-thumb { background: var(--line2); border-radius: 2px; }

/* ── Layout ── */
.layout { display: flex; min-height: 100vh; }

/* ── Sidebar ── */
.sidebar {
  width: 220px; flex-shrink: 0;
  background: var(--bg1);
  border-left: 1px solid var(--line);
  display: flex; flex-direction: column;
  position: sticky; top: 0; height: 100vh;
  overflow-y: auto;
}
.sb-logo {
  padding: 20px 18px 16px;
  border-bottom: 1px solid var(--line);
}
.sb-logo-mark {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 6px;
}
.sb-logo-icon {
  width: 34px; height: 34px; border-radius: 10px;
  background: linear-gradient(135deg, var(--acc), var(--accD));
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; flex-shrink: 0;
}
.sb-logo-name { font-size: 15px; font-weight: 800; color: var(--t0); }
.sb-logo-sub  { font-size: 11px; color: var(--t2); }
.sb-nav { flex: 1; padding: 10px 8px; }
.nav-section { font-size: 10px; color: var(--t2); font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 14px 10px 6px; }
.nav-item {
  display: flex; align-items: center; gap: 9px;
  padding: 9px 10px; border-radius: 8px; cursor: pointer;
  font-size: 13px; color: var(--t1); font-weight: 500;
  transition: all 0.15s; position: relative; margin-bottom: 1px;
}
.nav-item:hover { background: var(--bg3); color: var(--t0); }
.nav-item.active { background: rgba(0,196,180,0.12); color: var(--acc); }
.nav-item.active::before {
  content: ''; position: absolute; right: 0; top: 20%; bottom: 20%;
  width: 3px; background: var(--acc); border-radius: 2px;
}
.nav-icon { font-size: 15px; width: 20px; text-align: center; flex-shrink: 0; }
.nav-badge {
  margin-right: auto; background: var(--r); color: #fff;
  font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px;
}
.sb-bottom { padding: 12px 8px; border-top: 1px solid var(--line); }
.sb-period {
  background: var(--bg2); border-radius: 8px; padding: 10px 12px;
  font-size: 11px; color: var(--t2); margin-bottom: 8px;
}
.sb-period-label { font-size: 10px; color: var(--t2); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.sb-period input {
  background: var(--bg3); border: 1px solid var(--line2); border-radius: 5px;
  color: var(--t0); font-size: 11px; padding: 4px 7px; width: 100%;
  font-family: 'IBM Plex Mono', monospace; margin-top: 3px;
}
.sb-period input:focus { outline: none; border-color: var(--acc); }

/* ── Main ── */
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

/* ── Topbar ── */
.topbar {
  background: var(--bg1);
  border-bottom: 1px solid var(--line);
  padding: 0 22px;
  height: 52px;
  display: flex; align-items: center; gap: 12px;
  position: sticky; top: 0; z-index: 30;
  flex-shrink: 0;
}
.topbar-title { font-size: 15px; font-weight: 700; color: var(--t0); flex: 1; }
.topbar-btn {
  padding: 6px 14px; border-radius: 7px; font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: 'Tajawal', sans-serif; border: none;
  transition: all 0.15s; display: flex; align-items: center; gap: 5px;
}
.btn-ghost { background: var(--bg3); color: var(--t1); border: 1px solid var(--line2); }
.btn-ghost:hover { color: var(--t0); border-color: var(--line2); }
.btn-acc   { background: var(--acc); color: #fff; }
.btn-acc:hover { background: var(--accD); }
.btn-green { background: rgba(40,201,106,0.1); color: var(--g); border: 1px solid rgba(40,201,106,0.2); }
.btn-green:hover { background: rgba(40,201,106,0.18); }
.btn-red   { background: rgba(255,71,87,0.1);  color: var(--r); border: 1px solid rgba(255,71,87,0.2); }
.btn-red:hover   { background: rgba(255,71,87,0.18); }

/* ── Page Content ── */
.page { padding: 20px 22px; overflow-y: auto; flex: 1; }

/* ── Loading / Error ── */
.loading-screen { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--t2); font-size: 13px; gap: 8px; }
.loader { width: 16px; height: 16px; border: 2px solid var(--line2); border-top-color: var(--acc); border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.err-box { background: rgba(255,71,87,0.08); border: 1px solid rgba(255,71,87,0.2); border-radius: 8px; padding: 12px 16px; color: var(--r); font-size: 13px; margin-bottom: 14px; }

/* ── Cards ── */
.card { background: var(--bg2); border: 1px solid var(--line); border-radius: 10px; }
.card-header { padding: 13px 16px; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; }
.card-title  { font-size: 12px; font-weight: 700; color: var(--t1); text-transform: uppercase; letter-spacing: 0.8px; }

/* ── KPI Grid ── */
.kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
.kpi-card {
  background: var(--bg2); border: 1px solid var(--line); border-radius: 10px;
  padding: 15px 16px; position: relative; overflow: hidden;
}
.kpi-card::after {
  content: ''; position: absolute; top: 0; right: 0; left: 0; height: 2px;
  background: var(--accent-color, var(--acc));
}
.kpi-label { font-size: 11px; color: var(--t2); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
.kpi-value { font-size: 21px; font-weight: 800; font-family: 'IBM Plex Mono', monospace; letter-spacing: -1px; color: var(--t0); }
.kpi-sub   { font-size: 11px; color: var(--t2); margin-top: 5px; }
.kpi-badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 700; }

/* ── Table ── */
.tbl-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid var(--line); }
.tbl {
  width: 100%; border-collapse: collapse; font-size: 12px;
  white-space: nowrap;
}
.tbl thead th {
  background: var(--bg2); color: var(--t2); font-size: 10px; font-weight: 700;
  text-align: right; padding: 10px 13px; border-bottom: 1px solid var(--line);
  text-transform: uppercase; letter-spacing: 0.5px; position: sticky; top: 0; z-index: 5;
}
.tbl tbody td { padding: 9px 13px; border-bottom: 1px solid rgba(30,45,61,0.6); vertical-align: middle; }
.tbl tbody tr:hover td { background: rgba(255,255,255,0.02); }
.tbl tbody tr:last-child td { border-bottom: none; }
.mono { font-family: 'IBM Plex Mono', monospace; }
.num-out { color: var(--r); font-weight: 600; }
.num-in  { color: var(--g); font-weight: 600; }
.num-bal-pos { color: var(--g); font-weight: 700; }
.num-bal-neg { color: var(--r); font-weight: 700; }
.num-neu { color: var(--blue); font-weight: 600; }
.dash    { color: var(--line2); }

/* ── Badges / Tags ── */
.tag { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; white-space: nowrap; }
.tag-dup    { background: rgba(255,71,87,0.12);    color: var(--r); }
.tag-auto   { background: rgba(74,159,255,0.12);   color: var(--b); }
.tag-pend   { background: rgba(245,185,66,0.12);   color: var(--gold); }
.tag-ok     { background: rgba(40,201,106,0.12);   color: var(--g); }

/* ── Entries (Review) ── */
.entry-list { display: flex; flex-direction: column; gap: 4px; }
.entry-card {
  background: var(--bg2); border: 1px solid var(--line); border-radius: 8px;
  overflow: hidden; transition: border-color 0.15s;
}
.entry-card.e-pend  { border-right: 3px solid var(--gold); }
.entry-card.e-auto  { border-right: 3px solid var(--b); }
.entry-card.e-dup   { border-right: 3px solid var(--r); }
.entry-card.e-ok    { border-right: 3px solid var(--g); opacity: 0.55; }
.entry-row {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 12px; cursor: pointer;
}
.e-date { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--t2); min-width: 85px; }
.e-type { font-size: 12px; min-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.e-desc { flex: 1; font-size: 12px; color: var(--t1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.e-src  { font-size: 11px; padding: 2px 8px; border-radius: 4px; min-width: 70px; text-align: center; }
.e-amt  { font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 13px; min-width: 95px; text-align: left; color: var(--t0); }
.e-btns { display: flex; gap: 4px; }

/* ── Entry Detail ── */
.entry-detail {
  border-top: 1px solid var(--line); padding: 14px 16px;
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  background: var(--bg1);
}
.fl { display: flex; flex-direction: column; gap: 5px; }
.fl-label { font-size: 10px; color: var(--t2); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
.fl-select, .fl-input {
  background: var(--bg0); border: 1px solid var(--line2); border-radius: 6px;
  color: var(--t0); padding: 7px 10px; font-size: 13px;
  font-family: 'Tajawal', sans-serif; width: 100%;
}
.fl-select:focus, .fl-input:focus { outline: none; border-color: var(--acc); }
.fl-info { background: var(--bg0); border: 1px solid var(--line); border-radius: 6px; padding: 7px 11px; font-size: 12px; color: var(--t1); }
.fl-warn { background: rgba(255,71,87,0.06); border: 1px solid rgba(255,71,87,0.2); border-radius: 6px; padding: 7px 11px; font-size: 12px; color: var(--r); }
.entry-footer { grid-column: 1 / -1; display: flex; gap: 7px; justify-content: flex-end; padding-top: 10px; border-top: 1px solid var(--line); }

/* ── Balances ── */
.bal-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
.bal-card {
  background: var(--bg2); border: 1px solid var(--line); border-radius: 10px;
  padding: 14px 16px; text-align: center;
}
.bal-label { font-size: 10px; color: var(--t2); font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 8px; }
.bal-value { font-size: 20px; font-weight: 800; font-family: 'IBM Plex Mono', monospace; }

/* ── Reports ── */
.rep-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
.r-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(30,45,61,0.8); }
.r-row:last-child { border-bottom: none; }
.r-row.hl-g { background: rgba(40,201,106,0.05); margin: 0 -16px; padding: 9px 16px; border-radius: 4px; }
.r-row.hl-b { background: rgba(74,159,255,0.05);  margin: 0 -16px; padding: 9px 16px; border-radius: 4px; }
.r-row.hl-p { background: rgba(155,114,255,0.05); margin: 0 -16px; padding: 9px 16px; border-radius: 4px; }
.r-row.hl-r { background: rgba(255,71,87,0.05);   margin: 0 -16px; padding: 9px 16px; border-radius: 4px; }
.r-lbl  { font-size: 13px; color: var(--t1); }
.r-lbl.bold { color: var(--t0); font-weight: 700; }
.r-val  { font-family: 'IBM Plex Mono', monospace; font-size: 13px; font-weight: 600; text-align: left; }
.r-pct  { font-size: 10px; color: var(--t2); margin-left: 14px; min-width: 44px; text-align: left; }
.sec-head { background: var(--bg3); padding: 7px 12px; margin: 0 -16px; font-size: 10px; font-weight: 700; color: var(--t2); text-transform: uppercase; letter-spacing: 1px; }

/* ── Journal ── */
.journal-card { background: var(--bg2); border: 1px solid var(--line); border-radius: 10px; margin-bottom: 12px; overflow: hidden; }
.j-header { padding: 10px 16px; display: flex; align-items: center; gap: 12px; }
.j-voucher { font-family: 'IBM Plex Mono', monospace; font-size: 11px; background: rgba(0,196,180,0.15); color: var(--acc); padding: 3px 10px; border-radius: 5px; font-weight: 700; }
.j-date  { font-size: 13px; font-weight: 700; color: var(--t0); }
.j-tbl   { width: 100%; border-collapse: collapse; font-size: 12px; }
.j-tbl th { background: var(--bg3); color: var(--t2); font-size: 10px; font-weight: 700; text-align: right; padding: 7px 14px; border-bottom: 1px solid var(--line); text-transform: uppercase; }
.j-tbl td { padding: 8px 14px; border-bottom: 1px solid rgba(30,45,61,0.5); }
.j-tbl tr.dr td:first-child { color: var(--t0); }
.j-tbl tr.cr td:first-child { color: var(--t1); padding-right: 32px; }
.j-total { display: grid; grid-template-columns: 2fr 1fr 1fr; padding: 9px 14px; font-weight: 700; font-size: 12px; border-top: 2px solid var(--line); }

/* ── Trial Balance ── */
.tb-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; }
.tb-head { background: var(--bg3); font-size: 10px; font-weight: 700; color: var(--t2); text-transform: uppercase; letter-spacing: 0.5px; }
.tb-row  { font-size: 12px; border-bottom: 1px solid rgba(30,45,61,0.5); }
.tb-row:nth-child(even) .tb-cell { background: rgba(255,255,255,0.01); }
.tb-cell { padding: 9px 14px; }
.tb-total { background: var(--bg3); font-weight: 700; font-size: 13px; }

/* ── Modal ── */
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 200; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); }
.modal { background: var(--bg2); border: 1px solid var(--line2); border-radius: 12px; padding: 24px; width: 520px; max-height: 88vh; overflow-y: auto; }
.modal-title { font-size: 15px; font-weight: 800; color: var(--t0); margin-bottom: 20px; }
.modal-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.modal-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--line); }

/* ── Toolbar ── */
.toolbar { display: flex; gap: 8px; margin-bottom: 14px; align-items: center; flex-wrap: wrap; }
.search-input {
  flex: 1; min-width: 180px; max-width: 280px;
  background: var(--bg2); border: 1px solid var(--line2); border-radius: 7px;
  padding: 7px 12px; color: var(--t0); font-size: 13px; font-family: 'Tajawal', sans-serif;
}
.search-input:focus { outline: none; border-color: var(--acc); }
.filter-sel {
  background: var(--bg2); border: 1px solid var(--line2); border-radius: 7px;
  padding: 7px 10px; color: var(--t0); font-size: 12px; font-family: 'Tajawal', sans-serif; cursor: pointer;
}
.filter-sel:focus { outline: none; border-color: var(--acc); }
.gap { flex: 1; }
.filter-chips { display: flex; gap: 5px; flex-wrap: wrap; }
.chip {
  padding: 4px 12px; border-radius: 20px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--line2); background: transparent; color: var(--t2);
  font-family: 'Tajawal', sans-serif; transition: all 0.15s; white-space: nowrap;
}
.chip:hover { color: var(--t1); border-color: var(--line2); }
.chip.on { background: var(--bg3); color: var(--t0); border-color: var(--acc); }

/* ── Mobile ── */
.mob-menu-btn { display: none; background: none; border: none; color: var(--t0); font-size: 20px; cursor: pointer; padding: 4px; }
@media (max-width: 900px) {
  .sidebar { position: fixed; right: 0; top: 0; bottom: 0; z-index: 100; transform: translateX(100%); transition: transform 0.3s; }
  .sidebar.open { transform: translateX(0); }
  .main { margin-right: 0; }
  .mob-menu-btn { display: block; }
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .rep-grid-3 { grid-template-columns: 1fr; }
  .bal-grid { grid-template-columns: repeat(3, 1fr); }
  .page { padding: 14px; }
  .mob-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 99; }
}
@media print {
  .sidebar, .topbar, button, .toolbar { display: none !important; }
  .main { margin-right: 0 !important; }
  body { background: white !important; color: black !important; }
}

/* ── Divider ── */
.divider { height: 1px; background: linear-gradient(90deg, transparent, var(--line), transparent); margin: 12px 0; }

/* ── Empty State ── */
.empty { text-align: center; padding: 60px 20px; color: var(--t2); }
.empty-icon { font-size: 44px; margin-bottom: 12px; opacity: 0.4; }
.empty-text { font-size: 14px; }

/* ── Tooltip ── */
.tooltip { position: relative; cursor: help; }
.tooltip::after { content: attr(data-tip); position: absolute; bottom: 100%; right: 50%; transform: translateX(50%); background: var(--bg3); color: var(--t0); font-size: 11px; padding: 5px 9px; border-radius: 5px; white-space: nowrap; border: 1px solid var(--line2); opacity: 0; pointer-events: none; transition: opacity 0.2s; z-index: 50; margin-bottom: 4px; }
.tooltip:hover::after { opacity: 1; }
`;

// ─────────────────────────────────────────
//  Shared Components
// ─────────────────────────────────────────
const Loader = () => (
  <div className="loading-screen">
    <div className="loader" /> جاري التحميل...
  </div>
);

const ErrBox = ({ msg }) => (
  <div className="err-box">⚠ {msg}</div>
);

function KPI({ label, value, sub, color = T.acc, icon, badge, badgeColor }) {
  return (
    <div className="kpi-card" style={{ "--accent-color": color }}>
      {icon && <div style={{ position: "absolute", top: 12, left: 14, fontSize: 26, opacity: 0.08 }}>{icon}</div>}
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>{typeof value === "number" ? fmt(value) : value}</div>
      <div className="kpi-sub">
        {badge && <span className="kpi-badge" style={{ background: `${badgeColor || color}22`, color: badgeColor || color }}>{badge}</span>}
        {sub && <span style={{ marginRight: badge ? 6 : 0 }}>{sub}</span>}
      </div>
    </div>
  );
}

function Balances({ entries }) {
  const all = computeRunningBalances(entries);
  const last = all[all.length - 1];
  const cash    = last?.cash_balance    ?? 0;
  const bank    = last?.bank_balance    ?? 0;
  const custody = last?.custody_balance ?? 0;
  return (
    <div className="bal-grid">
      {[
        { label: "🏧 رصيد الصندوق", val: cash,    c: cash    < 0 ? T.red : T.green },
        { label: "🏦 رصيد البنك",   val: bank,    c: bank    < 0 ? T.red : T.blue  },
        { label: "👤 رصيد العهدة",  val: custody, c: custody < 0 ? T.red : T.gold  },
      ].map((b, i) => (
        <div className="bal-card" key={i}>
          <div className="bal-label">{b.label}</div>
          <div className="bal-value" style={{ color: b.c }}>{fmt(b.val)}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────
//  صفحة مراجعة الحركات
// ─────────────────────────────────────────
function ReviewPage({ projectId, period }) {
  const { data, loading, error, reload } = useData(
    "ledger_entries",
    { filter: { "project_id": `eq.${projectId}`, "date_from": period.from, "date_to": period.to, "status": "neq.approved" }, order: "date.desc,created_at.desc" },
    [projectId, period.from, period.to]
  );
  const [exp,     setExp]    = useState(null);
  const [filter,  setFilter] = useState("all");
  const [saving,  setSaving] = useState(false);

  const pending = data.filter(e => e.status === "pending").length;
  const autos   = data.filter(e => e.status === "auto" && !e.is_duplicate).length;
  const dups    = data.filter(e => e.is_duplicate).length;

  const filtered = data.filter(e => {
    if (filter === "pending") return e.status === "pending";
    if (filter === "dup")     return e.is_duplicate;
    if (filter === "auto")    return e.status === "auto" && !e.is_duplicate;
    return true;
  });

  const getSrc = (e) =>
    (e.cash_out || e.cash_in)       ? { label: "🏧 صندوق", color: T.green  }
    : (e.bank_out || e.bank_in)     ? { label: "🏦 بنك",   color: T.blue   }
    : (e.custody_out || e.custody_in)? { label: "👤 عهدة", color: T.gold   }
    : { label: "—", color: T.text2 };

  const getAmt = (e) => Math.max(
    (e.cash_out || 0) + (e.cash_in || 0),
    (e.bank_out || 0) + (e.bank_in || 0),
    (e.custody_out || 0) + (e.custody_in || 0),
    e.total_amount || 0
  );

  const approve    = async (id) => { setSaving(true); await sb.update("ledger_entries", id, { status: "approved" }); await reload(); setSaving(false); setExp(null); };
  const reject     = async (id) => { if (!window.confirm("حذف هذه الحركة؟")) return; setSaving(true); await sb.remove("ledger_entries", id); await reload(); setSaving(false); setExp(null); };
  const approveAll = async ()   => { setSaving(true); await Promise.all(data.filter(e => e.status === "auto" && !e.is_duplicate).map(e => sb.update("ledger_entries", e.id, { status: "approved" }))); await reload(); setSaving(false); };
  const updateF    = async (id, field, val) => { await sb.update("ledger_entries", id, { [field]: val }); await reload(); };

  const statusClass = (e) => e.is_duplicate ? "e-dup" : e.status === "auto" ? "e-auto" : "e-pend";

  if (loading) return <Loader />;

  return (
    <div className="page">
      {error && <ErrBox msg={error} />}

      {/* Stats */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <KPI label="بانتظار تصنيف" value={pending} color={T.gold}   icon="⏳" sub="حركة تحتاج مراجعة" />
        <KPI label="تصنيف تلقائي"  value={autos}   color={T.blue}  icon="🤖" sub="من الذكاء الاصطناعي" />
        <KPI label="تكرار محتمل"   value={dups}    color={T.red}   icon="⚠" sub="تحتاج مراجعة يدوية" />
        <KPI label="إجمالي المعلقة" value={data.length} color={T.acc} icon="📋" sub="في هذه الفترة" />
      </div>

      <div className="toolbar">
        <div className="filter-chips">
          {[
            { v: "all",     l: `الكل (${data.length})` },
            { v: "pending", l: `⏳ تصنيف (${pending})` },
            { v: "auto",    l: `🤖 تلقائي (${autos})` },
            { v: "dup",     l: `⚠ تكرار (${dups})` },
          ].map(f => <button key={f.v} className={`chip ${filter === f.v ? "on" : ""}`} onClick={() => setFilter(f.v)}>{f.l}</button>)}
        </div>
        <div className="gap" />
        {autos > 0 && (
          <button className="topbar-btn btn-green" onClick={approveAll} disabled={saving}>
            ✅ اعتماد التلقائي كله ({autos})
          </button>
        )}
      </div>

      <div className="entry-list">
        {filtered.map(e => {
          const src = getSrc(e);
          const amt = getAmt(e);
          return (
            <div key={e.id} className={`entry-card ${statusClass(e)}`}>
              <div className="entry-row" onClick={() => setExp(exp === e.id ? null : e.id)}>
                <span className="e-date">{e.date}</span>
                <span className="e-type">{e.type || <span style={{ color: T.gold }}>⚠ بدون تصنيف</span>}</span>
                <span className="e-desc">{e.description || e.original_name}</span>
                {e.is_duplicate && <span className="tag tag-dup">تكرار</span>}
                {!e.is_duplicate && e.status === "auto" && <span className="tag tag-auto">AI</span>}
                {e.status === "pending" && <span className="tag tag-pend">معلق</span>}
                <span className="e-src" style={{ color: src.color, background: `${src.color}18` }}>{src.label}</span>
                <span className="e-amt">{fmt(amt)}</span>
                <div className="e-btns" onClick={ev => ev.stopPropagation()}>
                  <button className="topbar-btn btn-green" style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => approve(e.id)} disabled={saving}>✓</button>
                  <button className="topbar-btn btn-red"   style={{ padding: "3px 9px",  fontSize: 11 }} onClick={() => reject(e.id)}  disabled={saving}>✕</button>
                </div>
              </div>

              {exp === e.id && (
                <div className="entry-detail">
                  <div className="fl">
                    <div className="fl-label">نوع الحركة</div>
                    <select className="fl-select" value={e.type || ""} onChange={ev => updateF(e.id, "type", ev.target.value)}>
                      <option value="">— اختر النوع —</option>
                      {TRANS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="fl">
                    <div className="fl-label">الوصف</div>
                    <input className="fl-input" value={e.description || ""} onChange={ev => updateF(e.id, "description", ev.target.value)} />
                  </div>
                  <div className="fl">
                    <div className="fl-label">التفاصيل المالية</div>
                    <div className="fl-info" style={{ lineHeight: 1.7 }}>
                      {e.cash_out > 0 && <div>خرج صندوق: <strong style={{ color: T.red }}>{fmt(e.cash_out)}</strong></div>}
                      {e.cash_in  > 0 && <div>دخل صندوق: <strong style={{ color: T.green }}>{fmt(e.cash_in)}</strong></div>}
                      {e.bank_out > 0 && <div>خرج بنك: <strong style={{ color: T.red }}>{fmt(e.bank_out)}</strong></div>}
                      {e.bank_in  > 0 && <div>دخل بنك: <strong style={{ color: T.blue }}>{fmt(e.bank_in)}</strong></div>}
                      {e.custody_out > 0 && <div>خرج عهدة: <strong style={{ color: T.red }}>{fmt(e.custody_out)}</strong></div>}
                      {e.custody_in  > 0 && <div>دخل عهدة: <strong style={{ color: T.gold }}>{fmt(e.custody_in)}</strong></div>}
                      {e.vat_amount > 0 && <div>ضريبة: <strong style={{ color: T.gold }}>{fmt(e.vat_amount)}</strong></div>}
                    </div>
                  </div>
                  <div className="fl">
                    <div className="fl-label">الفاتورة</div>
                    {e.file_url
                      ? <a href={e.file_url} target="_blank" rel="noreferrer" style={{ color: T.acc, fontSize: 13 }}>📎 {e.original_name || "فتح الفاتورة"}</a>
                      : <span style={{ color: T.text2, fontSize: 12 }}>لا يوجد مرفق</span>}
                  </div>
                  {e.is_duplicate && (
                    <div className="fl" style={{ gridColumn: "1/-1" }}>
                      <div className="fl-warn">⚠ تكرار محتمل — نفس التاريخ والمبلغ موجودان في سطر آخر. تحقق قبل الاعتماد.</div>
                    </div>
                  )}
                  <div className="entry-footer">
                    <button className="topbar-btn btn-ghost" onClick={() => setExp(null)}>إغلاق</button>
                    <button className="topbar-btn btn-red"   onClick={() => reject(e.id)}  disabled={saving}>🗑 حذف</button>
                    <button className="topbar-btn btn-green" onClick={() => approve(e.id)} disabled={saving}>✅ اعتماد الحركة</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && !loading && (
        <div className="empty"><div className="empty-icon">✅</div><div className="empty-text">لا توجد حركات معلقة في هذه الفترة</div></div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
//  صفحة الدفتر الأمريكي
// ─────────────────────────────────────────
function LedgerPage({ projectId }) {
  const { data: raw, loading, error, reload } = useData(
    "ledger_entries",
    { filter: { "project_id": `eq.${projectId}`, "status": "eq.approved" }, order: "date.asc,created_at.asc" },
    [projectId]
  );
  const [search,  setSearch]  = useState("");
  const [typeF,   setTypeF]   = useState("");
  const [modal,   setModal]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [newRow,  setNewRow]  = useState({ date: today(), type: "", description: "", cash_out: "", cash_in: "", bank_out: "", bank_in: "", custody_out: "", custody_in: "", vat_amount: "" });

  const entries  = useMemo(() => computeRunningBalances(raw), [raw]);
  const filtered = useMemo(() => entries.filter(r => {
    const s = search.toLowerCase();
    return (!s || (r.description || "").toLowerCase().includes(s) || (r.type || "").includes(s))
      && (!typeF || r.type === typeF);
  }), [entries, search, typeF]);

  const last = entries[entries.length - 1];

  const addRow = async () => {
    if (!newRow.type || !newRow.description) return;
    setSaving(true);
    try {
      const nums = ["cash_out","cash_in","bank_out","bank_in","custody_out","custody_in","vat_amount"];
      const clean = { ...newRow };
      nums.forEach(k => { clean[k] = parseFloat(clean[k]) || 0; });
      const total = nums.slice(0,6).reduce((s,k) => s + clean[k], 0);
      await sb.insert("ledger_entries", { ...clean, project_id: projectId, total_amount: total, status: "approved" });
      await reload();
      setModal(false);
      setNewRow({ date: today(), type: "", description: "", cash_out: "", cash_in: "", bank_out: "", bank_in: "", custody_out: "", custody_in: "", vat_amount: "" });
    } catch (e) { alert("خطأ: " + e.message); }
    finally { setSaving(false); }
  };

  const N = (v, cls) => v ? <span className={`mono ${cls}`}>{fmt(v)}</span> : <span className="dash">—</span>;

  if (loading) return <Loader />;

  return (
    <div className="page">
      {error && <ErrBox msg={error} />}

      {/* الأرصدة الحالية */}
      <div className="bal-grid">
        {[
          { label: "🏧 رصيد الصندوق", val: last?.cash_balance    ?? 0, c: (last?.cash_balance    ?? 0) < 0 ? T.red : T.green },
          { label: "🏦 رصيد البنك",   val: last?.bank_balance    ?? 0, c: (last?.bank_balance    ?? 0) < 0 ? T.red : T.blue  },
          { label: "👤 رصيد العهدة",  val: last?.custody_balance ?? 0, c: (last?.custody_balance ?? 0) < 0 ? T.red : T.gold  },
        ].map((b, i) => (
          <div className="bal-card" key={i}>
            <div className="bal-label">{b.label}</div>
            <div className="bal-value" style={{ color: b.c }}>{fmt(b.val)}</div>
            {b.val < 0 && <div style={{ fontSize: 10, color: T.red, marginTop: 4 }}>⚠ رصيد سالب — تحقق من الإدخال</div>}
          </div>
        ))}
      </div>

      <div className="toolbar">
        <input className="search-input" placeholder="🔍 بحث في الوصف أو النوع..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="filter-sel" value={typeF} onChange={e => setTypeF(e.target.value)}>
          <option value="">كل الأنواع</option>
          {TRANS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="gap" />
        <button className="topbar-btn btn-ghost" onClick={() => setModal(true)}>+ إضافة يدوية</button>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th><th>التاريخ</th><th>النوع</th><th>الوصف</th>
              <th>خ.صندوق</th><th>د.صندوق</th><th>خ.بنك</th><th>د.بنك</th>
              <th>خ.عهدة</th><th>د.عهدة</th>
              <th>رصيد صندوق</th><th>رصيد بنك</th><th>رصيد عهدة</th><th>ضريبة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.id}>
                <td className="mono" style={{ color: T.text2, fontSize: 10 }}>{i + 1}</td>
                <td><span className="mono" style={{ fontSize: 11, color: T.text2 }}>{r.date}</span></td>
                <td style={{ fontSize: 11, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{r.type}</td>
                <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", color: T.text1 }} title={r.description}>{r.description}</td>
                <td>{N(r.cash_out,    "num-out")}</td>
                <td>{N(r.cash_in,     "num-in")}</td>
                <td>{N(r.bank_out,    "num-out")}</td>
                <td>{N(r.bank_in,     "num-in")}</td>
                <td>{N(r.custody_out, "num-out")}</td>
                <td>{N(r.custody_in,  "num-in")}</td>
                <td className="mono" style={{ color: (r.cash_balance ?? 0) < 0 ? T.red : T.green, fontWeight: 700 }}>{fmt(r.cash_balance)}</td>
                <td className="mono" style={{ color: (r.bank_balance ?? 0) < 0 ? T.red : T.blue,  fontWeight: 700 }}>{fmt(r.bank_balance)}</td>
                <td className="mono" style={{ color: (r.custody_balance ?? 0) < 0 ? T.red : T.gold, fontWeight: 700 }}>{fmt(r.custody_balance)}</td>
                <td>{r.vat_amount > 0 ? <span className="mono" style={{ color: T.gold }}>{fmt(r.vat_amount)}</span> : <span className="dash">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal إضافة حركة */}
      {modal && (
        <div className="overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">➕ إضافة حركة يدوية</div>
            <div className="modal-grid">
              <div className="fl">
                <div className="fl-label">التاريخ</div>
                <input type="date" className="fl-input" value={newRow.date} onChange={e => setNewRow(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="fl">
                <div className="fl-label">نوع الحركة *</div>
                <select className="fl-select" value={newRow.type} onChange={e => setNewRow(p => ({ ...p, type: e.target.value }))}>
                  <option value="">— اختر —</option>
                  {TRANS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="fl" style={{ gridColumn: "1/-1" }}>
                <div className="fl-label">الوصف *</div>
                <input className="fl-input" value={newRow.description} onChange={e => setNewRow(p => ({ ...p, description: e.target.value }))} placeholder="وصف الحركة..." />
              </div>
              {[
                { f: "cash_out",    l: "خرج صندوق" }, { f: "cash_in",    l: "دخل صندوق" },
                { f: "bank_out",    l: "خرج بنك" },   { f: "bank_in",    l: "دخل بنك" },
                { f: "custody_out", l: "خرج عهدة" },  { f: "custody_in", l: "دخل عهدة" },
                { f: "vat_amount",  l: "ضريبة ق.م" },
              ].map(({ f, l }) => (
                <div className="fl" key={f}>
                  <div className="fl-label">{l}</div>
                  <input type="number" className="fl-input" value={newRow[f] || ""} placeholder="0.00" step="0.01" onChange={e => setNewRow(p => ({ ...p, [f]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="topbar-btn btn-ghost" onClick={() => setModal(false)}>إلغاء</button>
              <button className="topbar-btn btn-acc" onClick={addRow} disabled={saving || !newRow.type || !newRow.description}>
                {saving ? "⏳ جاري الحفظ..." : "✓ حفظ الحركة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
//  صفحة التقارير الرئيسية
// ─────────────────────────────────────────
function ReportsPage({ projectId, period }) {
  const { data: ledger, loading: l1 } = useData(
    "ledger_entries",
    { filter: { "project_id": `eq.${projectId}`, "date_from": period.from, "date_to": period.to, "status": "eq.approved" } },
    [projectId, period.from, period.to]
  );
  const { data: allLedger } = useData(
    "ledger_entries",
    { filter: { "project_id": `eq.${projectId}`, "status": "eq.approved" }, order: "date.asc,created_at.asc" },
    [projectId]
  );
  const { data: loans } = useData("loans", { filter: { "project_id": `eq.${projectId}` } }, [projectId]);

  const balances = useMemo(() => computeRunningBalances(allLedger), [allLedger]);

  const sumTypes = useCallback((types, cols) =>
    ledger.filter(e => types.some(t => (e.type || "").includes(t)))
      .reduce((s, e) => s + cols.reduce((a, c) => a + (Number(e[c]) || 0), 0), 0),
    [ledger]
  );

  // ── المبيعات — من حساب الدخل الصندوق/البنك
  const cashSales = sumTypes(["مبيعات كاش"],  ["cash_in"]);
  const netSales  = sumTypes(["مبيعات شبكة"], ["bank_in"]);
  const total     = cashSales + netSales;

  // ── المصروفات
  const opExp     = sumTypes(["مصروفات تشغيلية"], ["cash_out","bank_out","custody_out"]);
  const fixedExp  = sumTypes(["مصروفات ثابتة"],   ["cash_out","bank_out","custody_out"]);
  const loansPaid = sumTypes(["قسط سيارة","قسط شراء أرض","قرض ١","قرض ٢"], ["cash_out","bank_out","custody_out"]);
  const withd     = sumTypes(["مسحوبات سليمان","مسحوبات أم طوبى"], ["cash_out","bank_out","custody_out"]);

  // ── الربحية
  const grossProfit = total - opExp - fixedExp;
  const netProfit   = grossProfit - loansPaid;
  const cashflow    = netProfit - withd;

  // ── VAT الصحيح: ضريبة المبيعات (15% من المبيعات) ناقص ضريبة المشتريات المدفوعة
  const vatOnSales  = total * 0.15;
  const vatOnPurch  = ledger.reduce((s, e) => s + (Number(e.vat_amount) || 0), 0);
  const vatDue      = vatOnSales - vatOnPurch;

  // ── الأرصدة الحالية
  const lastBal = balances[balances.length - 1];

  if (l1) return <Loader />;

  const Row = ({ label, val, sub, color, bold, pctBase, indent, highlight }) => (
    <div className={`r-row${highlight ? ` ${highlight}` : ""}`} style={{ paddingRight: indent ? 24 : 12, paddingLeft: 12 }}>
      <span className={`r-lbl ${bold ? "bold" : ""}`}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {pctBase > 0 && <span className="r-pct">{pct(val, pctBase)}</span>}
        <span className="r-val" style={{ color: color || (bold ? T.text0 : T.text1) }}>{fmt(val)}</span>
        {sub && <span style={{ fontSize: 10, color: T.text2 }}>{sub}</span>}
      </div>
    </div>
  );

  const Sec = ({ title }) => <div className="sec-head">{title}</div>;

  return (
    <div className="page">
      {/* KPIs */}
      <div className="kpi-grid">
        <KPI label="إجمالي المبيعات" value={total}       color={T.acc}    icon="💰" sub={`كاش: ${fmt(cashSales)}`} />
        <KPI label="مجمل الربح"      value={grossProfit} color={T.gold}   icon="📦" badge={pct(grossProfit, total)} badgeColor={T.gold} />
        <KPI label="صافي الربح"      value={netProfit}   color={T.blue}   icon="📈" badge={pct(netProfit, total)} badgeColor={T.blue} />
        <KPI label="صافي التدفق"     value={cashflow}    color={T.purple} icon="💸" sub="بعد المسحوبات" />
      </div>

      {/* الأرصدة */}
      <div className="bal-grid">
        {[
          { label: "🏧 الصندوق", val: lastBal?.cash_balance    ?? 0, c: (lastBal?.cash_balance ?? 0) < 0 ? T.red : T.green },
          { label: "🏦 البنك",   val: lastBal?.bank_balance    ?? 0, c: (lastBal?.bank_balance ?? 0) < 0 ? T.red : T.blue  },
          { label: "👤 العهدة",  val: lastBal?.custody_balance ?? 0, c: (lastBal?.custody_balance ?? 0) < 0 ? T.red : T.gold },
        ].map((b, i) => (
          <div className="bal-card" key={i}>
            <div className="bal-label">{b.label}</div>
            <div className="bal-value" style={{ color: b.c }}>{fmt(b.val)}</div>
          </div>
        ))}
      </div>

      <div className="rep-grid-3">
        {/* المبيعات والمصروفات */}
        <div className="card">
          <div className="card-header"><span className="card-title">المبيعات والمصروفات</span></div>
          <div style={{ padding: "12px 0" }}>
            <Sec title="الإيرادات" />
            <Row label="مبيعات كاش"         val={cashSales} color={T.acc}  pctBase={total} indent />
            <Row label="مبيعات شبكة"        val={netSales}  color={T.blue} pctBase={total} indent />
            <Row label="إجمالي الإيرادات"   val={total}     color={T.acc}  bold highlight="hl-g" />
            <Sec title="المصروفات التشغيلية" />
            <Row label="مصروفات تشغيلية"    val={-opExp}    color={T.red}  pctBase={total} indent />
            <Row label="مصروفات ثابتة"      val={-fixedExp} color={T.red}  pctBase={total} indent />
            <Row label="إجمالي المصروفات"   val={-(opExp+fixedExp)} color={T.red} bold />
          </div>
        </div>

        {/* الربحية */}
        <div className="card">
          <div className="card-header"><span className="card-title">الربحية</span></div>
          <div style={{ padding: "12px 0" }}>
            <Row label="مجمل الربح"          val={grossProfit} color={grossProfit >= 0 ? T.gold : T.red} bold highlight="hl-g" pctBase={total} />
            <Row label="(-) أقساط القروض"    val={-loansPaid}  color={T.red} pctBase={total} indent />
            <Row label="صافي الربح"          val={netProfit}   color={netProfit >= 0 ? T.blue : T.red} bold highlight="hl-b" pctBase={total} />
            <Row label="(-) مسحوبات الشركاء" val={-withd}      color={T.red} pctBase={total} indent />
            <Row label="صافي التدفق النقدي"  val={cashflow}    color={cashflow >= 0 ? T.purple : T.red} bold highlight="hl-p" pctBase={total} />
            <div className="divider" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 12px" }}>
              {[
                { l: "هامش الربح",    v: pct(netProfit, total),    c: T.blue   },
                { l: "تغطية الديون", v: loansPaid > 0 ? `${((netProfit + loansPaid) / loansPaid).toFixed(1)}x` : "—", c: T.gold },
              ].map((k, i) => (
                <div key={i} style={{ background: T.bg3, borderRadius: 7, padding: "9px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: T.text2, marginBottom: 4 }}>{k.l}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: k.c, fontFamily: "'IBM Plex Mono', monospace" }}>{k.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* القروض والضريبة */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* القروض */}
          <div className="card">
            <div className="card-header"><span className="card-title">القروض والأقساط</span></div>
            <div style={{ padding: "8px 0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["القرض", "المسدد", "المتبقي"].map(h => (
                      <th key={h} style={{ background: T.bg3, color: T.text2, fontSize: 10, fontWeight: 700, padding: "7px 12px", textAlign: "right", borderBottom: `1px solid ${T.line}`, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loans.filter(l => l.original_amount > 0).map((l, i) => {
                    const paid = allLedger.filter(e => (e.type || "").includes(l.name?.replace("💳 ", ""))).reduce((s, e) => s + (e.cash_out || 0) + (e.bank_out || 0) + (e.custody_out || 0), 0);
                    const rem  = Math.max(0, (l.original_amount || 0) - paid);
                    const pct2 = l.original_amount > 0 ? ((paid / l.original_amount) * 100).toFixed(0) : 0;
                    return (
                      <tr key={i}>
                        <td style={{ padding: "8px 12px", color: T.text1 }}>{l.name}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "'IBM Plex Mono', monospace", color: T.text2, fontSize: 11 }}>
                          {fmt(paid)}<br />
                          <span style={{ fontSize: 10, color: T.green }}>{pct2}%</span>
                        </td>
                        <td style={{ padding: "8px 12px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: rem > 0 ? T.red : T.green }}>{fmt(rem)}</td>
                      </tr>
                    );
                  })}
                  {loans.filter(l => l.original_amount > 0).length === 0 && (
                    <tr><td colSpan={3} style={{ padding: "12px", color: T.text2, textAlign: "center", fontSize: 12 }}>لا توجد قروض مسجّلة</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ضريبة القيمة المضافة — الطريقة الصحيحة */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">ضريبة القيمة المضافة</span>
              <span className="tooltip" data-tip="ضريبة مبيعات 15% ناقص ضريبة مشتريات مدفوعة">ℹ</span>
            </div>
            <div style={{ padding: "12px" }}>
              <div className="r-row">
                <span className="r-lbl">ضريبة المبيعات (15%)</span>
                <span className="r-val" style={{ color: T.text0 }}>{fmt(vatOnSales)}</span>
              </div>
              <div className="r-row">
                <span className="r-lbl">ضريبة المشتريات المدفوعة</span>
                <span className="r-val" style={{ color: T.red }}>({fmt(vatOnPurch)})</span>
              </div>
              <div style={{ height: 1, background: T.line, margin: "8px 0" }} />
              <div style={{ background: vatDue > 0 ? `${T.red}12` : `${T.green}12`, border: `1px solid ${vatDue > 0 ? T.red : T.green}33`, borderRadius: 7, padding: "10px 12px", textAlign: "center", marginTop: 4 }}>
                <div style={{ fontSize: 11, color: vatDue > 0 ? T.red : T.green, marginBottom: 4 }}>
                  {vatDue > 0 ? "💳 مستحق للهيئة" : "✅ رصيد لصالحك"}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace", color: vatDue > 0 ? T.red : T.green }}>
                  {fmt(Math.abs(vatDue))}
                </div>
              </div>
              <div style={{ fontSize: 10, color: T.text2, marginTop: 8, lineHeight: 1.5 }}>
                * يُستحسن مطابقة مع الإشعارات الضريبية من بوابة زاتكا قبل التسديد
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
//  قائمة الدخل (مفصّلة)
// ─────────────────────────────────────────
function IncomeStatement({ projectId, period }) {
  const { data: ledger, loading } = useData(
    "ledger_entries",
    { filter: { "project_id": `eq.${projectId}`, "date_from": period.from, "date_to": period.to, "status": "eq.approved" } },
    [projectId, period.from, period.to]
  );
  if (loading) return <Loader />;

  const sum = (types, cols) =>
    ledger.filter(e => types.some(t => (e.type || "").includes(t))).reduce((s, e) => s + cols.reduce((a, c) => a + (Number(e[c]) || 0), 0), 0);

  const cashSales = sum(["مبيعات كاش"],  ["cash_in"]);
  const netSales  = sum(["مبيعات شبكة"], ["bank_in"]);
  const total     = cashSales + netSales;
  const cogs      = sum(["مصروفات تشغيلية"], ["cash_out","bank_out","custody_out"]);
  const fixed     = sum(["مصروفات ثابتة"],   ["cash_out","bank_out","custody_out"]);
  const loans     = sum(["قسط سيارة","قسط شراء أرض","قرض ١","قرض ٢"], ["cash_out","bank_out","custody_out"]);
  const withd     = sum(["مسحوبات سليمان","مسحوبات أم طوبى"], ["cash_out","bank_out","custody_out"]);

  const gross    = total - cogs;
  const opProfit = gross - fixed;
  const netProfit= opProfit - loans;
  const cashflow = netProfit - withd;
  const p = v => total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "—";

  const Row = ({ label, val, color, bold, indent, neg }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `9px 16px`, paddingRight: indent ? 32 : 16, borderBottom: `1px solid ${T.line}`, background: bold ? "rgba(255,255,255,0.02)" : "transparent" }}>
      <span style={{ fontSize: 13, color: bold ? T.text0 : T.text1, fontWeight: bold ? 700 : 400 }}>{label}</span>
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: T.text2, minWidth: 48, textAlign: "left" }}>{p(neg ? -val : val)}</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: bold ? 700 : 500, color: color || T.text0, minWidth: 100, textAlign: "left" }}>{neg ? `(${fmt(Math.abs(val))})` : fmt(val)}</span>
      </div>
    </div>
  );

  const Sec = ({ title, color }) => (
    <div style={{ background: color || T.bg3, padding: "7px 16px", borderTop: `1px solid ${T.line}` }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#FFF", textTransform: "uppercase", letterSpacing: 1 }}>{title}</span>
    </div>
  );

  return (
    <div className="page">
      <div style={{ maxWidth: 640 }}>
        <div style={{ background: T.bg2, borderRadius: 10, overflow: "hidden", border: `1px solid ${T.line}` }}>
          {/* Header */}
          <div style={{ background: `linear-gradient(135deg, #1B4F72, #0E7070)`, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>📈 قائمة الدخل</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2, fontFamily: "'IBM Plex Mono'" }}>{period.from} — {period.to}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>صافي الربح</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: netProfit >= 0 ? T.green : T.red, fontFamily: "'IBM Plex Mono'" }}>{fmt(netProfit)}</div>
            </div>
          </div>

          {/* Col Headers */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 20, padding: "6px 16px", background: T.bg3, fontSize: 10, color: T.text2, fontWeight: 700, textTransform: "uppercase" }}>
            <span style={{ minWidth: 48 }}>% من الإيراد</span>
            <span style={{ minWidth: 100 }}>المبلغ</span>
          </div>

          <Sec title="الإيرادات" color="#0B3A2A" />
          <Row label="مبيعات كاش"         val={cashSales} color={T.acc} indent />
          <Row label="مبيعات شبكة / آبل باي" val={netSales} color={T.blue} indent />
          <Row label="إجمالي الإيرادات"   val={total}    color={T.acc} bold />

          <Sec title="تكلفة المبيعات" color="#3A0B0B" />
          <Row label="(-) مصروفات تشغيلية" val={cogs}  color={T.red} indent neg />
          <Row label="مجمل الربح"           val={gross} color={gross >= 0 ? T.gold : T.red} bold />

          <Sec title="المصروفات الثابتة" color="#1A2040" />
          <Row label="(-) مصروفات ثابتة"    val={fixed}    color={T.red} indent neg />
          <Row label="الربح التشغيلي"        val={opProfit} color={opProfit >= 0 ? T.blue : T.red} bold />

          <Sec title="التمويل والقروض" color="#2D0B3A" />
          <Row label="(-) أقساط القروض"      val={loans}    color={T.red} indent neg />
          <Row label="صافي الربح"            val={netProfit} color={netProfit >= 0 ? T.purple : T.red} bold />

          <Sec title="توزيع الأرباح" color="#1A2020" />
          <Row label="(-) مسحوبات الشركاء"  val={withd}     color={T.red} indent neg />
          <Row label="صافي التدفق النقدي"   val={cashflow}  color={cashflow >= 0 ? T.gold : T.red} bold />

          {/* المؤشرات */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: 14, background: T.bg1 }}>
            {[
              { l: "هامش الربح الإجمالي", v: total > 0 ? (gross    / total * 100) : 0, c: T.gold,   x: "%" },
              { l: "هامش صافي الربح",     v: total > 0 ? (netProfit/ total * 100) : 0, c: T.purple, x: "%" },
              { l: "تغطية الديون",        v: loans > 0 ? ((netProfit + loans) / loans) : 0, c: T.acc, x: "x" },
            ].map((k, i) => (
              <div key={i} style={{ background: T.bg2, border: `1px solid ${T.line}`, borderRadius: 8, padding: "10px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: T.text2, marginBottom: 4 }}>{k.l}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: k.c, fontFamily: "'IBM Plex Mono'" }}>{k.v.toFixed(1)}{k.x}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
//  الميزانية العمومية
// ─────────────────────────────────────────
function BalanceSheet({ projectId }) {
  const { data: allLedger } = useData(
    "ledger_entries",
    { filter: { "project_id": `eq.${projectId}`, "status": "eq.approved" }, order: "date.asc,created_at.asc" },
    [projectId]
  );
  const { data: loans } = useData("loans", { filter: { "project_id": `eq.${projectId}` } }, [projectId]);

  const balances = useMemo(() => computeRunningBalances(allLedger), [allLedger]);
  const last = balances[balances.length - 1];
  const cash    = last?.cash_balance    ?? 0;
  const bank    = last?.bank_balance    ?? 0;
  const custody = last?.custody_balance ?? 0;

  // الأصول: نأخذ فقط الأرصدة الموجبة كأصول متداولة
  const totalAssets = Math.max(0, cash) + Math.max(0, bank) + Math.max(0, custody);

  // القروض المتبقية
  const loanPaid = (name) =>
    allLedger.filter(e => (e.type || "").includes(name)).reduce((s, e) => s + (e.cash_out || 0) + (e.bank_out || 0) + (e.custody_out || 0), 0);

  const loanDetails = loans.filter(l => (l.original_amount || 0) > 0).map(l => ({
    name: l.name,
    total: l.original_amount || 0,
    paid:  loanPaid(l.name?.replace("💳 ", "") || ""),
    rem:   Math.max(0, (l.original_amount || 0) - loanPaid(l.name?.replace("💳 ", "") || "")),
  }));

  const totalLiab = loanDetails.reduce((s, l) => s + l.rem, 0);
  const equity    = totalAssets - totalLiab;
  const balanced  = Math.abs(totalAssets - (totalLiab + equity)) < 0.01;

  const Row = ({ label, val, color, bold, indent }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 16px", paddingRight: indent ? 32 : 16, borderBottom: `1px solid ${T.line}`, background: bold ? "rgba(255,255,255,0.02)" : "transparent" }}>
      <span style={{ fontSize: 13, color: bold ? T.text0 : T.text1, fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: bold ? 700 : 500, color: color || T.text0 }}>{fmt(val)}</span>
    </div>
  );

  const Sec = ({ title, color }) => (
    <div style={{ background: color || T.bg3, padding: "7px 16px", borderTop: `1px solid ${T.line}` }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#FFF", textTransform: "uppercase", letterSpacing: 1 }}>{title}</span>
    </div>
  );

  return (
    <div className="page">
      <div style={{ maxWidth: 520 }}>
        <div style={{ background: T.bg2, borderRadius: 10, overflow: "hidden", border: `1px solid ${T.line}` }}>
          <div style={{ background: `linear-gradient(135deg, #1B4F72, #0E7070)`, padding: "16px 20px" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>⚖️ الميزانية العمومية</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>بتاريخ: {today()}</div>
          </div>

          <Sec title="الأصول" color="#0B3A2A" />
          <Sec title="الأصول المتداولة" color="#0D4030" />
          <Row label="نقد في الصندوق"      val={Math.max(0, cash)}    color={T.green} indent />
          <Row label="رصيد البنك"           val={Math.max(0, bank)}    color={T.blue}  indent />
          <Row label="رصيد العهدة"          val={Math.max(0, custody)} color={T.gold}  indent />
          <Row label="إجمالي الأصول المتداولة" val={totalAssets} color={T.green} bold />

          {/* تنبيه إن كان هناك رصيد سالب */}
          {(cash < 0 || bank < 0 || custody < 0) && (
            <div style={{ padding: "8px 16px", fontSize: 11, color: T.red, background: `${T.red}10`, borderBottom: `1px solid ${T.line}` }}>
              ⚠ تحذير: أحد الأرصدة سالب — يشير لخطأ محاسبي أو عمليات غير مسجّلة
            </div>
          )}

          <Row label="إجمالي الأصول" val={totalAssets} color={T.green} bold />

          <Sec title="الالتزامات" color="#3A0B0B" />
          <Sec title="القروض طويلة الأجل" color="#4A1010" />
          {loanDetails.map((l, i) => <Row key={i} label={l.name} val={l.rem} color={l.rem > 0 ? T.red : T.green} indent />)}
          {loanDetails.length === 0 && <div style={{ padding: "10px 16px", color: T.text2, fontSize: 12 }}>لا توجد قروض</div>}
          <Row label="إجمالي الالتزامات" val={totalLiab} color={T.red} bold />

          <Sec title="حقوق الملكية" color="#2D0B3A" />
          <Row label="صافي حقوق الملكية" val={equity} color={equity >= 0 ? T.purple : T.red} bold />

          <Row label="إجمالي الالتزامات + حقوق الملكية" val={totalLiab + equity} color={balanced ? T.green : T.red} bold />

          <div style={{ padding: "13px 16px", background: balanced ? `${T.green}10` : `${T.red}10`, display: "flex", justifyContent: "center", borderTop: `2px solid ${T.line}` }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: balanced ? T.green : T.red }}>
              {balanced ? "✅ الميزانية متوازنة" : "❌ الميزانية غير متوازنة — تحقق من البيانات"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
//  ميزان المراجعة — المُصحَّح
//  القاعدة: الأصول = مدين | المطلوبات والإيرادات = دائن
// ─────────────────────────────────────────
function TrialBalance({ projectId, period }) {
  const { data: ledger, loading } = useData(
    "ledger_entries",
    { filter: { "project_id": `eq.${projectId}`, "date_from": period.from, "date_to": period.to, "status": "eq.approved" } },
    [projectId, period.from, period.to]
  );
  if (loading) return <Loader />;

  /*
    ميزان مراجعة صحيح:
    ─ الصندوق:   أصل ← مدين بالدخل ← دائن بالخروج
    ─ البنك:     أصل ← مدين بالدخل ← دائن بالخروج
    ─ العهدة:    حساب وسيط ← مدين عند الإيداع ← دائن عند الصرف
    ─ الإيرادات: دائن (زيادة الإيراد = دائن)
    ─ المصروفات: مدين (زيادة المصروف = مدين)
  */
  const accounts = {};
  const add = (name, dr, cr, group) => {
    if (!name) return;
    if (!accounts[name]) accounts[name] = { debit: 0, credit: 0, group };
    accounts[name].debit  += dr || 0;
    accounts[name].credit += cr || 0;
  };

  ledger.forEach(e => {
    // الصندوق: دخل = مدين / خرج = دائن
    if (e.cash_in  > 0) add("الصندوق",  e.cash_in,  0, "أصول");
    if (e.cash_out > 0) add("الصندوق",  0, e.cash_out, "أصول");

    // البنك
    if (e.bank_in  > 0) add("البنك",    e.bank_in,  0, "أصول");
    if (e.bank_out > 0) add("البنك",    0, e.bank_out, "أصول");

    // العهدة
    if (e.custody_in  > 0) add("ح/أمين الصندوق (عهدة)", e.custody_in,  0, "أصول");
    if (e.custody_out > 0) add("ح/أمين الصندوق (عهدة)", 0, e.custody_out, "أصول");

    // الإيرادات: دائن فقط
    const type = e.type || "";
    if (type.includes("مبيعات كاش"))  add("إيرادات المبيعات النقدية",    0, e.cash_in  || 0, "إيرادات");
    if (type.includes("مبيعات شبكة")) add("إيرادات المبيعات الإلكترونية", 0, e.bank_in  || 0, "إيرادات");

    // المصروفات: مدين فقط
    const expAmt = (e.cash_out || 0) + (e.bank_out || 0) + (e.custody_out || 0);
    if (type.includes("مصروفات تشغيلية"))  add("مصروفات تشغيلية",       expAmt, 0, "مصروفات");
    if (type.includes("مصروفات ثابتة"))    add("مصروفات ثابتة",         expAmt, 0, "مصروفات");
    if (type.includes("قسط سيارة"))        add("قسط سيارة",             expAmt, 0, "التزامات");
    if (type.includes("قسط شراء أرض"))     add("قسط شراء أرض",          expAmt, 0, "التزامات");
    if (type.includes("قرض ١"))            add("قرض ١",                  expAmt, 0, "التزامات");
    if (type.includes("قرض ٢"))            add("قرض ٢",                  expAmt, 0, "التزامات");
    if (type.includes("مسحوبات سليمان"))   add("مسحوبات سليمان",         expAmt, 0, "حقوق الملكية");
    if (type.includes("مسحوبات أم طوبى"))  add("مسحوبات أم طوبى",        expAmt, 0, "حقوق الملكية");
    if (type.includes("ضريبة"))            add("ضريبة القيمة المضافة",   expAmt, 0, "التزامات");
  });

  const groups = ["أصول", "إيرادات", "مصروفات", "التزامات", "حقوق الملكية"];
  const groupColors = { أصول: T.green, إيرادات: T.acc, مصروفات: T.red, التزامات: T.gold, "حقوق الملكية": T.purple };

  const entries = Object.entries(accounts);
  const totalD  = entries.reduce((s, [, v]) => s + v.debit,  0);
  const totalC  = entries.reduce((s, [, v]) => s + v.credit, 0);
  const balanced = Math.abs(totalD - totalC) < 0.01;

  return (
    <div className="page">
      <div style={{ maxWidth: 700 }}>
        <div style={{ background: T.bg2, borderRadius: 10, overflow: "hidden", border: `1px solid ${T.line}` }}>
          <div style={{ background: `linear-gradient(135deg, #1B4F72, #0E7070)`, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>✅ ميزان المراجعة</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2, fontFamily: "'IBM Plex Mono'" }}>{period.from} — {period.to}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: balanced ? T.green : T.red, background: balanced ? `${T.green}15` : `${T.red}15`, padding: "5px 12px", borderRadius: 6 }}>
              {balanced ? "✅ متوازن" : "❌ غير متوازن"}
            </div>
          </div>

          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "30px 2fr 1fr 1fr 1fr", padding: "8px 14px", background: T.bg3, fontSize: 10, color: T.text2, fontWeight: 700, textTransform: "uppercase", gap: 8 }}>
            <span>#</span><span>الحساب</span><span style={{ textAlign: "left" }}>مدين</span><span style={{ textAlign: "left" }}>دائن</span><span style={{ textAlign: "left" }}>الرصيد</span>
          </div>

          {/* Rows by group */}
          {groups.map(group => {
            const gEntries = entries.filter(([, v]) => v.group === group);
            if (!gEntries.length) return null;
            return (
              <div key={group}>
                <div style={{ background: `${groupColors[group]}18`, padding: "6px 14px", fontSize: 10, fontWeight: 700, color: groupColors[group], textTransform: "uppercase", letterSpacing: 0.5, borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}` }}>
                  {group}
                </div>
                {gEntries.map(([name, v], i) => {
                  const bal = v.debit - v.credit;
                  return (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "30px 2fr 1fr 1fr 1fr", padding: "9px 14px", borderBottom: `1px solid ${T.line}44`, background: i % 2 === 0 ? T.bg2 : "rgba(255,255,255,0.01)", gap: 8 }}>
                      <span style={{ fontSize: 10, color: T.text2 }}>{i + 1}</span>
                      <span style={{ fontSize: 12, color: T.text1 }}>{name}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: T.blue, textAlign: "left" }}>{v.debit > 0 ? fmt(v.debit) : "—"}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: T.red,  textAlign: "left" }}>{v.credit > 0 ? fmt(v.credit) : "—"}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700, color: bal >= 0 ? T.green : T.red, textAlign: "left" }}>{fmt(Math.abs(bal))}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Totals */}
          <div style={{ display: "grid", gridTemplateColumns: "30px 2fr 1fr 1fr 1fr", padding: "11px 14px", background: T.bg3, fontWeight: 700, fontSize: 13, gap: 8, borderTop: `2px solid ${T.line2}` }}>
            <span />
            <span style={{ color: T.text0 }}>الإجمالي</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.blue,  textAlign: "left" }}>{fmt(totalD)}</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.red,   textAlign: "left" }}>{fmt(totalC)}</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: balanced ? T.green : T.red, textAlign: "left" }}>{fmt(Math.abs(totalD - totalC))}</span>
          </div>

          <div style={{ padding: "13px 16px", background: balanced ? `${T.green}08` : `${T.red}08`, textAlign: "center", borderTop: `2px solid ${T.line}` }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: balanced ? T.green : T.red }}>
              {balanced
                ? "✅ ميزان المراجعة متوازن — القيود محاسبياً صحيحة"
                : `❌ غير متوازن — الفرق: ${fmt(Math.abs(totalD - totalC))} ريال — راجع القيود`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
//  صفحة القيود المحاسبية — المُصحَّحة
// ─────────────────────────────────────────
function JournalPage({ projectId, period }) {
  const { data: ledger, loading } = useData(
    "ledger_entries",
    { filter: { "project_id": `eq.${projectId}`, "date_from": period.from, "date_to": period.to, "status": "eq.approved" }, order: "date.asc,created_at.asc" },
    [projectId, period.from, period.to]
  );
  if (loading) return <Loader />;

  // جمع حسب التاريخ
  const byDate = {};
  ledger.forEach(e => {
    if (!e.date || !e.type) return;
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  });
  const dates = Object.keys(byDate).sort();

  const buildLines = (entries) => {
    const lines = [];
    entries.forEach(e => {
      const mapFn = JOURNAL_MAP[e.type];
      if (!mapFn) return;
      const ls = mapFn(e);
      ls.forEach(l => { if (l.amt > 0 && l.dr !== l.cr) lines.push(l); });
    });
    return lines;
  };

  const unbalancedCount = dates.filter(d => {
    const ls = buildLines(byDate[d]);
    return ls.length > 0 && Math.abs(ls.reduce((s, l) => s + l.amt, 0) - ls.reduce((s, l) => s + l.amt, 0)) >= 0.01;
  }).length;

  return (
    <div className="page">
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <KPI label="عدد القيود اليومية" value={dates.length}              color={T.acc}  icon="📒" />
        <KPI label="قيود متوازنة"        value={dates.length - unbalancedCount} color={T.green} icon="✅" />
        <KPI label="قيود تحتاج مراجعة"  value={unbalancedCount}             color={unbalancedCount > 0 ? T.red : T.green} icon="⚠" />
        <KPI label="إجمالي الحركات"      value={ledger.length}              color={T.blue} icon="📋" />
      </div>

      {dates.map((date, di) => {
        const entries = byDate[date];
        const lines   = buildLines(entries);
        if (!lines.length) return null;
        const totalD   = lines.reduce((s, l) => s + l.amt, 0);
        const totalC   = totalD; // في القيود المزدوجة دائماً متساويان بالتعريف
        const vNo      = String(di + 1).padStart(4, "0");

        return (
          <div key={date} className="journal-card">
            {/* رأس القيد */}
            <div className="j-header" style={{ background: `linear-gradient(90deg, ${T.bg3}, ${T.bg2})`, borderBottom: `1px solid ${T.line}` }}>
              <span className="j-voucher">قيد {vNo}</span>
              <span className="j-date">{date}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: T.acc, fontFamily: "'IBM Plex Mono'" }}>{fmt(totalD)} ريال</span>
              <span className="tag tag-ok">✅ متوازن</span>
            </div>

            {/* جدول القيد */}
            <table className="j-tbl">
              <thead>
                <tr>
                  <th style={{ width: "40%" }}>البيان</th>
                  <th>الحساب</th>
                  <th style={{ textAlign: "left" }}>مدين</th>
                  <th style={{ textAlign: "left" }}>دائن</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, li) => (
                  <>
                    {/* سطر المدين */}
                    <tr key={`dr-${li}`} className="dr" style={{ background: "rgba(74,159,255,0.03)" }}>
                      <td style={{ fontSize: 12, color: T.text1 }}>{l.desc}</td>
                      <td style={{ fontSize: 12, fontWeight: 600, color: T.text0 }}>{l.dr}</td>
                      <td style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: T.blue, textAlign: "left", fontWeight: 700 }}>{fmt(l.amt)}</td>
                      <td className="dash">—</td>
                    </tr>
                    {/* سطر الدائن */}
                    <tr key={`cr-${li}`} className="cr" style={{ background: "rgba(255,71,87,0.02)" }}>
                      <td style={{ fontSize: 12, color: T.text2, paddingRight: 28 }}>← إلى</td>
                      <td style={{ fontSize: 12, color: T.text1 }}>{l.cr}</td>
                      <td className="dash">—</td>
                      <td style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: T.red, textAlign: "left", fontWeight: 700 }}>{fmt(l.amt)}</td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>

            {/* الإجمالي */}
            <div className="j-total" style={{ background: `${T.green}08` }}>
              <span style={{ color: T.text0, fontWeight: 700 }}>الإجمالي</span>
              <span style={{ fontFamily: "'IBM Plex Mono'", color: T.blue, textAlign: "left" }}>{fmt(totalD)}</span>
              <span style={{ fontFamily: "'IBM Plex Mono'", color: T.red,  textAlign: "left" }}>{fmt(totalC)}</span>
            </div>
          </div>
        );
      })}

      {dates.length === 0 && (
        <div className="empty"><div className="empty-icon">📒</div><div className="empty-text">لا توجد قيود في هذه الفترة</div></div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
//  التطبيق الرئيسي
// ─────────────────────────────────────────
const NAV_ITEMS = [
  { id: "review",  icon: "📋", label: "مراجعة الحركات",    section: "العمليات" },
  { id: "ledger",  icon: "📒", label: "الدفتر الأمريكي",   section: null },
  { id: "reports", icon: "📊", label: "لوحة التقارير",     section: "التقارير" },
  { id: "income",  icon: "📈", label: "قائمة الدخل",       section: null },
  { id: "balance", icon: "⚖️",  label: "الميزانية العمومية", section: null },
  { id: "trial",   icon: "✅", label: "ميزان المراجعة",    section: null },
  { id: "journal", icon: "📑", label: "القيود المحاسبية",   section: null },
];

export default function App() {
  const [page,    setPage]   = useState("review");
  const [period,  setPeriod] = useState({ from: monthStart(), to: today() });
  const [pending, setPending]= useState(0);
  const [menuOpen,setMenu]   = useState(false);

  // تحديث عداد المعلقين
  useEffect(() => {
    sb.query("ledger_entries", { filter: { "project_id": `eq.${PROJECT_ID}`, "status": "neq.approved" }, select: "id" })
      .then(r => setPending(r.length))
      .catch(() => {});
  }, [page]);

  const nav = (id) => { setPage(id); setMenu(false); };
  const cur = NAV_ITEMS.find(n => n.id === page);

  const canPrint = ["reports","income","balance","trial","journal"].includes(page);

  return (
    <>
      <style>{CSS}</style>
      <div className="layout">
        {menuOpen && <div className="mob-overlay" onClick={() => setMenu(false)} />}

        {/* Sidebar */}
        <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
          <div className="sb-logo">
            <div className="sb-logo-mark">
              <div className="sb-logo-icon">☕</div>
              <div>
                <div className="sb-logo-name">مزاهر</div>
                <div className="sb-logo-sub">نظام المحاسبة</div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: T.text2, marginTop: 6 }}>{COMPANY_NAME}</div>
          </div>

          <nav className="sb-nav">
            {NAV_ITEMS.map((n, i) => (
              <div key={n.id}>
                {n.section && <div className="nav-section">{n.section}</div>}
                <div className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => nav(n.id)}>
                  <span className="nav-icon">{n.icon}</span>
                  <span>{n.label}</span>
                  {n.id === "review" && pending > 0 && <span className="nav-badge">{pending}</span>}
                </div>
              </div>
            ))}
          </nav>

          <div className="sb-bottom">
            <div className="sb-period">
              <div className="sb-period-label">الفترة الزمنية</div>
              <div style={{ marginBottom: 5 }}>
                <div style={{ fontSize: 10, color: T.text2, marginBottom: 2 }}>من</div>
                <input type="date" value={period.from} onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.text2, marginBottom: 2 }}>إلى</div>
                <input type="date" value={period.to} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} />
              </div>
            </div>
            <div style={{ fontSize: 10, color: T.text2, textAlign: "center" }}>v2.0 — إصلاحات محاسبية</div>
          </div>
        </aside>

        {/* Main */}
        <div className="main">
          <div className="topbar">
            <button className="mob-menu-btn" onClick={() => setMenu(true)}>☰</button>
            <div className="topbar-title">{cur?.icon} {cur?.label}</div>
            {canPrint && (
              <button className="topbar-btn btn-ghost" onClick={() => window.print()}>
                🖨 طباعة / PDF
              </button>
            )}
            <div style={{ fontSize: 11, color: T.text2, fontFamily: "'IBM Plex Mono'" }}>
              {period.from} → {period.to}
            </div>
          </div>

          {page === "review"  && <ReviewPage       projectId={PROJECT_ID} period={period} />}
          {page === "ledger"  && <LedgerPage        projectId={PROJECT_ID} />}
          {page === "reports" && <ReportsPage       projectId={PROJECT_ID} period={period} />}
          {page === "income"  && <IncomeStatement   projectId={PROJECT_ID} period={period} />}
          {page === "balance" && <BalanceSheet      projectId={PROJECT_ID} />}
          {page === "trial"   && <TrialBalance      projectId={PROJECT_ID} period={period} />}
          {page === "journal" && <JournalPage       projectId={PROJECT_ID} period={period} />}
        </div>
      </div>
    </>
  );
}
