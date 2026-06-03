// ============================================================
//  نظام محاسبة مزاهر — v3.0 — نظيف من الصفر
// ============================================================

// المفاتيح الحساسة تُقرأ من Script Properties (File → Project Settings → Script Properties)
// اسم الخاصية: CLAUDE_API_KEY, SUPABASE_KEY
var _props = PropertiesService.getScriptProperties().getProperties();

var CONFIG = {
  CLAUDE_API_KEY:    _props.CLAUDE_API_KEY    || "",
  CLAUDE_MODEL:      "claude-opus-4-5",
  INBOX_FOLDER_ID:   "13WE3L_cJxUfc3XbpgWUSvhXAFCcPcb37",
  ARCHIVE_PARENT_ID: "1WU6WdDmfSlVfwAa-CmM6Vok0g3mY0pij",
  SUPABASE_URL:      "https://dnuxevxxgmgptptmuzdy.supabase.co",
  SUPABASE_KEY:      _props.SUPABASE_KEY      || "",
  CLIENT_EMAIL:      "a.aldiyafa@gmail.com",
  COMPANY_NAME:      "مقهى ديوانية مزاهر",
  ACCOUNTANT_NAME:   "أبو عبدالملك",

  SHEET_SALES:   "المبيعات",
  SHEET_LEDGER:  "الدفتر",
  SHEET_LOANS:   "القروض",
  SHEET_REPORTS: "التقارير",

  TRANSACTION_TYPES: [
    "💵 مبيعات كاش",
    "🏦 مبيعات شبكة",
    "🛒 مصروفات تشغيلية",
    "💰 مصروفات ثابتة",
    "💳 قسط سيارة",
    "💳 قسط شراء أرض",
    "💳 قرض ١",
    "💳 قرض ٢",
    "👤 صرف عهدة",
    "💼 مسحوبات سليمان",
    "💼 مسحوبات أم طوبى",
    "🏛️ ضريبة القيمة المضافة",
    "🔄 تحويل داخلي"
  ]
};

// ══════════════════════════════════════════
//  المزامنة الرئيسية
// ══════════════════════════════════════════
function runDailySync() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { Logger.log("⏳ يعمل بالفعل"); return; }

  try {
    Logger.log("═══ بدء المزامنة ═══");
    var folder = DriveApp.getFolderById(CONFIG.INBOX_FOLDER_ID);
    var files  = folder.getFiles();
    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var done   = 0, skip = 0, err = 0;

    while (files.hasNext()) {
      var file     = files.next();
      var mime     = file.getMimeType();
      var fileId   = file.getId();

      // فحص التكرار
      if (isProcessed(fileId)) { skip++; continue; }

      // فحص التصنيف التلقائي أولاً
      var quickClass = autoClassify(file.getName());
      if (quickClass) Logger.log("🏷️ تصنيف تلقائي: " + file.getName() + " → " + quickClass.type);

      // معالجة الملف
      var result = null;
      try {
        if (isImage(mime))              result = processImage(file);
        else if (mime==="application/pdf") result = processPdf(file);
        else { markProcessed(fileId, "unsupported"); continue; }
      } catch(e) {
        Logger.log("❌ خطأ في معالجة: "+file.getName()+" — "+e.message);
        err++;
        continue;
      }

      if (!result || !result.success) {
        Logger.log("❌ فشل التحليل: "+file.getName());
        err++;
        continue;
      }

      // احتفظ بمرجع الملف — سيُنقل بعد كتابة القيد
      var fileUrl = file.getUrl();
      var fileToMove = file;
      var fileDateStr = result.data.date instanceof Date ?
        Utilities.formatDate(result.data.date, Session.getScriptTimeZone(), "yyyy-MM-dd") :
        result.data.date.toString().trim();

      // كتابة البيانات
      try {
        if (result.type === "sales") {
          if (!salesDateExists(ss, result.data.date)) {
            writeSales(ss, result.data, fileUrl);
          } else {
            Logger.log("⚠️ تاريخ مبيعات مكرر: "+result.data.date);
          }
        } else if (result.type === "auto") {
          writeAuto(ss, result.data, file.getName(), fileUrl);
        } else {
          writePending(ss, result.data, file.getName(), fileUrl);
        }
        markProcessed(fileId, "done");
        done++;
        Logger.log("✅ "+file.getName());

        // تأكد من وجود القيد أولاً ثم انقل الفاتورة
        try {
          // تحديث القيد أولاً
          journalDateIndex = null; // أعد تحميل الفهرس
          var jFolder = getOrCreateJournalFolder(fileDateStr);
          // لو رجع مجلد الشهر (ما في قيد بعد) — أنشئ القيد الآن
          if (jFolder.getName() === fileDateStr.substring(0,7)) {
            var ledgerSheet = ss.getSheetByName(CONFIG.SHEET_LEDGER);
            var lLast2 = ledgerSheet.getLastRow();
            if (lLast2 > 2) {
              var lRows2 = ledgerSheet.getRange(3, 1, lLast2-2, 15).getValues();
              var dayE = [];
              lRows2.forEach(function(r) {
                if (!r[0]) return;
                var d2 = r[0] instanceof Date ?
                  Utilities.formatDate(r[0], Session.getScriptTimeZone(), "yyyy-MM-dd") :
                  r[0].toString().trim();
                if (d2 === fileDateStr) dayE.push({type:r[1],desc:r[2],cashOut:r[3],cashIn:r[4],bankOut:r[5],bankIn:r[6],custodyOut:r[7],custodyIn:r[8],vat:r[14]});
              });
              if (dayE.length > 0) {
                smartUpdateJournal(ss, fileDateStr, dayE);
                journalDateIndex = null;
                jFolder = getOrCreateJournalFolder(fileDateStr);
              }
            }
          }
          fileToMove.moveTo(jFolder);
          Logger.log("📁 " + fileToMove.getName() + " → " + jFolder.getName());
        } catch(moveErr) {
          Logger.log("⚠️ فشل نقل الملف: " + moveErr.message);
        }

      } catch(e) {
        Logger.log("❌ خطأ في الكتابة: "+file.getName()+" — "+e.message);
        err++;
      }
    }

    Logger.log("═══ انتهت: "+done+" معالج، "+skip+" مكرر، "+err+" خطأ ═══");
  } finally {
    lock.releaseLock();
  }
}

// ══════════════════════════════════════════
//  فحص تكرار المبيعات
// ══════════════════════════════════════════
function salesDateExists(ss, date) {
  var sheet = ss.getSheetByName(CONFIG.SHEET_SALES);
  var last  = sheet.getLastRow();
  if (last < 2) return false;
  var dates = sheet.getRange(2, 1, last-1, 1).getValues();
  var d = date ? date.toString().trim() : "";
  for (var i=0; i<dates.length; i++) {
    if (dates[i][0] && dates[i][0].toString().trim() === d) return true;
  }
  return false;
}

// ══════════════════════════════════════════
//  سجل الملفات المعالجة
// ══════════════════════════════════════════
function isProcessed(fileId) {
  return PropertiesService.getScriptProperties().getProperty("f_"+fileId) !== null;
}
function markProcessed(fileId, status) {
  PropertiesService.getScriptProperties().setProperty("f_"+fileId, status+"_"+new Date().toISOString());
}

// ══════════════════════════════════════════
//  معالجة الملفات
// ══════════════════════════════════════════
function processImage(file) {
  var blob = file.getBlob();
  var b64  = Utilities.base64Encode(blob.getBytes());
  var mime = blob.getContentType();
  var text = callClaude({
    model: CONFIG.CLAUDE_MODEL, max_tokens: 600,
    messages:[{role:"user",content:[
      {type:"image",source:{type:"base64",media_type:mime,data:b64}},
      {type:"text",text:buildPrompt(file.getName())}
    ]}]
  });
  return parseResponse(text);
}

function processPdf(file) {
  var b64  = Utilities.base64Encode(file.getBlob().getBytes());
  var text = callClaude({
    model: CONFIG.CLAUDE_MODEL, max_tokens: 600,
    messages:[{role:"user",content:[
      {type:"document",source:{type:"base64",media_type:"application/pdf",data:b64}},
      {type:"text",text:buildPrompt(file.getName())}
    ]}]
  });
  return parseResponse(text);
}

// ══════════════════════════════════════════
//  البرومبت
// ══════════════════════════════════════════
function buildPrompt(fileName) {
  var today = todayStr();
  var hint  = autoClassify(fileName);
  var hintText = hint ? "\n- تلميح مهم: بناءً على اسم الملف هذه على الأرجح [" + hint.type + "] — " + hint.desc + " استخدم هذا النوع إلا إذا كان المستند يدل على غيره بوضوح." : "";

  return "أنت مساعد محاسبي. اسم الملف: "+fileName+"\nاليوم: "+today+"\n\n"+
    "أنواع الحركات: 💵 مبيعات كاش | 🏦 مبيعات شبكة | 🛒 مصروفات تشغيلية | 💰 مصروفات ثابتة | 💳 قسط قرض | 👤 صرف عهدة | ✅ تسوية عهدة | 💼 مسحوبات سليمان | 💼 مسحوبات أم طوبى | 🏛️ ضريبة القيمة المضافة\n"+
    "مصادر الدفع: cash=صندوق | bank=بنك/مدى/تحويل | custody=عهدة\n\n"+

    "١. تقرير POS (مبيعات يومية كاش+شبكة):\n"+
    "{\"type\":\"sales\",\"date\":\"YYYY-MM-DD\",\"cashSales\":0.00,\"networkSales\":0.00,\"totalSales\":0.00}\n\n"+

    "٢. مستند واضح 100% (إيصال بنكي، سند صرف):\n"+
    "{\"type\":\"auto\",\"date\":\"YYYY-MM-DD\",\"amount\":0.00,\"vatAmount\":0.00,\"transType\":\"النوع من القائمة\",\"paySource\":\"cash/bank/custody\",\"description\":\"وصف أقل من 50 حرف\"}\n\n"+

    "٣. فاتورة شراء عادية (الافتراضي):\n"+
    "{\"type\":\"auto\",\"date\":\"YYYY-MM-DD\",\"amount\":0.00,\"vatAmount\":0.00,\"transType\":\"🛒 مصروفات تشغيلية\",\"paySource\":\"custody\",\"description\":\"وصف أقل من 50 حرف\"}\n\n"+

    "٤. غير واضح:\n"+
    "{\"type\":\"expense\",\"date\":\"YYYY-MM-DD\",\"amount\":0.00,\"vatAmount\":0.00,\"description\":\"وصف أقل من 50 حرف\"}\n\n"+

    "قواعد:\n"+
    "- التاريخ YYYY-MM-DD — إذا غير واضح استخدم "+today+"\n"+
    "- المبلغ: الإجمالي فقط\n"+
    "- vatAmount: مبلغ الضريبة إذا مذكور صراحةً وإلا 0\n"+
    hintText+"\n"+
    "- JSON فقط بدون أي نص إضافي";
}

// ══════════════════════════════════════════
//  Claude API
// ══════════════════════════════════════════
function callClaude(payload) {
  var r = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", contentType:"application/json", muteHttpExceptions:true,
    headers:{"x-api-key":CONFIG.CLAUDE_API_KEY,"anthropic-version":"2023-06-01"},
    payload:JSON.stringify(payload)
  });
  if (r.getResponseCode()!==200) throw new Error("API خطأ "+r.getResponseCode());
  return JSON.parse(r.getContentText()).content[0].text.trim();
}

// ══════════════════════════════════════════
//  تحليل الرد
// ══════════════════════════════════════════
function parseResponse(text) {
  try {
    var clean = text.replace(/```json/gi,"").replace(/```/g,"").trim();
    var s = clean.indexOf("{"), e = clean.lastIndexOf("}");
    if (s===-1||e===-1) throw new Error("لا JSON");
    var d = JSON.parse(clean.substring(s,e+1));
    if (!d.type||!d.date) throw new Error("حقول ناقصة");
    d.date = fixDate(d.date);
    return {success:true, type:d.type, data:d};
  } catch(e) {
    return {success:false, error:e.message};
  }
}

function fixDate(d) {
  if (!d) return todayStr();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  var m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return m[3]+"-"+m[2]+"-"+m[1];
  return todayStr();
}

function todayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// ══════════════════════════════════════════
//  الأرشيف
// ══════════════════════════════════════════
function getOrCreateJournalFolder(dateStr) {
  var parent    = DriveApp.getFolderById(CONFIG.ARCHIVE_PARENT_ID);
  var monthName = dateStr.substring(0,7);
  var monthFolders = parent.getFoldersByName(monthName);
  var monthFolder  = monthFolders.hasNext() ? monthFolders.next() : parent.createFolder(monthName);

  // ابحث عن رقم القيد
  try {
    var ss        = SpreadsheetApp.getActiveSpreadsheet();
    var index     = buildJournalDateIndex(ss);
    var voucherNo = index[dateStr];
    if (voucherNo) {
      var jName    = "قيد-" + formatVoucherNo(voucherNo);
      var jFolders = monthFolder.getFoldersByName(jName);
      return jFolders.hasNext() ? jFolders.next() : monthFolder.createFolder(jName);
    }
  } catch(e) {}
  return monthFolder;
}

function getMonthFolder(dateStr) {
  var parent  = DriveApp.getFolderById(CONFIG.ARCHIVE_PARENT_ID);
  var month   = dateStr ? dateStr.substring(0,7) : todayStr().substring(0,7);
  var folders = parent.getFoldersByName(month);
  return folders.hasNext() ? folders.next() : parent.createFolder(month);
}

// ══════════════════════════════════════════
//  كتابة المبيعات
// ══════════════════════════════════════════
function writeSales(ss, d, url) {
  var sheet = ss.getSheetByName(CONFIG.SHEET_SALES);

  // ── فحص تكرار المبيعات بالتاريخ ──
  var dateStr = d.date instanceof Date ?
    Utilities.formatDate(d.date, Session.getScriptTimeZone(), "yyyy-MM-dd") :
    d.date.toString().trim();

  var salesExists = false;
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var existingDates = sheet.getRange(2, 1, lastRow-1, 1).getValues();
    for (var i = 0; i < existingDates.length; i++) {
      var existDate = existingDates[i][0] instanceof Date ?
        Utilities.formatDate(existingDates[i][0], Session.getScriptTimeZone(), "yyyy-MM-dd") :
        existingDates[i][0].toString().trim();
      if (existDate === dateStr) {
        salesExists = true;
        break;
      }
    }
  }
  // لو المبيعات موجودة في شيت المبيعات — تخطى كتابتها فقط لكن تابع للدفتر
  if (salesExists) {
    Logger.log("⚠️ تكرار مبيعات في شيت المبيعات — " + dateStr + " — سيتحقق من الدفتر");
  }

  if (!salesExists) {
    var row = sheet.getLastRow()+1;
    sheet.getRange(row,1,1,6).setValues([[
      new Date(d.date),
      Number(d.cashSales)||0,
      Number(d.networkSales)||0,
      Number(d.totalSales)||0,
      "تقرير POS",
      url ? '=HYPERLINK("'+url+'","📎")' : ""
    ]]);
    sheet.getRange(row,1).setNumberFormat("yyyy-mm-dd");
    sheet.getRange(row,2,1,3).setNumberFormat("#,##0.00");
  }

  // كتابة في الدفتر
  var cash = Number(d.cashSales)||0;
  var net  = Number(d.networkSales)||0;
  if (cash>0) writeLedger(ss,{date:d.date,type:"💵 مبيعات كاش",desc:"مبيعات كاش "+d.date,cashIn:cash},url,"#E8F5E9");
  if (net>0)  writeLedger(ss,{date:d.date,type:"🏦 مبيعات شبكة",desc:"مبيعات شبكة "+d.date,bankIn:net},url,"#E8F5E9");

  // مزامنة Supabase
  try { syncSalesToSupabase({date:d.date,cashSales:d.cashSales,networkSales:d.networkSales,description:d.description,fileUrl:url}); } catch(e){ Logger.log("⚠️ Supabase sync: "+e.message); }
}

// ══════════════════════════════════════════
//  كتابة مصروف واضح (auto)
// ══════════════════════════════════════════
function writeAuto(ss, d, fileName, url) {
  var pay    = d.paySource || "custody";
  var amount = Number(d.amount)||0;
  var row    = {};
  row.date     = d.date;
  row.type     = d.transType || "🛒 مصروفات تشغيلية";
  row.desc     = (d.description||fileName).substring(0,50);
  row.vat      = Number(d.vatAmount)||0;
  row.total    = amount;
  row.fileName = fileName;

  if (pay==="bank")         row.bankOut    = amount;
  else if (pay==="custody") row.custodyOut = amount;
  else                      row.cashOut    = amount;

  writeLedger(ss, row, url, "#E3F2FD");
  checkDuplicate(ss, d.date, amount, fileName);
}

// ══════════════════════════════════════════
//  كتابة مصروف غير واضح (pending)
// ══════════════════════════════════════════
function writePending(ss, d, fileName, url) {
  var amount = Number(d.amount)||0;
  var row    = {};
  row.date     = d.date;
  row.type     = "";
  row.desc     = (d.description||fileName).substring(0,50);
  row.total    = amount;
  row.vat      = Number(d.vatAmount)||0;
  row.fileName = fileName;

  writeLedger(ss, row, url, "#FFF9C4");
  checkDuplicate(ss, d.date, amount, fileName);
}

// ══════════════════════════════════════════
//  كتابة سطر في الدفتر
// ══════════════════════════════════════════
function ledgerRowExists(sheet, date, type) {
  var last = sheet.getLastRow();
  if (last < 3) return false;
  var dates = sheet.getRange(3,1,last-2,1).getValues();
  var types = sheet.getRange(3,2,last-2,1).getValues();
  for (var i=0; i<dates.length; i++) {
    if (dates[i][0] && dates[i][0].toString().trim()===date &&
        types[i][0] && types[i][0].toString().trim()===type) return true;
  }
  return false;
}

function ledgerFileExists(sheet, fileName) {
  if (!fileName) return false;
  var last = sheet.getLastRow();
  if (last < 3) return false;
  var col13 = sheet.getRange(3,13,last-2,1).getValues();
  for (var i=0; i<col13.length; i++) {
    var cell = col13[i][0] ? col13[i][0].toString() : "";
    if (cell.indexOf(fileName) !== -1) return true;
  }
  return false;
}

function ledgerEntryExists(sheet, date, amount, desc) {
  var last = sheet.getLastRow();
  if (last < 3) return false;
  var count  = last - 2;
  var dates  = sheet.getRange(3,1,count,1).getValues();
  var totals = sheet.getRange(3,14,count,1).getValues();
  var descs  = sheet.getRange(3,3,count,1).getValues();
  var d = date ? date.toString().trim() : "";
  var a = Number(amount) || 0;
  var s = desc ? desc.toString().trim().substring(0,20) : "";
  for (var i=0; i<count; i++) {
    var rd = dates[i][0]  ? dates[i][0].toString().trim()  : "";
    var ra = Number(totals[i][0]) || 0;
    var rs = descs[i][0]  ? descs[i][0].toString().trim().substring(0,20) : "";
    if (rd===d && ra===a && rs===s && a>0) return true;
  }
  return false;
}

