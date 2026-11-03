package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

import io.github.manuelcarro97.reservas.application.port.out.NotificationPort;
import io.github.manuelcarro97.reservas.domain.model.BookingMode;
import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.AuthRequests;
import io.github.manuelcarro97.reservas.support.MutableClock;
import io.github.manuelcarro97.reservas.support.PostgresIT;

/**
 * Avisos al dueño: el feed del panel y el puerto de avisos. La frontera entre dueños del feed no cabe en la tabla de
 * {@code OwnershipIT} (allí el ajeno recibe 404; el feed es por dueño y al ajeno le da 200 con su lista, vacía): la
 * cubren {@link #feedOnlyShowsMyPlans()} y {@link #ownerWithoutPlansGetsEmptyFeed()}.
 * <p>
 * Los avisos salen en segundo plano: lo que se espera se verifica con {@code timeout}. Lo que no debe salir no se
 * puede esperar sin más (pasaría en vacío): se manda después una reserva marcador, que el hilo de avisos entrega por
 * orden, y se comprueba que no ha llegado nada más.
 */
@AutoConfigureMockMvc
class FeedApiIT extends PostgresIT {

	private static final String DATE = "2026-12-02";
	private static final String FEED = "/api/v1/admin/feed";
	private static final Instant BEFORE_START = MutableClock.START.minusSeconds(60);
	private static final long WAIT_MS = 5000;

	@Autowired
	private MockMvc mvc;

	@MockitoBean
	private NotificationPort notifications;

	private Restaurant restaurant;
	private Shift shift;
	private DiningTable table;

	@BeforeEach
	void seed() {
		restaurant = givenRestaurant("demo");
		shift = givenDinnerShift(restaurant);
		table = givenTable(restaurant, "M2", 2);
	}

