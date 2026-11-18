import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  increment,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from './auth';
import { Lab, IdeaItem, LabSchedule, IdeaStatus } from './types';
import { fetchSheetIdeas } from './sheets';

const STORAGE_LABS = 'cantwait_labs_v2';
const STORAGE_IDEAS_PREFIX = 'cantwait_lab_ideas_v2_';
const STORAGE_VOTES_PREFIX = 'cantwait_lab_votes_v2_';
const STORAGE_NOTIFY_PREFIX = 'cantwait_notify_v2_';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateLabCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return code;
}

function readLocalLabs(): Lab[] {
  try {
    const raw = localStorage.getItem(STORAGE_LABS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalLabs(labs: Lab[]) {
  localStorage.setItem(STORAGE_LABS, JSON.stringify(labs));
}

function readLocalIdeas(labId: string): IdeaItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_IDEAS_PREFIX + labId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalIdeas(labId: string, ideas: IdeaItem[]) {
  localStorage.setItem(STORAGE_IDEAS_PREFIX + labId, JSON.stringify(ideas));
}

function readLocalVotes(labId: string, uid: string): string[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_VOTES_PREFIX}${labId}_${uid}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalVotes(labId: string, uid: string, votedIds: string[]) {
  localStorage.setItem(`${STORAGE_VOTES_PREFIX}${labId}_${uid}`, JSON.stringify(votedIds));
}

export function getLocalNotifyLabs(uid: string): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_NOTIFY_PREFIX + uid);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function setLabNotificationPref(
  uid: string,
  labId: string,
  enabled: boolean
): Promise<boolean> {
  if (enabled && typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm === 'denied') {
        throw new Error('Browser notification permission was denied.');
      }
    } else if (Notification.permission === 'denied') {
      throw new Error('Enable notifications in your browser site settings.');
    }
  }

  const current = new Set(getLocalNotifyLabs(uid));
  if (enabled) current.add(labId);
  else current.delete(labId);
  localStorage.setItem(STORAGE_NOTIFY_PREFIX + uid, JSON.stringify([...current]));

  if (db) {
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(
        userRef,
        {
          uid,
          notifyLabIds: enabled ? arrayUnion(labId) : arrayRemove(labId),
        },
        { merge: true }
      );
    } catch {
      // keep local preference
    }
  }

  return enabled;
}

export async function createLab(
  ownerId: string,
  ownerName: string,
  name: string,
  schedule?: LabSchedule
): Promise<Lab> {
  const code = generateLabCode();
  const id = `lab_${code.toLowerCase()}_${Date.now()}`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const lab: Lab = {
    id,
    code,
    name: name.trim() || `${ownerName}'s Lab`,
    ownerId,
    ownerName,
    memberIds: [ownerId],
    schedule: schedule || { enabled: false, time: '09:00', timezone: tz },
    createdAt: Date.now(),
  };

  if (db) {
    try {
      await setDoc(doc(db, 'labs', id), lab);
      await setDoc(
        doc(db, 'users', ownerId),
        { uid: ownerId, joinedLabIds: arrayUnion(id) },
        { merge: true }
      );
    } catch (err) {
      console.warn('[LabService] Firestore createLab fallback:', err);
    }
  }

  const local = readLocalLabs();
  writeLocalLabs([lab, ...local.filter((l) => l.id !== lab.id)]);
  return lab;
}

export async function getUserLabs(uid: string, displayName: string): Promise<Lab[]> {
  let labs: Lab[] = [];

  if (db) {
    try {
      const q = query(collection(db, 'labs'), where('memberIds', 'array-contains', uid));
      const snap = await getDocs(q);
      labs = snap.docs.map((d) => d.data() as Lab);
    } catch (err) {
      console.warn('[LabService] Firestore getUserLabs fallback:', err);
    }
  }

  const local = readLocalLabs().filter(
    (l) => l.ownerId === uid || l.memberIds.includes(uid)
  );

  // Merge remote + local
  const map = new Map<string, Lab>();
  [...local, ...labs].forEach((l) => map.set(l.id, l));
  const merged = [...map.values()].sort((a, b) => b.createdAt - a.createdAt);

  if (merged.length === 0) {
    const firstLab = await createLab(uid, displayName, `${displayName}'s Lab`);
    return [firstLab];
  }

  return merged;
}

