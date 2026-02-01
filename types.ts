
export enum VisaType {
  REGULAR = 'REGULAR',
  STUDENT = 'STUDENT' // Subject to 28h weekly limit
}

export interface UserProfile {
  name: string;
  visaType: VisaType;
  isSetup: boolean;
}

export enum PunchType {
  CLOCK_IN = 'CLOCK_IN',
  BREAK_START = 'BREAK_START',
  BREAK_END = 'BREAK_END',
  CLOCK_OUT = 'CLOCK_OUT'
}

export interface PunchLog {
  id: string;
  type: PunchType;
  timestamp: number; // Date.now()
  note?: string;
}

export interface CalculatedDay {
  date: string;
  totalWorkedHours: number;
  nightHours: number;
  overtimeHours: number;
  breakHours: number;
}
