import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Mock } from 'vitest';
import { ApiConfiguration } from '../core/api/api-configuration';
import { MeResponse } from '../core/api/models/me-response';
import { PlanResponse } from '../core/api/models/plan-response';
import { MeStore } from './me.store';
import { OPEN_WINDOW } from '../core/open-window';
import { SettingsPage } from './settings.page';

@Component({ selector: 'app-stub', template: '' })
class StubPage {}

const PLAN: PlanResponse = {
  slug: 'kafe',
  name: 'Kafé del Puerto',
  status: 'PUBLISHED',
  timeZone: 'Europe/Madrid',
  theme: 'NOCHE',
  bookingMode: 'FREE_CHOICE',
  cancellationDeadlineHours: 2,
  shifts: [],
};

function meWith(extra: Partial<MeResponse> = {}): MeResponse {
  return {
    email: 'dueno@example.com',
    demo: false,
    telegramAvailable: false,
    telegramLinked: false,
    maxPlans: 3,
    plans: [{ slug: 'kafe', name: 'Kafé del Puerto', status: 'PUBLISHED' }],
    ...extra,
  };
}

/** Cuerpo de error de un endpoint declarado sin cuerpo: el cliente generado lo pide como texto. */
function problem(body: object): string {
  return JSON.stringify(body);
}