export async function joinLabByCode(uid: string, rawCode: string): Promise<Lab> {
  const code = rawCode.trim().toUpperCase();
  if (!code) throw new Error('Enter an invite code.');

  let found: Lab | null = null;

  if (db) {
    try {
      const q = query(collection(db, 'labs'), where('code', '==', code));
      const snap = await getDocs(q);
      if (!snap.empty) {
        found = snap.docs[0].data() as Lab;
        await updateDoc(doc(db, 'labs', found.id), {
          memberIds: arrayUnion(uid),
        });
        await setDoc(
          doc(db, 'users', uid),
          { uid, joinedLabIds: arrayUnion(found.id) },
          { merge: true }
        );
        if (!found.memberIds.includes(uid)) {
          found = { ...found, memberIds: [...found.memberIds, uid] };
        }
      }
    } catch (err) {
      console.warn('[LabService] Firestore joinLabByCode fallback:', err);
    }
  }

  if (!found) {
    const local = readLocalLabs();
    const match = local.find((l) => l.code.toUpperCase() === code);
    if (match) {
      if (!match.memberIds.includes(uid)) {
        match.memberIds.push(uid);
        writeLocalLabs(local);
      }
      found = match;
    }
  }

  if (!found) {
    throw new Error(`No focus group found with code "${code}".`);
  }

  const local = readLocalLabs();
  writeLocalLabs([found, ...local.filter((l) => l.id !== found!.id)]);
  return found;
}

export async function updateLabSettings(
  labId: string,
  updates: Partial<Pick<Lab, 'name' | 'schedule' | 'googleSheetId' | 'lastSyncedAt'>>
): Promise<void> {
  if (db) {
    try {
      await updateDoc(doc(db, 'labs', labId), updates as Record<string, unknown>);
    } catch (err) {
      console.warn('[LabService] Firestore updateLabSettings fallback:', err);
    }
  }

  const local = readLocalLabs();
  const next = local.map((l) => (l.id === labId ? { ...l, ...updates } : l));
  writeLocalLabs(next);
}

export async function getLabIdeas(labId: string): Promise<IdeaItem[]> {
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'labs', labId, 'ideas'));
      const remote = snap.docs.map((d) => d.data() as IdeaItem);
      if (remote.length > 0) {
        writeLocalIdeas(labId, remote);
        return remote.sort((a, b) => b.createdAt - a.createdAt);
      }
    } catch (err) {
      console.warn('[LabService] Firestore getLabIdeas fallback:', err);
    }
  }
  return readLocalIdeas(labId).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getLabUserVotes(labId: string, uid: string): Promise<string[]> {
  if (db) {
    try {
      const q = query(collection(db, 'labs', labId, 'votes'), where('userId', '==', uid));
      const snap = await getDocs(q);
      const ids = snap.docs.map((d) => (d.data() as { ideaId: string }).ideaId);
      if (ids.length > 0) {
        writeLocalVotes(labId, uid, ids);
        return ids;
      }
    } catch (err) {
      console.warn('[LabService] Firestore getLabUserVotes fallback:', err);
    }
  }
  return readLocalVotes(labId, uid);
}

export async function addIdeaToLab(
  labId: string,
  idea: Omit<IdeaItem, 'id' | 'cantWaitCount' | 'passCount' | 'status' | 'createdAt'>
): Promise<IdeaItem> {
  const newIdea: IdeaItem = {
    ...idea,
    id: `cw-${Date.now()}`,
    cantWaitCount: 0,
    passCount: 0,
    status: 'queued',
    createdAt: Date.now(),
  };

  if (db) {
    try {
      await setDoc(doc(db, 'labs', labId, 'ideas', newIdea.id), newIdea);
    } catch (err) {
      console.warn('[LabService] Firestore addIdea fallback:', err);
    }
  }

  const local = readLocalIdeas(labId);
  writeLocalIdeas(labId, [newIdea, ...local]);
  return newIdea;
}

