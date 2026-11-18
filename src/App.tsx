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
  Bell,
  BellOff,
  Settings,
  ChevronDown,
  FileSpreadsheet,
  Download,
  ExternalLink,
  Users,
  RefreshCw,
} from 'lucide-react';
import { IdeaItem, IdeaType, IdeaStatus, Lab } from './types';
import {
  onAuthChange,
  signInWithGoogle,
  requestEmailCode,
  verifyEmailCode,
  signOut,
  type AuthUser,
} from './auth';
import {
  getUserLabs,
  createLab,
  joinLabByCode,
  updateLabSettings,
  setLabNotificationPref,
  getLocalNotifyLabs,
  getLabIdeas,
  getLabUserVotes,
  addIdeaToLab,
  syncSheetToLab,
  recordLabVote,
  updateIdeaStatus,
} from './labService';
import { downloadBlankSheetTemplate } from './sheets';

function parseInviteCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code') || params.get('lab');
  return code ? code.trim().toUpperCase() : null;
}

export default function App() {
  // Auth State
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [sentCodePreview, setSentCodePreview] = useState<string | null>(null);
  const [authStep, setAuthStep] = useState<'email' | 'code'>('email');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Labs & Ideas State
  const [labs, setLabs] = useState<Lab[]>([]);
  const [activeLab, setActiveLab] = useState<Lab | null>(null);
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [notifyLabIds, setNotifyLabIds] = useState<string[]>([]);
  const [history, setHistory] = useState<{ id: string; vote: 'cantwait' | 'pass' }[]>([]);
  const [tab, setTab] = useState<'feed' | 'pulse'>('feed');
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Modals
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [newLabName, setNewLabName] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [labActionError, setLabActionError] = useState<string | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsName, setSettingsName] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // Composer Modal
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [newType, setNewType] = useState<IdeaType>('Content');
  const [newFormat, setNewFormat] = useState('Video');
  const [newTitle, setNewTitle] = useState('');
  const [newHook, setNewHook] = useState('');
  const [newFurtherRead, setNewFurtherRead] = useState('');

  // Drag & exit animation physics state
  const [dx, setDx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExiting, setIsExiting] = useState<'cantwait' | 'pass' | null>(null);
  const pendingSwipeRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  // Listen to Auth
  useEffect(() => {
    const unsub = onAuthChange((u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Load Labs when user signs in
  useEffect(() => {
    if (!user) {
      setLabs([]);
      setActiveLab(null);
      setIdeas([]);
      setVotedIds([]);
      return;
    }

    setNotifyLabIds(getLocalNotifyLabs(user.uid));

    (async () => {
      const displayName = user.displayName || user.email?.split('@')[0] || 'Creator';
      let loaded = await getUserLabs(user.uid, displayName);

      const inviteCode = parseInviteCodeFromUrl();
      if (inviteCode) {
        const existing = loaded.find((l) => l.code.toUpperCase() === inviteCode);
        if (existing) {
          setLabs(loaded);
          setActiveLab(existing);
          return;
        }
        try {
          const joined = await joinLabByCode(user.uid, inviteCode);
          loaded = [joined, ...loaded.filter((l) => l.id !== joined.id)];
          setLabs(loaded);
          setActiveLab(joined);
          showToast(`Joined ${joined.name}`);
          return;
        } catch {
          // ignore invalid code
        }
      }

      setLabs(loaded);
      setActiveLab(loaded[0] || null);
    })();
  }, [user]);

  // Load Ideas & Votes when activeLab changes
  useEffect(() => {
    if (!user || !activeLab) return;

    // Sync URL ?code=
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('code') !== activeLab.code) {
        url.searchParams.set('code', activeLab.code);
        window.history.replaceState(null, '', url.toString());
      }
    } catch {
      // ignore
    }

    setSettingsName(activeLab.name);
    setScheduleEnabled(activeLab.schedule?.enabled ?? false);
    setScheduleTime(activeLab.schedule?.time || '09:00');
    setSheetUrlInput(activeLab.googleSheetId || '');
    setHistory([]);

    (async () => {
      const [loadedIdeas, loadedVotes] = await Promise.all([
        getLabIdeas(activeLab.id),
        getLabUserVotes(activeLab.id, user.uid),
      ]);
      setIdeas(loadedIdeas);
      setVotedIds(loadedVotes);
    })();
  }, [user, activeLab?.id]);

  const isOwner = Boolean(user && activeLab && activeLab.ownerId === user.uid);
  const isNotifying = Boolean(activeLab && notifyLabIds.includes(activeLab.id));

  // Only show ideas in the pot that the user hasn't voted on
  const potIdeas = ideas.filter((i) => i.inPot !== false);
  const unvotedIdeas = potIdeas.filter((i) => !votedIds.includes(i.id));
  const topIdea = unvotedIdeas[0];
  const nextIdea = unvotedIdeas[1];

  const handleVote = useCallback(
    (vote: 'cantwait' | 'pass') => {
      if (!topIdea || !user || !activeLab || isExiting) return;
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
        recordLabVote(activeLab.id, user.uid, topIdea.id, vote).catch(console.warn);
      }, 220);
    },
    [topIdea, user, activeLab, isExiting]
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
      if (!user || isComposeOpen || isSwitcherOpen || isSettingsOpen || tab !== 'feed') return;
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
  }, [user, isComposeOpen, isSwitcherOpen, isSettingsOpen, tab, handleVote, handleUndo]);

  const handleCopyInvite = () => {
    if (!activeLab) return;
    const inviteUrl = `${window.location.origin}/?code=${activeLab.code}`;
    navigator.clipboard?.writeText(inviteUrl).catch(() => {});
    setCopied(true);
    showToast(`Copied invite link for ${activeLab.code}`);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleToggleNotify = async () => {
    if (!user || !activeLab) return;
    try {
      const next = !isNotifying;
      await setLabNotificationPref(user.uid, activeLab.id, next);
      setNotifyLabIds(getLocalNotifyLabs(user.uid));
      showToast(
        next
          ? `Daily reminders enabled (${activeLab.schedule?.time || '09:00'})`
          : 'Daily reminders paused for this lab'
      );
    } catch (err: any) {
      showToast(err?.message || 'Could not update notification settings');
    }
  };

  const handleCreateIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLab || !newTitle.trim() || !newHook.trim()) return;
    const created = await addIdeaToLab(activeLab.id, {
      type: newType,
      format: newFormat.trim() || (newType === 'Content' ? 'Video' : 'Feature'),
      title: newTitle.trim(),
      hook: newHook.trim(),
      furtherRead: newFurtherRead.trim() || undefined,
      inPot: true,
    });
    setIdeas((prev) => [created, ...prev]);
    setNewTitle('');
    setNewHook('');
    setNewFurtherRead('');
    setIsComposeOpen(false);
    setTab('feed');
    showToast('Idea dropped into your Lab');
  };

  const handleSyncSheet = async () => {
    if (!activeLab || !sheetUrlInput.trim()) return;
    setIsSyncingSheet(true);
    setSheetError(null);
    try {
      const res = await syncSheetToLab(activeLab.id, sheetUrlInput.trim());
      setIdeas(res.ideas);
      setActiveLab((prev) =>
        prev ? { ...prev, googleSheetId: res.sheetId, lastSyncedAt: Date.now() } : prev
      );
      showToast(`Synced ${res.count} ideas from Google Sheet`);
    } catch (err: any) {
      setSheetError(err?.message || 'Failed to sync Google Sheet.');
    } finally {
      setIsSyncingSheet(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLab) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const updates = {
      name: settingsName.trim() || activeLab.name,
      schedule: { enabled: scheduleEnabled, time: scheduleTime, timezone: tz },
    };
    await updateLabSettings(activeLab.id, updates);
    const updated = { ...activeLab, ...updates };
    setActiveLab(updated);
    setLabs((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setIsSettingsOpen(false);
    showToast('Lab settings saved');
  };

  const cycleStatus = async (id: string) => {
    if (!isOwner || !activeLab) return;
    const order: IdeaStatus[] = ['queued', 'building', 'shipped'];
    const target = ideas.find((i) => i.id === id);
    if (!target) return;
    const next = order[(order.indexOf(target.status) + 1) % order.length];
    setIdeas((prev) => prev.map((item) => (item.id === id ? { ...item, status: next } : item)));
    await updateIdeaStatus(activeLab.id, id, next);
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

  // AUTH GATE: Sign-in required
  if (authReady && !user) {
    const invitedCode = parseInviteCodeFromUrl();
    return (
      <div className="min-h-[100dvh] bg-cream text-stone-ink flex flex-col items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm bg-paper rounded-3xl border border-stone-border shadow-[0_16px_40px_-10px_rgba(0,0,0,0.08)] p-7 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-11 h-11 mx-auto rounded-2xl bg-coral text-white flex items-center justify-center font-extrabold text-lg shadow-sm">
              !
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Can&apos;t Wait</h1>
            <p className="text-xs text-stone-sub leading-relaxed">
              {invitedCode
                ? `Sign in to join Focus Group "${invitedCode}" and swipe on ideas.`
                : 'Sign in to create your own Focus Group Lab or join a creator’s group.'}
            </p>
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
              } catch (err: any) {
                setAuthError(err?.message || 'Google sign-in failed.');
              } finally {
                setAuthLoading(false);
              }
            }}
            className="w-full py-3 rounded-xl bg-stone-ink hover:bg-stone-ink/90 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
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
                  Verification Code: <strong>{sentCodePreview}</strong>
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
    );
  }

  return (
    <div className="min-h-[100dvh] bg-cream text-stone-ink flex flex-col justify-between p-4 sm:p-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-stone-ink text-cream text-xs font-semibold shadow-lg">
          {toast}
        </div>
      )}

      {/* Top Luma-Style Header */}
      <header className="w-full max-w-3xl mx-auto flex items-center justify-between border-b border-stone-border pb-4 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-coral text-white flex items-center justify-center font-extrabold text-sm shadow-sm flex-shrink-0">
            !
          </div>
          <button
            type="button"
            onClick={() => {
              setLabActionError(null);
              setIsSwitcherOpen(true);
            }}
            className="text-left group min-w-0"
          >
            <div className="flex items-center gap-1 font-bold tracking-tight text-base sm:text-lg leading-none truncate">
              <span className="truncate">{activeLab?.name || "Can't Wait"}</span>
              <ChevronDown className="w-4 h-4 text-stone-sub group-hover:text-stone-ink flex-shrink-0" />
            </div>
            <span className="text-[11px] font-mono-tab text-stone-sub">
              {isOwner ? 'Owner' : `by ${activeLab?.ownerName || 'Creator'}`}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {activeLab && (
            <button
              type="button"
              onClick={handleCopyInvite}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-paper border border-stone-border hover:border-stone-muted text-xs font-mono-tab text-stone-sub transition-all active:scale-95"
              title="Copy invite link"
            >
              <span>{activeLab.code}</span>
              {copied ? <Check className="w-3.5 h-3.5 text-coral" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Daily Reminder Bell Toggle */}
          {activeLab && (
            <button
              type="button"
              onClick={handleToggleNotify}
              aria-label="Toggle daily reminders"
              className={`p-2 rounded-full border transition-all active:scale-95 ${
                isNotifying
                  ? 'bg-coral-tint border-coral/30 text-coral'
                  : 'bg-paper border-stone-border text-stone-sub hover:text-stone-ink'
              }`}
              title={
                isNotifying
                  ? `Daily reminders ON (${activeLab.schedule?.time || '09:00'})`
                  : 'Enable daily idea reminders'
              }
            >
              {isNotifying ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </button>
          )}

          {/* Owner Controls: Settings/Sheet Sync + Drop Idea */}
          {isOwner && (
            <>
              <button
                type="button"
                onClick={() => {
                  setSheetError(null);
                  setIsSettingsOpen(true);
                }}
                aria-label="Lab Settings & Google Sheet Sync"
                className="p-2 rounded-full bg-paper border border-stone-border text-stone-sub hover:text-stone-ink transition-all active:scale-95"
                title="Lab Settings & Google Sheet Sync"
              >
                <Settings className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsComposeOpen(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-stone-ink hover:bg-stone-ink/90 text-cream text-xs font-semibold transition-all active:scale-95 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Drop Idea</span>
              </button>
            </>
          )}

          {user && (
            <button
              type="button"
              onClick={() => signOut()}
              aria-label="Sign out"
              className="p-2 rounded-full bg-paper border border-stone-border text-stone-sub hover:text-stone-ink transition-colors"
              title={`Signed in as ${user.displayName || user.email} — Sign out`}
            >
              <LogOut className="w-4 h-4" />
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
                <h2 className="text-2xl font-bold text-stone-ink">
                  {potIdeas.length === 0 ? 'No ideas in this Lab yet' : "You're all caught up!"}
                </h2>
                <p className="text-sm text-stone-sub leading-relaxed">
                  {potIdeas.length === 0
                    ? isOwner
                      ? 'Drop your first idea or sync a Google Sheet in Lab Settings.'
                      : 'Check back later or turn on the daily reminder bell above.'
                    : "You've voted on every idea in this Lab. Check the Popularity Pulse to see what's winning."}
                </p>
                <div className="pt-2 flex flex-col gap-2">
                  {potIdeas.length === 0 && isOwner ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsComposeOpen(true)}
                        className="w-full py-3 rounded-xl bg-coral hover:bg-coral-hover text-white font-bold text-sm transition-all active:scale-95 shadow-sm"
                      >
                        Drop First Idea
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsSettingsOpen(true)}
                        className="w-full py-2.5 rounded-xl bg-stone-well hover:bg-stone-border/60 text-stone-ink font-semibold text-xs transition-all active:scale-95"
                      >
                        Import from Google Sheet
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTab('pulse')}
                      className="w-full py-3 rounded-xl bg-coral hover:bg-coral-hover text-white font-bold text-sm transition-all active:scale-95 shadow-sm"
                    >
                      View Popularity Pulse
                    </button>
                  )}
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
                        {nextIdea.no ? `#${nextIdea.no}` : `${nextIdea.type} · ${nextIdea.format}`}
                      </span>
                      <h2 className="text-2xl font-bold leading-tight mt-4 text-stone-ink line-clamp-2">
                        {nextIdea.title}
                      </h2>
                    </div>
                  )}

                  {/* Active Top Card */}
                  <div
                    onPointerDown={(e) => {
                      const target = e.target as HTMLElement | null;
                      if (target?.closest('button, a, input, textarea')) return;
                      pendingSwipeRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
                    }}
                    onPointerMove={(e) => {
                      const pending = pendingSwipeRef.current;
                      if (!pending || e.pointerId !== pending.pointerId) return;
                      const deltaX = e.clientX - pending.x;
                      const deltaY = e.clientY - pending.y;

                      if (!isDragging) {
                        // 8px horizontal drag hysteresis so vertical scroll & taps never hijack
                        if (Math.abs(deltaX) >= 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
                          try {
                            e.currentTarget.setPointerCapture?.(e.pointerId);
                          } catch {
                            // ignore
                          }
                          setIsDragging(true);
                          setDx(deltaX);
                        } else if (Math.abs(deltaY) >= 10 && Math.abs(deltaY) > Math.abs(deltaX)) {
                          pendingSwipeRef.current = null;
                        }
                        return;
                      }

                      setDx(deltaX);
                    }}
                    onPointerUp={(e) => {
                      if (isDragging) {
                        try {
                          if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                            e.currentTarget.releasePointerCapture?.(e.pointerId);
                          }
                        } catch {
                          // ignore
                        }
                        if (dx >= 100) {
                          handleVote('cantwait');
                        } else if (dx <= -100) {
                          handleVote('pass');
                        } else {
                          setDx(0);
                          setIsDragging(false);
                        }
                      }
                      pendingSwipeRef.current = null;
                    }}
                    onPointerCancel={() => {
                      setDx(0);
                      setIsDragging(false);
                      pendingSwipeRef.current = null;
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
                        {topIdea.no ? `Idea #${topIdea.no}` : `${topIdea.type} · ${topIdea.format}`}
                      </span>
                      <span className="text-xs font-mono-tab text-stone-muted">
                        {topIdea.cantWaitCount} excited
                      </span>
                    </div>

                    <h2 className="text-2xl sm:text-3xl font-bold leading-[1.15] text-stone-ink mb-3">
                      {topIdea.title}
                    </h2>

                    <p className="text-sm text-stone-sub leading-relaxed mb-4">
                      {topIdea.hook}
                    </p>

                    {topIdea.furtherRead && (
                      <a
                        href={topIdea.furtherRead.startsWith('http') ? topIdea.furtherRead : `https://${topIdea.furtherRead}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-coral hover:underline mb-5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Further Read / Listen</span>
                      </a>
                    )}

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
                <h2 className="text-2xl font-bold text-stone-ink">Popularity Pulse</h2>
                <p className="text-xs text-stone-sub">
                  {isOwner
                    ? 'Ranked by focus-group anticipation. Click status to update.'
                    : 'Ranked by focus-group anticipation.'}
                </p>
              </div>
              <span className="text-xs font-mono-tab text-stone-muted">{ideas.length} total</span>
            </div>

            {sortedPulse.length === 0 ? (
              <div className="bg-paper rounded-2xl p-8 border border-stone-border text-center text-sm text-stone-sub">
                No ideas in this Lab yet.
              </div>
            ) : (
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
                              {item.no ? `Idea #${item.no}` : `${item.type} · ${item.format}`}
                            </span>
                            {!item.inPot && (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-well text-stone-muted">
                                Not in Pot
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={!isOwner}
                              onClick={() => cycleStatus(item.id)}
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                                item.status === 'shipped'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : item.status === 'building'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-stone-well text-stone-sub border-stone-border'
                              } ${isOwner ? 'cursor-pointer' : 'cursor-default'}`}
                            >
                              {item.status === 'shipped' ? 'Shipped' : item.status === 'building' ? 'In Progress' : 'In Queue'}
                            </button>
                          </div>
                          <h3 className="text-lg font-bold text-stone-ink leading-snug">{item.title}</h3>
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
            )}
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

      {/* Lab Switcher Modal */}
      {isSwitcherOpen && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-ink/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-paper rounded-3xl border border-stone-border shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-border pb-3">
              <h3 className="text-lg font-bold text-stone-ink flex items-center gap-2">
                <Users className="w-4 h-4 text-coral" />
                <span>Your Focus Groups</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsSwitcherOpen(false)}
                className="p-1.5 rounded-full hover:bg-stone-well text-stone-sub"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {labActionError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {labActionError}
              </div>
            )}

            <div className="space-y-2">
              {labs.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    setActiveLab(l);
                    setIsSwitcherOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left transition-all ${
                    activeLab?.id === l.id
                      ? 'bg-coral-tint/60 border-coral/40'
                      : 'bg-cream border-stone-border hover:border-stone-muted'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-sm text-stone-ink">{l.name}</div>
                    <div className="text-[11px] text-stone-sub">
                      {l.ownerId === user.uid ? 'Owned by you' : `by ${l.ownerName}`}
                    </div>
                  </div>
                  <span className="text-xs font-mono-tab px-2.5 py-1 rounded-full bg-paper border border-stone-border text-stone-sub">
                    {l.code}
                  </span>
                </button>
              ))}
            </div>

            {/* Create New Lab */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newLabName.trim()) return;
                const displayName = user.displayName || user.email?.split('@')[0] || 'Creator';
                const created = await createLab(user.uid, displayName, newLabName.trim());
                setLabs((prev) => [created, ...prev]);
                setActiveLab(created);
                setNewLabName('');
                setIsSwitcherOpen(false);
                showToast(`Created ${created.name}`);
              }}
              className="pt-3 border-t border-stone-border space-y-2"
            >
              <label className="block text-xs font-semibold text-stone-sub">Create a New Lab</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLabName}
                  onChange={(e) => setNewLabName(e.target.value)}
                  placeholder="e.g. YouTube Content Lab"
                  className="flex-1 px-3 py-2 rounded-xl bg-cream border border-stone-border text-sm focus:border-coral focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-stone-ink text-white text-xs font-bold active:scale-95"
                >
                  Create
                </button>
              </div>
            </form>

            {/* Join by Code */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setLabActionError(null);
                try {
                  const joined = await joinLabByCode(user.uid, joinCodeInput);
                  setLabs((prev) => [joined, ...prev.filter((l) => l.id !== joined.id)]);
                  setActiveLab(joined);
                  setJoinCodeInput('');
                  setIsSwitcherOpen(false);
                  showToast(`Joined ${joined.name}`);
                } catch (err: any) {
                  setLabActionError(err?.message || 'Could not join Lab.');
                }
              }}
              className="pt-3 border-t border-stone-border space-y-2"
            >
              <label className="block text-xs font-semibold text-stone-sub">Join a Creator&apos;s Lab</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="Enter 6-char code"
                  maxLength={6}
                  className="flex-1 px-3 py-2 rounded-xl bg-cream border border-stone-border font-mono-tab uppercase text-sm focus:border-coral focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-coral text-white text-xs font-bold active:scale-95"
                >
                  Join
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lab Settings, Daily Notifications & Google Sheet Sync Modal (Owner) */}
      {isSettingsOpen && activeLab && isOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-ink/40 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-paper rounded-3xl border border-stone-border shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-border pb-3">
              <h3 className="text-lg font-bold text-stone-ink">Lab Settings &amp; Sync</h3>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 rounded-full hover:bg-stone-well text-stone-sub"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-sub mb-1">Lab Name</label>
                <input
                  type="text"
                  value={settingsName}
                  onChange={(e) => setSettingsName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-cream border border-stone-border text-sm focus:border-coral focus:outline-none"
                />
              </div>

              {/* Daily Notification Schedule */}
              <div className="p-4 rounded-2xl bg-cream border border-stone-border space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-stone-ink">Daily Check-In Reminder</div>
                    <div className="text-xs text-stone-sub">Remind focus group members daily to swipe new ideas</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={scheduleEnabled}
                    onChange={(e) => setScheduleEnabled(e.target.checked)}
                    className="w-4 h-4 accent-[#16A34A]"
                  />
                </div>
                {scheduleEnabled && (
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-medium text-stone-sub">Daily Time:</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-paper border border-stone-border text-xs font-mono-tab"
                    />
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-stone-ink text-white text-xs font-bold active:scale-95"
              >
                Save Lab Settings
              </button>
            </form>

            {/* Google Sheet Sync Section */}
            <div className="pt-4 border-t border-stone-border space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-stone-ink flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-coral" />
                  <span>Sync from Google Sheet</span>
                </h4>
                <button
                  type="button"
                  onClick={downloadBlankSheetTemplate}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-coral hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Blank Template (.csv)</span>
                </button>
              </div>

              <p className="text-xs text-stone-sub leading-relaxed">
                Share a 5-column Google Sheet (<strong>no</strong>, <strong>One-liner Description</strong>,{' '}
                <strong>Full Description</strong>, <strong>Further Read/Listen</strong>, <strong>Pot</strong>) with{' '}
                <em>&ldquo;Anyone with the link&rdquo;</em> access.
              </p>

              {sheetError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                  {sheetError}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={sheetUrlInput}
                  onChange={(e) => setSheetUrlInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 px-3 py-2 rounded-xl bg-cream border border-stone-border text-xs focus:border-coral focus:outline-none"
                />
                <button
                  type="button"
                  disabled={isSyncingSheet || !sheetUrlInput.trim()}
                  onClick={handleSyncSheet}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-coral hover:bg-coral-hover disabled:opacity-50 text-white text-xs font-bold active:scale-95"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheet ? 'animate-spin' : ''}`} />
                  <span>{isSyncingSheet ? 'Syncing...' : 'Sync'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drop Idea Modal (Owner) */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-ink/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-paper rounded-3xl border border-stone-border shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-border pb-3">
              <h3 className="text-xl font-bold text-stone-ink">Drop a New Idea</h3>
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
                <label className="block text-xs font-semibold text-stone-sub mb-1">One-liner Description *</label>
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
                <label className="block text-xs font-semibold text-stone-sub mb-1">Full Description *</label>
                <textarea
                  required
                  rows={3}
                  value={newHook}
                  onChange={(e) => setNewHook(e.target.value)}
                  placeholder="Why would your focus group be excited about this?"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-cream border border-stone-border text-sm focus:border-coral focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-sub mb-1">
                  Further Read / Listen (Optional URL)
                </label>
                <input
                  type="text"
                  value={newFurtherRead}
                  onChange={(e) => setNewFurtherRead(e.target.value)}
                  placeholder="https://..."
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
    </div>
  );
}
