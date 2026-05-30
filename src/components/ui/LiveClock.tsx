import { useLiveClock } from '@/hooks/useLiveClock';

export function LiveClock() {
  const time = useLiveClock();

  return (
    <time
      dateTime={time.replace(' ', 'T')}
      className="block text-xs tabular-nums text-text-muted"
    >
      {time}
    </time>
  );
}
