package io.github.manuelcarro97.reservas.adapter.in.web;

import java.time.LocalDate;
import java.util.List;

import io.github.manuelcarro97.reservas.application.port.in.WeekSummary;

/** Un día de la semana; {@code shifts} va vacío si el día está cerrado. */
record WeekSummaryDay(LocalDate date, boolean closed, List<WeekShiftLoad> shifts) {

	static WeekSummaryDay from(WeekSummary.Day day) {
		return new WeekSummaryDay(day.date(), day.closed(), day.shifts().stream().map(WeekShiftLoad::from).toList());
	}

}
