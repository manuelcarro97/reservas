package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import io.github.manuelcarro97.reservas.application.port.in.CreateReservationCommand;
import io.github.manuelcarro97.reservas.application.port.in.CreateReservationUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ManagePlanUseCase;
import io.github.manuelcarro97.reservas.application.port.in.PlanSettings;
import io.github.manuelcarro97.reservas.application.port.in.PlanView;
import io.github.manuelcarro97.reservas.application.port.in.TableChange;
import io.github.manuelcarro97.reservas.application.port.out.IdentityProviderException;
import io.github.manuelcarro97.reservas.domain.exception.DemoReadOnlyException;
import io.github.manuelcarro97.reservas.domain.exception.DomainException;
import io.github.manuelcarro97.reservas.domain.exception.ErrorKind;
import io.github.manuelcarro97.reservas.domain.exception.RestaurantNotFoundException;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.domain.model.Theme;
import io.github.manuelcarro97.reservas.support.FakeIdentityProvider;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/**
 * El seeder de la demo contra una base real. Las credenciales son ficticias y el proveedor de identidad es el de
 * pruebas: nunca se llama a Firebase.
 */
@AutoConfigureMockMvc
@TestPropertySource(properties = { "app.demo.email=demo@example.test", "app.demo.password=not-a-real-password" })
class DemoSeederIT extends PostgresIT {

	private static final String DEMO_UID = "demo-owner";
	private static final ZoneId MADRID = ZoneId.of("Europe/Madrid");

	@TestConfiguration(proxyBeanMethods = false)
	static class FakeIdentityConfiguration {

		@Bean
		@Primary
		FakeIdentityProvider fakeIdentityProvider() {
			return new FakeIdentityProvider();
		}

	}

	@Autowired
	private DemoSeeder seeder;

	@Autowired
	private DemoAccount demoAccount;

	@Autowired
	private FakeIdentityProvider identity;

	@Autowired
	private ManagePlanUseCase plans;

	@Autowired
	private CreateReservationUseCase createReservation;

	@Autowired
	private TransactionTemplate transaction;

	@Autowired
	private MockMvc mvc;

	@BeforeEach
	void resetCollaborators() {
		identity.reset();
		demoAccount.setUid(null);
	}

	/** Lo que el visitante ve de cada reserva sembrada, sin ids ni códigos (que cambian en cada restauración). */
	private List<String> reservationSummary() {
		return jdbc.sql("""
				SELECT r.reservation_date || ' ' || s.name || ' mesa ' || t.label || ' x' || r.party_size || ' '
				       || r.customer_name || ' ' || r.customer_phone || ' ' || r.status
				FROM reservation r
				JOIN shift s ON s.id = r.shift_id
				JOIN dining_table t ON t.id = r.table_id
				ORDER BY r.reservation_date, s.start_time, t.label
				""").query(String.class).list();
	}

	private long count(String table) {
		return jdbc.sql("SELECT count(*) FROM " + table).query(Long.class).single();
	}

	private long demoRows() {
		return jdbc.sql("SELECT count(*) FROM restaurant WHERE slug = 'demo'").query(Long.class).single();
	}

	private PlanView demoPlan() {
		return plans.get(DEMO_UID, "demo");
	}

	// --- el plano sembrado ---

