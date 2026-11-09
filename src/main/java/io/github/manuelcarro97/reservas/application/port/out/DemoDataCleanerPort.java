package io.github.manuelcarro97.reservas.application.port.out;

/** Borrado físico de los datos de la cuenta demo, para volver a sembrarlos. */
public interface DemoDataCleanerPort {

	/**
	 * Borra de verdad (no en lógico) todos los planos del dueño, también los que se borraron en lógico, y el plano con
	 * ese {@code slug} aunque tenga otro dueño o ninguno (el seed SQL antiguo no ponía dueño), con sus reservas,
	 * cierres, turnos y mesas, y la cuenta del dueño. Es físico porque el slug es único también entre los borrados:
	 * borrarlo en lógico impediría volver a sembrarlo.
	 * <p>
	 * Toma el bloqueo del dueño y después el de cada fila de plano ({@code SELECT … FOR UPDATE}, sin filtrar los
	 * borrados) por id ascendente: una operación de un visitante que ya esperaba esas filas acaba como si el plano no
	 * existiera. Exige una transacción activa.
	 */
	void wipe(String ownerUid, String slug);

}
