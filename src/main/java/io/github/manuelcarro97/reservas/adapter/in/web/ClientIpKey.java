package io.github.manuelcarro97.reservas.adapter.in.web;

import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.HexFormat;

/**
 * La clave con la que el límite por IP cuenta a un cliente. Una IPv4 cuenta entera. Una IPv6 cuenta por su /64: es el
 * bloque que un proveedor da a una sola línea, y quien lo tiene dispone de 2^64 direcciones, así que contar la
 * dirección completa le permitiría saltarse el límite rotando y llenar la memoria del limitador con claves nuevas.
 */
final class ClientIpKey {

	private static final String UNKNOWN = "unknown";
	private static final int PREFIX_BYTES = 8;

	private ClientIpKey() {
	}

	static String of(String remoteAddr) {
		if (remoteAddr == null || remoteAddr.isBlank()) {
			return UNKNOWN;
		}
		if (remoteAddr.indexOf(':') < 0) {
			return remoteAddr;
		}
		String literal = withoutBracketsAndZone(remoteAddr);
		try {
			// Con ':' es siempre un literal IPv6: getByName no resuelve nombres para él (si no es válido lanza).
			InetAddress address = InetAddress.getByName(literal);
			if (address instanceof Inet6Address) {
				return HexFormat.of().formatHex(address.getAddress(), 0, PREFIX_BYTES) + "/64";
			}
			// ::ffff:a.b.c.d: Java ya lo devuelve como IPv4.
			return address.getHostAddress();
		}
		catch (UnknownHostException invalid) {
			return remoteAddr;
		}
	}

	private static String withoutBracketsAndZone(String address) {
		String literal = address;
		if (literal.startsWith("[") && literal.endsWith("]")) {
			literal = literal.substring(1, literal.length() - 1);
		}
		int zone = literal.indexOf('%');
		return zone < 0 ? literal : literal.substring(0, zone);
	}

}
