import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ApiConfiguration } from '../../core/api/api-configuration';
import { PlanResponse } from '../../core/api/models/plan-response';
import { EditorPage } from './editor.page';

const PLAN: PlanResponse = {
  slug: 'kafe',
  name: 'Kafé del Puerto',
  status: 'DRAFT',
  theme: 'AZUL',
  room: { shape: 'RECTANGLE', width: 1200, height: 560, cutWidth: 0, cutDepth: 0, rotation: 0 },
  tables: [{ id: 5, label: '1', shape: 'SQUARE', seats: 4, rotation: 0, x: 200, y: 450 }],
};

const L_PLAN: PlanResponse = {
  ...PLAN,
  slug: 'otro',
  name: 'Otro',
  status: 'PUBLISHED',
  room: { shape: 'L', width: 1000, height: 900, cutWidth: 480, cutDepth: 480, rotation: 0 },
};

describe('EditorPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'panel/:slug/plano', component: EditorPage }]),
      ],
    });
    TestBed.inject(ApiConfiguration).rootUrl = '';
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  async function settle(): Promise<void> {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  function expectPlan(slug: string): TestRequest {
    return http.expectOne(
      (request) =>
        request.method === 'GET' && request.url.endsWith(`/api/v1/admin/restaurants/${slug}`),
    );
  }

  async function open(plan: PlanResponse = PLAN): Promise<void> {
    harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl(`/panel/${plan.slug}/plano`);
    await navigation;
    expectPlan(plan.slug as string).flush(plan);
    await settle();
    page = harness.routeNativeElement as HTMLElement;
  }

  function slider(label: string): SVGGElement {
    const found = page.querySelector<SVGGElement>(`[role="slider"][aria-label="${label}"]`);
    if (!found) {
      throw new Error(`Sin tirador "${label}"`);
    }
    return found;
  }

  function pressed(name: string): boolean {
    const button = Array.from(page.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === name,
    );
    return button?.getAttribute('aria-pressed') === 'true';
  }

  async function click(name: string): Promise<void> {
    const button = Array.from(page.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === name,
    );
    button?.click();
    await settle();
  }

  async function press(label: string, key: string): Promise<void> {
    slider(label).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
    await settle();
  }

  /** jsdom no tiene `PointerEvent` completo: basta un evento con los campos que lee la página. */
  function pointer(type: string, target: Element, x: number, y: number): void {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, button: 0, clientX: x, clientY: y });
    target.dispatchEvent(event);
  }

  /**
   * `getScreenCTM` del SVG de tiradores: `zoom` píxeles por unidad de plano (1 = un píxel es una unidad) y un
   * desplazamiento fijo. Devuelve la función que cambia el zoom, como hace el navegador al cambiar el viewBox.
   */
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

  it('muestra el plano y sus tiradores de ancho y alto', async () => {
    await open();
    expect(page.querySelector('h1')?.textContent).toContain('Kafé del Puerto');
    expect(page.querySelector('app-plano')).not.toBeNull();
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('1200');
    expect(slider('Ancho del local').getAttribute('aria-valuemin')).toBe('400');
    expect(slider('Ancho del local').getAttribute('aria-valuemax')).toBe('2000');
    expect(slider('Alto del local').getAttribute('aria-valuenow')).toBe('560');
    expect(pressed('Alargada')).toBe(true);
  });

  it('la capa de tiradores usa el mismo viewBox que el plano', async () => {
    await open();
    const planoBox = page.querySelector('app-plano svg')?.getAttribute('viewBox');
    expect(planoBox).toBeTruthy();
    expect(page.querySelector('svg.handles')?.getAttribute('viewBox')).toBe(planoBox);
    await click('Girar 90°');
    expect(page.querySelector('svg.handles')?.getAttribute('viewBox')).toBe(
      page.querySelector('app-plano svg')?.getAttribute('viewBox'),
    );
  });

  it('un plano que no existe o es de otro dueño muestra el aviso y el enlace al panel', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/ajeno/plano');
    expectPlan('ajeno').flush(
      { code: 'RESTAURANT_NOT_FOUND' },
      { status: 404, statusText: 'Not Found' },
    );
    await settle();
    page = harness.routeNativeElement as HTMLElement;
    expect(page.textContent).toContain('Este plano no existe');
    expect(page.querySelector('a')?.getAttribute('href')).toBe('/panel');
    expect(page.querySelector('[role="slider"]')).toBeNull();
  });

  it('un fallo de red ofrece reintentar', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/panel/kafe/plano');
    expectPlan('kafe').flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
    page = harness.routeNativeElement as HTMLElement;
    expect(page.textContent).toContain('No se pudo cargar el plano');
    await click('Reintentar');
    expectPlan('kafe').flush(PLAN);
    await settle();
    expect(slider('Ancho del local')).toBeTruthy();
  });

  it('las flechas mueven el tirador de 20 en 20 sin llamar a la API', async () => {
    await open();
    await press('Ancho del local', 'ArrowRight');
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('1220');
    await press('Ancho del local', 'ArrowUp');
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('1240');
    await press('Ancho del local', 'ArrowLeft');
    await press('Ancho del local', 'ArrowDown');
    await press('Ancho del local', 'ArrowDown');
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('1180');
    await press('Alto del local', 'ArrowRight');
    expect(slider('Alto del local').getAttribute('aria-valuenow')).toBe('580');
    // Otras teclas no hacen nada.
    await press('Alto del local', 'a');
    expect(slider('Alto del local').getAttribute('aria-valuenow')).toBe('580');
  });

  it('las flechas respetan el límite del rango', async () => {
    await open();
    const max = slider('Ancho del local');
    for (let i = 0; i < 60; i++) {
      max.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    }
    await settle();
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('2000');
  });

  it('cambiar de forma pone los tiradores del hueco', async () => {
    await open();
    expect(page.querySelector('[aria-label="Ancho del hueco"]')).toBeNull();
    await click('En L');
    expect(pressed('En L')).toBe(true);
    expect(pressed('Alargada')).toBe(false);
    expect(slider('Ancho del hueco').getAttribute('aria-valuenow')).toBe('480');
    expect(slider('Fondo del hueco').getAttribute('aria-valuenow')).toBe('480');
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('1000');
  });

  it('Girar 90° cambia el giro del local y de sus mesas', async () => {
    await open();
    const turn = () => harness.fixture.debugElement.query((el) => el.name === 'app-plano');
    const before = turn().componentInstance;
    await click('Girar 90°');
    expect(before.room().rotation).toBe(90);
    expect(before.tables()[0]).toMatchObject({ x: 110, y: 200, rotation: 90 });
  });

  it('arrastrar un tirador cambia el local desde donde empezó, redondeando a 20, sin llamar a la API', async () => {
    await open();
    stubScreenMatrix();
    const width = slider('Ancho del local');
    pointer('pointerdown', width, 1200, 280);
    pointer('pointermove', width, 1204, 280);
    await settle();
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('1200');
    pointer('pointermove', width, 1227, 280);
    await settle();
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('1220');
    pointer('pointermove', width, 1231, 290);
    await settle();
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('1240');
    pointer('pointerup', width, 1231, 290);
    pointer('pointermove', width, 1500, 290);
    await settle();
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('1240');
  });

  it('la escala del arrastre se fija al empezar aunque la matriz cambie durante él', async () => {
    await open();
    // 0,5 píxeles por unidad: 10 px = 20 unidades.
    const setZoom = stubScreenMatrix(0.5);
    const width = slider('Ancho del local');
    pointer('pointerdown', width, 300, 100);
    pointer('pointermove', width, 310, 100);
    await settle();
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('1220');
    // El viewBox crece con el ancho y el navegador cambia la escala: no debe notarse.
    setZoom(0.05);
    pointer('pointermove', width, 320, 100);
    await settle();
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('1240');
    setZoom(4);
    pointer('pointermove', width, 330, 100);
    await settle();
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('1260');
    pointer('pointermove', width, 304, 100);
    await settle();
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('1200');
  });

  it('con el local girado 90 o 270 el arrastre horizontal mueve el alto y el vertical el ancho', async () => {
    await open();
    await click('Girar 90°');
    const setZoom = stubScreenMatrix(0.5);
    const height = slider('Alto del local');
    pointer('pointerdown', height, 300, 100);
    pointer('pointermove', height, 310, 100);
    setZoom(0.1);
    pointer('pointermove', height, 320, 100);
    await settle();
    expect(slider('Alto del local').getAttribute('aria-valuenow')).toBe('600');
    pointer('pointerup', height, 320, 100);

    await click('Girar 90°');
    await click('Girar 90°');
    expect(page.querySelector('svg.handles')).not.toBeNull();
    const setZoom270 = stubScreenMatrix(0.5);
    const width = slider('Ancho del local');
    pointer('pointerdown', width, 300, 100);
    pointer('pointermove', width, 300, 110);
    setZoom270(0.1);
    pointer('pointermove', width, 300, 120);
    await settle();
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('1240');
    pointer('pointerup', width, 300, 120);
  });

  it('perder la captura del puntero termina el arrastre', async () => {
    await open();
    stubScreenMatrix();
    const width = slider('Ancho del local');
    pointer('pointerdown', width, 1200, 280);
    pointer('pointermove', width, 1220, 280);
    pointer('lostpointercapture', width, 1220, 280);
    pointer('pointermove', width, 1300, 280);
    await settle();
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('1220');
  });

  it('las flechas con Alt, Ctrl o Meta no mueven el tirador', async () => {
    await open();
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) {
      slider('Ancho del local').dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          bubbles: true,
          cancelable: true,
          [modifier]: true,
        }),
      );
    }
    await settle();
    expect(slider('Ancho del local').getAttribute('aria-valuenow')).toBe('1200');
  });

  it('los tiradores dicen su orientación y su valor con unidades', async () => {
    await open();
    expect(slider('Ancho del local').getAttribute('aria-orientation')).toBe('horizontal');
    expect(slider('Alto del local').getAttribute('aria-orientation')).toBe('vertical');
    expect(slider('Ancho del local').getAttribute('aria-valuetext')).toBe('1200 unidades');
    await click('Girar 90°');
    // Girado, el ancho del local se mueve en vertical.
    expect(slider('Ancho del local').getAttribute('aria-orientation')).toBe('vertical');
  });

  it('con el plano publicado, cambiar la forma avisa de las reservas activas', async () => {
    await open(L_PLAN);
    expect(page.querySelector('.notice')).toBeNull();
    await press('Ancho del hueco', 'ArrowRight');
    expect(page.querySelector('.notice')?.textContent).toContain('reservas activas');
  });

  it('un plano en borrador no muestra ese aviso', async () => {
    await open();
    await click('Girar 90°');
    expect(page.querySelector('.notice')).toBeNull();
  });

  it('avisa de las mesas que se salen del local con la nueva forma', async () => {
    await open();
    await click('En T');
    expect(page.querySelector('.notice')?.textContent).toContain('1');
  });

  it('al cambiar de plano en la misma página se carga el nuevo', async () => {
    await open();
    const navigation = harness.navigateByUrl('/panel/otro/plano');
    await navigation;
    expectPlan('otro').flush(L_PLAN);
    await settle();
    expect(page.querySelector('h1')?.textContent).toContain('Otro');
    expect(slider('Ancho del hueco')).toBeTruthy();
  });
});
