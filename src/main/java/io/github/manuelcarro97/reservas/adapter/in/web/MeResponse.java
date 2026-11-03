package io.github.manuelcarro97.reservas.adapter.in.web;

import java.util.List;

import io.github.manuelcarro97.reservas.application.port.in.AccountUseCase.Me;

/** La cuenta del dueño para el panel. No lleva su uid: el frontend ya lo conoce por el SDK de Firebase. */
record MeResponse(String email, boolean demo, boolean telegramAvailable, boolean telegramLinked, int maxPlans,
		List<PlanSummaryResponse> plans) {

	static MeResponse from(Me me) {
		return new MeResponse(me.email(), me.demo(), me.telegramAvailable(), me.telegramLinked(), me.maxPlans(),
				me.plans().stream().map(PlanSummaryResponse::from).toList());
	}

}
