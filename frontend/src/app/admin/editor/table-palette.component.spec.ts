import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TableShape } from '../../plano/geometry';
import { TablePaletteComponent } from './table-palette.component';

describe('TablePaletteComponent', () => {
  let fixture: ComponentFixture<TablePaletteComponent>;
  let added: { shape: TableShape; seats: number }[];

  beforeEach(() => {
    fixture = TestBed.createComponent(TablePaletteComponent);
    added = [];
    fixture.componentInstance.add.subscribe((table) => added.push(table));
    fixture.detectChanges();
  });

  function buttons(): HTMLButtonElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
  }

  it('ofrece mesas cuadradas y redondas de 2, 4, 6 y 8 plazas', () => {
    expect(buttons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Añadir mesa cuadrada de 2 plazas',
      'Añadir mesa cuadrada de 4 plazas',
      'Añadir mesa cuadrada de 6 plazas',
      'Añadir mesa cuadrada de 8 plazas',
      'Añadir mesa redonda de 2 plazas',
      'Añadir mesa redonda de 4 plazas',
      'Añadir mesa redonda de 6 plazas',
      'Añadir mesa redonda de 8 plazas',
    ]);
  });

  it('emite la forma y las plazas de la mesa elegida', () => {
    buttons()[1].click();
    buttons()[6].click();
    expect(added).toEqual([
      { shape: 'SQUARE', seats: 4 },
      { shape: 'ROUND', seats: 6 },
    ]);
  });

  it('desactivada no emite', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(buttons().every((button) => button.disabled)).toBe(true);
    buttons()[0].click();
    expect(added).toEqual([]);
  });
});
