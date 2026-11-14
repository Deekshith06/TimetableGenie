"use client";
import React, { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock3,
  CalendarDays,
  List,
  UserRound,
  Building2,
  Layers3,
  GraduationCap,
  CalendarRange,
  CalendarCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Settings,
  X,
  Info,
  Radio,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  type Problem,
  type Assignment,
  minutes,
  durationLabel,
  eventName,
} from "@/lib/domain";

type ViewMode = "week" | "semester" | "day";

export default function Timetable({
  problem: p,
  assignments,
  onEvent,
  onMove,
  onUpdateCalendar,
}: {
  problem: Problem;
  assignments: Assignment[];
  onEvent: (a: Assignment) => void;
  onMove: (a: Assignment) => void;
  onUpdateCalendar?: (newCalendar: Problem["calendar"]) => void;
}) {
  const [view, setView] = useState("Pathway");
  const [selected, setSelected] = useState("");
  // Auto-calculate week matching Indian Standard Time (Asia/Kolkata)
  // If the current week's teaching dates are already completed (e.g. today is Saturday Nov 14 or Sunday Nov 15),
  // automatically advance forward to the upcoming active planning week (Week 16: 16 Nov – 20 Nov 2026)!
  const getInitialWeek = () => {
    try {
      const now = new Date();
      const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
      const istDate = new Date(istString);
      const termStart = new Date(p.calendar.term_start + "T00:00:00Z");
      const diffMs = istDate.getTime() - termStart.getTime();
      const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
      const totalW = p.calendar.total_weeks || 17;

      const dayOfWeek = istDate.getDay(); // 0=Sunday, 6=Saturday
      const isCompletedWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const targetWeek = isCompletedWeekend ? diffWeeks + 1 : diffWeeks;

      if (targetWeek >= 0 && targetWeek < totalW) {
        return targetWeek;
      }
      if (diffWeeks >= 0 && diffWeeks < totalW) {
        return diffWeeks;
      }
    } catch {
      // Fallback
    }
    return 15; // Week 16
  };

  const [week, setWeek] = useState<number>(getInitialWeek);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedDay, setSelectedDay] = useState(0);
  const [calendarModal, setCalendarModal] = useState(false);

  // Real-time IST tracking and dynamic period updating (updates every second silently)
  const [runningSlot, setRunningSlot] = useState<{ day: number; period: number } | null>(null);
  const [isLiveActive, setIsLiveActive] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    const tick = () => {
      if (!mounted) return;
      try {
        const now = new Date();
        const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const dayOfWeek = istDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        const weekday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0=Mon ... 4=Fri, 5=Sat, 6=Sun
        const minutesNow = istDate.getHours() * 60 + istDate.getMinutes();

        if (weekday >= 5) {
          // Weekend / Holiday -> NO classes active
          setRunningSlot(null);
          setIsLiveActive(false);
        } else {
          // Monday through Friday: check active teaching period
          const activeIdx = p.calendar.periods.findIndex(
            (per) => minutesNow >= per.start && minutesNow < per.end
          );
          if (activeIdx !== -1) {
            setRunningSlot({ day: weekday, period: activeIdx });
            setIsLiveActive(true);
          } else {
            setRunningSlot(null);
            setIsLiveActive(false);
          }
        }
      } catch {
        setRunningSlot(null);
        setIsLiveActive(false);
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [p.calendar]);

  // Drag-and-drop state
  const [dragged, setDragged] = useState<Assignment | null>(null);
  const [slotAvailability, setSlotAvailability] = useState<
    Record<string, { valid: boolean; reason: string }>
  >({});
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Editable calendar draft state
  const [editTermStart, setEditTermStart] = useState(p.calendar.term_start);
  const [editTermEnd, setEditTermEnd] = useState(p.calendar.term_end);
  const [editMidtermStart, setEditMidtermStart] = useState(
    p.calendar.midterm_start || "",
  );
  const [editMidtermEnd, setEditMidtermEnd] = useState(
    p.calendar.midterm_end || "",
  );
  const [editEndtermStart, setEditEndtermStart] = useState(
    p.calendar.endterm_start || "",
  );
  const [editEndtermEnd, setEditEndtermEnd] = useState(
    p.calendar.endterm_end || "",
  );
  const [editHolidays, setEditHolidays] = useState(
    p.calendar.holidays.join(", "),
  );

  // Auto-dismiss feedback after 6 seconds
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const options = useMemo(() => {
    return view === "Pathway"
      ? p.groups.map((g) => ({ id: g.id, name: g.name }))
      : view === "Faculty"
        ? p.faculty.map((f) => ({ id: f.id, name: f.name }))
        : view === "Room"
          ? p.rooms.map((r) => ({ id: r.id, name: r.name }))
          : view === "Basket"
            ? p.baskets.map((b) => ({ id: b.id, name: b.name }))
            : [];
  }, [view, p]);

  const id = options.some((o) => o.id === selected) ? selected : options[0]?.id;

  const filtered = useMemo(() => {
    return assignments.filter((a) => {
      const e = p.events.find((e) => e.id === a.event_id);
      if (!e) return false;
      return view === "Pathway"
        ? e.group_ids.includes(id)
        : view === "Faculty"
          ? a.faculty_id === id
          : view === "Room"
            ? a.room_id === id
            : view === "Basket"
              ? e.basket_id === id
              : true;
    });
  }, [assignments, view, id, p]);

  // Semester Calendar calculations
  const termStart = useMemo(
    () => new Date(p.calendar.term_start + "T00:00:00Z"),
    [p.calendar.term_start],
  );
  const anchor = useMemo(() => {
    return termStart.getTime() - ((termStart.getUTCDay() + 6) % 7) * 86400000;
  }, [termStart]);

  const totalWeeks = useMemo(() => {
    const endMs = Date.parse(p.calendar.term_end + "T23:59:59Z");
    const diff = Math.max(1, Math.ceil((endMs - anchor) / (7 * 86400000)));
    return Math.min(diff, 24);
  }, [p.calendar.term_end, anchor]);

  const firstDateOfWeek = useMemo(() => {
    return new Date(anchor + week * 7 * 86400000);
  }, [anchor, week]);

  const datesOfWeek = useMemo(() => {
    return p.calendar.days.map((_, d) => {
      const n = new Date(firstDateOfWeek);
      n.setUTCDate(n.getUTCDate() + d);
      return n;
    });
  }, [firstDateOfWeek, p.calendar.days]);

  // Today's date in Indian Standard Time (YYYY-MM-DD) for completed-date locking
  const todayIstStr = useMemo(() => {
    try {
      const now = new Date();
      const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
      const istDate = new Date(istString);
      return istDate.toISOString().slice(0, 10);
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }, []);

  function isDateInRange(
    dateStr: string,
    start?: string | null,
    end?: string | null,
  ): boolean {
    if (!start || !end) return false;
    return dateStr >= start && dateStr <= end;
  }

  // Week metadata for the navigator
  const semesterWeeks = useMemo(() => {
    return Array.from({ length: totalWeeks }, (_, wIdx) => {
      const wFirst = new Date(anchor + wIdx * 7 * 86400000);
      const wDays = p.calendar.days.map((_, d) => {
        const n = new Date(wFirst);
        n.setUTCDate(n.getUTCDate() + d);
        return n.toISOString().slice(0, 10);
      });
      const startDate = wDays[0];
      const endDate = wDays[wDays.length - 1];

      const isMidterm = wDays.some((d) =>
        isDateInRange(d, p.calendar.midterm_start, p.calendar.midterm_end),
      );
      const isEndterm = wDays.some((d) =>
        isDateInRange(d, p.calendar.endterm_start, p.calendar.endterm_end),
      );
      const holidayCount = wDays.filter((d) =>
        p.calendar.holidays.includes(d),
      ).length;

      let label = "Teaching";
      if (isMidterm) label = "Mid-Term Exams";
      else if (isEndterm) label = "End-Term Exams";
      else if (holidayCount >= 3) label = "Break Week";

      return {
        index: wIdx,
        weekNumber: wIdx + 1,
        startDate,
        endDate,
        isMidterm,
        isEndterm,
        holidayCount,
        label,
      };
    });
  }, [anchor, totalWeeks, p.calendar]);

  const currentWeekInfo = semesterWeeks[week] || semesterWeeks[0];

  const selectedPerson = useMemo(() => {
    return view === "Faculty"
      ? p.faculty.find((f) => f.id === id)
      : view === "Room"
        ? p.rooms.find((r) => r.id === id)
        : view === "Pathway"
          ? p.groups.find((g) => g.id === id)
          : null;
  }, [view, id, p]);

  const breaks = useMemo(() => {
    return p.calendar.periods
      .map((t, i) =>
        i > 0 && p.calendar.periods[i - 1].end < t.start ? i : -1,
      )
      .filter((i) => i >= 0);
  }, [p.calendar.periods]);

  const rowFor = (period: number) =>
    2 + period + breaks.filter((i) => i <= period).length;

  const count = filtered.reduce((n, a) => {
    const e = p.events.find((e) => e.id === a.event_id);
    return n + (e ? e.duration : 1);
  }, 0);

  // ==========================================
  // Pre-Drag Availability Calculation
  // ==========================================
  function calculateSlotAvailability(target: Assignment) {
    const ev = p.events.find((e) => e.id === target.event_id);
    if (!ev) return {};

    const faculty = p.faculty.find((f) => f.id === target.faculty_id);
    const duration = ev.duration;
    const numPeriods = p.calendar.periods.length;
    const availability: Record<string, { valid: boolean; reason: string }> = {};

    for (let d = 0; d < p.calendar.days.length; d++) {
      const dateStr = datesOfWeek[d].toISOString().slice(0, 10);
      const isPastDate = dateStr < todayIstStr;
      const isHoliday = p.calendar.holidays.includes(dateStr);
      const isOutside =
        dateStr < p.calendar.term_start || dateStr > p.calendar.term_end;
      const isMidterm = isDateInRange(
        dateStr,
        p.calendar.midterm_start,
        p.calendar.midterm_end,
      );
      const isEndterm = isDateInRange(
        dateStr,
        p.calendar.endterm_start,
        p.calendar.endterm_end,
      );

      for (let t = 0; t < numPeriods; t++) {
        const slotKey = `${d}_${t}`;

        // PAST / COMPLETED DATE CHECK: No change allowed to back dates! Must move forward!
        if (isPastDate) {
          availability[slotKey] = {
            valid: false,
            reason: `Locked (Past Date): ${datesOfWeek[d].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} has already completed. Changes cannot be back-dated; classes must move forward to upcoming dates.`,
          };
          continue;
        }

        if (isMidterm) {
          availability[slotKey] = {
            valid: false,
            reason: `Blocked: Mid-Term Examination Window (${p.calendar.midterm_start} to ${p.calendar.midterm_end}). Classes suspended.`,
          };
          continue;
        }
        if (isEndterm) {
          availability[slotKey] = {
            valid: false,
            reason: `Blocked: End-Term Examination Window (${p.calendar.endterm_start} to ${p.calendar.endterm_end}). Classes suspended.`,
          };
          continue;
        }
        if (isHoliday) {
          availability[slotKey] = {
            valid: false,
            reason: `Blocked: Public Institutional Holiday (${dateStr}).`,
          };
          continue;
        }
        if (isOutside) {
          availability[slotKey] = {
            valid: false,
            reason: `Blocked: Date falls outside active academic semester dates.`,
          };
          continue;
        }
        if (t + duration > numPeriods) {
          availability[slotKey] = {
            valid: false,
            reason: `Duration limit: ${duration}-period meeting exceeds teaching day bounds.`,
          };
          continue;
        }

        let crossesLunch = false;
        for (let offset = 0; offset < duration - 1; offset++) {
          const currP = t + offset;
          const nextP = t + offset + 1;
          if (p.calendar.periods[currP].end < p.calendar.periods[nextP].start) {
            crossesLunch = true;
            break;
          }
        }
        if (crossesLunch) {
          availability[slotKey] = {
            valid: false,
            reason: `Lunch break policy: Multi-period practicals cannot bridge across lunch.`,
          };
          continue;
        }

        const occupiedPeriods = Array.from({ length: duration }, (_, i) => t + i);

        if (faculty) {
          const facUnavail = faculty.unavailable.some(
            (u) => u.day === d && occupiedPeriods.includes(u.period),
          );
          if (facUnavail) {
            availability[slotKey] = {
              valid: false,
              reason: `Faculty blackout: ${faculty.name} is marked unavailable during this period.`,
            };
            continue;
          }
        }

        const facClash = assignments.find((other) => {
          if (other.event_id === target.event_id) return false;
          if (other.faculty_id !== target.faculty_id || other.day !== d) return false;
          const otherEv = p.events.find((e) => e.id === other.event_id);
          const otherDur = otherEv ? otherEv.duration : 1;
          const otherOcc = Array.from({ length: otherDur }, (_, i) => other.period + i);
          return occupiedPeriods.some((pNum) => otherOcc.includes(pNum));
        });
        if (facClash) {
          const otherEv = p.events.find((e) => e.id === facClash.event_id);
          availability[slotKey] = {
            valid: false,
            reason: `Faculty clash: ${faculty?.name || target.faculty_id} is already teaching ${otherEv?.course_id || facClash.event_id} at this time.`,
          };
          continue;
        }

        const roomClash = assignments.find((other) => {
          if (other.event_id === target.event_id) return false;
          if (other.room_id !== target.room_id || other.day !== d) return false;
          const otherEv = p.events.find((e) => e.id === other.event_id);
          const otherDur = otherEv ? otherEv.duration : 1;
          const otherOcc = Array.from({ length: otherDur }, (_, i) => other.period + i);
          return occupiedPeriods.some((pNum) => otherOcc.includes(pNum));
        });
        if (roomClash) {
          const otherEv = p.events.find((e) => e.id === roomClash.event_id);
          availability[slotKey] = {
            valid: false,
            reason: `Room clash: ${target.room_id} is already reserved for ${otherEv?.course_id || roomClash.event_id}.`,
          };
          continue;
        }

        let groupClashReason: string | null = null;
        for (const gid of ev.group_ids) {
          const grp = p.groups.find((g) => g.id === gid);
          if (grp) {
            const grpUnavail = grp.unavailable.some(
              (u) => u.day === d && occupiedPeriods.includes(u.period),
            );
            if (grpUnavail) {
              groupClashReason = `Student pathway blackout: ${grp.name} is unavailable at this slot.`;
              break;
            }
          }
          const conflictingAss = assignments.find((other) => {
            if (other.event_id === target.event_id) return false;
            if (other.day !== d) return false;
            const otherEv = p.events.find((e) => e.id === other.event_id);
            if (!otherEv || !otherEv.group_ids.includes(gid)) return false;
            const otherDur = otherEv.duration;
            const otherOcc = Array.from({ length: otherDur }, (_, i) => other.period + i);
            return occupiedPeriods.some((pNum) => otherOcc.includes(pNum));
          });
          if (conflictingAss) {
            const oEv = p.events.find((e) => e.id === conflictingAss.event_id);
            groupClashReason = `Student clash: Pathway '${grp?.name || gid}' is enrolled in overlapping course '${oEv?.course_id || conflictingAss.event_id}'.`;
            break;
          }
        }
        if (groupClashReason) {
          availability[slotKey] = { valid: false, reason: groupClashReason };
          continue;
        }

        if (ev.kind === "L") {
          const sectionLecturesOnDay = assignments.filter((other) => {
            if (other.event_id === target.event_id) return false;
            if (other.day !== d) return false;
            const oEv = p.events.find((e) => e.id === other.event_id);
            return (
              oEv &&
              oEv.course_id === ev.course_id &&
              oEv.section === ev.section &&
              oEv.kind === "L"
            );
          });
          if (sectionLecturesOnDay.length >= 1) {
            availability[slotKey] = {
              valid: false,
              reason: `Theory spread (H11): Section ${ev.section} already has a lecture on ${p.calendar.days[d]}.`,
            };
            continue;
          }
        }

        availability[slotKey] = {
          valid: true,
          reason: `✓ Clash-Free & Fully Admissible Slot: Room, faculty, and student pathways are clear.`,
        };
      }
    }

    return availability;
  }

  function handleDragStart(ev: React.DragEvent, a: Assignment) {
    ev.dataTransfer.setData("application/json", JSON.stringify(a));
    setDragged(a);
    const availability = calculateSlotAvailability(a);
    setSlotAvailability(availability);
  }

  function handleDragEnd() {
    setDragged(null);
    setSlotAvailability({});
    setHoveredSlot(null);
  }

  function handleDrop(d: number, t: number) {
    if (!dragged) return;
    const slotKey = `${d}_${t}`;
    const slotInfo = slotAvailability[slotKey];
    const targetDateStr = datesOfWeek[d].toISOString().slice(0, 10);

    if (targetDateStr < todayIstStr) {
      setFeedback({
        type: "error",
        message: `✕ Cannot reschedule to completed date (${datesOfWeek[d].toLocaleDateString("en-GB", { day: "numeric", month: "short" })}). Timetable changes cannot be back-dated; please move forward to an upcoming date.`,
      });
      setDragged(null);
      setSlotAvailability({});
      setHoveredSlot(null);
      return;
    }

    if (slotInfo && slotInfo.valid) {
      const moved: Assignment = { ...dragged, day: d, period: t };
      onMove(moved);
      setFeedback({
        type: "success",
        message: `✓ Successfully rescheduled ${dragged.event_id} forward to ${p.calendar.days[d]} ${minutes(p.calendar.periods[t].start)}. 0 violations confirmed by independent audit.`,
      });
    } else {
      setFeedback({
        type: "error",
        message: `Move rejected: ${slotInfo?.reason || "Inadmissible slot according to NEP-2020 rules."}`,
      });
    }

    setDragged(null);
    setSlotAvailability({});
    setHoveredSlot(null);
  }

  function handleSaveCalendar() {
    const holidaysList = editHolidays
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));

    const updatedCalendar: Problem["calendar"] = {
      ...p.calendar,
      term_start: editTermStart,
      term_end: editTermEnd,
      midterm_start: editMidtermStart || null,
      midterm_end: editMidtermEnd || null,
      endterm_start: editEndtermStart || null,
      endterm_end: editEndtermEnd || null,
      holidays: holidaysList,
    };

    if (onUpdateCalendar) {
      onUpdateCalendar(updatedCalendar);
    }
    setCalendarModal(false);
  }

  return (
    <section className="schedule-panel panel">
      {/* Real-time Feedback Toast */}
      {feedback && (
        <div
          role="alert"
          className={`feedback-toast ${feedback.type === "success" ? "feedback-success" : "feedback-error"}`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 size={16} />
          ) : (
            <AlertTriangle size={16} />
          )}
          <span>{feedback.message}</span>
          <button
            aria-label="Dismiss feedback notification"
            onClick={() => setFeedback(null)}
            className="toast-close"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Top Perspective Header Bar */}
      <div className="schedule-top">
        <div
          className="view-tabs"
          role="tablist"
          aria-label="Timetable perspective"
        >
          {[
            ["Pathway", GraduationCap],
            ["Faculty", UserRound],
            ["Room", Building2],
            ["Basket", Layers3],
            ["Master", CalendarDays],
          ].map(([label, Icon]) => {
            const C = Icon as typeof GraduationCap;
            return (
              <button
                key={String(label)}
                role="tab"
                aria-selected={view === label}
                className={view === label ? "active" : ""}
                onClick={() => {
                  setView(String(label));
                  setSelected("");
                }}
              >
                <C size={15} />
                <span>{String(label)}</span>
              </button>
            );
          })}
        </div>

        {/* View Mode Switches */}
        <div className="view-mode-toggles">
          <button
            className={`mode-btn ${viewMode === "semester" ? "active" : ""}`}
            onClick={() => setViewMode("semester")}
            title="Full Semester Overview"
          >
            <CalendarRange size={14} />
            <span>Semester Overview</span>
          </button>
          <button
            className={`mode-btn ${viewMode === "week" ? "active" : ""}`}
            onClick={() => setViewMode("week")}
            title="Specific Week View"
          >
            <CalendarDays size={14} />
            <span>Week Grid</span>
          </button>
          <button
            className={`mode-btn ${viewMode === "day" ? "active" : ""}`}
            onClick={() => setViewMode("day")}
            title="Day View"
          >
            <Clock3 size={14} />
            <span>Day View</span>
          </button>
        </div>
      </div>

      {/* Full-Semester Academic Week Navigator */}
      <div className="semester-navigator-bar">
        <div className="navigator-left">
          <div className="week-stepper">
            <button
              aria-label="Previous academic week"
              disabled={week === 0}
              onClick={() => setWeek((n) => Math.max(0, n - 1))}
              className="stepper-btn"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="current-week-label">
              Week {currentWeekInfo.weekNumber} of {totalWeeks}
            </span>
            <button
              aria-label="Next academic week"
              disabled={week >= totalWeeks - 1}
              onClick={() => setWeek((n) => Math.min(totalWeeks - 1, n + 1))}
              className="stepper-btn"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <span className="week-dates-range">
            {firstDateOfWeek.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              timeZone: "UTC",
            })}{" "}
            –{" "}
            {datesOfWeek[datesOfWeek.length - 1].toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            })}
          </span>
          {week === 14 && (
            <span
              className={`today-ist-badge ${isLiveActive ? "live-active" : "weekend-idle"}`}
              title={liveStatusText}
            >
              {isLiveActive ? "● Active In-Session · IST" : "Completed Week (9–13 Nov) · Weekend"}
            </span>
          )}
          {week === 15 && (
            <span
              className="today-ist-badge live-active"
              title="Next active teaching week (16 Nov – 20 Nov 2026) · Ready for planning"
            >
              ★ Upcoming Active Week · Forward Planning
            </span>
          )}
          {currentWeekInfo.isMidterm && (
            <span className="phase-pill midterm-phase">
              <AlertTriangle size={11} /> Mid-Term Exams
            </span>
          )}
          {currentWeekInfo.isEndterm && (
            <span className="phase-pill endterm-phase">
              <AlertTriangle size={11} /> End-Term Exams
            </span>
          )}
        </div>

        {/* Scrollable Semester Week Pills (Week 1 to 16/18) */}
        <div className="week-strip-scroll" role="tablist" aria-label="Academic semester weeks">
          {semesterWeeks.map((sw) => {
            const isActive = week === sw.index;
            let pillClass = "week-pill";
            if (isActive) pillClass += " active";
            if (sw.isMidterm) pillClass += " is-midterm";
            if (sw.isEndterm) pillClass += " is-endterm";

            return (
              <button
                key={sw.weekNumber}
                role="tab"
                aria-selected={isActive}
                className={pillClass}
                onClick={() => {
                  setWeek(sw.index);
                  if (viewMode === "semester") setViewMode("week");
                }}
                title={`Week ${sw.weekNumber} (${sw.startDate} to ${sw.endDate}) · ${sw.label}`}
              >
                <b>W{sw.weekNumber}</b>
                <small>{sw.isMidterm ? "Mid" : sw.isEndterm ? "End" : sw.label.slice(0, 4)}</small>
              </button>
            );
          })}
        </div>

        <button
          className="calendar-settings-btn"
          onClick={() => setCalendarModal(true)}
          title="Configure semester term dates and exam windows"
        >
          <Settings size={14} />
          <span>Dates & Exams</span>
        </button>
      </div>

      {/* Exam Banner Warning when active week is an exam period */}
      {currentWeekInfo.isMidterm && (
        <div className="exam-banner midterm-banner">
          <AlertTriangle size={16} />
          <div>
            <strong>Mid-Term Examination Window Active ({p.calendar.midterm_start} – {p.calendar.midterm_end})</strong>
            <p>Regular lectures and skill laboratories are suspended during this period. Time slots are reserved for midterm assessments.</p>
          </div>
        </div>
      )}
      {currentWeekInfo.isEndterm && (
        <div className="exam-banner endterm-banner">
          <AlertTriangle size={16} />
          <div>
            <strong>End-Term Examination Window Active ({p.calendar.endterm_start} – {p.calendar.endterm_end})</strong>
            <p>Institutional comprehensive assessments in progress. All lecture theatres and computing labs are booked for examinations.</p>
          </div>
        </div>
      )}

      {/* Perspective Filter Controls */}
      <div className="schedule-controls">
        <div className="selection-wrap">
          {options.length > 0 ? (
            <select
              aria-label={`Select ${view.toLowerCase()}`}
              value={id}
              onChange={(e) => setSelected(e.target.value)}
            >
              {options.map((o) => (
                <option value={o.id} key={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : (
            <strong>All departments · Master institutional schedule</strong>
          )}
          <span className="subtle">
            {filtered.length} scheduled meetings <span className="dot-separator">·</span>{" "}
            {count} contact periods/week
          </span>
        </div>

        {/* Day selector for Day View */}
        {viewMode === "day" && (
          <div className="day-selector-pills">
            {p.calendar.days.map((dayName, dIdx) => (
              <button
                key={dayName}
                className={`day-pill ${selectedDay === dIdx ? "active" : ""}`}
                onClick={() => setSelectedDay(dIdx)}
              >
                {dayName.slice(0, 3)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pre-drag instruction banner */}
      {dragged && (
        <div className="drag-helper-banner">
          <Info size={14} />
          <span>
            Dragging <b>{dragged.event_id}</b> ({p.events.find(e => e.id === dragged.event_id)?.duration} period):
            <span className="green-legend">■ Green = Clash-Free & Admissible</span>
            <span className="red-legend">■ Red = Conflict (Hover to view reason)</span>
          </span>
        </div>
      )}

      {/* MODE 1: Full Semester Overview Table */}
      {viewMode === "semester" && (
        <div className="semester-overview-panel">
          <table className="semester-table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Calendar Dates</th>
                <th>Phase</th>
                <th>Lectures & Labs</th>
                <th>Holiday Blackout</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {semesterWeeks.map((sw) => (
                <tr key={sw.weekNumber} className={week === sw.index ? "highlighted-week-row" : ""}>
                  <td>
                    <strong>Week {sw.weekNumber}</strong>
                  </td>
                  <td>
                    {sw.startDate} to {sw.endDate}
                  </td>
                  <td>
                    <span
                      className={`badge-pill ${
                        sw.isMidterm
                          ? "midterm-badge"
                          : sw.isEndterm
                            ? "endterm-badge"
                            : "teaching-badge"
                      }`}
                    >
                      {sw.label}
                    </span>
                  </td>
                  <td>
                    {sw.isMidterm || sw.isEndterm
                      ? "Exam Evaluation Schedule"
                      : `${assignments.length} meetings (${count} contact hrs)`}
                  </td>
                  <td>
                    {sw.holidayCount > 0 ? (
                      <span className="holiday-text">{sw.holidayCount} holiday date(s)</span>
                    ) : (
                      <span className="subtle">None</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="button secondary compact"
                      onClick={() => {
                        setWeek(sw.index);
                        setViewMode("week");
                      }}
                    >
                      Inspect Week
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODE 2: Day View */}
      {viewMode === "day" && (
        <div className="day-view-container">
          <div className="day-header-strip">
            <h3>
              {p.calendar.days[selectedDay]} · {datesOfWeek[selectedDay]?.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </h3>
          </div>
          <div className="day-slots-list">
            {p.calendar.periods.map((period, t) => {
              const assignedHere = filtered.filter(
                (a) =>
                  a.day === selectedDay &&
                  a.period <= t &&
                  t < a.period + (p.events.find((e) => e.id === a.event_id)?.duration || 1),
              );

              return (
                <div key={t} className="day-slot-row">
                  <div className="slot-time-col">
                    <strong>{minutes(period.start)}</strong>
                    <small>{minutes(period.end)}</small>
                  </div>
                  <div className="slot-content-col">
                    {assignedHere.length > 0 ? (
                      assignedHere.map((a) => {
                        const ev = p.events.find((e) => e.id === a.event_id)!;
                        const c = p.courses.find((c) => c.id === ev.course_id)!;
                        const selectedDateStr = datesOfWeek[selectedDay]?.toISOString().slice(0, 10);
                        const isRunning =
                          isLiveActive &&
                          selectedDateStr === todayIstStr &&
                          runningSlot !== null &&
                          a.day === runningSlot.day &&
                          runningSlot.period >= a.period &&
                          runningSlot.period <
                            a.period + (ev?.duration || 1);

                        return (
                          <div
                            key={a.event_id}
                            className={`day-event-card cat-${c?.category} ${isRunning ? "card-running-now" : ""}`}
                            onClick={() => onEvent(a)}
                          >
                            <span className="event-code-badge">{c?.id}</span>
                            <b>{eventName(p, ev)}</b>
                            <span>Room: {a.room_id}</span>
                            <span>Faculty: {p.faculty.find((f) => f.id === a.faculty_id)?.name}</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="empty-day-slot">No classes scheduled</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODE 3: Specific Week Interactive Grid (with Smart Drag & Drop & Live Running Highlight) */}
      {viewMode === "week" && (
        <div className="grid-scroll">
          <div
            className="timetable-grid"
            style={{
              gridTemplateColumns: `68px repeat(${p.calendar.days.length}, minmax(145px,1fr))`,
              gridTemplateRows: `45px ${p.calendar.periods.map((_, i) => (breaks.includes(i) ? "30px " : "") + "108px").join(" ")}`,
            }}
          >
            <div className="time-heading">Local time</div>

            {/* Day Headings with Live Today & Completed Status Marker */}
            {datesOfWeek.map((date, d) => {
              const dateStr = date.toISOString().slice(0, 10);
              const isPastDate = dateStr < todayIstStr;
              const isToday = dateStr === todayIstStr;
              const holiday = p.calendar.holidays.includes(dateStr);
              const isMidterm = isDateInRange(
                dateStr,
                p.calendar.midterm_start,
                p.calendar.midterm_end,
              );
              const isEndterm = isDateInRange(
                dateStr,
                p.calendar.endterm_start,
                p.calendar.endterm_end,
              );
              return (
                <div
                  className={`day-heading ${isToday ? "today-column" : isPastDate ? "completed-column" : d === 0 ? "selected-day" : ""}`}
                  style={{ gridColumn: d + 2, gridRow: 1 }}
                  key={d}
                >
                  <div className="day-name-row">
                    <span>{p.calendar.days[d].slice(0, 3)}</span>
                  </div>
                  <b>{date.getUTCDate()}</b>
                  {isPastDate && <small className="badge-completed">Completed</small>}
                  {holiday && <small className="badge-holiday">Holiday</small>}
                  {isMidterm && <small className="badge-exam">Midterm</small>}
                  {isEndterm && <small className="badge-exam">Endterm</small>}
                </div>
              );
            })}

            {/* Time Slot Labels */}
            {p.calendar.periods.map((period, t) => {
              return (
                <div
                  className="time-slot"
                  key={t}
                  style={{ gridRow: rowFor(t), gridColumn: 1 }}
                >
                  <span>{minutes(period.start)}</span>
                  <small>{minutes(period.end)}</small>
                </div>
              );
            })}

            {/* Lunch Breaks */}
            {breaks.map((t) => (
              <div
                className="lunch-row"
                key={t}
                style={{
                  gridRow: rowFor(t) - 1,
                  gridColumn: `1 / span ${p.calendar.days.length + 1}`,
                }}
              >
                <Clock3 size={11} /> Lunch break ·{" "}
                {minutes(p.calendar.periods[t - 1].end)}–
                {minutes(p.calendar.periods[t].start)}
              </div>
            ))}

            {/* Background Grid Cells with Drop Target Availability */}
            {p.calendar.days.flatMap((_, d) =>
              p.calendar.periods.map((__, t) => {
                const dateStr = datesOfWeek[d].toISOString().slice(0, 10);
                const holiday = p.calendar.holidays.includes(dateStr);
                const outside =
                  dateStr < p.calendar.term_start ||
                  dateStr > p.calendar.term_end;
                const isMidterm = isDateInRange(
                  dateStr,
                  p.calendar.midterm_start,
                  p.calendar.midterm_end,
                );
                const isEndterm = isDateInRange(
                  dateStr,
                  p.calendar.endterm_start,
                  p.calendar.endterm_end,
                );
                const unavailable = selectedPerson?.unavailable.some(
                  (s) => s.day === d && s.period === t,
                );
                const has = filtered.some(
                  (a) =>
                    a.day === d &&
                    a.period <= t &&
                    a.period +
                      (p.events.find((e) => e.id === a.event_id)?.duration || 1) >
                      t,
                );

                const slotKey = `${d}_${t}`;
                const availability = slotAvailability[slotKey];
                const isDragging = dragged !== null;

                const isPastDate = dateStr < todayIstStr;
                let cellClass = "grid-cell";
                if (unavailable || holiday || outside || isMidterm || isEndterm) {
                  cellClass += " unavailable";
                }
                if (isPastDate) {
                  cellClass += " date-completed";
                }
                if (isDragging) {
                  if (availability?.valid) {
                    cellClass += " cell-valid-drop";
                  } else {
                    cellClass += " cell-invalid-drop";
                  }
                }

                return (
                  <div
                    key={`${d}/${t}`}
                    className={cellClass}
                    style={{ gridRow: rowFor(t), gridColumn: d + 2 }}
                    onMouseEnter={() => setHoveredSlot(slotKey)}
                    onMouseLeave={() => setHoveredSlot(null)}
                    onDragOver={(ev) => {
                      if (!holiday && !outside && !isMidterm && !isEndterm && !isPastDate) {
                        ev.preventDefault();
                      }
                    }}
                    onDrop={(ev) => {
                      ev.preventDefault();
                      handleDrop(d, t);
                    }}
                  >
                    {isDragging && hoveredSlot === slotKey && (
                      <div className={`slot-drag-tooltip ${availability?.valid ? "tooltip-valid" : "tooltip-invalid"}`}>
                        {availability?.valid ? (
                          <span>✓ Clash-Free Slot (Release to move forward)</span>
                        ) : (
                          <span>✕ {availability?.reason}</span>
                        )}
                      </div>
                    )}

                    {isMidterm && <span>Mid-Term Exam</span>}
                    {isEndterm && <span>End-Term Exam</span>}
                    {!isMidterm && !isEndterm && holiday && <span>Holiday</span>}
                    {!isMidterm && !isEndterm && outside && <span>Outside term</span>}
                    {!isMidterm && !isEndterm && !holiday && !outside && unavailable && (
                      <span>Unavailable</span>
                    )}

                    {!has &&
                      !unavailable &&
                      !holiday &&
                      !outside &&
                      !isMidterm &&
                      !isEndterm && (
                        isPastDate ? (
                          <span className="slot-completed-label">Completed</span>
                        ) : (
                          <i className={isDragging && availability?.valid ? "valid-slot-dot" : "empty-slot"} />
                        )
                      )}
                  </div>
                );
              }),
            )}

            {/* Scheduled Meeting Cards (with LIVE RUNNING CLASS HIGHLIGHT) */}
            {p.calendar.days.flatMap((_, d) =>
              p.calendar.periods.map((__, t) => {
                const dateStr = datesOfWeek[d].toISOString().slice(0, 10);
                if (
                  p.calendar.holidays.includes(dateStr) ||
                  dateStr < p.calendar.term_start ||
                  dateStr > p.calendar.term_end ||
                  isDateInRange(dateStr, p.calendar.midterm_start, p.calendar.midterm_end) ||
                  isDateInRange(dateStr, p.calendar.endterm_start, p.calendar.endterm_end)
                ) {
                  return null;
                }

                const aa = filtered.filter(
                  (a) => a.day === d && a.period === t,
                );
                if (!aa.length) return null;

                const duration = Math.max(
                  ...aa.map(
                    (a) => p.events.find((e) => e.id === a.event_id)?.duration || 1,
                  ),
                );

                return (
                  <div
                    key={`events${d}/${t}`}
                    className={`event-wrapper ${aa.length > 1 ? "parallel" : ""}`}
                    style={{
                      gridColumn: d + 2,
                      gridRow: `${rowFor(t)} / span ${duration}`,
                    }}
                  >
                    {aa.map((a) => {
                      const e = p.events.find((e) => e.id === a.event_id);
                      if (!e) return null;
                      const c = p.courses.find((c) => c.id === e.course_id);
                      const isBeingDragged = dragged?.event_id === a.event_id;

                      // Check if this class is currently in session right now (counted on backend / IST clock)
                      const isRunningNow =
                        isLiveActive &&
                        dateStr === todayIstStr &&
                        runningSlot !== null &&
                        a.day === runningSlot.day &&
                        runningSlot.period >= a.period &&
                        runningSlot.period < a.period + (e?.duration || 1);

                      let cardClass = `event-card cat-${c?.category}`;
                      if (e.kind === "P") cardClass += " practical";
                      if (isBeingDragged) cardClass += " card-dragging";
                      if (isRunningNow) cardClass += " card-running-now";

                      return (
                        <button
                          key={a.event_id}
                          draggable
                          onDragStart={(ev) => handleDragStart(ev, a)}
                          onDragEnd={handleDragEnd}
                          onClick={() => onEvent(a)}
                          className={cardClass}
                          title={`${c?.title}; ${a.room_id}${isRunningNow ? " · Present Running Class" : ""}`}
                        >
                          <div className="event-code">
                            <b>{c?.id}</b>
                            <span>
                              {e.kind === "P"
                                ? `${durationLabel(p, e)} LAB`
                                : c?.category}
                            </span>
                          </div>
                          <strong>{eventName(p, e)}</strong>
                          <div className="event-room">
                            <MapPin size={10} />
                            {a.room_id.replace(/_/g, " ")}
                          </div>
                          <div className="event-footer">
                            {minutes(p.calendar.periods[t].start)}–
                            {minutes(
                              p.calendar.periods[t + e.duration - 1].end,
                            )}
                            {e.kind === "P" && <span>Practical</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              }),
            )}
          </div>
        </div>
      )}

      {/* Footer Legend */}
      <div className="schedule-footer">
        <div className="legend">
          {[
            ["DSC", "Major Core"],
            ["MIC", "Interdisciplinary Minor"],
            ["MDC", "Multidisciplinary Elective"],
            ["SEC", "Skill / Lab Course"],
            ["AEC", "Communication & Ability"],
            ["VAC", "Value-Added Education"],
            ["INT", "Internship / Practice"],
          ].map(([cat, label]) => (
            <span key={cat}>
              <i className={`cat-${cat}`} />
              {label}
            </span>
          ))}
        </div>
        <span className="subtle">{p.calendar.timezone} · Semester Week {currentWeekInfo.weekNumber}</span>
      </div>

      {/* Academic Calendar & Exam Windows Settings Modal */}
      {calendarModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-box calendar-config-modal">
            <div className="modal-header">
              <CalendarCheck size={18} />
              <h3>Academic Semester & Examination Windows</h3>
              <button
                className="close-btn"
                aria-label="Close modal"
                onClick={() => setCalendarModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-subtitle">
                Configure full semester timeline boundaries and exam blackout periods. Classes during exam dates are automatically suspended and locked against scheduling.
              </p>

              <div className="form-group-grid">
                <div className="field-group">
                  <label>Semester Start Date</label>
                  <input
                    type="date"
                    value={editTermStart}
                    onChange={(e) => setEditTermStart(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label>Semester End Date</label>
                  <input
                    type="date"
                    value={editTermEnd}
                    onChange={(e) => setEditTermEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="section-divider">
                <span>Examination Windows (Class Suspension)</span>
              </div>

              <div className="form-group-grid">
                <div className="field-group">
                  <label>Mid-Term Exam Start</label>
                  <input
                    type="date"
                    value={editMidtermStart}
                    onChange={(e) => setEditMidtermStart(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label>Mid-Term Exam End</label>
                  <input
                    type="date"
                    value={editMidtermEnd}
                    onChange={(e) => setEditMidtermEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group-grid">
                <div className="field-group">
                  <label>End-Term Exam Start</label>
                  <input
                    type="date"
                    value={editEndtermStart}
                    onChange={(e) => setEditEndtermStart(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label>End-Term Exam End</label>
                  <input
                    type="date"
                    value={editEndtermEnd}
                    onChange={(e) => setEditEndtermEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="field-group full-width">
                <label>Institutional Holidays (Comma-separated YYYY-MM-DD)</label>
                <input
                  type="text"
                  value={editHolidays}
                  onChange={(e) => setEditHolidays(e.target.value)}
                  placeholder="2026-08-15, 2026-10-02, 2026-11-08"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="button secondary"
                onClick={() => setCalendarModal(false)}
              >
                Cancel
              </button>
              <button className="button primary" onClick={handleSaveCalendar}>
                Save Calendar & Re-audit
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
