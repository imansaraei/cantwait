import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Flame,
  Plus,
  RotateCcw,
  Check,
  X,
  Copy,
  Sparkles,
  BarChart3,
  Layers,
  Send,
  LogIn,
  LogOut,
  Mail,
} from 'lucide-react';
import { IdeaItem, IdeaType, IdeaStatus } from './types';
import {
  onAuthChange,
  signInWithGoogle,
  requestEmailCode,
  verifyEmailCode,
  signOut,
  type AuthUser,
} from './auth';

const INITIAL_IDEAS: IdeaItem[] = [
  {
    id: 'cw-1',
    type: 'Content',
    format: 'Video',
    title: 'Why I ditched 5 productivity apps for a single plain-text file',
    hook: 'A 10-minute breakdown of my minimal workflow, zero-notification setup, and how it doubled my shipping speed.',
    cantWaitCount: 14,
    passCount: 2,
    status: 'queued',
    createdAt: Date.now() - 7200000,
  },
  {
    id: 'cw-2',
    type: 'Product',
    format: 'Micro-App',
    title: 'AI Voice Memo → Structured GitHub Issues',
    hook: 'Speak a 30-second bug report while walking; it auto-formats repro steps, labels, and opens a clean issue.',
    cantWaitCount: 11,
    passCount: 1,
    status: 'building',
    createdAt: Date.now() - 18000000,
  },
  {
    id: 'cw-3',
    type: 'Content',
    format: 'Essay',
    title: 'The Quiet Death of Feature-Bloated SaaS',
    hook: 'Why single-purpose micro-tools are winning back users tired of $49/mo all-in-one workspaces.',
    cantWaitCount: 9,
    passCount: 4,
    status: 'queued',
    createdAt: Date.now() - 36000000,
  },
  {
    id: 'cw-4',
    type: 'Product',
    format: 'Feature',
    title: 'Focus-Group Changelog Widget',
    hook: 'Embeddable 2-button swipe widget where beta users vote on your next release before you write a line of code.',
    cantWaitCount: 16,
    passCount: 3,
    status: 'shipped',
    createdAt: Date.now() - 86400000,
  },
];

const STORAGE_KEY_IDEAS = 'cantwait_ideas_v1';
const STORAGE_KEY_VOTED = 'cantwait_voted_v1';

