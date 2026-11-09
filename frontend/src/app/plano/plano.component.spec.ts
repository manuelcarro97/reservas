import { BrowserPlatformLocation, PlatformLocation } from '@angular/common';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Room } from './geometry';
import { PlanoComponent, PlanoTable } from './plano.component';
import { THEMES } from './themes';

const ROOM: Room = {
  shape: 'RECTANGLE',
  width: 1200,
  height: 800,
  cutWidth: 0,
  cutDepth: 0,
  rotation: 0,
};

const TABLES: PlanoTable[] = [
  { id: 11, label: '1', shape: 'SQUARE', seats: 4, rotation: 0, x: 200, y: 200 },
  { id: 12, label: '2', shape: 'ROUND', seats: 6, rotation: 0, x: 600, y: 400 },
  { id: 13, label: '3', shape: 'SQUARE', seats: 2, rotation: 90, x: 900, y: 300 },
];

describe('PlanoComponent', () => {
  function render(inputs: Record<string, unknown> = {}): ComponentFixture<PlanoComponent> {
    const fixture = TestBed.createComponent(PlanoComponent);
    fixture.componentRef.setInput('room', ROOM);
    fixture.componentRef.setInput('tables', TABLES);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture;
  }

  function root(fixture: ComponentFixture<PlanoComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function tableGroups(fixture: ComponentFixture<PlanoComponent>): SVGGElement[] {
    return Array.from(root(fixture).querySelectorAll<SVGGElement>('g.t'));
  }

  /** Valores `url(...)` de los atributos que referencian `<defs>`. */
  function references(fixture: ComponentFixture<PlanoComponent>): string[] {
    const refs: string[] = [];
    for (const element of Array.from(root(fixture).querySelectorAll('*'))) {
      for (const name of ['fill', 'filter', 'clip-path']) {
        const value = element.getAttribute(name);
        if (value?.startsWith('url(')) {
          refs.push(value);
        }
      }
    }
    return refs;
  }

  function keydown(target: Element, key: string): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }

  it('rendersOneGroupPerTable', () => {
    const fixture = render();

    expect(tableGroups(fixture).length).toBe(3);
    expect(root(fixture).querySelectorAll('g.t .top').length).toBe(3);
    expect(root(fixture).querySelectorAll('g.t .badge').length).toBe(3);
  });

  it('drawsOneChairPerSeat', () => {
    const fixture = render();

    expect(tableGroups(fixture).map((group) => group.querySelectorAll('.seat').length)).toEqual([
      4, 6, 2,
    ]);
  });

  it('appliesStateClass', () => {
    const fixture = render({ states: { 11: 'selected', 12: 'taken', 13: 'pending' } });

    expect(tableGroups(fixture).map((group) => group.getAttribute('class'))).toEqual([
      't selected',
      't taken',
      't pending',
    ]);
  });

  it('invalidStateHasItsOwnClassAndScreenReaderText', () => {
    const fixture = render({ states: { 12: 'invalid' } });

    expect(tableGroups(fixture).map((group) => group.getAttribute('class'))).toEqual([
      't free',
      't invalid',
      't free',
    ]);
    expect(tableGroups(fixture)[1].getAttribute('aria-label')).toBe(
      'Mesa 2, 6 plazas, con problema',
    );
  });

  it('marksEachTableGroupWithItsId', () => {
    const fixture = render();

    expect(tableGroups(fixture).map((group) => group.getAttribute('data-table-id'))).toEqual([
      '11',
      '12',
      '13',
    ]);
  });

  it('defaultsToFreeAndAcceptsBlocked', () => {
    const fixture = render({ states: { 12: 'blocked' } });

    expect(tableGroups(fixture).map((group) => group.getAttribute('class'))).toEqual([
      't free',
      't blocked',
      't free',
    ]);
  });

  it('describesEachTableForScreenReaders', () => {
    const fixture = render({ states: { 12: 'taken', 13: 'selected' } });

    expect(tableGroups(fixture).map((group) => group.getAttribute('aria-label'))).toEqual([
      'Mesa 1, 4 plazas, libre',
      'Mesa 2, 6 plazas, reservada',
      'Mesa 3, 2 plazas, seleccionada',
    ]);
  });

  it('doesNotRepeatTheWordMesaWhenTheLabelHasIt', () => {
    const fixture = render({
      tables: [{ id: 1, label: 'Mesa 7', shape: 'SQUARE', seats: 4, rotation: 0, x: 200, y: 200 }],
    });

    expect(tableGroups(fixture)[0].getAttribute('aria-label')).toBe('Mesa 7, 4 plazas, libre');
  });

  it('emitsOnClickAndEnter', () => {
    const fixture = render({ interactive: true });
    const emitted: number[] = [];
    fixture.componentInstance.tableSelected.subscribe((id) => emitted.push(id));
    const groups = tableGroups(fixture);

    groups[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    keydown(groups[1], 'Enter');
    keydown(groups[2], ' ');

    expect(emitted).toEqual([11, 12, 13]);
  });

  it('ignoresOtherKeys', () => {
    const fixture = render({ interactive: true });
    const emitted: number[] = [];
    fixture.componentInstance.tableSelected.subscribe((id) => emitted.push(id));

    keydown(tableGroups(fixture)[0], 'a');

    expect(emitted).toEqual([]);
  });

  it('interactiveTablesAreFocusableButtons', () => {
    const fixture = render({ interactive: true });

    for (const group of tableGroups(fixture)) {
      expect(group.getAttribute('tabindex')).toBe('0');
      expect(group.getAttribute('role')).toBe('button');
    }
  });

  it('notInteractiveIgnoresClicks', () => {
    const fixture = render({ interactive: false });
    const emitted: number[] = [];
    fixture.componentInstance.tableSelected.subscribe((id) => emitted.push(id));
    const groups = tableGroups(fixture);

    groups[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    keydown(groups[0], 'Enter');

    expect(emitted).toEqual([]);
    expect(groups[0].hasAttribute('tabindex')).toBe(false);
    expect(groups[0].getAttribute('role')).toBe('img');
  });

  it('blockedTableDoesNotEmit', () => {
    const fixture = render({ interactive: true, states: { 12: 'blocked' } });
    const emitted: number[] = [];
    fixture.componentInstance.tableSelected.subscribe((id) => emitted.push(id));
    const blocked = tableGroups(fixture)[1];

    blocked.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    keydown(blocked, 'Enter');
    keydown(blocked, ' ');
    tableGroups(fixture)[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(emitted).toEqual([11]);
  });

  it('blockedTableIsAriaDisabled', () => {
    const fixture = render({ interactive: true, states: { 12: 'blocked', 13: 'taken' } });
    const [free, blocked, taken] = tableGroups(fixture);

    expect(blocked.getAttribute('aria-disabled')).toBe('true');
    expect(blocked.hasAttribute('tabindex')).toBe(false);
    expect(free.hasAttribute('aria-disabled')).toBe(false);
    expect(taken.hasAttribute('aria-disabled')).toBe(false);
    expect(taken.getAttribute('tabindex')).toBe('0');
  });

  it('twoInstancesHaveDistinctDefIds', () => {
    const first = render();
    const second = render();

    const idsOf = (fixture: ComponentFixture<PlanoComponent>) =>
      Array.from(root(fixture).querySelectorAll('defs [id]')).map((element) => element.id);
    const firstIds = idsOf(first);
    const secondIds = idsOf(second);

    expect(firstIds.length).toBeGreaterThan(0);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
    for (const [fixture, ids] of [
      [first, firstIds],
      [second, secondIds],
    ] as const) {
      const refs = references(fixture);
      for (const id of ids) {
        expect(refs.some((ref) => ref.endsWith(`#${id}")`))).toBe(true);
      }
    }
  });

  it('themeChangesFloorColour', () => {
    const fixture = render({ theme: 'AZUL' });
    const floorColour = () => root(fixture).querySelector('pattern rect')?.getAttribute('fill');

    expect(floorColour()).toBe(THEMES.AZUL.floorA);

    fixture.componentRef.setInput('theme', 'NOCHE');
    fixture.detectChanges();

    expect(floorColour()).toBe(THEMES.NOCHE.floorA);
    expect(THEMES.NOCHE.floorA).not.toBe(THEMES.AZUL.floorA);
  });

  it('themeChangesCssColourVariables', () => {
    const fixture = render({ theme: 'BOSQUE' });
    const svg = root(fixture).querySelector('svg') as SVGSVGElement;

    expect(svg.style.getPropertyValue('--stone')).toBe(THEMES.BOSQUE.stone);
    // Los nombres en camelCase deben llegar tal cual: el CSS los usa con ese mismo nombre.
    expect(svg.style.getPropertyValue('--seatInk')).toBe(THEMES.BOSQUE.seatInk);
    expect(svg.style.getPropertyValue('--topStroke')).toBe(THEMES.BOSQUE.topStroke);
  });

  it('viewBoxCoversTheRoomWithPadding', () => {
    const fixture = render();

    expect(root(fixture).querySelector('svg')?.getAttribute('viewBox')).toBe('-40 -40 1280 880');
  });

  it('viewBoxFollowsTheRotatedRoom', () => {
    const fixture = render({ room: { ...ROOM, rotation: 90 } });

    expect(root(fixture).querySelector('svg')?.getAttribute('viewBox')).toBe('-40 -40 880 1280');
  });

  it('viewBoxInputOverridesTheFittedOne', () => {
    const fixture = render({ viewBox: '0 -40 1280 880' });

    expect(root(fixture).querySelector('svg')?.getAttribute('viewBox')).toBe('0 -40 1280 880');
    fixture.componentRef.setInput('viewBox', null);
    fixture.detectChanges();
    expect(root(fixture).querySelector('svg')?.getAttribute('viewBox')).toBe('-40 -40 1280 880');
  });

  // Con <base href="/"> y rutas sin hash, `url(#id)` se resuelve contra la base en Safari y Firefox antiguos
  // (otro documento) y se pierden suelo, banda, cojines, tablero y madera. Las referencias llevan la URL actual.
  describe('references against the current URL', () => {
    let base: HTMLBaseElement;

    beforeEach(() => {
      base = document.createElement('base');
      base.href = '/';
      document.head.appendChild(base);
      history.replaceState({}, '', '/r/demo?fecha=1');
    });

    afterEach(() => {
      base.remove();
      history.replaceState({}, '', '/');
    });

    it('prefixesEveryReferenceWithThePathAndQuery', () => {
      const fixture = render();
      const refs = references(fixture);

      // floor, clip de la banda, y por mesa: cojín, tablero y madera.
      expect(refs.length).toBeGreaterThanOrEqual(2 + 3 * TABLES.length);
      for (const ref of refs) {
        expect(ref).toMatch(/^url\("\/r\/demo\?fecha=1#plano-\d+-[a-z]+"\)$/);
      }
    });

    it('updatesTheReferencesWhenTheRouterNavigatesToAnotherQuery', async () => {
      @Component({ template: '' })
      class Blank {}
      TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path: '**', component: Blank }]),
          // TestBed monta una PlatformLocation falsa que no toca la URL del documento; aquí se quiere la real.
          { provide: PlatformLocation, useClass: BrowserPlatformLocation },
        ],
      });
      const fixture = render();
      const router = TestBed.inject(Router);

      await router.navigateByUrl('/r/demo?fecha=2');
      fixture.detectChanges();

      const refs = references(fixture);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        expect(ref).toMatch(/^url\("\/r\/demo\?fecha=2#/);
      }
      expect(root(fixture).querySelector('svg')?.getAttribute('viewBox')).not.toBeNull();
    });
  });
});
