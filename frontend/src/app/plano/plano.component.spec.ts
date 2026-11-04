import { ComponentFixture, TestBed } from '@angular/core/testing';
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
      const html = root(fixture).innerHTML;
      for (const id of ids) {
        expect(html).toContain(`url(#${id})`);
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
});