function writeLedger(ss, row, url, color) {
  var sheet  = ss.getSheetByName(CONFIG.SHEET_LEDGER);

  // فحص تكرار سطور المبيعات
  if (row.type==="💵 مبيعات كاش" || row.type==="🏦 مبيعات شبكة") {
    if (ledgerRowExists(sheet, row.date, row.type)) {
      Logger.log("⚠️ تكرار مبيعات في الدفتر: "+row.type+" "+row.date);
      return;
    }
  }

  // فحص تكرار باسم الملف
  if (row.fileName && ledgerFileExists(sheet, row.fileName)) {
    Logger.log("⚠️ مكرر (اسم الملف): "+row.fileName);
    return;
  }
  // فحص تكرار بالتاريخ + المبلغ + الوصف
  if (row.total && row.desc && ledgerEntryExists(sheet, row.date, row.total, row.desc)) {
    Logger.log("⚠️ مكرر (تاريخ+مبلغ+وصف): "+row.date+" "+row.total);
    return;
  }

  var n      = sheet.getLastRow()+1;

  // حفظ التاريخ كتاريخ فعلي مو نص
  var dateVal = row.date ? new Date(row.date) : new Date();
  sheet.getRange(n,1).setValue(dateVal).setNumberFormat("yyyy-mm-dd");
  sheet.getRange(n,2).setValue(row.type||"");
  sheet.getRange(n,3).setValue(row.desc||"");

  if (row.cashOut)    sheet.getRange(n,4).setValue(row.cashOut);
  if (row.cashIn)     sheet.getRange(n,5).setValue(row.cashIn);
  if (row.bankOut)    sheet.getRange(n,6).setValue(row.bankOut);
  if (row.bankIn)     sheet.getRange(n,7).setValue(row.bankIn);
  if (row.custodyOut) sheet.getRange(n,8).setValue(row.custodyOut);
  if (row.custodyIn)  sheet.getRange(n,9).setValue(row.custodyIn);
  if (row.total)      sheet.getRange(n,14).setValue(row.total);
  if (row.vat>0)      sheet.getRange(n,15).setValue(row.vat);
  if (url)            sheet.getRange(n,13).setFormula('=HYPERLINK("'+url+'","📎")');

  // صيغ الأرصدة
  sheet.getRange(n,10).setFormula("=J"+(n-1)+"+E"+n+"-D"+n);
  sheet.getRange(n,11).setFormula("=K"+(n-1)+"+G"+n+"-F"+n);
  sheet.getRange(n,12).setFormula("=L"+(n-1)+"+I"+n+"-H"+n);

  sheet.getRange(n,4,1,9).setNumberFormat("#,##0.00");
  sheet.getRange(n,10,1,3).setNumberFormat("#,##0.00");
  sheet.getRange(n,14,1,2).setNumberFormat("#,##0.00");

  // قائمة منسدلة للنوع
  if (!row.type || row.type==="") {
    applyDropdown(sheet,n);
  } else {
    applyDropdown(sheet,n); // دايماً نضع القائمة حتى للتعديل
  }

  sheet.getRange(n,1,1,15).setBackground(color||"#FFFFFF");

  // مزامنة Supabase
  var isDup = color==="#FFCCBC";
  var st    = color==="#E8F5E9"?"approved":color==="#E3F2FD"?"auto":"pending";
  try { syncLedgerToSupabase({date:row.date,type:row.type||"",desc:row.desc||"",cashOut:row.cashOut,cashIn:row.cashIn,bankOut:row.bankOut,bankIn:row.bankIn,custodyOut:row.custodyOut,custodyIn:row.custodyIn,vat:row.vat,fileUrl:url,isDuplicate:isDup}, st); } catch(e){ Logger.log("⚠️ Supabase sync: "+e.message); }

  // تحديث القيود الذكي تلقائياً بعد كل فاتورة
  if (st === "approved" || color==="#E8F5E9") {
    try {
      var ss2 = SpreadsheetApp.getActiveSpreadsheet();
      var dateStr = row.date instanceof Date ?
        Utilities.formatDate(row.date, Session.getScriptTimeZone(), "yyyy-MM-dd") :
        row.date.toString().trim();
      // جمع كل عمليات هذا اليوم لإعادة بناء القيد
      var ledgerSheet = ss2.getSheetByName(CONFIG.SHEET_LEDGER);
      var lLast = ledgerSheet.getLastRow();
      if (lLast > 2) {
        var lRows = ledgerSheet.getRange(3, 1, lLast-2, 15).getValues();
        var dayEntries = [];
        lRows.forEach(function(r) {
          if (!r[0]) return;
          var d = r[0] instanceof Date ?
            Utilities.formatDate(r[0], Session.getScriptTimeZone(), "yyyy-MM-dd") :
            r[0].toString().trim();
          if (d === dateStr) {
            dayEntries.push({type:r[1],desc:r[2],cashOut:r[3],cashIn:r[4],bankOut:r[5],bankIn:r[6],custodyOut:r[7],custodyIn:r[8],vat:r[14]});
          }
        });
        if (dayEntries.length > 0) smartUpdateJournal(ss2, dateStr, dayEntries);
      }
    } catch(e2) { Logger.log("⚠️ smart journal: " + e2.message); }
  }
}

// ── كتابة رقم القيد في الدفتر بعد إنشاء القيد ──
function updateLedgerWithJournalNo(ss, date, voucherNo) {
  try {
    var sheet = ss.getSheetByName(CONFIG.SHEET_LEDGER);
    var last  = sheet.getLastRow();
    if (last < 3) return;
    var dates = sheet.getRange(3, 1, last-2, 1).getValues();
    var dateStr = date instanceof Date ?
      Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd") : date.toString().trim();
    for (var i=0; i<dates.length; i++) {
      var d = dates[i][0] instanceof Date ?
        Utilities.formatDate(dates[i][0], Session.getScriptTimeZone(), "yyyy-MM-dd") : dates[i][0].toString().trim();
      if (d === dateStr) {
        // عمود P (16) = رقم القيد
        sheet.getRange(i+3, 16).setValue("قيد-" + formatVoucherNo(voucherNo));
      }
    }
  } catch(e) { Logger.log("⚠️ خطأ في تحديث رقم القيد: " + e.message); }
}

// ══════════════════════════════════════════
//  فحص التكرار
// ══════════════════════════════════════════
function checkDuplicate(ss, date, amount, fileName) {
  if (!amount || amount<=0) return;
  var sheet  = ss.getSheetByName(CONFIG.SHEET_LEDGER);
  var last   = sheet.getLastRow();
  if (last < 4) return;
  var count  = last-3;
  var dates  = sheet.getRange(3,1,count,1).getValues();
  var totals = sheet.getRange(3,14,count,1).getValues();
  var currentRow = last;

  for (var i=0; i<count; i++) {
    if (i+3 === currentRow) continue;
    var d = dates[i][0] ? dates[i][0].toString().trim() : "";
    var a = Number(totals[i][0])||0;
    if (d===date && a===amount) {
      sheet.getRange(currentRow,1,1,15).setBackground("#FFCCBC");
      sheet.getRange(currentRow,3).setNote("⚠️ تكرار محتمل — نفس التاريخ والمبلغ في السطر "+(i+3)+"\\nالملف: "+fileName);
      return;
    }
  }
}

// ══════════════════════════════════════════
//  القائمة المنسدلة
// ══════════════════════════════════════════
function applyDropdown(sheet, row) {
  sheet.getRange(row,2).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(CONFIG.TRANSACTION_TYPES,true)
      .setAllowInvalid(false).build()
  );
}


// ══════════════════════════════════════════
//  إعداد الشيتات
// ══════════════════════════════════════════
function setupAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  try { step1_setupSales(ss);   } catch(e){ ui.alert("❌ المبيعات: "+e.message); return; }
  Utilities.sleep(1500);
  try { step2_setupLedger(ss);  } catch(e){ ui.alert("❌ الدفتر: "+e.message); return; }
  Utilities.sleep(1500);
  try { step3_setupLoans(ss);   } catch(e){ ui.alert("❌ القروض: "+e.message); return; }
  Utilities.sleep(1500);
  try { step4_setupReports(ss); } catch(e){ ui.alert("❌ التقارير: "+e.message); return; }
  ui.alert("✅ النظام جاهز!\n\n١. ضبط الأرصدة الافتتاحية\n٢. إعداد المزامنة التلقائية");
}

function step1_setupSales(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(CONFIG.SHEET_SALES) || ss.insertSheet(CONFIG.SHEET_SALES);
  s.clearContents(); s.clearFormats();
  s.getRange(1,1,1,6).setValues([["التاريخ","مبيعات كاش","مبيعات شبكة","إجمالي المبيعات","ملاحظات","الفاتورة"]])
   .setBackground("#1B4F72").setFontColor("#FFF").setFontWeight("bold").setHorizontalAlignment("center");
  [110,130,140,150,200,80].forEach(function(w,i){s.setColumnWidth(i+1,w);});
  s.setFrozenRows(1); s.setRightToLeft(true);
  Logger.log("✅ المبيعات");
}

function step2_setupLedger(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(CONFIG.SHEET_LEDGER) || ss.insertSheet(CONFIG.SHEET_LEDGER);
  s.clearContents(); s.clearFormats();
  s.getRange(1,1,s.getMaxRows(),s.getMaxColumns()).clearDataValidations();
  var h = ["التاريخ","النوع","الوصف","خرج صندوق","دخل صندوق","خرج بنك","دخل بنك","خرج عهدة","دخل عهدة","رصيد صندوق","رصيد بنك","رصيد عهدة","الفاتورة","المبلغ الإجمالي","ضريبة ق.م"];
  s.getRange(1,1,1,15).setValues([h]).setBackground("#1B4F72").setFontColor("#FFF").setFontWeight("bold").setHorizontalAlignment("center");
  s.getRange(2,1).setValue(new Date()).setNumberFormat('yyyy-mm-dd'); s.getRange(2,2).setValue("رصيد افتتاحي"); s.getRange(2,3).setValue("الأرصدة الافتتاحية");
  s.getRange(2,10).setValue(0); s.getRange(2,11).setValue(0); s.getRange(2,12).setValue(0);
  s.getRange(3,10).setFormula("=J2+E3-D3"); s.getRange(3,11).setFormula("=K2+G3-F3"); s.getRange(3,12).setFormula("=L2+I3-H3");
  [110,180,220,115,115,115,115,115,115,130,120,120,80,130,120].forEach(function(w,i){s.setColumnWidth(i+1,w);});
  s.getRange(2,4,500,9).setNumberFormat("#,##0.00"); s.getRange(2,10,500,3).setNumberFormat("#,##0.00");
  s.getRange(2,14,500,2).setNumberFormat("#,##0.00"); s.getRange(2,1,500,1).setNumberFormat("yyyy-mm-dd");
  s.getRange(1,10,501,3).setBackground("#EBF5FB"); s.getRange(1,14,1,2).setBackground("#F3E5F5").setFontColor("#6A1B9A");
  s.setFrozenRows(1); s.setFrozenColumns(3); s.setRightToLeft(true);
  Logger.log("✅ الدفتر");
}

function step3_setupLoans(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(CONFIG.SHEET_LOANS) || ss.insertSheet(CONFIG.SHEET_LOANS);
  s.clearContents(); s.clearFormats();
  s.getRange(1,1,1,6).setValues([["اسم القرض","المبلغ الأصلي","تاريخ البداية","إجمالي المسدد","المتبقي","ملاحظات"]])
   .setBackground("#1B4F72").setFontColor("#FFF").setFontWeight("bold").setHorizontalAlignment("center");
  s.getRange(2,1,4,6).setValues([["قسط سيارة",0,"","","",""],["قسط شراء أرض",0,"","","",""],["قرض ١",0,"","","",""],["قرض ٢",0,"","","",""]]);
  for (var i=0;i<4;i++) {
    var r=i+2;
    s.getRange(r,4).setFormula("=SUMPRODUCT((الدفتر!B$3:B$500=\"💳 قسط قرض\")*(ISNUMBER(SEARCH(A"+r+",الدفتر!C$3:C$500)))*(الدفتر!D$3:D$500+الدفتر!F$3:F$500))");
    s.getRange(r,5).setFormula("=IF(B"+r+"=0,\"\",B"+r+"-D"+r+")");
  }
  [180,130,130,150,120,200].forEach(function(w,i){s.setColumnWidth(i+1,w);});
  s.getRange(2,2,4,4).setNumberFormat("#,##0.00"); s.setFrozenRows(1); s.setRightToLeft(true);
  Logger.log("✅ القروض");
}

function step4_setupReports(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(CONFIG.SHEET_REPORTS) || ss.insertSheet(CONFIG.SHEET_REPORTS);
  s.clearContents(); s.clearFormats(); s.setRightToLeft(true);

  s.getRange(1,1).setValue("من تاريخ:"); s.getRange(1,2).setValue(todayStr().substring(0,8)+"01");
  s.getRange(1,3).setValue("إلى تاريخ:"); s.getRange(1,4).setValue(todayStr());
  s.getRange(1,1,1,4).setBackground("#2C3E50").setFontColor("#FFF").setFontWeight("bold");
  s.getRange(1,2).setBackground("#F8F9FA").setFontColor("#000").setNumberFormat("yyyy-mm-dd");
  s.getRange(1,4).setBackground("#F8F9FA").setFontColor("#000").setNumberFormat("yyyy-mm-dd");

  var rows = [
    ["💰  المبيعات","القيمة","% من المبيعات",""],
    ["مبيعات كاش","=SUMPRODUCT((المبيعات!A$2:A$500>=$B$1)*(المبيعات!A$2:A$500<=$D$1)*المبيعات!B$2:B$500)","=IFERROR(B4/B$6,0)",""],
    ["مبيعات شبكة","=SUMPRODUCT((المبيعات!A$2:A$500>=$B$1)*(المبيعات!A$2:A$500<=$D$1)*المبيعات!C$2:C$500)","=IFERROR(B5/B$6,0)",""],
    ["إجمالي المبيعات","=B4+B5","1",""],
    ["","","",""],
    ["📦  المصروفات","","",""],
    ["مصروفات تشغيلية","=SUMPRODUCT((الدفتر!A$3:A$500>=$B$1)*(الدفتر!A$3:A$500<=$D$1)*(الدفتر!B$3:B$500=\"🛒 مصروفات تشغيلية\")*(الدفتر!D$3:D$500+الدفتر!F$3:F$500+الدفتر!H$3:H$500))","=IFERROR(B9/B$6,0)",""],
    ["مصروفات ثابتة","=SUMPRODUCT((الدفتر!A$3:A$500>=$B$1)*(الدفتر!A$3:A$500<=$D$1)*(الدفتر!B$3:B$500=\"💰 مصروفات ثابتة\")*(الدفتر!D$3:D$500+الدفتر!F$3:F$500+الدفتر!H$3:H$500))","=IFERROR(B10/B$6,0)",""],
    ["إجمالي المصروفات","=B9+B10","=IFERROR(B11/B$6,0)",""],
    ["","","",""],
    ["📊  الربحية","","",""],
    ["مجمل الربح","=B6-(B9+B10)","=IFERROR(B14/B$6,0)",""],
    ["(-) إجمالي الأقساط","=SUMPRODUCT((الدفتر!A$3:A$500>=$B$1)*(الدفتر!A$3:A$500<=$D$1)*((الدفتر!B$3:B$500=\"💳 قسط سيارة\")+(الدفتر!B$3:B$500=\"💳 قسط شراء أرض\")+(الدفتر!B$3:B$500=\"💳 قرض ١\")+(الدفتر!B$3:B$500=\"💳 قرض ٢\"))*(الدفتر!D$3:D$500+الدفتر!F$3:F$500+الدفتر!H$3:H$500))","=IFERROR(B15/B$6,0)",""],
    ["صافي الربح","=B14-B15","=IFERROR(B16/B$6,0)",""],
    ["(-) المسحوبات","=SUMPRODUCT((الدفتر!A$3:A$500>=$B$1)*(الدفتر!A$3:A$500<=$D$1)*((الدفتر!B$3:B$500=\"💼 مسحوبات سليمان\")+(الدفتر!B$3:B$500=\"💼 مسحوبات أم طوبى\"))*(الدفتر!D$3:D$500+الدفتر!F$3:F$500+الدفتر!H$3:H$500))","=IFERROR(B17/B$6,0)",""],
    ["صافي التدفق النقدي","=B16-B17","=IFERROR(B18/B$6,0)",""],
    ["هامش الربح %","=IFERROR(B16/B6*100,0)","",""],
    ["","","",""],
    ["🏦  الأرصدة الحالية","","",""],
    ["رصيد الصندوق","=IFERROR(INDEX(الدفتر!J:J,MATCH(2,1/(الدفتر!J:J<>\"\"),1)),0)","",""],
    ["رصيد البنك","=IFERROR(INDEX(الدفتر!K:K,MATCH(2,1/(الدفتر!K:K<>\"\"),1)),0)","",""],
    ["رصيد العهدة","=IFERROR(INDEX(الدفتر!L:L,MATCH(2,1/(الدفتر!L:L<>\"\"),1)),0)","",""],
    ["","","",""],
    ["👤  العهدة","","",""],
    ["إيداعات العهدة (دخل عهدة)","=SUMPRODUCT((الدفتر!A$3:A$500>=$B$1)*(الدفتر!A$3:A$500<=$D$1)*الدفتر!I$3:I$500)","",""],
    ["مصروفات العهدة (خرج عهدة)","=SUMPRODUCT((الدفتر!A$3:A$500>=$B$1)*(الدفتر!A$3:A$500<=$D$1)*الدفتر!H$3:H$500)","",""],
    ["الرصيد المتبقي بالعهدة","=B27-B28","",""],
    ["","","",""],
    ["🏛️  الأقساط — الفترة الحالية","","",""],
    ["قسط سيارة","=SUMPRODUCT((الدفتر!A$3:A$500>=$B$1)*(الدفتر!A$3:A$500<=$D$1)*(الدفتر!B$3:B$500=\"💳 قسط سيارة\")*(الدفتر!D$3:D$500+الدفتر!F$3:F$500+الدفتر!H$3:H$500))","",""],
    ["قسط شراء أرض","=SUMPRODUCT((الدفتر!A$3:A$500>=$B$1)*(الدفتر!A$3:A$500<=$D$1)*(الدفتر!B$3:B$500=\"💳 قسط شراء أرض\")*(الدفتر!D$3:D$500+الدفتر!F$3:F$500+الدفتر!H$3:H$500))","",""],
    ["قرض ١","=SUMPRODUCT((الدفتر!A$3:A$500>=$B$1)*(الدفتر!A$3:A$500<=$D$1)*(الدفتر!B$3:B$500=\"💳 قرض ١\")*(الدفتر!D$3:D$500+الدفتر!F$3:F$500+الدفتر!H$3:H$500))","",""],
    ["قرض ٢","=SUMPRODUCT((الدفتر!A$3:A$500>=$B$1)*(الدفتر!A$3:A$500<=$D$1)*(الدفتر!B$3:B$500=\"💳 قرض ٢\")*(الدفتر!D$3:D$500+الدفتر!F$3:F$500+الدفتر!H$3:H$500))","",""],
    ["إجمالي الأقساط","=B32+B33+B34+B35","",""],
    ["","","",""],
    ["🏛️  القروض — إجمالي","","",""],
    ["اسم القرض","المبلغ الأصلي","إجمالي المسدد","المتبقي"],
    ["=القروض!A2","=IFERROR(VALUE(القروض!B2),0)","=IFERROR(VALUE(القروض!D2),0)","=IFERROR(VALUE(القروض!E2),\"\")"],
    ["=القروض!A3","=IFERROR(VALUE(القروض!B3),0)","=IFERROR(VALUE(القروض!D3),0)","=IFERROR(VALUE(القروض!E3),\"\")"],
    ["=القروض!A4","=IFERROR(VALUE(القروض!B4),0)","=IFERROR(VALUE(القروض!D4),0)","=IFERROR(VALUE(القروض!E4),\"\")"],
    ["=القروض!A5","=IFERROR(VALUE(القروض!B5),0)","=IFERROR(VALUE(القروض!D5),0)","=IFERROR(VALUE(القروض!E5),\"\")"],
    ["","","",""],
    ["💼  المسحوبات","","",""],
    ["مسحوبات سليمان","=SUMPRODUCT((الدفتر!A$3:A$500>=$B$1)*(الدفتر!A$3:A$500<=$D$1)*(الدفتر!B$3:B$500=\"💼 مسحوبات سليمان\")*(الدفتر!D$3:D$500+الدفتر!F$3:F$500+الدفتر!H$3:H$500))","=IFERROR(B46/B$6,0)",""],
    ["مسحوبات أم طوبى","=SUMPRODUCT((الدفتر!A$3:A$500>=$B$1)*(الدفتر!A$3:A$500<=$D$1)*(الدفتر!B$3:B$500=\"💼 مسحوبات أم طوبى\")*(الدفتر!D$3:D$500+الدفتر!F$3:F$500+الدفتر!H$3:H$500))","=IFERROR(B47/B$6,0)",""],
    ["إجمالي المسحوبات","=B46+B47","=IFERROR(B48/B$6,0)",""],
    ["","","",""],
    ["🧾  ضريبة القيمة المضافة","","",""],
    ["ضريبة المبيعات 15%","=B6*0.15","",""],
    ["ضريبة المشتريات","=SUMPRODUCT((الدفتر!A$3:A$500>=$B$1)*(الدفتر!A$3:A$500<=$D$1)*الدفتر!O$3:O$500)","",""],
    ["الضريبة المستحقة","=IFERROR(B52-B53,B50-B51)","",""]
  ];

  s.getRange(3,1,rows.length,4).setValues(rows);

  // عناوين الأقسام
  [3,8,13,21,26,31,38,45,50].forEach(function(r){
    s.getRange(r,1,1,4).setBackground("#1A252F").setFontColor("#FFF").setFontWeight("bold").setFontSize(11);
  });

  // رأس جدول القروض الإجمالي
  s.getRange(39,1,1,4).setBackground("#2E4057").setFontColor("#FFF").setFontWeight("bold");

  // أرقام مميزة
  s.getRange(14,2).setBackground("#E8F5E9").setFontWeight("bold").setFontColor("#2E7D32");
  s.getRange(16,2).setBackground("#E3F2FD").setFontWeight("bold").setFontColor("#1565C0");
  s.getRange(18,2).setBackground("#F3E5F5").setFontWeight("bold").setFontColor("#6A1B9A");
  s.getRange(6,2).setFontWeight("bold");
  s.getRange(11,2).setFontWeight("bold");
  s.getRange(36,2).setFontWeight("bold");

  // النسب المئوية عمود C
  s.getRange(4,3,54,1).setNumberFormat("0.0%");
  s.getRange(19,2).setNumberFormat("0.00\"%\"");

  // تنسيق المبالغ
  [4,5,6,9,10,11,14,15,16,17,18,22,23,24,27,28,29,32,33,34,35,36,40,41,42,43,46,47,48,52,53,54].forEach(function(r){
    try{ s.getRange(r,2).setNumberFormat("#,##0.00"); }catch(e){}
  });
  s.getRange(40,2,4,3).setNumberFormat("#,##0.00");

  s.setColumnWidth(1,240); s.setColumnWidth(2,155); s.setColumnWidth(3,115); s.setColumnWidth(4,130);
  s.setFrozenRows(1);
  Logger.log("✅ التقارير");
}

