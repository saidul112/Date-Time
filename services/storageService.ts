
import { UserProfile, PunchLog, VisaType } from '../types';

const PROFILE_KEY = '711_personal_profile';
const LOGS_KEY = '711_personal_logs';

export const storageService = {
  getProfile: (): UserProfile => {
    const data = localStorage.getItem(PROFILE_KEY);
    return data ? JSON.parse(data) : { name: '', visaType: VisaType.STUDENT, isSetup: false };
  },

  setProfile: (profile: UserProfile) => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, isSetup: true }));
  },

  getLogs: (): PunchLog[] => {
    const data = localStorage.getItem(LOGS_KEY);
    const logs = data ? JSON.parse(data) : [];
    return logs.sort((a: PunchLog, b: PunchLog) => b.timestamp - a.timestamp);
  },

  addLog: (log: PunchLog) => {
    const logs = storageService.getLogs();
    logs.push(log);
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  },

  deleteLog: (id: string) => {
    const logs = storageService.getLogs();
    const filtered = logs.filter(l => l.id !== id);
    localStorage.setItem(LOGS_KEY, JSON.stringify(filtered));
  },

  updateLog: (updatedLog: PunchLog) => {
    const logs = storageService.getLogs();
    const index = logs.findIndex(l => l.id === updatedLog.id);
    if (index !== -1) {
      logs[index] = updatedLog;
      localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
    }
  },

  clearAll: () => {
    localStorage.removeItem(LOGS_KEY);
  }
};
