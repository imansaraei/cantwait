import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type Auth,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

let auth: Auth | null = null;
let db: Firestore | null = null;
if (isFirebaseConfigured) {
  try {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (err) {
    console.warn('[CantWait Auth] Firebase init failed:', err);
  }
}

export { auth, db };

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

const otpStore = new Map<string, string>();
const listeners = new Set<(user: AuthUser | null) => void>();
let localUser: AuthUser | null = (() => {
  try {
    const saved = localStorage.getItem('cantwait_user_v1');
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
})();

function notifyLocal(user: AuthUser | null) {
  localUser = user;
  if (user) {
    localStorage.setItem('cantwait_user_v1', JSON.stringify(user));
  } else {
    localStorage.removeItem('cantwait_user_v1');
  }
  listeners.forEach((cb) => cb(user));
}

export function onAuthChange(cb: (user: AuthUser | null) => void): () => void {
  listeners.add(cb);
  if (localUser) cb(localUser);

  let unsubFb: (() => void) | null = null;
  if (auth) {
    unsubFb = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const mapped: AuthUser = {
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName,
          photoURL: fbUser.photoURL,
        };
        notifyLocal(mapped);
      }
    });
  }

  return () => {
    listeners.delete(cb);
    unsubFb?.();
  };
}

export async function signInWithGoogle(): Promise<AuthUser> {
  if (auth) {
    const provider = new GoogleAuthProvider();
    const res = await signInWithPopup(auth, provider);
    const mapped: AuthUser = {
      uid: res.user.uid,
      email: res.user.email,
      displayName: res.user.displayName,
      photoURL: res.user.photoURL,
    };
    notifyLocal(mapped);
    return mapped;
  }

  const demo: AuthUser = {
    uid: `google_${Date.now()}`,
    email: 'creator@cantwait.app',
    displayName: 'Creator',
    photoURL: null,
  };
  notifyLocal(demo);
  return demo;
}

export async function requestEmailCode(email: string): Promise<string> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    throw new Error('Please enter a valid email address.');
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(clean, code);
  return code;
}

export async function verifyEmailCode(email: string, code: string): Promise<AuthUser> {
  const clean = email.trim().toLowerCase();
  const expected = otpStore.get(clean);
  if (!expected || code.trim() !== expected) {
    throw new Error('Invalid verification code. Please try again.');
  }
  otpStore.delete(clean);
  const user: AuthUser = {
    uid: `email_${btoa(clean).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`,
    email: clean,
    displayName: clean.split('@')[0],
    photoURL: null,
  };
  notifyLocal(user);
  return user;
}

export async function signOut(): Promise<void> {
  if (auth) {
    try {
      await fbSignOut(auth);
    } catch {
      // ignore
    }
  }
  notifyLocal(null);
}
