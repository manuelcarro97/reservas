package io.github.manuelcarro97.reservas.adapter.in.web;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record CreatePlanRequest(@NotBlank @Pattern(regexp = "[a-z0-9-]+") @Size(max = 80) String slug,
		@NotBlank @Size(max = 120) @Pattern(regexp = TextRules.NO_NUL) String name) {
}
