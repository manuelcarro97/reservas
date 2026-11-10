package io.github.manuelcarro97.reservas.adapter.in.web;

import java.io.IOException;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.http.server.ServletServerHttpResponse;

import jakarta.servlet.http.HttpServletResponse;

/**
 * El 429 de los filtros de límite: la misma forma de error que el resto de la API ({@link ApiExceptionHandler#problem})
 * y la cabecera {@code Retry-After}. Los filtros responden fuera de {@link ApiExceptionHandler}.
 */
final class RateLimitedResponse {

	private static final String DETAIL = "Too many requests, try again later";
	private static final String DAILY_BOOKING_DETAIL = "Too many bookings from this connection today, try again tomorrow";

	private static final JacksonJsonHttpMessageConverter CONVERTER = new JacksonJsonHttpMessageConverter();

	private RateLimitedResponse() {
	}

	static void write(HttpServletResponse response, long retryAfterSeconds) throws IOException {
		write(response, retryAfterSeconds, DETAIL, "RATE_LIMITED");
	}

	/** El cupo de altas del día de una IP en un plano: otro {@code code}, para que la web no diga "espera unos segundos". */
	static void writeDailyBookingLimit(HttpServletResponse response, long retryAfterSeconds) throws IOException {
		write(response, retryAfterSeconds, DAILY_BOOKING_DETAIL, "DAILY_BOOKING_LIMIT");
	}

	private static void write(HttpServletResponse response, long retryAfterSeconds, String detail, String code)
			throws IOException {
		ProblemDetail problem = ApiExceptionHandler.problem(HttpStatus.TOO_MANY_REQUESTS, detail, code);
		response.setStatus(problem.getStatus());
		response.setHeader(HttpHeaders.RETRY_AFTER, Long.toString(retryAfterSeconds));
		CONVERTER.write(problem, MediaType.APPLICATION_PROBLEM_JSON, new ServletServerHttpResponse(response));
	}

}
