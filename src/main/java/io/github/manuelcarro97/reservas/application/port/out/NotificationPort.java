package io.github.manuelcarro97.reservas.application.port.out;

public interface NotificationPort {

	/**
	 * Avisa al dueño de una acción del cliente. Se llama después de confirmar la transacción: si lanza, el error se
	 * registra y se descarta, nunca afecta a la reserva.
	 */
	void notifyOwner(String ownerUid, String text);

}
