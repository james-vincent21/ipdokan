"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrencyPreference } from "@/lib/currency-preference";
import { productHref } from "@/lib/proxy-links";
import { useErrorToast } from "@/lib/toast";
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const categoryAliases = {
  "discount proxy panel": ["proxy management"],
  "dedicated servers": ["bare metal"],
  "monthly isp proxy": ["monthly plans"],
  "private proxy": ["private access"],
  "residential static proxy": ["static residential"],
  "vps": ["virtual servers"],
};

const faqs = [
  ["Which product should I choose?", "Choose a product based on the kind of IP, location, and connection you need. Residential products use residential IPs, while VPN products provide an easy-to-use encrypted connection."],
  ["What is the difference between residential and residential extra?", "Both categories are intended for residential proxy use. Check each product page for its available locations, session options, and plan details before ordering."],
  ["Can I use these products on mobile?", "Some products support mobile devices. Check the product details for supported apps, protocols, and setup instructions."],
  ["How do I compare product prices?", "Prices and plan units vary by provider. Open a product to review its current plans and included features."],
  ["Need help choosing a product?", "Contact IP Dokan support with your use case and preferred locations, and the team can help you compare suitable options."],
];

function formatCatalogPrice(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${Number(amount).toFixed(2)}`; }
}

export function ProductCatalogPage() {
  const [category, setCategory] = useState("All");
  const [brand, setBrand] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("Popular");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  useErrorToast(loadError);
  const [currency] = useCurrencyPreference();
  useEffect(() => {
    const requestedCategory = new URLSearchParams(window.location.search).get("category");
    const requestedBrand = new URLSearchParams(window.location.search).get("brand");
    if (requestedCategory) setCategory(requestedCategory);
    if (requestedBrand) setBrand(requestedBrand);
    fetch(`${apiUrl}/api/products`, { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load products.");
      setProducts((result.products || []).map((product) => ({ ...product, displayPrice: product.variants?.length ? null : `${product.currency} ${product.price}`, mark: product.codeNumber, style: "vless", categories: [product.category] })));
      setLoadError("");
    }).catch(() => setLoadError("Could not load products. Please check your connection and try again.")).finally(() => setLoading(false));
  }, []);
  const categoryOptions = useMemo(() => ["All", ...new Set([...(category !== "All" ? [category] : []), ...products.map((product) => product.category || product.categories?.[0]).filter(Boolean)])], [category, products]);
  const shownProducts = useMemo(() => {
    const normalizedBrand = brand.trim().toLowerCase();
    const normalizedCategory = category.trim().toLowerCase();
    const matchingCategories = [normalizedCategory, ...(categoryAliases[normalizedCategory] || [])];
    const categoryFiltered = products.filter((product) => category === "All" || matchingCategories.includes((product.category || product.categories?.[0] || "").trim().toLowerCase()));
    const brandFiltered = categoryFiltered.filter((product) => {
      if (!normalizedBrand) return true;
      const productBrand = (product.brand || "").trim().toLowerCase();
      const productName = (product.name || "").trim().toLowerCase();
      return productBrand === normalizedBrand || productName === normalizedBrand || productName.includes(normalizedBrand);
    });
    const filtered = (brand && brandFiltered.length ? brandFiltered : categoryFiltered).filter((product) => product.name.toLowerCase().includes(query.trim().toLowerCase()));
    if (sort === "Name A–Z") filtered.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "Top rated") filtered.sort((a, b) => b.rating - a.rating);
    return filtered;
  }, [brand, category, query, sort, products]);

  return (
    <main className="catalog-page">
      <header className="catalog-page-heading"><h1>{brand || (category !== "All" ? category : "Catalog")}</h1><p>{brand ? `All products from ${brand}` : category !== "All" ? `Products in ${category}` : "All available products in one place"}</p></header>
      <section className="catalog-browser" aria-label="Browse products">
        <div className="catalog-toolbar">
          <div className="catalog-tabs" role="group" aria-label="Filter by category">
            {categoryOptions.map((item) => <button key={item} type="button" className={category === item ? "is-active" : ""} aria-pressed={category === item} onClick={() => {
              setCategory(item);
              const url = new URL(window.location.href);
              if (item === "All") {
                setBrand("");
                url.searchParams.delete("category");
                url.searchParams.delete("brand");
              } else {
                url.searchParams.set("category", item);
                url.searchParams.delete("brand");
                setBrand("");
              }
              window.history.replaceState(null, "", url);
            }}>{item}</button>)}
          </div>
          <label className="catalog-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products..." aria-label="Search products" /></label>
          <label className="catalog-sort"><span className="sr-only">Sort products</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option>Popular</option><option>Top rated</option><option>Name A–Z</option></select></label>
        </div>
        <div className="catalog-product-grid" aria-live="polite">
          {loading && <p className="catalog-empty">Loading products…</p>}
          {!loading && loadError && <p className="catalog-empty" role="alert">{loadError}</p>}
          {!loading && !loadError && shownProducts.map((product) => {
            const usdPrices = product.variants?.length ? product.variants.map((variant) => Number(variant.priceUsd ?? variant.price)) : [Number(product.priceUsd ?? product.price)];
            const bdtPrices = product.variants?.length ? product.variants.map((variant) => Number(variant.priceBdt ?? 0)) : [Number(product.priceBdt ?? 0)];
            // API plans priced at 0 have no price yet; they are left out of the range.
            const selectedPrices = (currency === "BDT" ? bdtPrices : usdPrices).filter((price) => !product.instantDelivery || price > 0);
            const minimumPrice = Math.min(...selectedPrices);
            const maximumPrice = Math.max(...selectedPrices);
            const multiPriceLabel = !selectedPrices.length ? "Contact admin" : minimumPrice === maximumPrice
              ? formatCatalogPrice(minimumPrice, currency)
              : `${formatCatalogPrice(minimumPrice, currency)} – ${formatCatalogPrice(maximumPrice, currency)}`;
            const stars = Math.round(Number(product.rating) || 0);
            // API proxies are bought on the proxy store page, where the buyer picks location and provider.
            const href = productHref(product);
            return <article className="store-product-card" key={product.id || product.name}>
              <a className="store-product-art" href={href} aria-label={`View ${product.name}`}>
                {Number(product.discountPercent) > 0 && <span className="store-product-discount">-{product.discountPercent}%</span>}
                {product.imageUrl ? <img src={product.imageUrl} alt={product.name} /> : <span className="store-product-placeholder">{product.name?.trim()?.charAt(0).toUpperCase() || "P"}</span>}
              </a>
              <div className="store-product-info">
                <h2>{product.name}</h2>
                <p className="store-product-category">{product.category || product.categories?.[0] || "Product"}</p>
                {product.instantDelivery && <p className="instant-delivery-badge">⚡ Ready in 3–5 min</p>}
                <p className="store-product-rating" aria-label={`${product.rating || 0} out of 5 stars`}><span>{Array.from({ length: 5 }, (_, index) => <i key={index} className={index < stars ? "is-filled" : ""}>★</i>)}</span>{Number(product.reviewCount || product.reviews) > 0 && <small>({product.reviewCount || product.reviews})</small>}</p>
                <p className={product.available ? "catalog-stock" : "catalog-stock is-empty"}>{product.available || 0} in stock</p>
                <strong className="store-product-price">{multiPriceLabel}</strong>
                <a className="store-product-purchase" href={href}>PURCHASE</a>
              </div>
            </article>;
          })}
          {!loading && !loadError && !shownProducts.length && <p className="catalog-empty">No products are available in this category yet.</p>}
        </div>
      </section>
      <section className="catalog-faq" aria-labelledby="catalog-faq-title">
        <p className="catalog-faq-kicker">PRODUCT HELP</p><h2 id="catalog-faq-title">Frequently asked questions</h2><p className="catalog-faq-intro">A few things to know when choosing a product.</p>
        <div className="catalog-faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>
      </section>
    </main>
  );
}