function addManualLedgerRow() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_LEDGER);
  var n     = sheet.getLastRow()+1;
  sheet.getRange(n,1).setValue(todayStr()).setNumberFormat("yyyy-mm-dd");
  sheet.getRange(n,4,1,9).setNumberFormat("#,##0.00");
  sheet.getRange(n,10).setFormula("=J"+(n-1)+"+E"+n+"-D"+n).setNumberFormat("#,##0.00");
  sheet.getRange(n,11).setFormula("=K"+(n-1)+"+G"+n+"-F"+n).setNumberFormat("#,##0.00");
  sheet.getRange(n,12).setFormula("=L"+(n-1)+"+I"+n+"-H"+n).setNumberFormat("#,##0.00");
  applyDropdown(sheet,n);
  sheet.getRange(n,1,1,15).setBackground("#FFF9C4");
  sheet.getRange(n,2).activate();
  SpreadsheetApp.getUi().alert("✅ صف "+n+" جاهز");
}

function addInternalTransfer() {
  var ss=SpreadsheetApp.getActiveSpreadsheet(), sheet=ss.getSheetByName(CONFIG.SHEET_LEDGER), ui=SpreadsheetApp.getUi();
  var a=ui.prompt("تحويل داخلي","المبلغ:",ui.ButtonSet.OK_CANCEL); if(a.getSelectedButton()!==ui.Button.OK)return;
  var amt=parseFloat(a.getResponseText()); if(isNaN(amt)||amt<=0){ui.alert("❌ مبلغ غير صحيح");return;}
  var f=ui.prompt("من أين؟","1=صندوق←بنك | 2=بنك←صندوق | 3=صندوق←عهدة | 4=عهدة←صندوق",ui.ButtonSet.OK_CANCEL);
  if(f.getSelectedButton()!==ui.Button.OK)return;
  var from=f.getResponseText().trim(), n=sheet.getLastRow()+1;
  sheet.getRange(n,1).setValue(todayStr()).setNumberFormat("yyyy-mm-dd");
  sheet.getRange(n,2).setValue("🔄 تحويل داخلي");
  var map={"1":["من الصندوق إلى البنك",4,7],"2":["من البنك إلى الصندوق",6,5],"3":["من الصندوق إلى العهدة",4,9],"4":["من العهدة إلى الصندوق",8,5]};
  if(!map[from]){ui.alert("❌ اختيار غير صحيح");return;}
  sheet.getRange(n,3).setValue(map[from][0]);
  sheet.getRange(n,map[from][1]).setValue(amt); sheet.getRange(n,map[from][2]).setValue(amt);
  sheet.getRange(n,4,1,6).setNumberFormat("#,##0.00");
  sheet.getRange(n,10).setFormula("=J"+(n-1)+"+E"+n+"-D"+n).setNumberFormat("#,##0.00");
  sheet.getRange(n,11).setFormula("=K"+(n-1)+"+G"+n+"-F"+n).setNumberFormat("#,##0.00");
  sheet.getRange(n,12).setFormula("=L"+(n-1)+"+I"+n+"-H"+n).setNumberFormat("#,##0.00");
  ui.alert("✅ تحويل "+amt.toFixed(2)+" ريال");
}

function setOpeningBalances() {
  var sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_LEDGER), ui=SpreadsheetApp.getUi();
  var c=ui.prompt("الأرصدة الافتتاحية","رصيد الصندوق:",ui.ButtonSet.OK_CANCEL); if(c.getSelectedButton()!==ui.Button.OK)return;
  var b=ui.prompt("الأرصدة الافتتاحية","رصيد البنك:",ui.ButtonSet.OK_CANCEL); if(b.getSelectedButton()!==ui.Button.OK)return;
  var e=ui.prompt("الأرصدة الافتتاحية","رصيد العهدة:",ui.ButtonSet.OK_CANCEL); if(e.getSelectedButton()!==ui.Button.OK)return;
  sheet.getRange(2,10).setValue(parseFloat(c.getResponseText())||0);
  sheet.getRange(2,11).setValue(parseFloat(b.getResponseText())||0);
  sheet.getRange(2,12).setValue(parseFloat(e.getResponseText())||0);
  SpreadsheetApp.getUi().alert("✅ تم حفظ الأرصدة");
}

function applyBalanceFormulas() {
  var sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_LEDGER);
  var last=sheet.getLastRow(); if(last<3)return;
  for(var r=3;r<=last;r++){
    if(!sheet.getRange(r,10).getFormula()) sheet.getRange(r,10).setFormula("=J"+(r-1)+"+E"+r+"-D"+r);
    if(!sheet.getRange(r,11).getFormula()) sheet.getRange(r,11).setFormula("=K"+(r-1)+"+G"+r+"-F"+r);
    if(!sheet.getRange(r,12).getFormula()) sheet.getRange(r,12).setFormula("=L"+(r-1)+"+I"+r+"-H"+r);
    if(!sheet.getRange(r,2).getDataValidation()) applyDropdown(sheet,r);
  }
  SpreadsheetApp.getUi().alert("✅ تم تطبيق الصيغ على "+(last-2)+" صف");
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==="runDailySync")ScriptApp.deleteTrigger(t);});
  ScriptApp.newTrigger("runDailySync").timeBased().everyMinutes(10).create();
  SpreadsheetApp.getUi().alert("✅ مزامنة تلقائية كل 10 دقائق");
}

function setupApiKeys() {
  var ui    = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var r1 = ui.prompt("🔑 إعداد المفاتيح", "أدخل CLAUDE_API_KEY:", ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var r2 = ui.prompt("🔑 إعداد المفاتيح", "أدخل SUPABASE_KEY:", ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  props.setProperty("CLAUDE_API_KEY", r1.getResponseText().trim());
  props.setProperty("SUPABASE_KEY",   r2.getResponseText().trim());
  ui.alert("✅ تم حفظ المفاتيح في Script Properties\nأعد تحميل الصفحة لتفعيلها");
}

function showProcessedFiles() {
  var props=PropertiesService.getScriptProperties().getProperties(), ui=SpreadsheetApp.getUi();
  var keys=Object.keys(props).filter(function(k){return k.startsWith("f_");});
  if(!keys.length){ui.alert("لا توجد ملفات معالجة");return;}
  var msg="الملفات المعالجة ("+keys.length+"):\n";
  keys.slice(-15).forEach(function(k){msg+="• "+props[k]+"\n";});
  ui.alert(msg);
}

function clearProcessedFiles() {
  var ui=SpreadsheetApp.getUi();
  if(ui.alert("⚠️","مسح سجل الملفات؟",ui.ButtonSet.YES_NO)!==ui.Button.YES)return;
  var props=PropertiesService.getScriptProperties();
  var keys=Object.keys(props.getProperties()).filter(function(k){return k.startsWith("f_");});
  keys.forEach(function(k){props.deleteProperty(k);});
  ui.alert("✅ تم مسح "+keys.length+" سجل");
}

function isImage(m) {
  return ["image/jpeg","image/jpg","image/png","image/webp","image/gif","image/heic","image/heif"].indexOf(m.toLowerCase())!==-1;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu("⚙️ مزاهر")
    .addItem("🚀 إعداد النظام كاملاً",        "setupAllSheets")
    .addSeparator()
    .addItem("🔄 مزامنة Drive يدوياً",        "runDailySync")
    .addItem("➕ إضافة حركة يدوية",           "addManualLedgerRow")
    .addItem("🔀 تسجيل تحويل داخلي",         "addInternalTransfer")
    .addSeparator()
    .addItem("💰 ضبط الأرصدة الافتتاحية",    "setOpeningBalances")
    .addItem("🔧 تطبيق صيغ الأرصدة",         "applyBalanceFormulas")
    .addItem("📅 ترتيب الدفتر زمنياً وتحديث الأرصدة", "sortAndRefreshLedger")
    .addItem("🗂️ إصلاح مجلدات Drive",         "fixDriveFolders")
    .addItem("⏰ إعداد المزامنة التلقائية",   "setupDailyTrigger")
    .addItem("🔑 ضبط مفاتيح API",             "setupApiKeys")
    .addSeparator()
    .addItem("📋 عرض الملفات المعالجة",       "showProcessedFiles")
    .addItem("🗑️ مسح سجل الملفات",           "clearProcessedFiles")
    .addSeparator()
    .addItem("☁️ مزامنة كل البيانات → Supabase", "syncAllToSupabase")
    .addItem("🔄 إعادة بناء كل شيء من الدفتر", "rebuildEverythingFromLedger")
    .addSeparator()
    .addItem("🏦 تسوية كشف البنك (PDF)",      "processBankStatement")
    .addItem("🏦 تسوية كشف البنك (صور)",     "processBankStatementImages")
    .addSeparator()
    .addItem("📊 بناء التقارير المحاسبية الكاملة", "buildAccountingReports")
    .addSeparator()
    .addItem("📒 تحديث القيود الذكي",               "runSmartDailyJournals")
    .addItem("🔢 إعادة تعيين ترقيم القيود",          "resetJournalNumbers")
    .addItem("📦 ربط الفواتير القديمة بالقيود",       "migrateOldInvoicesToJournals")
    .addSeparator()
    .addItem("📧 إعداد الإيميل اليومي التلقائي",      "setupDailyEmailTrigger")
    .addItem("📧 إرسال إيميل تجريبي",                 "sendTestEmail")
    .addToUi();
}

// ══════════════════════════════════════════
//  Supabase — إرسال البيانات للويب
// ══════════════════════════════════════════

function getProjectId() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("project_id");
  if (cached) return cached;

  var res = supabaseQuery("projects", "name=eq.مزاهر&select=id");
  if (res && res.length > 0) {
    cache.put("project_id", res[0].id, 3600);
    return res[0].id;
  }
  return null;
}

function supabaseQuery(table, params) {
  var url = CONFIG.SUPABASE_URL + "/rest/v1/" + table + "?" + params;
  var options = {
    method: "GET",
    headers: {
      "apikey": CONFIG.SUPABASE_KEY,
      "Authorization": "Bearer " + CONFIG.SUPABASE_KEY
    },
    muteHttpExceptions: true
  };
  var res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() !== 200) return null;
  return JSON.parse(res.getContentText());
}

function supabaseInsert(table, data) {
  var url = CONFIG.SUPABASE_URL + "/rest/v1/" + table;
  var options = {
    method: "POST",
    headers: {
      "apikey": CONFIG.SUPABASE_KEY,
      "Authorization": "Bearer " + CONFIG.SUPABASE_KEY,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates,return=minimal"
    },
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  };
  var res = UrlFetchApp.fetch(url, options);
  return res.getResponseCode() === 201;
}

function syncSalesToSupabase(data) {
  var projectId = getProjectId();
  if (!projectId) { Logger.log("❌ ما وجد project_id"); return; }

  var ok = supabaseInsert("sales", {
    project_id:    projectId,
    date:          data.date,
    cash_sales:    Number(data.cashSales)    || 0,
    network_sales: Number(data.networkSales) || 0,
    description:   data.description || "تقرير POS",
    file_url:      data.fileUrl || ""
  });
  Logger.log(ok ? "✅ مبيعات → Supabase" : "❌ فشل رفع المبيعات");
}

function syncLedgerToSupabase(data, status) {
  var projectId = getProjectId();
  if (!projectId) return;

  var total = (Number(data.cashOut)||0) + (Number(data.cashIn)||0) +
              (Number(data.bankOut)||0) + (Number(data.bankIn)||0) +
              (Number(data.custodyOut)||0) + (Number(data.custodyIn)||0);

  var ok = supabaseInsert("ledger_entries", {
    project_id:   projectId,
    date:         data.date,
    type:         data.type || "",
    description:  data.desc || "",
    cash_out:     Number(data.cashOut)    || 0,
    cash_in:      Number(data.cashIn)     || 0,
    bank_out:     Number(data.bankOut)    || 0,
    bank_in:      Number(data.bankIn)     || 0,
    custody_out:  Number(data.custodyOut) || 0,
    custody_in:   Number(data.custodyIn)  || 0,
    vat_amount:   Number(data.vat)        || 0,
    total_amount: total,
    file_url:     data.fileUrl || "",
    original_name: data.fileName || "",
    status:       status || "pending",
    is_duplicate: data.isDuplicate || false,
    drive_file_id: data.driveFileId || ""
  });
  Logger.log(ok ? "✅ دفتر → Supabase" : "❌ فشل رفع الدفتر");
}

// مزامنة يدوية — يرفع كل بيانات الشيت لـ Supabase
function supabaseDelete(table, filter) {
  var url = CONFIG.SUPABASE_URL + "/rest/v1/" + table + "?" + filter;
  UrlFetchApp.fetch(url, {
    method: "DELETE",
    headers: {
      "apikey": CONFIG.SUPABASE_KEY,
      "Authorization": "Bearer " + CONFIG.SUPABASE_KEY,
      "Prefer": "return=minimal"
    },
    muteHttpExceptions: true
  });
}

function syncAllToSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var projectId = getProjectId();

  if (!projectId) {
    ui.alert("❌ ما وجد مشروع مزاهر في Supabase");
    return;
  }

  if (ui.alert("⚠️ تحذير", "سيتم حذف كل البيانات من Supabase وإعادة رفعها من الشيت. هل تريد المتابعة؟", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  supabaseDelete("ledger_entries", "project_id=eq." + projectId);
  supabaseDelete("sales", "project_id=eq." + projectId);

  var salesSheet = ss.getSheetByName(CONFIG.SHEET_SALES);
  var salesData = salesSheet.getLastRow() > 1 ? salesSheet.getRange(2, 1, salesSheet.getLastRow()-1, 5).getValues() : [];
  var salesCount = 0;
  salesData.forEach(function(row) {
    if (!row[0]) return;
    var ok = supabaseInsert("sales", {
      project_id: projectId,
      date: row[0] instanceof Date ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd") : row[0].toString(),
      cash_sales: Number(row[1]) || 0,
      network_sales: Number(row[2]) || 0,
      description: row[4] || "تقرير POS"
    });
    if (ok) salesCount++;
  });

  var ledgerSheet = ss.getSheetByName(CONFIG.SHEET_LEDGER);
  var ledgerData = ledgerSheet.getLastRow() > 2 ? ledgerSheet.getRange(3, 1, ledgerSheet.getLastRow()-2, 16).getValues() : [];
  var ledgerCount = 0;
  ledgerData.forEach(function(row) {
    if (!row[0] || !row[1]) return;
    var dateStr = row[0] instanceof Date ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd") : row[0].toString();
    var total = (Number(row[3])||0)+(Number(row[4])||0)+(Number(row[5])||0)+(Number(row[6])||0)+(Number(row[7])||0)+(Number(row[8])||0);
    var ok = supabaseInsert("ledger_entries", {
      project_id: projectId,
      date: dateStr,
      type: row[1] || "",
      description: row[2] || "",
      cash_out: Number(row[3]) || 0,
      cash_in: Number(row[4]) || 0,
      bank_out: Number(row[5]) || 0,
      bank_in: Number(row[6]) || 0,
      custody_out: Number(row[7]) || 0,
      custody_in: Number(row[8]) || 0,
      vat_amount: Number(row[14]) || 0,
      total_amount: total,
      status: "approved",
      journal_no: row[15] ? row[15].toString().replace("قيد-","").trim() : null
    });
    if (ok) ledgerCount++;
  });

  ui.alert("✅ تمت المزامنة الكاملة\n\nمبيعات: " + salesCount + " سجل\nدفتر: " + ledgerCount + " سجل");
}


// ══════════════════════════════════════════
//  التسوية البنكية
// ══════════════════════════════════════════

function processBankStatement() {
  var ui     = SpreadsheetApp.getUi();
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var folder = DriveApp.getFolderById(CONFIG.INBOX_FOLDER_ID);
  var files  = folder.getFiles();
  var bankFile = null;

  // ابحث عن ملف كشف الحساب
  while (files.hasNext()) {
    var f = files.next();
    var n = f.getName().toLowerCase();
    var mime = f.getMimeType();
    // قبل PDF أو صورة تحتوي على كلمات مرتبطة بكشف الحساب
    var isBank = n.includes("كشف") || n.includes("bank") || n.includes("statement") ||
                 n.includes("حساب") || n.includes("rajhi") || n.includes("راجحي") ||
                 mime === "application/pdf";
    if (isBank) {
      bankFile = f;
      break;
    }
  }

  if (!bankFile) {
    ui.alert("❌ ما وجدت كشف حساب في inbox\n\nتأكد إن اسم الملف يحتوي على:\nكشف / bank / statement / حساب");
    return;
  }

  ui.alert("⏳ جاري تحليل كشف الحساب...\n" + bankFile.getName());

  // استخراج العمليات من كشف الحساب
  var bankTransactions = extractBankTransactions(bankFile);
  if (!bankTransactions || bankTransactions.length === 0) {
    ui.alert("❌ ما قدرت أستخرج عمليات من الكشف");
    return;
  }

  // جلب عمليات البنك من الدفتر
  var ledgerTransactions = getLedgerBankTransactions(ss);

  // إجراء التسوية
  var result = reconcile(bankTransactions, ledgerTransactions);

  // كتابة تقرير التسوية
  writeReconciliationReport(ss, result, bankFile.getName());

  // أرشفة الكشف
  var monthFolder = getMonthFolder(new Date().toISOString().slice(0,10));
  bankFile.moveTo(monthFolder);

  ui.alert("✅ اكتملت التسوية البنكية\n\n" +
    "✅ متطابق: " + result.matched.length + " عملية\n" +
    "⚠️ في الكشف بس: " + result.inBankOnly.length + " عملية\n" +
    "⚠️ في الدفتر بس: " + result.inLedgerOnly.length + " عملية\n" +
    "💰 فرق الرصيد: " + result.balanceDiff.toFixed(2) + " ريال");
}

function extractBankTransactions(file) {
  var mime = file.getMimeType();
  var b64  = Utilities.base64Encode(file.getBlob().getBytes());

  var messages;
  if (mime === "application/pdf") {
    messages = [{role:"user",content:[
      {type:"document",source:{type:"base64",media_type:"application/pdf",data:b64}},
      {type:"text",text:buildBankPrompt()}
    ]}];
  } else {
    messages = [{role:"user",content:[
      {type:"image",source:{type:"base64",media_type:mime,data:b64}},
      {type:"text",text:buildBankPrompt()}
    ]}];
  }

  var text = callClaude({
    model: CONFIG.CLAUDE_MODEL,
    max_tokens: 4000,
    messages: messages
  });

  Logger.log("Claude response (first 500): " + text.substring(0, 500));

  try {
    var clean = text.replace(/```json/gi,"").replace(/```/g,"").trim();
    var s = clean.indexOf("["), e = clean.lastIndexOf("]");
    if (s === -1) {
      Logger.log("❌ لا يوجد JSON array في الرد");
      Logger.log("الرد الكامل: " + text);
      return [];
    }
    var arr = JSON.parse(clean.substring(s, e+1));
    Logger.log("✅ استخرجت " + arr.length + " عملية");
    return arr;
  } catch(err) {
    Logger.log("❌ خطأ في تحليل الكشف: " + err.message);
    Logger.log("الرد: " + text);
    return [];
  }
}

function buildBankPrompt() {
  var prompt = "هذا كشف حساب من مصرف الراجحي.\n\n";
  prompt += "استخرج كل العمليات بدقة. كل عملية لها: تاريخ، تفاصيل العملية، مدين (خروج)، دائن (دخول)، رصيد.\n\n";
  prompt += "قواعد مهمة:\n";
  prompt += "- التاريخ بصيغة YYYY-MM-DD\n";
  prompt += "- debit = عمود المدين (ما خرج من الحساب)\n";
  prompt += "- credit = عمود الدائن (ما دخل للحساب)\n";
  prompt += "- لو العملية مدين فقط اجعل credit = 0\n";
  prompt += "- لو العملية دائن فقط اجعل debit = 0\n";
  prompt += "- استخرج كل العمليات بدون استثناء\n\n";
  prompt += "أنواع العمليات في الراجحي:\n";
  prompt += "- نقاط بيع دائنة التاجر = مبيعات شبكة (credit)\n";
  prompt += "- نقاط بيع مدين Commission = عمولة الراجحي (debit)\n";
  prompt += "- عمليات التجار MC/VC = عمولات إضافية (credit)\n";
  prompt += "- تحويل = تحويل صادر أو وارد\n";
  prompt += "- خصم أقساط = سداد قرض (debit)\n";
  prompt += "- سداد قسط = سداد قرض (debit)\n";
  prompt += "- فواتير نظام سداد = دفع فاتورة (debit)\n";
  prompt += "- إيداع الصراف الآلي = إيداع كاش (credit)\n";
  prompt += "- سحب الصراف الآلي = سحب كاش (debit)\n\n";
  prompt += "أرجع JSON array فقط بدون أي نص إضافي:\n";
  prompt += '[{"date":"2026-05-01","description":"نقاط بيع دائنة التاجر","debit":0,"credit":1332.50,"balance":2083.73}]\n\n';
  prompt += "JSON array فقط — لا تضع أي كلام قبله أو بعده.";
  return prompt;
}

function getLedgerBankTransactions(ss) {
  var sheet = ss.getSheetByName(CONFIG.SHEET_LEDGER);
  var last  = sheet.getLastRow();
  if (last < 3) return [];

  var data = sheet.getRange(3, 1, last-2, 10).getValues();
  var transactions = [];

  data.forEach(function(row) {
    if (!row[0]) return;
    var dateStr = row[0] instanceof Date ?
      Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd") :
      row[0].toString();
    var bankOut = Number(row[5]) || 0;
    var bankIn  = Number(row[6]) || 0;
    if (bankOut > 0 || bankIn > 0) {
      transactions.push({
        date:        dateStr,
        description: row[2] || "",
        debit:       bankOut,
        credit:      bankIn,
        type:        row[1] || ""
      });
    }
  });

  return transactions;
}

function reconcile(bankTxns, ledgerTxns) {
  var matched     = [];
  var inBankOnly  = [];
  var inLedgerOnly = [];
  var usedLedger  = {};

  // تطابق كل عملية في الكشف مع الدفتر
  bankTxns.forEach(function(bt) {
    var found = false;
    for (var i = 0; i < ledgerTxns.length; i++) {
      if (usedLedger[i]) continue;
      var lt = ledgerTxns[i];
      var amtMatch  = Math.abs((bt.debit||0) - lt.debit) < 1 && Math.abs((bt.credit||0) - lt.credit) < 1;
      var dateMatch = Math.abs(new Date(bt.date) - new Date(lt.date)) <= 3 * 24 * 60 * 60 * 1000; // 3 أيام فرق مسموح
      if (amtMatch && dateMatch) {
        matched.push({bank: bt, ledger: lt});
        usedLedger[i] = true;
        found = true;
        break;
      }
    }
    if (!found) inBankOnly.push(bt);
  });

  // ما تطابق من الدفتر
  ledgerTxns.forEach(function(lt, i) {
    if (!usedLedger[i]) inLedgerOnly.push(lt);
  });

  // فرق الرصيد
  var bankBalance   = bankTxns.length > 0 ? (bankTxns[bankTxns.length-1].balance || 0) : 0;
  var ledgerBalance = ledgerTxns.reduce(function(s,t){ return s + (t.credit||0) - (t.debit||0); }, 0);

  return {
    matched:      matched,
    inBankOnly:   inBankOnly,
    inLedgerOnly: inLedgerOnly,
    bankBalance:  bankBalance,
    ledgerBalance: ledgerBalance,
    balanceDiff:  bankBalance - ledgerBalance
  };
}

function writeReconciliationReport(ss, result, fileName) {
  var sheetName = "تسوية " + new Date().toISOString().slice(0,7);
  var existing  = ss.getSheetByName(sheetName);
  if (existing) ss.deleteSheet(existing);
  var sheet = ss.insertSheet(sheetName);
  sheet.setRightToLeft(true);

  // العنوان
  sheet.getRange(1,1,1,6).merge()
    .setValue("تقرير التسوية البنكية — " + sheetName)
    .setBackground("#1B4F72").setFontColor("#FFF").setFontWeight("bold").setFontSize(13)
    .setHorizontalAlignment("center");

  sheet.getRange(2,1).setValue("الكشف: " + fileName);
  sheet.getRange(2,4).setValue("رصيد البنك الفعلي:");
  sheet.getRange(2,5).setValue(result.bankBalance).setNumberFormat("#,##0.00");
  sheet.getRange(3,4).setValue("رصيد الدفتر:");
  sheet.getRange(3,5).setValue(result.ledgerBalance).setNumberFormat("#,##0.00");
  sheet.getRange(4,4).setValue("الفرق:");
  sheet.getRange(4,5).setValue(result.balanceDiff).setNumberFormat("#,##0.00")
    .setFontColor(Math.abs(result.balanceDiff) < 1 ? "#27AE60" : "#E74C3C")
    .setFontWeight("bold");

  var row = 6;

  // العمليات في الكشف فقط
  if (result.inBankOnly.length > 0) {
    sheet.getRange(row,1,1,6).merge().setValue("⚠️ في كشف البنك — غير موجودة في الدفتر (" + result.inBankOnly.length + ")")
      .setBackground("#F39C12").setFontColor("#FFF").setFontWeight("bold");
    row++;
    sheet.getRange(row,1,1,6).setValues([["التاريخ","الوصف","خرج","دخل","الرصيد",""]])
      .setBackground("#FAD7A0").setFontWeight("bold");
    row++;
    result.inBankOnly.forEach(function(t) {
      sheet.getRange(row,1).setValue(t.date);
      sheet.getRange(row,2).setValue(t.description);
      sheet.getRange(row,3).setValue(t.debit||0).setNumberFormat("#,##0.00");
      sheet.getRange(row,4).setValue(t.credit||0).setNumberFormat("#,##0.00");
      sheet.getRange(row,5).setValue(t.balance||0).setNumberFormat("#,##0.00");
      sheet.getRange(row,1,1,5).setBackground("#FEF9E7");
      row++;
    });
    row++;
  }

  // العمليات في الدفتر فقط
  if (result.inLedgerOnly.length > 0) {
    sheet.getRange(row,1,1,6).merge().setValue("⚠️ في الدفتر — غير موجودة في كشف البنك (" + result.inLedgerOnly.length + ")")
      .setBackground("#E74C3C").setFontColor("#FFF").setFontWeight("bold");
    row++;
    sheet.getRange(row,1,1,5).setValues([["التاريخ","النوع","الوصف","خرج","دخل"]])
      .setBackground("#FADBD8").setFontWeight("bold");
    row++;
    result.inLedgerOnly.forEach(function(t) {
      sheet.getRange(row,1).setValue(t.date);
      sheet.getRange(row,2).setValue(t.type);
      sheet.getRange(row,3).setValue(t.description);
      sheet.getRange(row,4).setValue(t.debit||0).setNumberFormat("#,##0.00");
      sheet.getRange(row,5).setValue(t.credit||0).setNumberFormat("#,##0.00");
      sheet.getRange(row,1,1,5).setBackground("#FDEDEC");
      row++;
    });
    row++;
  }

  // المتطابق
  if (result.matched.length > 0) {
    sheet.getRange(row,1,1,6).merge().setValue("✅ عمليات متطابقة (" + result.matched.length + ")")
      .setBackground("#27AE60").setFontColor("#FFF").setFontWeight("bold");
    row++;
    sheet.getRange(row,1,1,5).setValues([["التاريخ","النوع","الوصف","خرج","دخل"]])
      .setBackground("#D5F5E3").setFontWeight("bold");
    row++;
    result.matched.forEach(function(m) {
      sheet.getRange(row,1).setValue(m.bank.date);
      sheet.getRange(row,2).setValue(m.ledger.type);
      sheet.getRange(row,3).setValue(m.ledger.description);
      sheet.getRange(row,4).setValue(m.bank.debit||0).setNumberFormat("#,##0.00");
      sheet.getRange(row,5).setValue(m.bank.credit||0).setNumberFormat("#,##0.00");
      sheet.getRange(row,1,1,5).setBackground("#EAFAF1");
      row++;
    });
  }

  [150,280,200,100,100,80].forEach(function(w,i){ sheet.setColumnWidth(i+1,w); });
  sheet.setFrozenRows(1);

  // انقل للشيت الجديد
  ss.setActiveSheet(sheet);
}


// ══════════════════════════════════════════
//  التقارير المحاسبية المتقدمة
// ══════════════════════════════════════════

function buildAccountingReports() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var ui  = SpreadsheetApp.getUi();

  try { buildIncomeStatement(ss);   } catch(e){ ui.alert("❌ قائمة الدخل: "+e.message); return; }
  Utilities.sleep(1000);
  try { buildBalanceSheet(ss);      } catch(e){ ui.alert("❌ الميزانية: "+e.message); return; }
  Utilities.sleep(1000);
  try { buildTrialBalance(ss);      } catch(e){ ui.alert("❌ ميزان المراجعة: "+e.message); return; }

  ui.alert("✅ اكتملت التقارير المحاسبية\n\n• قائمة الدخل\n• الميزانية العمومية\n• ميزان المراجعة");
}

// ── قائمة الدخل ──
function buildIncomeStatement(ss) {
  var sheetName = "قائمة الدخل";
  var old = ss.getSheetByName(sheetName);
  if (old) ss.deleteSheet(old);
  var s = ss.insertSheet(sheetName);
  s.setRightToLeft(true);

  var ledger = ss.getSheetByName(CONFIG.SHEET_LEDGER);
  var sales  = ss.getSheetByName(CONFIG.SHEET_SALES);
  var last   = ledger.getLastRow();
  var rows   = last > 2 ? ledger.getRange(3,1,last-2,15).getValues() : [];
  var sLast  = sales.getLastRow();
  var sRows  = sLast > 1 ? sales.getRange(2,1,sLast-1,4).getValues() : [];

  // حساب الأرقام
  var totalSales = sRows.reduce(function(sum,r){ return sum+(Number(r[3])||0); }, 0);
  var cashSales  = sRows.reduce(function(sum,r){ return sum+(Number(r[1])||0); }, 0);
  var netSales   = sRows.reduce(function(sum,r){ return sum+(Number(r[2])||0); }, 0);

  function sumType(types) {
    return rows.reduce(function(sum,r){
      if (!r[1]) return sum;
      var match = types.some(function(t){ return r[1].toString().indexOf(t) !== -1; });
      if (!match) return sum;
      return sum + (Number(r[3])||0) + (Number(r[5])||0) + (Number(r[7])||0);
    }, 0);
  }

  var cogsSales    = sumType(["مصروفات تشغيلية"]);
  var fixedExp     = sumType(["مصروفات ثابتة"]);
  var loanPayments = sumType(["قسط سيارة","قسط شراء أرض","قرض ١","قرض ٢"]);
  var withdrawals  = sumType(["مسحوبات سليمان","مسحوبات أم طوبى"]);
  var grossProfit  = totalSales - cogsSales;
  var opProfit     = grossProfit - fixedExp;
  var netProfit    = opProfit - loanPayments;
  var netCashflow  = netProfit - withdrawals;
  var grossMargin  = totalSales > 0 ? (grossProfit/totalSales*100) : 0;
  var netMargin    = totalSales > 0 ? (netProfit/totalSales*100) : 0;

  // التنسيق
  var title = "قائمة الدخل — " + new Date().toISOString().slice(0,7);
  s.getRange(1,1,1,4).merge().setValue(title)
    .setBackground("#1B4F72").setFontColor("#FFF").setFontWeight("bold")
    .setFontSize(14).setHorizontalAlignment("center");
  s.setRowHeight(1, 30);

  var data = [
    ["","","",""],
    ["الإيرادات","","",""],
    ["مبيعات كاش",cashSales,"",""],
    ["مبيعات شبكة/آبل باي",netSales,"",""],
    ["إجمالي الإيرادات",totalSales,"100.0%",""],
    ["","","",""],
    ["تكلفة المبيعات","","",""],
    ["(-) مصروفات تشغيلية",-cogsSales,totalSales>0?(-cogsSales/totalSales*100):0,""],
    ["مجمل الربح",grossProfit,totalSales>0?(grossProfit/totalSales*100):0,""],
    ["","","",""],
    ["المصروفات التشغيلية","","",""],
    ["(-) مصروفات ثابتة",-fixedExp,totalSales>0?(-fixedExp/totalSales*100):0,""],
    ["الربح التشغيلي",opProfit,totalSales>0?(opProfit/totalSales*100):0,""],
    ["","","",""],
    ["التمويل","","",""],
    ["(-) أقساط القروض",-loanPayments,totalSales>0?(-loanPayments/totalSales*100):0,""],
    ["صافي الربح",netProfit,totalSales>0?(netProfit/totalSales*100):0,""],
    ["","","",""],
    ["توزيع الأرباح","","",""],
    ["(-) مسحوبات الشركاء",-withdrawals,totalSales>0?(-withdrawals/totalSales*100):0,""],
    ["صافي التدفق النقدي",netCashflow,totalSales>0?(netCashflow/totalSales*100):0,""],
    ["","","",""],
    ["المؤشرات المالية","","",""],
    ["هامش الربح الإجمالي","","",grossMargin/100],
    ["هامش صافي الربح","","",netMargin/100],
    ["نسبة تغطية الديون","","",loanPayments>0?(netProfit+loanPayments)/loanPayments:0],
  ];

  s.getRange(2,1,data.length,4).setValues(data);

  // تنسيق العناوين الرئيسية
  [[3,"#EBF5FB"],[8,"#EAF4FB"],[10,"#EBF5FB"],[13,"#D5F5E3"],[15,"#EBF5FB"],[17,"#D5F5E3"],[19,"#EBF5FB"],[21,"#A9DFBF"],[23,"#EBF5FB"]].forEach(function(x){
    try{ s.getRange(x[0],1,1,4).setBackground(x[1]); }catch(e){}
  });

  // عناوين الأقسام
  [[3,"الإيرادات"],[8,"تكلفة المبيعات"],[11,"المصروفات التشغيلية"],[15,"التمويل"],[19,"توزيع الأرباح"],[23,"المؤشرات المالية"]].forEach(function(x){
    try{
      s.getRange(x[0],1,1,4).setBackground("#2C3E50").setFontColor("#FFF").setFontWeight("bold");
    }catch(e){}
  });

  // إجماليات مميزة
  [[6,"#1ABC9C"],[9,"#27AE60"],[13,"#2980B9"],[17,"#8E44AD"],[21,"#E74C3C"]].forEach(function(x){
    try{
      s.getRange(x[0],1).setFontWeight("bold");
      s.getRange(x[0],2).setFontWeight("bold").setFontColor(x[1]).setFontSize(11);
    }catch(e){}
  });

  // تنسيق الأرقام
  s.getRange(2,2,data.length,1).setNumberFormat("#,##0.00");
  s.getRange(2,3,data.length,1).setNumberFormat("0.0%");
  s.getRange(2,4,data.length,1).setNumberFormat("0.0%");

  [220,130,100,130].forEach(function(w,i){ s.setColumnWidth(i+1,w); });
  s.setFrozenRows(2);
  Logger.log("✅ قائمة الدخل");
}

// ── الميزانية العمومية ──
function buildBalanceSheet(ss) {
  var sheetName = "الميزانية العمومية";
  var old = ss.getSheetByName(sheetName);
  if (old) ss.deleteSheet(old);
  var s = ss.insertSheet(sheetName);
  s.setRightToLeft(true);

  var ledger = ss.getSheetByName(CONFIG.SHEET_LEDGER);
  var loans  = ss.getSheetByName(CONFIG.SHEET_LOANS);
  var last   = ledger.getLastRow();
  var lRow   = last > 1 ? ledger.getRange(last,10,1,3).getValues()[0] : [0,0,0];

  // الأرصدة الحالية
  var cashBal    = Number(lRow[0]) || 0;
  var bankBal    = Number(lRow[1]) || 0;
  var custodyBal = Number(lRow[2]) || 0;
  var totalAssets = Math.max(0, cashBal) + Math.max(0, bankBal) + Math.max(0, custodyBal);

  // القروض
  var loanData = loans.getLastRow() > 1 ? loans.getRange(2,1,4,5).getValues() : [];
  var totalLoans = loanData.reduce(function(sum,r){ return sum+(Number(r[4])||0); }, 0);

  // حقوق الملكية
  var equity = totalAssets - totalLoans;

  var title = "الميزانية العمومية — " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  s.getRange(1,1,1,3).merge().setValue(title)
    .setBackground("#1B4F72").setFontColor("#FFF").setFontWeight("bold")
    .setFontSize(14).setHorizontalAlignment("center");

  var rows = [
    ["الأصول","",""],
    ["الأصول المتداولة","",""],
    ["نقد في الصندوق",cashBal,""],
    ["رصيد البنك",bankBal,""],
    ["رصيد العهدة",custodyBal,""],
    ["إجمالي الأصول المتداولة",totalAssets,""],
    ["","",""],
    ["إجمالي الأصول",totalAssets,""],
    ["","",""],
    ["الالتزامات","",""],
    ["الالتزامات طويلة الأجل","",""],
  ];

  loanData.forEach(function(r){
    if (Number(r[1]) > 0) rows.push([r[0]||"قرض", Number(r[4])||0, ""]);
  });

  rows = rows.concat([
    ["إجمالي الالتزامات",totalLoans,""],
    ["","",""],
    ["حقوق الملكية","",""],
    ["صافي حقوق الملكية",equity,""],
    ["","",""],
    ["إجمالي الالتزامات + حقوق الملكية",totalLoans+equity,""],
    ["","",""],
    [totalAssets === (totalLoans+equity) ? "✅ الميزانية متوازنة" : "❌ الميزانية غير متوازنة","",""],
  ]);

  s.getRange(2,1,rows.length,3).setValues(rows);

  // تنسيق
  [[2,"#2C3E50"],[3,"#D6EAF8"],[7,"#1ABC9C"],[10,"#2C3E50"],[11,"#FADBD8"]].forEach(function(x,i){
    try{ s.getRange(x[0]+1,1,1,3).setBackground(x[1]).setFontColor(x[1]==="#2C3E50"?"#FFF":"#000").setFontWeight("bold"); }catch(e){}
  });

  var checkRow = rows.length + 1;
  var isBalanced = Math.abs(totalAssets - (totalLoans+equity)) < 1;
  s.getRange(checkRow,1).setFontWeight("bold").setFontSize(12)
    .setFontColor(isBalanced ? "#27AE60" : "#E74C3C");

  s.getRange(2,2,rows.length,1).setNumberFormat("#,##0.00");
  [220,140,100].forEach(function(w,i){ s.setColumnWidth(i+1,w); });
  Logger.log("✅ الميزانية العمومية");
}

