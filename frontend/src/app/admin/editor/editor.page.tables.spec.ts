import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ApiConfiguration } from '../../core/api/api-configuration';
import { PlanResponse } from '../../core/api/models/plan-response';
import { PlanoComponent } from '../../plano/plano.component';
import { EditorPage } from './editor.page';
import { leaveEditorGuard } from './leave-editor.guard';

const PLAN: PlanResponse = {
  slug: 'kafe',
  name: 'Kafé del Puerto',
  status: 'DRAFT',
  theme: 'AZUL',
  bookingMode: 'FREE_CHOICE',
  cancellationDeadlineHours: 2,
  room: { shape: 'RECTANGLE', width: 2000, height: 1200, cutWidth: 0, cutDepth: 0, rotation: 0 },
  tables: [
    { id: 5, label: '1', shape: 'SQUARE', seats: 4, rotation: 0, x: 200, y: 450 },
    { id: 6, label: '2', shape: 'ROUND', seats: 4, rotation: 0, x: 600, y: 450 },
  ],
};

const OTHER: PlanResponse = { ...PLAN, slug: 'otro', name: 'Otro' };

describe('EditorPage: mesas, tema y guardado', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          {
            path: 'panel/:slug/plano',
            component: EditorPage,
            canDeactivate: [leaveEditorGuard],
          },
        ]),
      ],
    });
    TestBed.inject(ApiConfiguration).rootUrl = '';
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  /**
   * Deja correr las promesas pendientes y pinta. No usa `whenStable`: con una petición o una navegación a medias
   * (esperando al diálogo) la aplicación no está estable y se quedaría esperando.
   */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    harness.detectChanges();
  }

  const tick = settle;

  function expectPlan(slug: string): TestRequest {
    return http.expectOne(
      (request) =>
        request.method === 'GET' && request.url.endsWith(`/api/v1/admin/restaurants/${slug}`),
    );
  }

  function expectPut(): TestRequest {
    return http.expectOne(
      (request) => request.method === 'PUT' && request.url.endsWith('/restaurants/kafe/layout'),
    );
  }

  async function open(plan: PlanResponse = PLAN): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/panel/${plan.slug}/plano`);
    expectPlan(plan.slug as string).flush(plan);
    await settle();
    page = harness.routeNativeElement as HTMLElement;
  }

  function button(name: string): HTMLButtonElement {
    const found = Array.from(page.querySelectorAll('button')).find(
      (candidate) =>
        candidate.textContent?.trim() === name || candidate.getAttribute('aria-label') === name,
    );
    if (!found) {
      throw new Error(`Sin botón "${name}"`);
    }
    return found;
  }

  async function click(name: string): Promise<void> {
    button(name).click();
    await settle();
  }

  function tableGroups(): SVGGElement[] {
    return Array.from(page.querySelectorAll<SVGGElement>('app-plano g.t'));
  }

  function tableGroup(id: number): SVGGElement {
    const found = page.querySelector<SVGGElement>(`app-plano g.t[data-table-id="${id}"]`);
    if (!found) {
      throw new Error(`Sin mesa ${id}`);
    }
    return found;
  }

  function planoTables() {
    return harness.fixture.debugElement.query((el) => el.name === 'app-plano').componentInstance
      .tables as PlanoComponent['tables'];
  }

  function tableData(id: number) {
    const found = planoTables()().find((table) => table.id === id);
    if (!found) {
      throw new Error(`Sin datos de la mesa ${id}`);
    }
    return found;
  }

  function nameInput(): HTMLInputElement {
    return page.querySelector('input[aria-label="Nombre de la mesa"]') as HTMLInputElement;
  }

  async function type(input: HTMLInputElement, value: string): Promise<void> {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  async function key(target: Element, name: string, init: KeyboardEventInit = {}): Promise<void> {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }),
    );
    await settle();
  }

  function pointer(type: string, target: Element, x: number, y: number): void {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, button: 0, clientX: x, clientY: y });
    target.dispatchEvent(event);
  }

  /** `getScreenCTM` de la capa de tiradores (comparte viewBox con el plano): `zoom` píxeles por unidad de plano. */
  function stubScreenMatrix(zoom = 1): (next: number) => void {
    const overlay = page.querySelector('svg.handles') as SVGSVGElement;
    let current = zoom;
    Object.assign(overlay, {
      getScreenCTM: () => ({
        a: current,
        b: 0,
        c: 0,
        d: current,
        e: 70,
        f: 30,
        inverse: () => ({
          a: 1 / current,
          b: 0,
          c: 0,
          d: 1 / current,
          e: -70 / current,
          f: -30 / current,
        }),
      }),
    });
    return (next) => {
      current = next;
    };
  }

  function dialog(): HTMLElement | null {
    return page.querySelector('[role="alertdialog"]');
  }

  describe('paleta', () => {
    it('añade una mesa de cada tipo y la deja seleccionada', async () => {
      await open();
      expect(tableGroups().length).toBe(2);
      const types = [
        ['cuadrada', 2],
        ['cuadrada', 4],
        ['cuadrada', 6],
        ['cuadrada', 8],
        ['redonda', 2],
        ['redonda', 4],
        ['redonda', 6],
        ['redonda', 8],
      ] as const;
      for (const [shape, seats] of types) {
        await click(`Añadir mesa ${shape} de ${seats} plazas`);
      }
      expect(tableGroups().length).toBe(10);
      const added = planoTables()().slice(2);
      expect(added.map((table) => [table.shape, table.seats])).toEqual(
        types.map(([shape, seats]) => [shape === 'cuadrada' ? 'SQUARE' : 'ROUND', seats]),
      );
      expect(added.map((table) => table.label)).toEqual(['3', '4', '5', '6', '7', '8', '9', '10']);
      expect(page.querySelector('app-plano .t.invalid')).toBeNull();
      // La última queda seleccionada y su panel enseña su nombre.
      expect(nameInput().value).toBe('10');
      expect(tableGroups().at(-1)?.getAttribute('class')).toContain('selected');
      http.expectNone(() => true);
    });

    it('avisa si no cabe otra mesa', async () => {
      await open({
        ...PLAN,
        room: { ...PLAN.room!, width: 400, height: 400 },
        tables: [{ id: 5, label: '1', shape: 'ROUND', seats: 8, rotation: 0, x: 200, y: 200 }],
      });
      await click('Añadir mesa redonda de 8 plazas');
      expect(tableGroups().length).toBe(1);
      expect(page.querySelector('.info')?.textContent).toContain('No cabe');
    });
  });

  describe('selección y panel', () => {
    it('clic en una mesa la selecciona y enseña su panel; Enter también', async () => {
      await open();
      expect(page.querySelector('.table-panel')).toBeNull();
      tableGroup(5).dispatchEvent(new Event('click', { bubbles: true }));
      await settle();
      expect(tableGroup(5).getAttribute('class')).toContain('selected');
      expect(nameInput().value).toBe('1');
      expect((page.querySelector('select[aria-label="Plazas"]') as HTMLSelectElement).value).toBe(
        '4',
      );
      await key(tableGroup(6), 'Enter');
      expect(nameInput().value).toBe('2');
      expect(tableGroup(5).getAttribute('class')).not.toContain('selected');
    });

    it('el panel cambia nombre, plazas, forma y giro de la mesa', async () => {
      await open();
      await key(tableGroup(5), 'Enter');
      await type(nameInput(), 'Barra');
      expect(tableData(5).label).toBe('Barra');
      expect(nameInput().maxLength).toBe(40);

      const seats = page.querySelector('select[aria-label="Plazas"]') as HTMLSelectElement;
      expect(Array.from(seats.options).map((option) => option.value)).toEqual(['2', '4', '6', '8']);
      seats.value = '6';
      seats.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
      expect(tableData(5).seats).toBe(6);

      await click('Mesa redonda');
      expect(tableData(5).shape).toBe('ROUND');
      expect(button('Mesa redonda').getAttribute('aria-pressed')).toBe('true');
      await click('Mesa cuadrada');
      expect(tableData(5).shape).toBe('SQUARE');

      await click('Girar mesa');
      expect(tableData(5).rotation).toBe(90);
      await click('Girar mesa');
      expect(tableData(5).rotation).toBe(0);
    });

    it('borrar una mesa nueva la quita sin preguntar', async () => {
      await open();
      await click('Añadir mesa cuadrada de 2 plazas');
      expect(tableGroups().length).toBe(3);
      await click('Borrar mesa');
      expect(dialog()).toBeNull();
      expect(tableGroups().length).toBe(2);
      expect(page.querySelector('.table-panel')).toBeNull();
    });

    it('borrar una mesa del servidor pide confirmación en la página', async () => {
      await open();
      await key(tableGroup(5), 'Enter');
      await click('Borrar mesa');
      expect(dialog()?.textContent).toContain('Mesa 1');
      expect(tableGroups().length).toBe(2);
      await click('Cancelar');
      expect(dialog()).toBeNull();
      expect(tableGroups().length).toBe(2);
      await click('Borrar mesa');
      await click('Sí, borrar');
      expect(tableGroups().map((group) => group.getAttribute('data-table-id'))).toEqual(['6']);
    });
  });

  describe('arrastre de mesas', () => {
    it('arrastrar una mesa la mueve a la cuadrícula de 10, la selecciona y no llama a la API', async () => {
      await open();
      stubScreenMatrix();
      const table = tableGroup(5);
      pointer('pointerdown', table, 270, 480);
      pointer('pointermove', table, 270 + 43, 480 - 27);
      await settle();
      expect(tableData(5)).toMatchObject({ x: 240, y: 420 });
      expect(tableGroup(5).getAttribute('class')).toContain('selected');
      pointer('pointermove', table, 270 + 1, 480);
      await settle();
      expect(tableData(5)).toMatchObject({ x: 200, y: 450 });
      pointer('pointermove', table, 270 + 100, 480);
      pointer('pointerup', table, 270 + 100, 480);
      await settle();
      expect(tableData(5)).toMatchObject({ x: 300, y: 450 });
      // Soltado: moverse ya no arrastra.
      pointer('pointermove', table, 0, 0);
      await settle();
      expect(tableData(5)).toMatchObject({ x: 300, y: 450 });
      http.expectNone(() => true);
    });

    it('la escala del arrastre se fija al empezar', async () => {
      await open();
      const setZoom = stubScreenMatrix(2);
      const table = tableGroup(5);
      pointer('pointerdown', table, 400, 900);
      setZoom(0.1);
      pointer('pointermove', table, 440, 900);
      await settle();
      // 40 píxeles con 2 píxeles por unidad: 20 unidades.
      expect(tableData(5)).toMatchObject({ x: 220, y: 450 });
      pointer('pointerup', table, 440, 900);
    });

    it('perder la captura del puntero termina el arrastre', async () => {
      await open();
      stubScreenMatrix();
      const table = tableGroup(5);
      pointer('pointerdown', table, 0, 0);
      pointer('lostpointercapture', table, 0, 0);
      pointer('pointermove', table, 50, 0);
      await settle();
      expect(tableData(5)).toMatchObject({ x: 200, y: 450 });
    });

    it('un arrastre con otro botón del ratón no mueve nada', async () => {
      await open();
      stubScreenMatrix();
      const table = tableGroup(5);
      const down = new Event('pointerdown', { bubbles: true, cancelable: true });
      Object.assign(down, { pointerId: 1, button: 2, clientX: 0, clientY: 0 });
      table.dispatchEvent(down);
      pointer('pointermove', table, 50, 0);
      await settle();
      expect(tableData(5)).toMatchObject({ x: 200, y: 450 });
    });
  });

  describe('teclado', () => {
    it('las flechas mueven la mesa enfocada de 10 en 10', async () => {
      await open();
      const table = tableGroup(5);
      await key(table, 'ArrowRight');
      await key(table, 'ArrowRight');
      await key(table, 'ArrowDown');
      await key(table, 'ArrowLeft');
      await key(table, 'ArrowUp');
      expect(tableData(5)).toMatchObject({ x: 210, y: 450 });
      expect(tableGroup(5).getAttribute('class')).toContain('selected');
    });

    it('las flechas con Alt, Ctrl o Meta no mueven la mesa', async () => {
      await open();
      const table = tableGroup(5);
      await key(table, 'ArrowRight', { altKey: true });
      await key(table, 'ArrowRight', { ctrlKey: true });
      await key(table, 'ArrowRight', { metaKey: true });
      expect(tableData(5)).toMatchObject({ x: 200, y: 450 });
    });

    it('Supr borra una mesa nueva y pide confirmación para una del servidor', async () => {
      await open();
      await click('Añadir mesa cuadrada de 2 plazas');
      const added = tableGroups().at(-1) as SVGGElement;
      await key(added, 'Delete');
      expect(tableGroups().length).toBe(2);
      expect(dialog()).toBeNull();

      await key(tableGroup(5), 'Delete');
      expect(dialog()).not.toBeNull();
      expect(tableGroups().length).toBe(2);
      await click('Sí, borrar');
      expect(tableGroups().length).toBe(1);
    });

    it('Supr y las flechas dentro del nombre no tocan la mesa', async () => {
      await open();
      await key(tableGroup(5), 'Enter');
      const input = nameInput();
      await key(input, 'Delete');
      await key(input, 'ArrowRight');
      expect(dialog()).toBeNull();
      expect(tableGroups().length).toBe(2);
      expect(tableData(5)).toMatchObject({ x: 200, y: 450 });
    });

    it('Escape quita la selección', async () => {
      await open();
      await key(tableGroup(5), 'Enter');
      expect(page.querySelector('.table-panel')).not.toBeNull();
      await key(tableGroup(5), 'Escape');
      expect(page.querySelector('.table-panel')).toBeNull();
    });
  });

  describe('problemas y guardado', () => {
    it('overlapDisablesSave: una mesa solapada sale en rojo y no se puede guardar', async () => {
      await open();
      expect(button('Guardar').disabled).toBe(true);
      const table = tableGroup(5);
      for (let step = 0; step < 40; step++) {
        await key(table, 'ArrowRight');
      }
      expect(tableData(5).x).toBe(600);
      expect(tableGroup(5).getAttribute('class')).toContain('invalid');
      expect(tableGroup(6).getAttribute('class')).toContain('invalid');
      expect(button('Guardar').disabled).toBe(true);
      expect(page.querySelector('.problems')?.textContent).toContain('se solapa');
      for (let step = 0; step < 30; step++) {
        await key(table, 'ArrowLeft');
      }
      expect(tableData(5).x).toBe(300);
      expect(page.querySelector('app-plano .t.invalid')).toBeNull();
      expect(button('Guardar').disabled).toBe(false);
    });

    it('guardar envía el plano, recarga los ids y desactiva Guardar', async () => {
      await open();
      await click('Añadir mesa redonda de 2 plazas');
      expect(button('Guardar').disabled).toBe(false);
      button('Guardar').click();
      await settle();
      expect(button('Guardar').disabled).toBe(true);
      const put = expectPut();
      expect(put.request.body.tables.length).toBe(3);
      put.flush({
        ...PLAN,
        tables: [
          ...PLAN.tables!,
          { id: 40, label: '3', shape: 'ROUND', seats: 2, rotation: 0, x: 90, y: 60 },
        ],
      });
      await tick();
      expect(page.querySelector('.info')?.textContent).toContain('guardado');
      expect(tableGroups().map((group) => group.getAttribute('data-table-id'))).toEqual([
        '5',
        '6',
        '40',
      ]);
      // La mesa seleccionada sigue seleccionada con su id real.
      expect(nameInput().value).toBe('3');
      expect(button('Guardar').disabled).toBe(true);
    });

    it('serverProblemsMarkTables: el 422 marca las mesas del servidor en rojo', async () => {
      await open();
      await click('Añadir mesa redonda de 2 plazas');
      button('Guardar').click();
      await settle();
      expectPut().flush(
        {
          code: 'LAYOUT_INVALID',
          problems: [{ tableIndex: 1, label: '2', code: 'OVERLAP' }],
        },
        { status: 422, statusText: 'Unprocessable' },
      );
      await tick();
      expect(tableGroup(6).getAttribute('class')).toContain('invalid');
      expect(page.querySelector('.error')?.textContent).toContain('rojo');
      // Marcas del servidor no desactivan Guardar.
      expect(button('Guardar').disabled).toBe(false);
    });

    it('conflictShowsReservationCodes: el 409 lista los códigos de las reservas', async () => {
      await open();
      await key(tableGroup(5), 'Delete');
      await click('Sí, borrar');
      button('Guardar').click();
      await settle();
      expectPut().flush(
        { code: 'TABLE_HAS_RESERVATIONS', reservations: ['KAFE1234', 'KAFE5678'] },
        { status: 409, statusText: 'Conflict' },
      );
      await tick();
      expect(page.querySelector('.error')?.textContent).toContain('reservas activas');
      expect(
        Array.from(page.querySelectorAll('.codes li')).map((li) => li.textContent?.trim()),
      ).toEqual(['KAFE1234', 'KAFE5678']);
    });

    it('el 429 muestra la espera', async () => {
      await open();
      await key(tableGroup(5), 'ArrowRight');
      button('Guardar').click();
      await settle();
      expectPut().flush(
        { code: 'RATE_LIMITED' },
        { status: 429, statusText: 'Too Many', headers: { 'Retry-After': '15' } },
      );
      await tick();
      expect(page.querySelector('.error')?.textContent).toContain('15 segundos');
    });
  });

  describe('tema', () => {
    it('themeChangeIsSavedWithPatch: elegir tema lo aplica al plano y se guarda con PUT y PATCH', async () => {
      await open();
      expect(button('Azul').getAttribute('aria-pressed')).toBe('true');
      await click('Noche');
      expect(button('Noche').getAttribute('aria-pressed')).toBe('true');
      const plano = harness.fixture.debugElement.query((el) => el.name === 'app-plano')
        .componentInstance as PlanoComponent;
      expect(plano.theme()).toBe('NOCHE');
      button('Guardar').click();
      await settle();
      expectPut().flush(PLAN);
      await tick();
      const patch = http.expectOne(
        (request) => request.method === 'PATCH' && request.url.endsWith('/restaurants/kafe'),
      );
      expect(patch.request.body).toEqual({
        name: 'Kafé del Puerto',
        theme: 'NOCHE',
        bookingMode: 'FREE_CHOICE',
        cancellationDeadlineHours: 2,
      });
      patch.flush({ ...PLAN, theme: 'NOCHE' });
      await tick();
      expect(button('Guardar').disabled).toBe(true);
    });
  });

  describe('publicar', () => {
    it('Publicar está desactivado con cambios sin guardar y publica un plano guardado', async () => {
      await open();
      expect(button('Publicar').disabled).toBe(false);
      await key(tableGroup(5), 'ArrowRight');
      expect(button('Publicar').disabled).toBe(true);
      button('Guardar').click();
      await settle();
      expectPut().flush(PLAN);
      await tick();
      expect(button('Publicar').disabled).toBe(false);
      expect(page.querySelector('.published')).toBeNull();

      button('Publicar').click();
      await settle();
      const publish = http.expectOne(
        (request) => request.method === 'POST' && request.url.endsWith('/restaurants/kafe/publish'),
      );
      publish.flush({ ...PLAN, status: 'PUBLISHED' });
      await tick();
      const link = page.querySelector(
        '.published input[aria-label="Enlace público"]',
      ) as HTMLInputElement;
      expect(link.value.endsWith('/r/kafe')).toBe(true);
      const embed = page.querySelector(
        '.published textarea[aria-label="Código para incrustar"]',
      ) as HTMLTextAreaElement;
      expect(embed.value).toContain(`${link.value}?embed=1`);
      expect(embed.value).toContain('<iframe');
      expect(embed.value).not.toContain('Kafé');
    });

    it('un plano publicado enseña su enlace y no ofrece publicar otra vez', async () => {
      await open({ ...PLAN, status: 'PUBLISHED' });
      expect(page.querySelector('.published')).not.toBeNull();
      expect(
        Array.from(page.querySelectorAll('button')).some(
          (b) => b.textContent?.trim() === 'Publicar',
        ),
      ).toBe(false);
    });

    it('un cambio de forma guardado devuelve el plano a borrador y oculta el enlace', async () => {
      await open({ ...PLAN, status: 'PUBLISHED' });
      await click('Girar 90°');
      button('Guardar').click();
      await settle();
      expectPut().flush({
        ...PLAN,
        status: 'DRAFT',
        room: { ...PLAN.room!, rotation: 90 },
        tables: [
          { id: 5, label: '1', shape: 'SQUARE', seats: 4, rotation: 90, x: 750, y: 200 },
          { id: 6, label: '2', shape: 'ROUND', seats: 4, rotation: 90, x: 750, y: 600 },
        ],
      });
      await tick();
      expect(page.querySelector('.published')).toBeNull();
      expect(page.querySelector('.info')?.textContent).toContain('borrador');
    });

    it('el 422 de publicar enseña el motivo', async () => {
      await open({ ...PLAN, tables: [PLAN.tables![0]] });
      button('Publicar').click();
      await settle();
      http
        .expectOne((request) => request.url.endsWith('/restaurants/kafe/publish'))
        .flush({ code: 'PLAN_NOT_PUBLISHABLE' }, { status: 422, statusText: 'Unprocessable' });
      await tick();
      expect(page.querySelector('.error')?.textContent).toContain('al menos una mesa');
    });
  });

  describe('cambios sin guardar', () => {
    it('sin cambios se navega sin preguntar', async () => {
      await open();
      expect(await TestBed.inject(Router).navigateByUrl('/panel/otro/plano')).toBe(true);
      expect(dialog()).toBeNull();
      expectPlan('otro').flush(OTHER);
    });

    it('con cambios pregunta en la página; Seguir editando cancela y Salir sin guardar navega', async () => {
      await open();
      await key(tableGroup(5), 'ArrowRight');
      const router = TestBed.inject(Router);

      const cancelled = router.navigateByUrl('/panel/otro/plano');
      await settle();
      expect(dialog()?.textContent).toContain('cambios sin guardar');
      await click('Seguir editando');
      expect(await cancelled).toBe(false);
      expect(dialog()).toBeNull();
      expect(router.url).toBe('/panel/kafe/plano');
      expect(tableData(5)).toMatchObject({ x: 210 });
      http.expectNone(() => true);

      const confirmed = router.navigateByUrl('/panel/otro/plano');
      await settle();
      await click('Salir sin guardar');
      await settle();
      expectPlan('otro').flush(OTHER);
      expect(await confirmed).toBe(true);
      await settle();
      expect(page.querySelector('h1')?.textContent).toContain('Otro');
      expect(dialog()).toBeNull();
      expect(button('Guardar').disabled).toBe(true);
    });

    it('beforeunload avisa solo mientras haya cambios', async () => {
      await open();
      const clean = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(clean);
      expect(clean.defaultPrevented).toBe(false);
      await key(tableGroup(5), 'ArrowRight');
      const dirty = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(dirty);
      expect(dirty.defaultPrevented).toBe(true);
    });
  });
});
