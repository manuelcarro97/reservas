package io.github.manuelcarro97.reservas.config;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import io.github.manuelcarro97.reservas.adapter.in.web.RateLimitFilter;

@Configuration(proxyBeanMethods = false)
class SecurityConfig {

	/**
	 * El filtro de límite por IP va solo en la cadena de seguridad: como bean de tipo {@code Filter} Spring Boot lo
	 * registraría también como filtro de servlet y contaría cada petición dos veces.
	 */
	@Bean
	FilterRegistrationBean<RateLimitFilter> rateLimitFilterRegistration(RateLimitFilter rateLimitFilter) {
		FilterRegistrationBean<RateLimitFilter> registration = new FilterRegistrationBean<>(rateLimitFilter);
		registration.setEnabled(false);
		return registration;
	}

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, RateLimitFilter rateLimitFilter) throws Exception {
		return http
			// Antes de autenticar: un token inválido o una ráfaga de peticiones anónimas ya cuentan.
			.addFilterBefore(rateLimitFilter, BearerTokenAuthenticationFilter.class)
			// API sin cookies ni sesión: la identidad llega en el token Bearer de Firebase, así que no hay CSRF.
			.csrf(AbstractHttpConfigurer::disable)
			.cors(Customizer.withDefaults())
			.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.authorizeHttpRequests(requests -> requests
				.requestMatchers("/api/v1/restaurants/**", "/api/v1/reservations/**", "/swagger-ui/**",
						"/swagger-ui.html", "/v3/api-docs/**", "/actuator/health", "/error")
				.permitAll()
				.anyRequest()
				.authenticated())
			.oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
			.build();
	}

	@Bean
	CorsConfigurationSource corsConfigurationSource(
			@Value("${app.cors.allowed-origins}") List<String> allowedOrigins) {
		CorsConfiguration configuration = new CorsConfiguration();
		configuration.setAllowedOrigins(allowedOrigins);
		configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		configuration.setAllowedHeaders(List.of("Authorization", "Content-Type"));
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/**", configuration);
		return source;
	}

}
