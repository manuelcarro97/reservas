package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.util.List;

import jakarta.persistence.EntityManager;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import io.github.manuelcarro97.reservas.application.port.out.DemoDataCleanerPort;
import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;

/**
 * Va por JDBC porque son borrados masivos en orden de claves ajenas. No usa {@link RestaurantRepositoryPort#lock}: ese
 * da "no existe" para un plano borrado en lógico, y aquí hay que bloquear también esos.
 */
@Component
class DemoDataCleaner implements DemoDataCleanerPort {

	private final RestaurantRepositoryPort restaurants;
	private final JdbcClient jdbc;
	private final EntityManager entityManager;

	DemoDataCleaner(RestaurantRepositoryPort restaurants, JdbcClient jdbc, EntityManager entityManager) {
		this.restaurants = restaurants;
		this.jdbc = jdbc;
		this.entityManager = entityManager;
	}

	@Override
	public void wipe(String ownerUid, String slug) {
		if (!TransactionSynchronizationManager.isActualTransactionActive()) {
			throw new IllegalStateException("Wiping the demo data requires an active transaction");
		}
		// Lo que haya pendiente en el contexto de persistencia se escribe antes de borrar por SQL y se olvida después:
		// una entidad vieja de una fila ya borrada no debe volver a escribirse ni leerse.
		entityManager.flush();
		restaurants.lockOwner(ownerUid);
		List<Long> planIds = jdbc.sql("""
				SELECT id FROM restaurant WHERE owner_uid = :ownerUid OR slug = :slug ORDER BY id FOR UPDATE
				""").param("ownerUid", ownerUid).param("slug", slug).query(Long.class).list();
		if (!planIds.isEmpty()) {
			// Primero lo que referencia a otras filas: reserva -> mesa y turno; todo -> plano.
			deleteByPlan("reservation", planIds);
			deleteByPlan("closure", planIds);
			deleteByPlan("dining_table", planIds);
			deleteByPlan("shift", planIds);
			jdbc.sql("DELETE FROM restaurant WHERE id IN (:ids)").param("ids", planIds).update();
		}
		jdbc.sql("DELETE FROM owner_account WHERE uid = :ownerUid").param("ownerUid", ownerUid).update();
		entityManager.clear();
	}

	private void deleteByPlan(String table, List<Long> planIds) {
		jdbc.sql("DELETE FROM " + table + " WHERE restaurant_id IN (:ids)").param("ids", planIds).update();
	}

}
