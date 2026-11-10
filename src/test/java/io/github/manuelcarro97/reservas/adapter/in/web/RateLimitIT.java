package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.jayway.jsonpath.JsonPath;

import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;
import io.github.manuelcarro97.reservas.support.MutableClock;
import io.github.manuelcarro97.reservas.support.PostgresIT;

@AutoConfigureMockMvc
class RateLimitIT extends PostgresIT {

	private static final String BOOKINGS = "/api/v1/restaurants/demo/reservations";
	private static final String LOOKUP = "/api/v1/reservations/NOEXISTE";

	@Autowired
	private MockMvc mvc;

	@Autowired
	private RateLimitFilter rateLimitFilter;

	private static RequestPostProcessor fromIp(String address) {
		return request -> {
			request.setRemoteAddr(address);
			return request;
		};
	}

	/** Cuerpo vacío: llega al controlador y da 400, sin crear nada; lo que cuenta es que el filtro ya contó la petición. */
	private ResultActions booking(RequestPostProcessor from) throws Exception {
		return mvc.perform(post(BOOKINGS).contentType(MediaType.APPLICATION_JSON).content("{}").with(from));
	}

	private ResultActions booking() throws Exception {
		return booking(fromIp("127.0.0.1"));
	}

	private void bookTenTimes() throws Exception {
		for (int i = 0; i < 10; i++) {
			booking().andExpect(status().isBadRequest());
		}
	}

