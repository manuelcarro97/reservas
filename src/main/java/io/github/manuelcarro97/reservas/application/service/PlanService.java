package io.github.manuelcarro97.reservas.application.service;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.EnumSet;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.manuelcarro97.reservas.application.port.in.ManagePlanUseCase;
import io.github.manuelcarro97.reservas.application.port.in.PlanSettings;
import io.github.manuelcarro97.reservas.application.port.in.PlanSummary;
import io.github.manuelcarro97.reservas.application.port.in.PlanView;
import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.ShiftRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.TableRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.PlanLimitReachedException;
import io.github.manuelcarro97.reservas.domain.exception.PlanNotPublishableException;
import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.PlanStatus;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.RoomLayout;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.domain.model.TableDraft;
import io.github.manuelcarro97.reservas.domain.model.Theme;
import io.github.manuelcarro97.reservas.domain.service.LayoutValidator;

@Service
@Transactional
class PlanService implements ManagePlanUseCase {

	static final int MAX_PLANS_PER_OWNER = 3;

	private static final ZoneId DEFAULT_ZONE = ZoneId.of("Europe/Madrid");
	private static final int DEFAULT_CANCELLATION_DEADLINE_HOURS = 2;

	private final RestaurantRepositoryPort restaurants;
	private final TableRepositoryPort tables;
	private final ShiftRepositoryPort shifts;
	private final LayoutValidator layoutValidator = new LayoutValidator();

	PlanService(RestaurantRepositoryPort restaurants, TableRepositoryPort tables, ShiftRepositoryPort shifts) {
		this.restaurants = restaurants;
		this.tables = tables;
		this.shifts = shifts;
	}

	@Override
	public Restaurant create(String ownerUid, String slug, String name) {
		// El recuento de planos y el alta van bajo el bloqueo del dueño: sin él, dos altas a la vez pasarían el límite.
		restaurants.lockOwner(ownerUid);
		if (restaurants.findByOwner(ownerUid).size() >= MAX_PLANS_PER_OWNER) {
			throw new PlanLimitReachedException();
		}
		Restaurant plan = restaurants.save(new Restaurant(null, slug, name, DEFAULT_ZONE,
				DEFAULT_CANCELLATION_DEADLINE_HOURS, ownerUid, PlanStatus.DRAFT, RoomLayout.defaultRoom(), Theme.AZUL,
				BookingMode.FREE_CHOICE));
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

	/** Bloquea el plano y lo devuelve como está ahora: el dueño se revalida con la fila bloqueada, no con la lectura previa. */
	private Restaurant lockOwned(String ownerUid, String slug) {
		Restaurant found = RestaurantAccess.owned(restaurants, slug, ownerUid);
		return RestaurantAccess.requireOwnedBy(restaurants.lock(found.id()), ownerUid);
	}

	private void saveDefaultShift(Restaurant plan, String name, LocalTime start, LocalTime end) {
		shifts.save(new Shift(null, plan.id(), name, start, end, EnumSet.allOf(DayOfWeek.class)));
	}

}
