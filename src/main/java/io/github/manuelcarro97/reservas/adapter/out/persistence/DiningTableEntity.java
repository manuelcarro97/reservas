package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.TableShape;

@Entity
@Table(name = "dining_table")
class DiningTableEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "restaurant_id")
	private long restaurantId;

	private String label;

	@Enumerated(EnumType.STRING)
	private TableShape shape;

	private int seats;

	private int rotation;

	private int x;

	private int y;

	@Column(name = "deleted_at")
	private Instant deletedAt;

	protected DiningTableEntity() {
	}

	static DiningTableEntity from(DiningTable table) {
		DiningTableEntity entity = new DiningTableEntity();
		entity.id = table.id();
		entity.restaurantId = table.restaurantId();
		entity.label = table.label();
		entity.shape = table.shape();
		entity.seats = table.seats();
		entity.rotation = table.rotation();
		entity.x = table.x();
		entity.y = table.y();
		return entity;
	}

	DiningTable toDomain() {
		return new DiningTable(id, restaurantId, label, shape, seats, rotation, x, y);
	}

}
