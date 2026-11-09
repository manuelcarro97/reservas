package io.github.manuelcarro97.reservas.application.port.in;

import java.time.LocalDate;
import java.util.List;

public interface GetOccupancyUseCase {

	List<TableOccupancy> occupancy(String ownerUid, String slug, long shiftId, LocalDate date);

}
