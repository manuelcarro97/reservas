package io.github.manuelcarro97.reservas.adapter.in.web;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record CreateTableRequest(@NotBlank @Size(max = 40) @Pattern(regexp = TextRules.NO_NUL) String label, @Min(1) int seats, int x, int y) {
}
