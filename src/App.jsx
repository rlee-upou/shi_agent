import React, { useState, useEffect } from 'react';

import { 
  Wifi, WifiOff, Save, CloudUpload, UserPlus, Activity, Clock, MapPin, CheckCircle2, AlertCircle, User, Lock, Mail, LogOut, Key
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
  // --- PREVIOUS CODE ---
  // const [entries, setEntries] = useState([]);

  // --- NEW CODE ---
  const [entries, setEntries] = useState(() => {
    const savedLogs = localStorage.getItem('shi_agent_pending_logs');
    if (savedLogs) {
      try {
        const parsedLogs = JSON.parse(savedLogs);
        // CRITICAL SAFETY CATCH: If the user closed the browser while an item 
        // was stuck in 'SYNCING', revert it to 'PENDING_SYNC' on reload so it isn't stuck forever.
        return parsedLogs.map(entry => 
          entry.status === 'SYNCING' ? { ...entry, status: 'PENDING_SYNC' } : entry
        );
      } catch (error) {
        console.error("Failed to parse local logs", error);
        return [];
      }
    }
    return [];
  });

  const [barangays, setBarangays] = useState([]);
  
  // Form State
  const [steps, setSteps] = useState('');
  const [gender, setGender] = useState('Female');
  const [walkMins, setWalkMins] = useState('');
  const [runMins, setRunMins] = useState('');
  const [bikeMins, setBikeMins] = useState('');
  const [otherMins, setOtherMins] = useState('');
  const [selectedBarangay, setSelectedBarangay] = useState('');
  const [ageGroup, setAgeGroup] = useState('25-34');

  // --- Auth State ---
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'update_password'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');

  // --- Authentication Listener ---

  // --- Auth & Role Verification ---
  const verifyRole = async (currentSession) => {
    if (!currentSession) {
      setSession(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('id', currentSession.user.id)
        .single();
        
      if (error) throw error;
      
      if (data && data.role === 'field_agent') {
        setSession(currentSession); // Grant access
      } else {
        await supabase.auth.signOut(); // Force logout
        setAuthError('Access denied: Field Agent privileges required.');
        setSession(null);
      }
    } catch (err) {
      await supabase.auth.signOut();
      setAuthError('Authentication failed or user role not found.');
      setSession(null);
    }
  };



  // --- Authentication Listener ---
  useEffect(() => {
    // 1. Check if they arrived via an email invite/recovery link
    if (window.location.hash.includes('type=invite') || window.location.hash.includes('type=recovery')) {
      setAuthMode('update_password');
    }

    // 2. Get initial session and verify role
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) verifyRole(session);
    });

    // 3. Listen for changes (logins, logouts)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        verifyRole(session);
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
      }
      if (event === 'PASSWORD_RECOVERY') setAuthMode('update_password');
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- Auth Functions ---
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (authMode === 'update_password') {
        // This is for invited users setting their password for the first time
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setAuthMode('login');
        alert('Password set successfully! You are now securely logged in.');
        // Clean up the URL hash
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setPasswordMsg('');
    
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    
    setAuthLoading(false);
    if (error) {
      setPasswordMsg(error.message);
    } else {
      alert('Password updated successfully!');
      setIsChangingPassword(false);
      setNewPassword('');
    }
  };
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

  useEffect(() => {
    // Filter the array: We ONLY want to save items to the hard drive 
    // if they have not successfully reached the database yet.
    const itemsToSave = entries.filter(entry => entry.status !== 'SYNCED');
    
    localStorage.setItem('shi_agent_pending_logs', JSON.stringify(itemsToSave));
  }, [entries]);

  // Handle Form Submission
  const handleLogData = async (e) => {
    e.preventDefault();
    if (!steps || !selectedBarangay) return;

    const w = parseInt(walkMins) || 0;
    const r = parseInt(runMins) || 0;
    const b = parseInt(bikeMins) || 0;
    const o = parseInt(otherMins) || 0;
    const totalMins = w + r + b + o;

    const newEntry = {
      local_id: `QC-${Math.floor(Math.random() * 9000) + 1000}`,
      agent_id: session?.user?.id,
      barangay_id: selectedBarangay,
      ageGroup: ageGroup,
      gender: gender, // ADDED
      steps: parseInt(steps),
      walkMins: w,    // ADDED
      runMins: r,     // ADDED
      bikeMins: b,    // ADDED
      otherMins: o,   // ADDED
      totalMins: totalMins, // UPDATED from 'mins'
      status: isOnline ? 'SYNCING' : 'PENDING_SYNC',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: new Date().toISOString()
    };

    // Add to UI immediately for fast user feedback
    setEntries([newEntry, ...entries]);
    setSteps('');
    setWalkMins('');
    setRunMins('');
    setBikeMins('');
    setOtherMins('');

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
          gender_at_birth: entry.gender, // ADDED
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
          field_agent_id: entry.agent_id,
          source_type: 'FIELD_AGENT',
          daily_steps: entry.steps,
          weekly_exercise_mins: entry.totalMins,     // UPDATED
          walking_mins_weekly: entry.walkMins,       // ADDED
          running_mins_weekly: entry.runMins,        // ADDED
          biking_mins_weekly: entry.bikeMins,        // ADDED
          other_sports_mins_weekly: entry.otherMins, // ADDED
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

  // --- RENDER AUTHENTICATION SCREEN IF NOT LOGGED IN ---
  if (!session || authMode === 'update_password') {
    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col justify-center px-4 py-12">
        <div className="max-w-md mx-auto w-full bg-white rounded-3xl shadow-sm p-8 border border-slate-100">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="bg-[#1E40AF] text-white p-3 rounded-2xl border border-blue-800 mb-4">
              <span className="font-black text-xl">QC</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {authMode === 'login' ? 'Agent Login' : 'Set Your Password'}
            </h1>
            <p className="text-slate-500 text-sm font-medium mt-1">
              {authMode === 'login' 
                ? 'Welcome back to the Smart Health Index' 
                : 'Please create a secure password to activate your account.'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authError && (
              <div className="bg-rose-50 text-rose-600 p-3 rounded-xl text-sm font-bold border border-rose-100 text-center">
                {authError}
              </div>
            )}

            {authMode === 'login' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-[#1E40AF] uppercase tracking-widest flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Email Address
                </label>
                <input 
                  type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#1E40AF] outline-none transition-all"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-[#1E40AF] uppercase tracking-widest flex items-center gap-1">
                <Lock className="w-3 h-3" /> {authMode === 'login' ? 'Password' : 'New Password'}
              </label>
              <input 
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#1E40AF] outline-none transition-all"
              />
            </div>

            <button 
              type="submit" disabled={authLoading}
              className="w-full py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all active:scale-95 bg-[#1E40AF] text-white shadow-lg shadow-blue-900/20 hover:bg-blue-800 mt-2 disabled:opacity-70"
            >
              {authLoading ? 'PLEASE WAIT...' : (authMode === 'login' ? 'LOG IN' : 'SAVE & CONTINUE')}
            </button>
          </form>
        </div>
      </div>
    );
  }

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
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Field Agent Portal</h1>
              <p className="text-slate-500 text-sm font-medium">Database Connected</p>
            </div>
          </div>
          
          {/* Controls: Password, Logout & Network Toggle */}
          <div className="flex items-center gap-2">

            {/* NEW: Change Password Toggle */}
            <button 
              onClick={() => setIsChangingPassword(!isChangingPassword)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                isChangingPassword ? 'bg-[#1E40AF] text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
            </button>

            <button 
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors bg-slate-100 text-slate-500 hover:bg-slate-200"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
            
            <button 
              onClick={() => setIsOnline(!isOnline)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                isOnline ? 'bg-teal-500/20 text-teal-700 border border-teal-500/50' : 'bg-rose-500/20 text-rose-700 border border-rose-500/50'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-md mx-auto px-4 py-6 space-y-6">

        {/* CHANGE PASSWORD FORM */}
        {isChangingPassword && (
          <section className="bg-white rounded-3xl shadow-sm p-6 border border-slate-100 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Key className="w-5 h-5 text-[#1E40AF]" />
                Change Password
              </h2>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              {passwordMsg && (
                <div className="bg-rose-50 text-rose-600 p-3 rounded-xl text-xs font-bold border border-rose-100 text-center">
                  {passwordMsg}
                </div>
              )}
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-[#1E40AF] uppercase tracking-widest flex items-center gap-1">
                  <Lock className="w-3 h-3" /> New Password
                </label>
                <input 
                  type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter a secure password"
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-900 focus:border-[#1E40AF] outline-none transition-all"
                />
              </div>

              <button 
                type="submit" disabled={authLoading}
                className="w-full py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all active:scale-95 bg-[#1E40AF] text-white shadow-lg shadow-blue-900/20 hover:bg-blue-800 disabled:opacity-70"
              >
                {authLoading ? 'SAVING...' : 'UPDATE PASSWORD'}
              </button>
            </form>
          </section>
        )}
        
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

            {/* Wrap Demographic fields in a 2-column grid */}
            <div className="grid grid-cols-2 gap-3">

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

              {/* NEW Gender Block */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-[#1E40AF] uppercase tracking-widest flex items-center gap-1">
                  <User className="w-3 h-3" /> Gender
                </label>
                <select 
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-700 focus:border-[#1E40AF] outline-none appearance-none"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                </select>
              </div>
            
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
                <Clock className="w-3 h-3" /> Weekly Exercise Breakdown (Mins)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <input 
                  type="number" 
                  value={walkMins}
                  onChange={(e) => setWalkMins(e.target.value)}
                  placeholder="Walking" 
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-lg font-black text-slate-900 focus:border-[#1E40AF] transition-all outline-none placeholder:text-sm placeholder:font-bold"
                />
                <input 
                  type="number" 
                  value={runMins}
                  onChange={(e) => setRunMins(e.target.value)}
                  placeholder="Running" 
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-lg font-black text-slate-900 focus:border-[#1E40AF] transition-all outline-none placeholder:text-sm placeholder:font-bold"
                />
                <input 
                  type="number" 
                  value={bikeMins}
                  onChange={(e) => setBikeMins(e.target.value)}
                  placeholder="Biking" 
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-lg font-black text-slate-900 focus:border-[#1E40AF] transition-all outline-none placeholder:text-sm placeholder:font-bold"
                />
                <input 
                  type="number" 
                  value={otherMins}
                  onChange={(e) => setOtherMins(e.target.value)}
                  placeholder="Other" 
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-lg font-black text-slate-900 focus:border-[#1E40AF] transition-all outline-none placeholder:text-sm placeholder:font-bold"
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
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {entry.totalMins}m</span>
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