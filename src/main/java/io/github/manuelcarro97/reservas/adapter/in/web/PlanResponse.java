package io.github.manuelcarro97.reservas.adapter.in.web;

import java.util.List;

import io.github.manuelcarro97.reservas.application.port.in.PlanView;
import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.PlanStatus;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Theme;

/**
 * Plano tal como lo ve su dueño; no lleva el uid del dueño. {@code timeZone} es el id IANA de la zona del local (p. ej.
 * {@code Europe/Madrid}): el panel calcula con ella qué día es "hoy".
 */
record PlanResponse(String slug, String name, PlanStatus status, Theme theme, BookingMode bookingMode,
		int cancellationDeadlineHours, String timeZone, RoomDto room, List<TableDto> tables, List<ShiftResponse> shifts) {

	static PlanResponse from(PlanView view) {
		Restaurant plan = view.restaurant();
		return new PlanResponse(plan.slug(), plan.name(), plan.status(), plan.theme(), plan.bookingMode(),
				plan.cancellationDeadlineHours(), plan.zone().getId(), RoomDto.from(plan.room()),
				view.tables().stream().map(TableDto::from).toList(),
				view.shifts().stream().map(ShiftResponse::from).toList());
	}

}
