import { Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { PlanSummaryResponse } from '../core/api/models/plan-summary-response';

/** Segmentos de `/panel/…` que son páginas del dueño y no el slug de un plano (el backend reserva esos slugs). */
const NON_PLAN_SEGMENTS = new Set(['cuenta', 'planos']);

/** Dónde está el panel según su URL: `/panel`, `/panel/planos`, `/panel/cuenta` o `/panel/:slug/:section`. */
export interface PanelLocation {
  /** Plano de la URL. `null` en `/panel`, `/panel/planos` y `/panel/cuenta`: `planos` y `cuenta` nunca son un slug. */
  slug: string | null;
  /** Lo que va tras el slug (`''` en las reservas, `inicio`, `plano`, `turnos`, `ajustes`). */
  section: string;
  /** Plano que pide `?plano=` para subirlo a la tarjeta grande de Mis planos. */
  queryPlan: string | null;
}

export function panelLocation(url: string, router: Router): PanelLocation {
  const tree = router.parseUrl(url);
  const segments = tree.root.children['primary']?.segments.map((segment) => segment.path) ?? [];
  const isPlanUrl =
    segments[0] === 'panel' && segments.length >= 2 && !NON_PLAN_SEGMENTS.has(segments[1]);
  const queryPlan: unknown = tree.queryParams['plano'];
  return {
    slug: isPlanUrl ? segments[1] : null,
    section: isPlanUrl ? segments.slice(2).join('/') : '',
    queryPlan: typeof queryPlan === 'string' && queryPlan ? queryPlan : null,
  };
}

/**
 * Plano al que apuntan la cabecera y las pestañas del panel. Con un slug en la URL manda el slug, aunque la lista de
 * planos aún no haya llegado. Sin él, `?plano=` si ese plano existe y, si no, el primero. Sin planos, `null`.
 */
export function currentPlanSlug(
  url: string,
  router: Router,
  plans: readonly PlanSummaryResponse[],
): string | null {
  const { slug, queryPlan } = panelLocation(url, router);
  if (slug) {
    return slug;
  }
  if (queryPlan && plans.some((plan) => plan.slug === queryPlan)) {
    return queryPlan;
  }
  return plans[0]?.slug ?? null;
}

/** URL actual del router, al día en cada navegación. Se llama en un contexto de inyección. */
export function routerUrl(router: Router): Signal<string> {
  return toSignal(
    router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: router.url },
  );
}
