package io.github.manuelcarro97.reservas.application.port.in;

import java.time.LocalDate;

public interface WeekSummaryUseCase {

	/**
	 * Resumen de la semana (de lunes a domingo) que contiene {@code day}, con una sola lectura de reservas. Lanza
	 * RestaurantNotFoundException si el plano no existe o no es del dueño.
	 */
	WeekSummary week(String ownerUid, String slug, LocalDate day);

}
