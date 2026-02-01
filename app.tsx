
import React, { useState, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PunchType, PunchLog, UserProfile, VisaType } from './types';
import { storageService } from './services/storageService';
import { 
  calculateShiftsFromLogs, 
  formatDuration, 
  getJSTDateString
} from './utils/calculations';
import { WEEKLY_STUDENT_LIMIT } from './constants';
import { 
  Clock, 
  LogOut, 
  Coffee, 
  Play, 
  History as HistoryIcon, 
  Trash2, 
  Settings as SettingsIcon,
  AlertCircle,
  LayoutDashboard,
  Plus,
  X,
  Calendar,
  Save,
  Download,
  FileText
} from 'lucide-react';

export default function App() {
  const [profile, setProfile] = useState<UserProfile>(storageService.getProfile());
  const [logs, setLogs] = useState<PunchLog[]>(storageService.getLogs());
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'HISTORY' | 'SETTINGS'>('DASHBOARD');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  // All hooks must be declared at the top level
  const stats = useMemo(() => {
    const shifts = calculateShiftsFromLogs(logs);
    
    const getStartOfWeek = () => {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.setDate(diff)).setHours(0, 0, 0, 0);
    };
    
    const getStartOfMonth = () => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), 1).setHours(0, 0, 0, 0);
    };

    const startOfWeek = getStartOfWeek();
    const startOfMonth = getStartOfMonth();
    const todayStr = getJSTDateString(Date.now());
    
    let weeklyTotal = 0;
    let monthlyTotal = 0;
    let today = { morning: 0, day: 0, night: 0, total: 0 };

    shifts.forEach(s => {
      if (!s.end) return;
      const workMinutes: number[] = [];
      const totalSpan = Math.floor((s.end - s.start) / 60000);
      for (let i = 0; i < totalSpan; i++) {
        const minuteTime = s.start + (i * 60000);
        const isBreak = s.breaks.some(b => b.end && minuteTime >= b.start && minuteTime < b.end);
        if (!isBreak) workMinutes.push(minuteTime);
      }
      
      const hours = workMinutes.length / 60;
      
      if (s.start >= startOfWeek) weeklyTotal += hours;
      if (s.start >= startOfMonth) monthlyTotal += hours;
      
      if (getJSTDateString(s.start) === todayStr) {
        workMinutes.forEach(ts => {
          const h = new Date(ts).getHours();
          if (h >= 22 || h < 5) today.night += (1/60);
          else if (h >= 5 && h < 9) today.morning += (1/60);
          else today.day += (1/60);
          today.total += (1/60);
        });
      }
    });
    
    return { weeklyTotal, monthlyTotal, today, shifts };
  }, [logs]);

  const currentStatus = useMemo(() => {
    if (logs.length === 0) return 'NONE';
    const last = [...logs].sort((a, b) => b.timestamp - a.timestamp)[0];
    return last.type === PunchType.CLOCK_OUT ? 'NONE' : last.type;
  }, [logs]);

  if (!profile.isSetup) {
    return <SetupView onComplete={(p) => {
      storageService.setProfile(p);
      setProfile(p);
    }} />;
  }

  const handlePunch = (type: PunchType, customTimestamp?: number) => {
    const newLog: PunchLog = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      timestamp: customTimestamp || Date.now()
    };
    storageService.addLog(newLog);
    setLogs(storageService.getLogs());
  };

  const handleDelete = (id: string) => {
    if (confirm('この記録を削除しますか？')) {
      storageService.deleteLog(id);
      setLogs(storageService.getLogs());
    }
  };

  const generatePDF = () => {
    // We use English for the PDF labels to avoid "tofu" (broken Japanese characters) 
    // since jsPDF does not bundle CJK fonts by default.
    const doc = new jsPDF();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthLabel = `${year}-${month.toString().padStart(2, '0')}`;
    
    // Header - Use standard fonts to avoid breaking
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(0, 128, 96); // 7-11 Green
    doc.text('STAFF WORK REPORT', 14, 20);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Report Period: ${monthLabel}`, 14, 30);
    doc.text(`Staff: ${profile.name}`, 14, 35);
    doc.text(`Visa Type: ${profile.visaType}`, 14, 40);

    // Prepare Table Data
    const tableData: any[] = [];
    const dailyGroups: Record<string, { total: number; night: number; breaks: number; overtime: number }> = {};
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    
    stats.shifts.filter(s => s.start >= startOfMonth).forEach(s => {
      const date = getJSTDateString(s.start);
      if (!dailyGroups[date]) dailyGroups[date] = { total: 0, night: 0, breaks: 0, overtime: 0 };
      
      const workMinutes: number[] = [];
      const totalSpan = Math.floor((s.end - s.start) / 60000);
      let breakMinutes = 0;

      for (let i = 0; i < totalSpan; i++) {
        const minuteTime = s.start + (i * 60000);
        const brk = s.breaks.find(b => b.end && minuteTime >= b.start && minuteTime < b.end);
        if (brk) breakMinutes++;
        else workMinutes.push(minuteTime);
      }

      const dailyWorkHours = workMinutes.length / 60;
      dailyGroups[date].total += dailyWorkHours;
      dailyGroups[date].breaks += (breakMinutes / 60);
      
      // Calculate Overtime (Over 8h per day)
      if (dailyGroups[date].total > 8) {
          dailyGroups[date].overtime = dailyGroups[date].total - 8;
      }

      workMinutes.forEach(ts => {
        const h = new Date(ts).getHours();
        if (h >= 22 || h < 5) dailyGroups[date].night += (1/60);
      });
    });

    let totalNight = 0;
    let totalBreaks = 0;
    let totalOvertime = 0;

    Object.entries(dailyGroups).sort((a, b) => a[0].localeCompare(b[0])).forEach(([date, data]) => {
      tableData.push([
        date,
        formatDuration(data.total),
        formatDuration(data.night),
        formatDuration(data.breaks),
        formatDuration(data.overtime)
      ]);
      totalNight += data.night;
      totalBreaks += data.breaks;
      totalOvertime += data.overtime;
    });

    // Summary Totals Row
    tableData.push([
      { content: 'TOTAL', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: formatDuration(stats.monthlyTotal), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: formatDuration(totalNight), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: formatDuration(totalBreaks), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: formatDuration(totalOvertime), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }
    ]);

    autoTable(doc, {
      startY: 50,
      head: [['Date', 'Worked', 'Night (22-05)', 'Breaks', 'Overtime']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [0, 128, 96], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 2, font: "helvetica" },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, finalY);
    doc.text('Note: PDF labels are in English to ensure cross-platform character compatibility.', 14, finalY + 5);

    doc.save(`ShiftReport_${profile.name}_${monthLabel}.pdf`);
  };

  return (
    <div className="flex justify-center bg-gray-200 min-h-screen font-sans">
      <div className="w-full max-w-[430px] bg-gray-50 flex flex-col min-h-screen relative shadow-2xl overflow-hidden ring-1 ring-gray-300">
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b p-4 pt-12 flex justify-between items-center safe-pt">
          <div className="flex items-center gap-2">
             <div className="flex space-x-0.5">
               <div className="w-1.5 h-6 bg-[#f58220] rounded-full"></div>
               <div className="w-1.5 h-6 bg-[#008060] rounded-full"></div>
               <div className="w-1.5 h-6 bg-[#ee1c25] rounded-full"></div>
             </div>
             <h1 className="text-xl font-black italic tracking-tighter text-gray-800">7-11 TRACKER</h1>
          </div>
          <button 
            onClick={() => setIsManualModalOpen(true)}
            className="w-10 h-10 flex items-center justify-center bg-[#008060] text-white rounded-full shadow-lg active:scale-90 transition-transform"
          >
            <Plus size={20} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto pb-32 p-5 space-y-6">
          {activeTab === 'DASHBOARD' && (
            <DashboardView profile={profile} stats={stats} currentStatus={currentStatus} onPunch={handlePunch} onDownloadPDF={generatePDF} />
          )}
          {activeTab === 'HISTORY' && (
            <HistoryView logs={logs} onDelete={handleDelete} />
          )}
          {activeTab === 'SETTINGS' && (
            <SettingsView profile={profile} setProfile={setProfile} onClear={() => {
              storageService.clearAll();
              setLogs([]);
            }} />
          )}
        </main>

        <nav className="absolute bottom-0 w-full bg-white/95 backdrop-blur-md border-t border-gray-100 safe-pb px-6 flex justify-between pt-3 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <TabItem icon={<LayoutDashboard size={24} />} label="メイン" active={activeTab === 'DASHBOARD'} onClick={() => setActiveTab('DASHBOARD')} />
          <TabItem icon={<HistoryIcon size={24} />} label="履歴" active={activeTab === 'HISTORY'} onClick={() => setActiveTab('HISTORY')} />
          <TabItem icon={<SettingsIcon size={24} />} label="設定" active={activeTab === 'SETTINGS'} onClick={() => setActiveTab('SETTINGS')} />
        </nav>

        {isManualModalOpen && (
          <ManualEntryModal 
            onClose={() => setIsManualModalOpen(false)} 
            onAdd={(type, ts) => {
              handlePunch(type, ts);
              setIsManualModalOpen(false);
            }} 
          />
        )}
      </div>
    </div>
  );
}

function TabItem({ icon, label, active, onClick }: any) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 w-16 transition-all ${active ? 'text-[#008060] translate-y-[-2px]' : 'text-gray-400'}`}>
      <div className={active ? 'bg-green-50 p-1.5 rounded-xl' : 'p-1.5'}>{icon}</div>
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  );
}

