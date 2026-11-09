/** Largo máximo del slug (`@Size(max = 80)` de `CreatePlanRequest` y columna `VARCHAR(80)`). */
export const SLUG_MAX_LENGTH = 80;

/**
 * Slugs que el backend rechaza con 409 `SLUG_RESERVED` (`AdminPlanController.RESERVED_SLUGS`), más `cuenta`: la ruta
 * `/panel/cuenta` (la cuenta) taparía a `/panel/:slug` (las reservas de un plano con ese slug).
 */
const RESERVED_SLUGS = new Set(['demo', 'admin', 'api', 'r', 'panel', 'reserva', 'cuenta', 'planos']);

/**
 * Slug propuesto a partir del nombre: minúsculas, sin acentos, solo `a-z0-9-`, guiones colapsados y sin guiones en
 * los extremos. Puede salir vacío (nombre sin letras ni números).
 */
export function suggestSlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Al cortar puede quedar un guion al final.
  return slug.slice(0, SLUG_MAX_LENGTH).replace(/-+$/, '');
}

/**
 * Por qué el slug no vale, en español, o `null` si vale. Mismas reglas que el backend: `[a-z0-9-]+`, máx. 80 y no
 * reservado.
 */
export function slugProblem(slug: string): string | null {
  if (!slug) {
    return 'Escribe el enlace del plano.';
  }
  if (slug.length > SLUG_MAX_LENGTH) {
    return `El enlace puede tener como máximo ${SLUG_MAX_LENGTH} caracteres.`;
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return 'El enlace solo puede llevar letras minúsculas sin acentos, números y guiones.';
  }
  if (RESERVED_SLUGS.has(slug)) {
    return 'Ese enlace está reservado. Elige otro.';
  }
  return null;
}
