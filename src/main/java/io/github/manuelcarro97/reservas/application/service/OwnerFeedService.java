package io.github.manuelcarro97.reservas.application.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.manuelcarro97.reservas.application.port.in.FeedEvent;
import io.github.manuelcarro97.reservas.application.port.in.OwnerFeedUseCase;
import io.github.manuelcarro97.reservas.application.port.out.ReservationRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.ShiftRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.TableRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.ShiftNotFoundException;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;

@Service
class OwnerFeedService implements OwnerFeedUseCase {

	private static final Duration MAX_LOOKBACK = Duration.ofHours(24);
	/** Una reserva puede confirmarse en la base unos segundos después de la hora que lleva: se mira algo más atrás. */
	private static final Duration OVERLAP = Duration.ofSeconds(10);

	private final RestaurantRepositoryPort restaurants;
	private final ShiftRepositoryPort shifts;
	private final TableRepositoryPort tables;
	private final ReservationRepositoryPort reservations;
	private final Clock clock;

	OwnerFeedService(RestaurantRepositoryPort restaurants, ShiftRepositoryPort shifts, TableRepositoryPort tables,
			ReservationRepositoryPort reservations, Clock clock) {
		this.restaurants = restaurants;
		this.shifts = shifts;
		this.tables = tables;
		this.reservations = reservations;
		this.clock = clock;
	}

	@Override
	@Transactional(readOnly = true)
	public Feed feed(String ownerUid, Instant since) {
		Instant now = clock.instant();
		// Un since futuro (reloj del cliente adelantado) cuenta como ahora; uno de hace más de un día, como hace un día.
		Instant earliest = now.minus(MAX_LOOKBACK);
		Instant effectiveSince = since.isAfter(now) ? now : since;
		if (effectiveSince.isBefore(earliest)) {
			effectiveSince = earliest;
		}
		Instant from = effectiveSince.minus(OVERLAP);

		// findByOwner solo trae planos no borrados: los de otros dueños y los borrados no llegan a la consulta.
		Map<Long, Restaurant> plans = restaurants.findByOwner(ownerUid)
			.stream()
			.collect(Collectors.toMap(Restaurant::id, plan -> plan));
		List<Reservation> changed = reservations.changedSince(plans.keySet(), from);

		Map<Long, String> tableLabels = tables
			.findAllById(changed.stream().map(Reservation::tableId).filter(Objects::nonNull).collect(Collectors.toSet()))
			.stream()
			.collect(Collectors.toMap(DiningTable::id, DiningTable::label));
		Map<Long, String> shiftNames = new HashMap<>();

		List<FeedEvent> events = new ArrayList<>();
		for (Reservation reservation : changed) {
			Restaurant plan = plans.get(reservation.restaurantId());
			String shiftName = shiftNames.computeIfAbsent(reservation.shiftId(),
					shiftId -> shifts.findById(plan.id(), shiftId).orElseThrow(ShiftNotFoundException::new).name());
			String tableLabel = reservation.tableId() == null ? null : tableLabels.get(reservation.tableId());
			if (!reservation.createdAt().isBefore(from)) {
				events.add(ReservationEvents.feedEvent(FeedEvent.NEW, plan, shiftName, tableLabel, reservation,
						reservation.createdAt()));
			}
			Instant cancelledAt = reservation.cancelledByCustomerAt();
			if (cancelledAt != null && !cancelledAt.isBefore(from)) {
				events.add(ReservationEvents.feedEvent(FeedEvent.CANCELLED_BY_CUSTOMER, plan, shiftName, tableLabel,
						reservation, cancelledAt));
			}
		}
		events.sort(Comparator.comparing(FeedEvent::at).thenComparing(FeedEvent::reservationId));
		return new Feed(now, events);
	}

}
