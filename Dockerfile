FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /app
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN sh mvnw -B -q dependency:go-offline
COPY src src
RUN sh mvnw -B -q package -DskipTests

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S app && adduser -S app -G app
USER app
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar

# Memoria por defecto pensada para un contenedor de 512 MB (plan gratuito de Render). La JVM lee JAVA_TOOL_OPTIONS
# sola, sin tocar el ENTRYPOINT, y una variable de entorno con el mismo nombre (Render, docker run -e) la sustituye
# entera: si la cambias, repite los flags que quieras conservar.
#  - MaxRAMPercentage=60: el heap máximo es el 60 % del límite del contenedor (~300 MB de 512). El resto es para lo que
#    no es heap: metaspace, code cache, pila de los hilos de Tomcat y búferes directos.
#  - UseSerialGC: GC de un solo hilo y sin estructuras auxiliares grandes; G1 gasta más memoria extra y hace poco
#    provecho con un heap tan pequeño y una fracción de CPU.
#  - Xss512k: pila de 512 KB por hilo en vez de 1 MB. Tomcat crea hasta 200 hilos de petición.
#  - TieredStopAtLevel=1: solo el compilador C1. Arranca antes y gasta menos CPU y memoria que con C2, a costa de
#    algo de rendimiento punta que esta API no necesita.
#  - ExitOnOutOfMemoryError: si se agota la memoria el proceso termina y el hosting lo reinicia, en vez de quedar
#    vivo a medias y respondiendo errores.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=60 -XX:+UseSerialGC -Xss512k -XX:TieredStopAtLevel=1 -XX:+ExitOnOutOfMemoryError"

EXPOSE 8080
# wget viene con busybox en la base alpine, no hace falta instalar nada. Render ignora esta línea y usa su propio
# health check (healthCheckPath en render.yaml); sirve para `docker ps` y para depends_on con service_healthy.
# 127.0.0.1 y no localhost: Tomcat escucha en IPv4 y alpine puede resolver localhost a ::1 primero.
# start-period largo: con la CPU limitada de un contenedor pequeño el arranque (Flyway, Hibernate) tarda.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD wget -q -T 4 -O /dev/null "http://127.0.0.1:${PORT:-8080}/actuator/health" || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]
