package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.github.manuelcarro97.reservas.application.port.in.AdminReservation;
import io.github.manuelcarro97.reservas.application.port.in.CreateReservationCommand;
import io.github.manuelcarro97.reservas.application.port.in.CreateReservationUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ManageReservationUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ManagePlanUseCase;
import io.github.manuelcarro97.reservas.application.port.in.PlanView;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/**
 * Cualquiera puede reservar en el plano público de la demo, y el panel de la cuenta demo también es público (las
 * credenciales están en el README): los datos de contacto de los visitantes no deben salir por el panel. Las reservas
 * que siembra el seeder, con teléfonos ficticios, sí se ven completas.
 */
class DemoPanelPrivacyIT extends PostgresIT {

	private static final String DEMO_UID = "demo-owner";
	private static final LocalDate VISITOR_DATE = LocalDate.of(2026, 12, 8);

	@Autowired
	private DemoSeeder seeder;

	@Autowired
	private ManagePlanUseCase plans;

	@Autowired
	private CreateReservationUseCase createReservation;

	@Autowired
	private ManageReservationUseCase manageReservations;

	@Autowired
	private DemoAccount demoAccount;

	@BeforeEach
	void resetDemoAccount() {
		demoAccount.setUid(null);
	}

	private void visitorBooksOnTheDemoPlan() {
		seeder.reset();
		PlanView plan = plans.get(DEMO_UID, "demo");
		DiningTable freeTable = plan.tables().stream().filter(table -> table.label().equals("9")).findFirst().orElseThrow();
		createReservation.create("demo", new CreateReservationCommand(VISITOR_DATE, plan.shifts().getLast().id(), 2,
				"Visitante Real", "611 222 333", "visitante@example.com", freeTable.id()));
	}

	@Test
	void demoPanelMasksPhoneAndEmailOfVisitorsInTheDayList() {
		visitorBooksOnTheDemoPlan();

		List<AdminReservation> day = manageReservations.list(DEMO_UID, "demo", VISITOR_DATE);

		AdminReservation visitor = day.stream()
			.filter(reservation -> reservation.customerName().equals("Visitante Real"))
			.findFirst()
			.orElseThrow();
		assertThat(visitor.customerPhone()).isEqualTo("•••33").doesNotContain("611", "222");
		assertThat(visitor.customerEmail()).isNull();
	}

	@Test
	void demoPanelMasksPhoneAndEmailOfVisitorsInThePendingList() {
		visitorBooksOnTheDemoPlan();

		AdminReservation visitor = manageReservations.pending(DEMO_UID, "demo")
			.stream()
			.filter(reservation -> reservation.customerName().equals("Visitante Real"))
			.findFirst()
			.orElseThrow();

		assertThat(visitor.customerPhone()).isEqualTo("•••33");
		assertThat(visitor.customerEmail()).isNull();
	}

	@Test
	void demoPanelKeepsTheVisitorNameAndTheOtherFields() {
		visitorBooksOnTheDemoPlan();

		AdminReservation visitor = manageReservations.pending(DEMO_UID, "demo")
			.stream()
			.filter(reservation -> reservation.customerName().equals("Visitante Real"))
			.findFirst()
			.orElseThrow();

		assertThat(visitor.date()).isEqualTo(VISITOR_DATE);
		assertThat(visitor.partySize()).isEqualTo(2);
		assertThat(visitor.tableLabel()).isEqualTo("9");
	}

	@Test
	void demoPanelShowsSeededReservationsInFull() {
		visitorBooksOnTheDemoPlan();

		List<AdminReservation> pending = manageReservations.pending(DEMO_UID, "demo");

		assertThat(pending).filteredOn(reservation -> !reservation.customerName().equals("Visitante Real"))
			.isNotEmpty()
			.allSatisfy(seeded -> assertThat(seeded.customerPhone()).matches("600 000 00\\d"));
	}

	@Test
	void ownerOfAnotherPlanSeesEverything() {
		seeder.reset();
		Restaurant plan = givenRestaurant("bar-de-ana", "owner-b");
		Shift shift = givenDinnerShift(plan);
		DiningTable table = givenTable(plan, "1", 4);
		givenReservation(plan, shift, table, LocalDate.of(2026, 12, 2), 2);

		List<AdminReservation> day = manageReservations.list("owner-b", "bar-de-ana", LocalDate.of(2026, 12, 2));

		assertThat(day).singleElement().satisfies(reservation -> {
			assertThat(reservation.customerPhone()).isEqualTo("600000000");
		});
	}

	@Test
	void anotherOwnerKeepsTheEmailToo() {
		Restaurant plan = givenRestaurant("bar-de-luis", "owner-b");
		Shift shift = givenDinnerShift(plan);
		DiningTable table = givenTable(plan, "1", 4);
		createReservation.create("bar-de-luis", new CreateReservationCommand(LocalDate.of(2026, 12, 2), shift.id(), 2,
				"Cliente", "611 222 333", "cliente@example.com", table.id()));

		AdminReservation reservation = manageReservations.list("owner-b", "bar-de-luis", LocalDate.of(2026, 12, 2))
			.getFirst();

		assertThat(reservation.customerPhone()).isEqualTo("611 222 333");
		assertThat(reservation.customerEmail()).isEqualTo("cliente@example.com");
	}

}
