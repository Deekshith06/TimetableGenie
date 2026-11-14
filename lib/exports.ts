import { type Problem, type Assignment, type Audit, minutes } from "./domain";

export function scheduleRows(p: Problem, as: Assignment[]): string[][] {
  return [
    [
      "Day",
      "Start",
      "End",
      "Course",
      "Title",
      "Category",
      "Type",
      "Room",
      "Faculty",
      "Pathways",
      "Attendees",
      "Capacity",
    ],
    ...[...as]
      .sort(
        (a, b) =>
          a.day - b.day ||
          a.period - b.period ||
          a.event_id.localeCompare(b.event_id),
      )
      .map((a) => {
        const e = p.events.find((e) => e.id === a.event_id)!;
        const c = p.courses.find((c) => c.id === e.course_id)!;
        const r = p.rooms.find((r) => r.id === a.room_id)!;
        return [
          p.calendar.days[a.day],
          minutes(p.calendar.periods[a.period].start),
          minutes(p.calendar.periods[a.period + e.duration - 1].end),
          c.id,
          c.title,
          c.category,
          e.kind,
          r.id,
          p.faculty.find((f) => f.id === a.faculty_id)!.name,
          e.group_ids.join("; "),
          String(
            e.group_ids.reduce(
              (n, g) => n + p.groups.find((x) => x.id === g)!.size,
              0,
            ),
          ),
          String(r.capacity),
        ];
      }),
  ];
}
const enc = new TextEncoder();
const sanitize = (s: string) => (/^[=+\-@\t\r]/.test(s) ? "'" + s : s);
export function csv(p: Problem, as: Assignment[]) {
  return (
    "\uFEFF" +
    scheduleRows(p, as)
      .map((row) =>
        row.map((s) => '"' + sanitize(s).replace(/"/g, '""') + '"').join(","),
      )
      .join("\r\n")
  );
}
const xml = (s: string) =>
  sanitize(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
function crc32(a: Uint8Array) {
  let c = 0xffffffff;
  for (const b of a) {
    c ^= b;
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function zip(files: Record<string, string>): Uint8Array {
  const chunks: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const n = enc.encode(name),
      data = enc.encode(content),
      crc = crc32(data),
      h = new Uint8Array(30 + n.length),
      v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, n.length, true);
    h.set(n, 30);
    chunks.push(h, data);
    const c = new Uint8Array(46 + n.length),
      cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, offset, true);
    c.set(n, 46);
    central.push(c);
    offset += h.length + data.length;
  }
  const end = new Uint8Array(22),
    ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(
    12,
    central.reduce((n, c) => n + c.length, 0),
    true,
  );
  ev.setUint32(16, offset, true);
  const all = [...chunks, ...central, end],
    out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
function sheet(rows: string[][]) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    rows
      .map(
        (row, i) =>
          `<row r="${i + 1}">${row.map((s) => `<c t="inlineStr"><is><t xml:space="preserve">${xml(s)}</t></is></c>`).join("")}</row>`,
      )
      .join("") +
    "</sheetData></worksheet>"
  );
}
export function xlsx(p: Problem, as: Assignment[], audit: Audit) {
  return zip({
    "[Content_Types].xml":
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Timetable" sheetId="1" r:id="rId1"/><sheet name="Independent Audit" sheetId="2" r:id="rId2"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": sheet(scheduleRows(p, as)),
    "xl/worksheets/sheet2.xml": sheet([
      ["Rule", "Check", "Status", "Violations"],
      ...audit.rules.map((r) => [
        r.id,
        r.label,
        r.status,
        String(r.violations),
      ]),
      ["Problem SHA-256", audit.problem_digest],
      ["Schedule SHA-256", audit.schedule_digest],
      ["Integrity", audit.signature_status],
    ]),
  });
}
export function pdf(p: Problem, as: Assignment[], audit: Audit) {
  const lines = [
    "TimetableGenie | Independent constraint audit",
    p.title,
    `${as.length} meetings | Audit ${audit.status} | ${audit.total_violations} violations`,
    "Weekly template; dates/holidays appear in the iCalendar export.",
    "",
    ...scheduleRows(p, as).map((r) =>
      [r[0].slice(0, 3), r[1], r[2], r[3], r[6], r[7], r[8]].join("  "),
    ),
    "",
    ...audit.rules.map(
      (r) => `${r.id} ${r.label}: ${r.status} (${r.violations})`,
    ),
    "",
    `Problem SHA-256: ${audit.problem_digest}`,
    `Schedule SHA-256: ${audit.schedule_digest}`,
    "Unsigned integrity digests. Passing audit covers the declared model only.",
  ];
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 43) pages.push(lines.slice(i, i + 43));
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
  for (let i = 0; i < pages.length; i++) {
    const text = pages[i].map((l) =>
      l
        .replace(/[^\x20-\x7e]/g, " ")
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)")
        .slice(0, 150),
    );
    const stream = `BT /F1 8 Tf 12 TL 28 555 Td ${text.map((l) => `(${l}) Tj T*`).join("\n")} ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    );
    objects.push(
      `<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}\nendstream`,
    );
  }
  let out = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(enc.encode(out).length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = enc.encode(out).length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return enc.encode(out);
}
const icalEscape = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
export function ics(p: Problem, assignments: Assignment[]) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: p.calendar.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const utcEpoch = (y: number, m: number, d: number, h: number, n: number) => {
    const result = new Date(0);
    result.setUTCFullYear(y, m - 1, d);
    result.setUTCHours(h, n, 0, 0);
    return result.getTime();
  };
  const localEpoch = (utc: number) => {
    const v = Object.fromEntries(
      formatter
        .formatToParts(new Date(utc))
        .filter((x) => x.type !== "literal")
        .map((x) => [x.type, Number(x.value)]),
    );
    return utcEpoch(v.year, v.month, v.day, v.hour, v.minute);
  };
  const stamp = (date: string, minute: number) => {
    const [y, m, d] = date.split("-").map(Number),
      target = utcEpoch(y, m, d, Math.floor(minute / 60), minute % 60);
    let guess = target;
    for (let i = 0; i < 5; i++) guess += target - localEpoch(guess);
    if (localEpoch(guess) !== target)
      throw new Error(
        `Calendar occurrence ${date} ${minutes(minute)} does not exist in ${p.calendar.timezone}; define a dated exception first.`,
      );
    const matches = new Set<number>();
    for (let offset = -120; offset <= 120; offset += 15) {
      const t = guess + offset * 60000;
      if (localEpoch(t) === target) matches.add(t);
    }
    if (matches.size !== 1)
      throw new Error(
        `Calendar occurrence ${date} ${minutes(minute)} is ambiguous in ${p.calendar.timezone}; define a timezone exception first.`,
      );
    return new Date(guess)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  };
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TimetableGenie//Weekly template 1.0//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const a of assignments) {
    const e = p.events.find((e) => e.id === a.event_id)!,
      course = p.courses.find((c) => c.id === e.course_id)!;
    const first = new Date(p.calendar.term_start + "T00:00:00Z");
    while ((first.getUTCDay() + 6) % 7 !== a.day)
      first.setUTCDate(first.getUTCDate() + 1);
    const days: string[] = [];
    for (
      const day = new Date(first);
      day.toISOString().slice(0, 10) <= p.calendar.term_end;
      day.setUTCDate(day.getUTCDate() + 7)
    ) {
      const value = day.toISOString().slice(0, 10);
      if (!p.calendar.holidays.includes(value)) days.push(value);
    }
    if (!days.length) continue;
    const start = p.calendar.periods[a.period].start,
      end = p.calendar.periods[a.period + e.duration - 1].end;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${p.id}-${e.id}@timetablegenie`,
      `DTSTAMP:${new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z")}`,
      `DTSTART:${stamp(days[0], start)}`,
      `DTEND:${stamp(days[0], end)}`,
      `SUMMARY:${icalEscape(course.id + " " + course.title)}`,
      `LOCATION:${icalEscape(a.room_id)}`,
      `DESCRIPTION:${icalEscape("Timezone " + p.calendar.timezone + "; weekly template; holidays excluded.")}`,
    );
    if (days.length > 1)
      lines.push(
        "RDATE:" +
          days
            .slice(1)
            .map((day) => stamp(day, start))
            .join(","),
      );
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return (
    lines
      .map((line) => {
        let out = "",
          bytes = 0;
        for (const ch of line) {
          const length = enc.encode(ch).length;
          if (bytes + length > 73) {
            out += "\r\n ";
            bytes = 1;
          }
          out += ch;
          bytes += length;
        }
        return out;
      })
      .join("\r\n") + "\r\n"
  );
}
