import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Provisional (F6): F7 sustituye esta página por el editor del plano en `/panel/:slug/plano`. */
@Component({
  selector: 'app-editor-page',
  template: '<p>Editor del plano: llega en F7</p>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorPage {}