// ── ميزان المراجعة ──
function buildTrialBalance(ss) {
  var sheetName = "ميزان المراجعة";
  var old = ss.getSheetByName(sheetName);
  if (old) ss.deleteSheet(old);
  var s = ss.insertSheet(sheetName);
  s.setRightToLeft(true);

  var ledger = ss.getSheetByName(CONFIG.SHEET_LEDGER);
  var last   = ledger.getLastRow();
  var rows   = last > 2 ? ledger.getRange(3,1,last-2,10).getValues() : [];

  // تجميع الحسابات
  var accounts = {};

  function addAccount(name, debit, credit) {
    if (!name) return;
    if (!accounts[name]) accounts[name] = {debit:0, credit:0};
    accounts[name].debit  += Number(debit)  || 0;
    accounts[name].credit += Number(credit) || 0;
  }

  rows.forEach(function(r) {
    var type = r[1] ? r[1].toString() : "";
    if (!type) return;

    // صندوق
    if (Number(r[3]) > 0) addAccount("الصندوق", 0, r[3]); // خرج = دائن
    if (Number(r[4]) > 0) addAccount("الصندوق", r[4], 0); // دخل = مدين

    // بنك
    if (Number(r[5]) > 0) addAccount("البنك", 0, r[5]);
    if (Number(r[6]) > 0) addAccount("البنك", r[6], 0);

    // عهدة
    if (Number(r[7]) > 0) addAccount("العهدة", 0, r[7]);
    if (Number(r[8]) > 0) addAccount("العهدة", r[8], 0);

    // حسابات حسب النوع
    if (type.indexOf("مبيعات كاش") !== -1)       addAccount("إيرادات المبيعات الكاش",   0,    r[4]);
    if (type.indexOf("مبيعات شبكة") !== -1)      addAccount("إيرادات المبيعات الشبكة",  0,    r[6]);
    if (type.indexOf("مصروفات تشغيلية") !== -1)  addAccount("مصروفات تشغيلية", (Number(r[3])||0)+(Number(r[5])||0)+(Number(r[7])||0), 0);
    if (type.indexOf("مصروفات ثابتة") !== -1)    addAccount("مصروفات ثابتة",   (Number(r[3])||0)+(Number(r[5])||0)+(Number(r[7])||0), 0);
    if (type.indexOf("قسط") !== -1 || type.indexOf("قرض") !== -1) addAccount("سداد القروض", (Number(r[5])||0), 0);
    if (type.indexOf("مسحوبات") !== -1)           addAccount("مسحوبات الشركاء",(Number(r[3])||0)+(Number(r[5])||0)+(Number(r[7])||0), 0);
    if (type.indexOf("ضريبة") !== -1)             addAccount("ضريبة القيمة المضافة",(Number(r[3])||0)+(Number(r[5])||0), 0);
  });

  // كتابة التقرير
  var title = "ميزان المراجعة — " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  s.getRange(1,1,1,4).merge().setValue(title)
    .setBackground("#1B4F72").setFontColor("#FFF").setFontWeight("bold")
    .setFontSize(14).setHorizontalAlignment("center");

  s.getRange(2,1,1,4).setValues([["اسم الحساب","مدين","دائن","الرصيد"]])
    .setBackground("#2C3E50").setFontColor("#FFF").setFontWeight("bold");

  var row = 3;
  var totalDebit = 0, totalCredit = 0;

  Object.keys(accounts).forEach(function(name) {
    var a = accounts[name];
    var balance = a.debit - a.credit;
    s.getRange(row,1).setValue(name);
    s.getRange(row,2).setValue(a.debit).setNumberFormat("#,##0.00");
    s.getRange(row,3).setValue(a.credit).setNumberFormat("#,##0.00");
    s.getRange(row,4).setValue(balance).setNumberFormat("#,##0.00")
      .setFontColor(balance >= 0 ? "#2980B9" : "#E74C3C");
    s.getRange(row,1,1,4).setBackground(row%2===0?"#EBF5FB":"#FFF");
    totalDebit  += a.debit;
    totalCredit += a.credit;
    row++;
  });

  // الإجماليات
  s.getRange(row,1,1,4).setValues([["الإجمالي",totalDebit,totalCredit,totalDebit-totalCredit]])
    .setBackground("#2C3E50").setFontColor("#FFF").setFontWeight("bold");
  s.getRange(row,2,1,3).setNumberFormat("#,##0.00");

  row++;
  var isBalanced = Math.abs(totalDebit - totalCredit) < 1;
  s.getRange(row,1,1,4).merge()
    .setValue(isBalanced ? "✅ ميزان المراجعة متوازن — لا توجد أخطاء إدخال" : "❌ ميزان المراجعة غير متوازن — فرق: " + (totalDebit-totalCredit).toFixed(2) + " ريال")
    .setBackground(isBalanced ? "#D5F5E3" : "#FADBD8")
    .setFontColor(isBalanced ? "#27AE60" : "#E74C3C")
    .setFontWeight("bold").setFontSize(12).setHorizontalAlignment("center");

  [200,120,120,120].forEach(function(w,i){ s.setColumnWidth(i+1,w); });
  s.setFrozenRows(2);
  Logger.log("✅ ميزان المراجعة — " + (isBalanced ? "متوازن" : "غير متوازن"));
}


// ══════════════════════════════════════════
//  نظام القيود المحاسبية اليومية
// ══════════════════════════════════════════

// ── الحسابات وطرف القيد ──

// ══════════════════════════════════════════
//  قاموس التصنيف التلقائي
// ══════════════════════════════════════════
var AUTO_CLASSIFY = [
  // مصروفات ثابتة
  { keywords: ["راتب","رواتب","أجور","salary","salaries"], type: "💰 مصروفات ثابتة", desc: "رواتب" },
  { keywords: ["إيجار","ايجار","rent","أجرة","اجرة"], type: "💰 مصروفات ثابتة", desc: "إيجار" },
  { keywords: ["كهرباء","كهربا","electricity","sec","شركة الكهرباء"], type: "💰 مصروفات ثابتة", desc: "فاتورة كهرباء" },
  { keywords: ["إنترنت","انترنت","internet","زين","stc","موبايلي","نت"], type: "💰 مصروفات ثابتة", desc: "فاتورة إنترنت" },
  { keywords: ["تأمين","insurance"], type: "💰 مصروفات ثابتة", desc: "تأمين" },
  { keywords: ["بلدية","رخصة","وزارة","حكومي","رسوم حكومية","مصروفات حكومية"], type: "💰 مصروفات ثابتة", desc: "مصروفات حكومية" },

  // مصروفات تشغيلية
  { keywords: ["مستلزمات","مواد","خامات","بضاعة","مشتريات","تنظيف","غاز","ماء","مياه","ورق","عبوات","تغليف"], type: "🛒 مصروفات تشغيلية", desc: "مستلزمات تشغيلية" },
  { keywords: ["غسيل","صيانة","إصلاح","تصليح","نظافة"], type: "🛒 مصروفات تشغيلية", desc: "صيانة وتنظيف" },

  // أقساط
  { keywords: ["قسط","سيارة","قرض سيارة"], type: "💳 قسط سيارة", desc: "قسط سيارة" },
  { keywords: ["قسط أرض","قرض أرض","عقار"], type: "💳 قسط شراء أرض", desc: "قسط شراء أرض" },
];

function autoClassify(text) {
  if (!text) return null;
  var lower = text.toLowerCase();
  for (var i = 0; i < AUTO_CLASSIFY.length; i++) {
    var rule = AUTO_CLASSIFY[i];
    for (var j = 0; j < rule.keywords.length; j++) {
      if (lower.includes(rule.keywords[j].toLowerCase())) {
        return { type: rule.type, desc: rule.desc };
      }
    }
  }
  return null;
}

// ── تنسيق رقم القيد بصيغة موحدة 0001 ──
function formatVoucherNo(no) {
  return String(no).replace(/^0+/, "") !== "" ? 
    String(parseInt(String(no).replace(/^0+/, "") || "0")).padStart(4, "0") : "0001";
}

var ACCOUNT_MAP = {
  "💵 مبيعات كاش":           { debit: "الصندوق",              credit: "إيرادات المبيعات" },
  "🏦 مبيعات شبكة":          { debit: "البنك",                credit: "إيرادات المبيعات" },
  "🛒 مصروفات تشغيلية":      { debit: "مصروفات تشغيلية",      credit: null }, // credit من مصدر الدفع
  "💰 مصروفات ثابتة":        { debit: "مصروفات ثابتة",        credit: null },
  "💳 قسط سيارة":            { debit: "قسط سيارة",            credit: null },
  "💳 قسط شراء أرض":         { debit: "قسط شراء أرض",         credit: null },
  "💳 قرض ١":                { debit: "قرض ١",                credit: null },
  "💳 قرض ٢":                { debit: "قرض ٢",                credit: null },
  "👤 صرف عهدة":             { debit: "العهدة",               credit: "الصندوق" },
  "💼 مسحوبات سليمان":       { debit: "مسحوبات سليمان",       credit: null },
  "💼 مسحوبات أم طوبى":      { debit: "مسحوبات أم طوبى",      credit: null },
  "🏛️ ضريبة القيمة المضافة": { debit: "ضريبة القيمة المضافة", credit: null },
  "🔄 تحويل داخلي":          { debit: null,                   credit: null },
};

var PAYMENT_SOURCE_ACCOUNT = {
  "cash":    "الصندوق",
  "bank":    "البنك",
  "custody": "العهدة",
};

// ── توليد رقم قيد تسلسلي ──
function getNextJournalNumber() {
  var props = PropertiesService.getScriptProperties();
  var last  = Number(props.getProperty("last_journal_no") || "0");
  var next  = last + 1;
  props.setProperty("last_journal_no", next.toString());
  return String(next).padStart(4, "0");
}

// ── بناء القيد اليومي ──
function buildDailyJournal(date, entries) {
  // جمع العمليات حسب الحساب
  var lines = []; // {account, debit, credit, description}

  entries.forEach(function(e) {
    var type = e.type || "";
    var map  = ACCOUNT_MAP[type];
    if (!map) return; // تجاهل الأنواع غير المعرّفة

    // حساب المبلغ الصحيح حسب مصدر الدفع فقط (مو الجمع الكلي)
    var cashAmt    = (Number(e.cashOut)||0)  + (Number(e.cashIn)||0);
    var bankAmt    = (Number(e.bankOut)||0)  + (Number(e.bankIn)||0);
    var custodyAmt = (Number(e.custodyOut)||0) + (Number(e.custodyIn)||0);

    // تجاهل عمليات صرف العهدة من الصندوق (تسوية داخلية)
    // هذه العملية تُسجل تلقائياً في نوع "🔄 تحويل داخلي"
    if (type === "👤 صرف عهدة") return;

    // كل مصدر دفع = سطر قيد منفصل
    if (cashAmt > 0) {
      var creditAcc = map.credit || "الصندوق";
      var debitAcc  = map.debit  || type;
      if (debitAcc !== creditAcc) {
        lines.push({ debitAccount: debitAcc, creditAccount: creditAcc, amount: cashAmt, description: e.desc || type, type: type });
      }
    }
    if (bankAmt > 0) {
      var creditAcc = map.credit || "البنك";
      var debitAcc  = map.debit  || type;
      if (debitAcc !== creditAcc) {
        lines.push({ debitAccount: debitAcc, creditAccount: creditAcc, amount: bankAmt, description: e.desc || type, type: type });
      }
    }
    if (custodyAmt > 0) {
      var creditAcc = map.credit || "العهدة";
      var debitAcc  = map.debit  || type;
      if (debitAcc !== creditAcc) {
        lines.push({ debitAccount: debitAcc, creditAccount: creditAcc, amount: custodyAmt, description: e.desc || type, type: type });
      }
    }
  });

  return lines;
}

// ── كتابة القيد في شيت القيود ──
function writeJournalEntry(ss, date, lines, voucherNo) {
  var sheetName = "القيود";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    setupJournalSheet(sheet);
  }

  if (!lines || lines.length === 0) return;

  // حساب الإجماليات
  var totalDebit  = lines.reduce(function(s,l){ return s+l.amount; }, 0);
  var totalCredit = lines.reduce(function(s,l){ return s+l.amount; }, 0);
  var isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;

  var startRow = sheet.getLastRow() + 1;
  if (startRow < 3) startRow = 3;

  // رأس القيد
  sheet.getRange(startRow, 1, 1, 7).setValues([[
    "قيد رقم " + voucherNo,
    date,
    "قيد يومي - " + date,
    "", "", "", ""
  ]]);
  sheet.getRange(startRow, 1, 1, 7)
    .setBackground(isBalanced ? "#1B4F72" : "#922B21")
    .setFontColor("#FFF")
    .setFontWeight("bold");

  startRow++;

  // سطور القيد
  lines.forEach(function(line) {
    // سطر المدين
    sheet.getRange(startRow, 1, 1, 7).setValues([[
      voucherNo, date, line.description,
      line.debitAccount, line.amount, "", ""
    ]]);
    sheet.getRange(startRow, 5).setNumberFormat("#,##0.00");
    sheet.getRange(startRow, 1, 1, 7).setBackground("#EBF5FB");
    startRow++;

    // سطر الدائن
    sheet.getRange(startRow, 1, 1, 7).setValues([[
      voucherNo, date, "    من / " + line.description,
      line.creditAccount, "", line.amount, ""
    ]]);
    sheet.getRange(startRow, 6).setNumberFormat("#,##0.00");
    sheet.getRange(startRow, 1, 1, 7).setBackground("#FDFEFE");
    startRow++;
  });

  // سطر الإجماليات
  sheet.getRange(startRow, 1, 1, 7).setValues([[
    "", "", "الإجمالي",
    "", totalDebit, totalCredit,
    isBalanced ? "✅ متوازن" : "❌ غير متوازن — فرق: " + (totalDebit-totalCredit).toFixed(2)
  ]]);
  sheet.getRange(startRow, 5, 1, 2).setNumberFormat("#,##0.00");
  sheet.getRange(startRow, 1, 1, 7)
    .setBackground(isBalanced ? "#D5F5E3" : "#FADBD8")
    .setFontWeight("bold");

  // لو غير متوازن — لون أحمر + ملاحظة
  if (!isBalanced) {
    var diff = totalDebit - totalCredit;
    sheet.getRange(startRow, 7).setFontColor("#E74C3C").setFontWeight("bold");
    Logger.log("⚠️ قيد " + voucherNo + " غير متوازن — فرق: " + diff.toFixed(2));
    // أرسل تنبيه
    sendImbalanceAlert(voucherNo, date, diff);
  }

  // فاصل بين القيود
  startRow++;
  sheet.getRange(startRow, 1, 1, 7).setBackground("#ECF0F1");

  return { isBalanced: isBalanced, voucherNo: voucherNo };
}

// ── إعداد شيت القيود ──
function setupJournalSheet(sheet) {
  sheet.setRightToLeft(true);
  sheet.getRange(1, 1, 1, 7).setValues([["رقم القيد", "التاريخ", "البيان", "اسم الحساب", "مدين", "دائن", "ملاحظة"]])
    .setBackground("#1B4F72").setFontColor("#FFF").setFontWeight("bold").setHorizontalAlignment("center");
  [80,110,250,180,110,110,150].forEach(function(w,i){ sheet.setColumnWidth(i+1,w); });
  sheet.setFrozenRows(1);
}

// ── أرشفة الفواتير بمجلد القيد ──
function archiveInJournalFolder(file, voucherNo, date) {
  try {
    var parent     = DriveApp.getFolderById(CONFIG.ARCHIVE_PARENT_ID);
    var monthName  = date.substring(0,7); // 2026-05
    var monthFolders = parent.getFoldersByName(monthName);
    var monthFolder  = monthFolders.hasNext() ? monthFolders.next() : parent.createFolder(monthName);

    var journalName    = "قيد-" + formatVoucherNo(voucherNo);
    var journalFolders = monthFolder.getFoldersByName(journalName);
    var journalFolder  = journalFolders.hasNext() ? journalFolders.next() : monthFolder.createFolder(journalName);

    file.moveTo(journalFolder);
    return journalFolder.getUrl();
  } catch(e) {
    Logger.log("⚠️ خطأ في أرشفة القيد: " + e.message);
    return "";
  }
}

// ── تنبيه القيد غير المتوازن ──
function sendImbalanceAlert(voucherNo, date, diff) {
  try {
    var email = Session.getActiveUser().getEmail();
    if (!email) return;
    MailApp.sendEmail({
      to: email,
      subject: "⚠️ تحذير: قيد محاسبي غير متوازن — مزاهر",
      body: "تم اكتشاف قيد غير متوازن في نظام مزاهر:\n\n" +
            "رقم القيد: " + voucherNo + "\n" +
            "التاريخ: " + date + "\n" +
            "الفرق: " + Math.abs(diff).toFixed(2) + " ريال\n\n" +
            "الرجاء مراجعة شيت القيود وتصحيح الخطأ."
    });
    Logger.log("✅ تنبيه أُرسل لـ: " + email);
  } catch(e) {
    Logger.log("⚠️ فشل إرسال التنبيه: " + e.message);
  }
}

// ── تشغيل القيود اليومية يدوياً ──
function runDailyJournals() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var ui  = SpreadsheetApp.getUi();
  var ledger = ss.getSheetByName(CONFIG.SHEET_LEDGER);
  var last   = ledger.getLastRow();
  if (last < 3) { ui.alert("لا توجد بيانات في الدفتر"); return; }

  var rows = ledger.getRange(3, 1, last-2, 15).getValues();

  // جمع العمليات حسب التاريخ
  var byDate = {};
  rows.forEach(function(r) {
    if (!r[0] || !r[1]) return;
    var date = r[0] instanceof Date ?
      Utilities.formatDate(r[0], Session.getScriptTimeZone(), "yyyy-MM-dd") :
      r[0].toString().trim();
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({
      type:       r[1], desc: r[2],
      cashOut:    r[3],  cashIn:    r[4],
      bankOut:    r[5],  bankIn:    r[6],
      custodyOut: r[7],  custodyIn: r[8],
      vat:        r[14]
    });
  });

  var dates   = Object.keys(byDate).sort();
  var created = 0, unbalanced = 0;

  dates.forEach(function(date) {
    var entries = byDate[date];
    var lines   = buildDailyJournal(date, entries);
    if (!lines || lines.length === 0) return;

    var voucherNo = getNextJournalNumber();
    var result    = writeJournalEntry(ss, date, lines, voucherNo);

    if (result) {
      created++;
      if (!result.isBalanced) unbalanced++;

      // أرشفة فواتير هذا اليوم في مجلد القيد
      try {
        archiveDayInvoices(date, voucherNo);
        updateLedgerWithJournalNo(ss, date, voucherNo);
      } catch(e) {
        Logger.log("⚠️ أرشفة " + date + ": " + e.message);
      }
    }
  });

  var msg = "✅ تم إنشاء " + created + " قيد يومي";
  if (unbalanced > 0) msg += "\n⚠️ " + unbalanced + " قيد غير متوازن — راجع شيت القيود";
  ui.alert(msg);
}

// ── إعادة تعيين ترقيم القيود ──
function resetJournalNumbers() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert("⚠️","إعادة تعيين ترقيم القيود من الصفر؟",ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().setProperty("last_journal_no","0");
  ui.alert("✅ تم إعادة التعيين");
}


// ══════════════════════════════════════════
//  تسوية بنكية — صور متعددة
// ══════════════════════════════════════════

