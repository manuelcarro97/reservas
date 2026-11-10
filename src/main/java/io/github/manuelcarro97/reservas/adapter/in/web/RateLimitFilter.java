package io.github.manuelcarro97.reservas.adapter.in.web;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;

import org.springframework.http.HttpMethod;
import org.springframework.http.server.PathContainer;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;


/**
 * Límite por IP de los endpoints públicos que escriben o consultan por código: 10 altas de reserva por minuto y 30
 * consultas o cancelaciones por código por minuto. El plano, la ocupación y la disponibilidad no se limitan, ni
 * tampoco la administración (sus escrituras las limita por usuario {@link AdminWriteRateLimitFilter}). Superado el
 * límite responde 429 con la misma forma de error que el resto de la API y la cabecera {@code Retry-After}.
 * <p>
 * Además del cupo por minuto, las altas tienen un cupo diario: 10 reservas creadas en 24 h por IP <em>y plano</em>
 * (código {@code DAILY_BOOKING_LIMIT}, distinto del {@code RATE_LIMITED} del cupo por minuto, para que la web no diga
 * "espera unos segundos" cuando hay que esperar a mañana). Frena que una sola conexión llene las mesas de un local con
 * reservas falsas durante los 90 días de la ventana. Solo cuenta el alta pública (POST de reserva): las consultas y las
 * cancelaciones no.
 * <p>
 * El cupo diario cuenta altas <em>creadas</em>, no intentos: se reserva la unidad antes de ejecutar la petición y se
 * devuelve si la respuesta no es 2xx. Así un 400, un 409 de mesa ocupada o una petición a un plano inexistente no
 * gastan cupo, y quien inventa slugs no puede llenar con claves de 24 h el limitador (que falla cerrado al llegar a su
 * tope, ver {@link FixedWindowRateLimiter#MAX_KEYS}) y dejar sin reservar a los demás durante un día.
 * <p>
 * Limitación aceptada: los contadores viven en memoria de este proceso y se pierden al reiniciar la API (Render la
 * reinicia al dormirla o al desplegar), y con varias instancias cada una cuenta aparte. No se guardan IPs en la base de
 * datos: son datos personales. Es un freno al abuso casual, no una defensa contra quien rota de IP.
 * <p>
 * La IP es {@code getRemoteAddr()} y nunca se lee {@code X-Forwarded-For} a mano: detrás de un proxy el contenedor la
 * resuelve según {@code server.forward-headers-strategy}. La clave es la IPv4 entera o el /64 de una IPv6 (ver
 * {@link ClientIpKey}). Es un filtro de la cadena de seguridad (se registra en
 * {@code SecurityConfig}), no un filtro de servlet suelto: por eso su respuesta no pasa por
 * {@link ApiExceptionHandler}: lo construye {@link RateLimitedResponse} con el mismo helper de errores.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

	static final int BOOKINGS_PER_MINUTE = 10;
	static final int LOOKUPS_PER_MINUTE = 30;
	static final int BOOKINGS_PER_DAY = 10;
	private static final Duration WINDOW = Duration.ofMinutes(1);
	private static final Duration DAILY_WINDOW = Duration.ofHours(24);

	private static final PathPattern BOOKINGS_PATH = PathPatternParser.defaultInstance
		.parse("/api/v1/restaurants/{slug}/reservations");
	private static final PathPattern LOOKUPS_PATH = PathPatternParser.defaultInstance
		.parse("/api/v1/reservations/**");


	private final FixedWindowRateLimiter bookings;
	private final FixedWindowRateLimiter dailyBookings;
	private final FixedWindowRateLimiter lookups;

	public RateLimitFilter(Clock clock) {
		this.bookings = new FixedWindowRateLimiter(clock, BOOKINGS_PER_MINUTE, WINDOW);
		this.dailyBookings = new FixedWindowRateLimiter(clock, BOOKINGS_PER_DAY, DAILY_WINDOW);
		this.lookups = new FixedWindowRateLimiter(clock, LOOKUPS_PER_MINUTE, WINDOW);
	}

	/** Olvida todos los contadores. Para tests: el reloj fijo de la suite nunca rota la ventana. */
	public void clear() {
		bookings.clear();
		dailyBookings.clear();
		lookups.clear();
	}

	int trackedDailyBookingKeys() {
		return dailyBookings.trackedKeys();
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String uri = request.getRequestURI().substring(request.getContextPath().length());
		PathContainer path = PathContainer.parsePath(uri);
		if (HttpMethod.POST.matches(request.getMethod())) {
			PathPattern.PathMatchInfo booking = BOOKINGS_PATH.matchAndExtract(path);
			if (booking != null) {
				filterBooking(request, response, chain, booking.getUriVariables().get("slug"));
				return;
			}
		}
		if (LOOKUPS_PATH.matches(path)) {
			String ip = ClientIpKey.of(request.getRemoteAddr());
			if (!lookups.tryAcquire(ip)) {
				RateLimitedResponse.write(response, lookups.retryAfterSeconds(ip));
				return;
			}
		}
		chain.doFilter(request, response);
	}

	/** Primero el cupo por minuto y después el diario: una petición que el de por minuto rechaza no gasta cupo del día. */
	private void filterBooking(HttpServletRequest request, HttpServletResponse response, FilterChain chain,
			String slug) throws ServletException, IOException {
		String ip = ClientIpKey.of(request.getRemoteAddr());
		if (!bookings.tryAcquire(ip)) {
			RateLimitedResponse.write(response, bookings.retryAfterSeconds(ip));
			return;
		}
		// La IP nunca lleva '|', así que la clave no es ambigua.
		String dailyKey = ip + "|" + slug;
		if (!dailyBookings.tryAcquire(dailyKey)) {
			RateLimitedResponse.writeDailyBookingLimit(response, dailyBookings.retryAfterSeconds(dailyKey));
			return;
		}
		boolean created = false;
		try {
			chain.doFilter(request, response);
			created = response.getStatus() / 100 == 2;
		}
		finally {
			if (!created) {
				dailyBookings.release(dailyKey);
			}
		}
	}

}
