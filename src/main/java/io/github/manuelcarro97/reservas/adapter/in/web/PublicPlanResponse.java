package io.github.manuelcarro97.reservas.adapter.in.web;

import java.util.List;

import io.github.manuelcarro97.reservas.application.port.in.PlanView;
import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Theme;

/**
 * Plano tal como lo ve el público: sin dueño ni estado, y sin datos de clientes. {@code timeZone} es el id IANA de la
 * zona del local (p. ej. {@code Europe/Madrid}): el cliente calcula con ella qué día es "hoy".
 */
record PublicPlanResponse(String slug, String name, Theme theme, BookingMode bookingMode,
		int cancellationDeadlineHours, String timeZone, RoomDto room, List<TableDto> tables, List<ShiftResponse> shifts) {

	static PublicPlanResponse from(PlanView view) {
		Restaurant plan = view.restaurant();
		return new PublicPlanResponse(plan.slug(), plan.name(), plan.theme(), plan.bookingMode(),
				plan.cancellationDeadlineHours(), plan.zone().getId(), RoomDto.from(plan.room()),
				view.tables().stream().map(TableDto::from).toList(),
				view.shifts().stream().map(ShiftResponse::from).toList());
	}

}
