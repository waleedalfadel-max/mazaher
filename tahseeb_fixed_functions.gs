// ══════════════════════════════════════════
// runDailySync — مصحح
// الإصلاح: "auto " ← "auto" (حذف المسافة الزائدة)
// ══════════════════════════════════════════
function runDailySync() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { Logger.log("⏳ يعمل بالفعل"); return; }
  try {
    Logger.log("═══ بدء المزامنة ═══");
    var folder = DriveApp.getFolderById(CONFIG.INBOX_FOLDER_ID);
    var files = folder.getFiles();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var done = 0, skip = 0, err = 0;

    while (files.hasNext()) {
      var file = files.next();
      var mime = file.getMimeType();
      var fileId = file.getId();

      if (isProcessed(fileId)) { skip++; continue; }

      var quickClass = autoClassify(file.getName());
      if (quickClass) Logger.log("🏷️ تصنيف تلقائي: " + file.getName() + " → " + quickClass.type);

      var result = null;
      try {
        if (isImage(mime))                result = processImage(file);
        else if (mime === "application/pdf") result = processPdf(file);
        else { markProcessed(fileId, "unsupported"); continue; }
      } catch(e) {
        Logger.log("❌ خطأ في معالجة: " + file.getName() + " — " + e.message);
        err++; continue;
      }

      if (!result || !result.success) {
        Logger.log("❌ فشل التحليل: " + file.getName());
        err++; continue;
      }

      var fileUrl     = file.getUrl();
      var fileToMove  = file;
      var fileDateStr = result.data.date instanceof Date
        ? Utilities.formatDate(result.data.date, Session.getScriptTimeZone(), "yyyy-MM-dd")
        : result.data.date.toString().trim();

      try {
        if (result.type === "sales") {
          if (!salesDateExists(ss, result.data.date)) {
            writeSales(ss, result.data, fileUrl);
          } else {
            Logger.log("⚠️ تاريخ مبيعات مكرر: " + result.data.date);
          }
        } else if (result.type === "auto") {   // ✅ إصلاح: "auto" بدون مسافة
          writeAuto(ss, result.data, file.getName(), fileUrl);
        } else {
          writePending(ss, result.data, file.getName(), fileUrl);
        }

        markProcessed(fileId, "done");
        done++;
        Logger.log("✅ " + file.getName());

        // نقل الملف إلى مجلد القيد
        try {
          journalDateIndex = null;
          var jFolder = getOrCreateJournalFolder(fileDateStr);

          if (jFolder.getName() === fileDateStr.substring(0, 7)) {
            var ledgerSheet = ss.getSheetByName(CONFIG.SHEET_LEDGER);
            var lLast2 = ledgerSheet.getLastRow();
            if (lLast2 > 2) {
              var lRows2 = ledgerSheet.getRange(3, 1, lLast2 - 2, 15).getValues();
              var dayE = [];
              lRows2.forEach(function(r) {
                if (!r[0]) return;
                var d2 = r[0] instanceof Date
                  ? Utilities.formatDate(r[0], Session.getScriptTimeZone(), "yyyy-MM-dd")
                  : r[0].toString().trim();
                if (d2 === fileDateStr) dayE.push({
                  type: r[1], desc: r[2], cashOut: r[3], cashIn: r[4],
                  bankOut: r[5], bankIn: r[6], custodyOut: r[7], custodyIn: r[8], vat: r[14]
                });
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
        Logger.log("❌ خطأ في الكتابة: " + file.getName() + " — " + e.message);
        err++;
      }
    }

    Logger.log("═══ انتهت: " + done + " معالج، " + skip + " مكرر، " + err + " خطأ ═══");
  } finally {
    lock.releaseLock();
  }
}


// ══════════════════════════════════════════
// updateExistingJournal — مصحح
// الإصلاحات:
//   1. قراءة دفعية بدل خلية بخلية
//   2. حساب endRow صحيح (يشمل الإجمالي والفاصل)
//   3. إضافة رأس القيد عند إعادة الكتابة (كان ناقصاً)
// ══════════════════════════════════════════
function updateExistingJournal(ss, date, newLines, voucherNo) {
  var sheet = ss.getSheetByName(" القيود ");
  if (!sheet) return;
  var last = sheet.getLastRow();
  if (last < 2) return;

  // ✅ إصلاح 1: قراءة دفعية بدل خلية بخلية داخل الحلقة
  var data = sheet.getRange(2, 1, last - 1, 7).getValues();

  // ابحث عن بداية القيد (الصف الذي يحتوي رأس القيد في عمود A)
  var startIdx = -1;
  for (var i = 0; i < data.length; i++) {
    if (data[i][0].toString().includes("قيد رقم " + voucherNo)) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) {
    // ما وجد القيد — أنشئه جديداً
    writeJournalEntry(ss, date, newLines, voucherNo);
    return;
  }

  var startRow = startIdx + 2; // رقم الصف الفعلي (البيانات تبدأ من صف 2)

  // ✅ إصلاح 2: ابحث عن نهاية القيد بأول رأس قيد آخر فقط
  // الكود القديم كان يتوقف عند عمود B فارغ (يطابق سطر الإجمالي)
  var endRow = last;
  for (var i = startIdx + 1; i < data.length; i++) {
    var cellA = data[i][0] ? data[i][0].toString() : "";
    if (cellA.includes("قيد رقم") && !cellA.includes("قيد رقم " + voucherNo)) {
      endRow = i + 2 - 1; // الصف الفعلي قبل رأس القيد التالي
      break;
    }
  }

  // احذف الأسطر القديمة كلها: رأس + سطور + إجمالي + فاصل
  sheet.deleteRows(startRow, endRow - startRow + 1);

  // احسب الإجماليات
  var totalDebit  = newLines.reduce(function(s, l) { return s + l.amount; }, 0);
  var totalCredit = totalDebit;

  var insertRow = startRow;

  // ✅ إصلاح 3: أضف رأس القيد (كان ناقصاً في الكود الأصلي)
  sheet.insertRowBefore(insertRow);
  sheet.getRange(insertRow, 1, 1, 7).setValues([[
    "قيد رقم " + voucherNo, date, "قيد يومي - " + date, "", "", "", ""
  ]]);
  sheet.getRange(insertRow, 1, 1, 7)
    .setBackground("#1B4F72").setFontColor("#FFF").setFontWeight("bold");
  insertRow++;

  // اكتب سطور القيد (مدين + دائن لكل سطر)
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
      voucherNo, date, "من / " + line.description, line.creditAccount, "", line.amount, ""
    ]]);
    sheet.getRange(insertRow, 6).setNumberFormat("#,##0.00");
    sheet.getRange(insertRow, 1, 1, 7).setBackground("#FDFEFE");
    insertRow++;
  });

  // سطر الإجمالي
  sheet.insertRowBefore(insertRow);
  sheet.getRange(insertRow, 1, 1, 7).setValues([[
    "", "", "الإجمالي", "", totalDebit, totalCredit, "✅ متوازن"
  ]]);
  sheet.getRange(insertRow, 5, 1, 2).setNumberFormat("#,##0.00");
  sheet.getRange(insertRow, 1, 1, 7).setBackground("#D5F5E3").setFontWeight("bold");
  insertRow++;

  // فاصل بين القيود
  sheet.insertRowBefore(insertRow);
  sheet.getRange(insertRow, 1, 1, 7).setBackground("#ECF0F1");
}