function DashboardView({ profile, stats, currentStatus, onPunch, onDownloadPDF }: any) {
  return (
    <div className="space-y-6">
      <div className="px-1 flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">お疲れ様、</h2>
          <p className="text-gray-500 font-medium">{profile.name} さん</p>
        </div>
        <button 
          onClick={onDownloadPDF}
          className="flex flex-col items-center gap-1 p-3 bg-white border border-gray-100 rounded-2xl shadow-sm text-[#008060] active:scale-95 transition-all"
        >
          <FileText size={20} />
          <span className="text-[10px] font-bold">PDF出力</span>
        </button>
      </div>

      {profile.visaType === VisaType.STUDENT && stats.weeklyTotal > 20 && (
        <div className={`p-4 rounded-3xl flex items-center gap-3 ${stats.weeklyTotal > WEEKLY_STUDENT_LIMIT ? 'bg-red-500 text-white' : 'bg-orange-100 text-orange-800'}`}>
          <AlertCircle className={stats.weeklyTotal > WEEKLY_STUDENT_LIMIT ? 'animate-pulse' : ''} />
          <div className="text-sm">
            <div className="font-bold">週28時間制限警告</div>
            <div className="opacity-80">今週の累計: {formatDuration(stats.weeklyTotal)}</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 text-center relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-full h-1.5 ${currentStatus === 'NONE' ? 'bg-gray-100' : 'bg-[#008060]'}`}></div>
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">現在の状態</span>
        <div className={`text-5xl font-black mt-3 mb-4 ${currentStatus === 'NONE' ? 'text-gray-200' : 'text-gray-800'}`}>
          {currentStatus === PunchType.CLOCK_IN ? '勤務中' : 
           currentStatus === PunchType.BREAK_START ? '休憩中' :
           currentStatus === PunchType.BREAK_END ? '勤務中' : '未出勤'}
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-full text-xs font-bold text-gray-500 font-mono">
          <Clock size={14} />
          {new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 col-span-2">
          <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">今日の実働</div>
          <div className="text-3xl font-black text-gray-800">{formatDuration(stats.today.total)}</div>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
          <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">今週の累計</div>
          <div className={`text-2xl font-black ${stats.weeklyTotal > WEEKLY_STUDENT_LIMIT ? 'text-red-500' : 'text-gray-800'}`}>{formatDuration(stats.weeklyTotal)}</div>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden">
          <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">今月の累計</div>
          <div className="text-2xl font-black text-gray-800">{formatDuration(stats.monthlyTotal)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pb-4">
        <ActionButton icon={<Play fill="currentColor" size={28} />} label="出勤" sub="ENTRY" color="bg-[#008060]" disabled={currentStatus !== 'NONE'} onClick={() => onPunch(PunchType.CLOCK_IN)} />
        <ActionButton icon={<LogOut size={28} />} label="退勤" sub="EXIT" color="bg-[#ee1c25]" disabled={currentStatus !== PunchType.CLOCK_IN && currentStatus !== PunchType.BREAK_END} onClick={() => onPunch(PunchType.CLOCK_OUT)} />
        <ActionButton icon={<Coffee fill="currentColor" size={28} />} label="休憩入" sub="BREAK" color="bg-[#f58220]" disabled={currentStatus !== PunchType.CLOCK_IN && currentStatus !== PunchType.BREAK_END} onClick={() => onPunch(PunchType.BREAK_START)} />
        <ActionButton icon={<Clock size={28} />} label="休憩戻" sub="BACK" color="bg-blue-500" disabled={currentStatus !== PunchType.BREAK_START} onClick={() => onPunch(PunchType.BREAK_END)} />
      </div>
    </div>
  );
}

function ActionButton({ icon, label, sub, color, onClick, disabled }: any) {
  return (
    <button onClick={onClick} disabled={disabled} className={`h-32 rounded-[2rem] flex flex-col items-center justify-center gap-1 shadow-md active:scale-95 transition-all ${disabled ? 'bg-gray-200 text-gray-400 shadow-none grayscale opacity-30' : `${color} text-white shadow-lg`}`}>
      {icon}
      <span className="text-lg font-black mt-1">{label}</span>
      <span className="text-[10px] font-bold opacity-60 tracking-widest">{sub}</span>
    </button>
  );
}

function HistoryView({ logs, onDelete }: any) {
  const grouped = useMemo(() => {
    const groups: Record<string, PunchLog[]> = {};
    logs.forEach(l => {
      const date = getJSTDateString(l.timestamp);
      if (!groups[date]) groups[date] = [];
      groups[date].push(l);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [logs]);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-black text-gray-900 tracking-tight px-1">履歴</h2>
      {grouped.map(([date, dayLogs]) => (
        <div key={date} className="space-y-2">
          <div className="px-2 flex justify-between items-center">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{date}</span>
          </div>
          <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 divide-y divide-gray-50">
            {dayLogs.sort((a, b) => b.timestamp - a.timestamp).map(l => (
              <div key={l.id} className="p-4 flex justify-between items-center group">
                <div className="flex items-center gap-3">
                  <div className={`w-1 h-8 rounded-full ${
                    l.type === PunchType.CLOCK_IN ? 'bg-[#008060]' :
                    l.type === PunchType.CLOCK_OUT ? 'bg-[#ee1c25]' :
                    l.type === PunchType.BREAK_START ? 'bg-[#f58220]' : 'bg-blue-500'
                  }`}></div>
                  <div>
                    <div className="text-sm font-bold text-gray-700">
                      {l.type === PunchType.CLOCK_IN ? '出勤' :
                       l.type === PunchType.CLOCK_OUT ? '退勤' :
                       l.type === PunchType.BREAK_START ? '休憩入' : '休憩戻'}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono">
                      {new Date(l.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => onDelete(l.id)}
                  className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {logs.length === 0 && (
        <div className="py-20 text-center text-gray-300 font-bold italic">履歴はありません</div>
      )}
    </div>
  );
}

function SettingsView({ profile, setProfile, onClear }: any) {
  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-black text-gray-900 tracking-tight px-1">設定</h2>
      <div className="space-y-4">
        <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 p-6 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">お名前</span>
            <input className="text-right text-[#008060] font-black outline-none border-b border-transparent focus:border-green-200" value={profile.name} onChange={e => {
              const updated = {...profile, name: e.target.value};
              storageService.setProfile(updated);
              setProfile(updated);
            }} />
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-gray-50">
            <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">ビザ</span>
            <div className="flex gap-2">
              {[VisaType.STUDENT, VisaType.REGULAR].map(v => (
                <button key={v} onClick={() => {
                  const updated = {...profile, visaType: v};
                  storageService.setProfile(updated);
                  setProfile(updated);
                }} className={`text-[10px] font-black px-4 py-1.5 rounded-full transition-all ${profile.visaType === v ? 'bg-[#008060] text-white shadow-md' : 'bg-gray-100 text-gray-400'}`}>
                  {v === VisaType.STUDENT ? '学生' : '一般'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 divide-y divide-gray-50">
          <button onClick={() => { if(confirm('全データを削除しますか？')) onClear(); }} className="w-full p-5 flex justify-between items-center text-red-500 active:bg-red-50 transition-colors">
            <span className="font-bold">データをリセット</span>
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualEntryModal({ onClose, onAdd }: any) {
  const [type, setType] = useState<PunchType>(PunchType.CLOCK_IN);
  const [dateTime, setDateTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });

  const types = [
    { value: PunchType.CLOCK_IN, label: '出勤', color: 'bg-green-500' },
    { value: PunchType.CLOCK_OUT, label: '退勤', color: 'bg-red-500' },
    { value: PunchType.BREAK_START, label: '休憩入', color: 'bg-orange-500' },
    { value: PunchType.BREAK_END, label: '休憩戻', color: 'bg-blue-500' },
  ];

  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-white w-full rounded-[2.5rem] p-8 shadow-2xl space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-2xl font-black text-gray-800 tracking-tight">手動入力</h3>
          <button onClick={onClose} className="p-2 bg-gray-100 rounded-full text-gray-400"><X size={20}/></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {types.map(t => (
            <button key={t.value} onClick={() => setType(t.value)} className={`p-4 rounded-2xl border-2 font-bold transition-all text-sm ${type === t.value ? `border-gray-800 bg-gray-800 text-white` : 'border-gray-100 text-gray-400 bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">日時を選択</label>
          <div className="relative">
            <input type="datetime-local" className="w-full bg-gray-50 p-4 rounded-2xl border-2 border-gray-100 outline-none focus:border-[#008060] transition-colors font-mono font-bold" value={dateTime} onChange={e => setDateTime(e.target.value)} />
            <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
          </div>
        </div>

        <button onClick={() => onAdd(type, new Date(dateTime).getTime())} className="w-full py-5 bg-[#008060] text-white rounded-3xl font-black text-xl shadow-xl shadow-green-100 active:scale-95 transition-transform flex items-center justify-center gap-2">
          <Save size={24} />
          記録を保存
        </button>
      </div>
    </div>
  );
}

function SetupView({ onComplete }: { onComplete: (p: UserProfile) => void }) {
  const [name, setName] = useState('');
  const [visa, setVisa] = useState(VisaType.STUDENT);

  return (
    <div className="flex justify-center bg-gray-200 min-h-screen">
      <div className="w-full max-w-[430px] bg-white p-10 flex flex-col justify-center safe-pb safe-pt relative shadow-2xl">
        <div className="flex space-x-1 mb-8">
           <div className="w-2 h-10 bg-[#f58220] rounded-full"></div>
           <div className="w-2 h-10 bg-[#008060] rounded-full"></div>
           <div className="w-2 h-10 bg-[#ee1c25] rounded-full"></div>
        </div>
        <h1 className="text-4xl font-black text-gray-900 leading-tight">設定を<br/>はじめましょう</h1>
        <div className="mt-12 space-y-8">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">お名前</label>
            <input type="text" className="w-full text-2xl font-black border-b-4 border-gray-100 focus:border-[#008060] outline-none pb-2 transition-colors placeholder:text-gray-200" placeholder="田中" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-4">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">ビザの種類</label>
            <div className="flex gap-3">
              {[VisaType.STUDENT, VisaType.REGULAR].map(v => (
                <button key={v} onClick={() => setVisa(v)} className={`flex-1 py-4 rounded-3xl font-bold transition-all border-4 ${visa === v ? 'bg-[#008060] text-white border-[#008060]' : 'bg-gray-50 text-gray-400 border-gray-50'}`}>
                  {v === VisaType.STUDENT ? '学生' : '一般'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button disabled={!name} onClick={() => onComplete({ name, visaType: visa, isSetup: true })} className="mt-16 w-full py-5 bg-[#008060] text-white rounded-3xl font-black text-xl shadow-xl shadow-green-100 active:scale-95 transition-transform disabled:opacity-30 disabled:grayscale">
          はじめる
        </button>
      </div>
    </div>
  );
}
