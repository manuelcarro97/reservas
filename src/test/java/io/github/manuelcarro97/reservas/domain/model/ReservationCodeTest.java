package io.github.manuelcarro97.reservas.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ReservationCodeTest {

	@Test
	void prefixFromSlug() {
		assertThat(ReservationCode.prefixOf("la-mesa-del-puerto")).isEqualTo("LAMESADE");
	}

	@Test
	void prefixKeepsDigits() {
		assertThat(ReservationCode.prefixOf("bar-21")).isEqualTo("BAR21");
	}

	@Test
	void emptyPrefixFallsBack() {
		assertThat(ReservationCode.prefixOf("---")).isEqualTo("R");
	}

	@Test
	void codeHasPrefixDashAnd16Chars() {
		assertThat(ReservationCode.generate("la-mesa-del-puerto")).matches("^LAMESADE-[2-9A-HJ-NP-Z]{16}$");
	}

	@Test
	void longestCodeFitsTheColumn() {
		assertThat(ReservationCode.generate("abcdefghijklmnop")).hasSizeLessThanOrEqualTo(32);
	}

}
