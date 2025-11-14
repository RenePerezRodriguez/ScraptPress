
// Global state
let currentVehicles = [];
let currentPage = 1;
const itemsPerPage = 10; // Frontend page size (matches backend config)
let totalPages = 1;
let currentQuery = '';
let batchInfo = null;
let prefetchInProgress = false;

// API Configuration
const API_BASE = '';  // Same domain
const API_KEY = '0d2366db7108a67dcc49e309128808f566c092cb9afa8fc789b33b92ee0a863e';

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
});

function initializeEventListeners() {
  const form = document.getElementById('search-form');
  form.addEventListener('submit', handleSearch);
  
  // Pagination button listeners
  document.getElementById('first-page-btn')?.addEventListener('click', goToFirstPage);
  document.getElementById('prev-page-btn')?.addEventListener('click', previousPage);
  document.getElementById('next-page-btn')?.addEventListener('click', nextPage);
  document.getElementById('last-page-btn')?.addEventListener('click', goToLastPage);
}

// Handle search form submission
async function handleSearch(event) {
  event.preventDefault();
  
  const query = document.getElementById('query').value.trim();
  
  if (!query) {
    showError('Por favor ingresa un término de búsqueda');
    return;
  }
  
  // Reset everything
  currentPage = 1;
  currentQuery = query;
  currentVehicles = [];
  batchInfo = null;
  
  console.log(`[Search] 🔍 Nueva búsqueda: "${query}"`);
  
  await fetchPage(currentPage);
}