describe('SettingsPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let openWindow: Mock<(url: string) => void>;

  beforeEach(() => {
    openWindow = vi.fn<(url: string) => void>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        MeStore,
        provideRouter([
          { path: 'panel', component: StubPage },
          { path: 'panel/:slug/plano', component: StubPage },
          { path: 'panel/:slug/ajustes', component: SettingsPage },
        ]),
        { provide: OPEN_WINDOW, useValue: openWindow },
      ],
    });
    TestBed.inject(ApiConfiguration).rootUrl = '';
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    // Algunos tests sustituyen el portapapeles.
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  async function settle(): Promise<void> {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  /** Petición al admin. Los DELETE piden `text` (el cliente generado los declara sin cuerpo), el resto `json`. */
  function expectApi(method: string, path: string): TestRequest {
    const request = http.expectOne(
      (candidate) => candidate.method === method && candidate.url.endsWith(`/api/v1/admin/${path}`),
    );
    expect(request.request.responseType).toBe(method === 'DELETE' ? 'text' : 'json');
    return request;
  }

  /** Abre los ajustes y responde a lo que pide al entrar: el plano y los datos del dueño (y Telegram si procede). */
  async function open(
    options: { plan?: PlanResponse; me?: MeResponse; telegram?: object | null } = {},
  ): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe/ajustes');
    page = harness.routeNativeElement as HTMLElement;
    expectApi('GET', 'restaurants/kafe').flush(options.plan ?? PLAN);
    expectApi('GET', 'me').flush(options.me ?? meWith());
    await settle();
    if (options.telegram) {
      expectApi('GET', 'telegram').flush(options.telegram);
      await settle();
    }
  }

  function field(name: string): HTMLInputElement {
    return page.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  }

  function type(name: string, value: string): void {
    const input = field(name);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.detectChanges();
  }

  function chooseMode(mode: string): void {
    page.querySelector<HTMLInputElement>(`input[name="bookingMode"][value="${mode}"]`)!.click();
    harness.detectChanges();
  }

  function button(label: string): HTMLButtonElement | undefined {
    return Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
      candidate.textContent?.includes(label),
    );
  }

  async function click(label: string): Promise<void> {
    button(label)!.click();
    await settle();
  }

  async function submitSettings(): Promise<void> {
    page
      .querySelector<HTMLFormElement>('form.settings-form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
  }

  function alertText(): string | null {
    return page.querySelector('[role="alert"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  }

  function snippetField(): HTMLTextAreaElement {
    return page.querySelector<HTMLTextAreaElement>('textarea[name="embed"]')!;
  }

  function telegramSection(): HTMLElement | null {
    return page.querySelector<HTMLElement>('section.telegram');
  }

  describe('datos del plano', () => {
    it('showsTheCurrentSettings', async () => {
      await open();

      expect(page.querySelector('h1')?.textContent).toContain('Kafé del Puerto');
      expect(field('name').value).toBe('Kafé del Puerto');
      expect(field('cancellationDeadlineHours').value).toBe('2');
      expect(field('cancellationDeadlineHours').min).toBe('0');
      expect(
        page.querySelector<HTMLInputElement>('input[name="bookingMode"][value="FREE_CHOICE"]')!
          .checked,
      ).toBe(true);
      expect(page.textContent).not.toContain('Solo afecta a las reservas nuevas');
    });

    it('saveResendsTheLoadedThemeSoTheEditorChoiceSurvives', async () => {
      await open();

      type('name', '  Kafé Nuevo ');
      type('cancellationDeadlineHours', '4');
      await submitSettings();
      const patch = expectApi('PATCH', 'restaurants/kafe');
      expect(patch.request.body).toEqual({
        name: 'Kafé Nuevo',
        theme: 'NOCHE',
        bookingMode: 'FREE_CHOICE',
        cancellationDeadlineHours: 4,
      });
      patch.flush({ ...PLAN, name: 'Kafé Nuevo', cancellationDeadlineHours: 4 });
      await settle();
      // La cabecera del panel lee el nombre del plano de MeStore.
      expectApi('GET', 'me').flush(meWith());
      await settle();

      expect(page.querySelector('[role="status"]')?.textContent).toContain('Ajustes guardados');
      expect(page.querySelector('h1')?.textContent).toContain('Kafé Nuevo');
    });

    it('modeChangeShowsNotice', async () => {
      await open();

      chooseMode('ASSIGNED');
      expect(page.textContent).toContain('Solo afecta a las reservas nuevas');

      chooseMode('FREE_CHOICE');
      expect(page.textContent).not.toContain('Solo afecta a las reservas nuevas');

      chooseMode('ASSIGNED');
      await submitSettings();
      const patch = expectApi('PATCH', 'restaurants/kafe');
      expect(patch.request.body).toMatchObject({ bookingMode: 'ASSIGNED', theme: 'NOCHE' });
      patch.flush({ ...PLAN, bookingMode: 'ASSIGNED' });
      await settle();
      expectApi('GET', 'me').flush(meWith());
      await settle();

      // Guardado, el modo nuevo es el vigente: el aviso de "cambio pendiente" desaparece.
      expect(page.querySelector('[role="status"]')?.textContent).toContain('Ajustes guardados');
    });

    it('validatesBeforeCallingTheApi', async () => {
      await open();

      type('name', '   ');
      await submitSettings();
      expect(alertText()).toContain('nombre');

      type('name', 'Kafé');
      for (const hours of ['', '-1', '1.5', 'abc']) {
        type('cancellationDeadlineHours', hours);
        await submitSettings();
        expect(alertText()).toContain('plazo');
      }
      // `http.verify()` en afterEach garantiza que no salió ninguna petición.
    });

    it.each([
      [400, 'INVALID_REQUEST', 'Revisa el nombre y el plazo de cancelación.'],
      [400, 'BAD_REQUEST', 'No se pudieron guardar los ajustes'],
      [404, 'RESTAURANT_NOT_FOUND', 'ya no existe'],
      [429, 'RATE_LIMITED', 'Demasiadas acciones seguidas, espera un momento'],
      [500, 'INTERNAL_ERROR', 'No se pudieron guardar los ajustes'],
    ])('saveShowsSpanishError %i %s', async (status, code, message) => {
      await open();
      type('name', 'Kafé Nuevo');

      await submitSettings();
      expectApi('PATCH', 'restaurants/kafe').flush({ code }, { status, statusText: 'Error' });
      await settle();

      expect(alertText()).toContain(message);
      expect(field('name').value).toBe('Kafé Nuevo');
    });

    it('showsLoadingThenFailureWithRetry', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/ajustes');
      page = harness.routeNativeElement as HTMLElement;
      expect(page.textContent).toContain('Cargando');

      expectApi('GET', 'restaurants/kafe').flush({}, { status: 500, statusText: 'Server Error' });
      expectApi('GET', 'me').flush(meWith());
      await settle();
      expect(alertText()).toContain('No se pudo cargar');

      await click('Reintentar');
      expectApi('GET', 'restaurants/kafe').flush(PLAN);
      await settle();

      expect(field('name').value).toBe('Kafé del Puerto');
    });

    it('unknownPlanShowsNotFound', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/ajustes');
      page = harness.routeNativeElement as HTMLElement;

      expectApi('GET', 'restaurants/kafe').flush(
        { code: 'RESTAURANT_NOT_FOUND' },
        { status: 404, statusText: 'Not Found' },
      );
      expectApi('GET', 'me').flush(meWith());
      await settle();

      expect(alertText()).toContain('no existe');
      expect(page.querySelector('form.settings-form')).toBeNull();
    });
  });

  describe('código para incrustar y enlace público', () => {
    it('embedSnippetUsesEmbedParam', async () => {
      await open();

      const origin = document.location.origin;
      expect(snippetField().readOnly).toBe(true);
      expect(snippetField().value).toBe(
        `<iframe src="${origin}/r/kafe?embed=1" title="Reservas · Kafé del Puerto" width="100%" ` +
          'height="720" style="border:0" loading="lazy"></iframe>',
      );
      expect(snippetField().value).toContain('?embed=1');
    });

    it('embedSnippetEscapesThePlanNameAndStaysText', async () => {
      await open({ plan: { ...PLAN, name: 'Bar "El <b>Sol</b>" & Co' } });

      expect(snippetField().value).toContain(
        'title="Reservas · Bar &quot;El &lt;b&gt;Sol&lt;/b&gt;&quot; &amp; Co"',
      );
      expect(page.querySelector('iframe')).toBeNull();
    });

    it('copyPutsTheSnippetOnTheClipboard', async () => {
      const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      await open();

      await click('Copiar');

      expect(writeText).toHaveBeenCalledWith(snippetField().value);
      expect(page.querySelector('.copy-status')?.textContent).toContain('Copiado');
    });

    it('copyFallsBackToSelectingTheText', async () => {
      // jsdom no trae portapapeles: es el caso de un navegador que lo niega.
      await open();

      await click('Copiar');

      expect(page.querySelector('.copy-status')?.textContent).toContain('Copia el código a mano');
      expect(snippetField().selectionStart).toBe(0);
      expect(snippetField().selectionEnd).toBe(snippetField().value.length);
    });

    it('copyFallsBackWhenTheClipboardRejects', async () => {
      const writeText = vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('no'));
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      await open();

      await click('Copiar');

      expect(page.querySelector('.copy-status')?.textContent).toContain('Copia el código a mano');
    });

    it('publishedPlanLinksToThePublicPage', async () => {
      await open();

      const link = page.querySelector<HTMLAnchorElement>('a.public-link')!;
      expect(link.getAttribute('href')).toBe('/r/kafe');
      expect(link.target).toBe('_blank');
    });

    it('draftPlanAsksToPublishAndLinksToTheEditor', async () => {
      await open({ plan: { ...PLAN, status: 'DRAFT' } });

      expect(page.querySelector('a.public-link')).toBeNull();
      expect(page.textContent).toContain('Publica el plano para tener enlace público');
      expect(page.querySelector<HTMLAnchorElement>('a.editor-link')?.getAttribute('href')).toBe(
        '/panel/kafe/plano',
      );
    });
  });

  describe('Telegram', () => {
    it('telegramHiddenWhenUnavailable', async () => {
      await open({ me: meWith({ telegramAvailable: false }) });

      expect(telegramSection()).toBeNull();
      expect(page.textContent).not.toContain('Telegram');
      // Sin petición a /admin/telegram: `http.verify()` en afterEach.
    });

    it('telegramHiddenForTheDemoAccount', async () => {
      await open({ me: meWith({ telegramAvailable: true, demo: true }) });

      expect(telegramSection()).toBeNull();
    });

    it('telegramHiddenWhenTheStatusSaysItIsNotAvailable', async () => {
      await open({
        me: meWith({ telegramAvailable: true }),
        telegram: { available: false, linked: false, linkPending: false },
      });

      expect(telegramSection()).toBeNull();
    });

    it('linkOpensTheUrlInANewTabAndKeepsAVisibleLink', async () => {
      await open({
        me: meWith({ telegramAvailable: true }),
        telegram: { available: true, linked: false, linkPending: false },
      });
      expect(telegramSection()!.textContent).toContain('Sin vincular');

      await click('Vincular Telegram');
      const link = expectApi('POST', 'telegram/link');
      link.flush({ url: 'https://t.me/reservas_bot?start=abc123' });
      await settle();

      expect(openWindow).toHaveBeenCalledWith('https://t.me/reservas_bot?start=abc123');
      const anchor = telegramSection()!.querySelector<HTMLAnchorElement>('a.telegram-link')!;
      expect(anchor.getAttribute('href')).toBe('https://t.me/reservas_bot?start=abc123');
      expect(anchor.target).toBe('_blank');
      expect(anchor.textContent).toContain('Abrir Telegram');
    });

    it('linkRejectsAnUrlThatIsNotHttps', async () => {
      await open({
        me: meWith({ telegramAvailable: true }),
        telegram: { available: true, linked: false, linkPending: false },
      });

      await click('Vincular Telegram');
      expectApi('POST', 'telegram/link').flush({ url: 'javascript:alert(1)' });
      await settle();

      expect(openWindow).not.toHaveBeenCalled();
      expect(telegramSection()!.querySelector('a.telegram-link')).toBeNull();
      expect(alertText()).toContain('No se pudo vincular Telegram');
    });

    it('linkErrorsShowTheMessage', async () => {
      await open({
        me: meWith({ telegramAvailable: true }),
        telegram: { available: true, linked: false, linkPending: false },
      });

      await click('Vincular Telegram');
      expectApi('POST', 'telegram/link').flush(
        { code: 'TELEGRAM_UNAVAILABLE' },
        { status: 404, statusText: 'Not Found' },
      );
      await settle();

      expect(alertText()).toContain('Telegram no está disponible');
    });

    it('unlinkAsksForConfirmationThenReloadsTheStatus', async () => {
      await open({
        me: meWith({ telegramAvailable: true, telegramLinked: true }),
        telegram: { available: true, linked: true, linkPending: false },
      });
      expect(telegramSection()!.textContent).toContain('Vinculado');

      await click('Desvincular');
      expect(telegramSection()!.textContent).toContain('¿Desvincular Telegram?');
      await click('No desvincular');
      expect(telegramSection()!.textContent).not.toContain('¿Desvincular Telegram?');

      await click('Desvincular');
      await click('Sí, desvincular');
      expectApi('DELETE', 'telegram/link').flush(null, { status: 204, statusText: 'No Content' });
      await settle();
      expectApi('GET', 'telegram').flush({ available: true, linked: false, linkPending: false });
      await settle();

      expect(telegramSection()!.textContent).toContain('Sin vincular');
    });

    it('pendingLinkExplainsWhatToDo', async () => {
      await open({
        me: meWith({ telegramAvailable: true }),
        telegram: { available: true, linked: false, linkPending: true },
      });

      expect(telegramSection()!.textContent).toContain('Pulsa Start');
    });

    it('statusFailureShowsAMessageAndRetry', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/panel/kafe/ajustes');
      page = harness.routeNativeElement as HTMLElement;
      expectApi('GET', 'restaurants/kafe').flush(PLAN);
      expectApi('GET', 'me').flush(meWith({ telegramAvailable: true }));
      await settle();

      expectApi('GET', 'telegram').flush({}, { status: 500, statusText: 'Server Error' });
      await settle();
      expect(telegramSection()!.textContent).toContain('No se pudo leer el estado de Telegram');

      await click('Reintentar');
      expectApi('GET', 'telegram').flush({ available: true, linked: false, linkPending: false });
      await settle();

      expect(telegramSection()!.textContent).toContain('Sin vincular');
    });
  });

  describe('borrar el plano', () => {
    async function openDeleteForm(): Promise<void> {
      await open();
    }

    it('deleteNeedsTheSlugTypedToEnableTheButton', async () => {
      await openDeleteForm();

      expect(button('Borrar el plano')!.disabled).toBe(true);
      type('confirmSlug', 'kaf');
      expect(button('Borrar el plano')!.disabled).toBe(true);
      type('confirmSlug', 'kafe');
      expect(button('Borrar el plano')!.disabled).toBe(false);
      type('confirmSlug', ' kafe');
      expect(button('Borrar el plano')!.disabled).toBe(true);
    });

    it('deletePlanRefreshesTheOwnerDataAndGoesToThePanel', async () => {
      await openDeleteForm();

      type('confirmSlug', 'kafe');
      await click('Borrar el plano');
      expectApi('DELETE', 'restaurants/kafe').flush(null, {
        status: 204,
        statusText: 'No Content',
      });
      await settle();
      expectApi('GET', 'me').flush(meWith({ plans: [] }));
      await settle();

      expect(TestBed.inject(Router).url).toBe('/panel');
      expect(TestBed.inject(MeStore).plans()).toEqual([]);
    });

    it('deletePlanDoesNotLeaveAnotherPlanTheOwnerMovedTo', async () => {
      await openDeleteForm();

      type('confirmSlug', 'kafe');
      await click('Borrar el plano');
      const deletion = expectApi('DELETE', 'restaurants/kafe');
      // Mientras el borrado está en vuelo, el dueño cambia de plano desde la cabecera.
      await harness.navigateByUrl('/panel/otro/ajustes');
      expectApi('GET', 'restaurants/otro').flush({ slug: 'otro', name: 'Otro local' });
      await settle();
      deletion.flush(null, { status: 204, statusText: 'No Content' });
      await settle();
      // Se actualizan los datos del dueño, pero no se le saca del plano en el que está.
      expectApi('GET', 'me').flush(
        meWith({ plans: [{ slug: 'otro', name: 'Otro local', status: 'DRAFT' }] }),
      );
      await settle();

      expect(TestBed.inject(Router).url).toBe('/panel/otro/ajustes');
      expect(field('name').value).toBe('Otro local');
      expect(
        TestBed.inject(MeStore)
          .plans()
          .map((plan) => plan.slug),
      ).toEqual(['otro']);
    });

    it('deletePlanConflictShowsCodes', async () => {
      await openDeleteForm();

      type('confirmSlug', 'kafe');
      await click('Borrar el plano');
      expectApi('DELETE', 'restaurants/kafe').flush(
        problem({
          code: 'PLAN_HAS_RESERVATIONS',
          reservations: ['KAFE23456789ABCD', 'KAFEZZZZ99998888'],
        }),
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      expect(alertText()).toContain('reservas activas');
      expect(alertText()).toContain('KAFE23456789ABCD');
      expect(alertText()).toContain('KAFEZZZZ99998888');
      expect(TestBed.inject(Router).url).toBe('/panel/kafe/ajustes');
      // Tras cancelar las reservas hay que volver a escribir el enlace.
      expect(field('confirmSlug').value).toBe('');
      expect(button('Borrar el plano')!.disabled).toBe(true);
    });

    it('deletePlanShowsOtherErrors', async () => {
      await openDeleteForm();

      type('confirmSlug', 'kafe');
      await click('Borrar el plano');
      expectApi('DELETE', 'restaurants/kafe').flush(problem({ code: 'RATE_LIMITED' }), {
        status: 429,
        statusText: 'Too Many Requests',
      });
      await settle();

      expect(alertText()).toContain('Demasiadas acciones seguidas, espera un momento');
    });

    it('demoAccountSeesTheReadOnlyMessageInsteadOfTheDeleteForm', async () => {
      await open({ me: meWith({ demo: true }) });

      expect(page.querySelector('input[name="confirmSlug"]')).toBeNull();
      expect(button('Borrar el plano')).toBeUndefined();
      expect(page.textContent).toContain('La cuenta de demostración es de solo lectura.');
    });

    it('demoRejectionFromTheServerIsShownAsTheSameMessage', async () => {
      await openDeleteForm();

      type('confirmSlug', 'kafe');
      await click('Borrar el plano');
      expectApi('DELETE', 'restaurants/kafe').flush(problem({ code: 'DEMO_READ_ONLY' }), {
        status: 403,
        statusText: 'Forbidden',
      });
      await settle();

      expect(alertText()).toContain('La cuenta de demostración es de solo lectura.');
    });
  });

  it('changingPlanReloadsTheSettingsAndClearsTheTypedSlug', async () => {
    await open();
    type('confirmSlug', 'kafe');
    type('name', 'Nombre a medias');

    await harness.navigateByUrl('/panel/otro/ajustes');
    expectApi('GET', 'restaurants/otro').flush({
      slug: 'otro',
      name: 'Otro local',
      status: 'DRAFT',
      theme: 'AZUL',
      bookingMode: 'ASSIGNED',
      cancellationDeadlineHours: 0,
    });
    await settle();

    expect(field('name').value).toBe('Otro local');
    expect(field('cancellationDeadlineHours').value).toBe('0');
    expect(field('confirmSlug').value).toBe('');
    expect(
      page.querySelector<HTMLInputElement>('input[name="bookingMode"][value="ASSIGNED"]')!.checked,
    ).toBe(true);
  });
});
