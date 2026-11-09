import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ApiConfiguration } from '../core/api/api-configuration';
import { provideFakeAuthSdk, FakeAuthSdk } from '../core/auth/testing/fake-auth-sdk';
import { AdminShellComponent } from './admin-shell.component';
import { FeedService, FeedToast } from './notifications/feed.service';

@Component({ template: '<p>reservas</p>' })
class PageStub {}

/** Lo que la cabecera y los mensajes usan del servicio; el sondeo se prueba en `feed.service.spec.ts`. */
function fakeFeed() {
  return {
    pendingCount: signal(0),
    muted: signal(false),
    canAskPermission: signal(false),
    toasts: signal<FeedToast[]>([]),
    toggleMute: vi.fn(),
    askPermission: vi.fn(),
    dismiss: vi.fn(),
  };
}

describe('AdminShellComponent notifications', () => {
  let feed: ReturnType<typeof fakeFeed>;
  let host: HTMLElement;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    feed = fakeFeed();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideFakeAuthSdk(new FakeAuthSdk()),
        provideRouter([
          {
            path: 'panel',
            component: AdminShellComponent,
            children: [{ path: '', component: PageStub }],
          },
        ]),
      ],
    });
    // El marco provee su propio `FeedService`: se sustituye ahí, no en el módulo de pruebas.
    TestBed.overrideComponent(AdminShellComponent, {
      remove: { providers: [FeedService] },
      add: { providers: [{ provide: FeedService, useValue: feed }] },
    });
    TestBed.inject(ApiConfiguration).rootUrl = '';
    harness = await RouterTestingHarness.create();
    host = harness.fixture.nativeElement as HTMLElement;
    await harness.navigateByUrl('/panel');
    TestBed.inject(HttpTestingController)
      .expectOne((request) => request.url.endsWith('/api/v1/admin/me'))
      .flush({ email: 'dueno@example.com', demo: false, maxPlans: 3, plans: [] });
    await settle();
  });

  async function settle(): Promise<void> {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  function button(name: string): HTMLButtonElement | undefined {
    return Array.from(host.querySelectorAll<HTMLButtonElement>('header button')).find((candidate) =>
      candidate.textContent?.includes(name),
    );
  }

  it('showsNoBadgeWithoutUnseenNotices', () => {
    expect(host.querySelector('.badge')).toBeNull();
  });

  it('showsTheUnseenCountAsABadge', async () => {
    feed.pendingCount.set(3);
    await settle();

    expect(host.querySelector('.badge')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Avisos sin ver: 3',
    );
  });

  it('muteButtonTogglesTheSoundAndShowsTheState', async () => {
    button('Silenciar')!.click();
    expect(feed.toggleMute).toHaveBeenCalledTimes(1);

    feed.muted.set(true);
    await settle();

    expect(button('Silenciar')).toBeUndefined();
    expect(button('Activar sonido')).toBeDefined();
  });

  it('browserNoticesButtonIsHiddenUnlessPermissionIsStillUndecided', async () => {
    expect(button('Activar avisos del navegador')).toBeUndefined();

    feed.canAskPermission.set(true);
    await settle();
    button('Activar avisos del navegador')!.click();

    expect(feed.askPermission).toHaveBeenCalledTimes(1);

    feed.canAskPermission.set(false);
    await settle();
    expect(button('Activar avisos del navegador')).toBeUndefined();
  });

  it('showsTheToastsOutsideTheHeader', async () => {
    feed.toasts.set([{ id: 1, text: 'Nueva reserva: Ana', slug: 'kafe' }]);
    await settle();

    expect(host.querySelector('app-toast [aria-live="polite"]')?.textContent).toContain(
      'Nueva reserva: Ana',
    );
  });
});
