package io.github.manuelcarro97.reservas.application.port.in;

import java.util.List;

import io.github.manuelcarro97.reservas.domain.model.DiningTable;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;
import io.github.manuelcarro97.reservas.domain.model.Shift;

public record PlanView(Restaurant restaurant, List<DiningTable> tables, List<Shift> shifts) {
}
