package io.github.manuelcarro97.reservas.application.service;

import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.RestaurantNotFoundException;
import io.github.manuelcarro97.reservas.domain.model.PlanStatus;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;

/** Búsquedas de plano con la regla de acceso que le toca a cada llamante; lo que no cumple se trata como inexistente. */
final class RestaurantAccess {

	private RestaurantAccess() {
	}

	/** Plano del dueño; un plano ajeno, borrado o inexistente da el mismo error, para no revelar que existe. */
	static Restaurant owned(RestaurantRepositoryPort restaurants, String slug, String ownerUid) {
		return restaurants.findBySlug(slug)
			.filter(restaurant -> restaurant.isOwnedBy(ownerUid))
			.orElseThrow(RestaurantNotFoundException::new);
	}

	/** Plano visible para el público: un borrador no se ve hasta que se publica. */
	static Restaurant published(RestaurantRepositoryPort restaurants, String slug) {
		return restaurants.findBySlug(slug)
			.filter(restaurant -> restaurant.status() == PlanStatus.PUBLISHED)
			.orElseThrow(RestaurantNotFoundException::new);
	}

	/** Revalida con la fila ya bloqueada lo que una lectura previa pudo ver cambiar. */
	static Restaurant requireOwnedBy(Restaurant locked, String ownerUid) {
		if (!locked.isOwnedBy(ownerUid)) {
			throw new RestaurantNotFoundException();
		}
		return locked;
	}

}
