package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface ShiftJpaRepository extends JpaRepository<ShiftEntity, Long> {

	Optional<ShiftEntity> findByIdAndRestaurantId(long id, long restaurantId);

	List<ShiftEntity> findByRestaurantIdAndDeletedAtIsNullOrderByStartTime(long restaurantId);

}
