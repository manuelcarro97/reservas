package io.github.manuelcarro97.reservas.application.port.out;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import io.github.manuelcarro97.reservas.domain.model.Shift;

public interface ShiftRepositoryPort {

	/** Turno del plano, también si está oculto (borrado lógico): las reservas pasadas lo siguen necesitando. */
	Optional<Shift> findById(long restaurantId, long shiftId);

	/** Turnos visibles del plano (sin los ocultos), por hora de inicio. */
	List<Shift> findAll(long restaurantId);

	Shift save(Shift shift);

	/** Cambia solo el nombre del turno visible del plano; lanza ShiftNotFoundException si no existe o está oculto. */
	void rename(long restaurantId, long shiftId, String name);

	/** Cambia horas y días del turno visible del plano; lanza ShiftNotFoundException si no existe o está oculto. */
	void reschedule(long restaurantId, long shiftId, LocalTime start, LocalTime end, Set<DayOfWeek> days);

	/** Oculta el turno visible del plano; lanza ShiftNotFoundException si no existe o ya está oculto. */
	void softDelete(long restaurantId, long shiftId, Instant at);

	/** Borra la fila del turno; solo es posible si ninguna reserva lo referencia (ver {@link #hasAnyReservation}). */
	void delete(long restaurantId, long shiftId);

	/** Si alguna reserva, de cualquier estado y fecha, referencia el turno. */
	boolean hasAnyReservation(long shiftId);

}
