package io.github.manuelcarro97.reservas.adapter.out.identity;

import com.google.firebase.auth.FirebaseAuthException;

/**
 * Una llamada al proveedor de identidad falló. Solo lleva la operación y los códigos de error de Firebase, que son
 * enumerados: ni el mensaje de la excepción de la librería (puede traer datos de la cuenta de servicio) ni esa excepción
 * como causa, porque quien la registre con su traza los escribiría.
 */
class IdentityProviderException extends RuntimeException {

	IdentityProviderException(String operation, FirebaseAuthException failure) {
		super("Identity provider call failed: " + operation + " (" + failure.getErrorCode() + ", "
				+ failure.getAuthErrorCode() + ")");
	}

}
