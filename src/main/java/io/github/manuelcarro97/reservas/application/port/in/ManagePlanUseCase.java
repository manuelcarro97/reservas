package io.github.manuelcarro97.reservas.application.port.in;

import java.util.List;

import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.RoomLayout;

/** Planos de un dueño. Todo lo que no es suyo se comporta como si no existiera (RestaurantNotFoundException). */
public interface ManagePlanUseCase {

	/** Crea un borrador con el local, el tema y los turnos por defecto; falla si el dueño ya tiene el máximo de planos. */
	Restaurant create(String ownerUid, String slug, String name);

	List<PlanSummary> list(String ownerUid);

	PlanView get(String ownerUid, String slug);

	Restaurant updateSettings(String ownerUid, String slug, PlanSettings settings);

	/** Publica el plano; exige al menos una mesa y que ninguna tenga problemas de colocación. */
	Restaurant publish(String ownerUid, String slug);

	/**
	 * Sustituye la forma del local y todas sus mesas: la mesa con {@code id} se actualiza, la que no lleva se crea y
	 * la que existe y no viene se quita. Atómico y bajo el bloqueo del plano; si algo falla no se guarda nada.
	 *
	 * @throws io.github.manuelcarro97.reservas.domain.exception.LayoutInvalidException si el plano tiene problemas o
	 * una mesa no es de este plano
	 * @throws io.github.manuelcarro97.reservas.domain.exception.RoomLockedException si la forma cambia y hay reservas
	 * activas futuras
	 * @throws io.github.manuelcarro97.reservas.domain.exception.TableHasReservationsException si quitar o reducir una
	 * mesa deja sin sitio a una reserva activa futura
	 */
	PlanView saveLayout(String ownerUid, String slug, RoomLayout room, List<TableChange> tables);

}
