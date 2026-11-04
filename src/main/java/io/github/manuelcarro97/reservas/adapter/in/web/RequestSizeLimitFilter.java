package io.github.manuelcarro97.reservas.adapter.in.web;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.http.server.PathContainer;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Rechaza con 413 los cuerpos de más de {@value #MAX_BODY_BYTES} bytes en {@code /api/**} antes de deserializarlos
 * (sin tope, un JSON enorme se lee entero en memoria, y el hosting gratuito tiene poca). El mayor cuerpo legítimo es
 * el {@code PUT} del plano con 60 mesas, de unos 8 KB en el peor caso (ver {@code RequestSizeLimitIT}).
 * <p>
 * Dos defensas: si la petición declara {@code Content-Length} y pasa del tope, se rechaza sin leer nada; si no lo
 * declara (transferencia por trozos) o miente, la lectura se corta con {@link RequestBodyTooLargeException} al pasar
 * el tope y {@link ApiExceptionHandler} la convierte en el mismo 413. Es un filtro de la cadena de seguridad, después de
 * CORS, para que el navegador pueda leer la respuesta (ver {@code SecurityConfig}).
 */
@Component
public class RequestSizeLimitFilter extends OncePerRequestFilter {

	static final long MAX_BODY_BYTES = 64 * 1024;

	private static final PathPattern API_PATH = PathPatternParser.defaultInstance.parse("/api/**");
	private static final String DETAIL = "The request body is too large";

	private final JacksonJsonHttpMessageConverter converter = new JacksonJsonHttpMessageConverter();

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String uri = request.getRequestURI().substring(request.getContextPath().length());
		if (!API_PATH.matches(PathContainer.parsePath(uri))) {
			chain.doFilter(request, response);
			return;
		}
		if (request.getContentLengthLong() > MAX_BODY_BYTES) {
			reject(response);
			return;
		}
		chain.doFilter(new LimitedRequest(request), response);
	}

	private void reject(HttpServletResponse response) throws IOException {
		ProblemDetail problem = ApiExceptionHandler.problem(HttpStatus.CONTENT_TOO_LARGE, DETAIL, "PAYLOAD_TOO_LARGE");
		response.setStatus(problem.getStatus());
		converter.write(problem, MediaType.APPLICATION_PROBLEM_JSON, new ServletServerHttpResponse(response));
	}

	/** La petición con un cuerpo que se corta al pasar el tope. */
	private static final class LimitedRequest extends HttpServletRequestWrapper {

		private ServletInputStream stream;

		LimitedRequest(HttpServletRequest request) {
			super(request);
		}

		@Override
		public ServletInputStream getInputStream() throws IOException {
			if (stream == null) {
				stream = new LimitedInputStream(super.getInputStream());
			}
			return stream;
		}

		@Override
		public BufferedReader getReader() throws IOException {
			String encoding = getCharacterEncoding();
			Charset charset = encoding == null ? StandardCharsets.UTF_8 : Charset.forName(encoding);
			return new BufferedReader(new InputStreamReader(getInputStream(), charset));
		}

	}

	private static final class LimitedInputStream extends ServletInputStream {

		private final ServletInputStream delegate;
		private long read;

		LimitedInputStream(ServletInputStream delegate) {
			this.delegate = delegate;
		}

		@Override
		public int read() throws IOException {
			int value = delegate.read();
			if (value >= 0) {
				count(1);
			}
			return value;
		}

		@Override
		public int read(byte[] buffer, int offset, int length) throws IOException {
			int count = delegate.read(buffer, offset, length);
			if (count > 0) {
				count(count);
			}
			return count;
		}

		private void count(int bytes) throws IOException {
			read += bytes;
			if (read > MAX_BODY_BYTES) {
				throw new RequestBodyTooLargeException(MAX_BODY_BYTES);
			}
		}

		@Override
		public boolean isFinished() {
			return delegate.isFinished();
		}

		@Override
		public boolean isReady() {
			return delegate.isReady();
		}

		@Override
		public void setReadListener(ReadListener listener) {
			delegate.setReadListener(listener);
		}

	}

}
