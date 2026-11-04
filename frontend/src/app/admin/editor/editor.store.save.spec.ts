import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiConfiguration } from '../../core/api/api-configuration';
import { PlanResponse } from '../../core/api/models/plan-response';
import { EditorStore } from './editor.store';

const PLAN: PlanResponse = {
  slug: 'kafe',
  name: 'Kafé del Puerto',
  status: 'DRAFT',
  theme: 'BOSQUE',
  bookingMode: 'ASSIGNED',
  cancellationDeadlineHours: 4,
  room: { shape: 'RECTANGLE', width: 1200, height: 560, cutWidth: 0, cutDepth: 0, rotation: 0 },
  tables: [
    { id: 7, label: '1', shape: 'SQUARE', seats: 4, rotation: 0, x: 200, y: 200 },
    { id: 9, label: '2', shape: 'ROUND', seats: 4, rotation: 0, x: 500, y: 200 },
  ],
};

const LAYOUT_URL = '/api/v1/admin/restaurants/kafe/layout';
const PLAN_URL = '/api/v1/admin/restaurants/kafe';

/** Deja correr las promesas pendientes (el guardado encadena PUT y PATCH con `await`). */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
}

describe('EditorStore: guardar y publicar', () => {
  let store: EditorStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), EditorStore],
    });
    TestBed.inject(ApiConfiguration).rootUrl = '';
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(EditorStore);
    store.load(PLAN);
  });

  afterEach(() => {
    http.verify();
  });

  function expectPut(): TestRequest {
    return http.expectOne((request) => request.method === 'PUT' && request.url === LAYOUT_URL);
  }

  function expectPatch(): TestRequest {
    return http.expectOne((request) => request.method === 'PATCH' && request.url === PLAN_URL);
  }

  function expectPublish(): TestRequest {
    return http.expectOne(
      (request) => request.method === 'POST' && request.url === `${PLAN_URL}/publish`,
    );
  }

  function error(
    request: TestRequest,
    status: number,
    body: object | null,
    headers: Record<string, string> = {},
  ): void {
    request.flush(body, { status, statusText: 'Error', headers });
  }

  it('overlapDisablesSave', async () => {
    store.moveTable(0, 500, 200);
    expect(store.dirty()).toBe(true);
    expect(store.problems().some((problem) => problem.code === 'OVERLAP')).toBe(true);
    expect(store.canSave()).toBe(false);
    expect([...store.invalidTableIds()].sort()).toEqual([7, 9]);
    expect(await store.save()).toBe(false);
    http.expectNone(LAYOUT_URL);

    store.moveTable(0, 200, 400);
    expect(store.invalidTableIds().size).toBe(0);
    expect(store.canSave()).toBe(true);
  });

  it('sin cambios no se puede guardar', () => {
    expect(store.dirty()).toBe(false);
    expect(store.canSave()).toBe(false);
  });

  it('save envía el id de las mesas del servidor, omite el de las nuevas y recarga el plano del servidor', async () => {
    store.addTable('ROUND', 2);
    store.renameTable(0, '  Barra  ');
    const done = store.save();
    expect(store.saving()).toBe(true);
    const put = expectPut();
    expect(put.request.body.tables.map((table: { id?: number }) => table.id)).toEqual([
      7,
      9,
      undefined,
    ]);
    expect(put.request.body.tables[0].label).toBe('Barra');
    expect('id' in put.request.body.tables[2]).toBe(false);
    put.flush({
      ...PLAN,
      tables: [
        { ...PLAN.tables![0], label: 'Barra' },
        PLAN.tables![1],
        { id: 31, label: '3', shape: 'ROUND', seats: 2, rotation: 0, x: 90, y: 60 },
      ],
    });
    expect(await done).toBe(true);

    expect(store.tables().map((table) => table.id)).toEqual([7, 9, 31]);
    expect(store.dirty()).toBe(false);
    expect(store.saving()).toBe(false);
    expect(store.saveError()).toBeNull();
    http.expectNone(PLAN_URL);
  });

  it('save no se envía dos veces a la vez ni deja editar mientras guarda', async () => {
    store.moveTable(0, 210, 200);
    const first = store.save();
    const second = store.save();
    expect(await second).toBe(false);
    const put = expectPut();
    // Mientras guarda, la edición no cambia lo que se va a recargar.
    store.moveTable(1, 600, 200);
    store.setTheme('NOCHE');
    expect(store.tables()[1].x).toBe(500);
    expect(store.theme()).toBe('BOSQUE');
    put.flush({ ...PLAN, tables: [{ ...PLAN.tables![0], x: 210 }, PLAN.tables![1]] });
    expect(await first).toBe(true);
    expect(store.tables()[0].x).toBe(210);
    store.moveTable(1, 600, 200);
    expect(store.tables()[1].x).toBe(600);
  });

  it('publishEnabledAfterSave', async () => {
    expect(store.canPublish()).toBe(true);
    store.moveTable(0, 210, 200);
    expect(store.canPublish()).toBe(false);
    const done = store.save();
    expectPut().flush({ ...PLAN, tables: [{ ...PLAN.tables![0], x: 210 }, PLAN.tables![1]] });
    await done;
    expect(store.canPublish()).toBe(true);

    const published = store.publish();
    expect(store.publishing()).toBe(true);
    const request = expectPublish();
    expect(request.request.body).toBeNull();
    request.flush({ ...PLAN, status: 'PUBLISHED' });
    expect(await published).toBe(true);
    expect(store.published()).toBe(true);
    expect(store.canPublish()).toBe(false);
  });

  it('un plano sin mesas no se puede publicar', () => {
    store.load({ ...PLAN, tables: [] });
    expect(store.canPublish()).toBe(false);
  });

  it('un plano publicado no se vuelve a publicar', () => {
    store.load({ ...PLAN, status: 'PUBLISHED' });
    expect(store.canPublish()).toBe(false);
  });

  it('un plano con problemas no se puede publicar', () => {
    store.load({
      ...PLAN,
      tables: [PLAN.tables![0], { ...PLAN.tables![1], x: 200, y: 200 }],
    });
    expect(store.dirty()).toBe(false);
    expect(store.problems().length).toBeGreaterThan(0);
    expect(store.canPublish()).toBe(false);
  });

  it('el 422 de publicar explica que hace falta una mesa que quepa', async () => {
    const done = store.publish();
    error(expectPublish(), 422, { code: 'PLAN_NOT_PUBLISHABLE' });
    expect(await done).toBe(false);
    expect(store.publishError()).toContain('al menos una mesa');
    expect(store.published()).toBe(false);
    expect(store.publishing()).toBe(false);
  });

  it('el 429 de publicar usa la espera de Retry-After', async () => {
    const done = store.publish();
    error(expectPublish(), 429, { code: 'RATE_LIMITED' }, { 'Retry-After': '12' });
    await done;
    expect(store.publishError()).toContain('12 segundos');
  });

  it('themeChangeIsSavedWithPatch: solo el tema no hace PUT, solo PATCH', async () => {
    store.setTheme('NOCHE');
    expect(store.canSave()).toBe(true);
    const done = store.save();
    http.expectNone((request) => request.method === 'PUT');
    // El PATCH no es parcial: lleva el resto de ajustes tal como los cargó el servidor.
    const patch = expectPatch();
    expect(patch.request.body).toEqual({
      name: 'Kafé del Puerto',
      theme: 'NOCHE',
      bookingMode: 'ASSIGNED',
      cancellationDeadlineHours: 4,
    });
    patch.flush({ ...PLAN, theme: 'NOCHE' });
    expect(await done).toBe(true);
    expect(store.theme()).toBe('NOCHE');
    expect(store.dirty()).toBe(false);
  });

  it('themeChangeIsSavedWithPatch: mesas y tema hacen PUT y luego PATCH con los ajustes del PUT', async () => {
    store.moveTable(0, 210, 200);
    store.setTheme('NOCHE');
    const done = store.save();
    expectPut().flush({
      ...PLAN,
      cancellationDeadlineHours: 6,
      tables: [{ ...PLAN.tables![0], x: 210 }, PLAN.tables![1]],
    });
    await settle();
    const patch = expectPatch();
    expect(patch.request.body).toEqual({
      name: 'Kafé del Puerto',
      theme: 'NOCHE',
      bookingMode: 'ASSIGNED',
      cancellationDeadlineHours: 6,
    });
    patch.flush({ ...PLAN, theme: 'NOCHE', tables: store.tables().map((table) => ({ ...table })) });
    expect(await done).toBe(true);
    expect(store.dirty()).toBe(false);
  });

  it('sin cambio de tema no hay PATCH, aunque el servidor devuelva otro tema', async () => {
    store.moveTable(0, 210, 200);
    const done = store.save();
    // Otra pestaña cambió el tema: guardar una mesa no lo revierte, y el editor adopta el del servidor.
    expectPut().flush({
      ...PLAN,
      theme: 'TERRACOTA',
      tables: [{ ...PLAN.tables![0], x: 210 }, PLAN.tables![1]],
    });
    expect(await done).toBe(true);
    http.expectNone(PLAN_URL);
    expect(store.theme()).toBe('TERRACOTA');
    expect(store.dirty()).toBe(false);
  });

  it('si solo falla el PATCH del tema no se pierde el tema elegido', async () => {
    store.setTheme('NOCHE');
    const done = store.save();
    error(expectPatch(), 500, null);
    expect(await done).toBe(false);
    expect(store.theme()).toBe('NOCHE');
    expect(store.dirty()).toBe(true);
    expect(store.saveError()).toContain('No se pudo guardar');
  });

  it('si el PUT falla no se hace el PATCH', async () => {
    store.setTheme('NOCHE');
    store.moveTable(0, 210, 200);
    const done = store.save();
    error(expectPut(), 500, null);
    expect(await done).toBe(false);
    http.expectNone(PLAN_URL);
    expect(store.saveError()).toContain('No se pudo guardar');
    expect(store.dirty()).toBe(true);
  });

  it('si el PATCH falla el plano ya guardado se recarga y el tema elegido sigue pendiente', async () => {
    store.addTable('ROUND', 2);
    store.setTheme('NOCHE');
    const done = store.save();
    expectPut().flush({
      ...PLAN,
      tables: [
        ...PLAN.tables!,
        { id: 31, label: '3', shape: 'ROUND', seats: 2, rotation: 0, x: 90, y: 60 },
      ],
    });
    await settle();
    error(expectPatch(), 500, null);
    expect(await done).toBe(false);
    expect(store.tables().map((table) => table.id)).toEqual([7, 9, 31]);
    expect(store.theme()).toBe('NOCHE');
    expect(store.dirty()).toBe(true);
    expect(store.saveError()).toContain('tema');
  });

  it('serverProblemsMarkTables', async () => {
    store.addTable('ROUND', 2);
    const temporary = store.tables()[2].id;
    const done = store.save();
    error(expectPut(), 422, {
      code: 'LAYOUT_INVALID',
      problems: [
        { tableIndex: 0, label: '1', code: 'UNKNOWN_TABLE' },
        { tableIndex: 2, label: '3', code: 'OVERLAP' },
        { tableIndex: null, label: null, code: 'INVALID_ROOM' },
        { tableIndex: 99, label: 'x', code: 'OVERLAP' },
      ],
    });
    expect(await done).toBe(false);
    expect([...store.invalidTableIds()].sort((a, b) => a - b)).toEqual([temporary, 7]);
    expect(store.serverProblems().map((problem) => `${problem.tableId}:${problem.code}`)).toEqual([
      '7:UNKNOWN_TABLE',
      `${temporary}:OVERLAP`,
      'null:INVALID_ROOM',
    ]);
    expect(store.saveError()).toContain('rojo');
    // No bloquean Guardar (con UNKNOWN_TABLE el dueño se quedaría sin salida) y se borran al editar.
    expect(store.canSave()).toBe(true);
    store.moveTable(2, 400, 400);
    expect(store.invalidTableIds().size).toBe(0);
    expect(store.serverProblems()).toEqual([]);
  });

  it('conflictShowsReservationCodes', async () => {
    store.removeTable(0);
    const done = store.save();
    error(expectPut(), 409, {
      code: 'TABLE_HAS_RESERVATIONS',
      reservations: ['KAFE1234', 'KAFE5678'],
    });
    expect(await done).toBe(false);
    expect(store.blockingCodes()).toEqual(['KAFE1234', 'KAFE5678']);
    expect(store.saveError()).toContain('reservas activas');
    // El plano local no se toca: el dueño decide qué hacer.
    expect(store.tables().length).toBe(1);
    expect(store.dirty()).toBe(true);
  });

  it('ROOM_LOCKED también lista las reservas y se limpia en el siguiente guardado', async () => {
    store.rotateRoom();
    const first = store.save();
    error(expectPut(), 409, { code: 'ROOM_LOCKED', reservations: ['KAFE1234'] });
    await first;
    expect(store.blockingCodes()).toEqual(['KAFE1234']);
    expect(store.saveError()).toContain('forma del local');

    const second = store.save();
    expect(store.blockingCodes()).toEqual([]);
    expect(store.saveError()).toBeNull();
    expectPut().flush({ ...PLAN, room: store.room() });
    await second;
  });

  it('el 429 de guardar usa la espera de Retry-After', async () => {
    store.moveTable(0, 210, 200);
    const done = store.save();
    error(expectPut(), 429, { code: 'RATE_LIMITED' }, { 'Retry-After': '30' });
    await done;
    expect(store.saveError()).toContain('30 segundos');
    expect(store.saving()).toBe(false);
  });

  it('el 404 de guardar dice que el plano ya no existe', async () => {
    store.moveTable(0, 210, 200);
    const done = store.save();
    error(expectPut(), 404, { code: 'RESTAURANT_NOT_FOUND' });
    await done;
    expect(store.saveError()).toContain('ya no existe');
  });

  it('guardar un cambio de forma devuelve el plano a borrador y oculta que esté publicado', async () => {
    store.load({ ...PLAN, status: 'PUBLISHED' });
    expect(store.published()).toBe(true);
    store.rotateRoom();
    const done = store.save();
    expectPut().flush({
      ...PLAN,
      status: 'DRAFT',
      room: { ...store.room() },
      tables: store.tables().map((table) => ({ ...table })),
    });
    await done;
    expect(store.published()).toBe(false);
    expect(store.canPublish()).toBe(true);
  });
});
