from __future__ import annotations
from datetime import date
from zoneinfo import ZoneInfo
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


ID = str


class Slot(Strict):
    day: int = Field(ge=0)
    period: int = Field(ge=0)


class Assignment(Slot):
    event_id: ID
    room_id: ID
    faculty_id: ID


class Provenance(Strict):
    kind: Literal["synthetic", "collected", "adapted"]
    description: str
    seed: int = Field(ge=0)
    source_url: str | None


class Period(Strict):
    start: int = Field(ge=0, le=1439)
    end: int = Field(ge=0, le=1440)


class Calendar(Strict):
    days: list[str] = Field(min_length=1, max_length=7)
    periods: list[Period] = Field(min_length=1, max_length=12)
    timezone: str
    term_start: str
    term_end: str
    holidays: list[str]
    midterm_start: str | None = None
    midterm_end: str | None = None
    endterm_start: str | None = None
    endterm_end: str | None = None

    @model_validator(mode="after")
    def valid_calendar(self):
        if (
            self.days
            != [
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
            ][: len(self.days)]
        ):
            raise ValueError("Days must be a Monday-first prefix")
        for i, t in enumerate(self.periods):
            if t.end <= t.start or (i and t.start < self.periods[i - 1].end):
                raise ValueError("Invalid or overlapping periods")
        if len({p.end - p.start for p in self.periods}) != 1:
            raise ValueError("Equal-duration periods required")
        if date.fromisoformat(self.term_end) < date.fromisoformat(self.term_start):
            raise ValueError("Term end precedes start")
        if (
            date.fromisoformat(self.term_end) - date.fromisoformat(self.term_start)
        ).days > 366:
            raise ValueError("Each problem covers one term of at most 366 days")
        for h in self.holidays:
            date.fromisoformat(h)
        if self.midterm_start:
            date.fromisoformat(self.midterm_start)
        if self.midterm_end:
            date.fromisoformat(self.midterm_end)
        if self.endterm_start:
            date.fromisoformat(self.endterm_start)
        if self.endterm_end:
            date.fromisoformat(self.endterm_end)
        ZoneInfo(self.timezone)
        return self


class Course(Strict):
    id: ID
    title: str
    category: Literal["DSC", "MIC", "MDC", "AEC", "SEC", "VAC", "INT"]
    credits: float = Field(ge=0, le=40, multiple_of=0.5)
    profile: str


class Room(Strict):
    id: ID
    name: str
    type: str
    capacity: int = Field(ge=0, le=10000)
    building: str
    equipment: list[str]
    unavailable: list[Slot]


class Faculty(Strict):
    id: ID
    name: str
    department: str
    max_minutes: int = Field(ge=0, le=10080)
    course_ids: list[ID]
    unavailable: list[Slot]
    preferred: list[Slot]


class Group(Strict):
    id: ID
    name: str
    size: int = Field(ge=0, le=10000)
    program: str
    major: str
    minor: str
    mdc: str
    unavailable: list[Slot]


class Event(Strict):
    id: ID
    course_id: ID
    section_id: ID
    kind: Literal["L", "T", "P", "INT"]
    duration: int = Field(ge=1, le=12)
    faculty_ids: list[ID] = Field(min_length=1, max_length=100)
    group_ids: list[ID]
    room_types: list[str] = Field(min_length=1)
    equipment: list[str]
    allowed_starts: list[Slot] | None
    basket_id: ID | None
    sync_group: ID | None


class Basket(Strict):
    id: ID
    name: str
    course_ids: list[ID]
    reserved_groups: list[ID]
    allowed_starts: list[Slot]


class Weights(Strict):
    preference: int = Field(ge=0, le=1000)
    seat_slack: int = Field(ge=0, le=1000)
    idle: int = Field(ge=0, le=1000)
    travel: int = Field(ge=0, le=1000)
    balance: int = Field(ge=0, le=1000)


class Policies(Strict):
    max_theory_per_day: int = Field(ge=1, le=12)
    min_travel_minutes: int = Field(ge=0, le=180)
    locked: list[Assignment]
    weights: Weights
    notes: list[str]


