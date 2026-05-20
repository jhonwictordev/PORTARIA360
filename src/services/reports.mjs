function withinRange(dateIso, startDate, endDate) {
  const value = new Date(dateIso).getTime();
  if (startDate && value < new Date(startDate).getTime()) return false;
  if (endDate && value > new Date(endDate).getTime()) return false;
  return true;
}

export function filterTenantRecords(records, tenantId, { startDate, endDate, unitId, userType } = {}) {
  return records.filter((record) => {
    if (record.tenantId !== tenantId) return false;
    if (unitId && record.unitId !== unitId) return false;
    if (userType && record.userType !== userType && record.type !== userType) return false;
    const eventDate = record.createdAt ?? record.scheduledStartAt ?? record.validFrom;
    return withinRange(eventDate, startDate, endDate);
  });
}

export function buildFlowReport(accessEvents, tenantId, filters = {}) {
  const rows = filterTenantRecords(accessEvents, tenantId, filters);
  const summary = {
    total: rows.length,
    allowed: rows.filter((row) => row.status === "allowed").length,
    denied: rows.filter((row) => row.status === "denied").length,
    flagged: rows.filter((row) => row.status === "flagged").length
  };

  const byType = Object.entries(
    rows.reduce((acc, row) => {
      acc[row.userType] = (acc[row.userType] ?? 0) + 1;
      return acc;
    }, {})
  ).map(([key, value]) => ({ key, value }));

  const byHour = Object.entries(
    rows.reduce((acc, row) => {
      const hour = new Date(row.createdAt).getHours().toString().padStart(2, "0");
      acc[hour] = (acc[hour] ?? 0) + 1;
      return acc;
    }, {})
  )
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([hour, value]) => ({ hour, value }));

  return { filters, summary, byType, byHour, rows };
}

export function toCsv(rows, columns) {
  const header = columns.map((column) => column.label).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((column) => {
          const raw = row[column.key] ?? "";
          const value = String(raw).replace(/"/g, '""');
          return `"${value}"`;
        })
        .join(",")
    )
    .join("\n");
  return `${header}\n${body}`;
}

function escapePdfText(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildSimplePdf(title, lines) {
  const contentLines = [
    "BT",
    "/F1 18 Tf",
    "50 760 Td",
    `(${escapePdfText(title)}) Tj`,
    "/F1 11 Tf",
    ...lines.flatMap((line, index) => [`50 ${730 - index * 18} Td`, `(${escapePdfText(line)}) Tj`]),
    "ET"
  ];

  const stream = contentLines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}
