package io.github.manuelcarro97.reservas.application.port.in;

import java.time.LocalDate;
import java.util.List;

/**
 * Lo que la página pública necesita de un plano publicado. Un plano en borrador, borrado o inexistente es
 * RestaurantNotFoundException; un turno oculto, de otro plano o inexistente es ShiftNotFoundException.
 */
public interface GetPublicPlanUseCase {

	/** Plano con sus mesas vivas y sus turnos visibles. */
	PlanView plan(String slug);

	/** Mesas del plano y si están ocupadas en ese turno y fecha; fuera de la ventana de reserva o en día cerrado, todas. */
	List<TableOccupancy> occupancy(String slug, long shiftId, LocalDate date);

}