	private ResultActions book(String slug, Shift onShift, DiningTable onTable) throws Exception {
		return mvc.perform(post("/api/v1/restaurants/" + slug + "/reservations").contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"date":"%s","shiftId":%d,"partySize":2,"customerName":"Ana","customerPhone":"600000000",
					 "customerEmail":"ana@example.com"%s}
					""".formatted(DATE, onShift.id(), onTable == null ? "" : ",\"tableId\":" + onTable.id())));
	}

	private String bookAndGetCode() throws Exception {
		String response = book("demo", shift, table).andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(response, "$.code");
	}

	/** Espera a que el puerto haya recibido exactamente {@code count} avisos. */
	private void awaitNotifications(int count) {
		verify(notifications, timeout(WAIT_MS).times(count)).notifyOwner(any(), any());
	}

	/** Reserva en otra mesa cuyo aviso llega el último: cuando llega, los anteriores ya se entregaron. */
	private void bookMarkerAndAwaitItsNotification() throws Exception {
		book("demo", shift, givenTable(restaurant, "MARCADOR", 2)).andExpect(status().isCreated());
		verify(notifications, timeout(WAIT_MS)).notifyOwner(eq("owner-a"), contains("mesa MARCADOR"));
	}

	private ResultActions feed(String ownerUid, Instant since) throws Exception {
		return mvc.perform(get(FEED).param("since", since.toString()).with(AuthRequests.owner(ownerUid)));
	}

	@Test
	void newReservationAppearsInFeed() throws Exception {
		String code = bookAndGetCode();

		feed("owner-a", BEFORE_START).andExpect(status().isOk())
			.andExpect(jsonPath("$.now").value(MutableClock.START.toString()))
			.andExpect(jsonPath("$.events", hasSize(1)))
			.andExpect(jsonPath("$.events[0].kind").value("NEW"))
			.andExpect(jsonPath("$.events[0].code").value(code))
			.andExpect(jsonPath("$.events[0].restaurantSlug").value("demo"))
			.andExpect(jsonPath("$.events[0].restaurantName").value("demo"))
			.andExpect(jsonPath("$.events[0].customerName").value("Ana"))
			.andExpect(jsonPath("$.events[0].partySize").value(2))
			.andExpect(jsonPath("$.events[0].date").value(DATE))
			.andExpect(jsonPath("$.events[0].shiftName").value("Cena"))
			.andExpect(jsonPath("$.events[0].tableLabel").value("M2"))
			.andExpect(jsonPath("$.events[0].at").value(MutableClock.START.toString()))
			.andExpect(jsonPath("$.events[0].text")
				.value("[demo] Nueva reserva: Ana, 2 personas, cena del miércoles 2, mesa M2"))
			// Ni teléfono, ni email, ni dueño en la respuesta.
			.andExpect(content().string(not(containsString("600000000"))))
			.andExpect(content().string(not(containsString("ana@example.com"))))
			.andExpect(content().string(not(containsString("owner-a"))));
	}

	@Test
	void reservationWithoutTableSaysSinMesa() throws Exception {
		givenBookingMode(restaurant, BookingMode.ASSIGNED);
		book("demo", shift, null).andExpect(status().isCreated());

		feed("owner-a", BEFORE_START).andExpect(jsonPath("$.events", hasSize(1)))
			.andExpect(jsonPath("$.events[0].tableLabel").doesNotExist())
			.andExpect(jsonPath("$.events[0].text")
				.value("[demo] Nueva reserva: Ana, 2 personas, cena del miércoles 2, sin mesa"));
	}

	@Test
	void customerCancellationAppearsInFeed() throws Exception {
		String code = bookAndGetCode();
		clock.set(MutableClock.START.plusSeconds(120));
		mvc.perform(post("/api/v1/reservations/" + code + "/cancel")).andExpect(status().isOk());

		feed("owner-a", BEFORE_START).andExpect(status().isOk())
			.andExpect(jsonPath("$.events", hasSize(2)))
			.andExpect(jsonPath("$.events[0].kind").value("NEW"))
			.andExpect(jsonPath("$.events[1].kind").value("CANCELLED_BY_CUSTOMER"))
			.andExpect(jsonPath("$.events[1].code").value(code))
			.andExpect(jsonPath("$.events[1].at").value(MutableClock.START.plusSeconds(120).toString()))
			.andExpect(jsonPath("$.events[1].text")
				.value("[demo] Reserva cancelada por el cliente: Ana, 2 personas, cena del miércoles 2"));
	}

	@Test
	void ownerCancellationIsNotAnEvent() throws Exception {
		bookAndGetCode();
		long id = jdbc.sql("SELECT id FROM reservation").query(Long.class).single();
		mvc.perform(post("/api/v1/admin/reservations/" + id + "/cancel").with(AuthRequests.owner("owner-a")))
			.andExpect(status().isOk());

		feed("owner-a", BEFORE_START).andExpect(jsonPath("$.events", hasSize(1)))
			.andExpect(jsonPath("$.events[0].kind").value("NEW"));
		// Solo el aviso de la reserva y el del marcador: la cancelación del dueño no avisa.
		bookMarkerAndAwaitItsNotification();
		awaitNotifications(2);
	}

	@Test
	void feedOnlyShowsMyPlans() throws Exception {
		Restaurant other = givenRestaurant("otro", "owner-b");
		Shift otherShift = givenDinnerShift(other);
		DiningTable otherTable = givenTable(other, "B1", 2);
		bookAndGetCode();
		book("otro", otherShift, otherTable).andExpect(status().isCreated());

		feed("owner-a", BEFORE_START).andExpect(jsonPath("$.events", hasSize(1)))
			.andExpect(jsonPath("$.events[0].restaurantSlug").value("demo"));
		feed("owner-b", BEFORE_START).andExpect(jsonPath("$.events", hasSize(1)))
			.andExpect(jsonPath("$.events[0].restaurantSlug").value("otro"));
	}

	@Test
	void ownerWithoutPlansGetsEmptyFeed() throws Exception {
		bookAndGetCode();

		feed("owner-c", BEFORE_START).andExpect(status().isOk()).andExpect(jsonPath("$.events", hasSize(0)));
	}

	@Test
	void deletedPlanIsNotInFeed() throws Exception {
		bookAndGetCode();
		jdbc.sql("UPDATE restaurant SET deleted_at = now()").update();

		feed("owner-a", BEFORE_START).andExpect(jsonPath("$.events", hasSize(0)));
	}

	@Test
	void sinceIsClampedTo24Hours() throws Exception {
		Instant now = MutableClock.START;
		clock.set(now.minus(Duration.ofHours(25)));
		givenReservation(restaurant, shift, table, java.time.LocalDate.parse(DATE), 2);
		clock.set(now.minus(Duration.ofHours(23)));
		givenReservation(restaurant, shift, givenTable(restaurant, "M3", 2), java.time.LocalDate.parse(DATE), 2);
		clock.set(now);

		feed("owner-a", now.minus(Duration.ofDays(3))).andExpect(status().isOk())
			.andExpect(jsonPath("$.events", hasSize(1)))
			.andExpect(jsonPath("$.events[0].at").value(now.minus(Duration.ofHours(23)).toString()));
	}

	@Test
	void sinceOverlapsTenSecondsBack() throws Exception {
		bookAndGetCode();
		clock.set(MutableClock.START.plusSeconds(60));

		// Reserva creada en START: entra con since hasta START+10 s (la consulta mira 10 s atrás), no con más.
		feed("owner-a", MutableClock.START.plusSeconds(10)).andExpect(jsonPath("$.events", hasSize(1)));
		feed("owner-a", MutableClock.START.plusSeconds(11)).andExpect(jsonPath("$.events", hasSize(0)));
	}

	@Test
	void futureSinceIsTreatedAsNow() throws Exception {
		bookAndGetCode();
		clock.set(MutableClock.START.plusSeconds(60));

		feed("owner-a", MutableClock.START.plus(Duration.ofDays(2))).andExpect(status().isOk())
			.andExpect(jsonPath("$.now").value(MutableClock.START.plusSeconds(60).toString()))
			.andExpect(jsonPath("$.events", hasSize(0)));
	}

	@Test
	void sinceMissingOrInvalidIs400() throws Exception {
		mvc.perform(get(FEED).with(AuthRequests.owner("owner-a"))).andExpect(status().isBadRequest());
		mvc.perform(get(FEED).param("since", "ayer").with(AuthRequests.owner("owner-a")))
			.andExpect(status().isBadRequest());
	}

	@Test
	void feedRequiresAuthentication() throws Exception {
		mvc.perform(get(FEED).param("since", BEFORE_START.toString())).andExpect(status().isUnauthorized());
	}

	@Test
	void notificationSentAfterCommit() throws Exception {
		bookAndGetCode();

		ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
		verify(notifications, timeout(WAIT_MS).times(1)).notifyOwner(eq("owner-a"), text.capture());
		assertThat(text.getValue()).isEqualTo("[demo] Nueva reserva: Ana, 2 personas, cena del miércoles 2, mesa M2");
	}

	@Test
	void cancellationNotificationSent() throws Exception {
		String code = bookAndGetCode();

		mvc.perform(post("/api/v1/reservations/" + code + "/cancel")).andExpect(status().isOk());

		ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
		verify(notifications, timeout(WAIT_MS).times(2)).notifyOwner(eq("owner-a"), text.capture());
		assertThat(text.getAllValues().get(1))
			.isEqualTo("[demo] Reserva cancelada por el cliente: Ana, 2 personas, cena del miércoles 2");
	}

	@Test
	void noNotificationWhenBookingIsRejected() throws Exception {
		bookAndGetCode();
		awaitNotifications(1);
		clearInvocations(notifications);

		// La mesa ya está cogida: 409 y rollback, sin aviso.
		book("demo", shift, table).andExpect(status().isConflict());
		// Grupo mayor que la mesa: 422, sin aviso.
		mvc.perform(post("/api/v1/restaurants/demo/reservations").contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"date":"%s","shiftId":%d,"partySize":3,"customerName":"Ana","customerPhone":"600000000",
					 "tableId":%d}
					""".formatted(DATE, shift.id(), table.id()))).andExpect(status().is4xxClientError());

		bookMarkerAndAwaitItsNotification();
		// Solo el marcador: los dos rechazos no avisaron.
		verifyNoMoreInteractions(notifications);
	}

	@Test
	void noNotificationWhenCancellationIsRejected() throws Exception {
		String code = bookAndGetCode();
		awaitNotifications(1);
		clearInvocations(notifications);
		clock.set(Instant.parse("2026-12-02T18:30:00Z"));

		mvc.perform(post("/api/v1/reservations/" + code + "/cancel")).andExpect(status().isConflict());

		// Con el reloj ya pasado el plazo no se puede reservar otro marcador: se deja un margen para que llegara.
		verify(notifications, after(500).never()).notifyOwner(any(), any());
	}

	@Test
	void failedNotificationDoesNotBreakBooking() throws Exception {
		doThrow(new IllegalStateException("telegram caído")).when(notifications).notifyOwner(any(), any());

		book("demo", shift, table).andExpect(status().isCreated());

		// Se intentó el aviso (si el listener no se invocara, el test no probaría nada).
		verify(notifications, timeout(WAIT_MS)).notifyOwner(any(), any());
		assertThat(jdbc.sql("SELECT count(*) FROM reservation").query(Long.class).single()).isEqualTo(1L);
	}

	@Test
	void failedNotificationDoesNotBreakCancellation() throws Exception {
		String code = bookAndGetCode();
		awaitNotifications(1);
		clearInvocations(notifications);
		doThrow(new IllegalStateException("telegram caído")).when(notifications).notifyOwner(any(), any());

		mvc.perform(post("/api/v1/reservations/" + code + "/cancel")).andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("CANCELLED"));

		// Se intentó el aviso de cancelación (el de la reserva ya se descartó arriba).
		verify(notifications, timeout(WAIT_MS)).notifyOwner(any(), any());
	}

	/** Una llamada lenta a Telegram no retrasa la respuesta al cliente: el aviso sale en otro hilo. */
	@Test
	void slowNotificationDoesNotDelayTheResponse() throws Exception {
		CountDownLatch release = new CountDownLatch(1);
		CountDownLatch finished = new CountDownLatch(1);
		AtomicReference<String> notifyingThread = new AtomicReference<>();
		doAnswer(invocation -> {
			notifyingThread.set(Thread.currentThread().getName());
			// El canal tarda hasta que el test lo libera (como mucho 10 s).
			release.await(10, TimeUnit.SECONDS);
			finished.countDown();
			return null;
		}).when(notifications).notifyOwner(any(), any());

		try {
			long start = System.nanoTime();
			book("demo", shift, table).andExpect(status().isCreated());
			Duration elapsed = Duration.ofNanos(System.nanoTime() - start);

			assertThat(elapsed).isLessThan(Duration.ofSeconds(2));
			// El aviso sí se está enviando, en el hilo propio de avisos y no en el de la petición.
			Awaitility.await().atMost(Duration.ofSeconds(5)).until(() -> notifyingThread.get() != null);
			assertThat(notifyingThread.get()).startsWith("owner-alert-");
		}
		finally {
			release.countDown();
		}
		assertThat(finished.await(5, TimeUnit.SECONDS)).isTrue();
	}

}