export default function App() {
  const [ideas, setIdeas] = useState<IdeaItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_IDEAS);
      return saved ? JSON.parse(saved) : INITIAL_IDEAS;
    } catch {
      return INITIAL_IDEAS;
    }
  });

  const [votedIds, setVotedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_VOTED);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [history, setHistory] = useState<{ id: string; vote: 'cantwait' | 'pass' }[]>([]);
  const [tab, setTab] = useState<'feed' | 'pulse'>('feed');
  const [copied, setCopied] = useState(false);

  // Auth State
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [sentCodePreview, setSentCodePreview] = useState<string | null>(null);
  const [authStep, setAuthStep] = useState<'email' | 'code'>('email');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    return onAuthChange((u) => setUser(u));
  }, []);

  // Composer Modal
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [newType, setNewType] = useState<IdeaType>('Content');
  const [newFormat, setNewFormat] = useState('Video');
  const [newTitle, setNewTitle] = useState('');
  const [newHook, setNewHook] = useState('');

  // Drag & exit animation physics state
  const [dx, setDx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExiting, setIsExiting] = useState<'cantwait' | 'pass' | null>(null);
  const startXRef = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_IDEAS, JSON.stringify(ideas));
  }, [ideas]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_VOTED, JSON.stringify(votedIds));
  }, [votedIds]);

  const unvotedIdeas = ideas.filter((i) => !votedIds.includes(i.id));
  const topIdea = unvotedIdeas[0];
  const nextIdea = unvotedIdeas[1];

  const handleVote = useCallback(
    (vote: 'cantwait' | 'pass') => {
      if (!topIdea || isExiting) return;
      setIsDragging(false);
      setIsExiting(vote);
      setDx(vote === 'cantwait' ? 650 : -650);

      setTimeout(() => {
        setIdeas((prev) =>
          prev.map((item) =>
            item.id === topIdea.id
              ? {
                  ...item,
                  cantWaitCount: vote === 'cantwait' ? item.cantWaitCount + 1 : item.cantWaitCount,
                  passCount: vote === 'pass' ? item.passCount + 1 : item.passCount,
                }
              : item
          )
        );
        setVotedIds((prev) => [...prev, topIdea.id]);
        setHistory((prev) => [...prev, { id: topIdea.id, vote }]);
        setDx(0);
        setIsExiting(null);
      }, 220);
    },
    [topIdea, isExiting]
  );

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setVotedIds((prev) => prev.filter((id) => id !== last.id));
    setIdeas((prev) =>
      prev.map((item) =>
        item.id === last.id
          ? {
              ...item,
              cantWaitCount: last.vote === 'cantwait' ? Math.max(0, item.cantWaitCount - 1) : item.cantWaitCount,
              passCount: last.vote === 'pass' ? Math.max(0, item.passCount - 1) : item.passCount,
            }
          : item
      )
    );
  }, [history]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isComposeOpen || tab !== 'feed') return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleVote('cantwait');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleVote('pass');
      } else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isComposeOpen, tab, handleVote, handleUndo]);

  const handleCopyInvite = () => {
    navigator.clipboard?.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleCreateIdea = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newHook.trim()) return;
    const created: IdeaItem = {
      id: `cw-${Date.now()}`,
      type: newType,
      format: newFormat.trim() || (newType === 'Content' ? 'Video' : 'Feature'),
      title: newTitle.trim(),
      hook: newHook.trim(),
      cantWaitCount: 0,
      passCount: 0,
      status: 'queued',
      createdAt: Date.now(),
    };
    setIdeas((prev) => [created, ...prev]);
    setNewTitle('');
    setNewHook('');
    setIsComposeOpen(false);
    setTab('feed');
  };

  const cycleStatus = (id: string) => {
    const order: IdeaStatus[] = ['queued', 'building', 'shipped'];
    setIdeas((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = order[(order.indexOf(item.status) + 1) % order.length];
        return { ...item, status: next };
      })
    );
  };

  const sortedPulse = [...ideas].sort((a, b) => {
    const totalA = a.cantWaitCount + a.passCount;
    const totalB = b.cantWaitCount + b.passCount;
    const ratioA = totalA > 0 ? a.cantWaitCount / totalA : 0;
    const ratioB = totalB > 0 ? b.cantWaitCount / totalB : 0;
    if (ratioB !== ratioA) return ratioB - ratioA;
    return b.cantWaitCount - a.cantWaitCount;
  });

  const dragProgress = Math.min(1, Math.abs(dx) / 110);

  return (
    <div className="min-h-screen bg-cream text-stone-ink flex flex-col justify-between p-4 sm:p-6">
      {/* Top Editorial Header */}
      <header className="w-full max-w-3xl mx-auto flex items-center justify-between border-b border-stone-border pb-4 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-coral text-white flex items-center justify-center font-extrabold text-sm shadow-sm">
            !
          </div>
          <div>
            <h1 className="font-bold tracking-tight text-lg leading-none">Can't Wait</h1>
            <span className="text-[11px] font-mono-tab text-stone-sub">Iman's Focus Group</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyInvite}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-paper border border-stone-border hover:border-stone-muted text-xs font-mono-tab text-stone-sub transition-all active:scale-95"
          >
            <span>LAB24</span>
            {copied ? <Check className="w-3.5 h-3.5 text-coral" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setIsComposeOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-stone-ink hover:bg-stone-ink/90 text-cream text-xs font-semibold transition-all active:scale-95 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Drop Idea</span>
          </button>

          {user ? (
            <div className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-paper border border-stone-border text-xs">
              <span className="font-medium text-stone-ink max-w-[90px] truncate">
                {user.displayName || user.email?.split('@')[0]}
              </span>
              <button
                type="button"
                onClick={() => signOut()}
                aria-label="Sign out"
                className="p-1 rounded-full hover:bg-stone-well text-stone-sub hover:text-stone-ink transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAuthError(null);
                setAuthStep('email');
                setIsAuthOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-paper border border-stone-border hover:border-stone-muted text-xs font-semibold text-stone-ink transition-all active:scale-95"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Stage */}
      <main className="w-full max-w-2xl mx-auto flex-1 flex flex-col items-center justify-center py-8">
        {tab === 'feed' ? (
          <div className="w-full max-w-md mx-auto flex flex-col items-center">
            {/* Top Status Bar */}
            <div className="w-full flex items-center justify-between mb-4 px-1">
              <span className="text-xs font-mono-tab text-stone-sub bg-paper px-3 py-1 rounded-full border border-stone-border">
                {unvotedIdeas.length} {unvotedIdeas.length === 1 ? 'idea' : 'ideas'} left
              </span>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="inline-flex items-center gap-1 text-xs font-medium text-stone-sub hover:text-stone-ink bg-paper px-3 py-1 rounded-full border border-stone-border transition-all active:scale-95"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Undo</span>
                </button>
              )}
            </div>

            {/* Card Stack or Empty State */}
            {!topIdea ? (
              <div className="w-full bg-paper rounded-3xl p-8 border border-stone-border shadow-[0_12px_32px_-8px_rgba(24,24,27,0.06)] text-center space-y-4">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-coral-tint text-coral flex items-center justify-center">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="font-serif text-3xl text-stone-ink">You're all caught up!</h2>
                <p className="text-sm text-stone-sub leading-relaxed">
                  You've voted on every idea in this focus group. Check the Popularity Pulse to see what's winning.
                </p>
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setTab('pulse')}
                    className="w-full py-3 rounded-xl bg-coral hover:bg-coral-hover text-white font-bold text-sm transition-all active:scale-95 shadow-sm"
                  >
                    View Popularity Pulse
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVotedIds([]);
                      setHistory([]);
                    }}
                    className="w-full py-2.5 rounded-xl bg-stone-well hover:bg-stone-border/60 text-stone-sub font-semibold text-xs transition-all active:scale-95"
                  >
                    Replay All Ideas
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="relative w-full min-h-[380px] flex items-center justify-center">
                  {/* Next Card Preview */}
                  {nextIdea && (
                    <div
                      className="absolute inset-x-0 top-0 bg-paper rounded-3xl p-6 border border-stone-border pointer-events-none"
                      style={{
                        transform: `translate3d(0, ${12 - dragProgress * 12}px, 0) scale(${0.96 + dragProgress * 0.04})`,
                        opacity: 0.7 + dragProgress * 0.3,
                        transition: isDragging ? 'none' : 'transform 200ms ease, opacity 200ms ease',
                      }}
                    >
                      <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-coral-tint text-coral">
                        {nextIdea.type} · {nextIdea.format}
                      </span>
                      <h2 className="font-serif text-3xl leading-tight mt-4 text-stone-ink line-clamp-2">
                        {nextIdea.title}
                      </h2>
                    </div>
                  )}

                  {/* Active Top Card */}
                  <div
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                      startXRef.current = e.clientX;
                      setIsDragging(true);
                    }}
                    onPointerMove={(e) => {
                      if (!isDragging || startXRef.current === null) return;
                      setDx(e.clientX - startXRef.current);
                    }}
                    onPointerUp={() => {
                      if (!isDragging) return;
                      if (dx >= 100) {
                        handleVote('cantwait');
                      } else if (dx <= -100) {
                        handleVote('pass');
                      } else {
                        setDx(0);
                        setIsDragging(false);
                      }
                      startXRef.current = null;
                    }}
                    onPointerCancel={() => {
                      setDx(0);
                      setIsDragging(false);
                      startXRef.current = null;
                    }}
                    className="relative w-full bg-paper rounded-3xl p-6 border border-stone-border shadow-[0_16px_40px_-10px_rgba(24,24,27,0.1)] select-none cursor-grab active:cursor-grabbing"
                    style={{
                      transform: `translate3d(${dx}px, 0, 0) rotate(${Math.max(-18, Math.min(18, dx * 0.05))}deg)`,
                      opacity: isExiting ? 0 : 1,
                      transition: isDragging ? 'none' : 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease',
                      touchAction: isDragging ? 'none' : 'pan-y',
                    }}
                  >
                    {/* Bumble-style Circular Overlay Stamps */}
                    {dx > 20 && (
                      <div
                        className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                        style={{ opacity: Math.min(1, (dx - 20) / 80) }}
                      >
                        <div className="w-20 h-20 rounded-full bg-coral/90 text-white flex items-center justify-center shadow-xl">
                          <Check className="w-10 h-10 stroke-[3]" />
                        </div>
                      </div>
                    )}
                    {dx < -20 && (
                      <div
                        className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                        style={{ opacity: Math.min(1, (-dx - 20) / 80) }}
                      >
                        <div className="w-20 h-20 rounded-full bg-stone-ink/80 text-white flex items-center justify-center shadow-xl">
                          <X className="w-10 h-10 stroke-[3]" />
                        </div>
                      </div>
                    )}

                    {/* First-card Coach Mark */}
                    {history.length === 0 && dx === 0 && (
                      <div className="mb-4 flex items-center justify-center">
                        <span className="px-3 py-1 rounded-full bg-stone-ink text-cream text-[11px] font-medium shadow-sm">
                          Swipe right if you can&apos;t wait · left to pass
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-coral-tint text-coral">
                        {topIdea.type} · {topIdea.format}
                      </span>
                      <span className="text-xs font-mono-tab text-stone-muted">
                        {topIdea.cantWaitCount} excited
                      </span>
                    </div>

                    <h2 className="font-serif text-3xl sm:text-4xl leading-[1.12] text-stone-ink mb-3">
                      {topIdea.title}
                    </h2>

                    <p className="text-sm text-stone-sub leading-relaxed mb-6">
                      {topIdea.hook}
                    </p>

                    <div className="pt-4 border-t border-stone-well flex items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleVote('pass');
                        }}
                        className="flex-1 inline-flex items-center justify-between px-4 py-3 rounded-xl border border-stone-border bg-cream hover:bg-stone-well text-stone-sub font-semibold text-sm transition-all active:scale-95"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <X className="w-4 h-4" />
                          <span>Pass</span>
                        </span>
                        <kbd className="kbd-warm hidden sm:inline-flex">←</kbd>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleVote('cantwait');
                        }}
                        className="flex-1 inline-flex items-center justify-between px-4 py-3 rounded-xl bg-coral hover:bg-coral-hover text-white font-bold text-sm transition-all active:scale-95 shadow-sm"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Flame className="w-4 h-4" />
                          <span>Can't Wait!</span>
                        </span>
                        <kbd className="kbd-warm hidden sm:inline-flex !bg-white/20 !text-white !border-white/30">→</kbd>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Keyboard hint */}
                <div className="hidden sm:flex items-center gap-4 mt-5 text-[11px] text-stone-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <kbd className="kbd-warm">←</kbd> Pass
                  </span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <kbd className="kbd-warm">→</kbd> Can't Wait!
                  </span>
                  {history.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1.5">
                        <kbd className="kbd-warm">Z</kbd> Undo
                      </span>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          /* Popularity Pulse View */
          <div className="w-full space-y-4">
            <div className="flex items-end justify-between border-b border-stone-border pb-3">
              <div>
                <h2 className="font-serif text-3xl text-stone-ink">Popularity Pulse</h2>
                <p className="text-xs text-stone-sub">Ranked by focus-group anticipation. Click status to update.</p>
              </div>
              <span className="text-xs font-mono-tab text-stone-muted">{ideas.length} total</span>
            </div>

            <div className="space-y-3">
              {sortedPulse.map((item, idx) => {
                const total = item.cantWaitCount + item.passCount;
                const pct = total > 0 ? Math.round((item.cantWaitCount / total) * 100) : 0;

                return (
                  <div
                    key={item.id}
                    className="bg-paper rounded-2xl p-5 border border-stone-border shadow-sm space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono-tab font-bold text-coral">#{idx + 1}</span>
                          <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-coral-tint text-coral">
                            {item.type} · {item.format}
                          </span>
                          <button
                            type="button"
                            onClick={() => cycleStatus(item.id)}
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                              item.status === 'shipped'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : item.status === 'building'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-stone-well text-stone-sub border-stone-border'
                            }`}
                            title="Click to cycle status"
                          >
                            {item.status === 'shipped' ? 'Shipped' : item.status === 'building' ? 'In Progress' : 'In Queue'}
                          </button>
                        </div>
                        <h3 className="font-serif text-2xl text-stone-ink leading-snug">{item.title}</h3>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-mono-tab font-bold text-coral">{pct}%</div>
                        <div className="text-[11px] font-mono-tab text-stone-muted">
                          {item.cantWaitCount} / {total}
                        </div>
                      </div>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-stone-well overflow-hidden">
                      <div
                        className="h-full bg-coral transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Luma-style Floating Pill Bottom Navigation */}
      <footer className="w-full max-w-[280px] mx-auto flex items-center justify-around p-1.5 rounded-full bg-paper border border-stone-border shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
        <button
          type="button"
          onClick={() => setTab('feed')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
            tab === 'feed' ? 'bg-stone-well text-stone-ink' : 'text-stone-sub hover:text-stone-ink'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Swipe Feed</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('pulse')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
            tab === 'pulse' ? 'bg-stone-well text-stone-ink' : 'text-stone-sub hover:text-stone-ink'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Pulse</span>
        </button>
      </footer>

      {/* Drop Idea Modal */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-ink/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-paper rounded-3xl border border-stone-border shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-border pb-3">
              <h3 className="font-serif text-2xl text-stone-ink">Drop a New Idea</h3>
              <button
                type="button"
                onClick={() => setIsComposeOpen(false)}
                className="p-1.5 rounded-full hover:bg-stone-well text-stone-sub"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateIdea} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {(['Content', 'Product'] as IdeaType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setNewType(t);
                      setNewFormat(t === 'Content' ? 'Video' : 'Micro-App');
                    }}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      newType === t
                        ? 'bg-coral-tint border-coral text-coral'
                        : 'bg-cream border-stone-border text-stone-sub'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-sub mb-1">Format</label>
                <input
                  type="text"
                  value={newFormat}
                  onChange={(e) => setNewFormat(e.target.value)}
                  placeholder="Video, Essay, Micro-App, Feature..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-cream border border-stone-border text-sm focus:border-coral focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-sub mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="What are you thinking of making?"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-cream border border-stone-border text-sm focus:border-coral focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-sub mb-1">Hook / One-Liner *</label>
                <textarea
                  required
                  rows={3}
                  value={newHook}
                  onChange={(e) => setNewHook(e.target.value)}
                  placeholder="Why would your focus group be excited about this?"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-cream border border-stone-border text-sm focus:border-coral focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-coral hover:bg-coral-hover text-white font-bold text-sm transition-all active:scale-95 shadow-sm"
              >
                <Send className="w-4 h-4" />
                <span>Post to Focus Group</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Sign In / Sign Up Modal (Google + Email & Code) */}
      {isAuthOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-ink/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-paper rounded-3xl border border-stone-border shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-stone-border pb-3">
              <h3 className="text-xl font-bold text-stone-ink">Sign in to Can't Wait</h3>
              <button
                type="button"
                onClick={() => setIsAuthOpen(false)}
                className="p-1.5 rounded-full hover:bg-stone-well text-stone-sub"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {authError}
              </div>
            )}

            <button
              type="button"
              disabled={authLoading}
              onClick={async () => {
                setAuthLoading(true);
                setAuthError(null);
                try {
                  await signInWithGoogle();
                  setIsAuthOpen(false);
                } catch (err: any) {
                  setAuthError(err?.message || 'Google sign-in failed.');
                } finally {
                  setAuthLoading(false);
                }
              }}
              className="w-full py-3 rounded-xl bg-stone-ink hover:bg-stone-ink/90 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              <span>Continue with Google</span>
            </button>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-stone-border w-full" />
              <span className="bg-paper px-3 text-[11px] uppercase tracking-wider text-stone-muted">or</span>
              <div className="border-t border-stone-border w-full" />
            </div>

            {authStep === 'email' ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setAuthLoading(true);
                  setAuthError(null);
                  try {
                    const code = await requestEmailCode(authEmail);
                    setSentCodePreview(code);
                    setAuthStep('code');
                  } catch (err: any) {
                    setAuthError(err?.message || 'Could not send code.');
                  } finally {
                    setAuthLoading(false);
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-xs font-semibold text-stone-sub mb-1">Email address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-stone-muted absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-cream border border-stone-border text-sm focus:border-coral focus:outline-none"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-2.5 rounded-xl bg-coral hover:bg-coral-hover text-white font-bold text-sm transition-all active:scale-95 disabled:opacity-50"
                >
                  Send 6-Digit Code
                </button>
              </form>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setAuthLoading(true);
                  setAuthError(null);
                  try {
                    await verifyEmailCode(authEmail, authCode);
                    setIsAuthOpen(false);
                  } catch (err: any) {
                    setAuthError(err?.message || 'Invalid code.');
                  } finally {
                    setAuthLoading(false);
                  }
                }}
                className="space-y-3"
              >
                {sentCodePreview && (
                  <div className="p-2.5 rounded-xl bg-coral-tint border border-coral/20 text-xs text-coral font-mono-tab text-center">
                    Demo Code: <strong>{sentCodePreview}</strong>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-stone-sub mb-1">
                    Enter 6-digit code sent to {authEmail}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    placeholder="123456"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-cream border border-stone-border text-center font-mono-tab text-lg tracking-widest focus:border-coral focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-2.5 rounded-xl bg-coral hover:bg-coral-hover text-white font-bold text-sm transition-all active:scale-95 disabled:opacity-50"
                >
                  Verify & Sign In
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
