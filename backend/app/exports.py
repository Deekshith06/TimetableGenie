from io import BytesIO, StringIO
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import csv as csvlib, json
from openpyxl import Workbook
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import landscape, A4


def rows(p, aa):
    result = [
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
        ]
    ]

    def clock(m):
        return f"{m//60:02}:{m%60:02}"

    for a in sorted(aa, key=lambda a: (a["day"], a["period"], a["event_id"])):
        e = next(e for e in p["events"] if e["id"] == a["event_id"])
        c = next(c for c in p["courses"] if c["id"] == e["course_id"])
        r = next(r for r in p["rooms"] if r["id"] == a["room_id"])
        f = next(f for f in p["faculty"] if f["id"] == a["faculty_id"])
        result.append(
            [
                p["calendar"]["days"][a["day"]],
                clock(p["calendar"]["periods"][a["period"]]["start"]),
                clock(p["calendar"]["periods"][a["period"] + e["duration"] - 1]["end"]),
                c["id"],
                c["title"],
                c["category"],
                e["kind"],
                r["id"],
                f["name"],
                "; ".join(e["group_ids"]),
                str(sum(g["size"] for g in p["groups"] if g["id"] in e["group_ids"])),
                str(r["capacity"]),
            ]
        )
    return result


def safe(s):
    return (
        "'" + str(s) if str(s).startswith(("=", "+", "-", "@", "\t", "\r")) else str(s)
    )


def export(p, r, kind):
    aa = r["assignments"]
    audit = r["audit"]
    rr = rows(p, aa)
    if kind == "json":
        return (
            json.dumps(
                dict(problem=p, result=r, audit=audit), indent=2, ensure_ascii=False
            ).encode(),
            "application/json",
        )
    if kind == "csv":
        out = StringIO()
        writer = csvlib.writer(out)
        writer.writerows([[safe(v) for v in row] for row in rr])
        return ("\ufeff" + out.getvalue()).encode(), "text/csv"
    if kind == "xlsx":
        wb = Workbook()
        ws = wb.active
        ws.title = "Timetable"
        for row in rr:
            ws.append([safe(v) for v in row])
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].width = min(
                45, max(12, max(len(str(c.value or "")) for c in col) + 2)
            )
        ar = wb.create_sheet("Independent Audit")
        ar.append(["Rule", "Check", "Status", "Violations"])
        for rule in audit["rules"]:
            ar.append([rule["id"], rule["label"], rule["status"], rule["violations"]])
        ar.append(["Problem SHA-256", audit["problem_digest"]])
        ar.append(["Schedule SHA-256", audit["schedule_digest"]])
        ar.append(["Signature", audit["signature_status"]])
        out = BytesIO()
        wb.save(out)
        return (
            out.getvalue(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    if kind == "pdf":
        out = BytesIO()
        c = canvas.Canvas(out, pagesize=landscape(A4))
        c.setTitle("TimetableGenie constraint audit")
        y = 565
        lines = (
            [
                "TimetableGenie | Weekly timetable and independent audit",
                p["title"],
                f"{len(aa)} meetings | audit {audit['status']} | {audit['total_violations']} violations",
                "",
            ]
            + ["  ".join([row[i] for i in [0, 1, 2, 3, 6, 7, 8]]) for row in rr]
            + [""]
            + [f"{x['id']} {x['label']}: {x['status']}" for x in audit["rules"]]
            + [
                "",
                audit["problem_digest"],
                audit["schedule_digest"],
                "Unsigned integrity digests; audit covers declared constraints only.",
            ]
        )
        for line in lines:
            if y < 35:
                c.showPage()
                y = 565
            c.setFont("Courier", 8)
            c.drawString(28, y, line[:155])
            y -= 12
        c.save()
        return out.getvalue(), "application/pdf"
    if kind == "ics":

        def escape(s):
            return (
                s.replace("\\", "\\\\")
                .replace("\n", "\\n")
                .replace(",", "\\,")
                .replace(";", "\\;")
            )

        def stamp(day, minute):
            zone = ZoneInfo(p["calendar"]["timezone"])
            wall = datetime.combine(day, datetime.min.time()) + timedelta(
                minutes=minute
            )
            dt = wall.replace(tzinfo=zone)
            utc = dt.astimezone(timezone.utc)
            if utc.astimezone(zone).replace(tzinfo=None) != wall:
                raise ValueError(
                    "Calendar occurrence is nonexistent in its timezone; define a dated exception"
                )
            alternate = wall.replace(tzinfo=zone, fold=1).astimezone(timezone.utc)
            if (
                alternate != utc
                and alternate.astimezone(zone).replace(tzinfo=None) == wall
            ):
                raise ValueError(
                    "Calendar occurrence is ambiguous in its timezone; define a dated exception"
                )
            return utc.strftime("%Y%m%dT%H%M%SZ")

        lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//TimetableGenie//Weekly template 1.0//EN",
            "CALSCALE:GREGORIAN",
        ]
        for a in aa:
            e = next(e for e in p["events"] if e["id"] == a["event_id"])
            c = next(c for c in p["courses"] if c["id"] == e["course_id"])
            first = date.fromisoformat(p["calendar"]["term_start"])
            while first.weekday() != a["day"]:
                first += timedelta(days=1)
            days = []
            cur = first
            while cur <= date.fromisoformat(p["calendar"]["term_end"]):
                if cur.isoformat() not in p["calendar"]["holidays"]:
                    days.append(cur)
                cur += timedelta(days=7)
            if not days:
                continue
            begin = p["calendar"]["periods"][a["period"]]["start"]
            end = p["calendar"]["periods"][a["period"] + e["duration"] - 1]["end"]
            lines.extend(
                [
                    "BEGIN:VEVENT",
                    f"UID:{p['id']}-{e['id']}@timetablegenie",
                    datetime.now(timezone.utc).strftime("DTSTAMP:%Y%m%dT%H%M%SZ"),
                    "DTSTART:" + stamp(days[0], begin),
                    "DTEND:" + stamp(days[0], end),
                    "SUMMARY:" + escape(c["id"] + " " + c["title"]),
                    "LOCATION:" + escape(a["room_id"]),
                    "DESCRIPTION:"
                    + escape(
                        "Timezone "
                        + p["calendar"]["timezone"]
                        + "; weekly template; holidays excluded."
                    ),
                ]
            )
            if len(days) > 1:
                lines.append("RDATE:" + ",".join(stamp(d, begin) for d in days[1:]))
            lines.append("END:VEVENT")
        lines.append("END:VCALENDAR")
        folded = []
        for line in lines:
            part = ""
            size = 0
            for ch in line:
                n = len(ch.encode())
                if size + n > 73:
                    folded.append(part)
                    part = " "
                    size = 1
                part += ch
                size += n
            folded.append(part)
        return ("\r\n".join(folded) + "\r\n").encode(), "text/calendar"
    raise ValueError("Unsupported export format")
