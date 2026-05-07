document.addEventListener("DOMContentLoaded", async () => {
  const APP_URL = "https://mooselabs-bundle-app.onrender.com";
  
  const rootDiv        = document.getElementById("gbb-custom-bundle-root");    
  const stepsContainer = document.getElementById("gbb-dynamic-steps-container");
  const modal          = document.getElementById("gbb-modal");
  const overlay        = document.getElementById("gbb-modal-overlay");
  const atcBtn         = document.getElementById("gbb-add-to-cart-btn");

  if (!rootDiv) return;
  const productId = rootDiv.getAttribute("data-product-id");

  if (modal && overlay) {
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
  }

  let bundleData       = null;
  let selections       = {}; 
  let currentModalCatId = null;

  try {
    const res = await fetch(`${APP_URL}/api/bundle/${productId}`);
    if (res.ok) bundleData = await res.json();
    else return stepsContainer.innerHTML = "<p>No bundle assigned.</p>";
  } catch (err) {
    return stepsContainer.innerHTML = "<p>Connection failed.</p>";
  }

  if (!bundleData.categories) return;

  // 🌟 FETCH LIVE PRICING, INVENTORY & METAFIELDS 🌟
  stepsContainer.innerHTML = '<p style="text-align: center;">Syncing live prices & stock...</p>';

  const uniqueHandles = [...new Set(
    bundleData.categories.flatMap(c => c.products.map(p => p.handle).filter(Boolean))
  )];

  if (uniqueHandles.length > 0) {
    const liveProductData = {};
    
    // 1. Fetch standard live inventory/prices
    await Promise.all(uniqueHandles.map(async (handle) => {
      try {
        const req = await fetch(`/products/${handle}.js`);
        if (req.ok) {
          liveProductData[handle] = await req.json();
        }
      } catch (e) {
        console.error("Failed to fetch live data for", handle);
      }
    }));

    // 2. Fetch Metafields for categories that have the checkbox enabled!
    let hiddenVariantIds = [];
    const variantIdsToCheck = [];
    bundleData.categories.forEach(cat => {
      if (cat.hideVariantsByMetafield) {
        cat.products.forEach(p => variantIdsToCheck.push(p.variantId));
      }
    });

    if (variantIdsToCheck.length > 0) {
      try {
        const shopDomain = window.Shopify?.shop || "moose-labs.myshopify.com";
        const metaRes = await fetch(`${APP_URL}/api/check-metafields?shop=${shopDomain}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variantIds: variantIdsToCheck })
        });
        if (metaRes.ok) {
          const metaData = await metaRes.json();
          hiddenVariantIds = metaData.hiddenVariants || [];
        }
      } catch(e) {
        console.error("Failed to fetch metafields", e);
      }
    }

    // 3. Filter the UI based on inventory AND metafields
    bundleData.categories.forEach(cat => {
      const availableProducts = [];
      cat.products.forEach(p => {
        if (p.handle && liveProductData[p.handle]) {
          const liveProd = liveProductData[p.handle];
          const numericVariantId = String(p.variantId).split('/').pop();
          const liveVariant = liveProd.variants.find(v => String(v.id) === numericVariantId);

          if (liveVariant && liveVariant.available) {
            
            // 🛑 METAFIELD CHECK: Hide it if the backend said it's hidden!
            if (cat.hideVariantsByMetafield && hiddenVariantIds.includes(numericVariantId)) {
              return; // Skip adding this product to the UI
            }

            p.price = liveVariant.price / 100;
            availableProducts.push(p);
          }
        } else {
          // Fallback if handle wasn't saved yet
          availableProducts.push(p);
        }
      });
      cat.products = availableProducts;
    });
  }

  bundleData.categories.forEach(cat => { selections[cat.id] = []; });

  // ── HELPERS ──────────────────────────────────────────────────────────────

  const getBaseTotal = () => {
    let total = 0;
    Object.values(selections).forEach(catItems =>
      catItems.forEach(item => total += item.product.price * item.qty)
    );
    return total;
  };

  const getFinalPrice = (baseTotal) => {
    if (!bundleData.discountEnabled || bundleData.discountValue <= 0) return baseTotal;
    if (bundleData.discountType === "PERCENTAGE") {
      return baseTotal * (1 - bundleData.discountValue / 100);
    } else if (bundleData.discountType === "FIXED") {
      return Math.max(0, baseTotal - bundleData.discountValue);
    } else if (bundleData.discountType === "FIXED_PRICE") {
      return bundleData.discountValue;
    }
    return baseTotal;
  };

  const getDiscountLabel = () => {
    if (!bundleData.discountEnabled || bundleData.discountValue <= 0) return "";
    if (bundleData.discountType === "PERCENTAGE") return `${bundleData.discountValue}% off`;
    if (bundleData.discountType === "FIXED")       return `$${bundleData.discountValue} off`;
    if (bundleData.discountType === "FIXED_PRICE") {
      const base = getBaseTotal();
      const save = base - bundleData.discountValue;
      return save > 0 ? `Save $${save.toFixed(2)}` : "";
    }
    return "";
  };

  const isCatFulfilled = (catId) => {
    const cat = bundleData.categories.find(c => c.id === catId);
    const required = parseInt(cat?.rule?.value || 1);
    const selected = (selections[catId] || []).reduce((s, i) => s + i.qty, 0);
    return selected >= required;
  };

  const allCatsFulfilled = () =>
    bundleData.categories.every(cat => isCatFulfilled(cat.id));

  // ── RENDER MAIN UI ───────────────────────────────────────────────────────

  const renderMainUI = () => {
    stepsContainer.innerHTML = "";
    
    bundleData.categories.forEach(cat => {
      const section     = document.createElement("div");
      section.className = "gbb-category-section";
      
      const requiredQty       = parseInt(cat.rule?.value || 1);
      const currentSelected   = selections[cat.id];
      const totalSelectedQty  = currentSelected.reduce((sum, item) => sum + item.qty, 0);
      const fulfilled         = totalSelectedQty >= requiredQty;

      let html = `<div class="gbb-category-title">${cat.name}</div>`;

      currentSelected.forEach(item => {
        for (let i = 0; i < item.qty; i++) {
          html += `
            <div class="gbb-slot-row filled">
              <div class="gbb-slot-content">
                <img src="${item.product.imageUrl}" class="gbb-slot-img">
                <span>${item.product.title}</span>
              </div>
              <div class="gbb-remove-icon" onclick="removeItem('${cat.id}', '${item.product.variantId}')"><svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"> <circle cx="16" cy="16" r="10" fill="white"></circle><path d="M16 2C8.2 2 2 8.2 2 16C2 23.8 8.2 30 16 30C23.8 30 30 23.8 30 16C30 8.2 23.8 2 16 2ZM21.4 23L16 17.6L10.6 23L9 21.4L14.4 16L9 10.6L10.6 9L16 14.4L21.4 9L23 10.6L17.6 16L23 21.4L21.4 23Z" fill="#99C1DE"></path></svg></div>
            </div>`;
        }
      });

      const emptySlots = Math.max(0, requiredQty - totalSelectedQty);
      for (let i = 0; i < emptySlots; i++) {
        html += `
          <div class="gbb-slot-row empty" onclick="openModal('${cat.id}')">
            <div class="gbb-slot-content"><span>Add</span></div>
            <div style="font-weight:bold;font-size:18px;">+</div>
          </div>`;
      }
      if (emptySlots === 0) {
        html += `
          <div class="gbb-slot-row empty" style="justify-content:center;border:1px dashed #ccc;" onclick="openModal('${cat.id}')">
            <span style="font-weight:bold;">+ Add more ${cat.name}</span>
          </div>`;
      }

      section.innerHTML = html;
      stepsContainer.appendChild(section);
    });

    calculateTotals();
  };

  window.removeItem = (catId, vId) => {
    const idx = selections[catId].findIndex(i => i.product.variantId === vId);
    if (idx > -1) {
      selections[catId][idx].qty -= 1;
      if (selections[catId][idx].qty <= 0) selections[catId].splice(idx, 1);
    }
    renderMainUI();
  };

  // ── MODAL ────────────────────────────────────────────────────────────────

  window.openModal = (catId) => {
    const existingModalBody = modal.querySelector('.gbbMixModalBody');
    const savedScrollPosition = (existingModalBody && currentModalCatId === catId) 
      ? existingModalBody.scrollTop 
      : 0;

    currentModalCatId = catId;
    overlay.classList.add("active");
    modal.classList.add("gbbMixProductsModalOpen");

    const cat         = bundleData.categories.find(c => c.id === catId);
    const requiredQty = parseInt(cat.rule?.value || 1);

    const baseTotal      = getBaseTotal();
    const finalPrice     = getFinalPrice(baseTotal);
    const discLabel      = getDiscountLabel();
    const bundleComplete = allCatsFulfilled();
    let footerDiscLabel  = bundleComplete ? discLabel : "";

    // Tabs
    let tabsHtml = `<div class="gbb-tabs-container">`;
    bundleData.categories.forEach(c => {
      const isActive = c.id === catId ? "active" : "";
      tabsHtml += `<div class="gbb-tab ${isActive}" onclick="navToTab('${c.id}')">${c.name}</div>`;
    });
    tabsHtml += `</div>`;

    // Rule text + discount message
    let ruleHtml = `<div class="gbb-rule-text">Add at least ${requiredQty} ${cat.name}</div>`;

    if (bundleData.discountEnabled && bundleData.discountValue > 0) {
      const totalRequired = bundleData.categories.reduce((sum, c) =>
        sum + parseInt(c.rule?.value || 1), 0);
      const totalSelected = Object.values(selections).reduce((sum, catItems) =>
        sum + catItems.reduce((s, i) => s + i.qty, 0), 0);
      const conditionDiff     = Math.max(0, totalRequired - totalSelected);
      const discountValue     = bundleData.discountValue;
      const discountValueUnit = bundleData.discountType === "PERCENTAGE" ? "%" :
                                bundleData.discountType === "FIXED"       ? " off" : "";

      let discMsgHtml = "";
      if (bundleComplete && bundleData.successMessage) {
        discMsgHtml = `<div class="gbb-discount-msg gbb-discount-success" style="text-align:center;padding:6px 16px;">${bundleData.successMessage}</div>`;
      } else if (!bundleComplete && bundleData.discountMessage) {
        const msg = bundleData.discountMessage
          .replace(/\{\{discountConditionDiff\}\}/g, conditionDiff)
          .replace(/\{\{discountValue\}\}/g, discountValue)
          .replace(/\{\{discountValueUnit\}\}/g, discountValueUnit);
        discMsgHtml = `<div class="gbb-discount-msg" style="text-align:center;padding:6px 16px;">${msg}</div>`;
      }
      ruleHtml += discMsgHtml;
    }

    const headerHtml = `
      <div class="gbb-modal-header">
        <div class="gbb-modal-close" onclick="closeModal()">
          <svg viewBox="0 0 20 20" width="20" height="20"><path d="M13.97 15.03a.75.75 0 1 0 1.06-1.06l-3.97-3.97 3.97-3.97a.75.75 0 0 0-1.06-1.06l-3.97 3.97-3.97-3.97a.75.75 0 0 0-1.06 1.06l3.97 3.97-3.97 3.97a.75.75 0 1 0 1.06 1.06l3.97-3.97 3.97 3.97Z"></path></svg>
        </div>
        ${tabsHtml}
        ${ruleHtml}
      </div>`;

    let bodyHtml = `<div class="gbbMixModalBody"><div class="gbbMixProductsItemsContainer">`;
    
    if (cat.products.length === 0) {
      bodyHtml += `<div style="padding: 20px; text-align: center; width: 100%;">Out of stock or Hidden.</div>`;
    } else {
      cat.products.forEach(p => {
        const selectedItem    = selections[catId].find(i => i.product.variantId === p.variantId);
        const currentQty      = selectedItem ? selectedItem.qty : 0;
        const isSelectedClass = currentQty > 0 ? "selected" : "";
        const checkBadge      = currentQty > 0 ? `<div class="gbb-check-badge">✓</div>` : "";

        bodyHtml += `
          <div class="gbbMixProductItem ${isSelectedClass}">
            ${checkBadge}
            <img src="${p.imageUrl}" style="width:100%; aspect-ratio: 1/1; object-fit: cover; border-radius:5px; margin-bottom:10px;">
            <div style="font-weight:bold;font-size:14px;">${p.title}</div>
            <div style="color:#666;margin-bottom:10px;">$${p.price.toFixed(2)}</div>
            ${currentQty > 0 ? `
              <div class="gbb-qty-control">
                <div class="gbb-qty-btn" onclick="updateQty('${catId}', '${p.variantId}', -1)">-</div>
                <div class="gbb-qty-val">${currentQty}</div>
                <div class="gbb-qty-btn" onclick="updateQty('${catId}', '${p.variantId}', 1)">+</div>
              </div>` : `
              <div class="gbbMixAddtoCartBtn" style="padding:8px;background:#99c1de;color:#000;" onclick="updateQty('${catId}', '${p.variantId}', 1)">
                Add
              </div>`}
          </div>`;
      });
    }
    
    bodyHtml += `</div></div>`;

    const totalItems = Object.values(selections).flat().reduce((s, i) => s + i.qty, 0);

    let priceDisplay = `$${baseTotal.toFixed(2)}`;
    if (bundleComplete && baseTotal > finalPrice && baseTotal > 0) {
      priceDisplay = `<s style="opacity:0.6">$${baseTotal.toFixed(2)}</s> $${finalPrice.toFixed(2)}`;
    }

    const footerHtml = `
      <div class="gbb-floating-footer">
        <div id="gbb-tooltip" class="gbb-tooltip">Add at least ${requiredQty} products on this step</div>
        <div class="gbb-pill-tracker">
          <span>${priceDisplay}</span>
          ${footerDiscLabel ? `<span style="background:rgba(255,255,255,0.25);border-radius:4px;padding:2px 6px;font-size:12px;margin-left:6px;">${footerDiscLabel}</span>` : ""}
          <span style="border-left:1px solid #fff;padding-left:10px;margin-left:6px;">${totalItems}
            <svg style="margin-left:5px;" width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M3 4.5C3 4 3.4 3.6 3.9 3.6H5.8C6.8 3.6 7.7 4.3 7.9 5.4H19.5C19.7 5.4 19.9 5.5 20.1 5.6C20.3 5.8 20.4 6.1 20.3 6.3L19.9 11.9C19.8 13.6 18.4 15 16.6 15H9L9.1 15.9C9.1 16 9.3 16.2 9.4 16.2H17.1C17.5 16.2 18 16.6 18 17.1C18 17.5 17.5 18 17.1 18H9.4C8.4 18 7.5 17.2 7.3 16.1L6.1 5.6C6.1 5.5 5.9 5.4 5.8 5.4H3.9C3.4 5.4 3 4.9 3 4.5Z" fill="white"/><circle cx="10.8" cy="20.4" r="1.2" fill="white"/><circle cx="16.8" cy="20.4" r="1.2" fill="white"/></svg>
          </span>
        </div>
        <div class="gbb-footer-actions">
          <div class="gbb-footer-btn gbb-btn-prev" onclick="navTab(-1)">Prev</div>
          <div class="gbb-footer-btn gbb-btn-next" onclick="navTab(1)">Next</div>
        </div>
      </div>`;

    modal.innerHTML = headerHtml + bodyHtml + footerHtml;

    const newModalBody = modal.querySelector('.gbbMixModalBody');
    if (newModalBody) {
      newModalBody.scrollTop = savedScrollPosition;
    }
  };

  window.navToTab = (targetCatId) => {
    const currentIndex = bundleData.categories.findIndex(c => c.id === currentModalCatId);
    const targetIndex  = bundleData.categories.findIndex(c => c.id === targetCatId);

    if (targetIndex > currentIndex) {
      if (!isCatFulfilled(currentModalCatId)) {
        const tooltip = document.getElementById("gbb-tooltip");
        if (tooltip) {
          tooltip.classList.add("show");
          setTimeout(() => tooltip.classList.remove("show"), 2500);
        }
        return;
      }
    }
    openModal(targetCatId);
  };

  window.updateQty = (catId, vId, change) => {
    const cat  = bundleData.categories.find(c => c.id === catId);
    const prod = cat.products.find(p => p.variantId === vId);
    let item   = selections[catId].find(i => i.product.variantId === vId);
    if (!item) { item = { product: prod, qty: 0 }; selections[catId].push(item); }
    item.qty += change;
    if (item.qty <= 0) selections[catId] = selections[catId].filter(i => i.product.variantId !== vId);
    renderMainUI();
    openModal(catId);
  };

  window.navTab = (direction) => {
    const currentIndex = bundleData.categories.findIndex(c => c.id === currentModalCatId);

    if (direction > 0 && !isCatFulfilled(currentModalCatId)) {
      const tooltip = document.getElementById("gbb-tooltip");
      if (tooltip) {
        tooltip.classList.add("show");
        setTimeout(() => tooltip.classList.remove("show"), 2500);
      }
      return;
    }

    const nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < bundleData.categories.length) {
      openModal(bundleData.categories[nextIndex].id);
    } else if (direction > 0 && nextIndex >= bundleData.categories.length) {
      closeModal();
    }
  };

  // ── TOTALS & ATC ─────────────────────────────────────────────────────────

  const calculateTotals = () => {
    const baseTotal  = getBaseTotal();
    const finalPrice = getFinalPrice(baseTotal);
    const discLabel  = getDiscountLabel();
    const fulfilled  = allCatsFulfilled();

    let btnHtml = "Add Bundle to Cart";
      if (baseTotal > 0) {
      if (fulfilled && baseTotal > finalPrice) {
        btnHtml += ` • <s style="opacity:0.65">$${baseTotal.toFixed(2)}</s> $${finalPrice.toFixed(2)}`;
        if (discLabel) {
          btnHtml += ` <span style="background:rgba(255,255,255,0.9);color:#111;border-radius:4px;padding:2px 7px;font-size:12px;font-weight:600;">${discLabel}</span>`;
        }
      } else {
        btnHtml += ` • $${baseTotal.toFixed(2)}`;
      }
    }

    atcBtn.innerHTML = btnHtml;

    if (fulfilled) {
      atcBtn.classList.remove("gbbMixAddtoCartBtnDisabled");
      atcBtn.style.opacity = "1";
      atcBtn.style.cursor  = "pointer";
      atcBtn.onclick       = executeAddToCart;
    } else {
      atcBtn.classList.add("gbbMixAddtoCartBtnDisabled");
      atcBtn.style.opacity = "0.5";
      atcBtn.style.cursor  = "not-allowed";
      atcBtn.onclick       = null;
    }
  };

  const executeAddToCart = async () => {
    atcBtn.innerHTML = "Adding Bundle...";
    const uniqueBundleId = "BUN-" + Date.now();
    const parentGID      = bundleData.parentVariantId || "";
    const cleanId        = (gid) => String(gid).split('/').pop();

    try {
      const cartRes = await fetch('/cart.js');
      const cart    = await cartRes.json();
      let maxBox    = 0;
      cart.items.forEach(item => {
        if (item.properties?.["Box"]) maxBox = Math.max(maxBox, parseInt(item.properties["Box"]) || 0);
      });
      const currentBox = maxBox + 1;

      const baseTotal = getBaseTotal();
      let priceMultiplier = 1;
      if (bundleData.discountEnabled && bundleData.discountValue > 0 && baseTotal > 0) {
        if      (bundleData.discountType === "PERCENTAGE")  priceMultiplier = 1 - (bundleData.discountValue / 100);
        else if (bundleData.discountType === "FIXED")       priceMultiplier = Math.max(0, baseTotal - bundleData.discountValue) / baseTotal;
        else if (bundleData.discountType === "FIXED_PRICE") priceMultiplier = bundleData.discountValue / baseTotal;
      }

      const itemsStringArr = [];
      const components     = [];

      Object.values(selections).forEach(catItems => {
        catItems.forEach(item => {
          const variantText = item.product.title
            .replace(/\s*\(Default Title\)/gi, "")
            .replace(/\s*Default Title/gi, "")
            .trim();
          itemsStringArr.push(`${item.qty} x ${variantText}`);

          components.push({
            variantId: cleanId(item.product.variantId),
            quantity:  item.qty,
            price:     (item.product.price * priceMultiplier).toFixed(2),
            box:       String(currentBox)
          });
        });
      });

      const itemsString = itemsStringArr.join(", ");

      const items = [{
        id: cleanId(parentGID),
        quantity: 1,
        properties: {
          "_bundleId":   uniqueBundleId,
          "_bundleName": bundleData.name,
          "_components": JSON.stringify(components),
          "Items":       itemsString,
          "Box":         String(currentBox)
        }
      }];

      const res = await fetch('/cart/add.js', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items })
      });

      if (res.ok) {
        window.location.href = '/checkout';
      }
    } catch(err) {
      console.error(err);
      atcBtn.innerHTML = "Error Adding Bundle";
    }
  };

  window.closeModal = () => {
    overlay.classList.remove("active");
    modal.classList.remove("gbbMixProductsModalOpen");
  };

  if (overlay) overlay.addEventListener("click", closeModal);
  renderMainUI();
});