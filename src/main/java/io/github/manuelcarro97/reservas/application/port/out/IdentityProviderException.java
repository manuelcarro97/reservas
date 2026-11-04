package io.github.manuelcarro97.reservas.application.port.out;

/**
 * Una llamada al proveedor de identidad falló. Su mensaje solo lleva la operación y los códigos de error enumerados del
 * proveedor, nunca el mensaje de la librería (puede traer datos de la cuenta de servicio) ni esa excepción como causa:
 * por eso quien la captura puede registrar {@link #getMessage()} tal cual.
 */
public class IdentityProviderException extends RuntimeException {

	public IdentityProviderException(String operation, String errorCodes) {
		super("Identity provider call failed: " + operation + " (" + errorCodes + ")");
	}

}
