package io.github.manuelcarro97.reservas.application.port.in;

import java.time.LocalDate;
import java.util.List;

public interface ManageReservationUseCase {

	List<AdminReservation> listByDate(String ownerUid, String slug, LocalDate date);

	ReservationDetails confirm(String ownerUid, long id);

	ReservationDetails cancel(String ownerUid, long id);

	ReservationDetails markNoShow(String ownerUid, long id);

}
