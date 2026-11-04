import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MeStore } from './me.store';
import { PlanSwitcherComponent } from './plan-switcher.component';

@Component({ template: '<p>editor</p>' })
class EditorStub {}

describe('PlanSwitcherComponent', () => {
  let allowLeaving: boolean;
  let element: HTMLElement;

  beforeEach(async () => {
    allowLeaving = false;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'panel/:slug/plano', component: EditorStub, canDeactivate: [() => allowLeaving] },
        ]),
        {
          provide: MeStore,
          useValue: {
            plans: signal([
              { slug: 'kafe', name: 'Kafé', status: 'DRAFT' },
              { slug: 'tapas', name: 'Tapas', status: 'DRAFT' },
            ]),
          },
        },
      ],
    });
    await RouterTestingHarness.create('/panel/kafe/plano');
    const fixture = TestBed.createComponent(PlanSwitcherComponent);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  function select(): HTMLSelectElement {
    return element.querySelector('select') as HTMLSelectElement;
  }

  async function choose(slug: string): Promise<void> {
    select().value = slug;
    select().dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve));
  }

  it('cambia de plano conservando la sección', async () => {
    allowLeaving = true;
    await choose('tapas');
    expect(TestBed.inject(Router).url).toBe('/panel/tapas/plano');
    expect(select().value).toBe('tapas');
  });

  it('si la página no deja salir, la URL y el selector siguen en el plano de antes', async () => {
    await choose('tapas');
    expect(TestBed.inject(Router).url).toBe('/panel/kafe/plano');
    expect(select().value).toBe('kafe');
  });
});
