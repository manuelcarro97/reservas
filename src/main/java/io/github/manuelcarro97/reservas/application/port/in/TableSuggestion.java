package io.github.manuelcarro97.reservas.application.port.in;

/** Mesa libre en la que cabe una reserva, para que el dueño la asigne. */
public record TableSuggestion(long tableId, String label, int seats) {
}
