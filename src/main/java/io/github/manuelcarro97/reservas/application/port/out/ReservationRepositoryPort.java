package io.github.manuelcarro97.reservas.application.port.out;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import io.github.manuelcarro97.reservas.domain.model.Reservation;

public interface ReservationRepositoryPort {

	/** Devuelve vacío si la mesa ya tiene una reserva activa en esa fecha y turno. */
	Optional<Reservation> tryInsert(Reservation reservation);

	Optional<Reservation> findByCode(String code);

	Optional<Reservation> findById(long id);

	/**
	 * Guarda la reserva con un UPDATE inmediato. Lanza ConcurrentUpdateException si otra transacción la cambió antes y
	 * TableTakenException si la mesa ya tiene otra reserva activa en esa fecha y turno.
	 */
	Reservation update(Reservation reservation);

	List<Reservation> findByDate(long restaurantId, LocalDate date);

	/** Reservas PENDING o CONFIRMED del plano con fecha {@code from} o posterior, por fecha e id. */
	List<Reservation> findActiveFrom(long restaurantId, LocalDate from);

	/** Reservas PENDING o CONFIRMED del plano entre {@code from} y {@code to}, ambas incluidas, por fecha e id. */
	List<Reservation> findActiveBetween(long restaurantId, LocalDate from, LocalDate to);

	/** Reservas PENDING o CONFIRMED del turno en esa fecha, con o sin mesa, por id. */
	List<Reservation> findActiveFor(long restaurantId, long shiftId, LocalDate date);

	/**
	 * Reservas de esos planos creadas o canceladas por el cliente en {@code since} o después, por id. Vacío si no hay
	 * planos.
	 */
	List<Reservation> changedSince(Collection<Long> restaurantIds, Instant since);

	int cancelPendingStartedBefore(Instant now);

	/**
	 * Anonimiza los datos del cliente de todas las reservas del plano (nombre "Anonimizado", teléfono "-", sin email) y
	 * sube su versión, para que una actualización concurrente con la versión vieja falle. Devuelve cuántas cambió. No
	 * mira el estado: quien llama decide si hay reservas activas que respetar.
	 */
	int anonymizeRestaurant(long restaurantId);

	/**
	 * Anonimiza los datos del cliente (como {@link #anonymizeRestaurant}, subiendo la versión) de las reservas con
	 * fecha anterior a {@code cutoff} que aún no lo estaban. Devuelve cuántas cambió. No mira el estado ni toca nada
	 * más: la reserva sigue como estaba.
	 */
	int anonymizeBefore(LocalDate cutoff);

	Set<Long> occupiedTableIds(long restaurantId, long shiftId, LocalDate date);

}
