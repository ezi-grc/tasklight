import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db, tasksCollection, categoriesCollection } from "./firebase";
import {
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  where,
  getDocs
} from "firebase/firestore";
import "./App.css";

// Audio Setup
const CLICK_SOUND = new Audio("https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3");
const COMPLETE_SOUND = new Audio("https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3");
const TIMER_ALARM = new Audio("https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3"); 

CLICK_SOUND.volume = 0.3;
COMPLETE_SOUND.volume = 0.5;
TIMER_ALARM.volume = 0.6;
TIMER_ALARM.loop = false;

interface Task { id: string; text: string; completed: boolean; categoryId: string; }
interface Category { id: string; name: string; }

const COLORS = [
  { hex: "#284139", text: "#F8D794" },
  { hex: "#809076", text: "#111A19" },
  { hex: "#F8D794", text: "#111A19" },
  { hex: "#B86830", text: "#F8D794" },
  { hex: "#111A19", text: "#F8D794" }
];

const Fireflies = React.memo(() => {
  const fireflyData = useMemo(() => {
    return [...Array(15)].map((_, i) => ({
      id: i, top: Math.random() * 100, left: Math.random() * 100,
      delay: Math.random() * 10, duration: 20 + Math.random() * 10
    }));
  }, []);
  return (
    <div className="firefly-container">
      {fireflyData.map((f) => (
        <div key={f.id} className="firefly" style={{ 
          top: `${f.top}%`, left: `${f.left}%`,
          animationDelay: `${f.delay}s`, animationDuration: `${f.duration}s`
        }} />
      ))}
    </div>
  );
});

