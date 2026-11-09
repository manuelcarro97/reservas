# Frontend de reservas

Angular 22 (componentes standalone, signals, sin zone.js). Contiene la página pública de reservas, la consulta de una reserva por código y el panel del dueño. La visión general del proyecto está en el [README principal](../README.md).

## Comandos

Requiere Node 24.

```bash
npm ci
npm start      # http://localhost:4200, contra la API de http://localhost:8080
npm test       # Vitest
npm run build  # build de producción en dist/frontend/browser
```

`npm start`, `npm test` y `npm run build` regeneran antes el cliente de la API (`npm run api`, con ng-openapi-gen) desde [`../contracts/openapi.json`](../contracts/openapi.json). El cliente generado no se versiona: si el contrato cambia, el compilador marca lo que hay que tocar.

Tras el build, `scripts/check-hosting-config.mjs` comprueba que cada script en línea del `index.html` está permitido por la CSP de `../firebase.json`. Si falla, el despliegue no llega a hacerse.

## Estructura

```
src/app/
  public/   página de reservas (/r/<local>) y consulta por código (/reserva/<código>)
  admin/    panel del dueño: planos, editor, reservas, turnos, configuración, cuenta
  plano/    dibujo del plano en SVG, compartido por el editor, el panel y la página pública
  core/     cliente de la API, autenticación, hora y utilidades
  shared/   componentes reutilizables
  shell/    cabeceras y pie
src/environments/
  environment.development.ts   local
  environment.ts               producción: URL de la API en Render y configuración web de Firebase
```

La página pública es la que se incrusta en la web de un restaurante. Va en un chunk aparte y no descarga Firebase ni código del panel.

## Estilos

Los colores, tipografías y espacios salen de los tokens de `src/styles/tokens.css`. Un test falla si aparece un color suelto fuera de ellos. Las fuentes (Geist, Geist Mono e Instrument Serif, de @fontsource) se sirven desde el propio sitio, sin peticiones a terceros.
