package io.github.manuelcarro97.reservas.domain.service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import io.github.manuelcarro97.reservas.domain.exception.ArrivalTimePastException;
import io.github.manuelcarro97.reservas.domain.exception.InvalidArrivalTimeException;
import io.github.manuelcarro97.reservas.domain.model.Shift;

/**
 * Horas de llegada dentro de un turno. Solo indican cuándo llega el cliente: la mesa sigue ocupada el turno entero,
 * así que esto no toca la garantía contra el doble reparto de una mesa.
 * <p>
 * La rejilla parte del inicio del turno y avanza de {@value #STEP_MINUTES} en {@value #STEP_MINUTES} minutos hasta
 * {@value #LAST_ARRIVAL_BEFORE_END_MINUTES} minutos antes del fin, inclusive. Un turno de menos de ese margen solo
 * tiene su hora de inicio. Un turno acaba siempre el mismo día en que empieza (la API exige inicio anterior al fin).
 */
public class ArrivalPolicy {

	public static final int STEP_MINUTES = 30;
	public static final int LAST_ARRIVAL_BEFORE_END_MINUTES = 60;

	/** Todas las horas de llegada del turno, sin tener en cuenta la hora actual. */
	public List<LocalTime> arrivalSlots(Shift shift) {
		long lastOffset = Math.max(0,
				Duration.between(shift.start(), shift.end()).toMinutes() - LAST_ARRIVAL_BEFORE_END_MINUTES);
		List<LocalTime> slots = new ArrayList<>();
		for (long offset = 0; offset <= lastOffset; offset += STEP_MINUTES) {
			slots.add(shift.start().plusMinutes(offset));
		}
		return List.copyOf(slots);
	}

	/** Las horas del turno que todavía no han pasado en {@code date}, con "ahora" visto en la zona del restaurante. */
	public List<LocalTime> availableSlots(Shift shift, LocalDate date, ZoneId zone, Instant now) {
		return arrivalSlots(shift).stream().filter(slot -> isUpcoming(slot, date, zone, now)).toList();
	}

	/**
	 * @throws InvalidArrivalTimeException si falta o no es una hora de la rejilla del turno
	 * @throws ArrivalTimePastException si es de la rejilla pero ya ha pasado
	 */
	public void requireValid(Shift shift, LocalTime arrival, LocalDate date, ZoneId zone, Instant now) {
		if (arrival == null || !arrivalSlots(shift).contains(arrival)) {
			throw new InvalidArrivalTimeException();
		}
		if (!isUpcoming(arrival, date, zone, now)) {
			throw new ArrivalTimePastException();
		}
	}

	private static boolean isUpcoming(LocalTime slot, LocalDate date, ZoneId zone, Instant now) {
		return date.atTime(slot).atZone(zone).toInstant().isAfter(now);
	}

}
