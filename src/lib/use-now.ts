"use client";

import * as React from "react";

/** The current time, refreshed every `ms` (default one minute) so countdowns and "due" columns stay honest. */
export function useNow(ms = 60_000): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
