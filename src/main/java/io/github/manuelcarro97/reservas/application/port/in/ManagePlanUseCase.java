package io.github.manuelcarro97.reservas.application.port.in;

import java.util.List;

import io.github.manuelcarro97.reservas.domain.model.Restaurant;

/** Planos de un dueño. Todo lo que no es suyo se comporta como si no existiera (RestaurantNotFoundException). */
public interface ManagePlanUseCase {

	/** Crea un borrador con el local, el tema y los turnos por defecto; falla si el dueño ya tiene el máximo de planos. */
	Restaurant create(String ownerUid, String slug, String name);

	List<PlanSummary> list(String ownerUid);

	PlanView get(String ownerUid, String slug);

	Restaurant updateSettings(String ownerUid, String slug, PlanSettings settings);

	/** Publica el plano; exige al menos una mesa y que ninguna tenga problemas de colocación. */
	Restaurant publish(String ownerUid, String slug);

}
