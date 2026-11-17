
function getVendorPageData() {
  const vendors = getSheetRecords_("Vendors");
  const workTypes = getSheetRecords_("WorkTypes");
  const vendorWorkTypes = getSheetRecords_("Vendor_WorkTypes");

  const activeWorkTypes = workTypes
    .filter(item => item.Is_Active === true)
    .map(item => item.Work_Type_Name);

  const vendorList = vendors.map(item => {
    const selectedTypes = vendorWorkTypes
      .filter(type => String(type.Company_Name).trim().toLowerCase() === String(item.Company_Name).trim().toLowerCase())
      .map(type => type.Work_Type_Name);

    return {
      companyName: item.Company_Name,
      workLocation: item.Work_Location,
      workTypes: selectedTypes,
      isActive: item.Is_Active !== false,
      createdAt: item.Created_At ? formatDateText_(item.Created_At) : ""
    };
  });

  return {
    workTypes: activeWorkTypes,
    vendors: vendorList
  };
}


function toggleVendorStatus(companyName) {
  if (!companyName) {
    throw new Error("กรุณาระบุชื่อบริษัท");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet_("Vendors");
    const values = sheet.getDataRange().getValues();
    let targetRow = -1;
    let newStatus = true;

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim().toLowerCase() === String(companyName).trim().toLowerCase()) {
        targetRow = i + 1;
        const currentStatus = values[i][4] !== false;
        newStatus = !currentStatus;
        break;
      }
    }

    if (targetRow === -1) {
      throw new Error("ไม่พบบริษัทในระบบ");
    }

    sheet.getRange(targetRow, 4).setValue(new Date()); // Updated_At
    sheet.getRange(targetRow, 5).setValue(newStatus); // Is_Active
    SpreadsheetApp.flush();

    return {
      success: true,
      message: `เปลี่ยนสถานะบริษัท ${companyName} เป็น ${newStatus ? "เปิดใช้งาน" : "ระงับการใช้งาน"} เรียบร้อยแล้ว`,
      isActive: newStatus
    };
  } finally {
    lock.releaseLock();
  }
}


function updateVendor(formData) {
  if (!formData || !formData.companyName) {
    throw new Error("กรุณาระบุชื่อบริษัทที่ต้องการแก้ไข");
  }

  const companyName = String(formData.companyName).trim();
  const workLocation = String(formData.workLocation || "").trim();
  const selectedTypes = Array.isArray(formData.workTypes)
    ? [...new Set(formData.workTypes)]
    : [];

  if (!workLocation) {
    throw new Error("กรุณาระบุพื้นที่ปฏิบัติงาน");
  }
  if (selectedTypes.length === 0) {
    throw new Error("กรุณาเลือกประเภทงานอย่างน้อย 1 ประเภท");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const vendorsSheet = getSheet_("Vendors");
    const vendorTypesSheet = getSheet_("Vendor_WorkTypes");
    const values = vendorsSheet.getDataRange().getValues();
    let targetRow = -1;

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim().toLowerCase() === companyName.toLowerCase()) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow === -1) {
      throw new Error("ไม่พบบริษัทที่ต้องการแก้ไขในระบบ");
    }

    const now = new Date();
    // Update Work_Location and Updated_At
    vendorsSheet.getRange(targetRow, 2).setValue(workLocation);
    vendorsSheet.getRange(targetRow, 4).setValue(now);

    // Refresh types in Vendor_WorkTypes
    const typeValues = vendorTypesSheet.getDataRange().getValues();
    // Delete existing rows for this vendor in reverse order
    for (let i = typeValues.length - 1; i >= 1; i--) {
      if (String(typeValues[i][0]).trim().toLowerCase() === companyName.toLowerCase()) {
        vendorTypesSheet.deleteRow(i + 1);
      }
    }

    // Insert updated types
    const rows = selectedTypes.map(type => [companyName, type, now]);
    if (rows.length > 0) {
      vendorTypesSheet.getRange(vendorTypesSheet.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
    }

    SpreadsheetApp.flush();

    return {
      success: true,
      message: `อัปเดตข้อมูลบริษัท ${companyName} เรียบร้อยแล้ว`
    };
  } finally {
    lock.releaseLock();
  }
}


function saveVendor(formData) {
  if (!formData) {
    throw new Error("ไม่พบข้อมูลที่ต้องการบันทึก");
  }

  const companyName = String(formData.companyName || "").trim();
  const workLocation = String(formData.workLocation || "").trim();
  const selectedTypes = Array.isArray(formData.workTypes)
    ? [...new Set(formData.workTypes)]
    : [];

  if (!companyName) {
    throw new Error("กรุณากรอกชื่อบริษัท");
  }

  if (!workLocation) {
    throw new Error("กรุณาระบุพื้นที่ปฏิบัติงาน");
  }

  if (selectedTypes.length === 0) {
    throw new Error("กรุณาเลือกประเภทงานอย่างน้อย 1 ประเภท");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const vendorsSheet = getSheet_("Vendors");
    const workTypesSheet = getSheet_("WorkTypes");
    const vendorTypesSheet = getSheet_("Vendor_WorkTypes");

    const validTypes = workTypesSheet
      .getDataRange()
      .getValues()
      .slice(1)
      .filter(row => row[1] === true)
      .map(row => row[0]);

    const invalidTypes = selectedTypes.filter(
      type => !validTypes.includes(type)
    );

    if (invalidTypes.length > 0) {
      throw new Error("พบประเภทงานที่ไม่อยู่ในรายการระบบ");
    }

    const existingVendors = vendorsSheet
      .getDataRange()
      .getValues()
      .slice(1);

    const existing = existingVendors.some(row =>
      String(row[0]).trim().toLowerCase() ===
      companyName.toLowerCase()
    );

    if (existing) {
      throw new Error(
        "มีบริษัทชื่อนี้ในระบบแล้ว กรุณาตรวจสอบรายชื่อบริษัท"
      );
    }

    const now = new Date();

    vendorsSheet.appendRow([
      companyName,
      workLocation,
      now,
      now,
      true
    ]);

    const rows = selectedTypes.map(type => [
      companyName,
      type,
      now
    ]);

    vendorTypesSheet
      .getRange(
        vendorTypesSheet.getLastRow() + 1,
        1,
        rows.length,
        3
      )
      .setValues(rows);

    SpreadsheetApp.flush();

    return {
      success: true,
      message: "บันทึกข้อมูลบริษัทเรียบร้อยแล้ว"
    };

  } finally {
    lock.releaseLock();
  }
}