export async function syncSheetToLab(labId: string, sheetUrlOrId: string): Promise<{ count: number; ideas: IdeaItem[]; sheetId: string }> {
  const { sheetId, ideas: parsed } = await fetchSheetIdeas(sheetUrlOrId);
  const existing = await getLabIdeas(labId);
  const byId = new Map(existing.map((i) => [i.id, i]));
  const byNo = new Map(existing.filter((i) => i.no).map((i) => [i.no!.toLowerCase(), i]));

  const merged: IdeaItem[] = parsed.map((incoming) => {
    const prev = byId.get(incoming.id) || (incoming.no ? byNo.get(incoming.no.toLowerCase()) : undefined);
    return prev
      ? {
          ...incoming,
          id: prev.id,
          cantWaitCount: prev.cantWaitCount,
          passCount: prev.passCount,
          status: prev.status,
        }
      : incoming;
  });

  // Retain manual ideas that weren't from the sheet
  const incomingIds = new Set(merged.map((i) => i.id));
  for (const prev of existing) {
    if (!incomingIds.has(prev.id) && !prev.id.startsWith('sheet_')) {
      merged.push(prev);
    }
  }

  if (db) {
    try {
      for (const item of merged) {
        await setDoc(doc(db, 'labs', labId, 'ideas', item.id), item, { merge: true });
      }
    } catch (err) {
      console.warn('[LabService] Firestore syncSheet fallback:', err);
    }
  }

  writeLocalIdeas(labId, merged);
  await updateLabSettings(labId, { googleSheetId: sheetId, lastSyncedAt: Date.now() });
  return { count: parsed.length, ideas: merged, sheetId };
}

export async function recordLabVote(
  labId: string,
  uid: string,
  ideaId: string,
  vote: 'cantwait' | 'pass'
): Promise<void> {
  const voteId = `${uid}_${ideaId}`;

  if (db) {
    try {
      const voteRef = doc(db, 'labs', labId, 'votes', voteId);
      const snap = await getDoc(voteRef);
      if (!snap.exists()) {
        await setDoc(voteRef, { userId: uid, ideaId, vote, timestamp: Date.now() });
        await updateDoc(doc(db, 'labs', labId, 'ideas', ideaId), {
          [vote === 'cantwait' ? 'cantWaitCount' : 'passCount']: increment(1),
        });
      }
    } catch (err) {
      console.warn('[LabService] Firestore recordLabVote fallback:', err);
    }
  }

  const voted = readLocalVotes(labId, uid);
  if (!voted.includes(ideaId)) {
    writeLocalVotes(labId, uid, [...voted, ideaId]);
    const ideas = readLocalIdeas(labId).map((item) =>
      item.id === ideaId
        ? {
            ...item,
            cantWaitCount: vote === 'cantwait' ? item.cantWaitCount + 1 : item.cantWaitCount,
            passCount: vote === 'pass' ? item.passCount + 1 : item.passCount,
          }
        : item
    );
    writeLocalIdeas(labId, ideas);
  }
}

export async function updateIdeaStatus(
  labId: string,
  ideaId: string,
  status: IdeaStatus
): Promise<void> {
  if (db) {
    try {
      await updateDoc(doc(db, 'labs', labId, 'ideas', ideaId), { status });
    } catch (err) {
      console.warn('[LabService] Firestore updateIdeaStatus fallback:', err);
    }
  }

  const ideas = readLocalIdeas(labId).map((item) =>
    item.id === ideaId ? { ...item, status } : item
  );
  writeLocalIdeas(labId, ideas);
}
