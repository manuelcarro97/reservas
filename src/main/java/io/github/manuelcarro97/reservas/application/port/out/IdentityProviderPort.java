package io.github.manuelcarro97.reservas.application.port.out;

/** Cuentas de usuario del proveedor de identidad (Firebase Auth). */
public interface IdentityProviderPort {

	/**
	 * Borra la cuenta del proveedor. Que ya no exista no es un error. Si el proveedor falla lanza una excepción sin
	 * datos de la cuenta ni del proveedor en el mensaje: quien llama la registra tal cual.
	 */
	void deleteUser(String uid);

	/**
	 * Deja la cuenta con ese uid, email y contraseña: la crea con ese uid fijo o, si existe, restablece su email y su
	 * contraseña. Devuelve el uid.
	 */
	String ensureUser(String uid, String email, String password);

}
