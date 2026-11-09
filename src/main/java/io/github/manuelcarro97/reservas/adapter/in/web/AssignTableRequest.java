package io.github.manuelcarro97.reservas.adapter.in.web;

import jakarta.validation.constraints.NotNull;

record AssignTableRequest(@NotNull Long tableId) {
}
