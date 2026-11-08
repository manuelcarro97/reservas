package io.github.manuelcarro97.reservas.application.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import io.github.manuelcarro97.reservas.application.port.in.CreateReservationCommand;
import io.github.manuelcarro97.reservas.application.port.in.CreateReservationUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ManageReservationUseCase;
import io.github.manuelcarro97.reservas.application.port.in.PlanView;
import io.github.manuelcarro97.reservas.application.port.in.ResetDemoUseCase;
import io.github.manuelcarro97.reservas.application.port.in.TableChange;
import io.github.manuelcarro97.reservas.application.port.out.DemoDataCleanerPort;
import io.github.manuelcarro97.reservas.application.port.out.IdentityProviderException;
import io.github.manuelcarro97.reservas.application.port.out.IdentityProviderPort;
import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.RoomLayout;
import io.github.manuelcarro97.reservas.domain.model.RoomShape;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.domain.model.TableShape;
import io.github.manuelcarro97.reservas.domain.service.ArrivalPolicy;

/**
 * Siembra la cuenta demo y su plano. El plano se crea por {@link PlanService#createUnrestricted}, que no es de
 * {@link io.github.manuelcarro97.reservas.application.port.in.ManagePlanUseCase} y por eso no llega a la API: la demo
 * no puede crear planos. Después todo pasa por los casos de uso de siempre (el mismo {@code saveLayout} con su
 * validador, {@code publish}, el alta pública de reservas y la confirmación del dueño), así que el seed no puede dejar
 * un plano que esos casos de uso rechazarían.
 * <p>
 * La llamada al proveedor de identidad va fuera de la transacción de la base de datos, que tiene bloqueos tomados y no
 * debe esperar una llamada de red. Si falla, se registra y la base de datos se restaura igualmente. Dentro, cada paso se une a esa misma transacción: si algo falla no queda nada a
 * medias. Nada aquí captura excepciones dentro de la transacción: tras un error de la base de datos ya no sirve.
 */
@Service
class DemoSeeder implements ResetDemoUseCase {

	private static final Logger log = LoggerFactory.getLogger(DemoSeeder.class);

	static final String PLAN_NAME = "La Mesa del Puerto";

	/** Local en L; las 9 mesas son las de la referencia visual, validadas con el margen de pared real. */
	private static final RoomLayout ROOM = new RoomLayout(RoomShape.L, 1000, 900, 480, 480, 0);

	private static final List<TableChange> TABLES = List.of(square("1", 4, 0, 130, 200),
			square("2", 4, 0, 130, 420), square("3", 4, 0, 130, 640), square("4", 2, 0, 380, 180),
			square("5", 4, 90, 620, 130), square("6", 4, 90, 830, 130), round("7", 4, 730, 300),
			round("8", 6, 360, 560), round("9", 2, 360, 810));

	/** Días, contando hoy, en los que caen las reservas de ejemplo. */
	private static final int SAMPLE_DAYS = 7;

	/**
	 * Nombres y teléfonos de mentira. Ninguna usa la última mesa ("9"): la demo debe tener una libre, y un visitante
	 * que la quite del plano no encuentra reservas que se lo impidan.
	 */
	private static final List<SampleReservation> SAMPLES = List.of(
			new SampleReservation("4", 2, "Ana Demo", "600 000 001", true),
			new SampleReservation("1", 4, "Luis Ejemplo", "600 000 002", false),
			new SampleReservation("5", 3, "Marta Prueba", "600 000 003", true),
			new SampleReservation("6", 2, "Pedro Ficticio", "600 000 004", false),
			new SampleReservation("8", 6, "Lucía Muestra", "600 000 005", true),
			new SampleReservation("7", 4, "Jorge Simulado", "600 000 006", false));

	private record SampleReservation(String tableLabel, int partySize, String name, String phone,
			boolean confirmed) {
	}

	/**
	 * Si el teléfono es uno de los ficticios de las reservas de ejemplo. Es lo que distingue, en el panel de la demo,
	 * una reserva sembrada de la de un visitante: el seeder no guarda email, así que no hay otro dato que comparar, y
	 * un visitante que copie uno de estos números solo ve un teléfono de mentira y público.
	 */
	static boolean isSamplePhone(String phone) {
		return SAMPLES.stream().anyMatch(sample -> sample.phone().equals(phone));
	}

	private record Slot(LocalDate date, Shift shift) {
	}

	private final ArrivalPolicy arrivalPolicy = new ArrivalPolicy();
	private final PlanService plans;
	private final CreateReservationUseCase createReservation;
	private final ManageReservationUseCase manageReservations;
	private final RestaurantRepositoryPort restaurants;
	private final DemoDataCleanerPort cleaner;
	private final IdentityProviderPort identityProvider;
	private final DemoAccount demoAccount;
	private final TransactionTemplate transaction;
	private final Clock clock;
	private final boolean enabled;
	private final String ownerUid;
	private final String email;
	private final String password;

	DemoSeeder(PlanService plans, CreateReservationUseCase createReservation,
			ManageReservationUseCase manageReservations, RestaurantRepositoryPort restaurants,
			DemoDataCleanerPort cleaner, IdentityProviderPort identityProvider, DemoAccount demoAccount,
			TransactionTemplate transaction, Clock clock, @Value("${app.demo.enabled}") boolean enabled,
			@Value("${app.demo.uid}") String ownerUid, @Value("${app.demo.email}") String email,
			@Value("${app.demo.password}") String password) {
		this.plans = plans;
		this.createReservation = createReservation;
		this.manageReservations = manageReservations;
		this.restaurants = restaurants;
		this.cleaner = cleaner;
		this.identityProvider = identityProvider;
		this.demoAccount = demoAccount;
		this.transaction = transaction;
		this.clock = clock;
		this.enabled = enabled;
		this.ownerUid = ownerUid;
		this.email = email;
		this.password = password;
	}

