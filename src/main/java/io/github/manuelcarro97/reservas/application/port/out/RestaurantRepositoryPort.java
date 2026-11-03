package io.github.manuelcarro97.reservas.application.port.out;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import io.github.manuelcarro97.reservas.domain.model.Restaurant;

public interface RestaurantRepositoryPort {

	/** Planos no borrados, también los borradores: quien lo use de cara al público debe comprobar el estado. */
	Optional<Restaurant> findBySlug(String slug);

	/** Plano no borrado con ese id, en cualquier estado. */
	Optional<Restaurant> findById(long id);

	/** Planos no borrados del dueño, por orden de creación. */
	List<Restaurant> findByOwner(String ownerUid);

	/**
	 * Bloquea la fila del plano ({@code SELECT … FOR UPDATE}) y devuelve su estado actual, no el de una lectura
	 * previa. Exige una transacción activa; lanza RestaurantNotFoundException si no existe o está borrado.
	 */
	Restaurant lock(long id);

	/**
	 * Serializa por dueño las operaciones que dependen de cuántos planos tiene
	 * ({@code pg_advisory_xact_lock}); se libera al acabar la transacción. Exige una transacción activa. Siempre
	 * antes de {@link #lock(long)}.
	 */
	void lockOwner(String ownerUid);

	Restaurant save(Restaurant restaurant);

	void addClosure(long restaurantId, LocalDate date, String reason);

	boolean isClosed(long restaurantId, LocalDate date);

	int maxCapacity(long restaurantId);

}
