package io.github.manuelcarro97.reservas.application.port.in;

import io.github.manuelcarro97.reservas.domain.model.TableShape;

/** Mesa del plano que se guarda; {@code id} nulo es una mesa nueva. {@code x} e {@code y} son su centro. */
public record TableChange(Long id, String label, TableShape shape, int seats, int rotation, int x, int y) {
}
