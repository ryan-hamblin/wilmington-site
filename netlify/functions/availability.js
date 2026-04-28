const ICAL_URL =
  "https://calendar.google.com/calendar/ical/7e193672feed23d72ca8438ff176406b8c82ad560374ac84c10b9c02ebfce33f%40group.calendar.google.com/public/basic.ics";

function parseICalDate(str) {
  if (!str) return null;
  // DATE-TIME: 20250704T120000Z  or  20250704T120000  or  DATE: 20250704
  const clean = str.replace(/[TZ]/g, "").slice(0, 8);
  const y = clean.slice(0, 4);
  const m = clean.slice(4, 6);
  const d = clean.slice(6, 8);
  return `${y}-${m}-${d}`;
}

function parseICal(text) {
  const events = [];
  const lines = text.replace(/\r\n /g, "").replace(/\r\n/g, "\n").split("\n");

  let inEvent = false;
  let current = {};

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") { inEvent = true; current = {}; continue; }
    if (line === "END:VEVENT") {
      inEvent = false;
      if (current.start && current.end) events.push({ ...current });
      continue;
    }
    if (!inEvent) continue;

    if (line.startsWith("DTSTART")) {
      current.start = parseICalDate(line.split(":")[1]);
    } else if (line.startsWith("DTEND")) {
      // iCal DTEND for all-day events is exclusive (day after checkout)
      // so we subtract one day for all-day events
      const raw = line.split(":")[1];
      const isAllDay = line.includes("VALUE=DATE") || (raw && raw.length === 8);
      let end = parseICalDate(raw);
      if (isAllDay && end) {
        const d = new Date(end + "T00:00:00");
        d.setDate(d.getDate() - 1);
        end = d.toISOString().slice(0, 10);
      }
      current.end = end;
    } else if (line.startsWith("SUMMARY")) {
      current.summary = line.split(":").slice(1).join(":").trim();
    } else if (line.startsWith("STATUS")) {
      current.status = line.split(":")[1];
    }
  }

  // Filter out cancelled events
  return events.filter(e => e.status !== "CANCELLED");
}

exports.handler = async () => {
  try {
    const res = await fetch(ICAL_URL);
    if (!res.ok) throw new Error(`iCal fetch failed: ${res.status}`);
    const text = await res.text();
    const events = parseICal(text);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300", // cache 5 min
      },
      body: JSON.stringify({ blockedRanges: events }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message, blockedRanges: [] }),
    };
  }
};
