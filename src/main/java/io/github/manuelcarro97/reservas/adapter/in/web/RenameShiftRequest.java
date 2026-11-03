package io.github.manuelcarro97.reservas.adapter.in.web;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record RenameShiftRequest(@NotBlank @Size(max = 60) @Pattern(regexp = TextRules.NO_NUL) String name) {
}
