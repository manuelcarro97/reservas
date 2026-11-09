package io.github.manuelcarro97.reservas.adapter.in.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ClientIpKeyTest {

	@Test
	void ipv4IsKeptWhole() {
		assertThat(ClientIpKey.of("203.0.113.7")).isEqualTo("203.0.113.7");
		assertThat(ClientIpKey.of("203.0.113.8")).isNotEqualTo(ClientIpKey.of("203.0.113.7"));
	}

	@Test
	void ipv6AddressesOfTheSame64ShareKey() {
		String first = ClientIpKey.of("2001:db8:1234:5678::1");
		String second = ClientIpKey.of("2001:db8:1234:5678:ffff:ffff:ffff:ffff");
		String expandedForm = ClientIpKey.of("2001:0db8:1234:5678:0000:0000:0000:0002");

		assertThat(second).isEqualTo(first);
		assertThat(expandedForm).isEqualTo(first);
	}

	@Test
	void ipv6AddressesOfDifferent64DoNotShareKey() {
		assertThat(ClientIpKey.of("2001:db8:1234:5679::1")).isNotEqualTo(ClientIpKey.of("2001:db8:1234:5678::1"));
		assertThat(ClientIpKey.of("2001:db8:1235:5678::1")).isNotEqualTo(ClientIpKey.of("2001:db8:1234:5678::1"));
	}

	@Test
	void ipv6KeyNeverCollidesWithAnIpv4() {
		assertThat(ClientIpKey.of("2001:db8:1234:5678::1")).contains("/64");
		assertThat(ClientIpKey.of("::1")).isNotEqualTo(ClientIpKey.of("0.0.0.1"));
	}

	@Test
	void ipv4MappedIpv6CountsAsTheIpv4() {
		assertThat(ClientIpKey.of("::ffff:203.0.113.7")).isEqualTo("203.0.113.7");
	}

	@Test
	void zoneAndBracketsAreIgnored() {
		assertThat(ClientIpKey.of("fe80::1%eth0")).isEqualTo(ClientIpKey.of("fe80::2"));
		assertThat(ClientIpKey.of("[2001:db8:1234:5678::1]")).isEqualTo(ClientIpKey.of("2001:db8:1234:5678::9"));
	}

	@Test
	void anythingUnparseableIsUsedAsIsWithoutResolvingNames() {
		assertThat(ClientIpKey.of("not:an:address")).isEqualTo("not:an:address");
		assertThat(ClientIpKey.of("unknown")).isEqualTo("unknown");
		assertThat(ClientIpKey.of(null)).isEqualTo("unknown");
	}

}
