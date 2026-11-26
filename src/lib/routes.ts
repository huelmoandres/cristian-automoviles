/** Patrones para el router. */
export const PATHS = {
  home: "/",
  collections: "cobranzas",
  sales: "ventas",
  newSale: "ventas/nueva",
  saleDetail: "ventas/:id",
  clients: "clientes",
  clientDetail: "clientes/:id",
  vehicles: "vehiculos",
  financing: "financiacion",
  settings: "configuracion",
} as const;

export const NEW_SALE_PARAMS = { clientId: "clientId", vehicleId: "vehicleId" } as const;
export const VEHICLES_PARAMS = { search: "q", status: "estado" } as const;
/** Valor de `VEHICLES_PARAMS.status` para mostrar todos los estados. */
export const ALL_STATUSES = "todos";

/** Agrega a `path` los parámetros definidos (omite vacíos). */
function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Builders de URLs para navegar y linkear. */
export const routes = {
  home: () => "/",
  collections: () => `/${PATHS.collections}`,
  sales: () => `/${PATHS.sales}`,
  newSale: (preset: { clientId?: number; vehicleId?: number } = {}) =>
    withQuery(`/${PATHS.newSale}`, {
      [NEW_SALE_PARAMS.clientId]: preset.clientId,
      [NEW_SALE_PARAMS.vehicleId]: preset.vehicleId,
    }),
  saleDetail: (id: number) => `/${PATHS.sales}/${id}`,
  clients: () => `/${PATHS.clients}`,
  clientDetail: (id: number) => `/${PATHS.clients}/${id}`,
  vehicles: (preset: { search?: string } = {}) =>
    withQuery(`/${PATHS.vehicles}`, { [VEHICLES_PARAMS.search]: preset.search }),
  financing: () => `/${PATHS.financing}`,
  settings: () => `/${PATHS.settings}`,
};