	@Test
	void resetCreatesPublishedDemoPlan() throws Exception {
		String uid = seeder.reset();

		assertThat(uid).isEqualTo(DEMO_UID);
		mvc.perform(get("/api/v1/restaurants/demo"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("La Mesa del Puerto"))
			.andExpect(jsonPath("$.theme").value("AZUL"))
			.andExpect(jsonPath("$.bookingMode").value("FREE_CHOICE"))
			.andExpect(jsonPath("$.cancellationDeadlineHours").value(2))
			.andExpect(jsonPath("$.room.shape").value("L"))
			.andExpect(jsonPath("$.room.width").value(1000))
			.andExpect(jsonPath("$.room.height").value(900))
			.andExpect(jsonPath("$.tables.length()").value(9))
			.andExpect(jsonPath("$.shifts.length()").value(2))
			.andExpect(jsonPath("$.shifts[0].name").value("Comida"))
			.andExpect(jsonPath("$.shifts[1].name").value("Cena"));
	}

	@Test
	void resetEnsuresTheDemoUserWithTheConfiguredCredentials() {
		seeder.reset();

		assertThat(identity.ensured()).containsExactly(new FakeIdentityProvider.Ensured(DEMO_UID, "demo@example.test"));
	}

	@Test
	void demoUidIsMarkedDemo() {
		seeder.reset();

		assertThat(demoAccount.isDemo(DEMO_UID)).isTrue();
		assertThat(demoAccount.isDemo("owner-a")).isFalse();
	}

	@Test
	void theSeededAccountKeepsTheDemoRestrictions() {
		seeder.reset();

		assertThatThrownBy(() -> plans.create(DEMO_UID, "otro", "Otro")).isInstanceOf(DemoReadOnlyException.class);
	}

	@Test
	void resetIsIdempotent() {
		seeder.reset();
		long firstPlanId = demoPlan().restaurant().id();
		List<String> firstReservations = reservationSummary();

		seeder.reset();
		seeder.reset();

		assertThat(count("restaurant")).isEqualTo(1);
		assertThat(demoRows()).isEqualTo(1);
		assertThat(demoPlan().restaurant().id()).isNotEqualTo(firstPlanId);
		assertThat(count("dining_table")).isEqualTo(9);
		assertThat(count("shift")).isEqualTo(2);
		assertThat(count("reservation")).isEqualTo(6);
		assertThat(reservationSummary()).isEqualTo(firstReservations);
	}

	@Test
	void resetUndoesOwnerChanges() {
		seeder.reset();
		PlanView seeded = demoPlan();
		List<TableChange> withoutLastTable = seeded.tables()
			.stream()
			.limit(seeded.tables().size() - 1)
			.map(table -> new TableChange(table.id(), table.label(), table.shape(), table.seats(), table.rotation(),
					table.x(), table.y()))
			.toList();
		DiningTable removed = seeded.tables().getLast();
		// La mesa que se quita no tiene reservas; si las tuviera, el propio caso de uso lo rechazaría.
		assertThat(jdbc.sql("SELECT count(*) FROM reservation WHERE table_id = :id")
			.param("id", removed.id())
			.query(Long.class)
			.single()).isZero();
		plans.updateSettings(DEMO_UID, "demo", new PlanSettings("Otro nombre", Theme.NOCHE,
				seeded.restaurant().bookingMode(), 5));
		plans.saveLayout(DEMO_UID, "demo", seeded.restaurant().room(), withoutLastTable);
		assertThat(demoPlan().tables()).hasSize(8);

		seeder.reset();

		PlanView restored = demoPlan();
		assertThat(restored.restaurant().name()).isEqualTo("La Mesa del Puerto");
		assertThat(restored.restaurant().theme()).isEqualTo(Theme.AZUL);
		assertThat(restored.restaurant().cancellationDeadlineHours()).isEqualTo(2);
		assertThat(restored.tables()).hasSize(9);
		assertThat(restored.tables()).extracting(DiningTable::label)
			.containsExactly("1", "2", "3", "4", "5", "6", "7", "8", "9");
		assertThat(count("reservation")).isEqualTo(6);
	}

	// --- las reservas de ejemplo ---

	@Test
	void sixReservationsWithATableAndMixedStatus() {
		seeder.reset();

		assertThat(reservationSummary()).hasSize(6);
		assertThat(jdbc.sql("SELECT count(*) FROM reservation WHERE table_id IS NULL").query(Long.class).single())
			.isZero();
		assertThat(jdbc.sql("SELECT DISTINCT status FROM reservation").query(String.class).list())
			.containsExactlyInAnyOrder("PENDING", "CONFIRMED");
		assertThat(jdbc.sql("SELECT customer_email FROM reservation").query(String.class).list())
			.containsOnlyNulls();
	}

	/**
	 * A cualquier hora (incluida la noche, con el horario de verano y con el día de la zona distinto del UTC) ninguna
	 * reserva cae en un turno que ya empezó ni fuera de los próximos 7 días de Madrid.
	 */
	@ParameterizedTest
	@ValueSource(strings = { "2026-12-01T09:00:00Z", "2026-12-01T13:30:00Z", "2026-12-01T22:50:00Z",
			"2026-07-15T19:30:00Z", "2026-07-15T22:10:00Z", "2026-03-28T23:30:00Z" })
	void reservationsAreInTheNextSevenDaysAndNeverOnAShiftThatHasStarted(String instant) {
		clock.set(Instant.parse(instant));
		LocalDate today = LocalDate.ofInstant(clock.instant(), MADRID);

		seeder.reset();

		List<Reservation> seeded = reservations.findActiveFrom(demoPlan().restaurant().id(), today);
		assertThat(seeded).hasSize(6);
		List<Shift> shiftList = demoPlan().shifts();
		for (Reservation reservation : seeded) {
			assertThat(reservation.date()).isBetween(today, today.plusDays(6));
			Shift shift = shiftList.stream()
				.filter(candidate -> candidate.id() == reservation.shiftId())
				.findFirst()
				.orElseThrow();
			assertThat(shift.startsAt(reservation.date(), MADRID)).isAfter(clock.instant());
		}
	}

	// --- filas heredadas y borradas ---

	@Test
	void resetReplacesLegacyDemoRow() {
		long legacyId = insertLegacyDemoRow("NULL");

		seeder.reset();

		assertThat(demoRows()).isEqualTo(1);
		assertThat(demoPlan().restaurant().id()).isNotEqualTo(legacyId);
		assertThat(demoPlan().restaurant().ownerUid()).isEqualTo(DEMO_UID);
		assertThat(count("restaurant")).isEqualTo(1);
		assertThat(count("dining_table")).isEqualTo(9);
		assertThat(count("closure")).isZero();
		assertThat(count("reservation")).isEqualTo(6);
	}

	@Test
	void resetReplacesTheDemoSlugEvenWhenAnotherOwnerHoldsIt() {
		insertLegacyDemoRow("'someone-else'");

		seeder.reset();

		assertThat(demoRows()).isEqualTo(1);
		assertThat(demoPlan().restaurant().ownerUid()).isEqualTo(DEMO_UID);
		assertThat(count("restaurant")).isEqualTo(1);
	}

	/** Un plano con mesa, turno, cierre y una reserva, como los dejaba el seed SQL antiguo. */
	private long insertLegacyDemoRow(String ownerUidLiteral) {
		long id = jdbc.sql("""
				INSERT INTO restaurant (slug, name, zone_id, cancellation_deadline_hours, owner_uid)
				VALUES ('demo', 'La Mesa del Puerto', 'Europe/Madrid', 2, %s) RETURNING id
				""".formatted(ownerUidLiteral)).query(Long.class).single();
		long tableId = jdbc.sql("""
				INSERT INTO dining_table (restaurant_id, label, seats, x, y) VALUES (:id, 'M1', 2, 100, 100)
				RETURNING id
				""").param("id", id).query(Long.class).single();
		long shiftId = jdbc.sql("""
				INSERT INTO shift (restaurant_id, name, start_time, end_time, days_of_week)
				VALUES (:id, 'Cena', '20:30', '23:00', '{1,2,3,4,5,6,7}') RETURNING id
				""").param("id", id).query(Long.class).single();
		jdbc.sql("INSERT INTO closure (restaurant_id, date, reason) VALUES (:id, '2026-12-25', 'Navidad')")
			.param("id", id)
			.update();
		jdbc.sql("""
				INSERT INTO reservation (code, restaurant_id, shift_id, table_id, reservation_date, party_size,
				                         customer_name, customer_phone, status)
				VALUES ('OLD0000000000001', :id, :shiftId, :tableId, '2026-12-02', 2, 'Antiguo', '600', 'CONFIRMED')
				""").param("id", id).param("shiftId", shiftId).param("tableId", tableId).update();
		return id;
	}

	@Test
	void resetPhysicallyRemovesTheDemoUidsDeletedPlansAndItsAccountButNotOtherOwners() {
		Restaurant old = givenRestaurant("viejo", DEMO_UID);
		Shift oldShift = givenDinnerShift(old);
		givenReservation(old, oldShift, givenTable(old, "V1", 2), LocalDate.of(2026, 12, 3), 2);
		jdbc.sql("UPDATE restaurant SET deleted_at = now() WHERE id = :id").param("id", old.id()).update();
		jdbc.sql("INSERT INTO owner_account (uid, telegram_chat_id) VALUES (:uid, 4242)")
			.param("uid", DEMO_UID)
			.update();
		Restaurant other = givenRestaurant("otro", "owner-a");
		givenReservation(other, givenDinnerShift(other), givenTable(other, "O1", 2), LocalDate.of(2026, 12, 3), 2);

		seeder.reset();

		assertThat(jdbc.sql("SELECT count(*) FROM restaurant WHERE slug = 'viejo'").query(Long.class).single())
			.isZero();
		assertThat(jdbc.sql("SELECT count(*) FROM owner_account WHERE uid = :uid")
			.param("uid", DEMO_UID)
			.query(Long.class)
			.single()).isZero();
		assertThat(restaurants.findBySlug("otro")).isPresent();
		assertThat(jdbc.sql("SELECT count(*) FROM reservation WHERE restaurant_id = :id")
			.param("id", other.id())
			.query(Long.class)
			.single()).isEqualTo(1);
		assertThat(demoRows()).isEqualTo(1);
		assertThat(count("restaurant")).isEqualTo(2);
	}

	// --- el tope de planos creados no frena la restauración ---

	@Test
	void repeatedResetsNeverBlockTheNextOne() {
		for (int i = 0; i < PlanService.MAX_PLANS_CREATED_PER_WINDOW + 3; i++) {
			seeder.reset();
		}
		clock.set(clock.instant().plus(PlanService.CREATION_WINDOW));
		seeder.reset();
		clock.set(clock.instant().plus(Duration.ofMinutes(1)));
		seeder.reset();

		assertThat(demoRows()).isEqualTo(1);
		assertThat(restaurants.countCreatedAfter(DEMO_UID, Instant.EPOCH)).isEqualTo(1);
		assertThat(count("reservation")).isEqualTo(6);
	}

	// --- fallos ---

	@Test
	void identityFailureLeavesThePreviousStateAndStillMarksTheDemoAccount() {
		seeder.reset();
		plans.updateSettings(DEMO_UID, "demo", new PlanSettings("La Mesa del Puerto", Theme.NOCHE,
				demoPlan().restaurant().bookingMode(), 2));
		long planId = demoPlan().restaurant().id();
		demoAccount.setUid(null);
		identity.failEnsureWith(new IdentityProviderException("ensureUser", "UNAVAILABLE, UNKNOWN"));

		assertThatThrownBy(seeder::reset).isInstanceOf(IdentityProviderException.class)
			.hasMessageContaining("ensureUser");

		assertThat(demoPlan().restaurant().id()).isEqualTo(planId);
		assertThat(demoPlan().restaurant().theme()).isEqualTo(Theme.NOCHE);
		// Aunque falle, la cuenta sigue restringida: si ya existe en el proveedor, no puede borrarse a sí misma.
		assertThat(demoAccount.isDemo(DEMO_UID)).isTrue();
	}

	/** Un fallo a mitad de la restauración (aquí al confirmar una reserva) deja el estado anterior entero. */
	@Test
	void failureHalfwayRollsBackToThePreviousState() {
		seeder.reset();
		long planId = demoPlan().restaurant().id();
		List<String> before = reservationSummary();
		jdbc.sql("ALTER TABLE reservation ADD CONSTRAINT demo_reset_boom CHECK (status <> 'CONFIRMED') NOT VALID")
			.update();
		try {
			assertThatThrownBy(seeder::reset).isInstanceOf(RuntimeException.class);
		}
		finally {
			jdbc.sql("ALTER TABLE reservation DROP CONSTRAINT demo_reset_boom").update();
		}

		assertThat(count("restaurant")).isEqualTo(1);
		assertThat(demoPlan().restaurant().id()).isEqualTo(planId);
		assertThat(count("dining_table")).isEqualTo(9);
		assertThat(reservationSummary()).isEqualTo(before);
	}

	// --- concurrencia con los visitantes ---

	/**
	 * El visitante y la restauración esperan a la vez el bloqueo del plano que otra transacción tiene tomado. La
	 * restauración, que llegó primero, lo borra al ganarlo; el visitante, que ya había leído el plano viejo, debe acabar
	 * con un error de dominio de "no existe", nunca con un 500.
	 */
	private Throwable visitorWaitingBehindAReset(Callable<?> visitorAction) throws Exception {
		long planId = demoPlan().restaurant().id();
		CountDownLatch holding = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		try (ExecutorService executor = Executors.newFixedThreadPool(3)) {
			Future<?> holder = executor.submit(() -> transaction.executeWithoutResult(status -> {
				restaurants.lock(planId);
				holding.countDown();
				await(release);
			}));
			holding.await();
			Future<String> reset = executor.submit(seeder::reset);
			awaitWaitingSessions(1);
			Future<?> visitor = executor.submit(visitorAction);
			awaitWaitingSessions(2);

			release.countDown();
			holder.get();
			assertThat(reset.get()).isEqualTo(DEMO_UID);
			try {
				visitor.get();
				return null;
			}
			catch (ExecutionException failure) {
				return failure.getCause();
			}
		}
	}

	private static void await(CountDownLatch latch) {
		try {
			latch.await();
		}
		catch (InterruptedException interrupted) {
			Thread.currentThread().interrupt();
		}
	}

	private void awaitWaitingSessions(int expected) {
		Awaitility.await()
			.atMost(Duration.ofSeconds(10))
			.until(() -> jdbc.sql("""
					SELECT count(*) FROM pg_stat_activity
					WHERE datname = current_database() AND wait_event_type = 'Lock'
					""").query(Long.class).single() >= expected);
	}

	@Test
	void publicReservationWaitingBehindAResetEndsAsNotFound() throws Exception {
		seeder.reset();
		PlanView plan = demoPlan();
		CreateReservationCommand command = new CreateReservationCommand(LocalDate.of(2026, 12, 8),
				plan.shifts().getFirst().id(), 2, "Visitante", "600000099", null, plan.tables().getFirst().id());

		Throwable outcome = visitorWaitingBehindAReset(() -> createReservation.create("demo", command));

		assertThat(outcome).isInstanceOf(RestaurantNotFoundException.class);
		assertThat(((DomainException) outcome).kind()).isEqualTo(ErrorKind.NOT_FOUND);
		assertThat(demoRows()).isEqualTo(1);
		assertThat(count("reservation")).isEqualTo(6);
		assertThat(jdbc.sql("SELECT count(*) FROM reservation WHERE customer_name = 'Visitante'")
			.query(Long.class)
			.single()).isZero();
	}

	@Test
	void ownerEditWaitingBehindAResetEndsAsNotFound() throws Exception {
		seeder.reset();
		PlanView plan = demoPlan();
		List<TableChange> sameTables = plan.tables()
			.stream()
			.map(table -> new TableChange(table.id(), table.label(), table.shape(), table.seats(), table.rotation(),
					table.x(), table.y()))
			.toList();

		Throwable outcome = visitorWaitingBehindAReset(
				() -> plans.saveLayout(DEMO_UID, "demo", plan.restaurant().room(), sameTables));

		assertThat(outcome).isInstanceOf(RestaurantNotFoundException.class);
		assertThat(count("restaurant")).isEqualTo(1);
		assertThat(count("dining_table")).isEqualTo(9);
		assertThat(count("reservation")).isEqualTo(6);
	}

	/**
	 * Restauración y reserva pública lanzadas a la vez, sin orden forzado: sea cual sea el entrelazado, la reserva se
	 * completa antes (y la restauración se la lleva por delante) o falla con un error de dominio de "no existe" o de
	 * conflicto. El resultado final es siempre el plano entero y sus 6 reservas.
	 */
	@Test
	void resetAndPublicReservationAtTheSameTimeLeaveACoherentPlan() throws Exception {
		seeder.reset();
		for (int round = 0; round < 6; round++) {
			PlanView plan = demoPlan();
			CreateReservationCommand command = new CreateReservationCommand(LocalDate.of(2026, 12, 9),
					plan.shifts().getLast().id(), 2, "Visitante", "600000099", null, plan.tables().getLast().id());
			CountDownLatch start = new CountDownLatch(1);
			try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
				Future<String> reset = executor.submit(() -> {
					start.await();
					return seeder.reset();
				});
				Future<Reservation> visitor = executor.submit(() -> {
					start.await();
					return createReservation.create("demo", command);
				});
				start.countDown();

				assertThat(reset.get()).isEqualTo(DEMO_UID);
				try {
					Reservation created = visitor.get();
					assertThat(reservations.findByCode(created.code())).isEmpty();
				}
				catch (ExecutionException failure) {
					assertThat(failure.getCause()).isInstanceOf(DomainException.class);
					assertThat(((DomainException) failure.getCause()).kind()).isIn(ErrorKind.NOT_FOUND,
							ErrorKind.CONFLICT);
				}
			}
			assertThat(count("restaurant")).isEqualTo(1);
			assertThat(count("dining_table")).isEqualTo(9);
			assertThat(count("shift")).isEqualTo(2);
			assertThat(count("reservation")).isEqualTo(6);
			assertThat(jdbc.sql("SELECT count(*) FROM reservation WHERE customer_name = 'Visitante'")
				.query(Long.class)
				.single()).isZero();
		}
	}

}
