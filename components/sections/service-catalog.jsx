"use client";

import { useEffect, useState } from "react";
import { useCurrencyPreference } from "@/lib/currency-preference";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function formatPrice(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${Number(amount || 0).toFixed(2)}`; }
}

const services = [
  {
    id: "discount",
    index: "01",
    title: "Discount Proxy Panel",
    category: "Proxy management",
    description: "Browse available proxy options and manage services from one panel.",
    icon: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01M7 12h4m-4 4h10m-3-4h3" /></>,
  },
  {
    id: "servers",
    index: "02",
    title: "Dedicated Servers",
    category: "Bare metal",
    description: "Dedicated server options for workloads that need their own resources.",
    icon: <><rect x="4" y="3" width="16" height="7" rx="2" /><rect x="4" y="14" width="16" height="7" rx="2" /><path d="M8 6.5h.01M8 17.5h.01M12 6.5h5M12 17.5h5" /></>,
  },
  {
    id: "isp",
    index: "03",
    title: "Monthly ISP Proxy",
    category: "Monthly plans",
    description: "Find ISP proxy plans organized around monthly use.",
    icon: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18m0-18a15 15 0 0 0 0 18M5.5 6.5h13M5.5 17.5h13" /></>,
  },
  {
    id: "private-proxy",
    index: "04",
    title: "Private Proxy",
    category: "Private access",
    description: "Explore private proxy options for your browsing and work needs.",
    icon: <><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
  },
  {
    id: "residential",
    index: "05",
    title: "Residential Static Proxy",
    category: "Static residential",
    description: "Browse static residential proxy options for location-aware tasks.",
    icon: <><path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H5a2 2 0 0 1-2-2v-9Z" /><path d="M9 10h6" /></>,
  },
  {
    id: "vps",
    index: "06",
    title: "VPS",
    category: "Virtual servers",
    description: "Explore virtual server options for flexible online projects.",
    icon: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 9h.01M10 9h.01M7 13h10M7 16h6" /></>,
  },
];

export function ServiceCatalog() {
  const [products, setProducts] = useState([]);
  const [currency] = useCurrencyPreference();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/api/products`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) return;
        const allProducts = result.products || [];
        const featuredProducts = allProducts
          .filter((product) => product.showInPopular)
          .sort((a, b) => (a.popularOrder || 0) - (b.popularOrder || 0));
        const visibleProducts = featuredProducts.length ? featuredProducts : allProducts.slice(0, 6);
        setProducts(visibleProducts.map((product) => ({
          ...product,
          mark: product.codeNumber,
          style: "vless",
        })));
      })
      .catch((error) => {
        if (error.name !== "AbortError") setProducts([]);
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="services-section" id="products" aria-labelledby="services-title">
      <div className="services-container">
        <header className="services-heading">
          <span className="section-eyebrow"><span /> SERVICE CATALOG</span>
          <h2 id="services-title">Find the right service for your work.</h2>
          <p>Explore proxy and server categories, all gathered in one place.</p>
        </header>

        <section className="popular-products" aria-labelledby="popular-products-title">
          <h3 id="popular-products-title">Popular product</h3>
          <div className="popular-products-grid">
            {products.map((product) => {
              const variants = product.variants || [];
              const productPrice = currency === "BDT"
                ? (variants.length ? Math.min(...variants.map((variant) => Number(variant.priceBdt ?? 0))) : Number(product.priceBdt ?? 0))
                : (variants.length ? Math.min(...variants.map((variant) => Number(variant.priceUsd ?? variant.price))) : Number(product.priceUsd ?? product.price));
              return (
              <a className="popular-product-card" href={product.brand ? `/catalog?brand=${encodeURIComponent(product.brand)}` : `/product/${encodeURIComponent(product.id)}`} key={product.id}>
                <span className={`popular-product-art ${product.style || "vless"}`} aria-hidden="true">
                  {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span className="product-stage"><span>{product.name?.trim()?.charAt(0).toUpperCase() || "P"}</span></span>}
                </span>
                <span className="popular-product-details">
                  <span className="popular-product-meta"><span>{formatPrice(productPrice, currency)}</span>{product.available !== undefined && <span className={product.available ? "catalog-stock" : "catalog-stock is-empty"}>{product.available} in stock</span>}{product.rating && <span className="product-rating"><b>★</b> {product.rating} <i>☰</i> {product.reviews}</span>}</span>
                  <span className="popular-product-name">{product.name}</span>
                  <span className="catalog-home-cta">Purchase →</span>
                </span>
              </a>
              );
            })}
            {!products.length && <p className="popular-products-empty">No products are featured yet.</p>}
          </div>
          <a className="view-products-button" href="/catalog">View all products <span aria-hidden="true">→</span></a>
        </section>

        <div className="services-grid">
          {services.map((service) => (
            <a className="service-card" id={service.id} href={`/catalog?category=${encodeURIComponent(service.title)}`} key={service.id}>
              <div className="service-card-top">
                <span className="service-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none">{service.icon}</svg></span>
                <span className="service-index">{service.index} / 06</span>
              </div>
              <span className="service-category">{service.category}</span>
              <h3>{service.title}</h3>
              <p>{service.description}</p>
              <div className="service-card-footer"><span>Explore category</span><span className="service-arrow" aria-hidden="true">↗</span></div>
            </a>
          ))}
        </div>
        <div className="services-note" id="support">
          <span className="services-note-icon" aria-hidden="true">?</span>
          <p><strong>Not sure what you need?</strong><span>Use the chat button to ask about a service.</span></p>
        </div>
      </div>
    </section>
  );
}
