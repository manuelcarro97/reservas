package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface RestaurantJpaRepository extends JpaRepository<RestaurantEntity, Long> {

	Optional<RestaurantEntity> findBySlugAndDeletedAtIsNull(String slug);

}
