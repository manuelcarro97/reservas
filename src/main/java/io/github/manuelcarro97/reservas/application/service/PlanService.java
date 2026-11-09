package io.github.manuelcarro97.reservas.application.service;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.manuelcarro97.reservas.application.port.in.ManagePlanUseCase;
import io.github.manuelcarro97.reservas.application.port.in.PlanSettings;
import io.github.manuelcarro97.reservas.application.port.in.PlanSummary;
import io.github.manuelcarro97.reservas.application.port.in.PlanView;
import io.github.manuelcarro97.reservas.application.port.in.TableChange;
import io.github.manuelcarro97.reservas.application.port.out.ReservationRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.ShiftRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.TableRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.DemoReadOnlyException;
import io.github.manuelcarro97.reservas.domain.exception.LayoutInvalidException;
import io.github.manuelcarro97.reservas.domain.exception.PlanCreationLimitException;
import io.github.manuelcarro97.reservas.domain.exception.PlanLimitReachedException;
import io.github.manuelcarro97.reservas.domain.exception.PlanNotPublishableException;
import io.github.manuelcarro97.reservas.domain.exception.RoomLockedException;
import io.github.manuelcarro97.reservas.domain.exception.TableHasReservationsException;
import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.LayoutProblem;
import io.github.manuelcarro97.reservas.domain.model.PlanStatus;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.RoomLayout;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.domain.model.TableDraft;
import io.github.manuelcarro97.reservas.domain.model.Theme;
import io.github.manuelcarro97.reservas.domain.service.LayoutValidator;
import io.github.manuelcarro97.reservas.domain.service.SeatingCapacity;

@Service
@Transactional
class PlanService implements ManagePlanUseCase {

	static final int MAX_PLANS_PER_OWNER = 3;
	/** Planos que un dueño puede crear en 24 horas móviles, contando los que ya borró. */
	static final int MAX_PLANS_CREATED_PER_WINDOW = 5;
	static final Duration CREATION_WINDOW = Duration.ofHours(24);

	private static final ZoneId DEFAULT_ZONE = ZoneId.of("Europe/Madrid");
	private static final int DEFAULT_CANCELLATION_DEADLINE_HOURS = 2;

	private final RestaurantRepositoryPort restaurants;
	private final TableRepositoryPort tables;
	private final ShiftRepositoryPort shifts;
	private final ReservationRepositoryPort reservations;
	private final Clock clock;
	private final DemoAccount demoAccount;
	private final LayoutValidator layoutValidator = new LayoutValidator();
	private final SeatingCapacity seatingCapacity = new SeatingCapacity();

	PlanService(RestaurantRepositoryPort restaurants, TableRepositoryPort tables, ShiftRepositoryPort shifts,
			ReservationRepositoryPort reservations, Clock clock, DemoAccount demoAccount) {
		this.restaurants = restaurants;
		this.tables = tables;
		this.shifts = shifts;
		this.reservations = reservations;
		this.clock = clock;
		this.demoAccount = demoAccount;
	}

	@Override
	public Restaurant create(String ownerUid, String slug, String name) {
		// La demo solo tiene su plano (lo siembra el seeder): crear más lo dejaría sin sitio y sin limpiar.
		if (demoAccount.isDemo(ownerUid)) {
			throw new DemoReadOnlyException();
		}
		// El recuento de planos y el alta van bajo el bloqueo del dueño: sin él, dos altas a la vez pasarían el límite.
		restaurants.lockOwner(ownerUid);
		if (restaurants.findByOwner(ownerUid).size() >= MAX_PLANS_PER_OWNER) {
			throw new PlanLimitReachedException();
		}
		// Cuentan también los borrados: crear y borrar no es una vía para saltarse el tope.
		Instant now = clock.instant();
		if (restaurants.countCreatedAfter(ownerUid, now.minus(CREATION_WINDOW)) >= MAX_PLANS_CREATED_PER_WINDOW) {
			throw new PlanCreationLimitException();
		}
		return newDraft(ownerUid, slug, name, now);
	}

	/**
	 * Crea el borrador por defecto sin las restricciones de la demo ni los límites de planos: solo para el seeder de la
	 * demo, que lo llama dentro de su transacción y tras borrar los planos de la cuenta. Está fuera de
	 * {@link ManagePlanUseCase} y la clase no es visible fuera de este paquete: ningún controlador llega a él.
	 */
	public Restaurant createUnrestricted(String ownerUid, String slug, String name) {
		return newDraft(ownerUid, slug, name, clock.instant());
	}

