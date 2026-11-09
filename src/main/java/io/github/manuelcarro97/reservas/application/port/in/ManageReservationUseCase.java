package io.github.manuelcarro97.reservas.application.port.in;

import java.time.LocalDate;
import java.util.List;

public interface ManageReservationUseCase {

	List<AdminReservation> list(String ownerUid, String slug, LocalDate date);

	/** Reservas PENDING del plano de hoy en adelante (hoy en la zona del plano), por fecha y turno. */
	List<AdminReservation> pending(String ownerUid, String slug);

	ReservationDetails confirm(String ownerUid, long id);

	ReservationDetails cancel(String ownerUid, long id);

	ReservationDetails markNoShow(String ownerUid, long id);

	/** Asigna o cambia la mesa; la mesa debe ser viva y del mismo plano que la reserva. */
	ReservationDetails assignTable(String ownerUid, long reservationId, long tableId);

	/** Hasta 5 mesas libres en las que cabe la reserva, la más pequeña primero. */
	List<TableSuggestion> suggestions(String ownerUid, long reservationId);

}
