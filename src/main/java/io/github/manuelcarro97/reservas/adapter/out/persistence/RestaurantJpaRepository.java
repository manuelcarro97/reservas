package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

interface RestaurantJpaRepository extends JpaRepository<RestaurantEntity, Long> {

	Optional<RestaurantEntity> findBySlugAndDeletedAtIsNull(String slug);

	Optional<RestaurantEntity> findByIdAndDeletedAtIsNull(Long id);

	List<RestaurantEntity> findByOwnerUidAndDeletedAtIsNullOrderById(String ownerUid);

	// UPDATE dirigido a propósito: guardar la entidad pondría deleted_at a null y resucitaría el plano.
	// flush antes y clear después: la sentencia se ejecuta ya y el contexto no conserva copias viejas de la fila.
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("update RestaurantEntity r set r.deletedAt = :at where r.id = :id and r.deletedAt is null")
	int softDelete(long id, Instant at);

}