	private Restaurant newDraft(String ownerUid, String slug, String name, Instant now) {
		Restaurant plan = restaurants.create(new Restaurant(null, slug, name, DEFAULT_ZONE,
				DEFAULT_CANCELLATION_DEADLINE_HOURS, ownerUid, PlanStatus.DRAFT, RoomLayout.defaultRoom(), Theme.AZUL,
				BookingMode.FREE_CHOICE), now);
		saveDefaultShift(plan, "Comida", LocalTime.of(13, 0), LocalTime.of(16, 0));
		saveDefaultShift(plan, "Cena", LocalTime.of(20, 0), LocalTime.of(23, 30));
		return plan;
	}

	@Override
	@Transactional(readOnly = true)
	public List<PlanSummary> list(String ownerUid) {
		return restaurants.findByOwner(ownerUid)
			.stream()
			.map(plan -> new PlanSummary(plan.slug(), plan.name(), plan.status()))
			.toList();
	}

	@Override
	@Transactional(readOnly = true)
	public PlanView get(String ownerUid, String slug) {
		Restaurant plan = RestaurantAccess.owned(restaurants, slug, ownerUid);
		return new PlanView(plan, tables.findAll(plan.id()), shifts.findAll(plan.id()));
	}

	@Override
	public Restaurant updateSettings(String ownerUid, String slug, PlanSettings settings) {
		Restaurant locked = lockOwned(ownerUid, slug);
		return restaurants.save(locked.withSettings(settings.name(), settings.theme(), settings.bookingMode(),
				settings.cancellationDeadlineHours()));
	}

	@Override
	public Restaurant publish(String ownerUid, String slug) {
		Restaurant locked = lockOwned(ownerUid, slug);
		// Un plano ajeno ya dio 404 arriba; la demo solo publica el suyo.
		if (demoAccount.isDemo(ownerUid) && !DemoAccount.PLAN_SLUG.equals(locked.slug())) {
			throw new DemoReadOnlyException();
		}
		List<DiningTable> current = tables.findAll(locked.id());
		if (current.isEmpty()) {
			throw new PlanNotPublishableException("The plan needs at least one table");
		}
		List<TableDraft> drafts = current.stream()
			.map(table -> new TableDraft(table.label(), table.shape(), table.seats(), table.rotation(), table.x(),
					table.y()))
			.toList();
		if (!layoutValidator.validate(locked.room(), drafts).isEmpty()) {
			throw new PlanNotPublishableException("The tables do not fit the room");
		}
		return restaurants.save(locked.published());
	}

	@Override
	public PlanView saveLayout(String ownerUid, String slug, RoomLayout room, List<TableChange> changes) {
		// Todo lo que se lee de aquí en adelante va después del bloqueo: solo así ve lo que otra transacción ya confirmó.
		Restaurant plan = lockOwned(ownerUid, slug);
		requireValidLayout(room, changes);
		List<DiningTable> current = tables.findAll(plan.id());
		requireKnownTables(current, changes);

		LocalDate today = LocalDate.ofInstant(clock.instant(), plan.zone());
		List<Reservation> activeFromToday = reservations.findActiveFrom(plan.id(), today);
		boolean roomChanges = !room.equals(plan.room());
		if (roomChanges && !activeFromToday.isEmpty()) {
			throw new RoomLockedException(codesOf(activeFromToday));
		}
		requireReservedTablesKept(activeFromToday, changes);
		requireUnassignedReservationsFit(activeFromToday, changes);

		writeTables(plan.id(), current, changes);
		Restaurant saved = roomChanges ? restaurants.save(plan.withRoomAsDraft(room)) : plan;
		return new PlanView(saved, tables.findAll(plan.id()), shifts.findAll(plan.id()));
	}

	private void requireValidLayout(RoomLayout room, List<TableChange> changes) {
		List<TableDraft> drafts = changes.stream()
			.map(change -> new TableDraft(change.label(), change.shape(), change.seats(), change.rotation(),
					change.x(), change.y()))
			.toList();
		List<LayoutProblem> problems = layoutValidator.validate(room, drafts);
		if (!problems.isEmpty()) {
			throw new LayoutInvalidException(problems);
		}
	}

	/** Un id que no es de una mesa viva de este plano, o que se repite en la petición, no se puede guardar. */
	private static void requireKnownTables(List<DiningTable> current, List<TableChange> changes) {
		Set<Long> known = current.stream().map(DiningTable::id).collect(Collectors.toSet());
		Set<Long> seen = new HashSet<>();
		List<LayoutProblem> problems = new ArrayList<>();
		for (int i = 0; i < changes.size(); i++) {
			Long id = changes.get(i).id();
			if (id != null && (!known.contains(id) || !seen.add(id))) {
				problems.add(new LayoutProblem(i, changes.get(i).label(), "UNKNOWN_TABLE"));
			}
		}
		if (!problems.isEmpty()) {
			throw new LayoutInvalidException(problems);
		}
	}

