import { authErrorCode, authErrorMessage } from './auth-errors';

/** Forma de los errores del SDK: `code` de la familia `auth/*` y un mensaje en inglés que no debe mostrarse. */
function firebaseError(code: string): { code: string; message: string } {
  return { code, message: `Firebase: Error (${code}).` };
}

describe('authErrorMessage', () => {
  const cases: [string, string][] = [
    ['auth/invalid-credential', 'Email o contraseña incorrectos'],
    ['auth/user-not-found', 'Email o contraseña incorrectos'],
    ['auth/wrong-password', 'Email o contraseña incorrectos'],
    ['auth/email-already-in-use', 'Ya existe una cuenta con ese email'],
    ['auth/weak-password', 'La contraseña debe tener al menos 6 caracteres'],
    ['auth/invalid-email', 'El email no es válido'],
    ['auth/too-many-requests', 'Demasiados intentos. Espera un momento y vuelve a probar'],
    ['auth/popup-closed-by-user', 'Cerraste la ventana de Google antes de terminar'],
    ['auth/cancelled-popup-request', 'Cerraste la ventana de Google antes de terminar'],
    [
      'auth/popup-blocked',
      'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes',
    ],
    ['auth/network-request-failed', 'No se pudo conectar. Revisa tu conexión y vuelve a probar'],
  ];

  it.each(cases)('mapsKnownCodeToSpanish %s', (code, message) => {
    expect(authErrorMessage(firebaseError(code))).toBe(message);
  });

  it('usesGenericSpanishMessageForUnknownCodesWithoutLeakingTheSdkText', () => {
    const message = authErrorMessage(firebaseError('auth/internal-error'));

    expect(message).toBe('No se pudo completar la operación. Inténtalo de nuevo');
    expect(message).not.toContain('Firebase');
  });

  it('usesGenericMessageForErrorsWithoutCode', () => {
    expect(authErrorMessage(new Error('chunk load failed'))).toBe(
      'No se pudo completar la operación. Inténtalo de nuevo',
    );
    expect(authErrorMessage(undefined)).toBe(
      'No se pudo completar la operación. Inténtalo de nuevo',
    );
  });
});

describe('authErrorCode', () => {
  it('readsAuthCodes', () => {
    expect(authErrorCode(firebaseError('auth/user-not-found'))).toBe('auth/user-not-found');
  });

  it('ignoresAnythingElse', () => {
    expect(authErrorCode(new Error('x'))).toBeUndefined();
    expect(authErrorCode({ code: 'storage/unknown' })).toBeUndefined();
    expect(authErrorCode(null)).toBeUndefined();
  });
});
