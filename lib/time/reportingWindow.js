export function getSingaporeDailyWindow(now = new Date()) {
  const singaporeNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Singapore" })
  );

  const end = new Date(singaporeNow);
  end.setHours(6, 0, 0, 0);

  if (singaporeNow < end) {
    end.setDate(end.getDate() - 1);
  }

  const start = new Date(end);
  start.setDate(start.getDate() - 1);

  return {
    timezone: "Asia/Singapore",
    start_local: start.toISOString(),
    end_local: end.toISOString(),
    start_utc: new Date(start.getTime() - 8 * 60 * 60 * 1000).toISOString(),
    end_utc: new Date(end.getTime() - 8 * 60 * 60 * 1000).toISOString(),
  };
}

export function isWithinWindow(dateString, window) {
  if (!dateString) return true;

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return true;

  return date >= new Date(window.start_utc) && date < new Date(window.end_utc);
}
