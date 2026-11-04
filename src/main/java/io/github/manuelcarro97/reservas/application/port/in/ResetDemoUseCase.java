package io.github.manuelcarro97.reservas.application.port.in;

/** Restaura la cuenta demo y su plano al estado inicial. Lo lanza una tarea programada, nunca la API. */
public interface ResetDemoUseCase {

	/**
	 * Deja la cuenta demo en el proveedor de identidad y borra de la base de datos todo lo de la demo (también lo que
	 * borró un visitante) para volver a sembrar el plano {@code demo} con sus mesas, turnos y reservas de ejemplo. Todo
	 * el cambio de la base de datos va en una transacción: queda el estado nuevo entero o el anterior. Un fallo del
	 * proveedor de identidad se registra y no impide restaurar la base de datos. Devuelve el uid
	 * de la cuenta demo.
	 */
	String reset();

}