function processBankStatementImages() {
  var ui     = SpreadsheetApp.getUi();
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var folder = DriveApp.getFolderById(CONFIG.INBOX_FOLDER_ID);

  // ابحث عن مجلد "كشف" أو "bank"
  var bankFolder = null;
  var folders = folder.getFolders();
  while (folders.hasNext()) {
    var f = folders.next();
    var n = f.getName().toLowerCase();
    if (n.includes("كشف") || n.includes("bank") || n.includes("statement") || n.includes("راجحي")) {
      bankFolder = f;
      break;
    }
  }

  // لو ما في مجلد — ابحث عن صور مباشرة في inbox
  var imageFiles = [];
  if (bankFolder) {
    var files = bankFolder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      var mime = f.getMimeType();
      if (mime.startsWith("image/")) imageFiles.push(f);
    }
  } else {
    // ابحث عن صور في inbox مباشرة
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      var mime = f.getMimeType();
      var name = f.getName().toLowerCase();
      if (mime.startsWith("image/") && (name.includes("كشف")||name.includes("bank")||name.includes("statement")||name.includes("page")||name.includes("p0")||name.includes("p1"))) {
        imageFiles.push(f);
      }
    }
  }

  // رتب الصور حسب الاسم
  imageFiles.sort(function(a,b){ return a.getName().localeCompare(b.getName()); });

  if (imageFiles.length === 0) {
    ui.alert("❌ ما وجدت صور الكشف\n\nضع صور الكشف في:\n• مجلد داخل inbox اسمه يحتوي كشف أو bank\n• أو مباشرة في inbox باسم يحتوي page أو p01 أو bank");
    return;
  }

  ui.alert("⏳ جاري معالجة " + imageFiles.length + " صورة..\nقد يستغرق دقيقتين");

  // معالجة كل صورة منفردة
  var allTransactions = [];
  var errors = [];

  imageFiles.forEach(function(file, idx) {
    Logger.log("معالجة صورة " + (idx+1) + "/" + imageFiles.length + ": " + file.getName());
    try {
      var txns = extractFromImage(file, idx+1, imageFiles.length);
      if (txns && txns.length > 0) {
        allTransactions = allTransactions.concat(txns);
        Logger.log("✅ استخرجت " + txns.length + " عملية من الصورة " + (idx+1));
      } else {
        errors.push("صورة " + (idx+1) + ": لم تُستخرج عمليات");
      }
    } catch(e) {
      errors.push("صورة " + (idx+1) + ": " + e.message);
      Logger.log("❌ خطأ في صورة " + (idx+1) + ": " + e.message);
    }
    Utilities.sleep(1000); // تجنب rate limiting
  });

  if (allTransactions.length === 0) {
    ui.alert("❌ لم تُستخرج أي عمليات\n\nالأخطاء:\n" + errors.join("\n"));
    return;
  }

  // إزالة التكرار والترتيب
  allTransactions = deduplicateTransactions(allTransactions);
  allTransactions.sort(function(a,b){ return a.date.localeCompare(b.date); });

  Logger.log("إجمالي العمليات بعد التنظيف: " + allTransactions.length);

  // جلب عمليات الدفتر للمقارنة
  var ledgerTxns = getLedgerBankTransactions(ss);

  // التسوية
  var result = reconcile(allTransactions, ledgerTxns);

  // كتابة التقرير
  writeReconciliationReport(ss, result, "كشف الراجحي - " + imageFiles.length + " صفحة");

  // أرشفة الصور في مجلد التسوية
  var archiveName = "تسوية-" + new Date().toISOString().slice(0,7);
  try {
    var parent = DriveApp.getFolderById(CONFIG.ARCHIVE_PARENT_ID);
    var monthFolders = parent.getFoldersByName(new Date().toISOString().slice(0,7));
    var monthFolder  = monthFolders.hasNext() ? monthFolders.next() : parent.createFolder(new Date().toISOString().slice(0,7));
    var archiveFolders = monthFolder.getFoldersByName(archiveName);
    var archiveFolder  = archiveFolders.hasNext() ? archiveFolders.next() : monthFolder.createFolder(archiveName);
    imageFiles.forEach(function(f){ f.moveTo(archiveFolder); });
    if (bankFolder) bankFolder.setTrashed(true);
  } catch(e) { Logger.log("⚠️ أرشفة: " + e.message); }

  var msg = "✅ اكتملت التسوية البنكية\n\n";
  msg += "📄 عدد الصفحات: " + imageFiles.length + "\n";
  msg += "📊 إجمالي العمليات: " + allTransactions.length + "\n\n";
  msg += "✅ متطابق: " + result.matched.length + " عملية\n";
  msg += "⚠️ في البنك فقط: " + result.inBankOnly.length + " عملية\n";
  msg += "⚠️ في الدفتر فقط: " + result.inLedgerOnly.length + " عملية\n";
  msg += "💰 فرق الرصيد: " + result.balanceDiff.toFixed(2) + " ريال";
  if (errors.length > 0) msg += "\n\n⚠️ تحذيرات:\n" + errors.join("\n");
  ui.alert(msg);
}

function extractFromImage(file, pageNum, totalPages) {
  var mime = file.getMimeType();
  var blob = file.getBlob();
  
  // تحقق من نوع الملف
  if (!mime.startsWith("image/")) {
    Logger.log("⚠️ الملف ليس صورة: " + mime);
    return [];
  }
  
  // تحقق من حجم الملف (الحد 5MB)
  var sizeKB = blob.getBytes().length / 1024;
  Logger.log("حجم الصورة " + pageNum + ": " + sizeKB.toFixed(0) + " KB");
  
  var b64 = Utilities.base64Encode(blob.getBytes());

  var prompt = buildImageBankPrompt(pageNum, totalPages);

  var payload = {
    model: "claude-opus-4-5",
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
        { type: "text",  text: prompt }
      ]
    }]
  };

  var text = callClaude(payload);
  Logger.log("رد Claude للصورة " + pageNum + " (أول 300): " + text.substring(0,300));

  try {
    var clean = text.replace(/```json/gi,"").replace(/```/g,"").trim();
    var s = clean.indexOf("["), e = clean.lastIndexOf("]");
    if (s === -1) return [];
    return JSON.parse(clean.substring(s, e+1));
  } catch(err) {
    Logger.log("❌ خطأ JSON صورة " + pageNum + ": " + err.message);
    return [];
  }
}

function buildImageBankPrompt(pageNum, totalPages) {
  var prompt = "هذه الصورة رقم " + pageNum + " من " + totalPages + " من كشف حساب مصرف الراجحي.\n\n";
  prompt += "استخرج كل صفوف العمليات من الجدول.\n\n";
  prompt += "كل صف يحتوي: التاريخ، تفاصيل العملية، مدين، دائن، الرصيد.\n\n";
  prompt += "قواعد مهمة:\n";
  prompt += "- التاريخ بصيغة YYYY-MM-DD (مثال: 2026-05-08)\n";
  prompt += "- debit = عمود المدين (خروج من الحساب) — رقم أو 0\n";
  prompt += "- credit = عمود الدائن (دخول للحساب) — رقم أو 0\n";
  prompt += "- balance = الرصيد بعد العملية\n";
  prompt += "- لو الخلية فارغة = 0\n";
  prompt += "- استخرج كل الصفوف بدون استثناء\n\n";
  prompt += "أرجع JSON array فقط — لا تضع أي كلام قبله أو بعده:\n";
  prompt += '[{"date":"2026-05-01","description":"نقاط بيع دائنة التاجر","debit":0,"credit":1332.50,"balance":2083.73}]';
  return prompt;
}

function deduplicateTransactions(txns) {
  var seen = {};
  var result = [];
  txns.forEach(function(t) {
    var key = t.date + "_" + t.debit + "_" + t.credit + "_" + (t.description||"").substring(0,20);
    if (!seen[key]) {
      seen[key] = true;
      result.push(t);
    }
  });
  return result;
}


// ── أرشفة فواتير يوم محدد في مجلد القيد ──
function archiveDayInvoices(date, voucherNo) {
  try {
    var parent      = DriveApp.getFolderById(CONFIG.ARCHIVE_PARENT_ID);
    var monthName   = date.substring(0,7); // 2026-05

    // مجلد الشهر
    var monthFolders = parent.getFoldersByName(monthName);
    var monthFolder  = monthFolders.hasNext() ? monthFolders.next() : parent.createFolder(monthName);

    // مجلد القيد
    var journalName    = "قيد-" + formatVoucherNo(voucherNo);
    var journalFolders = monthFolder.getFoldersByName(journalName);
    var journalFolder  = journalFolders.hasNext() ? journalFolders.next() : monthFolder.createFolder(journalName);

    // البحث عن فواتير هذا اليوم في مجلد الشهر
    var moved = 0;

    // ابحث في مجلد inbox أولاً
    var inboxFolder = DriveApp.getFolderById(CONFIG.INBOX_FOLDER_ID);
    var inboxFiles  = inboxFolder.getFiles();
    while (inboxFiles.hasNext()) {
      var f = inboxFiles.next();
      var fname = f.getName();
      // لو اسم الملف يحتوي التاريخ
      if (fname.includes(date) || fname.includes(date.replace(/-/g,""))) {
        f.moveTo(journalFolder);
        moved++;
      }
    }

    // ابحث في مجلد الشهر الأرشيف
    var archMonthFolders = parent.getFoldersByName(monthName);
    if (archMonthFolders.hasNext()) {
      var archMonth = archMonthFolders.next();
      var archFiles = archMonth.getFiles();
      while (archFiles.hasNext()) {
        var f = archFiles.next();
        var fname = f.getName();
        if (fname.includes(date) || fname.includes(date.replace(/-/g,""))) {
          f.moveTo(journalFolder);
          moved++;
        }
      }
    }

    // لو ما لقى بالتاريخ — ابحث بالـ Drive File ID المحفوظ في الشيت
    if (moved === 0) {
      moved = archiveByLedgerFileIds(date, journalFolder);
    }

    Logger.log("قيد " + voucherNo + " (" + date + "): نقل " + moved + " فاتورة");
    return journalFolder.getUrl();

  } catch(e) {
    Logger.log("❌ خطأ في أرشفة اليوم " + date + ": " + e.message);
    return "";
  }
}

// ── أرشفة بناءً على File IDs المحفوظة في الدفتر ──
function archiveByLedgerFileIds(date, targetFolder) {
  try {
    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var sheet  = ss.getSheetByName(CONFIG.SHEET_LEDGER);
    var last   = sheet.getLastRow();
    if (last < 3) return 0;

    var rows  = sheet.getRange(3, 1, last-2, 13).getValues();
    var moved = 0;

    rows.forEach(function(row) {
      if (!row[0]) return;
      var rowDate = row[0] instanceof Date ?
        Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd") :
        row[0].toString().trim();
      if (rowDate !== date) return;

      // عمود M (13) = Drive File ID
      var fileId = row[12] ? row[12].toString().trim() : "";
      if (!fileId) return;

      try {
        var file = DriveApp.getFileById(fileId);
        file.moveTo(targetFolder);
        moved++;
      } catch(e) {
        // الملف ربما محذوف أو منقول مسبقاً
      }
    });

    return moved;
  } catch(e) {
    Logger.log("⚠️ archiveByLedgerFileIds: " + e.message);
    return 0;
  }
}


// ══════════════════════════════════════════
//  ربط الفواتير القديمة بمجلدات القيود
// ══════════════════════════════════════════

function migrateOldInvoicesToJournals() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log("⏳ جاري ربط الفواتير القديمة...");

  var sheet  = ss.getSheetByName(CONFIG.SHEET_LEDGER);
  var last   = sheet.getLastRow();
  if (last < 3) { ui.alert("لا توجد بيانات"); return; }

  var rows = sheet.getRange(3, 1, last-2, 16).getValues();

  // بناء خريطة: تاريخ → رقم القيد (من عمود P)
  var dateToVoucher = {};
  rows.forEach(function(row) {
    if (!row[0] || !row[15]) return;
    var date = row[0] instanceof Date ?
      Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd") :
      row[0].toString().trim();
    var voucher = row[15].toString().replace("قيد-","").trim();
    if (date && voucher) dateToVoucher[date] = voucher;
  });

  Logger.log("خريطة التواريخ والقيود: " + JSON.stringify(dateToVoucher));

  // جلب مجلدات الأرشيف
  var parent = DriveApp.getFolderById(CONFIG.ARCHIVE_PARENT_ID);
  var monthFolders = parent.getFolders();
  var totalMoved = 0;
  var notMoved   = 0;

  while (monthFolders.hasNext()) {
    var monthFolder = monthFolders.next();
    var monthName   = monthFolder.getName(); // 2026-05

    // تجاهل مجلدات القيود نفسها
    if (monthName.startsWith("قيد-")) continue;

    Logger.log("معالجة مجلد: " + monthName);

    // جلب كل الملفات في مجلد الشهر
    var files = monthFolder.getFiles();
    while (files.hasNext()) {
      var file     = files.next();
      var fileName = file.getName();

      // استخرج التاريخ — أولاً من الاسم، ثم من تاريخ الإنشاء
      var fileDate = extractDateFromFileName(fileName, monthName);

      if (!fileDate) {
        // جرب تاريخ إنشاء الملف في Drive
        try {
          var created = file.getDateCreated();
          fileDate = Utilities.formatDate(created, Session.getScriptTimeZone(), "yyyy-MM-dd");
          Logger.log("📅 استخدم تاريخ الإنشاء لـ " + fileName + ": " + fileDate);
        } catch(e2) {
          Logger.log("⚠️ ما عرفت أستخرج تاريخ من: " + fileName);
          notMoved++;
          continue;
        }
      }

      var voucherNo = dateToVoucher[fileDate];
      if (!voucherNo) {
        Logger.log("⚠️ ما في قيد لتاريخ: " + fileDate + " (ملف: " + fileName + ")");
        notMoved++;
        continue;
      }

      // أنشئ أو افتح مجلد القيد
      try {
        var journalName    = "قيد-" + formatVoucherNo(voucherNo);
        Logger.log("🔍 أبحث عن مجلد: " + journalName + " في " + monthFolder.getName());
        var journalFolders = monthFolder.getFoldersByName(journalName);
        var journalFolder;
        if (journalFolders.hasNext()) {
          journalFolder = journalFolders.next();
          Logger.log("✅ وجدت المجلد: " + journalFolder.getName());
        } else {
          journalFolder = monthFolder.createFolder(journalName);
          Logger.log("✅ أنشأت مجلد: " + journalFolder.getName());
        }
        Logger.log("📁 ننقل: " + fileName + " من " + file.getParents().next().getName() + " إلى " + journalFolder.getName());
        file.moveTo(journalFolder);
        totalMoved++;
        Logger.log("✅ " + fileName + " → " + journalName);
      } catch(e) {
        Logger.log("❌ خطأ في نقل " + fileName + ": " + e.message);
        Logger.log("❌ تفاصيل: " + e.stack);
        notMoved++;
      }
    }
  }

  Logger.log("✅ اكتمل — نُقل: " + totalMoved + " | لم يُنقل: " + notMoved);
  // أظهر النتيجة في الشيت
  try {
    SpreadsheetApp.getUi().alert("✅ تم نقل: " + totalMoved + " فاتورة\n⚠️ لم تُنقل: " + notMoved);
  } catch(e) {
    Logger.log("النتيجة: " + totalMoved + " نُقل، " + notMoved + " لم يُنقل");
  }
}

// ── استخرج التاريخ من اسم الملف ──
function extractDateFromFileName(fileName, monthName) {
  // جرب أنماط مختلفة

  // نمط 1: 2026-05-08 أو 20260508
  var match1 = fileName.match(/(\d{4}[-_]?\d{2}[-_]?\d{2})/);
  if (match1) {
    var d = match1[1].replace(/_/g,"-");
    // تأكد إن التاريخ صحيح
    if (d.length === 8) d = d.substring(0,4)+"-"+d.substring(4,6)+"-"+d.substring(6,8);
    if (d.match(/\d{4}-\d{2}-\d{2}/)) return d;
  }

  // نمط 2: اسم الملف يبدأ بتاريخ مثل WhatsApp Image 2026-05-08
  var match2 = fileName.match(/20\d\d[-\s]\d{2}[-\s]\d{2}/);
  if (match2) return match2[0].replace(/\s/g,"-");

  // نمط 3: اسم فيه يوم فقط مثل IMG_08.jpg — نكمله من اسم المجلد
  if (monthName && monthName.match(/^\d{4}-\d{2}$/)) {
    var dayMatch = fileName.match(/[-_\s](\d{2})[-_\s.]/);
    if (dayMatch) {
      var candidate = monthName + "-" + dayMatch[1];
      if (candidate.match(/\d{4}-\d{2}-\d{2}/)) return candidate;
    }
  }

  return null;
}


// ══════════════════════════════════════════
//  الإيميل اليومي للعميل
// ══════════════════════════════════════════

function sendDailyReportEmail() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var dateStr = Utilities.formatDate(yesterday, Session.getScriptTimeZone(), "yyyy-MM-dd");
  var dateAr  = Utilities.formatDate(yesterday, Session.getScriptTimeZone(), "dd/MM/yyyy");

  // جلب قيود هذا اليوم من شيت القيود
  var journalData = getDayJournalData(ss, dateStr);
  if (!journalData || journalData.lines.length === 0) {
    Logger.log("لا توجد قيود ليوم " + dateStr);
    return;
  }

  // جلب فواتير اليوم من Drive
  var attachments = getDayInvoices(dateStr, journalData.voucherNo);

  // بناء محتوى الإيميل
  var subject = "📊 تقرير " + CONFIG.COMPANY_NAME + " — قيد رقم " + journalData.voucherNo + " | " + dateAr;
  var htmlBody = buildEmailHTML(journalData, dateAr);

  // إرسال الإيميل
  try {
    var emailOptions = {
      to:          CONFIG.CLIENT_EMAIL,
      subject:     subject,
      htmlBody:    htmlBody,
      name:        "نظام محاسبة " + CONFIG.COMPANY_NAME,
      replyTo:     Session.getActiveUser().getEmail()
    };

    if (attachments.length > 0) {
      emailOptions.attachments = attachments;
    }

    MailApp.sendEmail(emailOptions);
    Logger.log("✅ تم إرسال التقرير اليومي لـ " + CONFIG.CLIENT_EMAIL);

  } catch(e) {
    Logger.log("❌ فشل إرسال الإيميل: " + e.message);
  }
}

// ── جلب بيانات قيد اليوم ──
function getDayJournalData(ss, dateStr) {
  var sheet = ss.getSheetByName("القيود");
  if (!sheet) return null;

  var last = sheet.getLastRow();
  if (last < 2) return null;

  var data    = sheet.getRange(2, 1, last-1, 7).getValues();
  var voucherNo = null;
  var lines     = [];
  var totalD    = 0, totalC = 0;
  var isBalanced = false;
  var inVoucher  = false;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];

    // رأس القيد
    if (row[1] && row[1].toString() === dateStr && row[0].toString().startsWith("قيد رقم")) {
      voucherNo = row[0].toString().replace("قيد رقم ", "");
      inVoucher = true;
      continue;
    }

    if (!inVoucher) continue;

    // سطر الإجمالي = نهاية القيد
    if (row[2] && row[2].toString() === "الإجمالي") {
      totalD     = Number(row[4]) || 0;
      totalC     = Number(row[5]) || 0;
      isBalanced = row[6] && row[6].toString().includes("✅");
      break;
    }

    // سطور القيد
    if (row[3]) {
      lines.push({
        account:     row[3].toString(),
        debit:       Number(row[4]) || 0,
        credit:      Number(row[5]) || 0,
        description: row[2].toString()
      });
    }
  }

  if (!voucherNo) return null;

  return { voucherNo: voucherNo, date: dateStr, lines: lines, totalDebit: totalD, totalCredit: totalC, isBalanced: isBalanced };
}

// ── جلب فواتير اليوم كمرفقات ──
function getDayInvoices(dateStr, voucherNo) {
  var attachments = [];
  try {
    var parent = DriveApp.getFolderById(CONFIG.ARCHIVE_PARENT_ID);
    var monthName = dateStr.substring(0,7);

    var monthFolders = parent.getFoldersByName(monthName);
    if (!monthFolders.hasNext()) return [];
    var monthFolder = monthFolders.next();

    var journalFolders = monthFolder.getFoldersByName("قيد-" + formatVoucherNo(voucherNo));
    if (!journalFolders.hasNext()) return [];
    var journalFolder = journalFolders.next();

    var files = journalFolder.getFiles();
    var count = 0;
    while (files.hasNext() && count < 10) { // حد أقصى 10 مرفقات
      var file = files.next();
      var mime = file.getMimeType();
      if (mime.startsWith("image/") || mime === "application/pdf") {
        attachments.push(file.getBlob().setName(file.getName()));
        count++;
      }
    }
    Logger.log("✅ " + count + " مرفق من قيد-" + voucherNo);
  } catch(e) {
    Logger.log("⚠️ جلب المرفقات: " + e.message);
  }
  return attachments;
}