function App() {
  const [taskInput, setTaskInput] = useState("");
  const [catInput, setCatInput] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCatId, setActiveCatId] = useState<string>("general");
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Sidebar State
  const [isCatSidebarOpen, setCatSidebarOpen] = useState(false);
  const [isTimerSidebarOpen, setTimerSidebarOpen] = useState(false);

  // Timer State
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);
  const [timerTime, setTimerTime] = useState(0); 
  const [tSegments, setTSegments] = useState({ h: "00", m: "00", s: "00" });
  const timerRef = useRef<any>(null);
  const alarmIntervalRef = useRef<any>(null);

  const activeCategoryName = activeCatId === "general" ? "General Tab" : (categories.find(c => c.id === activeCatId)?.name || "General Tab");

  // UX Logic: Close all sidebars
  const closeAllSidebars = () => {
    setCatSidebarOpen(false);
    setTimerSidebarOpen(false);
  };

  const playSound = (type: "click" | "complete" | "alarm" = "click") => {
    if (type === "click") { CLICK_SOUND.currentTime = 0; CLICK_SOUND.play().catch(() => {}); }
    if (type === "complete") { COMPLETE_SOUND.currentTime = 0; COMPLETE_SOUND.play().catch(() => {}); }
    if (type === "alarm") {
        TIMER_ALARM.currentTime = 0;
        TIMER_ALARM.play().catch(() => {});
        alarmIntervalRef.current = setTimeout(() => {
            if (isAlarmPlaying) playSound("alarm");
        }, 4500); 
    }
  };

  useEffect(() => {
    if (isAlarmPlaying) {
        playSound("alarm");
    } else {
        if (alarmIntervalRef.current) clearTimeout(alarmIntervalRef.current);
        TIMER_ALARM.pause();
        TIMER_ALARM.currentTime = 0;
    }
    return () => { if (alarmIntervalRef.current) clearTimeout(alarmIntervalRef.current); };
  }, [isAlarmPlaying]);

  useEffect(() => {
    if (isTimerActive && timerTime > 0) {
      timerRef.current = setInterval(() => {
        setTimerTime((prev) => prev - 1);
      }, 1000);
    } else if (timerTime === 0 && isTimerActive) {
      clearInterval(timerRef.current);
      setIsTimerActive(false);
      setIsAlarmPlaying(true); 
    }
    return () => clearInterval(timerRef.current);
  }, [isTimerActive, timerTime]);

  const startRitual = () => {
    const total = (parseInt(tSegments.h) * 3600) + (parseInt(tSegments.m) * 60) + parseInt(tSegments.s);
    if (total > 0) {
      setTimerTime(total);
      setIsTimerActive(true);
      playSound("click");
    }
  };

  const handleReset = () => {
    setIsTimerActive(false);
    setIsAlarmPlaying(false);
    setTimerTime(0);
    setTSegments({ h: "00", m: "00", s: "00" });
    if (timerRef.current) clearInterval(timerRef.current);
    playSound("click");
  };

  const handleSegmentChange = (field: 'h'|'m'|'s', val: string) => {
    let digits = val.replace(/\D/g, "").slice(-2);
    if ((field === 'm' || field === 's') && parseInt(digits) > 59) digits = "59";
    setTSegments(prev => ({ ...prev, [field]: digits.padStart(2, "0") }));
  };

  const formatCountdown = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    const s = (totalSeconds % 60).toString().padStart(2, "0");
    return { h, m, s };
  };

  const liveTime = isTimerActive || timerTime > 0 ? formatCountdown(timerTime) : tSegments;

  useEffect(() => {
    const q = query(categoriesCollection, orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Category[]));
  }, []);

  useEffect(() => {
    setTasks([]); 
    const q = query(tasksCollection, where("categoryId", "==", activeCatId), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Task[]));
  }, [activeCatId]);

  const toggleTask = async (id: string, currentStatus: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentStatus) playSound("complete"); else playSound("click");
    await updateDoc(doc(db, "tasks", id), { completed: !currentStatus });
  };

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catInput.trim()) return;
    playSound("click");
    const docRef = await addDoc(categoriesCollection, { name: catInput, createdAt: serverTimestamp() });
    setCatInput("");
    setActiveCatId(docRef.id);
  };

  const removeCategory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playSound("click");
    try {
        const q = query(tasksCollection, where("categoryId", "==", id));
        const snap = await getDocs(q);
        const deleteBatch = snap.docs.map(t => deleteDoc(doc(db, "tasks", t.id)));
        await Promise.all(deleteBatch);
        await deleteDoc(doc(db, "categories", id));
        if (activeCatId === id) setActiveCatId("general");
    } catch (err) { console.error(err); }
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskInput.trim()) return;
    playSound("click");
    await addDoc(tasksCollection, { text: taskInput, completed: false, categoryId: activeCatId, createdAt: serverTimestamp() });
    setTaskInput("");
  };

  return (
    <div className="app-wrapper" onClick={closeAllSidebars}>
      <Fireflies />
      
      {/* Backdrop for mobile UX */}
      <AnimatePresence>
        {(isCatSidebarOpen || isTimerSidebarOpen) && (
          <motion.div className="sidebar-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
        )}
      </AnimatePresence>

      <main className="main-content">
        <header className="hero">
          <div className="timer-toggle-btn" onClick={(e) => { e.stopPropagation(); playSound(); setTimerSidebarOpen(!isTimerSidebarOpen); setCatSidebarOpen(false); }}>
            <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
          </div>
          <div className="cat-toggle-btn" onClick={(e) => { e.stopPropagation(); playSound(); setCatSidebarOpen(!isCatSidebarOpen); setTimerSidebarOpen(false); }}>
            <svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
          </div>
          <h1 className="title">Nexus</h1>
          <p className="subtitle">Your tasks, organized at one nexus.</p>
        </header>

        <div className="viewing-container">
          <AnimatePresence mode="wait">
            <motion.div key={activeCatId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="viewing-text">
              Viewing — {activeCategoryName}
            </motion.div>
          </AnimatePresence>
        </div>

        <form className="input-container" onSubmit={addTask} onClick={(e) => e.stopPropagation()}>
          <input value={taskInput} onChange={e => setTaskInput(e.target.value)} placeholder="Channel a task..." />
          <button type="submit" className="add-btn">ADD</button>
        </form>

        <div className="task-list" onClick={(e) => e.stopPropagation()}>
          <AnimatePresence mode="popLayout">
            {tasks.map((t, index) => {
              const theme = COLORS[index % COLORS.length];
              return (
                <motion.div key={t.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0, scale: t.completed ? [1, 1.02, 1] : 1 }} exit={{ opacity: 0, scale: 0.9 }} className={`task-card ${t.completed ? 'is-done' : ''}`} style={{ backgroundColor: theme.hex, color: theme.text }}>
                  <AnimatePresence>{t.completed && <motion.div className="shine-effect" initial={{ left: "-100%" }} animate={{ left: "150%" }} transition={{ duration: 0.8, ease: "easeOut" }} />}</AnimatePresence>
                  <button className="delete-icon" onClick={(e) => { e.stopPropagation(); playSound(); deleteDoc(doc(db, "tasks", t.id)); }}>×</button>
                  <div className="task-body">
                    {editingId === t.id ? (
                      <input className="edit-input" autoFocus defaultValue={t.text} onBlur={(e) => { if (e.target.value !== t.text) playSound(); updateDoc(doc(db, "tasks", t.id), { text: e.target.value }); setEditingId(null); }} />
                    ) : ( <div className="task-header" onClick={() => { playSound(); setEditingId(t.id); }}>{t.text}</div> )}
                    <div className="task-footer" onClick={(e) => toggleTask(t.id, t.completed, e)}>
                      <div className="meta-item"><span className="meta-label">STATUS</span><span className="meta-value">{t.completed ? " DONE " : " ACTIVE "}</span></div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </main>

      <aside className={`sidebar sidebar-left ${isTimerSidebarOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="sidebar-inner">
          <h2 className="sidebar-title">Ritual Timer</h2>
          <div className="timer-ritual-display">
            {isTimerActive || timerTime > 0 ? (
                <div className="timer-readonly">{liveTime.h}:{liveTime.m}:{liveTime.s}</div>
            ) : (
                <>
                  <input type="text" inputMode="numeric" value={liveTime.h} onChange={(e) => handleSegmentChange('h', e.target.value)} onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <span>:</span>
                  <input type="text" inputMode="numeric" value={liveTime.m} onChange={(e) => handleSegmentChange('m', e.target.value)} onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <span>:</span>
                  <input type="text" inputMode="numeric" value={liveTime.s} onChange={(e) => handleSegmentChange('s', e.target.value)} onClick={(e) => (e.target as HTMLInputElement).select()} />
                </>
            )}
          </div>
          <div className="timer-controls">
            {isAlarmPlaying ? (
                <button className="timer-btn alarm-stop" onClick={handleReset}>Stop Ritual</button>
            ) : !isTimerActive && timerTime === 0 ? (
              <button className="timer-btn start" onClick={startRitual}>Begin Ritual</button>
            ) : (
              <button className="timer-btn reset" onClick={handleReset}>Reset Ritual</button>
            )}
          </div>
          <p style={{fontSize: '0.6rem', marginTop: '30px', opacity: 0.4, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '2px'}}>Linked to: {activeCategoryName}</p>
        </div>
      </aside>

      <aside className={`sidebar sidebar-right ${isCatSidebarOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="sidebar-inner">
          <h2 className="sidebar-title">Categories</h2>
          <nav className="cat-list">
            <div className="cat-item-row">
              <button className={`cat-item ${activeCatId === 'general' ? 'active' : ''}`} onClick={() => { playSound(); setActiveCatId('general'); closeAllSidebars(); }}>General Tab</button>
            </div>
            {categories.map(cat => (
              <div key={cat.id} className="cat-item-row">
                <button className={`cat-item ${activeCatId === cat.id ? 'active' : ''}`} onClick={() => { playSound(); setActiveCatId(cat.id); closeAllSidebars(); }}>{cat.name}</button>
                <button className="cat-delete-btn" onClick={(e) => removeCategory(cat.id, e)}>×</button>
              </div>
            ))}
          </nav>
          <form className="cat-form" onSubmit={addCategory}>
            <input value={catInput} onChange={e => setCatInput(e.target.value)} placeholder="New Link..." />
            <button type="submit">+</button>
          </form>
        </div>
      </aside>
    </div>
  );
}

export default App;