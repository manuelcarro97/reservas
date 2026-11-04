package io.github.manuelcarro97.reservas.adapter.out.identity;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

import io.github.manuelcarro97.reservas.application.port.out.IdentityProviderPort;

/**
 * Elige el proveedor de identidad: con cuenta de servicio de Firebase ({@code FIREBASE_SERVICE_ACCOUNT_JSON}, solo por
 * variable de entorno, nunca en el repo) el de Firebase; sin ella, o con un JSON que no sirve, el que solo registra. Un
 * JSON inválido no tumba el arranque: avisa una vez, sin valores. No se usa {@code @ConditionalOnProperty}: con la
 * variable vacía la propiedad existe y también daría que sí.
 */
@Configuration(proxyBeanMethods = false)
class IdentityProviderConfiguration {

	private static final Logger log = LoggerFactory.getLogger(IdentityProviderConfiguration.class);

	static final String FIREBASE_APP_NAME = "reservas-identity";
	static final int CALL_TIMEOUT_MILLIS = 10_000;

	@Bean
	IdentityProviderPort identityProvider(@Value("${app.firebase.service-account-json:}") String serviceAccountJson) {
		if (!StringUtils.hasText(serviceAccountJson)) {
			return new LoggingIdentityProvider();
		}
		try {
			GoogleCredentials credentials = GoogleCredentials
				.fromStream(new ByteArrayInputStream(serviceAccountJson.getBytes(StandardCharsets.UTF_8)));
			// Sin tiempos máximos una llamada colgada sería infinita, y deleteUser corre tras el commit con la conexión de
			// la base de datos aún tomada.
			FirebaseApp app = FirebaseApp.initializeApp(FirebaseOptions.builder()
				.setCredentials(credentials)
				.setConnectTimeout(CALL_TIMEOUT_MILLIS)
				.setReadTimeout(CALL_TIMEOUT_MILLIS)
				.build(), FIREBASE_APP_NAME);
			return new FirebaseIdentityProvider(app);
		}
		catch (IOException | RuntimeException failure) {
			// Solo la clase: el mensaje de la librería puede citar trozos del JSON, que lleva una clave privada.
			log.warn("Firebase identity provider is disabled: FIREBASE_SERVICE_ACCOUNT_JSON is not a usable service "
					+ "account ({})", failure.getClass().getSimpleName());
			return new LoggingIdentityProvider();
		}
	}

}
