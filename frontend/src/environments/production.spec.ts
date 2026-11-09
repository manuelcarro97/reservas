/// <reference types="node" />
import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appConfig } from '../app/app.config';
import { AdminAccountControllerService } from '../app/core/api/services/admin-account-controller.service';
import { PublicReservationControllerService } from '../app/core/api/services/public-reservation-controller.service';
import { LOAD_AUTH_SDK } from '../app/core/auth/auth-sdk';
import { FakeAuthSdk } from '../app/core/auth/testing/fake-auth-sdk';
import { API_BASE_URL } from '../app/core/config';

/**
 * El despliegue de producción: `environment.ts` (API en Render) y `firebase.json` (cabeceras de Hosting).
 *
 * Los tests corren con `environment.development.ts` en lugar de `environment.ts`, así que el valor de producción se
 * lee del propio fichero.
 */
function productionValue(key: 'apiBaseUrl' | 'authDomain'): string {
  const source = readFileSync(
    resolve(process.cwd(), 'src', 'environments', 'environment.ts'),
    'utf8',
  );
  const match = new RegExp(`${key}:\\s*'([^']*)'`).exec(source);
  if (!match) {
    throw new Error(`environment.ts no define ${key}`);
  }
  return match[1];
}

const apiBaseUrl = productionValue('apiBaseUrl');

