/** Escapa un texto para ponerlo dentro de un atributo HTML entre comillas dobles. */
function escapeAttribute(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * Código `<iframe>` que el dueño pega en su web: la página pública del plano en modo incrustado (`?embed=1`, sin
 * cabecera). `origin` es el de esta app (`https://…`, sin barra final).
 */
export function embedSnippet(origin: string, slug: string, name: string): string {
  const src = `${origin}/r/${encodeURIComponent(slug)}?embed=1`;
  return (
    `<iframe src="${escapeAttribute(src)}" title="${escapeAttribute(`Reservas · ${name}`)}" ` +
    'width="100%" height="720" style="border:0" loading="lazy"></iframe>'
  );
}
