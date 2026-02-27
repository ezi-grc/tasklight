import React, { useState, useEffect, useMemo } from "react";
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
  where
} from "firebase/firestore";
import "./App.css";

const CLICK_SOUND = new Audio("https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3");
const COMPLETE_SOUND = new Audio("https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3");
CLICK_SOUND.volume = 0.3;
COMPLETE_SOUND.volume = 0.5;

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
  const [activeCatId, setActiveCatId] = useState<string>("default");
  const [editingId, setEditingId] = useState<string | null>(null);

  const activeCategoryName = categories.find(c => c.id === activeCatId)?.name || "...";

  const playSound = (type: "click" | "complete" = "click") => {
    const audio = type === "complete" ? COMPLETE_SOUND : CLICK_SOUND;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  };

  useEffect(() => {
    const q = query(categoriesCollection, orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Category[];
      setCategories(data);
      if (data.length > 0 && activeCatId === "default") setActiveCatId(data[0].id);
    });
  }, [activeCatId]);

  useEffect(() => {
    if (activeCatId === "default") return;
    setTasks([]); 
    const q = query(tasksCollection, where("categoryId", "==", activeCatId), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Task[]);
    });
  }, [activeCatId]);

  const toggleTask = async (id: string, currentStatus: boolean) => {
    if (!currentStatus) playSound("complete");
    else playSound("click");
    await updateDoc(doc(db, "tasks", id), { completed: !currentStatus });
  };

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catInput.trim()) return;
    playSound();
    const docRef = await addDoc(categoriesCollection, { name: catInput, createdAt: serverTimestamp() });
    setCatInput("");
    setActiveCatId(docRef.id);
  };

  const removeCategory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playSound();
    await deleteDoc(doc(db, "categories", id));
    if (activeCatId === id) {
      const remaining = categories.filter(c => c.id !== id);
      if (remaining.length > 0) setActiveCatId(remaining[0].id);
      else setActiveCatId("default");
    }
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskInput.trim() || activeCatId === "default") return;
    playSound();
    await addDoc(tasksCollection, { text: taskInput, completed: false, categoryId: activeCatId, createdAt: serverTimestamp() });
    setTaskInput("");
  };

  return (
    <div className="app-wrapper">
      <Fireflies />
      <main className="main-content">
        <header className="hero">
          <h1 className="title">Nexus</h1>
          <p className="subtitle">Your tasks, organized at one nexus.</p>
        </header>

        <div className="viewing-container">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCatId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="viewing-text"
            >
              Viewing — {activeCategoryName}
            </motion.div>
          </AnimatePresence>
        </div>

        <form className="input-container" onSubmit={addTask}>
          <input value={taskInput} onChange={e => setTaskInput(e.target.value)} placeholder="Channel a task..." />
          <button type="submit" className="add-btn">ADD</button>
        </form>

        <div className="task-list">
          <AnimatePresence mode="popLayout">
            {tasks.map((t, index) => {
              const theme = COLORS[index % COLORS.length];
              return (
                <motion.div
                  key={t.id} layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0, scale: t.completed ? [1, 1.02, 1] : 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={`task-card ${t.completed ? 'is-done' : ''}`}
                  style={{ backgroundColor: theme.hex, color: theme.text }}
                >
                  <AnimatePresence>
                    {t.completed && (
                      <motion.div 
                        className="shine-effect"
                        initial={{ left: "-100%" }}
                        animate={{ left: "150%" }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    )}
                  </AnimatePresence>
                  <button className="delete-icon" onClick={(e) => { e.stopPropagation(); playSound(); deleteDoc(doc(db, "tasks", t.id)); }}>×</button>
                  <div className="task-body">
                    {editingId === t.id ? (
                      <input 
                        className="edit-input" autoFocus
                        defaultValue={t.text}
                        onBlur={(e) => {
                          if (e.target.value !== t.text) playSound();
                          updateDoc(doc(db, "tasks", t.id), { text: e.target.value });
                          setEditingId(null);
                        }}
                      />
                    ) : (
                      <div className="task-header" onClick={() => { playSound(); setEditingId(t.id); }}>{t.text}</div>
                    )}
                    <div className="task-footer" onClick={() => toggleTask(t.id, t.completed)}>
                      <div className="meta-item">
                        <span className="meta-label">STATUS</span>
                        <span className="meta-value">{t.completed ? "DONE" : "ACTIVE"}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </main>

      <aside className="sidebar">
        <div className="sidebar-trigger">☰</div>
        <div className="sidebar-inner">
          <h2 className="sidebar-title">Categories</h2>
          <nav className="cat-list">
            {categories.map(cat => (
              <div key={cat.id} className="cat-item-row">
                <button 
                  className={`cat-item ${activeCatId === cat.id ? 'active' : ''}`}
                  onClick={() => { playSound(); setActiveCatId(cat.id); }}
                >
                  {cat.name}
                </button>
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