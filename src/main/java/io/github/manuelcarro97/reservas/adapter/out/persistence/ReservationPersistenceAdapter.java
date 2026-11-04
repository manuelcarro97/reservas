package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import io.github.manuelcarro97.reservas.application.port.out.ReservationRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.ConcurrentUpdateException;
import io.github.manuelcarro97.reservas.domain.exception.TableTakenException;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.ReservationStatus;

@Component
class ReservationPersistenceAdapter implements ReservationRepositoryPort {

	// Va por JDBC porque JPA no expresa ON CONFLICT, y un conflicto no debe abortar la transacción.
	private static final String INSERT_IF_SLOT_FREE = """
			INSERT INTO reservation (code, restaurant_id, shift_id, table_id, reservation_date, party_size,
			                         customer_name, customer_phone, customer_email, status, version, created_at)
			VALUES (:code, :restaurantId, :shiftId, :tableId, :date, :partySize,
			        :customerName, :customerPhone, :customerEmail, :status, 0, :createdAt)
			ON CONFLICT (table_id, reservation_date, shift_id) WHERE status IN ('PENDING', 'CONFIRMED') DO NOTHING
			RETURNING id
			""";

	private static final String CANCEL_EXPIRED_PENDING = """
			UPDATE reservation r
			SET status = 'CANCELLED', version = r.version + 1
			FROM shift s, restaurant rest
			WHERE r.shift_id = s.id
			  AND r.restaurant_id = rest.id
			  AND r.status = 'PENDING'
			  AND (r.reservation_date + s.start_time) AT TIME ZONE rest.zone_id <= :now
			""";

	// version + 1: el @Version protege assignTable, y una entidad leída antes no puede pisar los datos ya anonimizados.
	private static final String ANONYMIZE_RESTAURANT = """
			UPDATE reservation
			SET customer_name = 'Anonimizado', customer_phone = '-', customer_email = NULL, version = version + 1
			WHERE restaurant_id = :restaurantId
			""";

	// Mismo version + 1 que arriba. Deja fuera solo las filas ya anonimizadas del todo (nombre, teléfono y email): un
	// cliente que se llame "Anonimizado" conserva su teléfono hasta que se anonimice. Segunda pasada, cero filas.
	private static final String ANONYMIZE_BEFORE = """
			UPDATE reservation
			SET customer_name = 'Anonimizado', customer_phone = '-', customer_email = NULL, version = version + 1
			WHERE reservation_date < :cutoff
			  AND NOT (customer_name = 'Anonimizado' AND customer_phone = '-' AND customer_email IS NULL)
			""";

	private final ReservationJpaRepository reservations;
	private final JdbcClient jdbc;

	ReservationPersistenceAdapter(ReservationJpaRepository reservations, JdbcClient jdbc) {
		this.reservations = reservations;
		this.jdbc = jdbc;
	}

	@Override
	public Optional<Reservation> tryInsert(Reservation reservation) {
		return jdbc.sql(INSERT_IF_SLOT_FREE)
			.param("code", reservation.code())
			.param("restaurantId", reservation.restaurantId())
			.param("shiftId", reservation.shiftId())
			.param("tableId", reservation.tableId(), Types.BIGINT)
			.param("date", reservation.date())
			.param("partySize", reservation.partySize())
			.param("customerName", reservation.customerName())
			.param("customerPhone", reservation.customerPhone())
			.param("customerEmail", reservation.customerEmail())
			.param("status", reservation.status().name())
			.param("createdAt", Timestamp.from(reservation.createdAt()))
			.query(Long.class)
			.optional()
			.map(id -> new Reservation(id, reservation.code(), reservation.restaurantId(), reservation.shiftId(),
					reservation.tableId(), reservation.date(), reservation.partySize(), reservation.customerName(),
					reservation.customerPhone(), reservation.customerEmail(), reservation.status(), 0,
					reservation.createdAt(), reservation.cancelledByCustomerAt()));
	}

	@Override
	public Optional<Reservation> findByCode(String code) {
		return reservations.findByCode(code).map(ReservationEntity::toDomain);
	}

	@Override
	public Optional<Reservation> findById(long id) {
		return reservations.findById(id).map(ReservationEntity::toDomain);
	}

	@Override
	public Reservation update(Reservation reservation) {
		// saveAndFlush y no save: el UPDATE se ejecuta aquí, y con él saltan dentro del try la violación del índice
		// único (mesa ya reservada) y el bloqueo optimista, aunque haya una transacción exterior.
		try {
			return reservations.saveAndFlush(ReservationEntity.from(reservation)).toDomain();
		}
		catch (OptimisticLockingFailureException staleVersion) {
			throw new ConcurrentUpdateException();
		}
		catch (DataIntegrityViolationException slotTaken) {
			throw new TableTakenException();
		}
	}

	@Override
	public List<Reservation> findByDate(long restaurantId, LocalDate date) {
		return reservations.findByRestaurantIdAndDateOrderById(restaurantId, date)
			.stream()
			.map(ReservationEntity::toDomain)
			.toList();
	}

	@Override
	public List<Reservation> findActiveFrom(long restaurantId, LocalDate from) {
		return reservations
			.findByRestaurantIdAndDateGreaterThanEqualAndStatusInOrderByDateAscIdAsc(restaurantId, from,
					List.of(ReservationStatus.PENDING, ReservationStatus.CONFIRMED))
			.stream()
			.map(ReservationEntity::toDomain)
			.toList();
	}

	@Override
	public List<Reservation> findActiveFor(long restaurantId, long shiftId, LocalDate date) {
		return reservations
			.findByRestaurantIdAndShiftIdAndDateAndStatusInOrderById(restaurantId, shiftId, date,
					List.of(ReservationStatus.PENDING, ReservationStatus.CONFIRMED))
			.stream()
			.map(ReservationEntity::toDomain)
			.toList();
	}

	@Override
	public List<Reservation> changedSince(Collection<Long> restaurantIds, Instant since) {
		if (restaurantIds.isEmpty()) {
			return List.of();
		}
		return reservations.changedSince(restaurantIds, since).stream().map(ReservationEntity::toDomain).toList();
	}

	@Override
	public boolean hasActive(long restaurantId, LocalDate date) {
		return reservations.existsByRestaurantIdAndDateAndStatusIn(restaurantId, date,
				List.of(ReservationStatus.PENDING, ReservationStatus.CONFIRMED));
	}

	@Override
	public int cancelPendingStartedBefore(Instant now) {
		return jdbc.sql(CANCEL_EXPIRED_PENDING).param("now", Timestamp.from(now)).update();
	}

	@Override
	public int anonymizeRestaurant(long restaurantId) {
		return jdbc.sql(ANONYMIZE_RESTAURANT).param("restaurantId", restaurantId).update();
	}

	@Override
	public int anonymizeBefore(LocalDate cutoff) {
		return jdbc.sql(ANONYMIZE_BEFORE).param("cutoff", cutoff).update();
	}

	@Override
	public Set<Long> occupiedTableIds(long restaurantId, long shiftId, LocalDate date) {
		// Una reserva sin mesa (modo asignado) devuelve null y Set.copyOf no admite nulos.
		return reservations.occupiedTableIds(restaurantId, shiftId, date)
			.stream()
			.filter(Objects::nonNull)
			.collect(Collectors.toUnmodifiableSet());
	}

}
