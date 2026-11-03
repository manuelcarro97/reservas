package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface RestaurantJpaRepository extends JpaRepository<RestaurantEntity, Long> {

	Optional<RestaurantEntity> findBySlugAndDeletedAtIsNull(String slug);

	Optional<RestaurantEntity> findByIdAndDeletedAtIsNull(Long id);

	List<RestaurantEntity> findByOwnerUidAndDeletedAtIsNullOrderById(String ownerUid);

}
