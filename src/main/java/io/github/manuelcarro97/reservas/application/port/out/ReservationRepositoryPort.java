package io.github.manuelcarro97.reservas.application.port.out;

import java.time.Instant;
import java.time.LocalDate;
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

	/** Reservas PENDING o CONFIRMED del turno en esa fecha, con o sin mesa, por id. */
	List<Reservation> findActiveFor(long restaurantId, long shiftId, LocalDate date);

	boolean hasActive(long restaurantId, LocalDate date);

	int cancelPendingStartedBefore(Instant now);

	Set<Long> occupiedTableIds(long restaurantId, long shiftId, LocalDate date);

}