describe('production API', () => {
  let backend: HttpTestingController;
  let http: HttpClient;

  beforeEach(() => {
    const sdk = new FakeAuthSdk();
    TestBed.configureTestingModule({
      providers: [
        ...appConfig.providers,
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: apiBaseUrl },
        {
          provide: LOAD_AUTH_SDK,
          useValue: () => {
            setTimeout(() => sdk.emit({ uid: 'uid-1', email: 'dueno@example.com' }));
            return Promise.resolve(sdk);
          },
        },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    http = TestBed.inject(HttpClient);
  });

  afterEach(() => backend.verify());

  it('apiBaseUrlIsAnAbsoluteHttpsOriginWithoutTrailingSlash', () => {
    // El cliente generado y los servicios añaden `/api/v1/...` por delante, sin barra propia.
    expect(apiBaseUrl).toMatch(/^https:\/\/[a-z0-9.-]+$/);
  });

  it('generatedClientBuildsUrlsWithoutDoubleSlash', () => {
    TestBed.inject(PublicReservationControllerService).plan({ slug: 'demo' }).subscribe();

    const request = backend.expectOne(() => true);
    expect(request.request.url).toBe(`${apiBaseUrl}/api/v1/restaurants/demo`);
    expect(request.request.url.replace('https://', '')).not.toContain('//');
    // Ruta pública: sin token.
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('addsTheTokenOnlyToTheAdminRoutesOfTheApiOrigin', async () => {
    TestBed.inject(AdminAccountControllerService).me().subscribe();
    const admin = await vi.waitUntil(() => backend.match(`${apiBaseUrl}/api/v1/admin/me`)[0]);
    expect(admin.request.headers.get('Authorization')).toBe('Bearer token-1');
    admin.flush({});

    for (const url of [
      'https://otro.example.com/api/v1/admin/me',
      `${apiBaseUrl}.evil.example/api/v1/admin/me`,
      `${apiBaseUrl}/api/v1/restaurants/demo`,
    ]) {
      http.get(url).subscribe();
      const other = backend.expectOne(url);
      expect(other.request.headers.has('Authorization'), url).toBe(false);
      other.flush({});
    }
  });
});

/**
 * Comprueba `firebase.json` (en la raíz del repo): las cabeceras de seguridad y de caché del frontend publicado.
 *
 * Firebase Hosting casa cada regla de `headers` con la ruta que pide el navegador, antes de aplicar el rewrite a
 * `/index.html`, y no documenta qué pasa si dos reglas dan la misma cabecera a una ruta. Por eso las reglas que dan la
 * misma cabecera (Content-Security-Policy y Cache-Control) no se solapan: cada una es una ruta concreta y la última es
 * la negación de todas las demás (`!/{a,b,...}`), de modo que el resultado no depende de cuál gane. Ninguna regla toca
 * `/__/**`, el espacio que Hosting reserva para sí (el helper de `signInWithPopup` vive en `/__/auth/*`): una CSP o un
 * COOP nuestros ahí romperían el login con Google. Qué rutas casan con cada glob lo decide Hosting; esto solo fija el
 * diseño y, después de desplegar, se comprueba con `curl -I` (ver DEPLOY.md).
 */
interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

interface FirebaseConfig {
  hosting: {
    public: string;
    rewrites: { source: string; destination: string }[];
    headers: HeaderRule[];
  };
}

const config = JSON.parse(
  readFileSync(resolve(process.cwd(), '..', 'firebase.json'), 'utf8'),
) as FirebaseConfig;
const rules = config.hosting.headers;

function rulesGiving(key: string): HeaderRule[] {
  return rules.filter((rule) => rule.headers.some((header) => header.key === key));
}

function valueOf(rule: HeaderRule, key: string): string {
  const header = rule.headers.find((candidate) => candidate.key === key);
  if (!header) {
    throw new Error(`La regla ${rule.source} no da ${key}`);
  }
  return header.value;
}

/** `{ 'script-src': ["'self'", ...], ... }` de un valor de Content-Security-Policy. */
function directives(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy
      .split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name, sources]),
  );
}

describe('firebase.json (Hosting)', () => {
  const embeddable = '/@(r|reserva)/**';
  // Todo lo demás salvo el espacio reservado de Hosting.
  const notEmbeddable = '!/@(r|reserva|__)/**';
  const csp = 'Content-Security-Policy';

  it('publishesTheAngularBuildAndRewritesEveryRouteToIndexHtml', () => {
    expect(config.hosting.public).toBe('frontend/dist/frontend/browser');
    expect(config.hosting.rewrites).toEqual([{ source: '**', destination: '/index.html' }]);
  });

  it('sendsTheCommonSecurityHeadersOnEveryPathExceptTheReservedOnes', () => {
    const [common] = rulesGiving('X-Content-Type-Options');

    expect(common.source).toBe('!/__/**');
    expect(valueOf(common, 'X-Content-Type-Options')).toBe('nosniff');
    expect(valueOf(common, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    // `same-origin` rompería el popup de Google (signInWithPopup).
    expect(valueOf(common, 'Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups');
    const permissions = valueOf(common, 'Permissions-Policy');
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment']) {
      expect(permissions).toContain(`${feature}=()`);
    }
  });

  it('neverSetsXFrameOptions', () => {
    // No puede decir "cualquier origen" en las rutas incrustables; manda frame-ancestors.
    expect(rulesGiving('X-Frame-Options')).toEqual([]);
  });

  it('allowsFramingOnlyOnTheEmbeddableRoutes', () => {
    const policies = new Map(
      rulesGiving(csp).map((rule) => [rule.source, directives(valueOf(rule, csp))]),
    );
    expect([...policies.keys()].sort()).toEqual([embeddable, notEmbeddable].sort());

    const embedded = policies.get(embeddable) ?? {};
    const closed = policies.get(notEmbeddable) ?? {};

    expect(embedded['frame-ancestors']).toEqual(['*']);
    expect(closed['frame-ancestors']).toEqual(["'none'"]);
    // Aparte de frame-ancestors, las dos políticas son la misma.
    delete embedded['frame-ancestors'];
    delete closed['frame-ancestors'];
    expect(embedded).toEqual(closed);
  });

  it('contentSecurityPolicyAllowsOnlyWhatTheAppUses', () => {
    const policy = directives(valueOf(rulesGiving(csp)[0], csp));

    expect(policy['default-src']).toEqual(["'self'"]);
    expect(policy['script-src']).toEqual([
      "'self'",
      expect.stringMatching(/^'sha256-[A-Za-z0-9+/]+={0,2}'$/),
      'https://apis.google.com',
    ]);
    // Angular inyecta <style> de componente y el CSS crítico en línea.
    expect(policy['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy['img-src']).toEqual(["'self'", 'data:']);
    expect(policy['font-src']).toEqual(["'self'"]);
    expect(policy['connect-src']).toEqual([
      "'self'",
      apiBaseUrl,
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
    ]);
    expect(policy['frame-src']).toEqual([`https://${productionValue('authDomain')}`]);
    expect(policy['base-uri']).toEqual(["'self'"]);
    expect(policy['form-action']).toEqual(["'self'"]);
    expect(policy['object-src']).toEqual(["'none'"]);
    expect(JSON.stringify(policy)).not.toContain('unsafe-eval');
  });

  it('cachesHashedAssetsForeverAndEverythingElseRevalidates', () => {
    const given = rulesGiving('Cache-Control');
    const others = given[given.length - 1];
    const assets = given.slice(0, -1);

    // Los ficheros con hash que emite Angular: en la raíz y las fuentes de /media.
    expect(assets.map((rule) => rule.source)).toEqual(['/*.@(js|css)', '/media/*.@(woff|woff2)']);
    for (const rule of assets) {
      expect(valueOf(rule, 'Cache-Control')).toBe('public, max-age=31536000, immutable');
    }
    // index.html y cualquier ruta de la SPA (que Hosting sirve con index.html) revalidan. La última regla es la
    // negación de las anteriores y del espacio reservado de Hosting.
    expect(valueOf(others, 'Cache-Control')).toBe('no-cache');
    const covered = [...assets.map((rule) => rule.source.slice(1)), '__/**'];
    expect(others.source).toBe(`!/{${covered.join(',')}}`);
  });

  it('keepsEveryHeaderRuleAwayFromTheReservedHostingPaths', () => {
    // Ninguna regla puede casar con /__/auth/*. Las positivas no apuntan a /__/ y las negativas lo excluyen.
    for (const rule of rules) {
      const positive = !rule.source.startsWith('!');
      if (positive) {
        expect(rule.source, rule.source).not.toMatch(/^\/?(__|\*\*)/);
      } else {
        expect(rule.source, rule.source).toContain('__');
      }
    }
  });
});
