// ==========================================
// Module: Work Permit, Document & Archives
// ==========================================

function ensurePermitSheet_() {
  const ss = getDatabase_();
  let sheet = ss.getSheetByName("WorkPermits");

  if (!sheet) {
    sheet = ss.insertSheet("WorkPermits");
    const headers = [
      "Permit_No",
      "Company_Name",
      "Work_Location",
      "Work_Type",
      "Start_Date",
      "End_Date",
      "Supervisor_Name",
      "Safety_Officer",
      "Status",
      "Safety_Notes",
      "Created_At"
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    formatHeader_(sheet, headers.length);
  }

  return sheet;
}


function getWorkPermitData() {
  const vendors = getSheetRecords_("Vendors");
  const workTypes = getSheetRecords_("WorkTypes");
  const activeVendors = vendors.filter(v => v.Is_Active === true);
  const activeWorkTypes = workTypes.filter(w => w.Is_Active === true).map(w => w.Work_Type_Name);

  let permits = [];
  try {
    permits = getSheetRecords_("WorkPermits");
  } catch (e) {
    permits = [];
  }

  // Format permits list
  const permitList = permits.map(item => ({
    permitNo: item.Permit_No,
    companyName: item.Company_Name,
    workLocation: item.Work_Location,
    workType: item.Work_Type,
    startDate: item.Start_Date ? formatDateText_(item.Start_Date) : "",
    endDate: item.End_Date ? formatDateText_(item.End_Date) : "",
    supervisorName: item.Supervisor_Name || "-",
    safetyOfficer: item.Safety_Officer || "-",
    status: item.Status || "Active",
    safetyNotes: item.Safety_Notes || "",
    createdAt: item.Created_At ? formatDateText_(item.Created_At) : ""
  })).reverse();

  return {
    vendors: activeVendors.map(v => v.Company_Name),
    workTypes: activeWorkTypes,
    permits: permitList
  };
}


function saveWorkPermit(formData) {
  if (!formData) throw new Error("ไม่พบข้อมูลใบอนุญาตทำงาน");

  const companyName = String(formData.companyName || "").trim();
  const workLocation = String(formData.workLocation || "").trim();
  const workType = String(formData.workType || "").trim();
  const startDate = String(formData.startDate || "").trim();
  const endDate = String(formData.endDate || "").trim();
  const supervisor = String(formData.supervisorName || "").trim();
  const safetyOfficer = String(formData.safetyOfficer || "").trim();
  const safetyNotes = String(formData.safetyNotes || "").trim();

  if (!companyName) throw new Error("กรุณาเลือกบริษัท");
  if (!workLocation) throw new Error("กรุณาระบุพื้นที่ปฏิบัติงาน");
  if (!workType) throw new Error("กรุณาเลือกประเภทงาน");
  if (!startDate || !endDate) throw new Error("กรุณาระบุช่วงวันที่อนุญาตให้ถูกต้อง");

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const sheet = ensurePermitSheet_();
    const lastRow = sheet.getLastRow();
    const now = new Date();
    const datePrefix = Utilities.formatDate(now, "Asia/Bangkok", "yyyyMM");
    const permitNo = "WP-" + datePrefix + "-" + String(lastRow).padStart(3, "0");

    const rowData = [
      permitNo,
      companyName,
      workLocation,
      workType,
      parseLocalDate_(startDate),
      parseLocalDate_(endDate),
      supervisor,
      safetyOfficer,
      "Active",
      safetyNotes,
      now
    ];

    sheet.appendRow(rowData);
    SpreadsheetApp.flush();

    return {
      success: true,
      message: `ออกใบอนุญาตทำงานเลขที่ ${permitNo} เรียบร้อยแล้ว`,
      permitNo: permitNo
    };
  } finally {
    lock.releaseLock();
  }
}


function updatePermitStatus(permitNo, newStatus) {
  if (!permitNo || !newStatus) throw new Error("ข้อมูลไม่ครบถ้วน");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = ensurePermitSheet_();
    const values = sheet.getDataRange().getValues();
    let targetRow = -1;

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim() === String(permitNo).trim()) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow === -1) throw new Error("ไม่พบใบอนุญาตทำงานเลขที่นี้");

    sheet.getRange(targetRow, 9).setValue(newStatus);
    SpreadsheetApp.flush();

    return {
      success: true,
      message: `อัปเดตสถานะใบอนุญาต ${permitNo} เป็น ${newStatus} เรียบร้อยแล้ว`
    };
  } finally {
    lock.releaseLock();
  }
}


function getAllDocuments(filters) {
  const options = filters || {};
  let files = [];
  try {
    files = getSheetRecords_("Inspection_Files");
  } catch (e) {
    files = [];
  }

  let filtered = files;

  if (options.companyName) {
    const q = options.companyName.toLowerCase().trim();
    filtered = filtered.filter(f => String(f.Company_Name).toLowerCase().includes(q));
  }

  if (options.fileType) {
    filtered = filtered.filter(f => f.File_Type === options.fileType);
  }

  filtered.sort((a, b) => {
    const da = a.Uploaded_At ? formatDateText_(a.Uploaded_At) : "";
    const db = b.Uploaded_At ? formatDateText_(b.Uploaded_At) : "";
    return db.localeCompare(da);
  });

  return filtered.map(item => ({
    companyName: item.Company_Name,
    inspectionDate: formatDateText_(item.Inspection_Date),
    period: item.Inspection_Period,
    fileType: item.File_Type,
    fileName: item.File_Name,
    driveId: item.Drive_File_ID,
    fileUrl: item.File_URL,
    uploadedAt: item.Uploaded_At ? formatDateText_(item.Uploaded_At) : ""
  }));
}


function getDepartmentArchives() {
  const vendors = getSheetRecords_("Vendors");
  const inspections = getSheetRecords_("Inspections");
  const files = getSheetRecords_("Inspection_Files");

  let permits = [];
  try {
    permits = getSheetRecords_("WorkPermits");
  } catch (e) {
    permits = [];
  }

  // Group by vendor
  return vendors.map(vendor => {
    const company = vendor.Company_Name;
    const vInspections = inspections.filter(i => String(i.Company_Name).trim().toLowerCase() === String(company).trim().toLowerCase());
    const vFiles = files.filter(f => String(f.Company_Name).trim().toLowerCase() === String(company).trim().toLowerCase());
    const vPermits = permits.filter(p => String(p.Company_Name).trim().toLowerCase() === String(company).trim().toLowerCase());

    const passCount = vInspections.filter(i => i.Inspection_Result === "ผ่าน").length;
    const total = vInspections.length;
    const passRate = total > 0 ? Math.round((passCount / total) * 100) : 100;

    return {
      companyName: company,
      workLocation: vendor.Work_Location,
      isActive: vendor.Is_Active !== false,
      totalInspections: total,
      passCount: passCount,
      failCount: vInspections.filter(i => i.Inspection_Result === "ไม่ผ่าน").length,
      improveCount: vInspections.filter(i => i.Inspection_Result === "ต้องปรับปรุง").length,
      passRate: passRate,
      documentCount: vFiles.length,
      permitCount: vPermits.length,
      lastInspectionDate: vInspections.length > 0 ? formatDateText_(vInspections[vInspections.length - 1].Inspection_Date) : "-"
    };
  });
}

