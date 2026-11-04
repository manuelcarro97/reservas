package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ContactMaskTest {

	@Test
	void phoneKeepsAtMostTheLastTwoDigits() {
		assertThat(ContactMask.phone("611 222 333")).isEqualTo("•••33");
		assertThat(ContactMask.phone("+34 611-222-399")).isEqualTo("•••99");
	}

	@Test
	void shortPhonesShowNoDigitAtAll() {
		assertThat(ContactMask.phone("1234")).isEqualTo("•••");
		assertThat(ContactMask.phone("-")).isEqualTo("•••");
		assertThat(ContactMask.phone("abc")).isEqualTo("•••");
		assertThat(ContactMask.phone("")).isEqualTo("•••");
	}

	@Test
	void nullPhoneStaysNull() {
		assertThat(ContactMask.phone(null)).isNull();
	}

	@Test
	void everySeededPhoneIsRecognizedAndNothingElseIs() {
		assertThat(DemoSeeder.isSamplePhone("600 000 001")).isTrue();
		assertThat(DemoSeeder.isSamplePhone("600 000 006")).isTrue();
		assertThat(DemoSeeder.isSamplePhone("600 000 007")).isFalse();
		assertThat(DemoSeeder.isSamplePhone("600000001")).isFalse();
		assertThat(DemoSeeder.isSamplePhone(null)).isFalse();
	}

}
