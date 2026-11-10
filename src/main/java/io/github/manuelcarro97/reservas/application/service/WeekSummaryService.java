package io.github.manuelcarro97.reservas.application.service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.manuelcarro97.reservas.application.port.in.WeekSummary;
import io.github.manuelcarro97.reservas.application.port.in.WeekSummaryUseCase;
import io.github.manuelcarro97.reservas.application.port.out.ReservationRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.ShiftRepositoryPort;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.ReservationStatus;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;

@Service
@Transactional(readOnly = true)
class WeekSummaryService implements WeekSummaryUseCase {

	private static final int DAYS_IN_WEEK = 7;

	private final RestaurantRepositoryPort restaurants;
	private final ShiftRepositoryPort shifts;
	private final ReservationRepositoryPort reservations;

	WeekSummaryService(RestaurantRepositoryPort restaurants, ShiftRepositoryPort shifts,
			ReservationRepositoryPort reservations) {
		this.restaurants = restaurants;
		this.shifts = shifts;
		this.reservations = reservations;
	}

	@Override
	public WeekSummary week(String ownerUid, String slug, LocalDate day) {
		Restaurant restaurant = RestaurantAccess.owned(restaurants, slug, ownerUid);
		LocalDate monday = day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
		LocalDate sunday = monday.plusDays(DAYS_IN_WEEK - 1);
		List<Shift> visibleShifts = shifts.findAll(restaurant.id());
		Set<LocalDate> closed = new HashSet<>(restaurants.closuresFrom(restaurant.id(), monday));
		// El puerto ya devuelve solo las activas; el filtro es la regla de este resumen, no depende del adaptador.
		Map<LocalDate, List<Reservation>> byDate = reservations.findActiveBetween(restaurant.id(), monday, sunday)
			.stream()
			.filter(WeekSummaryService::isActive)
			.collect(Collectors.groupingBy(Reservation::date));
		List<WeekSummary.Day> days = IntStream.range(0, DAYS_IN_WEEK)
			.mapToObj(offset -> monday.plusDays(offset))
			.map(date -> summarize(date, closed.contains(date), visibleShifts, byDate.getOrDefault(date, List.of())))
			.toList();
		return new WeekSummary(monday, days);
	}

	private static boolean isActive(Reservation reservation) {
		return reservation.status() == ReservationStatus.PENDING || reservation.status() == ReservationStatus.CONFIRMED;
	}

	/** Un día cerrado no lleva turnos; uno abierto, solo los que abren ese día de la semana. */
	private static WeekSummary.Day summarize(LocalDate date, boolean closed, List<Shift> visibleShifts,
			List<Reservation> dayReservations) {
		if (closed) {
			return new WeekSummary.Day(date, true, List.of());
		}
		Map<Long, List<Reservation>> byShift = dayReservations.stream()
			.collect(Collectors.groupingBy(Reservation::shiftId));
		List<WeekSummary.ShiftLoad> loads = visibleShifts.stream()
			.filter(shift -> shift.opensOn(date))
			.map(shift -> load(shift, byShift.getOrDefault(shift.id(), List.of())))
			.toList();
		return new WeekSummary.Day(date, false, loads);
	}

	private static WeekSummary.ShiftLoad load(Shift shift, List<Reservation> active) {
		Set<Long> tables = active.stream()
			.map(Reservation::tableId)
			.filter(tableId -> tableId != null)
			.collect(Collectors.toSet());
		int unassigned = (int) active.stream().filter(reservation -> reservation.tableId() == null).count();
		int guests = active.stream().mapToInt(Reservation::partySize).sum();
		int pending = (int) active.stream()
			.filter(reservation -> reservation.status() == ReservationStatus.PENDING)
			.count();
		return new WeekSummary.ShiftLoad(shift.id(), tables.size(), unassigned, active.size(), guests, pending);
	}

}