class Problem(Strict):
    schema_version: Literal["1.0"]
    id: ID
    title: str
    institution: str
    provenance: Provenance
    calendar: Calendar
    courses: list[Course] = Field(min_length=1, max_length=200)
    rooms: list[Room] = Field(min_length=1, max_length=80)
    faculty: list[Faculty] = Field(min_length=1, max_length=100)
    groups: list[Group] = Field(min_length=1, max_length=100)
    events: list[Event] = Field(min_length=1, max_length=250)
    baskets: list[Basket] = Field(max_length=50)
    policies: Policies

    @model_validator(mode="after")
    def references(self):
        import re

        if (
            len(self.calendar.days) > 1
            and self.policies.min_travel_minutes
            > 1440 + self.calendar.periods[0].start - self.calendar.periods[-1].end
        ):
            raise ValueError(
                "Calendar must leave the enabled travel buffer between teaching days"
            )
        keys = {}
        for name in ("courses", "rooms", "faculty", "groups", "events", "baskets"):
            values = getattr(self, name)
            keys[name] = {v.id for v in values}
            if len(keys[name]) != len(values):
                raise ValueError(f"Duplicate {name} IDs")
            if any(not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", v.id) for v in values):
                raise ValueError("Invalid identifier")

        def slots(values):
            if any(
                s.day >= len(self.calendar.days)
                or s.period >= len(self.calendar.periods)
                for s in values
            ):
                raise ValueError("Slot outside calendar")

        for r in self.rooms:
            slots(r.unavailable)
        for f in self.faculty:
            slots(f.unavailable + f.preferred)
            if not set(f.course_ids) <= keys["courses"]:
                raise ValueError("Unknown faculty course")
        for g in self.groups:
            slots(g.unavailable)
        sync = {}
        for e in self.events:
            if (
                e.course_id not in keys["courses"]
                or not set(e.faculty_ids) <= keys["faculty"]
                or not set(e.group_ids) <= keys["groups"]
            ):
                raise ValueError(f"Unknown reference in {e.id}")
            if len(set(e.group_ids)) != len(e.group_ids) or len(
                set(e.faculty_ids)
            ) != len(e.faculty_ids):
                raise ValueError("Duplicate event reference")
            if e.allowed_starts is not None:
                slots(e.allowed_starts)
            if bool(e.basket_id) != bool(e.sync_group) or (
                e.basket_id and e.basket_id not in keys["baskets"]
            ):
                raise ValueError("Invalid synchronization reference")
            if e.sync_group:
                sync.setdefault(e.sync_group, []).append(e)
        for b in self.baskets:
            slots(b.allowed_starts)
            if (
                not set(b.course_ids) <= keys["courses"]
                or not set(b.reserved_groups) <= keys["groups"]
            ):
                raise ValueError("Unknown basket reference")
            for g in self.groups:
                if (
                    len(
                        {
                            e.course_id
                            for e in self.events
                            if e.basket_id == b.id and g.id in e.group_ids
                        }
                    )
                    > 1
                ):
                    raise ValueError(f"Group {g.id} selects simultaneous alternatives")
        for sid, es in sync.items():
            if (
                len(es) < 2
                or len({e.duration for e in es}) != 1
                or len({e.basket_id for e in es}) != 1
                or len({e.course_id for e in es}) != len(es)
            ):
                raise ValueError(f"Incompatible synchronization {sid}")
            basket = next(b for b in self.baskets if b.id == es[0].basket_id)
            if any(e.course_id not in basket.course_ids for e in es):
                raise ValueError("Event outside basket alternatives")
        if len({a.event_id for a in self.policies.locked}) != len(self.policies.locked):
            raise ValueError("Duplicate lock")
        for a in self.policies.locked:
            if (
                a.event_id not in keys["events"]
                or a.room_id not in keys["rooms"]
                or a.faculty_id not in keys["faculty"]
            ):
                raise ValueError("Unknown lock")
            slots([a])
        return self
