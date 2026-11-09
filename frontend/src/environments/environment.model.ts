/** Forma común de `environment.ts` (producción) y `environment.development.ts`. */
export interface Environment {
  /** URL base del backend, sin barra final; vacía = mismo origen. */
  apiBaseUrl: string;
  /** Configuración web de Firebase: no es secreta (identifica el proyecto, no da acceso). */
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  /**
   * Cuenta de la demo pública. Opcional: se rellena en el despliegue con las mismas credenciales que publica el
   * README. Si falta, la página de entrar no muestra el recuadro "Prueba la demo".
   */
  demoAccount?: { email: string; password: string };
}
