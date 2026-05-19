const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toSgtWallClockUtcDate(now = new Date()) {
  return new Date(now.getTime() + SGT_OFFSET_MS);
}

function sgtBoundaryToUtcIso(sgtDate) {
  return new Date(sgtDate.getTime() - SGT_OFFSET_MS).toISOString();
}

export function getSingaporeDailyWindow(now = new Date()) {
  const sgtNow = toSgtWallClockUtcDate(now);

  const y = sgtNow.getUTCFullYear();
  const m = sgtNow.getUTCMonth();
  const d = sgtNow.getUTCDate();

  let endSgtWallClock = new Date(Date.UTC(y, m, d, 6, 0, 0));

  if (sgtNow < endSgtWallClock) {
    endSgtWallClock = new Date(endSgtWallClock.getTime() - DAY_MS);
  }

  const startSgtWallClock = new Date(endSgtWallClock.getTime() - DAY_MS);

  return {
    timezone: "Asia/Singapore",
    start_sgt: startSgtWallClock.toISOString(),
    end_sgt: endSgtWallClock.toISOString(),
    start_utc: sgtBoundaryToUtcIso(startSgtWallClock),
    end_utc: sgtBoundaryToUtcIso(endSgtWallClock),
  };
}

export function getSingaporePeriodWindow(period = "daily", now = new Date()) {
  const daily = getSingaporeDailyWindow(now);
  const endSgt = new Date(daily.end_sgt);

  let days = 1;

  if (period === "weekly") days = 7;
  else if (period === "monthly") days = 30;
  else if (period === "quarterly") days = 90;

  const startSgt = new Date(endSgt.getTime() - days * DAY_MS);

  return {
    timezone: "Asia/Singapore",
    period,
    start_sgt: startSgt.toISOString(),
    end_sgt: endSgt.toISOString(),
    start_utc: sgtBoundaryToUtcIso(startSgt),
    end_utc: daily.end_utc,
  };
}

export function isWithinWindow(datePublished, window) {
  if (!datePublished) return false;

  const date = new Date(datePublished).getTime();
  const start = new Date(window.start_utc).getTime();
  const end = new Date(window.end_utc).getTime();

  if (Number.isNaN(date)) return false;

  return date >= start && date < end;
}
