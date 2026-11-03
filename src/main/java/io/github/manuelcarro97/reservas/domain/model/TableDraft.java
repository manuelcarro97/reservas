package io.github.manuelcarro97.reservas.domain.model;

/** Mesa tal como llega del editor de planos, por su centro ({@code x}, {@code y}). */
public record TableDraft(String label, TableShape shape, int seats, int rotation, int x, int y) {

}