// ── بناء HTML الإيميل ──
function buildEmailHTML(data, dateAr) {
  var statusColor = data.isBalanced ? "#27AE60" : "#E74C3C";
  var statusText  = data.isBalanced ? "✅ قيد متوازن" : "❌ قيد غير متوازن";

  var html = '';
  html += '<div style="font-family:Arial,sans-serif;direction:rtl;max-width:600px;margin:0 auto;background:#f5f5f5;padding:20px">';

  // الهيدر
  html += '<div style="background:linear-gradient(135deg,#1B4F72,#2980B9);padding:24px;border-radius:12px 12px 0 0;text-align:center">';
  html += '<h1 style="color:white;margin:0;font-size:22px">📊 تقرير يومي</h1>';
  html += '<p style="color:rgba(255,255,255,0.8);margin:6px 0 0">' + CONFIG.COMPANY_NAME + ' — ' + dateAr + '</p>';
  html += '</div>';

  // معلومات القيد
  html += '<div style="background:white;padding:20px;border-right:4px solid ' + statusColor + '">';
  html += '<table style="width:100%">';
  html += '<tr><td style="color:#666;padding:4px 0">رقم القيد</td><td style="font-weight:bold;font-size:18px;color:#1B4F72">' + data.voucherNo + '</td></tr>';
  html += '<tr><td style="color:#666;padding:4px 0">التاريخ</td><td style="font-weight:bold">' + dateAr + '</td></tr>';
  html += '<tr><td style="color:#666;padding:4px 0">الحالة</td><td style="font-weight:bold;color:' + statusColor + '">' + statusText + '</td></tr>';
  html += '</table>';
  html += '</div>';

  // جدول القيد
  html += '<div style="background:white;padding:20px;margin-top:2px">';
  html += '<h3 style="color:#1B4F72;margin:0 0 12px;border-bottom:2px solid #EEE;padding-bottom:8px">📒 تفاصيل القيد</h3>';
  html += '<table style="width:100%;border-collapse:collapse">';
  html += '<thead>';
  html += '<tr style="background:#1B4F72;color:white">';
  html += '<th style="padding:10px;text-align:right">البيان / الحساب</th>';
  html += '<th style="padding:10px;text-align:center;width:130px">مدين</th>';
  html += '<th style="padding:10px;text-align:center;width:130px">دائن</th>';
  html += '</tr>';
  html += '</thead><tbody>';

  data.lines.forEach(function(line, i) {
    var bg = line.debit > 0 ? '#EBF5FB' : '#FDFEFE';
    var indent = line.description && line.description.startsWith("    من") ? 'padding-right:30px' : '';
    html += '<tr style="background:' + bg + ';border-bottom:1px solid #EEE">';
    html += '<td style="padding:9px 12px;' + indent + '">' + (line.description || '') + ' <span style="color:#888;font-size:12px">(' + line.account + ')</span></td>';
    html += '<td style="padding:9px;text-align:center;font-weight:' + (line.debit > 0 ? 'bold' : 'normal') + ';color:' + (line.debit > 0 ? '#1A5276' : '#CCC') + '">' + (line.debit > 0 ? line.debit.toFixed(2) : '—') + '</td>';
    html += '<td style="padding:9px;text-align:center;font-weight:' + (line.credit > 0 ? 'bold' : 'normal') + ';color:' + (line.credit > 0 ? '#C0392B' : '#CCC') + '">' + (line.credit > 0 ? line.credit.toFixed(2) : '—') + '</td>';
    html += '</tr>';
  });

  // الإجمالي
  html += '<tr style="background:' + (data.isBalanced ? '#D5F5E3' : '#FADBD8') + ';font-weight:bold;border-top:2px solid ' + statusColor + '">';
  html += '<td style="padding:10px 12px">الإجمالي</td>';
  html += '<td style="padding:10px;text-align:center;color:#1A5276">' + data.totalDebit.toFixed(2) + '</td>';
  html += '<td style="padding:10px;text-align:center;color:#C0392B">' + data.totalCredit.toFixed(2) + '</td>';
  html += '</tr>';
  html += '</tbody></table>';
  html += '</div>';

  // الفوتر
  html += '<div style="background:#2C3E50;padding:16px;border-radius:0 0 12px 12px;text-align:center">';
  html += '<p style="color:rgba(255,255,255,0.7);margin:0;font-size:12px">تم الإرسال تلقائياً بواسطة نظام المحاسبة</p>';
  html += '<p style="color:rgba(255,255,255,0.5);margin:4px 0 0;font-size:11px">المحاسب: ' + CONFIG.ACCOUNTANT_NAME + '</p>';
  html += '</div>';

  html += '</div>';
  return html;
}

// ── إعداد التشغيل التلقائي قبل 12 صباحاً ──
function setupDailyEmailTrigger() {
  // احذف التريجر القديم لو موجود
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === "sendDailyReportEmail") {
      ScriptApp.deleteTrigger(t);
    }
  });

  // أنشئ تريجر جديد — يومياً بين 11:30 و 11:59 مساءً
  ScriptApp.newTrigger("sendDailyReportEmail")
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .nearMinute(30)
    .create();

  SpreadsheetApp.getUi().alert("✅ تم إعداد الإيميل اليومي\nيُرسل تلقائياً كل يوم قبل منتصف الليل");
}

// ── إرسال تجريبي فوري ──
function sendTestEmail() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt("اختبار الإيميل", "أدخل التاريخ المراد إرساله (مثال: 2026-05-08):", ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;

  var testDate = response.getResponseText().trim();
  var ss       = SpreadsheetApp.getActiveSpreadsheet();

  // نعدل مؤقتاً لإرسال تاريخ محدد
  var journalData = getDayJournalData(ss, testDate);
  if (!journalData) {
    ui.alert("❌ ما وجدت قيود لتاريخ " + testDate);
    return;
  }

  var dateAr      = testDate.split("-").reverse().join("/");
  var attachments = getDayInvoices(testDate, journalData.voucherNo);
  var subject     = "🧪 اختبار — " + CONFIG.COMPANY_NAME + " — قيد " + journalData.voucherNo + " | " + dateAr;
  var htmlBody    = buildEmailHTML(journalData, dateAr);

  try {
    MailApp.sendEmail({
      to:       CONFIG.CLIENT_EMAIL,
      subject:  subject,
      htmlBody: htmlBody,
      name:     "نظام محاسبة " + CONFIG.COMPANY_NAME,
      attachments: attachments
    });
    ui.alert("✅ تم إرسال الإيميل التجريبي لـ\n" + CONFIG.CLIENT_EMAIL);
  } catch(e) {
    ui.alert("❌ فشل الإرسال: " + e.message);
  }
}


// ══════════════════════════════════════════
//  نظام القيود الذكي — تلقائي ومستدام
// ══════════════════════════════════════════

// الخريطة: تاريخ → رقم القيد
var journalDateIndex = null;

function buildJournalDateIndex(ss) {
  if (journalDateIndex) return journalDateIndex;
  journalDateIndex = {};
  var sheet = ss.getSheetByName("القيود");
  if (!sheet) return journalDateIndex;
  var last = sheet.getLastRow();
  if (last < 2) return journalDateIndex;
  var data = sheet.getRange(2, 1, last-1, 2).getValues();
  data.forEach(function(row) {
    if (!row[0] || !row[1]) return;
    var vNo   = row[0].toString().replace("قيد رقم ","").trim();
    var date  = row[1] instanceof Date ?
      Utilities.formatDate(row[1], Session.getScriptTimeZone(), "yyyy-MM-dd") :
      row[1].toString().trim();
    if (date && vNo) journalDateIndex[date] = vNo;
  });
  return journalDateIndex;
}

// الدالة الرئيسية: تشغّل تلقائياً بعد كل معالجة فاتورة
function smartUpdateJournal(ss, date, entries) {
  if (!date || !entries || entries.length === 0) return;

  var lines = buildDailyJournal(date, entries);
  if (!lines || lines.length === 0) return;

  // ابحث عن قيد موجود لهذا التاريخ
  var index     = buildJournalDateIndex(ss);
  var voucherNo = index[date];

  if (voucherNo) {
    // حدّث القيد الموجود
    updateExistingJournal(ss, date, lines, voucherNo);
    Logger.log("🔄 تحديث قيد " + voucherNo + " ليوم " + date);
  } else {
    // أنشئ قيد جديد
    voucherNo = getNextJournalNumber();
    writeJournalEntry(ss, date, lines, voucherNo);
    // أضف للفهرس
    journalDateIndex[date] = voucherNo;
    Logger.log("✅ قيد جديد " + voucherNo + " ليوم " + date);
  }

  // أرشف الفواتير في مجلد القيد
  try {
    archiveDayInvoices(date, voucherNo);
    updateLedgerWithJournalNo(ss, date, voucherNo);
  } catch(e) {
    Logger.log("⚠️ أرشفة: " + e.message);
  }

  return voucherNo;
}

// تحديث قيد موجود
function updateExistingJournal(ss, date, newLines, voucherNo) {
  var sheet = ss.getSheetByName("القيود");
  if (!sheet) return;

  var last = sheet.getLastRow();
  if (last < 2) return;

  var data = sheet.getRange(2, 1, last-1, 7).getValues();

  // ابحث عن بداية القيد
  var startRow = -1;
  for (var i = 0; i < data.length; i++) {
    if (data[i][0].toString().includes("قيد رقم " + voucherNo)) {
      startRow = i + 2; // +2 لأن البيانات تبدأ من صف 2
      break;
    }
  }

  if (startRow === -1) {
    // ما لقى القيد — أنشئه جديد
    writeJournalEntry(ss, date, newLines, voucherNo);
    return;
  }

  // احذف الأسطر القديمة للقيد
  var endRow = startRow;
  for (var j = startRow; j <= last; j++) {
    var cell = sheet.getRange(j, 2).getValue().toString();
    var rowVNo = sheet.getRange(j, 1).getValue().toString();
    if (j > startRow && (rowVNo.includes("قيد رقم") || cell === "")) {
      endRow = j - 1;
      break;
    }
    endRow = j;
  }

  // احذف الأسطر القديمة
  if (endRow >= startRow) {
    sheet.deleteRows(startRow, endRow - startRow + 1);
  }

  // أعد حساب موقع الإدراج
  var insertRow = startRow;

  // اكتب الأسطر الجديدة
  var totalD = newLines.reduce(function(s,l){ return s+l.amount; }, 0);
  var totalC = totalD;
  var isBalanced = true;

  newLines.forEach(function(line) {
    sheet.insertRowBefore(insertRow);
    sheet.getRange(insertRow, 1, 1, 7).setValues([[
      voucherNo, date, line.description, line.debitAccount, line.amount, "", ""
    ]]);
    sheet.getRange(insertRow, 5).setNumberFormat("#,##0.00");
    sheet.getRange(insertRow, 1, 1, 7).setBackground("#EBF5FB");
    insertRow++;

    sheet.insertRowBefore(insertRow);
    sheet.getRange(insertRow, 1, 1, 7).setValues([[
      voucherNo, date, "    من / " + line.description, line.creditAccount, "", line.amount, ""
    ]]);
    sheet.getRange(insertRow, 6).setNumberFormat("#,##0.00");
    sheet.getRange(insertRow, 1, 1, 7).setBackground("#FDFEFE");
    insertRow++;
  });

  // سطر الإجمالي
  sheet.insertRowBefore(insertRow);
  sheet.getRange(insertRow, 1, 1, 7).setValues([[
    "", "", "الإجمالي", "", totalD, totalC, "✅ متوازن"
  ]]);
  sheet.getRange(insertRow, 5, 1, 2).setNumberFormat("#,##0.00");
  sheet.getRange(insertRow, 1, 1, 7)
    .setBackground("#D5F5E3").setFontWeight("bold");
}

// تشغيل ذكي لكل القيود (بدون تكرار)
function runSmartDailyJournals() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var ui     = SpreadsheetApp.getUi();
  var ledger = ss.getSheetByName(CONFIG.SHEET_LEDGER);
  var last   = ledger.getLastRow();
  if (last < 3) { ui.alert("لا توجد بيانات"); return; }

  // أعد تحميل الفهرس
  journalDateIndex = null;

  var rows = ledger.getRange(3, 1, last-2, 15).getValues();

  // جمع العمليات حسب التاريخ
  var byDate = {};
  rows.forEach(function(r) {
    if (!r[0] || !r[1]) return;
    var date = r[0] instanceof Date ?
      Utilities.formatDate(r[0], Session.getScriptTimeZone(), "yyyy-MM-dd") :
      r[0].toString().trim();
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({
      type:r[1], desc:r[2], cashOut:r[3], cashIn:r[4],
      bankOut:r[5], bankIn:r[6], custodyOut:r[7], custodyIn:r[8], vat:r[14]
    });
  });

  var dates    = Object.keys(byDate).sort();
  var created  = 0, updated = 0;

  dates.forEach(function(date) {
    var entries   = byDate[date];
    var lines     = buildDailyJournal(date, entries);
    if (!lines || lines.length === 0) return;

    var index     = buildJournalDateIndex(ss);
    var voucherNo = index[date];

    if (voucherNo) {
      updateExistingJournal(ss, date, lines, voucherNo);
      updated++;
    } else {
      voucherNo = getNextJournalNumber();
      writeJournalEntry(ss, date, lines, voucherNo);
      journalDateIndex[date] = voucherNo;
      created++;
    }

    try {
      archiveDayInvoices(date, voucherNo);
      updateLedgerWithJournalNo(ss, date, voucherNo);
    } catch(e) { Logger.log("⚠️ " + e.message); }
  });

  ui.alert("✅ اكتملت القيود الذكية\n\nجديد: " + created + " قيد\nمحدّث: " + updated + " قيد");
}


function diagnoseFolders() {
  var parent = DriveApp.getFolderById(CONFIG.ARCHIVE_PARENT_ID);
  Logger.log("مجلد الأرشيف: " + parent.getName() + " | ID: " + parent.getId());

  // اطبع كل المجلدات الفرعية
  var subFolders = parent.getFolders();
  while (subFolders.hasNext()) {
    var f = subFolders.next();
    Logger.log("📁 مجلد: " + f.getName());

    // اطبع محتوياته
    var files = f.getFiles();
    var fileCount = 0;
    while (files.hasNext()) {
      var file = files.next();
      Logger.log("  📄 " + file.getName() + " | " + file.getMimeType());
      fileCount++;
      if (fileCount >= 5) { Logger.log("  ... والمزيد"); break; }
    }
    if (fileCount === 0) Logger.log("  (فارغ من الملفات)");

    // اطبع المجلدات الفرعية داخله
    var subSub = f.getFolders();
    while (subSub.hasNext()) {
      var sf = subSub.next();
      var sfFiles = sf.getFiles();
      var sfCount = 0;
      while (sfFiles.hasNext()) { sfFiles.next(); sfCount++; }
      Logger.log("  📁 " + sf.getName() + " (" + sfCount + " ملف)");
    }
  }
}

// ════════════════════════════════════════════
//  نهاية الملف — مزاهر محاسبة v3.0
// ════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
//  Web App API لمزاهر برو — استدعاء الدوال الموجودة
// ════════════════════════════════════════════════════════════════

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "summary";
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    var result;
    if (action === "summary") {
      result = _api_summary(ss);
    } else if (action === "dailySales") {
      result = _api_dailySales(ss);
    } else if (action === "transactions") {
      result = _api_transactions(ss);
    } else if (action === "incomeStatement") {
      result = _api_incomeStatement(ss);
    } else if (action === "trialBalance") {
      result = _api_trialBalance(ss);
    } else if (action === "cashFlow") {
      result = _api_cashFlow(ss);
    } else if (action === "balanceSheet") {
      result = _api_balanceSheet(ss);
    } else {
      result = _api_summary(ss);
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function _api_summary(ss) {
  var rep = ss.getSheetByName(CONFIG.SHEET_REPORTS);
  if (!rep) return _api_summary_fallback(ss);

  var v = function(row) { return Number(rep.getRange(row, 2).getValue()) || 0; };

  var cashSales = v(4);
  var networkSales = v(5);
  var totalSales = v(6);
  var opEx = v(9);
  var fixedEx = v(10);
  var totalEx = v(11);
  var grossProfit = v(14);
  var loanPayments = v(15);
  var netProfit = v(16);
  var withdrawals = v(17);
  var netCashFlow = v(18);
  var cashBalance = v(22);
  var bankBalance = v(23);
  var custodyBalance = v(24);

  var vatAmount = _sum_ledger_col(ss, 15, null, null);
  var txCount = _count_ledger_this_month(ss);

  var fromDate = rep.getRange(1, 2).getValue();
  var toDate = rep.getRange(1, 4).getValue();
  var period = _formatPeriod(fromDate, toDate);

  return {
    totalSales: totalSales,
    cashSales: cashSales,
    networkSales: networkSales,
    totalExpenses: totalEx,
    operatingExpenses: opEx,
    fixedExpenses: fixedEx,
    grossProfit: grossProfit,
    loanPayments: loanPayments,
    netProfit: netProfit,
    partnerWithdrawals: withdrawals,
    netCashFlow: netCashFlow,
    cashBalance: cashBalance,
    bankBalance: bankBalance,
    custodyBalance: custodyBalance,
    vatAmount: vatAmount,
    transactionCount: txCount,
    period: period,
    lastUpdated: new Date().toISOString()
  };
}

function _api_summary_fallback(ss) {
  var cashSales = _sum_sales_col(ss, 2);
  var networkSales = _sum_sales_col(ss, 3);
  var totalSales = cashSales + networkSales;
  var opEx = _sum_ledger_by_type(ss, "🛒 مصروفات تشغيلية");
  var fixedEx = _sum_ledger_by_type(ss, "💰 مصروفات ثابتة");
  var loans = _sum_ledger_types(ss, ["💳 قسط سيارة", "💳 قسط شراء أرض", "💳 قرض ١", "💳 قرض ٢"]);
  var withdrawals = _sum_ledger_types(ss, ["💼 مسحوبات سليمان", "💼 مسحوبات أم طوبى"]);
  var vatAmount = _sum_ledger_col(ss, 15, null, null);
  var grossProfit = totalSales - opEx - fixedEx;
  var netProfit = grossProfit - loans;
  var netCashFlow = netProfit - withdrawals;
  var balances = _get_current_balances(ss);

  return {
    totalSales: totalSales,
    cashSales: cashSales,
    networkSales: networkSales,
    totalExpenses: opEx + fixedEx,
    operatingExpenses: opEx,
    fixedExpenses: fixedEx,
    grossProfit: grossProfit,
    loanPayments: loans,
    netProfit: netProfit,
    partnerWithdrawals: withdrawals,
    netCashFlow: netCashFlow,
    cashBalance: balances.cash,
    bankBalance: balances.bank,
    custodyBalance: balances.custody,
    vatAmount: vatAmount,
    transactionCount: _count_ledger_this_month(ss),
    period: _formatPeriod(null, null),
    lastUpdated: new Date().toISOString()
  };
}

function _api_dailySales(ss) {
  var sheet = ss.getSheetByName(CONFIG.SHEET_SALES);
  if (!sheet) return { items: [], total: 0 };

  var last = sheet.getLastRow();
  if (last < 2) return { items: [], total: 0 };

  var data = sheet.getRange(2, 1, last - 1, 3).getValues();
  var items = [];
  var total = 0;

  data.forEach(function(row) {
    if (!row[0]) return;
    var date = row[0] instanceof Date ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd") : row[0].toString();
    var cash = Number(row[1]) || 0;
    var network = Number(row[2]) || 0;
    items.push({ date: date, cash: cash, network: network, total: cash + network });
    total += cash + network;
  });

  return { items: items, total: total };
}

function _api_transactions(ss) {
  var sheet = ss.getSheetByName(CONFIG.SHEET_LEDGER);
  if (!sheet) return { items: [], total: 0 };

  var last = sheet.getLastRow();
  if (last < 2) return { items: [], total: 0 };

  var data = sheet.getRange(2, 1, last - 1, 3).getValues();
  var items = [];
  var total = 0;

  data.forEach(function(row) {
    if (!row[0]) return;
    var date = row[0] instanceof Date ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd") : row[0].toString();
    var amount = Number(row[2]) || 0;
    items.push({ date: date, type: row[1], amount: amount });
    total += amount;
  });

  return { items: items, total: total };
}

function _api_incomeStatement(ss) {
  var cashSales = _sum_sales_col(ss, 2);
  var networkSales = _sum_sales_col(ss, 3);
  var totalSales = cashSales + networkSales;
  var opEx = _sum_ledger_by_type(ss, "🛒 مصروفات تشغيلية");
  var fixedEx = _sum_ledger_by_type(ss, "💰 مصروفات ثابتة");
  var totalEx = opEx + fixedEx;
  var grossProfit = totalSales - totalEx;
  var loans = _sum_ledger_types(ss, ["💳 قسط سيارة", "💳 قسط شراء أرض", "💳 قرض ١", "💳 قرض ٢"]);
  var netProfit = grossProfit - loans;

  return {
    revenue: { cash: cashSales, network: networkSales, total: totalSales },
    expenses: { operating: opEx, fixed: fixedEx, total: totalEx },
    grossProfit: grossProfit,
    loanPayments: loans,
    netProfit: netProfit
  };
}

function _api_trialBalance(ss) {
  var sheet = ss.getSheetByName(CONFIG.SHEET_LEDGER);
  if (!sheet) return { accounts: [], totalDebit: 0, totalCredit: 0 };

  var last = sheet.getLastRow();
  if (last < 2) return { accounts: [], totalDebit: 0, totalCredit: 0 };

  var data = sheet.getRange(2, 1, last - 1, 3).getValues();
  var accounts = {};

  data.forEach(function(row) {
    if (!row[1]) return;
    var type = row[1];
    var amount = Number(row[2]) || 0;
    if (!accounts[type]) accounts[type] = { debit: 0, credit: 0 };
    accounts[type].debit += amount;
  });

  var items = [];
  var totalDebit = 0, totalCredit = 0;

  for (var key in accounts) {
    items.push({ account: key, debit: accounts[key].debit, credit: accounts[key].credit });
    totalDebit += accounts[key].debit;
    totalCredit += accounts[key].credit;
  }

  return { accounts: items, totalDebit: totalDebit, totalCredit: totalCredit };
}

function _api_cashFlow(ss) {
  var cashSales = _sum_sales_col(ss, 2);
  var networkSales = _sum_sales_col(ss, 3);
  var totalIncome = cashSales + networkSales;
  var opEx = _sum_ledger_by_type(ss, "🛒 مصروفات تشغيلية");
  var fixedEx = _sum_ledger_by_type(ss, "💰 مصروفات ثابتة");
  var loans = _sum_ledger_types(ss, ["💳 قسط سيارة", "💳 قسط شراء أرض", "💳 قرض ١", "💳 قرض ٢"]);
  var withdrawals = _sum_ledger_types(ss, ["💼 مسحوبات سليمان", "💼 مسحوبات أم طوبى"]);
  var totalOutflow = opEx + fixedEx + loans + withdrawals;
  var netCashFlow = totalIncome - totalOutflow;

  return {
    inflow: totalIncome,
    outflow: totalOutflow,
    netFlow: netCashFlow
  };
}

function _api_balanceSheet(ss) {
  var balances = _get_current_balances(ss);
  var loans = _sum_ledger_types(ss, ["💳 قسط سيارة", "💳 قسط شراء أرض", "💳 قرض ١", "💳 قرض ٢"]);
  var totalAssets = balances.cash + balances.bank + balances.custody;
  var equity = totalAssets - loans;

  return {
    assets: { cash: balances.cash, bank: balances.bank, custody: balances.custody, total: totalAssets },
    liabilities: { loans: loans },
    equity: equity
  };
}
// ══════════════════════════════════════════════════════════════
//  rebuildEverythingFromLedger
//  المصدر الوحيد: شيت الدفتر
//  يعيد بناء: المبيعات + القيود + Supabase
// ══════════════════════════════════════════════════════════════

function rebuildEverythingFromLedger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  if (ui.alert(
    "⚠️ إعادة بناء كاملة",
    "سيتم:\n١. إعادة بناء شيت المبيعات من الدفتر\n٢. إعادة بناء شيت القيود من الدفتر\n٣. مسح Supabase وإعادة رفع كل البيانات\n\nهل تريد المتابعة؟",
    ui.ButtonSet.YES_NO
  ) !== ui.Button.YES) return;

  // ── 1. قراءة الدفتر كاملاً ──
  var ledger = ss.getSheetByName(CONFIG.SHEET_LEDGER);
  var last   = ledger.getLastRow();
  if (last < 3) { ui.alert("❌ الدفتر فارغ"); return; }

  var rows = ledger.getRange(3, 1, last - 2, 16).getValues();

  // ── 2. بناء شيت المبيعات ──
  Logger.log("🔄 إعادة بناء المبيعات...");
  _rebuildSalesSheet(ss, rows);

  // ── 3. بناء شيت القيود ──
  Logger.log("🔄 إعادة بناء القيود...");
  _rebuildJournalSheet(ss, rows);

  // ── 4. مزامنة Supabase ──
  Logger.log("🔄 مزامنة Supabase...");
  _syncAllFromLedgerRows(ss, rows);

  ui.alert("✅ اكتملت إعادة البناء الكاملة\n\nالمصدر: شيت الدفتر\n✅ المبيعات\n✅ القيود\n✅ Supabase");
}


