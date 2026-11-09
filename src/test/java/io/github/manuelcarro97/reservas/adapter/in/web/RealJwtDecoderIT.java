package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.util.Date;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import com.nimbusds.jwt.SignedJWT;

import io.github.manuelcarro97.reservas.support.PostgresIT;

/**
 * Las rutas del panel pasan por el {@code JwtDecoder} de verdad (el de {@code FirebaseJwtConfig}), no por el
 * {@code jwt()} de spring-security-test, que se salta la validación. Ninguno de estos tokens llega a la red: el
 * decodificador solo descarga las claves de Google cuando el token es RS256, y estos se rechazan antes (no es un JWT,
 * no tiene firma o su algoritmo no es el esperado). La URL de las claves es una constante, así que un RS256 firmado con
 * una clave ajena no se puede probar sin red.
 */
@AutoConfigureMockMvc
class RealJwtDecoderIT extends PostgresIT {

	private static final String ADMIN = "/api/v1/admin/restaurants";
	// Los claims de un ID token de Firebase válido: lo único que falla es la firma.
	private static final String PROJECT_ID = "reservas-6d51b";

	@Autowired
	private MockMvc mvc;

	private static JWTClaimsSet firebaseLikeClaims() {
		Instant now = Instant.now();
		return new JWTClaimsSet.Builder().issuer("https://securetoken.google.com/" + PROJECT_ID)
			.audience(PROJECT_ID)
			.subject("owner-a")
			.issueTime(Date.from(now))
			.expirationTime(Date.from(now.plus(Duration.ofHours(1))))
			.build();
	}

	@Test
	void garbageBearerTokenReturns401() throws Exception {
		mvc.perform(get(ADMIN).header("Authorization", "Bearer not-a-jwt"))
			.andExpect(status().isUnauthorized())
			.andExpect(header().string("WWW-Authenticate", org.hamcrest.Matchers.startsWith("Bearer")));
	}

	@Test
	void garbageBearerTokenIsRejectedOnWritesToo() throws Exception {
		mvc.perform(post(ADMIN).header("Authorization", "Bearer not-a-jwt")).andExpect(status().isUnauthorized());
	}

	@Test
	void missingBearerTokenReturns401() throws Exception {
		mvc.perform(get(ADMIN)).andExpect(status().isUnauthorized());
	}

	@Test
	void unsignedJwtReturns401() throws Exception {
		String token = new PlainJWT(firebaseLikeClaims()).serialize();

		mvc.perform(get(ADMIN).header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
	}

	@Test
	void wellFormedJwtSignedWithAForeignKeyReturns401() throws Exception {
		// Claims correctos, firmado con un secreto que no es de Firebase y con un algoritmo (HS256) que no es el suyo.
		SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), firebaseLikeClaims());
		jwt.sign(new MACSigner("a-secret-that-is-not-firebase-at-all-0123456789".getBytes()));

		mvc.perform(get(ADMIN).header("Authorization", "Bearer " + jwt.serialize()))
			.andExpect(status().isUnauthorized());
	}

}
