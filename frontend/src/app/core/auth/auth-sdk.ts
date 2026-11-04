import { InjectionToken } from '@angular/core';

/** Usuario con sesión iniciada. `email` puede faltar según el proveedor. */
export interface AuthUser {
  uid: string;
  email: string | null;
}

/**
 * Lo único que la aplicación usa del SDK de Firebase Auth. Es la frontera con `firebase/*`: solo la implementa
 * `firebase-auth.sdk.ts`, y los tests la sustituyen por un doble.
 */
export interface AuthSdk {
  /** Avisa de la sesión actual al arrancar y de cada cambio posterior (entrada, salida, renovación del token). */
  onUserChanged(listener: (user: AuthUser | null) => void): void;
  signInWithEmail(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
  /** Token de ID vigente (el SDK lo renueva si ha caducado) o `null` sin sesión. */
  idToken(): Promise<string | null>;
}

/**
 * Carga el SDK bajo demanda. El `import()` dinámico deja Firebase en un chunk aparte: las páginas públicas,
 * que nunca inyectan `AuthService`, no lo descargan.
 */
export const LOAD_AUTH_SDK = new InjectionToken<() => Promise<AuthSdk>>('LOAD_AUTH_SDK', {
  providedIn: 'root',
  factory: () => () => import('./firebase-auth.sdk').then((sdk) => sdk.createFirebaseAuthSdk()),
});
