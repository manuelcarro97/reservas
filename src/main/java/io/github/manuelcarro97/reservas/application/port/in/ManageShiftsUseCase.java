package io.github.manuelcarro97.reservas.application.port.in;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;

import io.github.manuelcarro97.reservas.domain.model.Shift;

/**
 * Turnos y días cerrados de un plano del dueño. Todo lo que no es suyo se comporta como si no existiera
 * (RestaurantNotFoundException); un turno ajeno, oculto o inexistente es ShiftNotFoundException. Todas las
 * operaciones de escritura van bajo el bloqueo del plano.
 */
public interface ManageShiftsUseCase {

	/** Turnos visibles del plano, por hora de inicio. */
	List<Shift> list(String ownerUid, String slug);

	/** @throws io.github.manuelcarro97.reservas.domain.exception.ShiftOverlapException si coincide con otro turno */
	Shift add(String ownerUid, String slug, String name, LocalTime start, LocalTime end, Set<DayOfWeek> days);

	/** Siempre permitido: no cambia cuándo se sirve el turno. */
	Shift rename(String ownerUid, String slug, long shiftId, String name);

	/**
	 * @throws io.github.manuelcarro97.reservas.domain.exception.ShiftHasReservationsException si el turno tiene
	 * reservas activas futuras
	 * @throws io.github.manuelcarro97.reservas.domain.exception.ShiftOverlapException si coincide con otro turno
	 */
	Shift reschedule(String ownerUid, String slug, long shiftId, LocalTime start, LocalTime end, Set<DayOfWeek> days);

	/**
	 * Si el turno tiene reservas de cualquier fecha o estado se oculta (la reserva lo sigue necesitando); si no, se
	 * borra.
	 *
	 * @throws io.github.manuelcarro97.reservas.domain.exception.ShiftHasReservationsException si el turno tiene
	 * reservas activas futuras
	 */
	void delete(String ownerUid, String slug, long shiftId);

	/**
	 * @throws io.github.manuelcarro97.reservas.domain.exception.ClosureHasReservationsException si hay reservas
	 * activas ese día
	 */
	void addClosure(String ownerUid, String slug, LocalDate date, String reason);

	/** Fechas cerradas desde {@code from} (incluida), en orden. */
	List<LocalDate> closures(String ownerUid, String slug, LocalDate from);

	/** Reabre el día; si no estaba cerrado no hace nada. */
	void removeClosure(String ownerUid, String slug, LocalDate date);

}
