package io.github.manuelcarro97.reservas.application.port.out;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import io.github.manuelcarro97.reservas.domain.model.DiningTable;

public interface TableRepositoryPort {

	List<DiningTable> findFree(long restaurantId, long shiftId, LocalDate date);

	List<DiningTable> findAll(long restaurantId);

	Optional<DiningTable> findById(long id);

	DiningTable save(DiningTable table);

	/**
	 * Actualiza una mesa viva con un UPDATE inmediato; nunca resucita una borrada. Falla con IllegalStateException
	 * si no hay ninguna mesa viva con ese id y plano.
	 */
	void update(DiningTable table);

	/** Borrado lógico inmediato: la mesa deja de verse y libera su nombre, pero las reservas pasadas la conservan. */
	void softDelete(long id, Instant at);

	/** Pone a cada mesa viva el nombre provisional {@code "~" + id} (UPDATE inmediato), para liberar sus nombres. */
	void renameTemporarily(Collection<Long> ids);

}
