# Imagen de producción: compila la web (Angular) y la API (.NET) y sirve las dos desde la API en el puerto 8080.

FROM node:22-alpine AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx ng build --configuration production

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src
COPY backend/Taller.Api/Taller.Api.csproj backend/Taller.Api/
RUN dotnet restore backend/Taller.Api/Taller.Api.csproj
COPY backend/ backend/
RUN dotnet publish backend/Taller.Api/Taller.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=api /app ./
COPY --from=web /src/frontend/dist/frontend/browser ./wwwroot
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_gcServer=0
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "Taller.Api.dll"]
