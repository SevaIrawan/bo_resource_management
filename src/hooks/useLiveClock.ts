import { useEffect, useState } from 'react';

function formatClock(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function useLiveClock() {
  const [time, setTime] = useState(() => formatClock(new Date()));

  useEffect(() => {
    const tick = () => setTime(formatClock(new Date()));
    tick();

    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return time;
}
