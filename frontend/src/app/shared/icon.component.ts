import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Iconos disponibles. Los trazos están en `icon.component.html`. */
export const ICON_NAMES = [
  'bell',
  'sound',
  'mute',
  'chev',
  'link',
  'plus',
  'pen',
  'cal',
  'clock',
  'gear',
  'copy',
  'code',
  'rot',
  'save',
  'arrow',
  'send',
  'trash',
  'user',
  'out',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/**
 * Icono de línea de 1,5 px. Decorativo por defecto (`aria-hidden`); con `label` pasa a ser una imagen con nombre accesible.
 * Un botón que solo lleva un icono necesita ese nombre, bien con `label` o con `aria-label` en el botón.
 * Mide 16 px; se cambia con `--icon-size` en el contenedor.
 */
@Component({
  selector: 'app-icon',
  templateUrl: './icon.component.html',
  styleUrl: './icon.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly label = input<string>();
}
