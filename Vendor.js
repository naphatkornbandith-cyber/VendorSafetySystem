
function getVendorPageData() {
  const vendors = getSheetRecords_("Vendors");
  const workTypes = getSheetRecords_("WorkTypes");
  const vendorWorkTypes = getSheetRecords_("Vendor_WorkTypes");

  const activeWorkTypes = workTypes
    .filter(item => item.Is_Active === true)
    .map(item => item.Work_Type_Name);

  const activeVendors = vendors
    .filter(item => item.Is_Active === true)
    .map(item => {
      const selectedTypes = vendorWorkTypes
        .filter(type => type.Company_Name === item.Company_Name)
        .map(type => type.Work_Type_Name);

      return {
        companyName: item.Company_Name,
        workLocation: item.Work_Location,
        workTypes: selectedTypes
      };
    });

  return {
    workTypes: activeWorkTypes,
    vendors: activeVendors
  };
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
