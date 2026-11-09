package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.ProblemDetail;

import io.github.manuelcarro97.reservas.domain.exception.DomainException;
import io.github.manuelcarro97.reservas.domain.exception.ErrorKind;
import io.github.manuelcarro97.reservas.domain.exception.RestaurantNotFoundException;

class ApiExceptionHandlerTest {

	private final ApiExceptionHandler handler = new ApiExceptionHandler();

	@Test
	void domainExceptionDetailsBecomeProblemProperties() {
		DomainException withDetails = new DomainException("WITH_DETAILS", ErrorKind.CONFLICT, "Has details") {
			@Override
			public Map<String, Object> details() {
				return Map.of("limit", 3);
			}
		};

		ProblemDetail problem = handler.handleDomain(withDetails);

		assertThat(problem.getStatus()).isEqualTo(409);
		assertThat(problem.getProperties()).containsEntry("code", "WITH_DETAILS").containsEntry("limit", 3);
	}

	@Test
	void domainExceptionWithoutDetailsOnlyCarriesTheCode() {
		ProblemDetail problem = handler.handleDomain(new RestaurantNotFoundException());

		assertThat(problem.getProperties()).containsOnlyKeys("code");
	}

}
