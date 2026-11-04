package io.github.manuelcarro97.reservas.adapter.out.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.security.KeyPairGenerator;
import java.util.Base64;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

import io.github.manuelcarro97.reservas.application.port.out.IdentityProviderPort;

/**
 * Qué proveedor de identidad se elige según {@code FIREBASE_SERVICE_ACCOUNT_JSON}. Nunca sale a la red: construir el
 * proveedor de Firebase no llama a Google, y la clave de la cuenta de servicio de prueba se genera en cada ejecución.
 */
class IdentityProviderConfigurationTest {

	private static final String MARK = "MARCA-SECRETA-EN-EL-JSON";

	private final IdentityProviderConfiguration configuration = new IdentityProviderConfiguration();
	private final Logger configurationLogger = (Logger) LoggerFactory.getLogger(IdentityProviderConfiguration.class);
	private final ListAppender<ILoggingEvent> logs = new ListAppender<>();

	@BeforeEach
	void captureLogs() {
		logs.start();
		configurationLogger.addAppender(logs);
	}

	@AfterEach
	void stopCapturing() {
		configurationLogger.detachAppender(logs);
	}

	private List<String> warnings() {
		return logs.list.stream()
			.filter(event -> event.getLevel() == Level.WARN)
			.map(ILoggingEvent::getFormattedMessage)
			.toList();
	}

	/** Cuenta de servicio con la forma real y una clave recién generada: no es ningún secreto. */
	private static String fakeServiceAccountJson() throws Exception {
		KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
		generator.initialize(2048);
		String pem = "-----BEGIN PRIVATE KEY-----\n"
				+ Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(generator.generateKeyPair().getPrivate().getEncoded())
				+ "\n-----END PRIVATE KEY-----\n";
		return """
				{"type":"service_account","project_id":"reservas-test","private_key_id":"0000",
				 "private_key":"%s","client_email":"test@reservas-test.iam.gserviceaccount.com","client_id":"1",
				 "token_uri":"https://oauth2.googleapis.com/token"}
				""".formatted(pem.replace("\n", "\\n"));
	}

	@Test
	void withoutServiceAccountItOnlyLogs() {
		assertThat(configuration.identityProvider("")).isInstanceOf(LoggingIdentityProvider.class);
		assertThat(configuration.identityProvider("   \n")).isInstanceOf(LoggingIdentityProvider.class);
		assertThat(configuration.identityProvider(null)).isInstanceOf(LoggingIdentityProvider.class);
		// Sin cuenta de servicio es lo normal en local: sin avisos.
		assertThat(warnings()).isEmpty();
	}

	@Test
	void invalidJsonDoesNotBreakStartupAndWarnsOnceWithoutValues() {
		IdentityProviderPort provider = configuration.identityProvider("{no es json " + MARK);

		assertThat(provider).isInstanceOf(LoggingIdentityProvider.class);
		assertThat(warnings()).hasSize(1);
		assertThat(warnings().get(0)).contains("FIREBASE_SERVICE_ACCOUNT_JSON").doesNotContain(MARK);
	}

	@Test
	void jsonThatIsNotAServiceAccountFallsBackToLogging() {
		assertThat(configuration.identityProvider("{\"type\":\"service_account\",\"note\":\"" + MARK + "\"}"))
			.isInstanceOf(LoggingIdentityProvider.class);
		assertThat(configuration.identityProvider("{\"type\":\"service_account\",\"project_id\":\"x\","
				+ "\"private_key\":\"" + MARK + "\",\"client_email\":\"a@b.c\",\"client_id\":\"1\","
				+ "\"private_key_id\":\"0\"}")).isInstanceOf(LoggingIdentityProvider.class);

		assertThat(warnings()).hasSize(2).allSatisfy(warning -> assertThat(warning).doesNotContain(MARK));
	}

	@Test
	void validServiceAccountSelectsFirebaseWithoutCallingIt() throws Exception {
		IdentityProviderPort provider = configuration.identityProvider(fakeServiceAccountJson());
		try {
			assertThat(provider).isInstanceOf(FirebaseIdentityProvider.class);
			assertThat(warnings()).isEmpty();
			// Sin tiempo máximo una llamada colgada retendría la conexión de la base de datos (deleteUser va tras el commit).
			FirebaseOptions options = FirebaseApp.getInstance(IdentityProviderConfiguration.FIREBASE_APP_NAME)
				.getOptions();
			assertThat(options.getConnectTimeout()).isEqualTo(10_000);
			assertThat(options.getReadTimeout()).isEqualTo(10_000);
		}
		finally {
			((AutoCloseable) provider).close();
		}
	}

	@Test
	void loggingProviderEnsureUserReturnsTheUid() {
		LoggingIdentityProvider provider = new LoggingIdentityProvider();

		assertThat(provider.ensureUser("demo-uid", "demo@example.com", "secreto")).isEqualTo("demo-uid");
		provider.deleteUser("demo-uid");
	}

}
