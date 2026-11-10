package io.github.manuelcarro97.reservas.support;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

import io.github.manuelcarro97.reservas.application.port.out.EmailTakenException;
import io.github.manuelcarro97.reservas.application.port.out.IdentityProviderPort;

/** Proveedor de identidad de pruebas: registra las llamadas y nunca sale a la red. */
public class FakeIdentityProvider implements IdentityProviderPort {

	public record Ensured(String uid, String email) {
	}

	private final List<String> deleted = new CopyOnWriteArrayList<>();
	private final List<Ensured> ensured = new CopyOnWriteArrayList<>();
	private final Map<String, String> uidByEmail = new ConcurrentHashMap<>();
	private volatile Consumer<String> onDelete = uid -> {
	};
	private volatile RuntimeException failure;
	private volatile RuntimeException ensureFailure;
	private volatile RuntimeException findFailure;

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

	/** Hace que {@code findUidByEmail} lance esta excepción. */
	public void failFindWith(RuntimeException exception) {
		findFailure = exception;
	}

	/**
	 * Ese email es de la cuenta {@code uid}: {@code ensureUser} para otro uid falla con {@link EmailTakenException} hasta
	 * que se borra esa cuenta con {@code deleteUser}.
	 */
	public void holdEmail(String email, String uid) {
		uidByEmail.put(email, uid);
	}

	public void reset() {
		deleted.clear();
		ensured.clear();
		uidByEmail.clear();
		onDelete = uid -> {
		};
		failure = null;
		ensureFailure = null;
		findFailure = null;
	}

	@Override
	public void deleteUser(String uid) {
		onDelete.accept(uid);
		deleted.add(uid);
		if (failure != null) {
			throw failure;
		}
		uidByEmail.values().removeIf(uid::equals);
	}

	@Override
	public String ensureUser(String uid, String email, String password) {
		if (ensureFailure != null) {
			throw ensureFailure;
		}
		String holder = uidByEmail.get(email);
		if (holder != null && !holder.equals(uid)) {
			throw new EmailTakenException("ensureUser", "ALREADY_EXISTS, EMAIL_ALREADY_EXISTS");
		}
		ensured.add(new Ensured(uid, email));
		return uid;
	}

	@Override
	public Optional<String> findUidByEmail(String email) {
		if (findFailure != null) {
			throw findFailure;
		}
		return Optional.ofNullable(uidByEmail.get(email));
	}

}