	/** Una reserva con mesa necesita que la mesa siga en el plano y que le quepa el grupo. */
	private static void requireReservedTablesKept(List<Reservation> active, List<TableChange> changes) {
		Map<Long, TableChange> keptById = new HashMap<>();
		changes.stream().filter(change -> change.id() != null).forEach(change -> keptById.put(change.id(), change));
		Set<String> affected = new LinkedHashSet<>();
		for (Reservation reservation : active) {
			if (reservation.tableId() == null) {
				continue;
			}
			TableChange kept = keptById.get(reservation.tableId());
			if (kept == null || kept.seats() < reservation.partySize()) {
				affected.add(reservation.code());
			}
		}
		if (!affected.isEmpty()) {
			throw new TableHasReservationsException(List.copyOf(affected));
		}
	}

	/**
	 * Las reservas sin mesa (modo asignado, o restos de un cambio de modo) deben seguir cabiendo, por fecha y turno,
	 * en las mesas que el nuevo plano deja libres.
	 */
	private void requireUnassignedReservationsFit(List<Reservation> active, List<TableChange> changes) {
		Map<SlotKey, List<Reservation>> unassignedBySlot = new LinkedHashMap<>();
		Map<SlotKey, Set<Long>> occupiedBySlot = new HashMap<>();
		for (Reservation reservation : active) {
			SlotKey slot = new SlotKey(reservation.date(), reservation.shiftId());
			if (reservation.tableId() == null) {
				unassignedBySlot.computeIfAbsent(slot, key -> new ArrayList<>()).add(reservation);
			}
			else {
				occupiedBySlot.computeIfAbsent(slot, key -> new HashSet<>()).add(reservation.tableId());
			}
		}
		Set<String> affected = new LinkedHashSet<>();
		unassignedBySlot.forEach((slot, unassigned) -> {
			Set<Long> occupied = occupiedBySlot.getOrDefault(slot, Set.of());
			List<Integer> freeSeats = changes.stream()
				.filter(change -> change.id() == null || !occupied.contains(change.id()))
				.map(TableChange::seats)
				.toList();
			List<Integer> parties = unassigned.stream().map(Reservation::partySize).toList();
			if (!seatingCapacity.canSeatAll(freeSeats, parties)) {
				unassigned.forEach(reservation -> affected.add(reservation.code()));
			}
		});
		if (!affected.isEmpty()) {
			throw new TableHasReservationsException(List.copyOf(affected));
		}
	}

	/**
	 * Cada escritura es un UPDATE inmediato y en este orden: así una mesa nueva puede llevar el nombre de una quitada
	 * o de una renombrada (un intercambio de nombres pasa por el nombre provisional "~id", que el validador reserva).
	 */
	private void writeTables(long restaurantId, List<DiningTable> current, List<TableChange> changes) {
		Map<Long, DiningTable> currentById = new HashMap<>();
		current.forEach(table -> currentById.put(table.id(), table));
		Set<Long> keptIds = changes.stream()
			.map(TableChange::id)
			.filter(Objects::nonNull)
			.collect(Collectors.toSet());

		Instant now = clock.instant();
		current.stream().filter(table -> !keptIds.contains(table.id())).forEach(table -> tables.softDelete(table.id(), now));
		tables.renameTemporarily(changes.stream()
			.filter(change -> change.id() != null && !currentById.get(change.id()).label().equals(change.label().strip()))
			.map(TableChange::id)
			.toList());
		changes.stream().filter(change -> change.id() != null).forEach(change -> tables.update(toTable(restaurantId, change)));
		changes.stream().filter(change -> change.id() == null).forEach(change -> tables.save(toTable(restaurantId, change)));
	}

	private static DiningTable toTable(long restaurantId, TableChange change) {
		return new DiningTable(change.id(), restaurantId, change.label().strip(), change.shape(), change.seats(),
				change.rotation(), change.x(), change.y());
	}

	private static List<String> codesOf(List<Reservation> active) {
		return active.stream().map(Reservation::code).toList();
	}

	/** Fecha y turno: dentro de uno de ellos cada reserva activa ocupa una mesa distinta. */
	private record SlotKey(LocalDate date, long shiftId) {
	}

	/** Bloquea el plano y lo devuelve como está ahora: el dueño se revalida con la fila bloqueada, no con la lectura previa. */
	private Restaurant lockOwned(String ownerUid, String slug) {
		Restaurant found = RestaurantAccess.owned(restaurants, slug, ownerUid);
		return RestaurantAccess.requireOwnedBy(restaurants.lock(found.id()), ownerUid);
	}

	private void saveDefaultShift(Restaurant plan, String name, LocalTime start, LocalTime end) {
		shifts.save(new Shift(null, plan.id(), name, start, end, EnumSet.allOf(DayOfWeek.class)));
	}

}
