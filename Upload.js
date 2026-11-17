function validateInspectionFile_(file) {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ];

  if (!allowedTypes.includes(file.mimeType)) {
    throw new Error("ชนิดไฟล์นี้ยังไม่รองรับ: " + file.name);
  }

  if (!file.data || !file.name) {
    throw new Error("ข้อมูลไฟล์ไม่ครบถ้วน");
  }

  return true;
}
