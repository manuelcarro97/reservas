package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import io.github.manuelcarro97.reservas.domain.model.ReservationStatus;

interface ReservationJpaRepository extends JpaRepository<ReservationEntity, Long> {

	Optional<ReservationEntity> findByCode(String code);

	boolean existsByShiftId(long shiftId);

	List<ReservationEntity> findByRestaurantIdAndDateOrderById(long restaurantId, LocalDate date);

	List<ReservationEntity> findByRestaurantIdAndDateGreaterThanEqualAndStatusInOrderByDateAscIdAsc(long restaurantId,
			LocalDate from, Collection<ReservationStatus> statuses);

	List<ReservationEntity> findByRestaurantIdAndShiftIdAndDateAndStatusInOrderById(long restaurantId, long shiftId,
			LocalDate date, Collection<ReservationStatus> statuses);

	@Query("""
			select r from ReservationEntity r
			where r.restaurantId in :restaurantIds
			  and (r.createdAt >= :since or r.cancelledByCustomerAt >= :since)
			order by r.id
			""")
	List<ReservationEntity> changedSince(Collection<Long> restaurantIds, Instant since);

	boolean existsByRestaurantIdAndDateAndStatusIn(long restaurantId, LocalDate date,
			Collection<ReservationStatus> statuses);

	@Query("""
			select r.tableId from ReservationEntity r
			where r.restaurantId = :restaurantId and r.shiftId = :shiftId and r.date = :date
			  and r.status in (io.github.manuelcarro97.reservas.domain.model.ReservationStatus.PENDING,
			                   io.github.manuelcarro97.reservas.domain.model.ReservationStatus.CONFIRMED)
			""")
	List<Long> occupiedTableIds(long restaurantId, long shiftId, LocalDate date);

}
