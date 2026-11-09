import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { appConfig } from './app.config';
import { ApiConfiguration } from './core/api/api-configuration';
import { LOAD_AUTH_SDK } from './core/auth/auth-sdk';
import { FakeAuthSdk, flushPromises } from './core/auth/testing/fake-auth-sdk';
import { API_BASE_URL } from './core/config';

describe('appConfig', () => {
  it('apiClientUsesApiBaseUrl', () => {
    TestBed.configureTestingModule({ providers: appConfig.providers });

    expect(TestBed.inject(ApiConfiguration).rootUrl).toBe(TestBed.inject(API_BASE_URL));
  });

  describe('auth interceptor', () => {
    let loadSdk: ReturnType<typeof vi.fn>;
    let backend: HttpTestingController;
    let http: HttpClient;

    beforeEach(() => {
      const sdk = new FakeAuthSdk();
      loadSdk = vi.fn(() => {
        // Simula que Firebase restaura la sesión poco después de cargar.
        setTimeout(() => sdk.emit({ uid: 'uid-1', email: 'dueno@example.com' }));
        return Promise.resolve(sdk);
      });
      TestBed.configureTestingModule({
        providers: [
          ...appConfig.providers,
          provideHttpClientTesting(),
          { provide: LOAD_AUTH_SDK, useValue: loadSdk },
        ],
      });
      backend = TestBed.inject(HttpTestingController);
      http = TestBed.inject(HttpClient);
    });

    it('isRegisteredAndAddsTheTokenToAdminRequests', async () => {
      const adminUrl = `${TestBed.inject(API_BASE_URL)}/api/v1/admin/me`;

      http.get(adminUrl).subscribe();
      const request = await vi.waitUntil(() => backend.match(adminUrl)[0]);

      expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
      request.flush({});
    });

    it('publicRequestsNeverLoadTheFirebaseSdk', async () => {
      const publicUrl = `${TestBed.inject(API_BASE_URL)}/api/v1/restaurants/kafe`;

      http.get(publicUrl).subscribe();
      backend.expectOne(publicUrl).flush({});
      await flushPromises();

      expect(loadSdk).not.toHaveBeenCalled();
    });
  });
});
