import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { FeedService, FeedToast } from './feed.service';
import { ToastComponent } from './toast.component';

describe('ToastComponent', () => {
  let toasts: ReturnType<typeof signal<FeedToast[]>>;
  let dismiss: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let host: HTMLElement;
  let fixture: ComponentFixture<ToastComponent>;

  beforeEach(() => {
    toasts = signal<FeedToast[]>([]);
    dismiss = vi.fn();
    navigate = vi.fn(() => Promise.resolve(true));
    TestBed.configureTestingModule({
      providers: [
        { provide: FeedService, useValue: { toasts, dismiss } },
        { provide: Router, useValue: { navigateByUrl: navigate } },
      ],
    });
    fixture = TestBed.createComponent(ToastComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  function show(...shown: FeedToast[]): void {
    toasts.set(shown);
    fixture.detectChanges();
  }

  function items(): HTMLElement[] {
    return Array.from(host.querySelectorAll<HTMLElement>('.toast'));
  }

  it('announcesPolitely', () => {
    expect(host.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('showsTheTextOfEachToastAsPlainText', () => {
    show(
      { id: 1, text: 'Nueva reserva: Ana, 4 personas', slug: 'kafe' },
      { id: 2, text: '<img src=x onerror=alert(1)>', slug: 'kafe' },
    );

    expect(items().map((item) => item.querySelector('.toast-text')?.textContent?.trim())).toEqual([
      'Nueva reserva: Ana, 4 personas',
      '<img src=x onerror=alert(1)>',
    ]);
    expect(host.querySelector('img')).toBeNull();
  });

  it('clickingTheToastOpensItsPlanAndClosesIt', () => {
    show({ id: 5, text: 'Nueva reserva', slug: 'mi local' });

    items()[0].querySelector<HTMLButtonElement>('.toast-text')!.click();

    expect(navigate).toHaveBeenCalledWith('/panel/mi%20local');
    expect(dismiss).toHaveBeenCalledWith(5);
  });

  it('closeButtonOnlyClosesIt', () => {
    show({ id: 5, text: 'Nueva reserva', slug: 'kafe' });

    host.querySelector<HTMLButtonElement>('button[aria-label="Cerrar aviso"]')!.click();

    expect(dismiss).toHaveBeenCalledWith(5);
    expect(navigate).not.toHaveBeenCalled();
  });
});
