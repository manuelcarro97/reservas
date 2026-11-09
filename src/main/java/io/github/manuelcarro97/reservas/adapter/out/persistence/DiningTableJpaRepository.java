package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import io.github.manuelcarro97.reservas.domain.model.TableShape;

interface DiningTableJpaRepository extends JpaRepository<DiningTableEntity, Long> {

	List<DiningTableEntity> findByRestaurantIdAndDeletedAtIsNullOrderById(long restaurantId);

	// Los tres UPDATE son dirigidos a propósito: guardar la entidad pondría deleted_at a null y resucitaría la mesa.
	// flush antes y clear después: la sentencia se ejecuta ya y el contexto no conserva copias viejas de las filas.
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("""
			update DiningTableEntity t
			set t.label = :label, t.shape = :shape, t.seats = :seats, t.rotation = :rotation, t.x = :x, t.y = :y
			where t.id = :id and t.restaurantId = :restaurantId and t.deletedAt is null
			""")
	int updateLive(long id, long restaurantId, String label, TableShape shape, int seats, int rotation, int x, int y);

	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("update DiningTableEntity t set t.deletedAt = :at where t.id = :id and t.deletedAt is null")
	int softDelete(long id, Instant at);

	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query(value = "UPDATE dining_table SET label = '~' || id WHERE id IN (:ids) AND deleted_at IS NULL",
			nativeQuery = true)
	int renameTemporarily(Collection<Long> ids);

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
