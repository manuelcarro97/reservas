package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

interface ClosureJpaRepository extends JpaRepository<ClosureEntity, Long> {

	boolean existsByRestaurantIdAndDate(long restaurantId, LocalDate date);

	@Query("select c.date from ClosureEntity c where c.restaurantId = :restaurantId and c.date >= :from order by c.date")
	List<LocalDate> datesFrom(long restaurantId, LocalDate from);

	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("delete from ClosureEntity c where c.restaurantId = :restaurantId and c.date = :date")
	int deleteByRestaurantIdAndDate(long restaurantId, LocalDate date);

}