// ══════════════════════════════════════════
// supabaseDelete — دالة مساعدة لحذف سجلات بفلتر
// ══════════════════════════════════════════
function supabaseDelete(table, filter) {
  var url = CONFIG.SUPABASE_URL + "/rest/v1/" + table + "?" + filter;
  var res = UrlFetchApp.fetch(url, {
    method: "DELETE",
    headers: {
      "apikey": CONFIG.SUPABASE_KEY,
      "Authorization": "Bearer " + CONFIG.SUPABASE_KEY
    },
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  Logger.log("DELETE " + table + " → HTTP " + code);
  return code === 200 || code === 204;
}


// ══════════════════════════════════════════
// syncAllToSupabase — مصحح (مسح ثم رفع كامل)
// الإصلاح: بدل الإضافة فقط، يحذف كل بيانات المشروع
// ثم يرفع كل شيء من الشيت — الشيت هو المصدر الوحيد للحقيقة
// ══════════════════════════════════════════
function syncAllToSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // تأكيد قبل المسح
  if (ui.alert(
    "⚠️ مزامنة كاملة",
    "سيُحذف كل بيانات الدفتر والمبيعات من Supabase ثم تُرفع من جديد من الشيت.\n\nهل أنت متأكد؟",
    ui.ButtonSet.YES_NO
  ) !== ui.Button.YES) return;

  var projectId = getProjectId();
  if (!projectId) { ui.alert("❌ ما وجد مشروع في Supabase"); return; }

  // ── 1. حذف البيانات القديمة ──
  Logger.log("🗑️ حذف البيانات القديمة...");
  var delSales  = supabaseDelete("sales",          "project_id=eq." + projectId);
  var delLedger = supabaseDelete("ledger_entries", "project_id=eq." + projectId);

  if (!delSales || !delLedger) {
    ui.alert("❌ فشل حذف البيانات القديمة\n\nتأكد أن السكيما تسمح بـ DELETE لهذا المستخدم");
    return;
  }
  Logger.log("✅ حُذفت البيانات القديمة");

  // ── 2. رفع المبيعات ──
  var salesSheet = ss.getSheetByName(CONFIG.SHEET_SALES);
  var salesRows  = salesSheet.getLastRow() > 1
    ? salesSheet.getRange(2, 1, salesSheet.getLastRow() - 1, 5).getValues()
    : [];
  var salesCount = 0;
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
  Logger.log("✅ مبيعات: " + salesCount + " سجل");

  // ── 3. رفع الدفتر ──
  var ledgerSheet = ss.getSheetByName(CONFIG.SHEET_LEDGER);
  var ledgerRows  = ledgerSheet.getLastRow() > 2
    ? ledgerSheet.getRange(3, 1, ledgerSheet.getLastRow() - 2, 16).getValues()
    : [];
  var ledgerCount = 0;
  ledgerRows.forEach(function(row) {
    if (!row[0] || !row[1]) return;
    var dateStr = row[0] instanceof Date
      ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd")
      : row[0].toString();
    var total = (Number(row[3])||0) + (Number(row[4])||0) + (Number(row[5])||0)
              + (Number(row[6])||0) + (Number(row[7])||0) + (Number(row[8])||0);
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
      journal_no:  row[15] ? row[15].toString().replace("قيد -", "").trim() : null
    });
    if (ok) ledgerCount++;
  });
  Logger.log("✅ دفتر: " + ledgerCount + " سجل");

  ui.alert("✅ اكتملت المزامنة الكاملة\n\nمبيعات: " + salesCount + " سجل\nدفتر: " + ledgerCount + " سجل");
}
