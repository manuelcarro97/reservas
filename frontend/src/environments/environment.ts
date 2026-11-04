// Producción. La URL de la API se fija al desplegar el backend; vacía = mismo origen.
// Configuración web de Firebase: no es secreta (identifica el proyecto, no da acceso). Sin Analytics a propósito.
export const environment = {
  apiBaseUrl: '',
  firebase: {
    apiKey: 'AIzaSyDxB69zClco-MBaPtwCUUtMkTrdDHWPpCE',
    authDomain: 'reservas-6d51b.firebaseapp.com',
    projectId: 'reservas-6d51b',
    storageBucket: 'reservas-6d51b.firebasestorage.app',
    messagingSenderId: '291275393546',
    appId: '1:291275393546:web:8c9b7afad2be3a3bec2df3',
  },
};
