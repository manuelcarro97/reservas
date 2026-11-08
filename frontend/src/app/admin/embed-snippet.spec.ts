import { embedSnippet } from './embed-snippet';

describe('embedSnippet', () => {
  it('apunta a /r/<slug>?embed=1 con el origen dado', () => {
    expect(embedSnippet('https://reservas.example.com', 'kafe', 'Kafé del Puerto')).toBe(
      '<iframe src="https://reservas.example.com/r/kafe?embed=1" title="Reservas · Kafé del Puerto" ' +
        'width="100%" height="720" style="border:0" loading="lazy"></iframe>',
    );
  });

  it('codifica el slug para la URL', () => {
    expect(embedSnippet('https://a.example', 'a/b c?', 'Bar')).toContain(
      'src="https://a.example/r/a%2Fb%20c%3F?embed=1"',
    );
  });

  it('escapa el nombre para un atributo HTML', () => {
    const snippet = embedSnippet('https://a.example', 'bar', `"><script>x</script> & 'o'`);

    expect(snippet).toContain(
      'title="Reservas · &quot;&gt;&lt;script&gt;x&lt;/script&gt; &amp; &#39;o&#39;"',
    );
    expect(snippet).not.toContain('<script>');
  });
});