// Fetch a specific page
async function fetchPage(page) {
  showLoading(true);
  hideError();
  
  console.log(`[Fetch] 📄 Solicitando página ${page} para "${currentQuery}"`);
  
  try {
    const url = `${API_BASE}/api/search/hybrid?query=${encodeURIComponent(currentQuery)}&page=${page}&limit=${itemsPerPage}`;
    console.log(`[Fetch] 🌐 URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': API_KEY }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log(`[Fetch] ✅ Respuesta:`, {
      success: data.success,
      source: data.source,
      cached: data.cached,
      returned: data.returned,
      batch: data.batch?.number,
      prefetchRecommended: data.prefetch?.recommended
    });
    
    if (data.success && data.vehicles && data.vehicles.length > 0) {
      currentVehicles = data.vehicles;
      currentPage = page;
      batchInfo = data.batch;
      
      // Calculate total pages from batch info
      if (batchInfo) {
        const estimatedTotalPages = (batchInfo.number + 1) * batchInfo.totalPagesInBatch;
        totalPages = estimatedTotalPages;
        console.log(`[Fetch] 📊 Batch ${batchInfo.number}: ${batchInfo.totalInBatch} items, ${batchInfo.totalPagesInBatch} páginas, estimado total: ${estimatedTotalPages}`);
      }
      
      displayResults();
      updatePaginationControls();
      
      // Auto-prefetch if recommended
      if (data.prefetch?.recommended && !prefetchInProgress) {
        console.log(`[Prefetch] 🚀 Recomendado: ${data.prefetch.url}`);
        triggerPrefetch(data.prefetch.url);
      }
    } else if (page === 1) {
      console.log(`[Fetch] ⚠️ Sin resultados en página 1`);
      showError('No se encontraron vehículos para esta búsqueda');
      hidePaginationControls();
    } else {
      console.log(`[Fetch] ⚠️ Sin más resultados`);
      showError('No hay más resultados disponibles');
      totalPages = page - 1;
      updatePaginationControls();
    }
    
  } catch (error) {
    console.error('[Fetch] ❌ Error:', error);
    showError('Error al realizar la búsqueda: ' + error.message);
    hidePaginationControls();
  } finally {
    showLoading(false);
  }
}

// Trigger prefetch in background
async function triggerPrefetch(url) {
  if (prefetchInProgress) {
    console.log(`[Prefetch] ⏸️ Ya hay un prefetch en progreso`);
    return;
  }
  
  prefetchInProgress = true;
  const banner = document.getElementById('prefetch-status');
  banner.classList.remove('hidden');
  
  console.log(`[Prefetch] 🔄 Iniciando prefetch...`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': API_KEY }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`[Prefetch] ✅ Completado:`, data.summary);
    
  } catch (error) {
    console.error('[Prefetch] ❌ Error:', error);
  } finally {
    prefetchInProgress = false;
    setTimeout(() => banner.classList.add('hidden'), 2000);
  }
}

// Next page
function nextPage() {
  if (currentPage < totalPages) {
    const nextPageNum = currentPage + 1;
    console.log(`[Navigation] ➡️ Ir a página ${nextPageNum}`);
    fetchPage(nextPageNum);
    document.getElementById('results-header')?.scrollIntoView({ behavior: 'smooth' });
  }
}

// Previous page
function previousPage() {
  if (currentPage > 1) {
    const prevPageNum = currentPage - 1;
    console.log(`[Navigation] ⬅️ Ir a página ${prevPageNum}`);
    fetchPage(prevPageNum);
    document.getElementById('results-header')?.scrollIntoView({ behavior: 'smooth' });
  }
}

// Go to first page
function goToFirstPage() {
  if (currentPage !== 1) {
    console.log(`[Navigation] ⏮️ Ir a primera página`);
    fetchPage(1);
    document.getElementById('results-header')?.scrollIntoView({ behavior: 'smooth' });
  }
}

// Go to last page
function goToLastPage() {
  if (currentPage !== totalPages && totalPages > 0) {
    console.log(`[Navigation] ⏭️ Ir a última página ${totalPages}`);
    fetchPage(totalPages);
    document.getElementById('results-header')?.scrollIntoView({ behavior: 'smooth' });
  }
}

// Go to specific page
function goToPage(pageNum) {
  if (pageNum >= 1 && pageNum <= totalPages && pageNum !== currentPage) {
    console.log(`[Navigation] 🔢 Ir a página ${pageNum}`);
    fetchPage(pageNum);
    document.getElementById('results-header')?.scrollIntoView({ behavior: 'smooth' });
  }
}

// Update pagination controls
function updatePaginationControls() {
  const paginationControls = document.getElementById('pagination-controls');
  const prevBtn = document.getElementById('prev-page-btn');
  const nextBtn = document.getElementById('next-page-btn');
  const firstBtn = document.getElementById('first-page-btn');
  const lastBtn = document.getElementById('last-page-btn');
  const currentPageNum = document.getElementById('current-page-num');
  const totalPagesNum = document.getElementById('total-pages-num');
  const pageNumbersContainer = document.getElementById('page-numbers');
  
  // Calculate total pages based on store size
  const storeSize = Object.keys(allVehicles).length;
  const calculatedPages = Math.ceil(storeSize / itemsPerPage);
  
  // Update totalPages if we have more vehicles in store
  if (calculatedPages > totalPages) {
    totalPages = calculatedPages;
  }
  
  // Show controls if there are results
  if (Object.keys(allVehicles).length > 0) {
    paginationControls.classList.remove('hidden');
    
    // Update button states
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage >= totalPages;
    firstBtn.disabled = currentPage === 1;
    lastBtn.disabled = currentPage >= totalPages;
    
    // Update info text
    currentPageNum.textContent = currentPage;
    totalPagesNum.textContent = totalPages;
    
    // Generate page numbers
    generatePageNumbers(pageNumbersContainer);
  }
}

// Generate page number buttons with smart pagination
function generatePageNumbers(container) {
  container.innerHTML = '';
  
  const maxVisiblePages = 7; // Show max 7 page buttons
  let startPage = 1;
  let endPage = totalPages;
  
  if (totalPages > maxVisiblePages) {
    // Calculate range around current page
    const halfVisible = Math.floor(maxVisiblePages / 2);
    
    if (currentPage <= halfVisible + 1) {
      // Near the start
      endPage = maxVisiblePages - 1;
    } else if (currentPage >= totalPages - halfVisible) {
      // Near the end
      startPage = totalPages - maxVisiblePages + 2;
    } else {
      // In the middle
      startPage = currentPage - halfVisible + 1;
      endPage = currentPage + halfVisible - 1;
    }
  }
  
  // Always show first page
  if (startPage > 1) {
    addPageButton(container, 1);
    if (startPage > 2) {
      addEllipsis(container);
    }
  }
  
  // Show page range
  for (let i = startPage; i <= endPage; i++) {
    addPageButton(container, i);
  }
  
  // Always show last page
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      addEllipsis(container);
    }
    addPageButton(container, totalPages);
  }
}

// Add page number button
function addPageButton(container, pageNum) {
  const btn = document.createElement('button');
  btn.className = 'page-number-btn';
  btn.textContent = pageNum;
  btn.addEventListener('click', () => goToPage(pageNum));
  
  if (pageNum === currentPage) {
    btn.classList.add('active');
  }
  
  container.appendChild(btn);
}

// Add ellipsis
function addEllipsis(container) {
  const ellipsis = document.createElement('span');
  ellipsis.className = 'page-ellipsis';
  ellipsis.textContent = '...';
  container.appendChild(ellipsis);
}

// Hide pagination controls
function hidePaginationControls() {
  const paginationControls = document.getElementById('pagination-controls');
  paginationControls.classList.add('hidden');
}

// Display search results
function displayResults(page) {
  const resultsHeader = document.getElementById('results-header');
  const resultsStats = document.getElementById('results-stats');
  const container = document.getElementById('vehicles-list-container');
  
  // Get all vehicles from store as array
  const allVehiclesArray = Object.values(allVehicles);
  
  // Calculate slice indices for current page
  const startIdx = (page - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  
  console.log(`[Display] 📄 Page ${page}: slicing [${startIdx}:${endIdx}] from ${allVehiclesArray.length} total vehicles`);
  
  // Slice for current page
  const paginatedVehicles = allVehiclesArray.slice(startIdx, endIdx);
  
  console.log(`[Display] 🚗 Showing ${paginatedVehicles.length} vehicles on page ${page}`);
  
  if (paginatedVehicles.length > 0) {
    const lotNumbers = paginatedVehicles.slice(0, 3).map(v => v.lot_number);
    console.log(`[Display] 🔢 First 3 lot numbers:`, lotNumbers);
  }
  
  // Show header
  resultsHeader.classList.remove('hidden');
  resultsStats.textContent = `Mostrando ${paginatedVehicles.length} de ${allVehiclesArray.length} vehículo(s) encontrados`;
  
  // Clear previous results
  container.innerHTML = '';
  
  // Display each vehicle
  paginatedVehicles.forEach((vehicle, index) => {
    const card = createVehicleCard(vehicle, startIdx + index);
    container.appendChild(card);
  });
  
  // Scroll to results
  if (page > 1) {
    resultsHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Create vehicle card
function createVehicleCard(vehicle, index) {
  const card = document.createElement('div');
  card.className = 'vehicle-card';
  card.onclick = () => showVehicleDetail(vehicle);
  
  // Usar imageUrl directamente o la primera imagen de la galería
  const imageUrl = vehicle.imageUrl || 
    (vehicle.images_gallery && vehicle.images_gallery.length > 0 
      ? vehicle.images_gallery[0].thumbnail || vehicle.images_gallery[0].full 
      : 'https://via.placeholder.com/400x300?text=No+Image');
  
  card.innerHTML = `
    <div class="vehicle-card-image">
      <img src="${imageUrl}" alt="${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}" 
           onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'">
      <div class="vehicle-card-badge">${vehicle.sale_status || 'N/A'}</div>
      ${vehicle.image_count > 0 ? `<div class="image-count-badge">📷 ${vehicle.image_count}</div>` : ''}
    </div>
    
    <div class="vehicle-card-content">
      <h3 class="vehicle-card-title">
        ${vehicle.year || 'N/A'} ${vehicle.make || ''} ${vehicle.model || 'N/A'}
      </h3>
      
      <div class="vehicle-card-grid">
        <div class="info-item">
          <span class="info-label">Lote</span>
          <span class="info-value">#${vehicle.lot_number || 'N/A'}</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">VIN</span>
          <span class="info-value">${vehicle.vin || 'N/A'}</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">Odómetro</span>
          <span class="info-value">${vehicle.odometer || 'N/A'}</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">Motor</span>
          <span class="info-value">${vehicle.engine || 'N/A'}</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">Color</span>
          <span class="info-value">${vehicle.exterior_color || 'N/A'}</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">Ubicación</span>
          <span class="info-value">${vehicle.location || 'N/A'}</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">Daño Primario</span>
          <span class="info-value damage-badge">${vehicle.primary_damage || 'N/A'}</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">Título</span>
          <span class="info-value">${vehicle.title_type || 'N/A'}</span>
        </div>
      </div>
      
      <div class="vehicle-card-prices">
        <div class="price-item">
          <span class="price-label">Oferta Actual</span>
          <span class="price-value current">${vehicle.current_bid || 'N/A'}</span>
        </div>
        
        ${vehicle.buy_it_now_price && vehicle.buy_it_now_price !== 'N/A' ? `
        <div class="price-item">
          <span class="price-label">Cómpralo Ya</span>
          <span class="price-value buy-now">${vehicle.buy_it_now_price}</span>
        </div>
        ` : ''}
        
        ${vehicle.estimated_retail_value && vehicle.estimated_retail_value !== 'N/A' ? `
        <div class="price-item">
          <span class="price-label">Valor Estimado</span>
          <span class="price-value retail">${vehicle.estimated_retail_value}</span>
        </div>
        ` : ''}
      </div>
      
      ${vehicle.auction_date ? `
      <div class="auction-date">
        <span class="date-icon">📅</span>
        <span>Subasta: ${formatDate(vehicle.auction_date)}</span>
      </div>
      ` : ''}
      
      <button class="btn-view-details" onclick="event.stopPropagation(); showVehicleDetail(allVehicles['${vehicle.lot_number}'])">
        Ver Detalles Completos →
      </button>
    </div>
  `;
  
  return card;
}

// Show vehicle detail modal with ALL fields
function showVehicleDetail(vehicle) {
  const modal = document.getElementById('vehicle-modal');
  const modalBody = document.getElementById('modal-body');
  
  // Usar imageUrl o la primera imagen de la galería
  const mainImage = vehicle.imageUrl || 
    (vehicle.images_gallery && vehicle.images_gallery.length > 0 
      ? vehicle.images_gallery[0].full || vehicle.images_gallery[0].thumbnail 
      : 'https://via.placeholder.com/800x600?text=No+Image');
  
  modalBody.innerHTML = `
    <div class="modal-vehicle-detail">
      <!-- Header -->
      <div class="detail-header">
        <h2>${vehicle.year || 'N/A'} ${vehicle.make || ''} ${vehicle.model || 'N/A'} ${vehicle.trim || ''}</h2>
        <div class="header-badges">
          <span class="badge status-badge">${vehicle.sale_status || 'N/A'}</span>
          <span class="badge lot-badge">Lote #${vehicle.lot_number || 'N/A'}</span>
        </div>
      </div>
      
      <!-- Image Gallery -->
      <div class="detail-gallery">
        <div class="main-image-container">
          <img id="main-detail-image" src="${mainImage}" alt="Vehicle" 
               onerror="this.src='https://via.placeholder.com/800x600?text=No+Image'">
        </div>
        
        ${vehicle.images_gallery && vehicle.images_gallery.length > 1 ? `
        <div class="thumbnails-container">
          ${vehicle.images_gallery.map((img, idx) => `
            <img src="${img.thumbnail || img.full}" 
                 class="thumbnail-img" 
                 onclick="document.getElementById('main-detail-image').src='${img.full || img.thumbnail}'"
                 onerror="this.src='https://via.placeholder.com/100x100?text=No+Image'">
          `).join('')}
        </div>
        ` : ''}
        
        ${vehicle.engine_video && vehicle.engine_video !== 'N/A' ? `
        <div class="video-section">
          <h3 style="margin-bottom: 10px;">🎥 Video del Motor</h3>
          <video controls style="width: 100%; max-height: 400px; border-radius: 8px; background: #000;">
            <source src="${vehicle.engine_video}" type="video/mp4">
            Su navegador no soporta el tag de video.
          </video>
        </div>
        ` : ''}
      </div>
      
      <!-- Prices Section -->
      <div class="detail-prices">
        <div class="price-card current">
          <span class="price-label">Oferta Actual</span>
          <span class="price-amount">${vehicle.current_bid || 'N/A'}</span>
        </div>
        
        ${vehicle.buy_it_now_price && vehicle.buy_it_now_price !== 'N/A' ? `
        <div class="price-card buy-now">
          <span class="price-label">Cómpralo Ya</span>
          <span class="price-amount">${vehicle.buy_it_now_price}</span>
        </div>
        ` : ''}
        
        ${vehicle.estimated_retail_value && vehicle.estimated_retail_value !== 'N/A' ? `
        <div class="price-card retail">
          <span class="price-label">Valor Estimado de Venta</span>
          <span class="price-amount">${vehicle.estimated_retail_value}</span>
        </div>
        ` : ''}
      </div>
      
      <!-- All Specifications -->
      <div class="detail-specs-grid">
        ${createSpecSection('Información Básica', {
          'Lote': vehicle.lot_number,
          'VIN': vehicle.vin,
          'Año': vehicle.year,
          'Marca': vehicle.make,
          'Modelo': vehicle.model,
          'Trim': vehicle.trim,
          'Estilo de Carrocería': vehicle.body_style,
        })}
        
        ${createSpecSection('Motor y Transmisión', {
          'Motor': vehicle.engine,
          'Cilindros': vehicle.cylinders,
          'Transmisión': vehicle.transmission,
          'Tracción': vehicle.drive,
          'Combustible': vehicle.fuel,
        })}
        
        ${createSpecSection('Información del Odómetro', {
          'Odómetro': vehicle.odometer,
          'Estado del Odómetro': vehicle.odometer_status,
        })}
        
        ${createSpecSection('Colores', {
          'Color Exterior': vehicle.exterior_color,
          'Color Interior': vehicle.interior_color,
        })}
        
        ${createSpecSection('Daños', {
          'Daño Primario': vehicle.primary_damage,
          'Daño Secundario': vehicle.secondary_damage,
        })}
        
        ${createSpecSection('Título y Documentos', {
          'Tipo de Título': vehicle.title_type,
          'Tipo de Documento': vehicle.doc_type,
          'Tiene Llaves': vehicle.has_keys,
        })}
        
        ${createSpecSection('Ubicación y Subasta', {
          'Ubicación': vehicle.location,
          'Fecha de Subasta': vehicle.auction_date ? formatDate(vehicle.auction_date) : 'N/A',
          'Estado de Venta': vehicle.sale_status,
        })}
        
        ${vehicle.seller_name ? createSpecSection('Vendedor', {
          'Vendedor': vehicle.seller_name,
          'Código de Título': vehicle.seller_title_code,
          'Nombre de la Venta': vehicle.sale_name,
          'Run and Drive': vehicle.run_and_drive,
        }) : ''}
        
        ${vehicle.specifications ? createSpecSection('Especificaciones Técnicas', {
          'Sistema de Frenos': vehicle.specifications.brake_system,
          'Peso Base': vehicle.specifications.base_weight,
          'Desplazamiento': vehicle.specifications.displacement,
          'Radio de Eje': vehicle.specifications.axle_ratio,
          'Frenos Delanteros': vehicle.specifications.front_brakes,
          'Frenos Traseros': vehicle.specifications.rear_brakes,
          'Clasificación EPA': vehicle.specifications.epa_classification,
          'Base de Rueda': vehicle.specifications.wheelbase,
          'Capacidad de Pasajeros': vehicle.specifications.passenger_capacity,
          'Diámetro de Giro': vehicle.specifications.turning_diameter,
          'MPG Ciudad': vehicle.specifications.city_mpg,
          'MPG Carretera': vehicle.specifications.highway_mpg,
          'Capacidad de Combustible': vehicle.specifications.fuel_tank_capacity,
        }) : ''}
      </div>
      
      ${vehicle.styles && vehicle.styles.length > 0 ? createStylesTable(vehicle.styles) : ''}
      
      ${vehicle.engines && vehicle.engines.length > 0 ? createEnginesTable(vehicle.engines) : ''}
      
      ${vehicle.features ? createFeaturesSection(vehicle.features) : ''}
      
      ${vehicle.condition_report ? createConditionReport(vehicle.condition_report) : ''}
      
      <!-- Highlights -->
      ${vehicle.highlights && vehicle.highlights.length > 0 ? `
      <div class="detail-highlights">
        <h3>Características Destacadas</h3>
        <ul class="highlights-list">
          ${vehicle.highlights.map(h => `<li>✓ ${h}</li>`).join('')}
        </ul>
      </div>
      ` : ''}
      
      <!-- Actions -->
      <div class="detail-actions">
        ${vehicle.copart_url ? `
        <a href="${vehicle.copart_url}" target="_blank" class="btn-action primary">
          Ver en Copart →
        </a>
        ` : ''}
        <button onclick="closeModal()" class="btn-action secondary">
          Cerrar
        </button>
      </div>
    </div>
  `;
  
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

// Create specification section
function createSpecSection(title, specs) {
  const items = Object.entries(specs)
    .filter(([key, value]) => value && value !== 'N/A' && value !== null && value !== undefined)
    .map(([key, value]) => `
      <div class="spec-item">
        <span class="spec-label">${key}:</span>
        <span class="spec-value">${value}</span>
      </div>
    `)
    .join('');
  
  if (!items) return '';
  
  return `
    <div class="spec-section">
      <h4>${title}</h4>
      <div class="spec-items">
        ${items}
      </div>
    </div>
  `;
}

// Create styles table
function createStylesTable(styles) {
  if (!styles || styles.length === 0) return '';
  
  return `
    <div class="detail-table-section">
      <h3>Estilos</h3>
      <div class="table-responsive">
        <table class="detail-table">
          <thead>
            <tr>
              <th>ID del Estilo</th>
              <th>División</th>
              <th>Subdivisión</th>
              <th>Estilo</th>
              <th>Modelo</th>
              <th>Tipo</th>
              <th>Código</th>
            </tr>
          </thead>
          <tbody>
            ${styles.map(style => `
              <tr>
                <td>${style.style_id || 'N/A'}</td>
                <td>${style.division || 'N/A'}</td>
                <td>${style.subdivision || 'N/A'}</td>
                <td>${style.style || 'N/A'}</td>
                <td>${style.model || 'N/A'}</td>
                <td>${style.type || 'N/A'}</td>
                <td>${style.code || 'N/A'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Create engines table
function createEnginesTable(engines) {
  if (!engines || engines.length === 0) return '';
  
  return `
    <div class="detail-table-section">
      <h3>Motores</h3>
      <div class="table-responsive">
        <table class="detail-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Desplazamiento</th>
              <th>Tipo de Combustible</th>
              <th>Potencia</th>
              <th>Economía Ciudad</th>
              <th>Capacidad</th>
              <th>Torque</th>
            </tr>
          </thead>
          <tbody>
            ${engines.map(engine => `
              <tr>
                <td>${engine.engine_type || 'N/A'}</td>
                <td>${engine.displacement || 'N/A'}</td>
                <td>${engine.fuel_type || 'N/A'}</td>
                <td>${engine.power || 'N/A'}</td>
                <td>${engine.city_fuel_economy || 'N/A'}</td>
                <td>${engine.fuel_capacity || 'N/A'}</td>
                <td>${engine.torque || 'N/A'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Create features section
function createFeaturesSection(features) {
  if (!features) return '';
  
  let html = '<div class="features-container">';
  
  if (features.interior && features.interior.length > 0) {
    html += `
      <div class="feature-category">
        <h3>Interior</h3>
        <ul class="features-list">
          ${features.interior.map(f => `<li>✓ ${f}</li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  if (features.safety && features.safety.length > 0) {
    html += `
      <div class="feature-category">
        <h3>Seguridad</h3>
        <ul class="features-list">
          ${features.safety.map(f => `<li>✓ ${f}</li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  if (features.exterior && features.exterior.length > 0) {
    html += `
      <div class="feature-category">
        <h3>Exterior</h3>
        <ul class="features-list">
          ${features.exterior.map(f => `<li>✓ ${f}</li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  if (features.mechanical && features.mechanical.length > 0) {
    html += `
      <div class="feature-category">
        <h3>Mecánico</h3>
        <ul class="features-list">
          ${features.mechanical.map(f => `<li>✓ ${f}</li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  if (features.entertainment && features.entertainment.length > 0) {
    html += `
      <div class="feature-category">
        <h3>Entretenimiento</h3>
        <ul class="features-list">
          ${features.entertainment.map(f => `<li>✓ ${f}</li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  html += '</div>';
  return html;
}

// Create condition report
function createConditionReport(report) {
  if (!report) return '';
  
  let html = `
    <div class="condition-report-section">
      <h3>Evaluación del Vehículo</h3>
  `;
  
  if (report.exterior && report.exterior.items && report.exterior.items.length > 0) {
    html += `
      <div class="condition-category">
        <h4>Condición Exterior</h4>
        <ul class="condition-list">
          ${report.exterior.items.map(item => `
            <li>
              <strong>${item.area}:</strong> ${item.description}
              ${item.severity ? `<span class="severity-badge ${item.severity.toLowerCase()}">${item.severity}</span>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }
  
  if (report.interior && report.interior.items && report.interior.items.length > 0) {
    html += `
      <div class="condition-category">
        <h4>Condición Interior</h4>
        <ul class="condition-list">
          ${report.interior.items.map(item => `
            <li>
              <strong>${item.area}:</strong> ${item.description}
              ${item.severity ? `<span class="severity-badge ${item.severity.toLowerCase()}">${item.severity}</span>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }
  
  if (report.mechanical && report.mechanical.items && report.mechanical.items.length > 0) {
    html += `
      <div class="condition-category">
        <h4>Inspección Mecánica</h4>
        <ul class="condition-list">
          ${report.mechanical.items.map(item => `
            <li>
              <strong>${item.area}:</strong> ${item.description}
              ${item.severity ? `<span class="severity-badge ${item.severity.toLowerCase()}">${item.severity}</span>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }
  
  html += '</div>';
  return html;
}

// Close modal
function closeModal() {
  const modal = document.getElementById('vehicle-modal');
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

// Show/hide loading indicator
function showLoading(show) {
  const loadingIndicator = document.getElementById('loading-indicator');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = submitBtn.querySelector('.btn-text');
  const btnLoading = submitBtn.querySelector('.btn-loading');
  
  if (show) {
    loadingIndicator.classList.remove('hidden');
    submitBtn.disabled = true;
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');
  } else {
    loadingIndicator.classList.add('hidden');
    submitBtn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
  }
}

// Show error message
function showError(message) {
  const summary = document.getElementById('search-results-summary');
  summary.className = 'error';
  summary.textContent = message;
  summary.classList.remove('hidden');
  
  setTimeout(() => {
    summary.classList.add('hidden');
  }, 5000);
}

// Hide error message
function hideError() {
  const summary = document.getElementById('search-results-summary');
  summary.classList.add('hidden');
}

// Format date
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Close modal on outside click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('vehicle-modal');
  if (e.target === modal) {
    closeModal();
  }
});

// Close modal on ESC key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
  }
});
