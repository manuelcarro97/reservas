import { InjectionToken } from '@angular/core';

export type LinkTarget = '_self' | '_top';

/**
 * `_top` si la página está dentro de un iframe, `_self` si no. Se mira `window.top` y no `?embed=1`: el iframe de la
 * web del restaurante puede no llevar el parámetro. La comparación es válida aunque la ventana superior sea de otro
 * origen (solo se comparan las referencias, no se lee nada de ella).
 */
export function linkTargetFor(win: { self: unknown; top: unknown }): LinkTarget {
  return win.self !== win.top ? '_top' : '_self';
}

/**
 * `target` de los enlaces de las páginas públicas hacia rutas que no se pueden incrustar (`/entrar`, `/registro`,
 * `/panel`: llevan `frame-ancestors 'none'` y dentro de un iframe saldrían en blanco). Dentro de un iframe abren la
 * ventana superior. Es un token para que los tests lo sustituyan.
 */
export const NON_EMBEDDABLE_LINK_TARGET = new InjectionToken<LinkTarget>(
  'NON_EMBEDDABLE_LINK_TARGET',
  {
    providedIn: 'root',
    factory: () => linkTargetFor(window),
  },
);
