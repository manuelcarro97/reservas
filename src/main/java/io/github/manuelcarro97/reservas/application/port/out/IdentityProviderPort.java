package io.github.manuelcarro97.reservas.application.port.out;

/** Cuentas de usuario del proveedor de identidad (Firebase Auth). */
public interface IdentityProviderPort {

	/**
	 * Borra la cuenta del proveedor. Que ya no exista no es un error. Si el proveedor falla lanza
	 * {@link IdentityProviderException}, cuyo mensaje solo lleva la operación y códigos enumerados: quien llama puede
	 * registrarlo tal cual.
	 */
	void deleteUser(String uid);

	/**
	 * Deja la cuenta con ese uid, email y contraseña: la crea con ese uid fijo o, si existe, restablece su email y su
	 * contraseña. Devuelve el uid.
	 */
	String ensureUser(String uid, String email, String password);

}
