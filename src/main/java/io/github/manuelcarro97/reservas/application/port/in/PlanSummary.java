package io.github.manuelcarro97.reservas.application.port.in;

import io.github.manuelcarro97.reservas.domain.model.PlanStatus;

public record PlanSummary(String slug, String name, PlanStatus status) {
}
