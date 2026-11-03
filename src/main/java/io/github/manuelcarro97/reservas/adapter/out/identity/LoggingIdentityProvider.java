package io.github.manuelcarro97.reservas.adapter.out.identity;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.github.manuelcarro97.reservas.application.port.out.IdentityProviderPort;

/**
 * El proveedor de identidad cuando no hay cuenta de servicio de Firebase: solo registra lo que haría. No escribe el uid,
 * el email ni la contraseña.
 */
class LoggingIdentityProvider implements IdentityProviderPort {

	private static final Logger log = LoggerFactory.getLogger(LoggingIdentityProvider.class);

	@Override
	public void deleteUser(String uid) {
		log.info("Identity provider not configured: user deletion skipped");
	}

	@Override
	public String ensureUser(String uid, String email, String password) {
		log.info("Identity provider not configured: user creation skipped");
		return uid;
	}

}
