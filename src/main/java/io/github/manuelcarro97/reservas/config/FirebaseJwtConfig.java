package io.github.manuelcarro97.reservas.config;

import java.time.Clock;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/**
 * Valida los ID tokens de Firebase Auth. Reglas de
 * https://firebase.google.com/docs/auth/admin/verify-id-tokens
 */
@Configuration(proxyBeanMethods = false)
class FirebaseJwtConfig {

	private static final String ISSUER_PREFIX = "https://securetoken.google.com/";
	private static final Duration CLOCK_SKEW = Duration.ofSeconds(60);
	private static final String JWK_SET_URI = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

	// withJwkSetUri descarga las claves en la primera petición: arrancar no necesita red.
	// No se usa issuer-uri de Boot porque consulta el descubrimiento OIDC al arrancar.
	@Bean
	JwtDecoder jwtDecoder(@Value("${app.firebase.project-id}") String projectId) {
		NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(JWK_SET_URI).build();
		decoder.setJwtValidator(validator(projectId));
		return decoder;
	}

	static OAuth2TokenValidator<Jwt> validator(String projectId) {
		return validator(projectId, Clock.systemUTC());
	}

	static OAuth2TokenValidator<Jwt> validator(String projectId, Clock clock) {
		return new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(ISSUER_PREFIX + projectId),
				// Los validadores por defecto no miran iat; Firebase exige que sea pasado (misma tolerancia que exp).
				jwt -> jwt.getIssuedAt() != null && !jwt.getIssuedAt().isAfter(clock.instant().plus(CLOCK_SKEW))
						? OAuth2TokenValidatorResult.success()
						: failure("El token no tiene fecha de emisión válida"),
				jwt -> jwt.getAudience() != null && jwt.getAudience().contains(projectId)
						? OAuth2TokenValidatorResult.success()
						: failure("El token no es para este proyecto de Firebase"),
				jwt -> jwt.getSubject() != null && !jwt.getSubject().isBlank() ? OAuth2TokenValidatorResult.success()
						: failure("El token no tiene sujeto"));
	}

	private static OAuth2TokenValidatorResult failure(String description) {
		return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", description, null));
	}

}
