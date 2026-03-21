import React, { useState, useEffect } from 'react';

import { 
  Wifi, WifiOff, Save, CloudUpload, UserPlus, Activity, Clock, MapPin, CheckCircle2, AlertCircle, User
} from 'lucide-react';

// ==========================================
// SUPABASE INITIALIZATION
// ==========================================

// IMPORTANT FOR VS CODE: 
// Uncomment the line below when you move to your local VS Code environment!
import { createClient } from '@supabase/supabase-js';


// For local VS Code, you can use your .env file by replacing the two lines below with:
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

//const supabaseUrl = 'https://placeholder.supabase.co';
//const supabaseKey = 'placeholder-key';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  // State Management
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [sessionTarget] = useState(50);
  const [entries, setEntries] = useState([]);
  const [barangays, setBarangays] = useState([]);
  
  // Form State
  const [steps, setSteps] = useState('');
  const [mins, setMins] = useState('');
  const [selectedBarangay, setSelectedBarangay] = useState('');
  const [ageGroup, setAgeGroup] = useState('25-34');

  // Load Barangays from database on startup
  useEffect(() => {
    async function fetchBarangays() {
      const { data, error } = await supabase.from('barangays').select('id, name');
      if (data && data.length > 0) {
        setBarangays(data);
        setSelectedBarangay(data[0].id.toString()); // Default to first barangay
      }
    }
    fetchBarangays();
  }, []);

  // Handle Form Submission
  const handleLogData = async (e) => {
    e.preventDefault();
    if (!steps || !selectedBarangay) return;

    const newEntry = {
      local_id: `QC-${Math.floor(Math.random() * 9000) + 1000}`,
      barangay_id: selectedBarangay,
      ageGroup: ageGroup,
      steps: parseInt(steps),
      mins: parseInt(mins) || 0,
      status: isOnline ? 'SYNCING' : 'PENDING_SYNC',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: new Date().toISOString()
    };

    // Add to UI immediately for fast user feedback
    setEntries([newEntry, ...entries]);
    setSteps('');
    setMins('');

    // If online, push to database immediately
    if (isOnline) {
      await pushToSupabase(newEntry);
    }
  };

  // Push a single entry to Supabase
  const pushToSupabase = async (entry) => {
    try {
      // Step 1: Create the Resident (Anonymous profile)
      const { data: residentData, error: residentError } = await supabase
        .from('residents')
        .insert([{
          barangay_id: parseInt(entry.barangay_id),
          age_group: entry.ageGroup,
          primary_source: 'FIELD_AGENT'
        }])
        .select()
        .single();

      if (residentError) throw residentError;

      // Step 2: Log their Activity
      const { error: activityError } = await supabase
        .from('activity_logs')
        .insert([{
          resident_id: residentData.id,
          source_type: 'FIELD_AGENT',
          daily_steps: entry.steps,
          weekly_exercise_mins: entry.mins,
          local_timestamp: entry.timestamp,
          is_synced: true
        }]);

      if (activityError) throw activityError;

      // Step 3: Update UI to show Success
      setEntries(prev => prev.map(e => 
        e.local_id === entry.local_id ? { ...e, status: 'SYNCED' } : e
      ));

    } catch (error) {
      console.error("Error saving data:", error);
      // If it fails, revert status to pending so it can be retried
      setEntries(prev => prev.map(e => 
        e.local_id === entry.local_id ? { ...e, status: 'PENDING_SYNC' } : e
      ));
      alert("Failed to save to database. It will be kept locally to try again.");
    }
  };

  // Sync all offline data when connection is restored
  const handleSyncAll = async () => {
    if (!isOnline) return;
    setIsSyncing(true);
    
    const pendingEntries = entries.filter(e => e.status === 'PENDING_SYNC');
    
    for (const entry of pendingEntries) {
      // Update UI to show it's currently syncing this one
      setEntries(prev => prev.map(e => 
        e.local_id === entry.local_id ? { ...e, status: 'SYNCING' } : e
      ));
      await pushToSupabase(entry);
    }
    
    setIsSyncing(false);
  };

  const pendingCount = entries.filter(e => e.status === 'PENDING_SYNC').length;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-12">
      
      {/* APP BAR */}
      <nav className="bg-white text-slate-900 sticky top-0 z-50 shadow-sm border-b border-slate-100">
        <div className="max-w-md mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-[#1E40AF] text-white p-1.5 rounded-lg border border-blue-800">
              <span className="font-black text-xs">QC</span>
            </div>
            <div>
              <h1 className="font-bold text-sm leading-none">Field Agent Portal</h1>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mt-0.5">Database Connected</p>
            </div>
          </div>
          
          {/* Network Toggle */}
          <button 
            onClick={() => setIsOnline(!isOnline)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
              isOnline ? 'bg-teal-500/20 text-teal-300 border border-teal-500/50' : 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </button>
        </div>
      </nav>

      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        
        {/* PENDING SYNC BANNER */}
        {pendingCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 p-2 rounded-full text-amber-600">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-900">{pendingCount} Logs Pending</p>
                <p className="text-xs text-amber-700">Stored locally on device</p>
              </div>
            </div>
            <button 
              onClick={handleSyncAll}
              disabled={!isOnline || isSyncing}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                isOnline && !isSyncing
                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20' 
                  : 'bg-amber-200 text-amber-400 cursor-not-allowed'
              }`}
            >
              <CloudUpload className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
              {isSyncing ? 'SYNCING...' : 'SYNC NOW'}
            </button>
          </div>
        )}

        {/* CENSUS FORM */}
        <section className="bg-white rounded-3xl shadow-sm p-6 border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#1E40AF]" />
              New Census Entry
            </h2>
          </div>

          <form onSubmit={handleLogData} className="space-y-5">
            {/* Location Anchor */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Home Anchor
              </label>
              <select 
                value={selectedBarangay}
                onChange={(e) => setSelectedBarangay(e.target.value)}
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-700 focus:border-[#1E40AF] focus:ring-0 transition-all outline-none"
              >
                {barangays.length === 0 ? <option>Loading Barangays...</option> : null}
                {barangays.map(bgy => (
                  <option key={bgy.id} value={bgy.id}>{bgy.name}</option>
                ))}
              </select>
            </div>

            {/* Age Group */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-[#1E40AF] uppercase tracking-widest flex items-center gap-1">
                <User className="w-3 h-3" /> Age Group
              </label>
              <select 
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-700 focus:border-[#1E40AF] outline-none"
              >
                <option value="18-24">18-24 years</option>
                <option value="25-34">25-34 years</option>
                <option value="35-44">35-44 years</option>
                <option value="45-54">45-54 years</option>
                <option value="55-64">55-64 years</option>
                <option value="65+">65+ years (Senior)</option>
              </select>
            </div>

            {/* Steps Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-[#1E40AF] uppercase tracking-widest flex items-center gap-1">
                <Activity className="w-3 h-3" /> Avg. Daily Steps
              </label>
              <div className="relative">
                <input 
                  type="number" 
                  required
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  placeholder="e.g. 5000" 
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-2xl font-black text-slate-900 focus:border-[#1E40AF] transition-all outline-none"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1.5">
                  <button type="button" onClick={() => setSteps(prev => String((parseInt(prev||0) + 500)))} className="bg-slate-200 hover:bg-slate-300 text-slate-600 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors">+500</button>
                  <button type="button" onClick={() => setSteps(prev => String((parseInt(prev||0) + 1000)))} className="bg-slate-200 hover:bg-slate-300 text-slate-600 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors">+1k</button>
                </div>
              </div>
            </div>

            {/* Mins Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-[#1E40AF] uppercase tracking-widest flex items-center gap-1">
                <Clock className="w-3 h-3" /> Weekly Exercise Mins
              </label>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  value={mins}
                  onChange={(e) => setMins(e.target.value)}
                  placeholder="Total minutes" 
                  className="flex-grow p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-2xl font-black text-slate-900 focus:border-[#1E40AF] transition-all outline-none"
                />
              </div>
            </div>

            <button 
              type="submit"
              className={`w-full py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all active:scale-95 ${
                isOnline 
                  ? 'bg-[#1E40AF] text-white shadow-lg shadow-blue-900/20 hover:bg-blue-800' 
                  : 'bg-slate-800 text-white shadow-lg shadow-slate-900/20 hover:bg-slate-700'
              }`}
            >
              {isOnline ? <CloudUpload className="w-5 h-5" /> : <Save className="w-5 h-5" />}
              {isOnline ? 'LOG TO SUPABASE' : 'SAVE LOCALLY'}
            </button>
          </form>
        </section>

        {/* RECENT ENTRIES LIST */}
        <section className="space-y-3">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest px-2">Session Logs</h3>
          
          {entries.length === 0 && (
             <div className="text-center p-6 text-slate-400 text-sm">No entries submitted yet.</div>
          )}

          <div className="space-y-2">
            {entries.map((entry, idx) => (
              <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-sm text-slate-900">{entry.local_id}</span>
                    <span className="text-[10px] text-slate-400">{entry.time}</span>
                  </div>
                  <div className="text-xs font-medium text-slate-500 flex gap-3">
                    <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {entry.steps.toLocaleString()}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {entry.mins}m</span>
                  </div>
                </div>
                <div>
                  {entry.status === 'SYNCED' ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-teal-50 text-teal-600 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> SAVED TO DB
                    </span>
                  ) : entry.status === 'SYNCING' ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">
                      <CloudUpload className="w-3 h-3 animate-pulse" /> SYNCING...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full">
                      <Save className="w-3 h-3" /> OFFLINE
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}