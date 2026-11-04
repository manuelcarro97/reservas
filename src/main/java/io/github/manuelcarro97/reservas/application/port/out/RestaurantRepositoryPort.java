package io.github.manuelcarro97.reservas.application.port.out;

import java.time.Instant;
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

	/** Guarda un plano nuevo anotando {@code createdAt} (el reloj de la aplicación) como su fecha de creación. */
	Restaurant create(Restaurant restaurant, Instant createdAt);

	/** Planos que el dueño creó después de {@code since}, también los borrados. */
	int countCreatedAfter(String ownerUid, Instant since);

	/**
	 * Borrado lógico del plano con un UPDATE dirigido: desaparece de las consultas y su slug sigue ocupado para siempre.
	 * Si ya estaba borrado no hace nada.
	 */
	void softDelete(long id, Instant at);

	void addClosure(long restaurantId, LocalDate date, String reason);

	/** Fechas cerradas del plano desde {@code from} (incluida), en orden. */
	List<LocalDate> closuresFrom(long restaurantId, LocalDate from);

	/** Quita el cierre de esa fecha; si no hay ninguno no hace nada. */
	void removeClosure(long restaurantId, LocalDate date);

	boolean isClosed(long restaurantId, LocalDate date);

	int maxCapacity(long restaurantId);

}
