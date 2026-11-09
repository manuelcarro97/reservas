import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PlanSummaryResponse } from '../core/api/models/plan-summary-response';
import { currentPlanSlug } from './current-plan';

const PLANS: PlanSummaryResponse[] = [
  { slug: 'kafe', name: 'Kafé', status: 'PUBLISHED' },
  { slug: 'terraza', name: 'Terraza', status: 'DRAFT' },
];

describe('currentPlanSlug', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    router = TestBed.inject(Router);
  });

  it('slugInTheUrlWins', () => {
    expect(currentPlanSlug('/panel/terraza/turnos', router, PLANS)).toBe('terraza');
    expect(currentPlanSlug('/panel/terraza', router, PLANS)).toBe('terraza');
    // Con un slug en la URL manda el slug, también si la lista aún no ha llegado o no lo trae.
    expect(currentPlanSlug('/panel/otro/plano', router, PLANS)).toBe('otro');
    expect(currentPlanSlug('/panel/terraza', router, [])).toBe('terraza');
    // ...y aunque la URL pida otro plano por la query.
    expect(currentPlanSlug('/panel/terraza?plano=kafe', router, PLANS)).toBe('terraza');
  });

  it('queryPlanoPicksAnExistingPlan', () => {
    expect(currentPlanSlug('/panel?plano=terraza', router, PLANS)).toBe('terraza');
  });

  it('unknownQueryPlanoFallsBackToFirst', () => {
    expect(currentPlanSlug('/panel?plano=no-existe', router, PLANS)).toBe('kafe');
  });

  it('firstPlanWithoutSlug', () => {
    expect(currentPlanSlug('/panel', router, PLANS)).toBe('kafe');
    expect(currentPlanSlug('/panel/cuenta', router, PLANS)).toBe('kafe');
  });

  it('nullWithoutPlans', () => {
    expect(currentPlanSlug('/panel', router, [])).toBeNull();
    expect(currentPlanSlug('/panel?plano=kafe', router, [])).toBeNull();
    expect(currentPlanSlug('/panel/cuenta', router, [])).toBeNull();
  });

  it('accountIsNotASlug', () => {
    expect(currentPlanSlug('/panel/cuenta', router, PLANS)).not.toBe('cuenta');
    expect(currentPlanSlug('/panel/cuenta?plano=terraza', router, PLANS)).toBe('terraza');
  });
});
