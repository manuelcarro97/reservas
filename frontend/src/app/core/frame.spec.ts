import { TestBed } from '@angular/core/testing';
import { NON_EMBEDDABLE_LINK_TARGET, linkTargetFor } from './frame';

describe('linkTargetFor', () => {
  it('opensInTheSameWindowWhenThePageIsNotFramed', () => {
    const page = {} as Window;

    expect(linkTargetFor({ self: page, top: page })).toBe('_self');
  });

  it('opensInTheTopWindowWhenThePageIsInsideAnIframe', () => {
    const page = {} as Window;
    const embedding = {} as Window;

    expect(linkTargetFor({ self: page, top: embedding })).toBe('_top');
  });
});

describe('NON_EMBEDDABLE_LINK_TARGET', () => {
  it('isSelfOutsideAnIframe', () => {
    // jsdom: window.top es la propia ventana.
    expect(TestBed.inject(NON_EMBEDDABLE_LINK_TARGET)).toBe('_self');
  });

  it('isTopWhenWindowTopIsAnotherWindow', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'top');
    Object.defineProperty(window, 'top', { value: {}, configurable: true });
    try {
      expect(TestBed.inject(NON_EMBEDDABLE_LINK_TARGET)).toBe('_top');
    } finally {
      if (original) {
        Object.defineProperty(window, 'top', original);
      } else {
        delete (window as { top?: unknown }).top;
      }
    }
  });
});
