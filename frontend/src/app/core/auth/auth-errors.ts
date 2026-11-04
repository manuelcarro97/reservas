const GENERIC_MESSAGE = 'No se pudo completar la operación. Inténtalo de nuevo';

const WRONG_CREDENTIALS = 'Email o contraseña incorrectos';
const POPUP_CLOSED = 'Cerraste la ventana de Google antes de terminar';

/**
 * Errores `auth/*` del SDK más habituales. Nunca se muestra el texto del SDK (viene en inglés y a veces revela más
 * de lo debido): lo que no está aquí sale con el mensaje genérico.
 * `user-not-found` y `wrong-password` (SDK antiguo o sin protección de enumeración) dan el mismo mensaje que
 * `invalid-credential`, para no revelar si el email tiene cuenta.
 */
const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': WRONG_CREDENTIALS,
  'auth/user-not-found': WRONG_CREDENTIALS,
  'auth/wrong-password': WRONG_CREDENTIALS,
  'auth/email-already-in-use': 'Ya existe una cuenta con ese email',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
  'auth/invalid-email': 'El email no es válido',
  'auth/too-many-requests': 'Demasiados intentos. Espera un momento y vuelve a probar',
  'auth/popup-closed-by-user': POPUP_CLOSED,
  'auth/cancelled-popup-request': POPUP_CLOSED,
  'auth/popup-blocked':
    'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes',
  'auth/network-request-failed': 'No se pudo conectar. Revisa tu conexión y vuelve a probar',
};

/** Código `auth/*` de un error del SDK de Firebase, o `undefined` si el error es de otra clase. */
export function authErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.startsWith('auth/') ? code : undefined;
}

/** Mensaje en español para mostrar al usuario. */
export function authErrorMessage(error: unknown): string {
  const code = authErrorCode(error);
  return (code && MESSAGES[code]) || GENERIC_MESSAGE;
}
