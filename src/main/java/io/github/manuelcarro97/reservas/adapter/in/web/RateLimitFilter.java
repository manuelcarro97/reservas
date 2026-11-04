package io.github.manuelcarro97.reservas.adapter.in.web;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.http.server.PathContainer;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import io.github.manuelcarro97.reservas.domain.exception.RateLimitedException;

/**
 * Límite por IP de los endpoints públicos que escriben o consultan por código: 10 altas de reserva por minuto y 30
 * consultas o cancelaciones por código por minuto. El plano, la ocupación y la disponibilidad no se limitan, ni
 * tampoco la administración (va con token). Superado el límite responde 429 con la misma forma de error que el resto
 * de la API y la cabecera {@code Retry-After}.
 * <p>
 * La IP es {@code getRemoteAddr()} y nunca se lee {@code X-Forwarded-For} a mano: detrás de un proxy el contenedor la
 * resuelve según {@code server.forward-headers-strategy}. Es un filtro de la cadena de seguridad (se registra en
 * {@code SecurityConfig}), no un filtro de servlet suelto: por eso su respuesta no pasa por
 * {@link ApiExceptionHandler} y construye el error a mano con {@link ApiExceptionHandler#problemOf}.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

	static final int BOOKINGS_PER_MINUTE = 10;
	static final int LOOKUPS_PER_MINUTE = 30;
	private static final Duration WINDOW = Duration.ofMinutes(1);

	private static final PathPattern BOOKINGS_PATH = PathPatternParser.defaultInstance
		.parse("/api/v1/restaurants/*/reservations");
	private static final PathPattern LOOKUPS_PATH = PathPatternParser.defaultInstance
		.parse("/api/v1/reservations/**");

	// Una sola instancia que nunca se lanza: su traza no cuesta nada por cada 429.
	private static final RateLimitedException RATE_LIMITED = new RateLimitedException();

	private final FixedWindowRateLimiter bookings;
	private final FixedWindowRateLimiter lookups;
	private final JacksonJsonHttpMessageConverter converter = new JacksonJsonHttpMessageConverter();

	public RateLimitFilter(Clock clock) {
		this.bookings = new FixedWindowRateLimiter(clock, BOOKINGS_PER_MINUTE, WINDOW);
		this.lookups = new FixedWindowRateLimiter(clock, LOOKUPS_PER_MINUTE, WINDOW);
	}

	/** Olvida todos los contadores. Para tests: el reloj fijo de la suite nunca rota la ventana. */
	public void clear() {
		bookings.clear();
		lookups.clear();
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		FixedWindowRateLimiter limiter = limiterFor(request);
		if (limiter != null) {
			String ip = request.getRemoteAddr();
			if (!limiter.tryAcquire(ip)) {
				reject(request, response, limiter.retryAfterSeconds(ip));
				return;
			}
		}
		chain.doFilter(request, response);
	}

	private FixedWindowRateLimiter limiterFor(HttpServletRequest request) {
		String uri = request.getRequestURI().substring(request.getContextPath().length());
		PathContainer path = PathContainer.parsePath(uri);
		if (HttpMethod.POST.matches(request.getMethod()) && BOOKINGS_PATH.matches(path)) {
			return bookings;
		}
		if (LOOKUPS_PATH.matches(path)) {
			return lookups;
		}
		return null;
	}

	private void reject(HttpServletRequest request, HttpServletResponse response, long retryAfterSeconds)
			throws IOException {
		ProblemDetail problem = ApiExceptionHandler.problemOf(RATE_LIMITED);
		response.setStatus(problem.getStatus());
		response.setHeader(HttpHeaders.RETRY_AFTER, Long.toString(retryAfterSeconds));
		converter.write(problem, MediaType.APPLICATION_PROBLEM_JSON, new ServletServerHttpResponse(response));
	}

}
