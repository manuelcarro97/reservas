import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { Mock } from 'vitest';
import { API_BASE_URL } from '../config';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let router: Router;
  // El interceptor espera al token (promesa): las peticiones admin llegan al backend un instante después.
  let idToken: Mock<() => Promise<string | null>>;
  let signOut: Mock<() => Promise<void>>;

  function configure(apiBaseUrl: string): void {
    idToken = vi.fn<() => Promise<string | null>>(() => Promise.resolve('token-1'));
    signOut = vi.fn<() => Promise<void>>(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: apiBaseUrl },
        { provide: AuthService, useValue: { idToken, signOut } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  }

  afterEach(() => backend.verify());

  describe('with the API on another origin', () => {
    beforeEach(() => configure('http://localhost:8080'));

    it('interceptorAddsBearerOnlyToAdmin', async () => {
      http.get('http://localhost:8080/api/v1/admin/me').subscribe();
      const admin = await vi.waitUntil(
        () => backend.match('http://localhost:8080/api/v1/admin/me')[0],
      );
      expect(admin.request.headers.get('Authorization')).toBe('Bearer token-1');
      admin.flush({});

      http.get('http://localhost:8080/api/v1/restaurants/kafe').subscribe();
      const publicApi = backend.expectOne('http://localhost:8080/api/v1/restaurants/kafe');
      expect(publicApi.request.headers.has('Authorization')).toBe(false);
      publicApi.flush({});

      http.get('https://otro.example.com/api/v1/admin/me').subscribe();
      const foreign = backend.expectOne('https://otro.example.com/api/v1/admin/me');
      expect(foreign.request.headers.has('Authorization')).toBe(false);
      foreign.flush({});

      http.get('http://localhost:8080.evil.example/api/v1/admin/me').subscribe();
      const lookalike = backend.expectOne('http://localhost:8080.evil.example/api/v1/admin/me');
      expect(lookalike.request.headers.has('Authorization')).toBe(false);
      lookalike.flush({});

      expect(idToken).toHaveBeenCalledTimes(1);
    });

    it('sendsAdminRequestWithoutHeaderWhenTheTokenFails', async () => {
      idToken.mockRejectedValue(new Error('token refresh failed'));

      http.get('http://localhost:8080/api/v1/admin/me').subscribe();
      const request = await vi.waitUntil(
        () => backend.match('http://localhost:8080/api/v1/admin/me')[0],
      );

      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
    });

    it('sendsAdminRequestWithoutHeaderWhenThereIsNoSession', async () => {
      idToken.mockResolvedValue(null);

      http.get('http://localhost:8080/api/v1/admin/me').subscribe();
      const request = await vi.waitUntil(
        () => backend.match('http://localhost:8080/api/v1/admin/me')[0],
      );

      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
    });
  });

  describe('with the API on the same origin (production)', () => {
    beforeEach(() => configure(''));

    it('addsBearerToRelativeAdminUrlsOnly', async () => {
      http.get('/api/v1/admin/restaurants').subscribe();
      const admin = await vi.waitUntil(() => backend.match('/api/v1/admin/restaurants')[0]);
      expect(admin.request.headers.get('Authorization')).toBe('Bearer token-1');
      admin.flush([]);

      http.get('/api/v1/restaurants/kafe').subscribe();
      const publicApi = backend.expectOne('/api/v1/restaurants/kafe');
      expect(publicApi.request.headers.has('Authorization')).toBe(false);
      publicApi.flush({});

      http.get('https://otro.example.com/api/v1/admin/me').subscribe();
      const foreign = backend.expectOne('https://otro.example.com/api/v1/admin/me');
      expect(foreign.request.headers.has('Authorization')).toBe(false);
      foreign.flush({});

      http.get('//otro.example.com/api/v1/admin/me').subscribe();
      const protocolRelative = backend.expectOne('//otro.example.com/api/v1/admin/me');
      expect(protocolRelative.request.headers.has('Authorization')).toBe(false);
      protocolRelative.flush({});
    });
  });

  describe('when the backend answers 401 on an admin route', () => {
    beforeEach(() => configure('http://localhost:8080'));

    it('signsOutAndGoesToLogin', async () => {
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      let status: number | undefined;
      http.get('http://localhost:8080/api/v1/admin/me').subscribe({
        error: (error) => (status = error.status),
      });
      const request = await vi.waitUntil(
        () => backend.match('http://localhost:8080/api/v1/admin/me')[0],
      );

      request.flush({}, { status: 401, statusText: 'Unauthorized' });
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/entrar'));

      expect(signOut).toHaveBeenCalledTimes(1);
      expect(status).toBe(401);
    });

    it('goesToLoginEvenIfSigningOutFails', async () => {
      signOut.mockRejectedValue(new Error('offline'));
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      http.get('http://localhost:8080/api/v1/admin/me').subscribe({ error: () => undefined });
      const request = await vi.waitUntil(
        () => backend.match('http://localhost:8080/api/v1/admin/me')[0],
      );

      request.flush({}, { status: 401, statusText: 'Unauthorized' });

      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/entrar'));
    });

    it('ignoresOtherErrorsOnAdminRoutes', async () => {
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      http.get('http://localhost:8080/api/v1/admin/me').subscribe({ error: () => undefined });
      const request = await vi.waitUntil(
        () => backend.match('http://localhost:8080/api/v1/admin/me')[0],
      );

      request.flush({}, { status: 404, statusText: 'Not Found' });
      await Promise.resolve();

      expect(signOut).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('ignores401OnPublicRoutes', async () => {
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      http
        .get('http://localhost:8080/api/v1/reservations/ABC')
        .subscribe({ error: () => undefined });

      backend
        .expectOne('http://localhost:8080/api/v1/reservations/ABC')
        .flush({}, { status: 401, statusText: 'Unauthorized' });
      await Promise.resolve();

      expect(signOut).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
