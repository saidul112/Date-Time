import { PunchLog, PunchType } from '../types';
import { NIGHT_SHIFT_START, NIGHT_SHIFT_END, DAILY_LIMIT } from '../constants';

/**
 * Calculates working segments (Start to End) from punch logs
 */
export const calculateShiftsFromLogs = (logs: PunchLog[]) => {
  const sortedLogs = [...logs].sort((a, b) => a.timestamp - b.timestamp);
  const shifts: { start: number; end: number; breaks: { start: number; end: number }[] }[] = [];
  
  let currentShift: any = null;
  let currentBreak: any = null;

  sortedLogs.forEach(log => {
    switch (log.type) {
      case PunchType.CLOCK_IN:
        currentShift = { start: log.timestamp, end: null, breaks: [] };
        break;
      case PunchType.BREAK_START:
        if (currentShift) currentBreak = { start: log.timestamp, end: null };
        break;
      case PunchType.BREAK_END:
        if (currentBreak) {
          currentBreak.end = log.timestamp;
          currentShift.breaks.push(currentBreak);
          currentBreak = null;
        }
        break;
      case PunchType.CLOCK_OUT:
        if (currentShift) {
          currentShift.end = log.timestamp;
          shifts.push(currentShift);
          currentShift = null;
        }
        break;
    }
  });

  // Handle active shift (no clock out yet)
  if (currentShift && !currentShift.end) {
    // For calculation of "so far", we can use Date.now()
    // but usually for summaries we only look at closed shifts
  }

  return shifts;
};

/**
 * Core Logic: Night hours (22:00 - 05:00)
 */
export const calculateNightHours = (start: number, end: number): number => {
  let nightTotal = 0;
  const startDate = new Date(start);
  const endDate = new Date(end);

  // Iterate hour by hour to keep it simple and accurate for edge cases spanning multiple days
  let current = new Date(startDate);
  current.setMinutes(0, 0, 0);

  const checkHour = new Date(startDate);
  while (checkHour < endDate) {
    const hour = checkHour.getHours();
    // Night is 22:00 to 05:00
    if (hour >= NIGHT_SHIFT_START || hour < NIGHT_SHIFT_END) {
      const startOfHour = Math.max(checkHour.getTime(), start);
      const nextHour = new Date(checkHour);
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
      const endOfHour = Math.min(nextHour.getTime(), end);
      
      nightTotal += (endOfHour - startOfHour) / (1000 * 60 * 60);
    }
    checkHour.setHours(checkHour.getHours() + 1, 0, 0, 0);
  }
  
  return nightTotal;
};

export const formatDuration = (hours: number): string => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
};

export const getJSTDateString = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).replace(/\//g, '-');
};
