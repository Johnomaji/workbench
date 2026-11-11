import { describe, expect, it } from "vitest";
import { dateInputValue, endOfDayIn, formatShortDay, isDueThisWeek, isOverdue, timeZoneOffsetMinutes, weekRange } from "./dates";
import { docToText, normalizeScriptText, textToDoc } from "./script-doc";

describe("deadline dates", () => {
  it("knows timezone offsets", () => {
    expect(timeZoneOffsetMinutes("UTC", new Date("2026-11-20T12:00:00Z"))).toBe(0);
    expect(timeZoneOffsetMinutes("Africa/Lagos", new Date("2026-11-20T12:00:00Z"))).toBe(60);
    // Daylight saving is handled per date.
    expect(timeZoneOffsetMinutes("Europe/London", new Date("2026-07-01T12:00:00Z"))).toBe(60);
    expect(timeZoneOffsetMinutes("Europe/London", new Date("2026-12-01T12:00:00Z"))).toBe(0);
  });

  it("turns a picked date into the end of that day locally", () => {
    expect(endOfDayIn("2026-11-20", "UTC").toISOString()).toBe("2026-11-20T23:59:59.999Z");
    expect(endOfDayIn("2026-11-20", "Africa/Lagos").toISOString()).toBe("2026-11-20T22:59:59.999Z");
    expect(endOfDayIn("2026-07-01", "Europe/London").toISOString()).toBe("2026-07-01T22:59:59.999Z");
  });

  it("round-trips through the date input", () => {
    for (const tz of ["UTC", "Africa/Lagos", "America/New_York", "Asia/Kolkata"]) {
      expect(dateInputValue(endOfDayIn("2026-03-08", tz), tz)).toBe("2026-03-08");
    }
  });

  it("finds this week, Monday to Sunday, in the department's timezone", () => {
    // Saturday 2026-11-07 12:00 UTC.
    expect(weekRange(new Date("2026-11-07T12:00:00Z"), "UTC")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
    // A Monday stays in its own week; a Sunday ends it.
    expect(weekRange(new Date("2026-11-02T00:30:00Z"), "UTC")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
    expect(weekRange(new Date("2026-11-08T23:30:00Z"), "UTC")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
    // Sunday 23:30 UTC is already Monday in Lagos, so the next week has started there.
    expect(weekRange(new Date("2026-11-08T23:30:00Z"), "Africa/Lagos")).toEqual({ start: "2026-11-09", end: "2026-11-15" });
    // Across a month and a year end.
    expect(weekRange(new Date("2026-12-31T12:00:00Z"), "UTC")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
  });

  it("knows which deadlines fall this week", () => {
    const now = new Date("2026-11-04T09:00:00Z"); // Wednesday
    expect(isDueThisWeek(endOfDayIn("2026-11-02", "UTC"), "UTC", now)).toBe(true); // Monday, already past
    expect(isDueThisWeek(endOfDayIn("2026-11-08", "UTC"), "UTC", now)).toBe(true); // Sunday
    expect(isDueThisWeek(endOfDayIn("2026-11-09", "UTC"), "UTC", now)).toBe(false); // next Monday
    expect(isDueThisWeek(endOfDayIn("2026-11-01", "UTC"), "UTC", now)).toBe(false); // last Sunday
    expect(isDueThisWeek(null, "UTC", now)).toBe(false);
  });

  it("formats short days for cards", () => {
    const now = new Date("2026-11-04T09:00:00Z");
    expect(formatShortDay(endOfDayIn("2026-11-14", "UTC"), "UTC", now)).toBe("Sat 14 Nov");
    expect(formatShortDay(endOfDayIn("2027-01-08", "UTC"), "UTC", now)).toBe("Fri 8 Jan 2027");
  });

  it("is only overdue when not completed", () => {
    const past = new Date("2026-01-01T00:00:00Z");
    const now = new Date("2026-02-01T00:00:00Z");
    expect(isOverdue(past, null, now)).toBe(true);
    expect(isOverdue(past, now, now)).toBe(false);
    expect(isOverdue(null, null, now)).toBe(false);
  });
});

describe("script documents", () => {
  it("round-trips plain text", () => {
    const text = "Scene 1: Morning\n\nVisual: Sunrise.\nVoiceover: \"Hello.\"";
    expect(docToText(textToDoc(text))).toBe(text);
  });

  it("reads rich documents with headings, marks and lists", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Scene 1" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", marks: [{ type: "bold" }], text: "Visual: " },
            { type: "text", text: "Rooftop." },
          ],
        },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Wide shot" }] }] }] },
      ],
    };
    expect(docToText(doc)).toBe("Scene 1\nVisual: Rooftop.\n• Wide shot");
  });

  it("ignores things that aren't documents", () => {
    expect(docToText(null)).toBe("");
    expect(docToText({ type: "paragraph" })).toBe("");
  });

  it("normalises line endings and trailing spaces", () => {
    expect(normalizeScriptText("\r\nLine one   \r\nLine two\t\n\n")).toBe("Line one\nLine two");
  });
});
