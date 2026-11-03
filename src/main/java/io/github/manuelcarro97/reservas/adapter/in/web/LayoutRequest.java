package io.github.manuelcarro97.reservas.adapter.in.web;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import io.github.manuelcarro97.reservas.application.port.in.TableChange;
import io.github.manuelcarro97.reservas.domain.model.RoomLayout;
import io.github.manuelcarro97.reservas.domain.model.RoomShape;
import io.github.manuelcarro97.reservas.domain.model.TableShape;

/**
 * Plano entero. Los topes de medidas y coordenadas solo evitan desbordar un {@code int} al calcular áreas; las reglas
 * del plano (múltiplos, límites, solapes) las comprueba el dominio y responde 422 con el detalle.
 */
record LayoutRequest(@NotNull @Valid RoomRequest room,
		@NotNull @Size(max = 60) List<@NotNull @Valid TableRequest> tables) {

	private static final int MAX_COORDINATE = 4000;

	record RoomRequest(@NotNull RoomShape shape, @Min(0) @Max(MAX_COORDINATE) int width,
			@Min(0) @Max(MAX_COORDINATE) int height, @Min(0) @Max(MAX_COORDINATE) int cutWidth,
			@Min(0) @Max(MAX_COORDINATE) int cutDepth, int rotation) {

		RoomLayout toRoom() {
			return new RoomLayout(shape, width, height, cutWidth, cutDepth, rotation);
		}

	}

	record TableRequest(Long id, @NotNull @Size(max = 40) @Pattern(regexp = TextRules.NO_NUL) String label,
			@NotNull TableShape shape, int seats, int rotation, @Min(0) @Max(MAX_COORDINATE) int x,
			@Min(0) @Max(MAX_COORDINATE) int y) {

		TableChange toChange() {
			return new TableChange(id, label, shape, seats, rotation, x, y);
		}

	}

	RoomLayout toRoom() {
		return room.toRoom();
	}

	List<TableChange> toChanges() {
		return tables.stream().map(TableRequest::toChange).toList();
	}

}