	/** Con la demo activada, la cuenta queda restringida desde que arranca la aplicación, antes de la primera restauración. */
	@PostConstruct
	void markDemoAccountWhenEnabled() {
		if (enabled) {
			demoAccount.setUid(ownerUid);
		}
	}

	@Override
	public String reset() {
		// Antes que nada y aunque lo siguiente falle: si la cuenta ya existe en el proveedor no puede borrarse a sí misma.
		demoAccount.setUid(ownerUid);
		ensureAccount();
		transaction.executeWithoutResult(status -> restore());
		log.info("Demo plan restored");
		return ownerUid;
	}

	/**
	 * Sin credenciales configuradas (el perfil demo en local, sin Firebase) se siembra igualmente el plano y la cuenta
	 * no se toca: el proveedor de identidad no admite un email o una contraseña vacíos.
	 */
	private void ensureAccount() {
		if (!StringUtils.hasText(email) || !StringUtils.hasText(password)) {
			log.warn("Demo account credentials are not configured (DEMO_EMAIL, DEMO_PASSWORD): the account is not ensured");
			return;
		}
		// Los datos de la demo no dependen del proveedor de identidad: si falla, la base de datos se restaura igualmente
		// (si no, la demo pública quedaría sucia hasta la noche siguiente) y el fallo se registra aparte.
		try {
			identityProvider.ensureUser(ownerUid, email, password);
		}
		catch (IdentityProviderException failure) {
			// Su mensaje es seguro por contrato: operación y códigos enumerados.
			log.warn("Demo account provisioning failed for uid {}: {}", ownerUid, failure.getMessage());
		}
		catch (RuntimeException failure) {
			// Nunca el mensaje: el de una librería externa puede traer datos de la cuenta de servicio.
			StackTraceElement[] frames = failure.getStackTrace();
			log.warn("Demo account provisioning failed for uid {}: {} at {}", ownerUid, failure.getClass().getName(),
					frames.length > 0 ? frames[0] : "unknown");
		}
	}

	private void restore() {
		cleaner.wipe(ownerUid, DemoAccount.PLAN_SLUG);
		plans.createUnrestricted(ownerUid, DemoAccount.PLAN_SLUG, PLAN_NAME);
		// Cambiar la forma devuelve el plano a borrador: se publica después, y antes de reservar.
		plans.saveLayout(ownerUid, DemoAccount.PLAN_SLUG, ROOM, TABLES);
		plans.publish(ownerUid, DemoAccount.PLAN_SLUG);
		bookSamples(plans.get(ownerUid, DemoAccount.PLAN_SLUG));
	}

	private void bookSamples(PlanView plan) {
		Map<String, Long> tableIds = new HashMap<>();
		for (DiningTable table : plan.tables()) {
			tableIds.put(table.label(), table.id());
		}
		List<Slot> slots = openSlots(plan);
		// Repartidas por todo el rango y alternando comida y cena (los huecos van en pares día-turno): la agenda de la
		// demo no se ve vacía ni apelotonada. Cada reserva lleva una mesa distinta, así que un hueco repetido no choca.
		int step = Math.max(1, slots.size() / SAMPLES.size());
		for (int i = 0; i < SAMPLES.size(); i++) {
			SampleReservation sample = SAMPLES.get(i);
			Slot slot = slots.get(Math.min(slots.size() - 1, i * step + i % 2));
			// Una hora de la rejilla del turno, distinta según la reserva para que la agenda no sea toda a la misma hora.
			List<LocalTime> arrivalSlots = arrivalPolicy.arrivalSlots(slot.shift());
			LocalTime arrivalTime = arrivalSlots.get(i % arrivalSlots.size());
			Reservation created = createReservation.create(DemoAccount.PLAN_SLUG,
					new CreateReservationCommand(slot.date(), slot.shift().id(), sample.partySize(), sample.name(),
							sample.phone(), null, tableIds.get(sample.tableLabel()), arrivalTime));
			if (sample.confirmed()) {
				manageReservations.confirm(ownerUid, created.id());
			}
		}
	}

	/**
	 * Fecha y turno de los próximos {@value #SAMPLE_DAYS} días, con "hoy" en la zona del plano, que admiten una reserva
	 * ahora: el turno no ha empezado, abre ese día y el día no está cerrado. Un turno rechazado por el alta de reservas
	 * abortaría toda la restauración, así que aquí se descartan de antemano.
	 */
	private List<Slot> openSlots(PlanView plan) {
		Restaurant restaurant = plan.restaurant();
		Instant now = clock.instant();
		LocalDate today = LocalDate.ofInstant(now, restaurant.zone());
		List<Slot> slots = new ArrayList<>();
		for (int offset = 0; offset < SAMPLE_DAYS; offset++) {
			LocalDate date = today.plusDays(offset);
			boolean closed = restaurants.isClosed(restaurant.id(), date);
			for (Shift shift : plan.shifts()) {
				if (!closed && shift.opensOn(date) && shift.startsAt(date, restaurant.zone()).isAfter(now)) {
					slots.add(new Slot(date, shift));
				}
			}
		}
		return slots;
	}

	private static TableChange square(String label, int seats, int rotation, int x, int y) {
		return new TableChange(null, label, TableShape.SQUARE, seats, rotation, x, y);
	}

	private static TableChange round(String label, int seats, int x, int y) {
		return new TableChange(null, label, TableShape.ROUND, seats, 0, x, y);
	}

}
