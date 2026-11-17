
function getInspectionFormData() {
  const vendors = getSheetRecords_("Vendors");
  const workTypes = getSheetRecords_("Vendor_WorkTypes");

  return vendors
    .filter(vendor => vendor.Is_Active === true)
    .map(vendor => ({
      companyName: vendor.Company_Name,
      workLocation: vendor.Work_Location,
      workTypes: workTypes
        .filter(item => item.Company_Name === vendor.Company_Name)
        .map(item => item.Work_Type_Name)
    }));
}


function saveInspection(formData) {
  if (!formData) {
    throw new Error("ไม่พบข้อมูลการตรวจ");
  }

  const companyName = String(formData.companyName || "").trim();
  const dateText = String(formData.inspectionDate || "");
  const period = String(formData.period || "");
  const checkIn = String(formData.checkIn || "");
  const checkOut = String(formData.checkOut || "");
  const result = String(formData.result || "");
  const remarks = String(formData.remarks || "").trim();

  const allowedPeriods = ["Morning", "Afternoon"];
  const allowedResults = ["ผ่าน", "ต้องปรับปรุง", "ไม่ผ่าน"];

  if (!companyName) throw new Error("กรุณาเลือกบริษัท");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    throw new Error("กรุณาเลือกวันที่ตรวจให้ถูกต้อง");
  }
  if (!allowedPeriods.includes(period)) {
    throw new Error("กรุณาเลือกช่วงเวลาตรวจ");
  }
  if (!checkIn) throw new Error("กรุณาระบุเวลาเข้าตรวจ");
  if (!allowedResults.includes(result)) {
    throw new Error("กรุณาเลือกผลการตรวจ");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const vendors = getSheetRecords_("Vendors");
    const vendorExists = vendors.some(v =>
      v.Is_Active === true && v.Company_Name === companyName
    );

    if (!vendorExists) {
      throw new Error("ไม่พบบริษัทนี้ในทะเบียน หรือบริษัทถูกปิดใช้งาน");
    }

    const inspectionDate = parseLocalDate_(dateText);
    const inspectionsSheet = getSheet_("Inspections");
    const values = inspectionsSheet.getDataRange().getValues();

    // หนึ่งบริษัทต่อหนึ่งวันที่และหนึ่งช่วงเวลา
    // หากบันทึกซ้ำ จะปรับปรุงรายการเดิมและเพิ่มไฟล์แนบเข้าไป
    let targetRow = -1;

    for (let i = 1; i < values.length; i++) {
      const rowDate = values[i][1];
      const sameDate = rowDate instanceof Date
        ? Utilities.formatDate(
            rowDate,
            "Asia/Bangkok",
            "yyyy-MM-dd"
          ) === dateText
        : String(rowDate) === dateText;

      if (
        String(values[i][0]) === companyName &&
        sameDate &&
        String(values[i][2]) === period
      ) {
        targetRow = i + 1;
        break;
      }
    }

    const now = new Date();

    const rowData = [
      companyName,
      inspectionDate,
      period,
      checkIn,
      checkOut,
      result,
      remarks,
      now
    ];

    if (targetRow > 0) {
      const originalCreatedAt = inspectionsSheet
        .getRange(targetRow, 8)
        .getValue();

      rowData[7] = originalCreatedAt || now;

      inspectionsSheet
        .getRange(targetRow, 1, 1, rowData.length)
        .setValues([rowData]);
    } else {
      inspectionsSheet.appendRow(rowData);
    }

    const files = Array.isArray(formData.files)
      ? formData.files
      : [];

    const savedFiles = [];

    if (files.length > 0) {
      const props = PropertiesService.getScriptProperties();
      const folderId = props.getProperty(
        "FOLDER_02_Inspection_Evidence"
      );

      if (!folderId) {
        throw new Error("ไม่พบโฟลเดอร์จัดเก็บหลักฐานใน Google Drive");
      }

      const parentFolder = DriveApp.getFolderById(folderId);

      const folderName = [
        dateText,
        safeFolderName_(companyName),
        period
      ].join("_");

      const inspectionFolder = getOrCreateFolder_(
        parentFolder,
        folderName
      );

      const fileRows = [];

      files.forEach(file => {
        validateInspectionFile_(file);
        if (!file.name || !file.data || !file.fileType) {
          throw new Error("ข้อมูลไฟล์แนบไม่ครบถ้วน");
        }

        if (file.data.length > 5 * 1024 * 1024 * 1.4) {
          throw new Error(
            "ไฟล์ " + file.name + " มีขนาดเกิน 5 MB"
          );
        }

        const base64 = String(file.data).split(",").pop();
        const bytes = Utilities.base64Decode(base64);

        if (bytes.length > 5 * 1024 * 1024) {
          throw new Error(
            "ไฟล์ " + file.name + " มีขนาดเกิน 5 MB"
          );
        }

        const blob = Utilities.newBlob(
          bytes,
          file.mimeType || "application/octet-stream",
          file.name
        );

        const driveFile = inspectionFolder.createFile(blob);

        savedFiles.push(driveFile.getId());

        fileRows.push([
          companyName,
          inspectionDate,
          period,
          file.fileType,
          file.name,
          driveFile.getId(),
          driveFile.getUrl(),
          now
        ]);
      });

      if (fileRows.length > 0) {
        const fileSheet = getSheet_("Inspection_Files");

        fileSheet
          .getRange(
            fileSheet.getLastRow() + 1,
            1,
            fileRows.length,
            8
          )
          .setValues(fileRows);
      }
    }

    SpreadsheetApp.flush();

    return {
      success: true,
      message: targetRow > 0
        ? "ปรับปรุงรายการตรวจและเพิ่มไฟล์แนบเรียบร้อยแล้ว"
        : "บันทึกการตรวจเรียบร้อยแล้ว",
      fileCount: savedFiles.length
    };

  } finally {
    lock.releaseLock();
  }
}


function parseLocalDate_(dateText) {
  const parts = dateText.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}


function safeFolderName_(name) {
  return String(name)
    .replace(/[\\/:*?"<>|#%{}~&]/g, "_")
    .substring(0, 80);
}
