package io.github.manuelcarro97.reservas.application.port.out;

/**
 * El proveedor de identidad rechazó la operación porque ese email ya es de otra cuenta. Es un {@link
 * IdentityProviderException} y mantiene su contrato: el mensaje solo lleva la operación y códigos enumerados, nunca el
 * email.
 */
public class EmailTakenException extends IdentityProviderException {

	public EmailTakenException(String operation, String errorCodes) {
		super(operation, errorCodes);
	}

}
