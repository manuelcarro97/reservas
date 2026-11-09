import type { Environment } from './environment.model';

// Producción. La URL de la API es la del servicio `reservas-api` de render.yaml. Si en Render el servicio acaba con
// otro nombre (el subdominio onrender.com sale de él, y si está cogido Render añade un sufijo), cámbiala aquí y en el
// `connect-src` de firebase.json (hay un test que comprueba que coinciden).
// Configuración web de Firebase: no es secreta (identifica el proyecto, no da acceso). Sin Analytics a propósito.
// `demoAccount`: la cuenta demo es pública a propósito (sale en el README). Debe coincidir con DEMO_EMAIL y
// DEMO_PASSWORD de Render, que es quien la crea y la restaura cada noche. example.com no recibe correo: así un
// "recuperar contraseña" sobre la demo no manda nada a nadie.
export const environment: Environment = {
  apiBaseUrl: 'https://reservas-api-0vml.onrender.com',
  demoAccount: { email: 'demo@example.com', password: 'ReservasDemo2026.' },
  firebase: {
    apiKey: 'AIzaSyDxB69zClco-MBaPtwCUUtMkTrdDHWPpCE',
    authDomain: 'reservas-6d51b.firebaseapp.com',
    projectId: 'reservas-6d51b',
    storageBucket: 'reservas-6d51b.firebasestorage.app',
    messagingSenderId: '291275393546',
    appId: '1:291275393546:web:8c9b7afad2be3a3bec2df3',
  },
};
