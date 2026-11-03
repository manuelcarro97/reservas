package io.github.manuelcarro97.reservas.adapter.in.web;

import io.github.manuelcarro97.reservas.application.port.in.PlanSummary;
import io.github.manuelcarro97.reservas.domain.model.PlanStatus;

record PlanSummaryResponse(String slug, String name, PlanStatus status) {

	static PlanSummaryResponse from(PlanSummary summary) {
		return new PlanSummaryResponse(summary.slug(), summary.name(), summary.status());
	}

}
