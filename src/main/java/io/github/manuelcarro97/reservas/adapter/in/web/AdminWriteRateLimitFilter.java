package io.github.manuelcarro97.reservas.adapter.in.web;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.util.Set;

import org.springframework.http.server.PathContainer;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Límite de escrituras del panel ({@code POST}, {@code PUT}, {@code PATCH} y {@code DELETE} bajo
 * {@code /api/v1/admin/**}): {@value #WRITES_PER_MINUTE} por minuto y por usuario. Sin él, un único token válido (la
 * cuenta demo es pública) podría llenar la base de datos con peticiones legítimas una a una. Las lecturas no se
 * limitan.
 * <p>
 * La clave es el {@code sub} del token ya verificado, que sale del contexto de seguridad: por eso este filtro va
 * <em>después</em> de la autenticación Bearer (ver {@code SecurityConfig}) y no lee la cabecera {@code Authorization}
 * a mano, que permitiría rotar un {@code sub} sin firmar para evadir el límite. Una petición sin token válido no llega
 * aquí con identidad: no cuenta para nadie y la rechaza la autorización con 401. Responde igual que el filtro público
 * (ver {@link RateLimitedResponse}).
 */
@Component
public class AdminWriteRateLimitFilter extends OncePerRequestFilter {

	static final int WRITES_PER_MINUTE = 60;
	private static final Duration WINDOW = Duration.ofMinutes(1);
	private static final Set<String> WRITE_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");
	private static final PathPattern ADMIN_PATH = PathPatternParser.defaultInstance.parse("/api/v1/admin/**");

	private final FixedWindowRateLimiter writes;

	public AdminWriteRateLimitFilter(Clock clock) {
		this.writes = new FixedWindowRateLimiter(clock, WRITES_PER_MINUTE, WINDOW);
	}

	/** Olvida todos los contadores. Para tests: el reloj fijo de la suite nunca rota la ventana. */
	public void clear() {
		writes.clear();
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String subject = limitedSubject(request);
		if (subject != null && !writes.tryAcquire(subject)) {
			RateLimitedResponse.write(response, writes.retryAfterSeconds(subject));
			return;
		}
		chain.doFilter(request, response);
	}

	/** El {@code sub} del usuario autenticado si la petición es una escritura del panel; si no, nulo. */
	private String limitedSubject(HttpServletRequest request) {
		if (!WRITE_METHODS.contains(request.getMethod())) {
			return null;
		}
		String uri = request.getRequestURI().substring(request.getContextPath().length());
		if (!ADMIN_PATH.matches(PathContainer.parsePath(uri))) {
			return null;
		}
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (authentication instanceof JwtAuthenticationToken token && authentication.isAuthenticated()) {
			String subject = token.getToken().getSubject();
			return subject == null || subject.isBlank() ? null : subject;
		}
		return null;
	}

}
