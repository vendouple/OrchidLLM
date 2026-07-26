# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["src/OrchidLLM.Web/OrchidLLM.Web.csproj", "OrchidLLM.Web/"]
RUN dotnet restore "OrchidLLM.Web/OrchidLLM.Web.csproj"
COPY src/OrchidLLM.Web/ OrchidLLM.Web/
RUN dotnet publish "OrchidLLM.Web/OrchidLLM.Web.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "OrchidLLM.Web.dll"]
