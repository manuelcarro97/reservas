package io.github.manuelcarro97.reservas.support;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

import io.github.manuelcarro97.reservas.application.port.out.IdentityProviderPort;

/** Proveedor de identidad de pruebas: registra las llamadas y nunca sale a la red. */
public class FakeIdentityProvider implements IdentityProviderPort {

	public record Ensured(String uid, String email) {
	}

	private final List<String> deleted = new CopyOnWriteArrayList<>();
	private final List<Ensured> ensured = new CopyOnWriteArrayList<>();
	private volatile Consumer<String> onDelete = uid -> {
	};
	private volatile RuntimeException failure;
	private volatile RuntimeException ensureFailure;

	public List<String> deleted() {
		return deleted;
	}

	public List<Ensured> ensured() {
		return ensured;
	}

	/** Se ejecuta en cada {@code deleteUser}, antes de que falle o registre la llamada. */
	public void onDelete(Consumer<String> hook) {
		onDelete = hook;
	}

	/** Hace que {@code deleteUser} lance esta excepción (después de registrar la llamada). */
	public void failWith(RuntimeException exception) {
		failure = exception;
	}

	/** Hace que {@code ensureUser} lance esta excepción (sin registrar la llamada). */
	public void failEnsureWith(RuntimeException exception) {
		ensureFailure = exception;
	}

	public void reset() {
		deleted.clear();
		ensured.clear();
		onDelete = uid -> {
		};
		failure = null;
		ensureFailure = null;
	}

	@Override
	public void deleteUser(String uid) {
		onDelete.accept(uid);
		deleted.add(uid);
		if (failure != null) {
			throw failure;
		}
	}

	@Override
	public String ensureUser(String uid, String email, String password) {
		if (ensureFailure != null) {
			throw ensureFailure;
		}
		ensured.add(new Ensured(uid, email));
		return uid;
	}

}
