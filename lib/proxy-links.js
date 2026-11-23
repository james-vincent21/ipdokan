// One rule for every link on the site: API proxies (and the proxy categories they belong to)
// open the proxy store with the matching type selected; everything else uses the catalog/product pages.
const categoryProxyTypes = {
  "monthly isp proxy": "isp",
  "private proxy": "datacenter",
  "residential static proxy": "static-residential",
};

export const proxyStoreHref = (type) => `/proxies?type=${encodeURIComponent(type)}`;

export function categoryHref(category) {
  const type = categoryProxyTypes[String(category || "").trim().toLowerCase()];
  return type ? proxyStoreHref(type) : `/catalog?category=${encodeURIComponent(category || "")}`;
}

export function productHref(product) {
  if (product?.proxyType) return proxyStoreHref(product.proxyType);
  return product?.id ? `/product/${encodeURIComponent(product.id)}` : "/catalog";
}
