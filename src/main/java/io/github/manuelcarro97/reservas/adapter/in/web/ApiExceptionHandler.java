package io.github.manuelcarro97.reservas.adapter.in.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import io.github.manuelcarro97.reservas.domain.exception.DomainException;
import io.github.manuelcarro97.reservas.domain.exception.ErrorKind;

@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

	@ExceptionHandler(DomainException.class)
	ProblemDetail handleDomain(DomainException exception) {
		return problemOf(exception);
	}

	/** También lo usan los filtros, que responden fuera de este advice con la misma forma de error. */
	static ProblemDetail problemOf(DomainException exception) {
		ProblemDetail problem = problem(statusOf(exception.kind()), exception.getMessage(), exception.code());
		exception.details().forEach(problem::setProperty);
		return problem;
	}

	@ExceptionHandler(Exception.class)
	ProblemDetail handleUnexpected(Exception exception) {
		log.error("Unexpected error", exception);
		return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Unexpected error", "INTERNAL_ERROR");
	}

	@Override
	protected ResponseEntity<Object> handleExceptionInternal(Exception exception, Object body, HttpHeaders headers,
			HttpStatusCode status, WebRequest request) {
		ResponseEntity<Object> response = super.handleExceptionInternal(exception, body, headers, status, request);
		if (response != null && response.getBody() instanceof ProblemDetail problem) {
			problem.setProperty("code", status.is4xxClientError() ? "INVALID_REQUEST" : "INTERNAL_ERROR");
		}
		return response;
	}

	private static ProblemDetail problem(HttpStatus status, String detail, String code) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setProperty("code", code);
		return problem;
	}

	private static HttpStatus statusOf(ErrorKind kind) {
		return switch (kind) {
			case NOT_FOUND -> HttpStatus.NOT_FOUND;
			case INVALID -> HttpStatus.BAD_REQUEST;
			case UNPROCESSABLE -> HttpStatus.UNPROCESSABLE_CONTENT;
			case CONFLICT -> HttpStatus.CONFLICT;
			case FORBIDDEN -> HttpStatus.FORBIDDEN;
			case TOO_MANY_REQUESTS -> HttpStatus.TOO_MANY_REQUESTS;
		};
	}

}
