package io.github.manuelcarro97.reservas.adapter.in.web;

import java.time.LocalDate;
import java.util.List;

import io.github.manuelcarro97.reservas.application.port.in.WeekSummary;

/**
 * Semana del panel de Inicio, de lunes a domingo. Los nombres de sus partes no repiten los de las cifras del frontend
 * para no chocar en el cliente generado.
 */
record WeekSummaryResponse(LocalDate monday, List<WeekSummaryDay> days) {

	static WeekSummaryResponse from(WeekSummary summary) {
		return new WeekSummaryResponse(summary.monday(), summary.days().stream().map(WeekSummaryDay::from).toList());
	}

}
