import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { environment } from '../../../environments/environment';
import { AuthSdk, AuthUser } from './auth-sdk';

function toAuthUser(user: User | null): AuthUser | null {
  return user ? { uid: user.uid, email: user.email } : null;
}

/**
 * Único fichero de la aplicación que importa `firebase/*`. Solo se descarga al crear `AuthService`
 * (`import()` dinámico en `LOAD_AUTH_SDK`). Config web de `environment` (no es secreta); sin Analytics.
 */
export function createFirebaseAuthSdk(): AuthSdk {
  const app = getApps().length > 0 ? getApp() : initializeApp(environment.firebase);
  const auth = getAuth(app);

  return {
    onUserChanged: (listener) => {
      onIdTokenChanged(auth, (user) => listener(toAuthUser(user)));
    },
    signInWithEmail: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    register: async (email, password) => {
      await createUserWithEmailAndPassword(auth, email, password);
    },
    signInWithGoogle: async () => {
      await signInWithPopup(auth, new GoogleAuthProvider());
    },
    sendPasswordReset: (email) => sendPasswordResetEmail(auth, email),
    signOut: () => signOut(auth),
    idToken: async () => (await auth.currentUser?.getIdToken()) ?? null,
  };
}
