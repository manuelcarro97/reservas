import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Mock } from 'vitest';
import { ApiConfiguration } from '../../core/api/api-configuration';
import { AdminReservation } from '../../core/api/models/admin-reservation';
import { OPEN_WINDOW } from '../../core/open-window';
import { MeStore } from '../me.store';
import {
  ActionHost,
  CONFIRM_NEEDS_TABLE,
  DONE_MESSAGES,
  ReservationActions,
} from './reservation-actions';

const ANA: AdminReservation = {
  id: 7,
  code: 'KAFE23456789ABCD',
  status: 'PENDING',
  date: '2026-11-09',
  shiftId: 11,
  arrivalTime: '21:30:00',
  partySize: 4,
  customerName: 'Ana',
  customerPhone: '612 345 678',
  tableId: 2,
  tableLabel: '2',
};

const WITHOUT_TABLE: AdminReservation = { ...ANA, tableId: undefined, tableLabel: undefined };

interface FakeHost extends ActionHost {
  viewToken: Mock<() => number>;
  messageFallback: Mock<ActionHost['messageFallback']>;
  afterAction: Mock<() => void>;
  forget: Mock<ActionHost['forget']>;
  needsTable: Mock<ActionHost['needsTable']>;
  reloadPlan: Mock<() => void>;
}

describe('ReservationActions', () => {
  let http: HttpTestingController;
  let actions: ReservationActions;
  let host: FakeHost;
  let openWindow: Mock<(url: string) => void>;
  let view: number;

  beforeEach(() => {
    openWindow = vi.fn<(url: string) => void>();
    view = 1;
    host = {
      viewToken: vi.fn(() => view),
      messageFallback: vi.fn(() => ({ restaurantName: 'Kafé del Puerto', shiftName: 'Cena' })),
      afterAction: vi.fn(),
      forget: vi.fn(),
      needsTable: vi.fn(),
      reloadPlan: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ReservationActions,
        { provide: OPEN_WINDOW, useValue: openWindow },
        { provide: MeStore, useValue: { demo: () => false } },
      ],
    });
    TestBed.inject(ApiConfiguration).rootUrl = '';
    http = TestBed.inject(HttpTestingController);
    actions = TestBed.inject(ReservationActions);
    actions.attach(host);
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('confirmWithTableCallsConfirmAndAfterAction', () => {
    actions.confirm(ANA);
    expect(actions.busy()).toBe(true);

    http.expectOne({ method: 'POST', url: '/api/v1/admin/reservations/7/confirm' }).flush({});

    expect(host.afterAction).toHaveBeenCalledTimes(1);
    expect(host.forget).toHaveBeenCalledWith(ANA);
    expect(actions.busy()).toBe(false);
    expect(actions.notice()).toBe(DONE_MESSAGES.confirm('Ana'));
    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(actions.whatsappUrl()).toBe(openWindow.mock.calls[0][0]);
  });

  it('confirmWithoutTableAsksHostForTable', () => {
    actions.confirm(WITHOUT_TABLE);

    http.expectNone('/api/v1/admin/reservations/7/confirm');
    expect(host.needsTable).toHaveBeenCalledWith(WITHOUT_TABLE, CONFIRM_NEEDS_TABLE);
    expect(actions.busy()).toBe(false);
  });

  it('rejectNeedsAnswerYes', () => {
    actions.ask('reject', ANA);

    http.expectNone('/api/v1/admin/reservations/7/cancel');
    expect(actions.questionText()).toEqual({
      text: '¿Rechazar la reserva de Ana?',
      yes: 'Sí, rechazar',
    });

    actions.answerYes();

    expect(actions.question()).toBeNull();
    http.expectOne({ method: 'POST', url: '/api/v1/admin/reservations/7/cancel' }).flush({});
    expect(actions.notice()).toBe(DONE_MESSAGES.reject('Ana'));
  });

  it('dismissQuestionDoesNotCallTheApi', () => {
    actions.ask('cancel', ANA);
    actions.dismissQuestion();

    expect(actions.question()).toBeNull();
    http.expectNone('/api/v1/admin/reservations/7/cancel');
  });

  it('tableRequiredErrorAsksHostForTable', () => {
    // `startAssign` del store sale si `busy()`: tiene que ser falso cuando el host lo llama.
    let busyWhenAsked: boolean | undefined;
    host.needsTable.mockImplementation(() => {
      busyWhenAsked = actions.busy();
    });

    actions.confirm(ANA);
    http
      .expectOne('/api/v1/admin/reservations/7/confirm')
      .flush({ code: 'TABLE_REQUIRED' }, { status: 409, statusText: 'Conflict' });

    expect(host.needsTable).toHaveBeenCalledWith(ANA, CONFIRM_NEEDS_TABLE);
    expect(busyWhenAsked).toBe(false);
    expect(host.afterAction).toHaveBeenCalledTimes(1);
  });

  it('staleReservationForgetsItAndRefreshes', () => {
    actions.confirm(ANA);
    http
      .expectOne('/api/v1/admin/reservations/7/confirm')
      .flush({ code: 'INVALID_TRANSITION' }, { status: 409, statusText: 'Conflict' });

    expect(actions.error()).toBe(
      'Esa reserva ya no admite esa acción. Se ha actualizado la lista.',
    );
    expect(actions.busy()).toBe(false);
    expect(host.forget).toHaveBeenCalledWith(ANA);
    expect(host.afterAction).toHaveBeenCalledTimes(1);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('tableNotFoundReloadsThePlan', () => {
    actions.confirm(ANA);
    http
      .expectOne('/api/v1/admin/reservations/7/confirm')
      .flush({ code: 'TABLE_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });

    expect(host.reloadPlan).toHaveBeenCalledTimes(1);
    expect(host.afterAction).toHaveBeenCalledTimes(1);
  });

  it('answerFromAnotherViewTouchesNothing', () => {
    actions.confirm(ANA);
    view = 2;

    http.expectOne('/api/v1/admin/reservations/7/confirm').flush({});

    expect(actions.notice()).toBeNull();
    expect(host.afterAction).not.toHaveBeenCalled();
    expect(host.forget).not.toHaveBeenCalled();
    // El cliente tiene que recibir el mensaje aunque la pantalla ya sea otra, pero sin guardar su enlace de respaldo.
    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(actions.whatsappUrl()).toBeNull();
  });

  it('errorFromAnotherViewTouchesNothing', () => {
    actions.confirm(ANA);
    view = 2;

    http
      .expectOne('/api/v1/admin/reservations/7/confirm')
      .flush({ code: 'INVALID_TRANSITION' }, { status: 409, statusText: 'Conflict' });

    expect(actions.error()).toBeNull();
    expect(host.forget).not.toHaveBeenCalled();
    expect(host.afterAction).not.toHaveBeenCalled();
  });
});