	@Test
	void eleventhBookingFromSameIpReturns429() throws Exception {
		bookTenTimes();

		booking().andExpect(status().isTooManyRequests())
			.andExpect(header().string("Retry-After", "60"))
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.status").value(429))
			.andExpect(jsonPath("$.title").value("Too Many Requests"))
			.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	@Test
	void rateLimitedBodyHasTheSameShapeAsAnyOtherApiError() throws Exception {
		String usual = mvc.perform(get(LOOKUP)).andExpect(status().isNotFound()).andReturn().getResponse()
			.getContentAsString();
		bookTenTimes();

		String limited = booking().andExpect(status().isTooManyRequests()).andReturn().getResponse()
			.getContentAsString();

		// MVC añade además "instance" a los errores de los controladores; el resto de propiedades coincide.
		Map<String, Object> usualProperties = new HashMap<>(JsonPath.<Map<String, Object>>read(usual, "$"));
		usualProperties.remove("instance");
		Map<String, Object> limitedProperties = JsonPath.read(limited, "$");
		assertThat(limitedProperties.keySet()).isEqualTo(usualProperties.keySet());
	}

	@Test
	void rateLimitedResponseCarriesCorsHeadersSoTheBrowserCanReadIt() throws Exception {
		bookTenTimes();

		mvc.perform(post(BOOKINGS).contentType(MediaType.APPLICATION_JSON)
			.content("{}")
			.header("Origin", "http://localhost:4200"))
			.andExpect(status().isTooManyRequests())
			.andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:4200"));
	}

	@Test
	void rateLimitedResponseExposesRetryAfterToBrowsers() throws Exception {
		bookTenTimes();

		mvc.perform(post(BOOKINGS).contentType(MediaType.APPLICATION_JSON)
			.content("{}")
			.header("Origin", "http://localhost:4200"))
			.andExpect(status().isTooManyRequests())
			.andExpect(header().string("Access-Control-Expose-Headers", containsString("Retry-After")));
	}

	@Test
	void retryAfterShrinksAsTheWindowAdvancesAndTheWindowRotates() throws Exception {
		bookTenTimes();

		clock.set(MutableClock.START.plusSeconds(25).plusMillis(100));
		booking().andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After", "35"));

		clock.set(MutableClock.START.plus(Duration.ofMinutes(1)));
		booking().andExpect(status().isBadRequest());
	}

	@Test
	void otherIpIsNotLimited() throws Exception {
		bookTenTimes();
		booking().andExpect(status().isTooManyRequests());

		booking(fromIp("10.0.0.2")).andExpect(status().isBadRequest());
	}

	@Test
	void ipv6AddressesOfTheSame64ShareTheBookingQuota() throws Exception {
		for (int i = 0; i < 10; i++) {
			booking(fromIp("2001:db8:1234:5678::" + Integer.toHexString(i + 1))).andExpect(status().isBadRequest());
		}

		booking(fromIp("2001:db8:1234:5678:aaaa:bbbb:cccc:dddd")).andExpect(status().isTooManyRequests());
	}

	@Test
	void ipv6AddressOfAnother64HasItsOwnQuota() throws Exception {
		for (int i = 0; i < 10; i++) {
			booking(fromIp("2001:db8:1234:5678::1")).andExpect(status().isBadRequest());
		}
		booking(fromIp("2001:db8:1234:5678::1")).andExpect(status().isTooManyRequests());

		booking(fromIp("2001:db8:1234:5679::1")).andExpect(status().isBadRequest());
	}

	// --- cupo diario por IP y plano: solo cuentan las altas que se crean ---

	private Shift demoShift;
	private Shift otherShift;
	private List<DiningTable> demoTables;
	private List<DiningTable> otherTables;
	private int bookingsMade;

	private void seedTwoPlans() {
		Restaurant demo = givenRestaurant("demo");
		demoShift = givenDinnerShift(demo);
		demoTables = IntStream.rangeClosed(1, 12).mapToObj(n -> givenTable(demo, "M" + n, 2)).toList();
		Restaurant other = givenRestaurant("otro");
		otherShift = givenDinnerShift(other);
		otherTables = IntStream.rangeClosed(1, 2).mapToObj(n -> givenTable(other, "X" + n, 2)).toList();
	}

	/** Alta válida en una mesa libre y con un teléfono propio: no choca con el cupo por teléfono ni con TABLE_TAKEN. */
	private ResultActions realBooking(String slug, Shift shift, DiningTable table, RequestPostProcessor from)
			throws Exception {
		String json = """
				{"date":"2026-12-02","shiftId":%d,"arrivalTime":"20:00","partySize":2,"customerName":"Ana","customerPhone":"6000000%02d","tableId":%d}
				""".formatted(shift.id(), ++bookingsMade, table.id());
		return mvc.perform(post("/api/v1/restaurants/" + slug + "/reservations")
			.contentType(MediaType.APPLICATION_JSON)
			.content(json)
			.with(from));
	}

	private void tenRealBookingsInDemo() throws Exception {
		tenRealBookingsInDemoFrom(Duration.ZERO);
	}

	/**
	 * Diez altas reales de la IP por defecto en demo, cinco al empezar {@code offset} y cinco un minuto después, para no
	 * tocar el cupo por minuto. Deja el reloj dos minutos después de {@code offset}.
	 */
	private void tenRealBookingsInDemoFrom(Duration offset) throws Exception {
		for (int i = 0; i < 10; i++) {
			clock.set(MutableClock.START.plus(offset).plus(Duration.ofMinutes(i < 5 ? 0 : 1)));
			realBooking("demo", demoShift, demoTables.get(i), fromIp("127.0.0.1")).andExpect(status().isCreated());
		}
		clock.set(MutableClock.START.plus(offset).plus(Duration.ofMinutes(2)));
	}

	@Test
	void eleventhBookingOfTheDayFromTheSameIpIsRejected() throws Exception {
		seedTwoPlans();
		tenRealBookingsInDemo();

		realBooking("demo", demoShift, demoTables.get(10), fromIp("127.0.0.1")).andExpect(status().isTooManyRequests())
			// El día empezó con la primera alta: quedan 24 h menos los 2 minutos transcurridos.
			.andExpect(header().string("Retry-After", "86280"))
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.status").value(429))
			.andExpect(jsonPath("$.code").value("DAILY_BOOKING_LIMIT"));
		assertThat(jdbc.sql("SELECT count(*) FROM reservation").query(Long.class).single()).isEqualTo(10);
	}

	@Test
	void otherPlanHasItsOwnDailyQuota() throws Exception {
		seedTwoPlans();
		tenRealBookingsInDemo();
		realBooking("demo", demoShift, demoTables.get(10), fromIp("127.0.0.1")).andExpect(status().isTooManyRequests());

		realBooking("otro", otherShift, otherTables.get(0), fromIp("127.0.0.1")).andExpect(status().isCreated());
	}

	@Test
	void otherIpHasItsOwnDailyQuota() throws Exception {
		seedTwoPlans();
		tenRealBookingsInDemo();

		realBooking("demo", demoShift, demoTables.get(10), fromIp("10.0.0.2")).andExpect(status().isCreated());
	}

	@Test
	void dailyQuotaResetsAfter24Hours() throws Exception {
		seedTwoPlans();
		tenRealBookingsInDemo();
		realBooking("demo", demoShift, demoTables.get(10), fromIp("127.0.0.1")).andExpect(status().isTooManyRequests());

		clock.set(MutableClock.START.plus(Duration.ofHours(24)).minusMillis(1));
		realBooking("demo", demoShift, demoTables.get(10), fromIp("127.0.0.1")).andExpect(status().isTooManyRequests());

		clock.set(MutableClock.START.plus(Duration.ofHours(24)));
		realBooking("demo", demoShift, demoTables.get(10), fromIp("127.0.0.1")).andExpect(status().isCreated());
	}

	@Test
	void bookingsThatAreNotCreatedDoNotUseTheDailyQuota() throws Exception {
		seedTwoPlans();
		// 20 intentos fallidos (cuerpo vacío: 400) en dos minutos distintos: no gastan el cupo del día.
		for (int i = 0; i < 10; i++) {
			booking().andExpect(status().isBadRequest());
		}
		clock.set(MutableClock.START.plus(Duration.ofMinutes(1)));
		for (int i = 0; i < 10; i++) {
			booking().andExpect(status().isBadRequest());
		}

		tenRealBookingsInDemoFrom(Duration.ofMinutes(2));
	}

	@Test
	void unknownSlugsLeaveNoDailyKeysBehind() throws Exception {
		for (int i = 0; i < 5; i++) {
			mvc.perform(post("/api/v1/restaurants/inventado-" + i + "/reservations")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{}")).andExpect(status().isBadRequest());
		}

		assertThat(rateLimitFilter.trackedDailyBookingKeys()).isZero();
	}

	@Test
	void forwardedForHeaderDoesNotChangeTheKey() throws Exception {
		// Sin forward-headers-strategy (por defecto none) la IP es la del socket: variar X-Forwarded-For no da cupo nuevo.
		for (int i = 0; i < 10; i++) {
			mvc.perform(post(BOOKINGS).contentType(MediaType.APPLICATION_JSON)
				.content("{}")
				.header("X-Forwarded-For", "9.9.9." + i))
				.andExpect(status().isBadRequest());
		}

		mvc.perform(post(BOOKINGS).contentType(MediaType.APPLICATION_JSON)
			.content("{}")
			.header("X-Forwarded-For", "1.2.3.4"))
			.andExpect(status().isTooManyRequests());
	}

	@Test
	void lookupsAndCancellationsShareThirtyPerMinutePerIp() throws Exception {
		for (int i = 0; i < 15; i++) {
			mvc.perform(get(LOOKUP)).andExpect(status().isNotFound());
			mvc.perform(post(LOOKUP + "/cancel")).andExpect(status().isNotFound());
		}

		mvc.perform(get(LOOKUP)).andExpect(status().isTooManyRequests())
			.andExpect(header().string("Retry-After", "60"))
			.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
		mvc.perform(post(LOOKUP + "/cancel")).andExpect(status().isTooManyRequests());
		mvc.perform(get(LOOKUP).with(fromIp("10.0.0.2"))).andExpect(status().isNotFound());
	}

	@Test
	void bookingsAndLookupsHaveSeparateCounters() throws Exception {
		bookTenTimes();
		booking().andExpect(status().isTooManyRequests());

		mvc.perform(get(LOOKUP)).andExpect(status().isNotFound());
	}

	@Test
	void planOccupancyAndAvailabilityAreNotLimited() throws Exception {
		for (int i = 0; i < 40; i++) {
			mvc.perform(get("/api/v1/restaurants/demo")).andExpect(status().isNotFound());
			mvc.perform(get("/api/v1/restaurants/demo/occupancy").param("date", "2026-12-02").param("shiftId", "1"))
				.andExpect(status().isNotFound());
			mvc.perform(get("/api/v1/restaurants/demo/availability").param("date", "2026-12-02")
				.param("partySize", "2")).andExpect(status().isNotFound());
		}
	}

	@Test
	void adminRoutesAreNotLimited() throws Exception {
		// Sin token son 401: si el filtro las contara, a partir de la 31 serían 429.
		for (int i = 0; i < 40; i++) {
			mvc.perform(get("/api/v1/admin/restaurants")).andExpect(status().isUnauthorized());
			mvc.perform(post("/api/v1/admin/restaurants/1/reservations").contentType(MediaType.APPLICATION_JSON)
				.content("{}")).andExpect(status().isUnauthorized());
		}
	}

}
