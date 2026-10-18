import type { CalendarEvent } from './schedule';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

/** RFC 5545 line folding at 75 octets, never splitting a UTF-8 character. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (curBytes + b > limit) {
      out.push(cur);
      cur = '';
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const TZ = 'Asia/Muscat';

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Times are Oman wall-clock times with an explicit TZID and its VTIMEZONE (+04:00 all year, no DST),
 * so Google and Apple calendars place them at the family's times whatever zone the calendar itself is in.
 * UIDs are stable, so re-importing replaces old events.
 */
export function buildIcs(events: CalendarEvent[], now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//bassamailab//smart-dinner//AR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:دليل العشاء المنزلي', `X-WR-TIMEZONE:${TZ}`,
    'BEGIN:VTIMEZONE', `TZID:${TZ}`, 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0400', 'TZOFFSETTO:+0400', 'TZNAME:+04', 'END:STANDARD', 'END:VTIMEZONE',
  ];
  for (const e of events) {
    const date = e.date.replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}-${date}@dinner.bassamailab.xyz`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;TZID=${TZ}:${date}T${e.time.replace(':', '')}00`,
      `DURATION:PT${e.durationMin}M`,
      `SUMMARY:${esc(e.title)}`,
      `DESCRIPTION:${esc(e.body)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, 'TRIGGER:PT0S', 'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
