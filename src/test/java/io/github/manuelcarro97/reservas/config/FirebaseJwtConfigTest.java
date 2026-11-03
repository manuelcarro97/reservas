package io.github.manuelcarro97.reservas.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;

class FirebaseJwtConfigTest {

	private static final String PROJECT_ID = "reservas-6d51b";

	private final OAuth2TokenValidator<Jwt> validator = FirebaseJwtConfig.validator(PROJECT_ID);

	private static Jwt.Builder validToken() {
		Instant now = Instant.now();
		return Jwt.withTokenValue("t")
			.header("alg", "RS256")
			.issuer("https://securetoken.google.com/" + PROJECT_ID)
			.audience(List.of(PROJECT_ID))
			.subject("uid-1")
			.issuedAt(now.minusSeconds(60))
			.expiresAt(now.plus(Duration.ofHours(1)));
	}

	@Test
	void acceptsTokenFromProject() {
		assertThat(validator.validate(validToken().build()).hasErrors()).isFalse();
	}

	@Test
	void rejectsWrongAudience() {
		Jwt jwt = validToken().audience(List.of("otro-proyecto")).build();

		assertThat(validator.validate(jwt).hasErrors()).isTrue();
	}

	@Test
	void rejectsWrongIssuer() {
		Jwt jwt = validToken().issuer("https://securetoken.google.com/otro").build();

		assertThat(validator.validate(jwt).hasErrors()).isTrue();
	}

	@Test
	void rejectsBlankSubject() {
		Jwt jwt = validToken().subject("").build();

		assertThat(validator.validate(jwt).hasErrors()).isTrue();
	}

	@Test
	void rejectsFutureIssuedAt() {
		Instant now = Instant.now();
		Jwt jwt = validToken().issuedAt(now.plus(Duration.ofHours(1))).expiresAt(now.plus(Duration.ofHours(2)))
			.build();

		assertThat(validator.validate(jwt).hasErrors()).isTrue();
	}

	@Test
	void rejectsMissingIssuedAt() {
		Jwt jwt = validToken().claims(claims -> claims.remove("iat")).build();

		assertThat(validator.validate(jwt).hasErrors()).isTrue();
	}

	@Test
	void rejectsExpired() {
		// El validador por defecto tolera 60 s de desfase: 5 min queda fuera.
		Instant now = Instant.now();
		Jwt jwt = validToken().issuedAt(now.minus(Duration.ofHours(1))).expiresAt(now.minus(Duration.ofMinutes(5)))
			.build();

		assertThat(validator.validate(jwt).hasErrors()).isTrue();
	}

}