// ══════════════════════════════════════════
//  إعادة بناء شيت المبيعات
// ══════════════════════════════════════════
function _rebuildSalesSheet(ss, rows) {
  var sheet = ss.getSheetByName(CONFIG.SHEET_SALES);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_SALES);
  }

  // امسح المحتوى القديم مع الإبقاء على الهيدر
  sheet.clearContents();
  sheet.clearFormats();

  // أعد الهيدر
  sheet.getRange(1, 1, 1, 6).setValues([[
    "التاريخ", "مبيعات كاش", "مبيعات شبكة", "إجمالي المبيعات", "ملاحظات", "الفاتورة"
  ]]).setBackground("#1B4F72").setFontColor("#FFF").setFontWeight("bold").setHorizontalAlignment("center");

  // اجمع المبيعات حسب التاريخ
  var salesByDate = {};

  rows.forEach(function(row) {
    if (!row[0] || !row[1]) return;

    var dateStr = row[0] instanceof Date
      ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd")
      : row[0].toString().trim();

    var type    = row[1].toString().trim();
    var cashIn  = Number(row[4]) || 0;  // عمود E = دخل صندوق
    var bankIn  = Number(row[6]) || 0;  // عمود G = دخل بنك

    if (type === "💵 مبيعات كاش" && cashIn > 0) {
      if (!salesByDate[dateStr]) salesByDate[dateStr] = {cash: 0, network: 0};
      salesByDate[dateStr].cash += cashIn;
    }
    if (type === "🏦 مبيعات شبكة" && bankIn > 0) {
      if (!salesByDate[dateStr]) salesByDate[dateStr] = {cash: 0, network: 0};
      salesByDate[dateStr].network += bankIn;
    }
  });

  // اكتب البيانات
  var dates = Object.keys(salesByDate).sort();
  var rowNum = 2;
  dates.forEach(function(dateStr) {
    var s = salesByDate[dateStr];
    var total = s.cash + s.network;
    sheet.getRange(rowNum, 1).setValue(new Date(dateStr)).setNumberFormat("yyyy-mm-dd");
    sheet.getRange(rowNum, 2).setValue(s.cash);
    sheet.getRange(rowNum, 3).setValue(s.network);
    sheet.getRange(rowNum, 4).setValue(total);
    sheet.getRange(rowNum, 5).setValue("تقرير POS");
    sheet.getRange(rowNum, 2, 1, 3).setNumberFormat("#,##0.00");
    rowNum++;
  });

  sheet.setFrozenRows(1);
  sheet.setRightToLeft(true);
  Logger.log("✅ المبيعات: " + dates.length + " يوم");
}


// ══════════════════════════════════════════
//  إعادة بناء شيت القيود
// ══════════════════════════════════════════
function _rebuildJournalSheet(ss, rows) {
  // احذف شيت القيود القديم وأنشئ جديد
  var old = ss.getSheetByName("القيود");
  if (old) ss.deleteSheet(old);
  var sheet = ss.insertSheet("القيود");
  setupJournalSheet(sheet);

  // اجمع العمليات حسب التاريخ
  var byDate = {};
  rows.forEach(function(r) {
    if (!r[0] || !r[1]) return;
    var date = r[0] instanceof Date
      ? Utilities.formatDate(r[0], Session.getScriptTimeZone(), "yyyy-MM-dd")
      : r[0].toString().trim();
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({
      type:       r[1], desc: r[2],
      cashOut:    r[3], cashIn:    r[4],
      bankOut:    r[5], bankIn:    r[6],
      custodyOut: r[7], custodyIn: r[8],
      vat:        r[14]
    });
  });

  // أعد ترقيم القيود من الصفر
  PropertiesService.getScriptProperties().setProperty("last_journal_no", "0");
  journalDateIndex = {};

  var dates   = Object.keys(byDate).sort();
  var created = 0;

  dates.forEach(function(date) {
    var entries   = byDate[date];
    var lines     = buildDailyJournal(date, entries);
    if (!lines || lines.length === 0) return;

    var voucherNo = getNextJournalNumber();
    writeJournalEntry(ss, date, lines, voucherNo);
    journalDateIndex[date] = voucherNo;
    created++;
  });

  // ── كتابة أرقام القيود في عمود P دفعة واحدة ──
  var ledgerSheet = ss.getSheetByName(CONFIG.SHEET_LEDGER);
  var lLast = ledgerSheet.getLastRow();
  if (lLast >= 3 && Object.keys(journalDateIndex).length > 0) {
    var lDates = ledgerSheet.getRange(3, 1, lLast - 2, 1).getValues();
    var colP   = ledgerSheet.getRange(3, 16, lLast - 2, 1).getValues();
    var tz     = Session.getScriptTimeZone();
    for (var i = 0; i < lDates.length; i++) {
      var d = lDates[i][0] instanceof Date
        ? Utilities.formatDate(lDates[i][0], tz, "yyyy-MM-dd")
        : lDates[i][0].toString().trim();
      if (journalDateIndex[d]) {
        colP[i][0] = "قيد-" + formatVoucherNo(journalDateIndex[d]);
      }
    }
    ledgerSheet.getRange(3, 16, lLast - 2, 1).setValues(colP);
    Logger.log("✅ عمود P: كُتب لـ " + Object.keys(journalDateIndex).length + " تاريخ");
  }

  Logger.log("✅ القيود: " + created + " قيد");
}


// ══════════════════════════════════════════
//  مزامنة Supabase من صفوف الدفتر
// ══════════════════════════════════════════
function _syncAllFromLedgerRows(ss, rows) {
  var projectId = getProjectId();
  if (!projectId) {
    Logger.log("❌ ما وجد project_id");
    return;
  }

  // احذف البيانات القديمة
  supabaseDelete("ledger_entries", "project_id=eq." + projectId);
  supabaseDelete("sales",          "project_id=eq." + projectId);

  // ارفع المبيعات من شيت المبيعات (الذي بنيناه للتو)
  var salesSheet = ss.getSheetByName(CONFIG.SHEET_SALES);
  var salesLast  = salesSheet.getLastRow();
  var salesCount = 0;

  if (salesLast > 1) {
    var salesRows = salesSheet.getRange(2, 1, salesLast - 1, 5).getValues();
    salesRows.forEach(function(row) {
      if (!row[0]) return;
      var ok = supabaseInsert("sales", {
        project_id:    projectId,
        date:          row[0] instanceof Date
          ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd")
          : row[0].toString(),
        cash_sales:    Number(row[1]) || 0,
        network_sales: Number(row[2]) || 0,
        description:   row[4] || "تقرير POS"
      });
      if (ok) salesCount++;
    });
  }

  // ارفع الدفتر
  var ledgerCount = 0;
  rows.forEach(function(row) {
    if (!row[0] || !row[1]) return;

    var dateStr = row[0] instanceof Date
      ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd")
      : row[0].toString();

    var total = (Number(row[3])||0) + (Number(row[4])||0) + (Number(row[5])||0) +
                (Number(row[6])||0) + (Number(row[7])||0) + (Number(row[8])||0);

    var ok = supabaseInsert("ledger_entries", {
      project_id:  projectId,
      date:        dateStr,
      type:        row[1]  || "",
      description: row[2]  || "",
      cash_out:    Number(row[3])  || 0,
      cash_in:     Number(row[4])  || 0,
      bank_out:    Number(row[5])  || 0,
      bank_in:     Number(row[6])  || 0,
      custody_out: Number(row[7])  || 0,
      custody_in:  Number(row[8])  || 0,
      vat_amount:  Number(row[14]) || 0,
      total_amount: total,
      status:      "approved",
      journal_no:  row[15] ? row[15].toString().replace("قيد-", "").trim() : null
    });
    if (ok) ledgerCount++;
  });

  Logger.log("✅ Supabase — مبيعات: " + salesCount + " | دفتر: " + ledgerCount);
}


// ══════════════════════════════════════════
//  onEdit — ترتيب زمني + تحديث الأرصدة عند أي تعديل في الدفتر
// ══════════════════════════════════════════
function onEdit(e) {
  if (!e) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== CONFIG.SHEET_LEDGER) return;
  var row = e.range.getRow();
  if (row < 3) return;

  var type      = sheet.getRange(row, 2).getValue();
  var amounts   = sheet.getRange(row, 4, 1, 6).getValues()[0];
  var hasAmount = amounts.some(function(v) { return Number(v) > 0; });
  if (type && type !== "" && hasAmount) {
    sheet.getRange(row, 1, 1, 15).setBackground("#FFFFFF");
  }

  sortAndRefreshLedgerSheet(sheet);
}

function sortAndRefreshLedger() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_LEDGER);
  if (!sheet) { SpreadsheetApp.getUi().alert("❌ لم يتم العثور على شيت الدفتر"); return; }
  sortAndRefreshLedgerSheet(sheet);
  SpreadsheetApp.getUi().alert("✅ تم الترتيب الزمني وتحديث الأرصدة");
}

function sortAndRefreshLedgerSheet(sheet) {
  var last = sheet.getLastRow();
  if (last < 3) return;

  var dataRange = sheet.getRange(3, 1, last - 2, 16);
  var data = dataRange.getValues();

  var filled = [], empty = [];
  data.forEach(function(r) {
    (r[0] || r[1] ? filled : empty).push(r);
  });

  filled.sort(function(a, b) {
    var da = a[0] ? (a[0] instanceof Date ? a[0] : new Date(a[0])) : new Date(0);
    var db = b[0] ? (b[0] instanceof Date ? b[0] : new Date(b[0])) : new Date(0);
    return da - db;
  });

  dataRange.setValues(filled.concat(empty));

  var count = last - 2;
  var jF = [], kF = [], lF = [];
  for (var r = 3; r <= last; r++) {
    jF.push(["=J" + (r-1) + "+E" + r + "-D" + r]);
    kF.push(["=K" + (r-1) + "+G" + r + "-F" + r]);
    lF.push(["=L" + (r-1) + "+I" + r + "-H" + r]);
  }
  sheet.getRange(3, 10, count, 1).setFormulas(jF);
  sheet.getRange(3, 11, count, 1).setFormulas(kF);
  sheet.getRange(3, 12, count, 1).setFormulas(lF);
}

// ══════════════════════════════════════════
//  إصلاح مجلدات Drive — تسمية وترتيب القيود
// ══════════════════════════════════════════
function fixDriveFolders() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var ui  = SpreadsheetApp.getUi();
  var ledger = ss.getSheetByName(CONFIG.SHEET_LEDGER);
  if (!ledger) { ui.alert("❌ لم يتم العثور على شيت الدفتر"); return; }
  var last = ledger.getLastRow();
  if (last < 3) { ui.alert("❌ الدفتر فارغ"); return; }

  if (ui.alert(
    "⚠️ تحقق قبل المتابعة",
    "ستتم العمليات التالية:\n" +
    "١. حذف جميع مجلدات 2025 (إنها خاطئة)\n" +
    "٢. نقل أي مجلد قيد في شهر خاطئ للشهر الصحيح\n" +
    "٣. إعادة تسمية المجلدات المجهولة إذا أمكن\n\nمتابعة؟",
    ui.ButtonSet.YES_NO
  ) !== ui.Button.YES) return;

  // ── خطوة ١: بناء الخريطة من الدفتر (عمود A التاريخ، عمود P رقم القيد) ──
  var rows = ledger.getRange(3, 1, last - 2, 16).getValues();
  var tz   = Session.getScriptTimeZone();

  var voucherToMonth = {}; // "قيد-0001" → "2026-05"

  rows.forEach(function(r) {
    var rawDate    = r[0];
    var voucherRaw = r[15]; // عمود P (index 15)
    if (!rawDate || !voucherRaw) return;
    var dateStr = rawDate instanceof Date
      ? Utilities.formatDate(rawDate, tz, "yyyy-MM-dd")
      : rawDate.toString().trim();
    var voucher = voucherRaw.toString().trim();
    if (!dateStr || !voucher || dateStr.length < 7) return;
    var month = dateStr.substring(0, 7); // "2026-05"
    // الدفتر مصدر الحقيقة — أول مرة نراها هي الصحيحة
    if (!voucherToMonth[voucher]) voucherToMonth[voucher] = month;
  });

  if (Object.keys(voucherToMonth).length === 0) {
    ui.alert("⚠️ لا توجد قيود في الدفتر (تأكد من وجود بيانات في عمود P)");
    return;
  }

  // ── خطوة ٢: جمع مجلدات الأرشيف ──
  var parent     = DriveApp.getFolderById(CONFIG.ARCHIVE_PARENT_ID);
  var monthIter  = parent.getFolders();
  var allMonthFolders = [];
  while (monthIter.hasNext()) { allMonthFolders.push(monthIter.next()); }

  var deleted = 0, moved = 0, renamed = 0, errors = 0;
  var log = [];

  allMonthFolders.forEach(function(monthFolder) {
    var currentMonth = monthFolder.getName();
    if (!/^\d{4}-\d{2}$/.test(currentMonth)) return; // تجاهل غير مجلدات الشهور

    // ── خطوة ٣: حذف مجلدات 2025 بالكامل ──
    if (currentMonth.startsWith("2025")) {
      try {
        monthFolder.setTrashed(true);
        deleted++;
        log.push("🗑️ حذف مجلد 2025: " + currentMonth);
      } catch(e) {
        errors++;
        log.push("❌ فشل حذف " + currentMonth + ": " + e.message);
      }
      return; // انتقل للمجلد التالي
    }

    // ── خطوة ٤: فحص مجلدات القيود داخل هذا الشهر ──
    var jIter = monthFolder.getFolders();
    var jFolders = [];
    while (jIter.hasNext()) { jFolders.push(jIter.next()); }

    // المجلدات المتوقعة لهذا الشهر
    var expectedInMonth = {};
    Object.keys(voucherToMonth).forEach(function(v) {
      if (voucherToMonth[v] === currentMonth) expectedInMonth[v] = false;
    });

    jFolders.forEach(function(jFolder) {
      var jName = jFolder.getName();
      if (!/^قيد-\d+$/.test(jName)) return;

      // الحالة أ: القيد موجود في الدفتر
      if (voucherToMonth.hasOwnProperty(jName)) {
        expectedInMonth[jName] = true;
        var correctMonth = voucherToMonth[jName];

        if (correctMonth !== currentMonth) {
          // الشهر خاطئ — انقل للشهر الصحيح
          try {
            var targetFolders = parent.getFoldersByName(correctMonth);
            var targetMonth   = targetFolders.hasNext()
              ? targetFolders.next()
              : parent.createFolder(correctMonth);

            var existCheck = targetMonth.getFoldersByName(jName);
            if (existCheck.hasNext()) {
              // دمج الملفات في المجلد الموجود
              var dest  = existCheck.next();
              var files = jFolder.getFiles();
              while (files.hasNext()) { files.next().moveTo(dest); }
              jFolder.setTrashed(true);
              log.push("📦 دمج: " + currentMonth + "/" + jName + " → " + correctMonth + "/" + jName);
            } else {
              jFolder.moveTo(targetMonth);
              log.push("📦 نقل: " + currentMonth + "/" + jName + " → " + correctMonth + "/" + jName);
            }
            moved++;
          } catch(e) {
            errors++;
            log.push("❌ فشل نقل " + jName + " من " + currentMonth + ": " + e.message);
          }
        }
        // else: صحيح ✅

      } else {
        // الحالة ب: القيد غير موجود في الدفتر — ربما اسم قديم
        var missingList = Object.keys(expectedInMonth).filter(function(v) {
          return !expectedInMonth[v];
        });

        if (missingList.length === 1) {
          // تطابق وحيد → أعد التسمية
          var correctName = missingList[0];
          try {
            jFolder.setName(correctName);
            expectedInMonth[correctName] = true;
            renamed++;
            log.push("✏️ تسمية: " + currentMonth + "/" + jName + " → " + correctName);
          } catch(e) {
            errors++;
            log.push("❌ فشل تسمية " + jName + ": " + e.message);
          }
        } else {
          log.push("⚠️ مجلد مجهول: " + currentMonth + "/" + jName
            + (missingList.length > 1 ? " (" + missingList.length + " ناقص)" : " (لا يوجد تطابق)"));
        }
      }
    });
  });

  // ── تقرير ──
  var summary = "✅ اكتمل إصلاح مجلدات Drive\n\n"
    + "🗑️ مجلدات 2025 محذوفة: " + deleted + "\n"
    + "📦 منقول/مدموج:        " + moved   + "\n"
    + "✏️ مُعاد تسميته:       " + renamed + "\n"
    + "❌ أخطاء:               " + errors;

  if (log.length > 0) {
    summary += "\n\nالتفاصيل:\n" + log.slice(0, 25).join("\n");
    if (log.length > 25) summary += "\n... و " + (log.length - 25) + " إجراء آخر";
  } else {
    summary += "\n\n✅ جميع المجلدات كانت صحيحة";
  }

  ui.alert(summary);
  Logger.log("[fixDriveFolders]\n" + log.join("\n"));
}
