package io.github.manuelcarro97.reservas.adapter.out.identity;

import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserRecord;

import io.github.manuelcarro97.reservas.application.port.out.IdentityProviderPort;

/**
 * Cuentas de Firebase Auth con el Admin SDK y una cuenta de servicio. Solo existe si hay cuenta de servicio (ver
 * {@link IdentityProviderConfiguration}). Los fallos salen como {@link IdentityProviderException}, sin el mensaje de la
 * librería.
 */
class FirebaseIdentityProvider implements IdentityProviderPort, AutoCloseable {

	private final FirebaseApp app;
	private final FirebaseAuth auth;

	FirebaseIdentityProvider(FirebaseApp app) {
		this.app = app;
		this.auth = FirebaseAuth.getInstance(app);
	}

	@Override
	public void deleteUser(String uid) {
		try {
			auth.deleteUser(uid);
		}
		catch (FirebaseAuthException failure) {
			// Que ya no exista es el resultado que se buscaba.
			if (failure.getAuthErrorCode() != AuthErrorCode.USER_NOT_FOUND) {
				throw new IdentityProviderException("deleteUser", failure);
			}
		}
	}

	@Override
	public String ensureUser(String uid, String email, String password) {
		try {
			if (exists(uid)) {
				auth.updateUser(new UserRecord.UpdateRequest(uid).setEmail(email).setPassword(password));
			}
			else {
				auth.createUser(new UserRecord.CreateRequest().setUid(uid)
					.setEmail(email)
					.setPassword(password)
					.setEmailVerified(true));
			}
			return uid;
		}
		catch (FirebaseAuthException failure) {
			throw new IdentityProviderException("ensureUser", failure);
		}
	}

	private boolean exists(String uid) throws FirebaseAuthException {
		try {
			auth.getUser(uid);
			return true;
		}
		catch (FirebaseAuthException failure) {
			if (failure.getAuthErrorCode() == AuthErrorCode.USER_NOT_FOUND) {
				return false;
			}
			throw failure;
		}
	}

	/** Libera los hilos y conexiones del SDK al parar la aplicación. */
	@Override
	public void close() {
		app.delete();
	}

}
