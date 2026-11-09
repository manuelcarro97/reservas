package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

/**
 * Los cambios sobre un turno existente son UPDATE/DELETE dirigidos al plano y no un {@code save()}: guardar la entidad
 * reescribiría todas las columnas, también {@code deleted_at}.
 */
interface ShiftJpaRepository extends JpaRepository<ShiftEntity, Long> {

	Optional<ShiftEntity> findByIdAndRestaurantId(long id, long restaurantId);

	List<ShiftEntity> findByRestaurantIdAndDeletedAtIsNullOrderByStartTime(long restaurantId);

	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("""
			update ShiftEntity s set s.name = :name
			where s.id = :id and s.restaurantId = :restaurantId and s.deletedAt is null
			""")
	int rename(long id, long restaurantId, String name);

	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("""
			update ShiftEntity s set s.startTime = :start, s.endTime = :end, s.daysOfWeek = :days
			where s.id = :id and s.restaurantId = :restaurantId and s.deletedAt is null
			""")
	int reschedule(long id, long restaurantId, LocalTime start, LocalTime end, short[] days);

	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("""
			update ShiftEntity s set s.deletedAt = :at
			where s.id = :id and s.restaurantId = :restaurantId and s.deletedAt is null
			""")
	int softDelete(long id, long restaurantId, Instant at);

	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("delete from ShiftEntity s where s.id = :id and s.restaurantId = :restaurantId")
	int delete(long id, long restaurantId);

}
