package io.github.manuelcarro97.reservas.application.port.in;

public record TableOccupancy(long tableId, String label, int seats, int x, int y, boolean occupied) {
}
