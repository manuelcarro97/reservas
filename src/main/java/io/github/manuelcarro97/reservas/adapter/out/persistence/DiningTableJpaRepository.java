package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface DiningTableJpaRepository extends JpaRepository<DiningTableEntity, Long> {

	List<DiningTableEntity> findByRestaurantIdAndDeletedAtIsNullOrderById(long restaurantId);

	@Query("""
			select coalesce(max(t.seats), 0) from DiningTableEntity t
			where t.restaurantId = :restaurantId and t.deletedAt is null
			""")
	int maxSeats(long restaurantId);

	@Query("""
			select t from DiningTableEntity t
			where t.restaurantId = :restaurantId and t.deletedAt is null
			  and t.id not in (
			    select r.tableId from ReservationEntity r
			    where r.restaurantId = :restaurantId and r.shiftId = :shiftId and r.date = :date
			      and r.tableId is not null
			      and r.status in (io.github.manuelcarro97.reservas.domain.model.ReservationStatus.PENDING,
			                       io.github.manuelcarro97.reservas.domain.model.ReservationStatus.CONFIRMED))
			order by t.id
			""")
	List<DiningTableEntity> findFree(long restaurantId, long shiftId, LocalDate date);

}
